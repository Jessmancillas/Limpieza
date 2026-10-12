import { MAX_NOMBRE_DOCUMENTO } from "./limites";

// "nombreDocumento" viaja en el XML de digitalización de VUCEM y forma parte de su cadena
// original (campos separados por "|"), por eso se limita a un juego de caracteres seguro.
const PERMITIDO = /[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ .,\-_()/]/;

/**
 * Normaliza el nombre descriptivo de un documento: quita caracteres de control y símbolos
 * raros (|, comillas, <, >, emojis…), cambia letras acentuadas no españolas por su base
 * (ç → c, ã → a), "&" por "y", colapsa espacios y recorta a 100 caracteres.
 */
export function normalizarNombreDocumento(texto: string): string {
  let salida = "";
  for (const caracter of texto.normalize("NFC")) {
    if (PERMITIDO.test(caracter)) {
      salida += caracter;
    } else if (caracter === "&") {
      salida += " y ";
    } else {
      const base = caracter.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      salida += base.length > 0 && [...base].every((c) => PERMITIDO.test(c)) ? base : " ";
    }
  }
  return salida.replace(/\s+/g, " ").trim().slice(0, MAX_NOMBRE_DOCUMENTO).trim();
}

/**
 * Nombre seguro para descargar (sin rutas ni caracteres problemáticos). Conserva acentos;
 * el encabezado HTTP agrega además una versión ASCII.
 */
export function nombreArchivoSeguro(nombre: string, extension?: string): string {
  const limpio = nombre
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 150)
    .trim();
  const base = limpio || "documento";
  if (!extension) return base;
  const ext = `.${extension.replace(/^\./, "").toLowerCase()}`;
  return base.toLowerCase().endsWith(ext) ? base : `${base}${ext}`;
}

/** Content-Disposition: attachment con nombre ASCII de respaldo y filename* (RFC 5987/6266). */
export function encabezadoDescarga(nombre: string): string {
  const seguro = nombreArchivoSeguro(nombre);
  const ascii =
    seguro
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\%;]/g, "_") || "documento";
  const codificado = encodeURIComponent(seguro).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${codificado}`;
}
