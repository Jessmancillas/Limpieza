import "server-only";

import { obtenerOpcionesCatalogo } from "@/lib/catalogos";
import { db } from "@/lib/db";
import { convertirAVucem, detectarMime } from "@/lib/pdf/convertir-vucem";
import { EXTENSION_POR_MIME, MAX_BYTES_SUBIDA, MAX_MB_SUBIDA, type MimeAceptado } from "@/lib/pdf/limites";
import { nombreArchivoSeguro } from "@/lib/pdf/nombre-documento";
import { ESTADOS_NO_EDITABLES } from "@/lib/solicitudes/consultas";
import { borrarArchivo, guardarArchivo, rutaEsDeEmpresa } from "@/lib/storage";
import { DEFINICION_260211_INICIAL, leerDefinicion } from "@/lib/tramite/definicion";

import type { OpcionesDocumento } from "./esquema";
import type { ReporteConversion } from "./utilidades";

/** Clave VUCEM del trámite cuyos límites de PDF se aplican a los anexos. */
const CLAVE_TRAMITE = "260211";

export type LimitesPdf = { minDpi: number; maxMB: number };

/**
 * Límites de PDF (dpi mínimo y MB máximos) de la TramiteVersion activa más reciente del 260211.
 * Si no hay versión cargada o su definición no es válida, se usan los valores iniciales.
 */
export async function limitesPdfVigentes(): Promise<LimitesPdf> {
  const ahora = new Date();
  const version =
    (await db.tramiteVersion.findFirst({
      where: { claveVucem: CLAVE_TRAMITE, activo: true, vigenteDesde: { lte: ahora } },
      orderBy: { vigenteDesde: "desc" },
      select: { definicion: true },
    })) ??
    (await db.tramiteVersion.findFirst({
      where: { claveVucem: CLAVE_TRAMITE, activo: true },
      orderBy: { vigenteDesde: "asc" },
      select: { definicion: true },
    }));
  if (version) {
    try {
      const { minDpi, maxMB } = leerDefinicion(version.definicion).limitesPdf;
      return { minDpi, maxMB };
    } catch (e) {
      console.error("Definición del trámite 260211 inválida; se usan los límites iniciales.", e);
    }
  }
  return { ...DEFINICION_260211_INICIAL.limitesPdf };
}

export type ArchivoSubido = { datos: Buffer; mime: MimeAceptado; nombre: string };

/** Lee y valida el archivo del formulario. Regresa el archivo o un mensaje de error. */
export async function leerArchivoSubido(formData: FormData, campo = "archivo"): Promise<ArchivoSubido | { error: string }> {
  const archivo = formData.get(campo);
  // File extiende Blob; se acepta cualquier Blob por si el runtime usa otra implementación de File.
  if (!(archivo instanceof Blob) || archivo.size === 0) return { error: "Elige el archivo a subir (PDF, JPG o PNG)." };
  if (archivo.size > MAX_BYTES_SUBIDA) return { error: `El archivo pesa más de ${MAX_MB_SUBIDA} MB. Divídelo o escanéalo de nuevo.` };
  const datos = Buffer.from(await archivo.arrayBuffer());
  // El tipo se decide por el contenido (primeros bytes), no por la extensión ni por lo que diga el navegador.
  const mime = detectarMime(datos);
  if (!mime) {
    return { error: "Tipo de archivo no soportado. Sube un PDF o una imagen JPG, PNG o TIFF (no Word, Excel ni ZIP)." };
  }
  const nombreOriginal = "name" in archivo && typeof archivo.name === "string" && archivo.name ? archivo.name : "documento";
  return { datos, mime, nombre: nombreArchivoSeguro(nombreOriginal, EXTENSION_POR_MIME[mime]).slice(0, 200) };
}

/** Campos de Documento que dependen del archivo convertido. */
export type CamposConversion = {
  archivoVucemRuta: string | null;
  archivoVucemBytes: number | null;
  sha1Vucem: string | null;
  paginas: number | null;
  dpi: number | null;
  estadoConversion: string;
  reporteConversion: string;
};

/**
 * Convierte el original al formato VUCEM con los límites vigentes y guarda el PDF resultante.
 * Nunca lanza por problemas del archivo: si la conversión falla regresa estadoConversion = "ERROR"
 * y el mensaje queda en el reporte.
 */
export async function convertirYGuardar(
  empresaId: string,
  original: { datos: Buffer; mime: string },
): Promise<{ campos: CamposConversion; error?: string }> {
  const limites = await limitesPdfVigentes();
  const r = await convertirAVucem(original.datos, original.mime, limites);
  const reporte: ReporteConversion = {
    version: 1,
    fecha: new Date().toISOString(),
    origen: { mime: original.mime, bytes: original.datos.length },
    limites,
    calidadJpeg: r.calidadJpeg,
    paginasEnBlancoEliminadas: r.paginasEnBlancoEliminadas,
    avisos: r.avisos,
    notas: r.notas,
    ...(r.error ? { error: r.error } : {}),
  };
  if (r.estado === "ERROR") {
    return {
      campos: {
        archivoVucemRuta: null,
        archivoVucemBytes: null,
        sha1Vucem: null,
        paginas: null,
        dpi: null,
        estadoConversion: "ERROR",
        reporteConversion: JSON.stringify(reporte),
      },
      error: r.error ?? "No se pudo convertir el documento.",
    };
  }
  const ruta = await guardarArchivo(empresaId, r.pdf, "pdf", "documentos");
  return {
    campos: {
      archivoVucemRuta: ruta,
      archivoVucemBytes: r.bytes,
      sha1Vucem: r.sha1,
      paginas: r.paginas,
      dpi: r.dpi,
      estadoConversion: r.estado,
      reporteConversion: JSON.stringify(reporte),
    },
  };
}

/** Campos de digitalización que se limpian cuando el PDF para VUCEM cambia. */
export const EDOCUMENT_REINICIADO = {
  estadoEDocument: "NO_ENVIADO",
  eDocument: null,
  numeroOperacionEDoc: null,
  numeroTramiteEDoc: null,
  errorEDocument: null,
  eDocumentFecha: null,
} as const;

/** Borra archivos del almacenamiento, solo si pertenecen a la empresa. */
export async function borrarArchivosDeEmpresa(empresaId: string, rutas: Array<string | null | undefined>) {
  for (const ruta of rutas) {
    if (!ruta) continue;
    if (!rutaEsDeEmpresa(ruta, empresaId)) {
      console.error(`Se omitió borrar un archivo que no pertenece a la empresa (${empresaId}).`);
      continue;
    }
    await borrarArchivo(ruta);
  }
}

/**
 * Verifica que el producto y el establecimiento elegidos sean de la empresa.
 * Regresa errores por campo (vacío si todo está bien).
 */
export async function validarLigas(
  empresaId: string,
  d: { productoId?: string; establecimientoId?: string },
): Promise<Record<string, string[]>> {
  const errores: Record<string, string[]> = {};
  const [producto, establecimiento] = await Promise.all([
    d.productoId ? db.producto.findFirst({ where: { id: d.productoId, empresaId }, select: { id: true } }) : null,
    d.establecimientoId
      ? db.establecimiento.findFirst({ where: { id: d.establecimientoId, empresaId }, select: { id: true } })
      : null,
  ]);
  if (d.productoId && !producto) errores.productoId = ["Elige un producto de la lista"];
  if (d.establecimientoId && !establecimiento) errores.establecimientoId = ["Elige un establecimiento de la lista"];
  return errores;
}

/**
 * Solicitudes ya presentadas que usan el documento: su archivo no debe cambiar porque es parte
 * de lo que se presentó ante VUCEM.
 */
export async function solicitudesPresentadasConDocumento(empresaId: string, documentoId: string) {
  const usos = await db.solicitudDocumento.findMany({
    where: { documentoId, solicitud: { empresaId } },
    select: { solicitud: { select: { numero: true, estado: true } } },
  });
  return usos.map((u) => u.solicitud).filter((s) => ESTADOS_NO_EDITABLES.has(s.estado));
}

/** Productos y establecimientos activos de la empresa (más los ya ligados aunque estén inactivos). */
export async function cargarOpcionesDocumento(
  empresaId: string,
  actuales: { productoId?: string | null; establecimientoId?: string | null } = {},
): Promise<OpcionesDocumento> {
  const [productos, establecimientos, tiposDocumentoVucem] = await Promise.all([
    db.producto.findMany({
      where: { empresaId, OR: [{ activo: true }, ...(actuales.productoId ? [{ id: actuales.productoId }] : [])] },
      select: { id: true, denominacionEspecifica: true, denominacionDistintiva: true, numRegistroSanitario: true, activo: true },
      orderBy: { denominacionEspecifica: "asc" },
    }),
    db.establecimiento.findMany({
      where: { empresaId, OR: [{ activo: true }, ...(actuales.establecimientoId ? [{ id: actuales.establecimientoId }] : [])] },
      select: { id: true, denominacionRazonSocial: true, municipio: true, activo: true },
      orderBy: { denominacionRazonSocial: "asc" },
    }),
    obtenerOpcionesCatalogo("CAT_TIPO_DOCUMENTO"),
  ]);
  return {
    productos: productos.map((p) => ({
      id: p.id,
      etiqueta: [p.denominacionEspecifica, p.denominacionDistintiva, p.numRegistroSanitario && `RS ${p.numRegistroSanitario}`]
        .filter(Boolean)
        .join(" · "),
      activo: p.activo,
    })),
    establecimientos: establecimientos.map((e) => ({
      id: e.id,
      etiqueta: `${e.denominacionRazonSocial} · ${e.municipio}`,
      activo: e.activo,
    })),
    tiposDocumentoVucem,
  };
}
