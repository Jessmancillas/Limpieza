import { XMLParser, XMLValidator } from "fast-xml-parser";

// Utilidades SOAP 1.1 para los servicios web de VUCEM (sin dependencias de Node: se usa en el
// servidor, en el simulador y en pruebas). Encabezado de seguridad según el Manual WS 260211,
// sección 2.2: WS-Addressing (opcional) + wsse:UsernameToken con contraseña en texto (PasswordText).

export const NS_SOAPENV = "http://schemas.xmlsoap.org/soap/envelope/";
export const NS_WSSE = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
export const NS_WSU = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd";
export const TIPO_PASSWORD_TEXTO =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText";
/** WS-Addressing de agosto 2004 (el del ejemplo del manual: .../ws/2004/08/addressing/role/anonymous). */
export const NS_WSA = "http://schemas.xmlsoap.org/ws/2004/08/addressing";
export const WSA_ANONIMO = `${NS_WSA}/role/anonymous`;
/** Namespace de firmaElectronica / respuestaBase en los servicios de VUCEM. */
export const NS_RESPUESTA = "http://www.ventanillaunica.gob.mx/common/ws/oxml/respuesta";

export const PASSWORD_REDACTADO = "********";

// Caracteres no permitidos en XML 1.0 (controles salvo tab, salto de línea y retorno de carro).
const CONTROLES_INVALIDOS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

/** Escapa texto para contenido o atributos XML. */
export function escaparXml(texto: string | number | null | undefined): string {
  if (texto === null || texto === undefined) return "";
  return String(texto)
    .replace(CONTROLES_INVALIDOS, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Elemento simple <nombre>valor</nombre> con el valor escapado. */
export function elemento(nombre: string, valor: string | number | null | undefined, atributos = ""): string {
  return `<${nombre}${atributos ? ` ${atributos}` : ""}>${escaparXml(valor)}</${nombre}>`;
}

/** wsse:Security con UsernameToken (usuario = RFC; password = contraseña de servicios web). */
export function encabezadoSeguridad(usuario: string, password: string): string {
  return (
    `<wsse:Security xmlns:wsse="${NS_WSSE}">` +
    `<wsse:UsernameToken xmlns:wsu="${NS_WSU}">` +
    elemento("wsse:Username", usuario) +
    elemento("wsse:Password", password, `Type="${TIPO_PASSWORD_TEXTO}"`) +
    `</wsse:UsernameToken>` +
    `</wsse:Security>`
  );
}

export function nuevoMessageId(): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
        });
  return `urn:uuid:${uuid}`;
}

export type OpcionesAddressing = { action: string; to?: string | null; messageId?: string };

/** Encabezados WS-Addressing como en el ejemplo de la sección 2.2 del manual. */
export function encabezadosAddressing({ action, to, messageId }: OpcionesAddressing): string {
  return (
    elemento("wsa:Action", action, `xmlns:wsa="${NS_WSA}"`) +
    elemento("wsa:MessageID", messageId ?? nuevoMessageId(), `xmlns:wsa="${NS_WSA}"`) +
    `<wsa:ReplyTo xmlns:wsa="${NS_WSA}">${elemento("wsa:Address", WSA_ANONIMO)}</wsa:ReplyTo>` +
    (to ? elemento("wsa:To", to, `xmlns:wsa="${NS_WSA}"`) : "")
  );
}

/**
 * Sobre SOAP 1.1. `namespaces` son declaraciones extra para el Envelope (prefijo → URI).
 * El encabezado y el cuerpo ya deben venir serializados.
 */
export function sobreSoap({
  cuerpo,
  encabezado = "",
  namespaces = {},
}: {
  cuerpo: string;
  encabezado?: string;
  namespaces?: Record<string, string>;
}): string {
  const extras = Object.entries(namespaces)
    .map(([prefijo, uri]) => ` xmlns:${prefijo}="${escaparXml(uri)}"`)
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="${NS_SOAPENV}"${extras}>` +
    (encabezado ? `<soapenv:Header>${encabezado}</soapenv:Header>` : `<soapenv:Header/>`) +
    `<soapenv:Body>${cuerpo}</soapenv:Body>` +
    `</soapenv:Envelope>`
  );
}

/**
 * Reemplaza el contenido de cualquier <…:Password> por "********". TODO XML que se guarde
 * (EnvioVucem, pantallas, bitácora) debe pasar por aquí.
 */
export function redactarPassword(xml: string): string {
  return xml.replace(
    /(<(?:[\w.-]+:)?Password\b[^>]*>)([\s\S]*?)(<\/(?:[\w.-]+:)?Password\s*>)/g,
    `$1${PASSWORD_REDACTADO}$3`,
  );
}

// ───────────────────────────── Lectura de respuestas ─────────────────────────────

export type NodoXml = string | number | boolean | null | undefined | NodoXml[] | { [clave: string]: NodoXml };

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Todo como texto: un folio de 25 dígitos NO debe convertirse en número.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
});

export class ErrorXml extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorXml";
  }
}

/** Valida que el texto sea XML bien formado. */
export function esXmlBienFormado(xml: string): boolean {
  return XMLValidator.validate(xml) === true;
}

/** Parsea XML quitando los prefijos de namespace. Lanza ErrorXml si no es XML válido. */
export function parsearXml(xml: string): Record<string, NodoXml> {
  const texto = xml.trim();
  if (!texto) throw new ErrorXml("La respuesta llegó vacía.");
  const validacion = XMLValidator.validate(texto);
  if (validacion !== true) {
    throw new ErrorXml(`La respuesta no es XML válido (${validacion.err.msg}, línea ${validacion.err.line}).`);
  }
  return parser.parse(texto) as Record<string, NodoXml>;
}

function esObjeto(nodo: NodoXml): nodo is { [clave: string]: NodoXml } {
  return typeof nodo === "object" && nodo !== null && !Array.isArray(nodo);
}

/** Texto de un nodo (string directo o "#text" si el elemento tenía atributos). */
export function textoNodo(nodo: NodoXml): string | null {
  if (nodo === null || nodo === undefined) return null;
  if (typeof nodo === "string" || typeof nodo === "number" || typeof nodo === "boolean") {
    const t = String(nodo).trim();
    return t === "" ? null : t;
  }
  if (Array.isArray(nodo)) return textoNodo(nodo[0]);
  if ("#text" in nodo) return textoNodo(nodo["#text"]);
  return null;
}

/** Todos los nodos (a cualquier profundidad) cuyo nombre local coincide (sin distinguir mayúsculas). */
export function buscarNodos(raiz: NodoXml, nombre: string): NodoXml[] {
  const buscado = nombre.toLowerCase();
  const encontrados: NodoXml[] = [];
  const visitar = (nodo: NodoXml) => {
    if (Array.isArray(nodo)) {
      nodo.forEach(visitar);
      return;
    }
    if (!esObjeto(nodo)) return;
    for (const [clave, valor] of Object.entries(nodo)) {
      if (clave.startsWith("@_") || clave === "#text") continue;
      if (clave.toLowerCase() === buscado) {
        if (Array.isArray(valor)) encontrados.push(...valor);
        else encontrados.push(valor);
      }
      visitar(valor);
    }
  };
  visitar(raiz);
  return encontrados;
}

/** Primer texto no vacío entre los nodos con alguno de los nombres dados (en ese orden de preferencia). */
export function buscarTexto(raiz: NodoXml, nombres: string[]): string | null {
  for (const nombre of nombres) {
    for (const nodo of buscarNodos(raiz, nombre)) {
      const texto = textoNodo(nodo);
      if (texto) return texto;
    }
  }
  return null;
}

/** Todos los textos (hojas) dentro de un nodo. */
export function textosHoja(nodo: NodoXml): string[] {
  if (nodo === null || nodo === undefined) return [];
  if (typeof nodo !== "object") {
    const t = String(nodo).trim();
    return t ? [t] : [];
  }
  if (Array.isArray(nodo)) return nodo.flatMap(textosHoja);
  return Object.entries(nodo)
    .filter(([clave]) => !clave.startsWith("@_"))
    .flatMap(([, valor]) => textosHoja(valor));
}

export type FaultSoap = { codigo: string; mensaje: string; detalle?: string };

/** Extrae el SOAP Fault (faultcode/faultstring/detail) si la respuesta lo trae. */
export function extraerFault(raiz: NodoXml): FaultSoap | null {
  const fault = buscarNodos(raiz, "Fault")[0];
  if (fault === undefined) return null;
  const codigo = buscarTexto(fault, ["faultcode", "Code", "Value"]) ?? "Fault";
  const mensaje = buscarTexto(fault, ["faultstring", "Reason", "Text"]) ?? "El servicio respondió con un error (SOAP Fault).";
  const detalleNodo = buscarNodos(fault, "detail")[0] ?? buscarNodos(fault, "Detail")[0];
  const detalle = detalleNodo !== undefined ? textosHoja(detalleNodo).join(" · ") || undefined : undefined;
  return { codigo, mensaje, ...(detalle ? { detalle } : {}) };
}

/** Nombres de nodos con mensajes de VUCEM (respuestaBase/errores/mensajes). */
const NODOS_MENSAJE = ["mensajes", "mensaje", "errores", "error", "descripcionError", "descripcion", "message"];

export type RespuestaBase = { tieneError: boolean | null; mensajes: string[] };

/**
 * Lee respuestaBase (tieneError + mensajes). Si no hay respuestaBase, busca tieneError y
 * mensajes en todo el documento.
 */
export function extraerRespuestaBase(raiz: NodoXml): RespuestaBase {
  const base = buscarNodos(raiz, "respuestaBase")[0] ?? raiz;
  const bandera = buscarTexto(base, ["tieneError"]) ?? buscarTexto(raiz, ["tieneError"]);
  const tieneError = bandera === null ? null : bandera.toLowerCase() === "true" || bandera === "1";
  const mensajes = new Set<string>();
  for (const nombre of NODOS_MENSAJE) {
    for (const nodo of buscarNodos(base, nombre)) {
      for (const texto of textosHoja(nodo)) {
        // Banderas sueltas (true/false) y códigos numéricos cortos no aportan al usuario.
        if (/^(true|false)$/i.test(texto)) continue;
        mensajes.add(texto);
      }
    }
  }
  return { tieneError, mensajes: [...mensajes] };
}

/** Respuesta de error SOAP 1.1 (la usa el simulador). */
export function xmlFault(codigo: "soapenv:Client" | "soapenv:Server", mensaje: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="${NS_SOAPENV}"><soapenv:Body><soapenv:Fault>` +
    elemento("faultcode", codigo) +
    elemento("faultstring", mensaje) +
    `</soapenv:Fault></soapenv:Body></soapenv:Envelope>`
  );
}
