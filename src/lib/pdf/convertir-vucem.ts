import "server-only";

import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { PDFDocument } from "pdf-lib";
import sharp, { type Metadata, type OutputInfo, type Sharp } from "sharp";

import { sha1Hex } from "@/lib/crypto";

import { marcasEnBuffer } from "./inspeccionar";
import { BYTES_POR_MB_VUCEM, MB_RECOMENDADO_VUCEM, MIMES_ACEPTADOS, type MimeAceptado } from "./limites";
import { conDirectorioTemporal, ejecutarPoppler, ErrorPoppler, esErrorDeContrasena, leerInfoPdf } from "./poppler";

/*
 * Conversión de anexos al formato que exige VUCEM: PDF sin formularios, sin JavaScript, sin
 * objetos OLE, sin páginas en blanco, con imágenes en escala de grises de al menos 300 dpi y
 * dentro del tamaño máximo del trámite.
 *
 * Se RASTERIZA cada página (pdftoppm -gray) y se arma un PDF nuevo que solo contiene una imagen
 * JPEG en grises por página: así desaparecen formularios, JavaScript, adjuntos y objetos OLE
 * sin tener que "limpiar" el PDF original.
 */

export type OpcionesConversion = {
  /** Resolución mínima (dpi). Se rasteriza exactamente a este valor. */
  minDpi: number;
  /** Tamaño máximo del PDF resultante, en MB (1 MB = 1 000 000 bytes, ver limites.ts). */
  maxMB: number;
};

export type EstadoResultado = "OK" | "ADVERTENCIA" | "ERROR";

export type ResultadoConversion = {
  /** PDF convertido (vacío si estado = ERROR). */
  pdf: Buffer;
  paginas: number;
  /** Resolución efectiva mínima de las páginas. */
  dpi: number;
  bytes: number;
  /** SHA-1 (hex) del PDF convertido. */
  sha1: string;
  /** Números de página (1 = primera del original) eliminados por estar en blanco. */
  paginasEnBlancoEliminadas: number[];
  /** Situaciones que el usuario debe revisar (si hay alguna, el estado es ADVERTENCIA). */
  avisos: string[];
  /** Datos informativos que no requieren acción (p. ej. "se eliminó un formulario"). */
  notas: string[];
  /** Calidad JPEG final (baja si hubo que reducir el tamaño). */
  calidadJpeg: number | null;
  estado: EstadoResultado;
  error?: string;
};

// ─── Parámetros ───────────────────────────────────────────────────────────────

/** Máximo de páginas del documento original. */
export const MAX_PAGINAS = 200;
/** Tiempo máximo total de la conversión. */
export const TIEMPO_MAXIMO_MS = 120_000;
/** Calidades JPEG que se prueban en orden hasta que el PDF quepa en el límite. */
export const CALIDADES_JPEG = [80, 65, 50, 40] as const;
/** Una página mayor a esto (≈ 24 × 36 in a 300 dpi) no se procesa. */
const MAX_PIXELES_PAGINA = 80_000_000;
/** Se rasterizan las páginas del PDF en lotes para no llenar el disco temporal. */
const PAGINAS_POR_LOTE = 8;
/** Rango aceptado de dpi (por si la definición del trámite trae un valor absurdo). */
const DPI_MINIMO_ACEPTADO = 72;
const DPI_MAXIMO_ACEPTADO = 600;
/** Se procesan como máximo 2 conversiones a la vez por proceso (uso de memoria y CPU). */
const MAX_CONVERSIONES_SIMULTANEAS = 2;

/**
 * Detección de página en blanco con las estadísticas de sharp (escala 0–255):
 * una página es "blanca" si su media es ≥ 250 Y su desviación estándar es ≤ 3.
 * - Una hoja escaneada sin contenido suele tener media 245–255 y desviación 1–3 (ruido).
 * - Un solo número de página en carta a 300 dpi ya da desviación ≈ 6, así que se conserva.
 * Los umbrales son conservadores: preferimos dejar una página casi en blanco que borrar
 * una con contenido (p. ej. una firma o un sello tenue).
 */
export const UMBRAL_BLANCO_MEDIA = 250;
export const UMBRAL_BLANCO_DESVIACION = 3;

/** Para una hoja carta (11 in) a 300 dpi se necesitan ~3300 px; menos de ~2400 se ve borroso. */
export const LADO_LARGO_RECOMENDADO_PX = 2400;
/** Lado largo de página (in) al que se ajustan las imágenes grandes (tamaño carta). */
const LADO_LARGO_CARTA_IN = 11;

const PRODUCTOR = "Conversor de anexos VUCEM";

// ─── Utilidades internas ─────────────────────────────────────────────────────

/** Error con mensaje entendible para el usuario. */
class ErrorConversion extends Error {}

type PaginaRaster = {
  /** Número de página en el documento original (1-based). */
  numero: number;
  ancho: number;
  alto: number;
  dpi: number;
  /** JPEG en escala de grises con la primera calidad de CALIDADES_JPEG. */
  jpeg: Buffer;
};

let conversionesActivas = 0;
const enEspera: Array<() => void> = [];

async function adquirirTurno() {
  if (conversionesActivas < MAX_CONVERSIONES_SIMULTANEAS) {
    conversionesActivas++;
    return;
  }
  // El turno se transfiere directamente al liberar (conversionesActivas no cambia).
  await new Promise<void>((resolve) => enEspera.push(resolve));
}

function liberarTurno() {
  const siguiente = enEspera.shift();
  if (siguiente) siguiente();
  else conversionesActivas--;
}

function normalizarMime(mime: string): string {
  const base = mime.split(";")[0].trim().toLowerCase();
  if (base === "image/jpg" || base === "image/pjpeg") return "image/jpeg";
  if (base === "application/x-pdf") return "application/pdf";
  if (base === "image/tif") return "image/tiff";
  return base;
}

/** Tipo real del archivo según sus primeros bytes. */
export function detectarMime(buffer: Buffer): MimeAceptado | null {
  if (buffer.subarray(0, 1024).includes("%PDF-")) return "application/pdf";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  const cabecera = buffer.subarray(0, 4);
  if (cabecera.equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) || cabecera.equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))) {
    return "image/tiff";
  }
  return null;
}

function mb(bytes: number): string {
  return (bytes / BYTES_POR_MB_VUCEM).toFixed(2);
}

function avisoPaginasEliminadas(numeros: number[]): string {
  const cuales = numeros.length === 1 ? `Se eliminó la página ${numeros[0]}` : `Se eliminaron las páginas ${numeros.join(", ")}`;
  return `${cuales} del original por estar en blanco. Verifica que no falte información.`;
}

function esBlanca(estadistica: { mean: number; stdev: number }): boolean {
  return estadistica.mean >= UMBRAL_BLANCO_MEDIA && estadistica.stdev <= UMBRAL_BLANCO_DESVIACION;
}

/** Lee un PGM binario (P5) de 8 bits como el que genera `pdftoppm -gray`. */
export function leerPgm(datos: Buffer): { ancho: number; alto: number; pixeles: Buffer } {
  let pos = 0;
  const token = (): string => {
    // Salta espacios y comentarios (# … fin de línea).
    for (;;) {
      while (pos < datos.length && /\s/.test(String.fromCharCode(datos[pos]))) pos++;
      if (datos[pos] === 0x23) {
        while (pos < datos.length && datos[pos] !== 0x0a) pos++;
      } else break;
    }
    const inicio = pos;
    while (pos < datos.length && !/\s/.test(String.fromCharCode(datos[pos]))) pos++;
    return datos.subarray(inicio, pos).toString("latin1");
  };
  if (token() !== "P5") throw new Error("Salida de pdftoppm inesperada (no es PGM P5).");
  const ancho = Number(token());
  const alto = Number(token());
  const maximo = Number(token());
  pos++; // un solo espacio en blanco separa el encabezado de los datos
  if (!Number.isInteger(ancho) || !Number.isInteger(alto) || ancho <= 0 || alto <= 0 || maximo !== 255) {
    throw new Error("Salida de pdftoppm inesperada (encabezado PGM inválido).");
  }
  const pixeles = datos.subarray(pos, pos + ancho * alto);
  if (pixeles.length !== ancho * alto) throw new Error("Salida de pdftoppm incompleta.");
  return { ancho, alto, pixeles };
}

function codificarJpeg(imagen: Sharp, calidad: number, dpi: number): Promise<Buffer> {
  return imagen
    .toColourspace("b-w")
    .withDensity(dpi)
    .jpeg({ quality: calidad, progressive: false, optimiseCoding: true, mozjpeg: false })
    .toBuffer();
}

/** Revisa si una página (pixeles en grises) está en blanco y, si no, la codifica en JPEG. */
async function procesarPixeles(
  pixeles: Buffer,
  ancho: number,
  alto: number,
  dpi: number,
  numero: number,
): Promise<PaginaRaster | null> {
  const raw = { raw: { width: ancho, height: alto, channels: 1 as const } };
  const { channels } = await sharp(pixeles, raw).stats();
  if (esBlanca(channels[0])) return null;
  const jpeg = await codificarJpeg(sharp(pixeles, raw), CALIDADES_JPEG[0], dpi);
  return { numero, ancho, alto, dpi, jpeg };
}

async function armarPdf(paginas: Array<Pick<PaginaRaster, "ancho" | "alto" | "dpi" | "jpeg">>): Promise<Buffer> {
  // updateMetadata: false → pdf-lib no agrega su Producer/Creator ni fechas.
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setProducer(PRODUCTOR);
  doc.setCreator(PRODUCTOR);
  for (const p of paginas) {
    const imagen = await doc.embedJpg(p.jpeg);
    // Tamaño en puntos = pixeles * 72 / dpi: se conserva el tamaño físico de la hoja.
    const ancho = (p.ancho * 72) / p.dpi;
    const alto = (p.alto * 72) / p.dpi;
    const pagina = doc.addPage([ancho, alto]);
    pagina.drawImage(imagen, { x: 0, y: 0, width: ancho, height: alto });
  }
  // Sin object streams (PDF 1.4 clásico): más compatible con validadores antiguos.
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

function errorTiempo() {
  return new ErrorConversion(
    "La conversión tardó demasiado. Intenta dividir el documento en partes más pequeñas o escanearlo de nuevo.",
  );
}

function verificarTiempo(limite: number) {
  if (Date.now() > limite) throw errorTiempo();
}

function tiempoRestante(limite: number): number {
  const restante = limite - Date.now();
  if (restante <= 0) throw errorTiempo();
  return restante;
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

const MENSAJE_CONTRASENA =
  "El PDF está protegido con contraseña de apertura. Quita la contraseña (o imprímelo como PDF nuevo) y vuelve a subirlo.";

async function rasterizarPdf(
  entrada: Buffer,
  dpi: number,
  limite: number,
  notas: string[],
): Promise<{ paginas: PaginaRaster[]; blancas: number[] }> {
  if (detectarMime(entrada) !== "application/pdf") {
    throw new ErrorConversion("El archivo no parece ser un PDF válido (no tiene encabezado %PDF).");
  }
  const marcas = marcasEnBuffer(entrada);

  return conDirectorioTemporal(async (dir) => {
    const ruta = path.join(dir, "entrada.pdf");
    await writeFile(ruta, entrada);

    let info;
    try {
      info = await leerInfoPdf(ruta, tiempoRestante(limite), MAX_PAGINAS + 1);
    } catch (e) {
      if (e instanceof ErrorConversion) throw e;
      if (esErrorDeContrasena(e)) throw new ErrorConversion(MENSAJE_CONTRASENA);
      if (e instanceof ErrorPoppler && e.porTiempo) throw errorTiempo();
      throw new ErrorConversion("No se pudo leer el PDF: parece estar dañado o incompleto. Ábrelo y guárdalo de nuevo como PDF.");
    }
    if (info.paginas < 1) throw new ErrorConversion("El PDF no tiene páginas.");
    if (info.paginas > MAX_PAGINAS) {
      throw new ErrorConversion(
        `El PDF tiene ${info.paginas} páginas; el máximo es ${MAX_PAGINAS}. Divide el documento en partes y súbelas por separado.`,
      );
    }
    info.tamanos.forEach((t, i) => {
      if (((t.ancho * dpi) / 72) * ((t.alto * dpi) / 72) > MAX_PIXELES_PAGINA) {
        throw new ErrorConversion(
          `La página ${i + 1} es demasiado grande (${(t.ancho / 72).toFixed(1)} × ${(t.alto / 72).toFixed(1)} in) para convertirla a ${dpi} dpi.`,
        );
      }
    });

    if (info.cifrado) {
      notas.push("El PDF original tenía restricciones de seguridad; la versión VUCEM se generó sin cifrado.");
    }
    if (marcas.acroForm || marcas.xfa || (info.formulario !== null && info.formulario !== "none")) {
      notas.push("El PDF original tenía campos de formulario: se convirtieron en imagen (lo capturado se conserva visible).");
    }
    if (marcas.javaScript || info.javascript) {
      notas.push("El PDF original tenía JavaScript: se eliminó.");
    }

    const paginas: PaginaRaster[] = [];
    const blancas: number[] = [];
    for (let desde = 1; desde <= info.paginas; desde += PAGINAS_POR_LOTE) {
      const hasta = Math.min(info.paginas, desde + PAGINAS_POR_LOTE - 1);
      const prefijo = path.join(dir, "p");
      try {
        // -cropbox: se rasteriza lo que muestran los visores (no la hoja completa de la MediaBox).
        await ejecutarPoppler(
          "pdftoppm",
          ["-gray", "-r", String(dpi), "-cropbox", "-f", String(desde), "-l", String(hasta), ruta, prefijo],
          tiempoRestante(limite),
        );
      } catch (e) {
        if (e instanceof ErrorConversion) throw e;
        if (e instanceof ErrorPoppler && e.porTiempo) throw errorTiempo();
        if (esErrorDeContrasena(e)) throw new ErrorConversion(MENSAJE_CONTRASENA);
        throw new ErrorConversion(
          "No se pudo convertir el PDF (pdftoppm falló). Puede estar dañado: ábrelo, imprímelo como PDF nuevo y vuelve a subirlo.",
        );
      }
      const archivos = (await readdir(dir))
        .map((nombre) => ({ nombre, numero: Number(nombre.match(/^p-(\d+)\.pgm$/)?.[1]) }))
        .filter((a) => Number.isInteger(a.numero) && a.numero >= desde && a.numero <= hasta)
        .sort((a, b) => a.numero - b.numero);
      if (archivos.length !== hasta - desde + 1) {
        throw new ErrorConversion("No se pudieron convertir todas las páginas del PDF. Puede estar dañado.");
      }
      for (const archivo of archivos) {
        verificarTiempo(limite);
        const rutaPagina = path.join(dir, archivo.nombre);
        const { ancho, alto, pixeles } = leerPgm(await readFile(rutaPagina));
        await unlink(rutaPagina);
        const pagina = await procesarPixeles(pixeles, ancho, alto, dpi, archivo.numero);
        if (pagina) paginas.push(pagina);
        else blancas.push(archivo.numero);
      }
    }
    return { paginas, blancas };
  });
}

// ─── Imágenes (JPG, PNG, TIFF) ─────────────────────────────────────────────────

async function rasterizarImagen(
  entrada: Buffer,
  mime: MimeAceptado,
  minDpi: number,
  limite: number,
  avisos: string[],
): Promise<{ paginas: PaginaRaster[]; blancas: number[] }> {
  if (detectarMime(entrada) !== mime) {
    throw new ErrorConversion("El contenido del archivo no corresponde a su tipo (la extensión no coincide con el formato real).");
  }
  let meta: Metadata;
  try {
    meta = await sharp(entrada, { limitInputPixels: MAX_PIXELES_PAGINA }).metadata();
  } catch {
    throw new ErrorConversion("No se pudo leer la imagen: parece estar dañada o es demasiado grande.");
  }
  const total = mime === "image/tiff" ? Math.max(1, meta.pages ?? 1) : 1;
  if (total > MAX_PAGINAS) {
    throw new ErrorConversion(`La imagen TIFF tiene ${total} páginas; el máximo es ${MAX_PAGINAS}.`);
  }

  const paginas: PaginaRaster[] = [];
  const blancas: number[] = [];
  const bajaResolucion: string[] = [];
  for (let i = 0; i < total; i++) {
    verificarTiempo(limite);
    let datos: { data: Buffer; info: OutputInfo };
    try {
      datos = await sharp(entrada, { page: i, limitInputPixels: MAX_PIXELES_PAGINA, autoOrient: true })
        .flatten({ background: "#ffffff" })
        .grayscale()
        .toColourspace("b-w")
        .raw({ depth: "uchar" })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new ErrorConversion("No se pudo leer la imagen: parece estar dañada o es demasiado grande.");
    }
    const { width: ancho, height: alto, channels } = datos.info;
    if (channels !== 1) throw new Error("Conversión a escala de grises inesperada.");

    const ladoLargo = Math.max(ancho, alto);
    // Si la imagen trae su resolución (p. ej. un escaneo a 300 dpi) y es razonable, se respeta;
    // si no, se ajusta a lo más a tamaño carta sin bajar de minDpi (nunca se reescala la imagen).
    const densidad = meta.density && meta.density >= minDpi && ladoLargo / meta.density <= 17 ? Math.round(meta.density) : null;
    const dpi = densidad ?? Math.max(minDpi, Math.ceil(ladoLargo / LADO_LARGO_CARTA_IN));
    if (ladoLargo < LADO_LARGO_RECOMENDADO_PX) bajaResolucion.push(`${total > 1 ? `página ${i + 1}: ` : ""}${ancho} × ${alto} px`);

    const pagina = await procesarPixeles(datos.data, ancho, alto, dpi, i + 1);
    if (pagina) paginas.push(pagina);
    else blancas.push(i + 1);
  }
  if (bajaResolucion.length > 0) {
    avisos.push(
      `Imagen de baja resolución (${bajaResolucion.join("; ")}). Para una hoja carta a 300 dpi se recomiendan al menos ` +
        `${LADO_LARGO_RECOMENDADO_PX} px en el lado largo; si el texto no se lee bien, vuelve a escanear a 300 dpi.`,
    );
  }
  return { paginas, blancas };
}

// ─── Función principal ───────────────────────────────────────────────────────

function resultadoError(mensaje: string, avisos: string[] = [], notas: string[] = []): ResultadoConversion {
  return {
    pdf: Buffer.alloc(0),
    paginas: 0,
    dpi: 0,
    bytes: 0,
    sha1: "",
    paginasEnBlancoEliminadas: [],
    avisos,
    notas,
    calidadJpeg: null,
    estado: "ERROR",
    error: mensaje,
  };
}

/**
 * Convierte un PDF o una imagen (JPG, PNG, TIFF) a un PDF solo-imagen en escala de grises
 * que cumple los requisitos de anexos de VUCEM. Nunca lanza: los problemas se regresan con
 * estado "ERROR" y un mensaje para el usuario.
 */
export async function convertirAVucem(
  entrada: Buffer,
  mime: string,
  opciones: OpcionesConversion,
): Promise<ResultadoConversion> {
  const tipo = normalizarMime(mime);
  if (!(MIMES_ACEPTADOS as readonly string[]).includes(tipo)) {
    return resultadoError(
      `Tipo de archivo no soportado (${tipo || "desconocido"}). Sube un PDF o una imagen JPG, PNG o TIFF.`,
    );
  }
  if (entrada.length === 0) return resultadoError("El archivo está vacío.");
  if (!(opciones.maxMB > 0)) return resultadoError("El límite de tamaño configurado para el trámite no es válido.");

  const dpi = Math.min(DPI_MAXIMO_ACEPTADO, Math.max(DPI_MINIMO_ACEPTADO, Math.round(opciones.minDpi || 300)));
  const maxBytes = Math.floor(opciones.maxMB * BYTES_POR_MB_VUCEM);
  const avisos: string[] = [];
  const notas: string[] = [];

  await adquirirTurno();
  try {
    const limite = Date.now() + TIEMPO_MAXIMO_MS;
    const { paginas, blancas } =
      tipo === "application/pdf"
        ? await rasterizarPdf(entrada, dpi, limite, notas)
        : await rasterizarImagen(entrada, tipo as MimeAceptado, dpi, limite, avisos);

    if (paginas.length === 0) {
      return resultadoError("Todas las páginas del documento están en blanco: revisa que subiste el archivo correcto.", avisos, notas);
    }
    if (blancas.length > 0) {
      avisos.push(avisoPaginasEliminadas(blancas));
    }

    // Se baja la calidad JPEG hasta que el PDF quepa en el límite del trámite. Las calidades
    // menores se obtienen recodificando la primera (sin volver a rasterizar).
    let calidad: number = CALIDADES_JPEG[0];
    let pdf = await armarPdf(paginas);
    for (const siguiente of CALIDADES_JPEG.slice(1)) {
      if (pdf.length <= maxBytes) break;
      verificarTiempo(limite);
      const reducidas = [];
      for (const p of paginas) {
        reducidas.push({ ...p, jpeg: await codificarJpeg(sharp(p.jpeg), siguiente, p.dpi) });
      }
      pdf = await armarPdf(reducidas);
      calidad = siguiente;
    }
    if (pdf.length > maxBytes) {
      return resultadoError(
        `El PDF convertido pesa ${mb(pdf.length)} MB aun con la calidad mínima y el límite del trámite es ${opciones.maxMB} MB. ` +
          "Divide el documento en partes (por ejemplo, por grupos de páginas) y súbelas como documentos separados.",
        avisos,
        notas,
      );
    }
    if (calidad !== CALIDADES_JPEG[0]) {
      avisos.push(`Se redujo la calidad de imagen (JPEG ${calidad}) para no pasar de ${opciones.maxMB} MB: revisa que el texto se lea bien.`);
    }
    if (pdf.length > MB_RECOMENDADO_VUCEM * BYTES_POR_MB_VUCEM) {
      avisos.push(
        `El PDF pesa ${mb(pdf.length)} MB. Algunas pantallas de VUCEM clásica aceptan como máximo ${MB_RECOMENDADO_VUCEM} MB por archivo; ` +
          "si el portal lo rechaza, divide el documento.",
      );
    }

    return {
      pdf,
      paginas: paginas.length,
      dpi: Math.min(...paginas.map((p) => p.dpi)),
      bytes: pdf.length,
      sha1: sha1Hex(pdf),
      paginasEnBlancoEliminadas: blancas,
      avisos,
      notas,
      calidadJpeg: calidad,
      estado: avisos.length > 0 ? "ADVERTENCIA" : "OK",
    };
  } catch (e) {
    if (e instanceof ErrorConversion) return resultadoError(e.message, avisos, notas);
    console.error("Error inesperado al convertir documento a formato VUCEM:", e);
    return resultadoError("Ocurrió un error inesperado al convertir el documento. Intenta de nuevo o escanéalo otra vez.", avisos, notas);
  } finally {
    liberarTurno();
  }
}
