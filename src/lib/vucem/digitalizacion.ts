import {
  ErrorXml,
  NS_RESPUESTA,
  buscarTexto,
  elemento,
  encabezadoSeguridad,
  escaparXml,
  extraerFault,
  extraerRespuestaBase,
  parsearXml,
  sobreSoap,
} from "./soap";

// Servicio web público de Digitalización de Documentos de VUCEM (DigitalizarDocumentoService),
// que genera el eDocument de cada anexo. Estructura verificada con peticiones y respuestas
// reales (2025). Módulo puro: el SHA-1 del PDF lo calcula quien llama.

export const URL_DIGITALIZACION_PRODUCCION = "https://www.ventanillaunica.gob.mx/ventanilla/DigitalizarDocumentoService";
export const NS_DIGITALIZAR = "http://www.ventanillaunica.gob.mx/aga/digitalizar/ws/oxml/DigitalizarDocumento";
export const SOAP_ACTION_REGISTRO = "http://www.ventanillaunica.gob.mx/RegistroDigitalizarDocumento";
/** Supuesto: por simetría con el registro (la consulta solo exige el UsernameToken). */
export const SOAP_ACTION_CONSULTA = "http://www.ventanillaunica.gob.mx/ConsultaDigitalizarDocumento";

export const MAX_NOMBRE_DOCUMENTO_VUCEM = 100;

/**
 * nombreDocumento forma parte de la cadena original: sin saltos de línea, tabuladores ni "|",
 * espacios colapsados y máximo 100 caracteres.
 */
export function normalizarNombreDocumentoVucem(nombre: string): string {
  const limpio = nombre
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return [...limpio].slice(0, MAX_NOMBRE_DOCUMENTO_VUCEM).join("").trim();
}

export type DatosCadenaDigitalizacion = {
  /** RFC del titular del certificado con el que se firma. */
  rfcFirmante: string;
  correoElectronico: string;
  idTipoDocumento: string;
  nombreDocumento: string;
  /** RFC del importador que podrá consultar el eDocument. */
  rfcConsulta: string;
  /** SHA-1 del binario del PDF (hex). */
  sha1: string;
};

/** |RFC firmante|correo|idTipoDocumento|nombreDocumento|rfcConsulta|sha1 hex minúsculas| */
export function cadenaDigitalizacion(d: DatosCadenaDigitalizacion): string {
  const sha1 = d.sha1.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha1)) throw new Error("El SHA-1 del archivo debe tener 40 caracteres hexadecimales.");
  const campos = [
    d.rfcFirmante.trim().toUpperCase(),
    d.correoElectronico.trim(),
    d.idTipoDocumento.trim(),
    normalizarNombreDocumentoVucem(d.nombreDocumento),
    d.rfcConsulta.trim().toUpperCase(),
    sha1,
  ];
  return `|${campos.join("|")}|`;
}

export type DatosRegistro = {
  usuario: string;
  password: string;
  correoElectronico: string;
  idTipoDocumento: string;
  nombreDocumento: string;
  rfcConsulta: string;
  archivoBase64: string;
  certificadoBase64: string;
  cadenaOriginal: string;
  firma: string;
};

/** Petición registroDigitalizarDocumentoServiceRequest (asíncrona: responde numeroOperacion). */
export function xmlRegistro(d: DatosRegistro): string {
  const cuerpo =
    `<registroDigitalizarDocumentoServiceRequest xmlns="${NS_DIGITALIZAR}">` +
    elemento("correoElectronico", d.correoElectronico.trim()) +
    `<documento>` +
    elemento("idTipoDocumento", d.idTipoDocumento.trim()) +
    elemento("nombreDocumento", normalizarNombreDocumentoVucem(d.nombreDocumento)) +
    elemento("rfcConsulta", d.rfcConsulta.trim().toUpperCase()) +
    elemento("archivo", d.archivoBase64) +
    `</documento>` +
    `<peticionBase>` +
    `<firmaElectronica xmlns="${NS_RESPUESTA}">` +
    elemento("certificado", d.certificadoBase64) +
    elemento("cadenaOriginal", d.cadenaOriginal) +
    elemento("firma", d.firma) +
    `</firmaElectronica>` +
    `</peticionBase>` +
    `</registroDigitalizarDocumentoServiceRequest>`;
  return sobreSoap({ encabezado: encabezadoSeguridad(d.usuario, d.password), cuerpo });
}

/** Consulta del eDocument por numeroOperacion (solo UsernameToken, sin firma). */
export function xmlConsulta(d: { usuario: string; password: string; numeroOperacion: string }): string {
  const cuerpo =
    `<ConsultaEDocumentDigitalizarDocumento xmlns="${NS_DIGITALIZAR}">` +
    elemento("numeroOperacion", d.numeroOperacion.trim()) +
    `</ConsultaEDocumentDigitalizarDocumento>`;
  return sobreSoap({ encabezado: encabezadoSeguridad(d.usuario, d.password), cuerpo });
}

/**
 * Para guardar la petición en la bitácora de envíos sin duplicar el PDF (hasta ~13 MB en base64):
 * el contenido de <archivo> se sustituye por una nota con su tamaño.
 */
export function omitirArchivo(xml: string): string {
  return xml.replace(/(<(?:[\w.-]+:)?archivo\b[^>]*>)([\s\S]*?)(<\/(?:[\w.-]+:)?archivo\s*>)/g, (_t, abre: string, contenido: string, cierra: string) => {
    const bytes = Math.floor((contenido.replace(/\s+/g, "").length * 3) / 4);
    return `${abre}${escaparXml(`[PDF en base64 omitido: ~${bytes} bytes]`)}${cierra}`;
  });
}

export type ResultadoRegistro = { ok: true; numeroOperacion: string; mensajes: string[] } | { ok: false; mensaje: string };

export function parsearRespuestaRegistro(xml: string): ResultadoRegistro {
  try {
    const raiz = parsearXml(xml);
    const fault = extraerFault(raiz);
    if (fault) return { ok: false, mensaje: fault.detalle ? `${fault.mensaje} (${fault.detalle})` : fault.mensaje };
    const base = extraerRespuestaBase(raiz);
    if (base.tieneError) return { ok: false, mensaje: base.mensajes.join(" · ") || "VUCEM rechazó el documento sin indicar el motivo." };
    const numeroOperacion = buscarTexto(raiz, ["numeroOperacion"]);
    if (!numeroOperacion) {
      return { ok: false, mensaje: base.mensajes.join(" · ") || "La respuesta de VUCEM no trae número de operación." };
    }
    return { ok: true, numeroOperacion, mensajes: base.mensajes };
  } catch (e) {
    return { ok: false, mensaje: e instanceof ErrorXml ? e.message : "No se pudo leer la respuesta de VUCEM." };
  }
}

export type ResultadoConsulta =
  | { estado: "OK"; eDocument: string; numeroDeTramite: string | null; cadenaOriginal: string | null }
  | { estado: "PENDIENTE"; mensaje?: string }
  | { estado: "ERROR"; mensaje: string };

/**
 * Respuesta de ConsultaEDocumentDigitalizarDocumento: si trae eDocument → OK; si tieneError → ERROR;
 * si no hay error ni eDocument, VUCEM aún lo está procesando → PENDIENTE.
 */
export function parsearRespuestaConsulta(xml: string): ResultadoConsulta {
  try {
    const raiz = parsearXml(xml);
    const fault = extraerFault(raiz);
    if (fault) return { estado: "ERROR", mensaje: fault.detalle ? `${fault.mensaje} (${fault.detalle})` : fault.mensaje };
    const base = extraerRespuestaBase(raiz);
    if (base.tieneError) {
      return { estado: "ERROR", mensaje: base.mensajes.join(" · ") || "VUCEM reportó un error al digitalizar el documento." };
    }
    const eDocument = buscarTexto(raiz, ["eDocument"]);
    if (!eDocument) return { estado: "PENDIENTE", ...(base.mensajes.length ? { mensaje: base.mensajes.join(" · ") } : {}) };
    return {
      estado: "OK",
      eDocument,
      numeroDeTramite: buscarTexto(raiz, ["numeroDeTramite"]),
      cadenaOriginal: buscarTexto(raiz, ["cadenaOriginal"]),
    };
  } catch (e) {
    return { estado: "ERROR", mensaje: e instanceof ErrorXml ? e.message : "No se pudo leer la respuesta de VUCEM." };
  }
}
