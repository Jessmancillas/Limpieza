import "server-only";

import { writeFile } from "node:fs/promises";
import path from "node:path";

import { conDirectorioTemporal, esErrorDeContrasena, leerInfoPdf } from "./poppler";

export type InspeccionPdf = {
  /** null si el PDF no se pudo abrir (dañado o con contraseña de apertura). */
  paginas: number | null;
  cifrado: boolean;
  /** El PDF pide contraseña para abrirse (no solo tiene restricciones de permisos). */
  requiereContrasena: boolean;
  tieneFormularios: boolean;
  tieneJavaScript: boolean;
};

/** Contenido del PDF fuera de los streams (para no confundir datos binarios con nombres PDF). */
function textoSinStreams(buffer: Buffer): string {
  return buffer.toString("latin1").replace(/stream\r?\n[\s\S]*?endstream/g, "stream endstream");
}

/** Búsqueda directa de marcas en el buffer (no ve objetos comprimidos; pdfinfo los cubre). */
export function marcasEnBuffer(buffer: Buffer) {
  const texto = textoSinStreams(buffer);
  return {
    acroForm: texto.includes("/AcroForm"),
    xfa: /\/XFA[\s/<[(]/.test(texto),
    javaScript: /\/(JavaScript|JS)[\s/<[(]/.test(texto),
    encrypt: /\/Encrypt[\s/<[(\d]/.test(texto),
  };
}

/**
 * Revisión informativa de un PDF: páginas, cifrado, formularios y JavaScript.
 * Combina pdfinfo con una búsqueda de /AcroForm, /JavaScript y /JS en el archivo.
 */
export async function inspeccionarPdf(buffer: Buffer): Promise<InspeccionPdf> {
  const marcas = marcasEnBuffer(buffer);
  return conDirectorioTemporal(async (dir) => {
    const ruta = path.join(dir, "entrada.pdf");
    await writeFile(ruta, buffer);
    try {
      const info = await leerInfoPdf(ruta, 30_000);
      return {
        paginas: info.paginas,
        cifrado: info.cifrado || marcas.encrypt,
        requiereContrasena: false,
        tieneFormularios: (info.formulario !== null && info.formulario !== "none") || marcas.acroForm || marcas.xfa,
        tieneJavaScript: info.javascript === true || marcas.javaScript,
      };
    } catch (e) {
      const contrasena = esErrorDeContrasena(e);
      return {
        paginas: null,
        cifrado: contrasena || marcas.encrypt,
        requiereContrasena: contrasena,
        tieneFormularios: marcas.acroForm || marcas.xfa,
        tieneJavaScript: marcas.javaScript,
      };
    }
  });
}
