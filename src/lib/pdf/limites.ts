// Límites y constantes de los anexos PDF (compartidos entre cliente y servidor).

/** Tamaño máximo del archivo que se acepta para subir (antes de convertir). */
export const MAX_MB_SUBIDA = 25;
export const MAX_BYTES_SUBIDA = MAX_MB_SUBIDA * 1024 * 1024;

/**
 * Para comparar contra los límites de VUCEM se usa el megabyte decimal (1 MB = 1 000 000 bytes):
 * es el criterio más estricto, así un archivo "de 10 MB" pasa con cualquiera de las dos
 * interpretaciones (decimal o binaria) que use el portal.
 */
export const BYTES_POR_MB_VUCEM = 1_000_000;

/** VUCEM clásica limita algunos anexos a 3 MB: arriba de esto solo se avisa. */
export const MB_RECOMENDADO_VUCEM = 3;

/** Extensiones que acepta el formulario de subida. */
export const EXTENSIONES_ACEPTADAS = [".pdf", ".jpg", ".jpeg", ".png", ".tif", ".tiff"] as const;
export const ACCEPT_SUBIDA = EXTENSIONES_ACEPTADAS.join(",");

export const MIMES_ACEPTADOS = ["application/pdf", "image/jpeg", "image/png", "image/tiff"] as const;
export type MimeAceptado = (typeof MIMES_ACEPTADOS)[number];

export const EXTENSION_POR_MIME: Record<MimeAceptado, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/tiff": "tif",
};

/** Máximo de caracteres de "nombreDocumento" en la digitalización VUCEM. */
export const MAX_NOMBRE_DOCUMENTO = 100;

/** Formatea bytes para mostrar al usuario (KB/MB decimales, como los muestra VUCEM). */
export function formatoBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < BYTES_POR_MB_VUCEM) return `${(bytes / 1000).toFixed(0)} KB`;
  return `${(bytes / BYTES_POR_MB_VUCEM).toFixed(bytes < 10 * BYTES_POR_MB_VUCEM ? 2 : 1)} MB`;
}
