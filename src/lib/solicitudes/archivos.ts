// Archivos de seguimiento (acuse, resolución) y descargas. Sin dependencias de servidor.

/** Tamaño máximo de un acuse o resolución en PDF. */
export const MAX_MB_PDF_SEGUIMIENTO = 15;
const MAX_BYTES = MAX_MB_PDF_SEGUIMIENTO * 1024 * 1024;

/**
 * Lee un PDF opcional de un formulario. Regresa null si no se adjuntó nada, o un mensaje de error.
 */
export async function leerPdfOpcional(
  valor: FormDataEntryValue | null,
): Promise<{ datos: Buffer | null; error?: undefined } | { datos?: undefined; error: string }> {
  if (!valor || typeof valor === "string" || valor.size === 0) return { datos: null };
  if (valor.size > MAX_BYTES) return { error: `El PDF no debe pesar más de ${MAX_MB_PDF_SEGUIMIENTO} MB.` };
  const datos = Buffer.from(await valor.arrayBuffer());
  if (datos.subarray(0, 1024).indexOf("%PDF-") === -1) return { error: "El archivo debe ser un PDF." };
  return { datos };
}

/** Content-Disposition: attachment con nombre ASCII de respaldo y filename* UTF-8. */
export function dispositionAdjunto(nombre: string): string {
  const limpio = nombre.replace(/[\u0000-\u001f\u007f\\/:*?"<>|]+/g, "_").trim() || "archivo";
  const ascii = limpio
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/[%;]/g, "_");
  const codificado = encodeURIComponent(limpio).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${codificado}`;
}
