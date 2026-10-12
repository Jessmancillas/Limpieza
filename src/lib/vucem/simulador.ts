import { createHash, randomBytes } from "node:crypto";

import { leerCertificadoBase64, verificarFirma } from "@/lib/firma/firmar";

import { NS_DIGITALIZAR, cadenaDigitalizacion } from "./digitalizacion";
import { NAMESPACE_260211_MANUAL } from "./solicitud-260211";
import { ErrorXml, NS_RESPUESTA, NS_SOAPENV, buscarNodos, buscarTexto, elemento, parsearXml, xmlFault, type NodoXml } from "./soap";

// SIMULADOR de los servicios web de VUCEM, para desarrollo y pruebas. NO es VUCEM: los folios y
// eDocuments que genera no tienen validez. Valida lo mismo que se espera del servicio real:
// UsernameToken, firma SHA256withRSA contra el certificado, RFC del firmante y, en la
// digitalización, que la cadena original corresponda a los datos y al SHA-1 del PDF.

export type RespuestaSimulador = { status: number; xml: string };

export function simuladorHabilitado(): boolean {
  return !(process.env.NODE_ENV === "production" && process.env.VUCEM_SIMULADOR !== "true");
}

export function passwordSimulador(): string {
  return process.env.VUCEM_SIMULADOR_PASSWORD ?? "simulador-vucem";
}

/** Tamaño máximo de una petición al simulador (un PDF de 10 MB ocupa ~13.4 MB en base64). */
export const MAX_BYTES_PETICION = 25 * 1024 * 1024;

/** Tiempo que una digitalización se reporta "en proceso" antes de entregar el eDocument. */
export const DEMORA_DIGITALIZACION_MS = 4_000;

type EstadoSimulador = {
  operaciones: Map<string, { registradoEn: number; error: boolean }>;
  consecutivo: number;
};

function estado(): EstadoSimulador {
  const g = globalThis as { __simuladorVucem?: EstadoSimulador };
  g.__simuladorVucem ??= {
    operaciones: new Map(),
    consecutivo: 100_000 + (randomBytes(3).readUIntBE(0, 3) % 800_000),
  };
  return g.__simuladorVucem;
}

class FaultSimulador extends Error {
  constructor(
    mensaje: string,
    readonly codigo: "soapenv:Client" | "soapenv:Server" = "soapenv:Client",
  ) {
    super(mensaje);
  }
}

const fault = (e: FaultSimulador): RespuestaSimulador => ({ status: 500, xml: xmlFault(e.codigo, `${e.message} [SIMULADOR]`) });

function hash(texto: string): Buffer {
  return createHash("sha256").update(texto, "utf8").digest();
}

/** n dígitos decimales derivados del texto. */
function digitos(texto: string, n: number): string {
  let salida = "";
  let ronda = 0;
  while (salida.length < n) {
    salida += BigInt(`0x${hash(`${texto}#${ronda++}`).toString("hex")}`).toString(10);
  }
  return salida.slice(0, n);
}

/** n caracteres [0-9A-Z] derivados del texto. */
function alfanumericos(texto: string, n: number): string {
  let salida = "";
  let ronda = 0;
  while (salida.length < n) {
    salida += BigInt(`0x${hash(`${texto}#${ronda++}`).toString("hex")}`).toString(36).toUpperCase();
  }
  return salida.slice(0, n);
}

/** eDocument de 13 caracteres alfanuméricos (formato observado: "0170251ABCD12"), determinístico. */
export function eDocumentSimulado(numeroOperacion: string): string {
  return `0170${alfanumericos(`edoc:${numeroOperacion}`, 9)}`;
}

/** Número de trámite de 25 dígitos, determinístico. */
export function numeroTramiteSimulado(numeroOperacion: string): string {
  return digitos(`tramite:${numeroOperacion}`, 25);
}

/** Folio de 25 dígitos con el formato observado en VUCEM: 04 026 002 011 aaaa 4006 nnnnnn. */
export function folioSimulado(anio: number, consecutivo: number): string {
  const folio = `04026002011${anio}4006${String(consecutivo % 1_000_000).padStart(6, "0")}`;
  if (!/^\d{25}$/.test(folio)) throw new Error("El folio simulado no tiene 25 dígitos.");
  return folio;
}

function analizar(xml: string): { raiz: Record<string, NodoXml>; operacion: string; cuerpo: NodoXml } {
  let raiz: Record<string, NodoXml>;
  try {
    raiz = parsearXml(xml);
  } catch (e) {
    throw new FaultSimulador(e instanceof ErrorXml ? e.message.replace("La respuesta", "La petición") : "La petición no es XML válido.");
  }
  const body = buscarNodos(raiz, "Body")[0];
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new FaultSimulador("La petición no trae soapenv:Body.");
  const operacion = Object.keys(body).find((k) => !k.startsWith("@_") && k !== "#text");
  if (!operacion) throw new FaultSimulador("El Body de la petición está vacío.");
  return { raiz, operacion, cuerpo: (body as Record<string, NodoXml>)[operacion] };
}

/** Valida el UsernameToken y regresa el usuario (RFC). */
function autenticar(raiz: NodoXml): string {
  const token = buscarNodos(raiz, "UsernameToken")[0];
  const usuario = token !== undefined ? buscarTexto(token, ["Username"]) : null;
  const password = token !== undefined ? buscarTexto(token, ["Password"]) : null;
  if (!usuario || !password) throw new FaultSimulador("Falta el encabezado wsse:Security con UsernameToken (usuario y contraseña).");
  if (password !== passwordSimulador()) throw new FaultSimulador("Usuario o contraseña de servicios web incorrectos.");
  return usuario.toUpperCase();
}

function requerido(nodo: NodoXml, nombre: string): string {
  const valor = buscarTexto(nodo, [nombre]);
  if (!valor) throw new FaultSimulador(`Falta el dato ${nombre}.`);
  return valor;
}

type Firma = { certificado: string; cadenaOriginal: string; firma: string; rfcCertificado: string };

function validarFirma(nodo: NodoXml): Firma {
  const firmaElectronica = buscarNodos(nodo, "firmaElectronica")[0];
  if (firmaElectronica === undefined) throw new FaultSimulador("Falta firmaElectronica.");
  const certificado = requerido(firmaElectronica, "certificado");
  const cadenaOriginal = requerido(firmaElectronica, "cadenaOriginal");
  const firma = requerido(firmaElectronica, "firma");
  let rfcCertificado: string | null;
  try {
    rfcCertificado = leerCertificadoBase64(certificado).rfc;
  } catch {
    throw new FaultSimulador("El certificado no es válido.");
  }
  if (!rfcCertificado) throw new FaultSimulador("El certificado no contiene RFC (x500UniqueIdentifier).");
  if (!verificarFirma(certificado, cadenaOriginal, firma)) {
    throw new FaultSimulador("La firma electrónica no corresponde a la cadena original con el certificado enviado.");
  }
  return { certificado, cadenaOriginal, firma, rfcCertificado };
}

function sobreRespuesta(cuerpo: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><S:Envelope xmlns:S="${NS_SOAPENV}"><S:Body>${cuerpo}</S:Body></S:Envelope>`;
}

// ───────────────────────────── Digitalización ─────────────────────────────

function registrarDigitalizacion(raiz: NodoXml, cuerpo: NodoXml, ahora: number): RespuestaSimulador {
  autenticar(raiz);
  const correo = requerido(cuerpo, "correoElectronico");
  const documento = buscarNodos(cuerpo, "documento")[0];
  if (documento === undefined) throw new FaultSimulador("Falta el nodo documento.");
  const idTipoDocumento = requerido(documento, "idTipoDocumento");
  const nombreDocumento = requerido(documento, "nombreDocumento");
  const rfcConsulta = requerido(documento, "rfcConsulta");
  const archivoBase64 = requerido(documento, "archivo").replace(/\s+/g, "");
  const firma = validarFirma(cuerpo);

  const archivo = Buffer.from(archivoBase64, "base64");
  if (archivo.length === 0 || archivo.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new FaultSimulador("El archivo no es un PDF.");
  }
  const sha1 = createHash("sha1").update(archivo).digest("hex");
  const campos = firma.cadenaOriginal.split("|");
  if (campos[6] !== undefined && campos[6] !== sha1) {
    throw new FaultSimulador(`El SHA-1 de la cadena original no coincide con el del archivo (${sha1}).`);
  }
  const esperada = cadenaDigitalizacion({
    rfcFirmante: firma.rfcCertificado,
    correoElectronico: correo,
    idTipoDocumento,
    nombreDocumento,
    rfcConsulta,
    sha1,
  });
  if (esperada !== firma.cadenaOriginal) {
    throw new FaultSimulador(`La cadena original no corresponde a los datos enviados. Se esperaba ${esperada}`);
  }

  const simularError = /simular error/i.test(nombreDocumento);
  // Prefijo 9 = el simulador reportará error al consultar (funciona aunque se pierda la memoria).
  const numeroOperacion = `${simularError ? "9" : String(1 + (hash(`${esperada}${ahora}${Math.random()}`)[0] % 8))}${digitos(`${esperada}:${ahora}:${Math.random()}`, 9)}`;
  estado().operaciones.set(numeroOperacion, { registradoEn: ahora, error: simularError });

  return {
    status: 200,
    xml: sobreRespuesta(
      `<ns2:registroDigitalizarDocumentoServiceResponse xmlns="${NS_RESPUESTA}" xmlns:ns2="${NS_DIGITALIZAR}">` +
        `<ns2:respuestaBase><tieneError>false</tieneError></ns2:respuestaBase>` +
        elemento("ns2:numeroOperacion", numeroOperacion) +
        `</ns2:registroDigitalizarDocumentoServiceResponse>`,
    ),
  };
}

function consultarDigitalizacion(raiz: NodoXml, cuerpo: NodoXml, ahora: number, demoraMs: number): RespuestaSimulador {
  autenticar(raiz);
  const numeroOperacion = requerido(cuerpo, "numeroOperacion");
  if (!/^\d{1,20}$/.test(numeroOperacion)) throw new FaultSimulador("El número de operación debe ser numérico.");
  const registro = estado().operaciones.get(numeroOperacion);
  const respuesta = (interior: string) =>
    sobreRespuesta(
      `<ns2:consultaDigitalizarDocumentoServiceResponse xmlns="${NS_RESPUESTA}" xmlns:ns2="${NS_DIGITALIZAR}">${interior}</ns2:consultaDigitalizarDocumentoServiceResponse>`,
    );

  if (registro?.error || numeroOperacion.startsWith("9")) {
    return {
      status: 200,
      xml: respuesta(
        `<ns2:respuestaBase><tieneError>true</tieneError><error><mensaje>El documento no se pudo digitalizar (error simulado a petición: el nombre contiene "simular error").</mensaje></error></ns2:respuestaBase>`,
      ),
    };
  }
  if (registro && ahora - registro.registradoEn < demoraMs) {
    return { status: 200, xml: respuesta(`<ns2:respuestaBase><tieneError>false</tieneError></ns2:respuestaBase>`) };
  }
  const eDocument = eDocumentSimulado(numeroOperacion);
  const numeroDeTramite = numeroTramiteSimulado(numeroOperacion);
  return {
    status: 200,
    xml: respuesta(
      elemento("ns2:numeroDeTramite", numeroDeTramite) +
        elemento("ns2:eDocument", eDocument) +
        elemento("ns2:cadenaOriginal", `|${numeroDeTramite}|${eDocument}|`) +
        `<ns2:respuestaBase><tieneError>false</tieneError></ns2:respuestaBase>`,
    ),
  };
}

/** Atiende registro y consulta de digitalización (según el elemento del Body). */
export function procesarDigitalizacion(xml: string, opciones: { ahora?: number; demoraMs?: number } = {}): RespuestaSimulador {
  const ahora = opciones.ahora ?? Date.now();
  try {
    const { raiz, operacion, cuerpo } = analizar(xml);
    const op = operacion.toLowerCase();
    if (op === "registrodigitalizardocumentoservicerequest") return registrarDigitalizacion(raiz, cuerpo, ahora);
    if (op === "consultaedocumentdigitalizardocumento") {
      return consultarDigitalizacion(raiz, cuerpo, ahora, opciones.demoraMs ?? DEMORA_DIGITALIZACION_MS);
    }
    throw new FaultSimulador(`Operación no reconocida: ${operacion}.`);
  } catch (e) {
    if (e instanceof FaultSimulador) return fault(e);
    return fault(new FaultSimulador(e instanceof Error ? e.message : "Error interno del simulador.", "soapenv:Server"));
  }
}

// ───────────────────────────── Solicitud 260211 ─────────────────────────────

/**
 * Sin el payload no se puede recalcular la cadena original a partir del XML (su estructura aún
 * no está confirmada contra el XSD), así que se valida: UsernameToken, que la cadena inicie y
 * termine con "|", que la firma corresponda a esa cadena, que el RFC del certificado sea el del
 * UsernameToken o aparezca en la cadena (p. ej. el representante legal) y que rfcSolicitante,
 * si viene, sea el del UsernameToken.
 */
export function procesarSolicitud(xml: string, opciones: { ahora?: Date } = {}): RespuestaSimulador {
  const ahora = opciones.ahora ?? new Date();
  try {
    const { raiz, operacion, cuerpo } = analizar(xml);
    const usuario = autenticar(raiz);
    const firma = validarFirma(cuerpo);
    const cadena = firma.cadenaOriginal;
    if (cadena.length < 3 || !cadena.startsWith("|") || !cadena.endsWith("|")) {
      throw new FaultSimulador("La cadena original debe iniciar y terminar con «|».");
    }
    const campos = cadena.split("|");
    if (firma.rfcCertificado !== usuario && !campos.includes(firma.rfcCertificado)) {
      throw new FaultSimulador(
        `El RFC del certificado (${firma.rfcCertificado}) no es el del usuario (${usuario}) ni aparece en la cadena original.`,
      );
    }
    const rfcSolicitante = buscarTexto(cuerpo, ["rfcSolicitante"]);
    if (rfcSolicitante && rfcSolicitante.toUpperCase() !== usuario) {
      throw new FaultSimulador(`El RFC del solicitante (${rfcSolicitante}) no corresponde al usuario del UsernameToken (${usuario}).`);
    }
    if (rfcSolicitante && !campos.includes(rfcSolicitante.toUpperCase())) {
      throw new FaultSimulador("El RFC del solicitante no aparece en la cadena original firmada.");
    }

    const e = estado();
    e.consecutivo += 1;
    const folio = folioSimulado(ahora.getUTCFullYear(), e.consecutivo);
    return {
      status: 200,
      xml: sobreRespuesta(
        `<ns2:${operacion}Response xmlns="${NS_RESPUESTA}" xmlns:ns2="${NAMESPACE_260211_MANUAL}">` +
          `<respuestaBase><tieneError>false</tieneError><mensajes><mensaje>Solicitud recibida por el SIMULADOR (no es VUCEM; el folio no es oficial).</mensaje></mensajes></respuestaBase>` +
          elemento("ns2:folio", folio) +
          `</ns2:${operacion}Response>`,
      ),
    };
  } catch (e) {
    if (e instanceof FaultSimulador) return fault(e);
    return fault(new FaultSimulador(e instanceof Error ? e.message : "Error interno del simulador.", "soapenv:Server"));
  }
}

/** Atiende un POST del route handler: deshabilitado (404), demasiado grande (413) o procesado. */
export async function atenderPeticion(request: Request, procesar: (xml: string) => RespuestaSimulador): Promise<Response> {
  if (!simuladorHabilitado()) return new Response("No encontrado", { status: 404 });
  const longitud = Number(request.headers.get("content-length") ?? "0");
  if (longitud > MAX_BYTES_PETICION) return new Response("Petición demasiado grande", { status: 413 });
  const xml = await request.text();
  if (xml.length > MAX_BYTES_PETICION) return new Response("Petición demasiado grande", { status: 413 });
  return respuestaHttp(procesar(xml));
}

/** Respuesta HTTP del route handler. */
export function respuestaHttp(r: RespuestaSimulador): Response {
  return new Response(r.xml, {
    status: r.status,
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}
