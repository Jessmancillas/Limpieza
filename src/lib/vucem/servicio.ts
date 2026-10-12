import "server-only";

import type { Documento, Empresa } from "@/generated/prisma/client";
import { registrarBitacora } from "@/lib/bitacora";
import type { AmbienteVucem } from "@/lib/constantes";
import { sha1Hex } from "@/lib/crypto";
import { db } from "@/lib/db";
import { ErrorFirma, estadoVigencia, leerCertificadoBase64, verificarFirma } from "@/lib/firma/firmar";
import { ESTADOS_NO_EDITABLES, cargarSolicitudCompleta, type SolicitudCompleta } from "@/lib/solicitudes/consultas";
import { validarSolicitud } from "@/lib/solicitudes/validacion";
import { leerArchivo, rutaEsDeEmpresa } from "@/lib/storage";

import { ErrorEnvioVucem, enviarSoap } from "./cliente";
import type { ConfiguracionVucemEfectiva } from "./configuracion";
import { obtenerCredencial } from "./credenciales";
import {
  SOAP_ACTION_CONSULTA,
  SOAP_ACTION_REGISTRO,
  cadenaDigitalizacion,
  omitirArchivo,
  parsearRespuestaConsulta,
  parsearRespuestaRegistro,
  xmlConsulta,
  xmlRegistro,
} from "./digitalizacion";
import { passwordSimulador } from "./simulador";
import { construirCadenaOriginal260211, construirPayload260211, construirXml260211, parsearRespuestaSolicitud } from "./solicitud-260211";
import { redactarPassword } from "./soap";

// Orquestación (solo servidor) de la digitalización de anexos y del envío del WS 260211:
// recalcula en el servidor lo que el usuario firmó en su navegador, verifica la firma, arma el
// XML, envía y deja constancia en EnvioVucem (XML sin contraseña) y en la bitácora.

export class ErrorVucem extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorVucem";
  }
}

export type Credencial = { usuarioWs: string; password: string };

/** Tras este tiempo, un registro que quedó "PENDIENTE" sin número de operación se puede reintentar. */
const MS_REINTENTO_SIN_OPERACION = 5 * 60_000;
/** Límite para guardar respuestas en la bitácora de envíos. */
const MAX_RESPUESTA_GUARDADA = 200_000;

function recortarRespuesta(xml: string | null): string | null {
  if (xml === null) return null;
  return xml.length > MAX_RESPUESTA_GUARDADA ? `${xml.slice(0, MAX_RESPUESTA_GUARDADA)}\n<!-- respuesta recortada -->` : xml;
}

/** Credencial para el UsernameToken. En SIMULADOR, si no hay, se usa la del simulador. */
export async function credencialParaEnvio(empresa: Pick<Empresa, "id" | "rfc">, ambiente: AmbienteVucem): Promise<Credencial> {
  const credencial = await obtenerCredencial(empresa.id);
  if (credencial) return credencial;
  if (ambiente === "SIMULADOR") return { usuarioWs: empresa.rfc, password: passwordSimulador() };
  throw new ErrorVucem(
    "Falta la contraseña de servicios web de VUCEM. Un administrador debe capturarla en Configuración → Conexión VUCEM.",
  );
}

// ───────────────────────────── Digitalización ─────────────────────────────

type DocumentoDigitalizable = Pick<
  Documento,
  "eDocument" | "archivoVucemRuta" | "estadoConversion" | "idTipoDocumentoVucem" | "estadoEDocument" | "numeroOperacionEDoc" | "actualizadoEn"
>;

/** null si el documento se puede enviar a digitalizar; si no, el motivo. */
export function motivoNoDigitalizable(doc: DocumentoDigitalizable, ahora: Date = new Date()): string | null {
  if (doc.eDocument) return "Ya tiene eDocument.";
  if (!doc.archivoVucemRuta || (doc.estadoConversion !== "OK" && doc.estadoConversion !== "ADVERTENCIA")) {
    return "Falta el PDF convertido al formato de VUCEM.";
  }
  if (!doc.idTipoDocumentoVucem) return "Falta elegir el tipo de documento VUCEM.";
  if (doc.estadoEDocument === "PENDIENTE") {
    if (doc.numeroOperacionEDoc) return "VUCEM lo está procesando: consulta su estado.";
    if (ahora.getTime() - doc.actualizadoEn.getTime() < MS_REINTENTO_SIN_OPERACION) return "Se está enviando.";
  }
  return null;
}

async function leerPdfVucem(empresaId: string, doc: Pick<Documento, "id" | "archivoVucemRuta">): Promise<Buffer> {
  if (!doc.archivoVucemRuta || !rutaEsDeEmpresa(doc.archivoVucemRuta, empresaId)) {
    throw new ErrorVucem("El documento no tiene un PDF de VUCEM válido.");
  }
  try {
    return await leerArchivo(doc.archivoVucemRuta);
  } catch {
    throw new ErrorVucem("No se encontró el PDF convertido en el almacenamiento: vuelve a convertir el documento.");
  }
}

type DatosCadenaDoc = {
  empresa: Pick<Empresa, "id" | "rfc">;
  documento: Pick<Documento, "id" | "nombre" | "idTipoDocumentoVucem" | "archivoVucemRuta">;
  rfcFirmante: string;
  correo: string;
};

/** Cadena original de digitalización calculada con el PDF tal como está guardado. */
export async function cadenaDeDocumento(d: DatosCadenaDoc): Promise<{ cadena: string; pdf: Buffer }> {
  if (!d.documento.idTipoDocumentoVucem) throw new ErrorVucem("Falta el tipo de documento VUCEM.");
  const pdf = await leerPdfVucem(d.empresa.id, d.documento);
  const cadena = cadenaDigitalizacion({
    rfcFirmante: d.rfcFirmante,
    correoElectronico: d.correo,
    idTipoDocumento: d.documento.idTipoDocumentoVucem,
    nombreDocumento: d.documento.nombre,
    rfcConsulta: d.empresa.rfc,
    sha1: sha1Hex(pdf),
  });
  return { cadena, pdf };
}

export type ResultadoDocumento = { documentoId: string; ok: boolean; mensaje: string };

/**
 * Envía el registro de digitalización de un documento ya firmado. Exige que la cadena firmada sea
 * idéntica a la que se recalcula en el servidor y que la firma sea válida.
 */
export async function registrarDigitalizacion(p: {
  empresa: Pick<Empresa, "id" | "rfc">;
  documentoId: string;
  certificadoBase64: string;
  cadenaFirmada: string;
  firma: string;
  config: ConfiguracionVucemEfectiva;
  credencial: Credencial;
  usuarioId: string;
  solicitudId?: string | null;
}): Promise<ResultadoDocumento> {
  const { empresa, config } = p;
  const doc = await db.documento.findFirst({ where: { id: p.documentoId, empresaId: empresa.id } });
  if (!doc) return { documentoId: p.documentoId, ok: false, mensaje: "El documento no existe o no es de esta empresa." };
  const motivo = motivoNoDigitalizable(doc);
  if (motivo) return { documentoId: doc.id, ok: false, mensaje: motivo };
  if (!config.urlDigitalizacion) return { documentoId: doc.id, ok: false, mensaje: "Falta configurar la URL del servicio de digitalización." };

  let rfcFirmante: string;
  try {
    const cert = leerCertificadoBase64(p.certificadoBase64);
    if (!cert.rfc) throw new ErrorVucem("El certificado no contiene RFC: usa el .cer de tu e.firma.");
    if (estadoVigencia(cert) !== "VIGENTE") throw new ErrorVucem("El certificado de la e.firma no está vigente.");
    rfcFirmante = cert.rfc;
  } catch (e) {
    if (e instanceof ErrorVucem || e instanceof ErrorFirma) return { documentoId: doc.id, ok: false, mensaje: e.message };
    throw e;
  }

  let cadena: string;
  let pdf: Buffer;
  try {
    ({ cadena, pdf } = await cadenaDeDocumento({ empresa, documento: doc, rfcFirmante, correo: config.correoDigitalizacion }));
  } catch (e) {
    if (e instanceof ErrorVucem) return { documentoId: doc.id, ok: false, mensaje: e.message };
    throw e;
  }
  if (cadena !== p.cadenaFirmada) {
    return {
      documentoId: doc.id,
      ok: false,
      mensaje: "Los datos del documento cambiaron desde que se prepararon las cadenas. Vuelve a cargar tu e.firma y firma de nuevo.",
    };
  }
  if (!verificarFirma(p.certificadoBase64, cadena, p.firma)) {
    return { documentoId: doc.id, ok: false, mensaje: "La firma no corresponde a la cadena original con ese certificado." };
  }

  // Se "aparta" el documento para que un doble clic no lo envíe dos veces.
  const apartado = await db.documento.updateMany({
    where: {
      id: doc.id,
      empresaId: empresa.id,
      eDocument: null,
      OR: [
        { estadoEDocument: { in: ["NO_ENVIADO", "ERROR"] } },
        { estadoEDocument: "PENDIENTE", numeroOperacionEDoc: null, actualizadoEn: { lt: new Date(Date.now() - MS_REINTENTO_SIN_OPERACION) } },
      ],
    },
    data: { estadoEDocument: "PENDIENTE", numeroOperacionEDoc: null, errorEDocument: null },
  });
  if (apartado.count === 0) return { documentoId: doc.id, ok: false, mensaje: "El documento ya se está enviando." };

  const xml = xmlRegistro({
    usuario: p.credencial.usuarioWs,
    password: p.credencial.password,
    correoElectronico: config.correoDigitalizacion,
    idTipoDocumento: doc.idTipoDocumentoVucem ?? "",
    nombreDocumento: doc.nombre,
    rfcConsulta: empresa.rfc,
    archivoBase64: pdf.toString("base64"),
    certificadoBase64: p.certificadoBase64,
    cadenaOriginal: cadena,
    firma: p.firma,
  });

  let httpStatus: number | null = null;
  let cuerpo: string | null = null;
  let resultado: { ok: true; numeroOperacion: string } | { ok: false; mensaje: string };
  try {
    const r = await enviarSoap(config.urlDigitalizacion, xml, SOAP_ACTION_REGISTRO, { ambiente: config.ambiente });
    httpStatus = r.httpStatus;
    cuerpo = r.cuerpo;
    const leido = parsearRespuestaRegistro(r.cuerpo);
    resultado = leido.ok ? leido : { ok: false, mensaje: `${leido.mensaje}${r.httpStatus >= 400 ? ` (HTTP ${r.httpStatus})` : ""}` };
  } catch (e) {
    if (!(e instanceof ErrorEnvioVucem)) throw e;
    resultado = { ok: false, mensaje: e.message };
  }

  await db.documento.update({
    where: { id: doc.id },
    data: resultado.ok
      ? { estadoEDocument: "PENDIENTE", numeroOperacionEDoc: resultado.numeroOperacion, errorEDocument: null }
      : { estadoEDocument: "ERROR", errorEDocument: resultado.mensaje.slice(0, 1000) },
  });
  await db.envioVucem.create({
    data: {
      empresaId: empresa.id,
      solicitudId: p.solicitudId ?? null,
      documentoId: doc.id,
      tipo: "DIGITALIZACION_REGISTRO",
      ambiente: config.ambiente,
      url: config.urlDigitalizacion,
      cadenaOriginal: cadena,
      requestXml: redactarPassword(omitirArchivo(xml)),
      responseXml: recortarRespuesta(cuerpo === null ? null : redactarPassword(cuerpo)),
      httpStatus,
      exito: resultado.ok,
      mensaje: resultado.ok ? "Documento recibido; VUCEM lo está procesando." : resultado.mensaje.slice(0, 1000),
      resultado: resultado.ok ? resultado.numeroOperacion : null,
      creadoPorId: p.usuarioId,
    },
  });
  await registrarBitacora({
    empresaId: empresa.id,
    usuarioId: p.usuarioId,
    accion: "DIGITALIZAR",
    entidad: "Documento",
    entidadId: doc.id,
    detalle: {
      ambiente: config.ambiente,
      exito: resultado.ok,
      ...(resultado.ok ? { numeroOperacion: resultado.numeroOperacion } : { error: resultado.mensaje.slice(0, 200) }),
      rfcFirmante,
      ...(p.solicitudId ? { solicitudId: p.solicitudId } : {}),
    },
  });

  return resultado.ok
    ? { documentoId: doc.id, ok: true, mensaje: `Enviado. Número de operación ${resultado.numeroOperacion}.` }
    : { documentoId: doc.id, ok: false, mensaje: resultado.mensaje };
}

export type ResultadoConsultaDoc = { documentoId: string; estado: "OK" | "PENDIENTE" | "ERROR"; mensaje: string };

/** Consulta el eDocument de un documento PENDIENTE con número de operación. */
export async function consultarDigitalizacion(p: {
  empresa: Pick<Empresa, "id">;
  documento: Pick<Documento, "id" | "numeroOperacionEDoc">;
  config: ConfiguracionVucemEfectiva;
  credencial: Credencial;
  usuarioId: string;
  solicitudId?: string | null;
}): Promise<ResultadoConsultaDoc> {
  const { config, documento } = p;
  if (!documento.numeroOperacionEDoc) return { documentoId: documento.id, estado: "ERROR", mensaje: "No tiene número de operación." };
  if (!config.urlDigitalizacion) {
    return { documentoId: documento.id, estado: "PENDIENTE", mensaje: "Falta configurar la URL del servicio de digitalización." };
  }
  const xml = xmlConsulta({ usuario: p.credencial.usuarioWs, password: p.credencial.password, numeroOperacion: documento.numeroOperacionEDoc });

  let httpStatus: number | null = null;
  let cuerpo: string | null = null;
  let resultado: ReturnType<typeof parsearRespuestaConsulta>;
  let errorRed = false;
  try {
    const r = await enviarSoap(config.urlDigitalizacion, xml, SOAP_ACTION_CONSULTA, { ambiente: config.ambiente });
    httpStatus = r.httpStatus;
    cuerpo = r.cuerpo;
    resultado = parsearRespuestaConsulta(r.cuerpo);
  } catch (e) {
    if (!(e instanceof ErrorEnvioVucem)) throw e;
    errorRed = true;
    resultado = { estado: "ERROR", mensaje: e.message };
  }

  // Un error de red no cambia el estado: el documento sigue en proceso en VUCEM.
  if (!errorRed && resultado.estado === "OK") {
    await db.documento.updateMany({
      where: { id: documento.id, empresaId: p.empresa.id, numeroOperacionEDoc: documento.numeroOperacionEDoc },
      data: {
        estadoEDocument: "OK",
        eDocument: resultado.eDocument,
        numeroTramiteEDoc: resultado.numeroDeTramite,
        eDocumentFecha: new Date(),
        errorEDocument: null,
      },
    });
  } else if (!errorRed && resultado.estado === "ERROR") {
    await db.documento.updateMany({
      where: { id: documento.id, empresaId: p.empresa.id, numeroOperacionEDoc: documento.numeroOperacionEDoc },
      data: { estadoEDocument: "ERROR", errorEDocument: resultado.mensaje.slice(0, 1000) },
    });
  }

  // Las consultas "en proceso" no se registran (el sondeo automático generaría decenas).
  if (resultado.estado !== "PENDIENTE") {
    await db.envioVucem.create({
      data: {
        empresaId: p.empresa.id,
        solicitudId: p.solicitudId ?? null,
        documentoId: documento.id,
        tipo: "DIGITALIZACION_CONSULTA",
        ambiente: config.ambiente,
        url: config.urlDigitalizacion,
        cadenaOriginal: resultado.estado === "OK" ? resultado.cadenaOriginal : null,
        requestXml: redactarPassword(xml),
        responseXml: recortarRespuesta(cuerpo === null ? null : redactarPassword(cuerpo)),
        httpStatus,
        exito: resultado.estado === "OK",
        mensaje: resultado.estado === "OK" ? `eDocument ${resultado.eDocument}` : resultado.mensaje.slice(0, 1000),
        resultado: resultado.estado === "OK" ? resultado.eDocument : null,
        creadoPorId: p.usuarioId,
      },
    });
  }
  if (!errorRed && resultado.estado !== "PENDIENTE") {
    await registrarBitacora({
      empresaId: p.empresa.id,
      usuarioId: p.usuarioId,
      accion: resultado.estado === "OK" ? "EDOCUMENT_OBTENIDO" : "EDOCUMENT_ERROR",
      entidad: "Documento",
      entidadId: documento.id,
      detalle:
        resultado.estado === "OK"
          ? { eDocument: resultado.eDocument, numeroOperacion: documento.numeroOperacionEDoc }
          : { error: resultado.mensaje.slice(0, 200), numeroOperacion: documento.numeroOperacionEDoc },
    });
  }

  if (resultado.estado === "OK") return { documentoId: documento.id, estado: "OK", mensaje: `eDocument ${resultado.eDocument}` };
  if (resultado.estado === "PENDIENTE") return { documentoId: documento.id, estado: "PENDIENTE", mensaje: resultado.mensaje ?? "En proceso en VUCEM." };
  return { documentoId: documento.id, estado: errorRed ? "PENDIENTE" : "ERROR", mensaje: resultado.mensaje };
}

// ───────────────────────────── Solicitud 260211 ─────────────────────────────

const enviosEnCurso = ((globalThis as { __enviosVucemEnCurso?: Set<string> }).__enviosVucemEnCurso ??= new Set<string>());

/** Motivos que impiden enviar la solicitud por WS (sin contar la firma). */
export function bloqueosEnvio(sol: SolicitudCompleta, config: ConfiguracionVucemEfectiva, hoy: Date = new Date()): string[] {
  const bloqueos: string[] = [];
  if (sol.folioVucem) bloqueos.push(`La solicitud ya fue presentada con folio ${sol.folioVucem}.`);
  else if (ESTADOS_NO_EDITABLES.has(sol.estado)) bloqueos.push("La solicitud ya no se puede enviar en su estado actual.");
  const validacion = validarSolicitud(sol, { canal: "WS", hoy });
  if (validacion.errores.length > 0) bloqueos.push(`La solicitud tiene ${validacion.errores.length} error(es) de captura por corregir.`);
  const sinEDocument = sol.documentos.filter((sd) => !sd.documento.eDocument);
  if (sinEDocument.length > 0) bloqueos.push(`Faltan ${sinEDocument.length} documento(s) por digitalizar (eDocument).`);
  if (sol.documentos.length === 0) bloqueos.push("La solicitud no tiene documentos anexos.");
  for (const falta of config.faltantesSolicitud) bloqueos.push(`Falta configurar ${falta} (Configuración → Conexión VUCEM).`);
  return bloqueos;
}

/** Envío previo aceptado por VUCEM que no trajo folio (posible duplicado si se reenvía). */
export function envioPrevioSinFolio(sol: SolicitudCompleta) {
  return sol.envios.find((e) => e.tipo === "SOLICITUD_260211" && e.exito) ?? null;
}

export type ResultadoEnvioSolicitud = { ok: boolean; mensaje: string; detalles?: string[]; folio?: string };

export async function enviarSolicitud260211(p: {
  empresaId: string;
  usuarioId: string;
  solicitudId: string;
  certificadoBase64: string;
  cadenaOriginal: string;
  firma: string;
  confirmarReenvio: boolean;
  config: ConfiguracionVucemEfectiva;
}): Promise<ResultadoEnvioSolicitud> {
  if (enviosEnCurso.has(p.solicitudId)) return { ok: false, mensaje: "Esta solicitud ya se está enviando. Espera la respuesta." };
  enviosEnCurso.add(p.solicitudId);
  try {
    return await enviarSolicitudInterno(p);
  } finally {
    enviosEnCurso.delete(p.solicitudId);
  }
}

async function enviarSolicitudInterno(p: Parameters<typeof enviarSolicitud260211>[0]): Promise<ResultadoEnvioSolicitud> {
  const { config } = p;
  const sol = await cargarSolicitudCompleta(p.empresaId, p.solicitudId);
  if (!sol) return { ok: false, mensaje: "La solicitud no existe o no pertenece a la empresa activa." };

  const bloqueos = bloqueosEnvio(sol, config);
  if (bloqueos.length > 0) return { ok: false, mensaje: "No se puede enviar todavía.", detalles: bloqueos };
  if (envioPrevioSinFolio(sol) && !p.confirmarReenvio) {
    return {
      ok: false,
      mensaje:
        "Ya hubo un envío que VUCEM aceptó sin regresar folio. Revisa en el portal que no se haya registrado antes de volver a enviar y confirma el reenvío.",
    };
  }

  // La cadena se recalcula aquí: debe ser IDÉNTICA a la que el usuario firmó.
  const payload = construirPayload260211(sol);
  const cadena = construirCadenaOriginal260211(payload, sol.empresa);
  if (cadena !== p.cadenaOriginal) {
    return { ok: false, mensaje: "La solicitud cambió desde que se mostró la cadena original. Recarga la página y firma de nuevo." };
  }
  if (!verificarFirma(p.certificadoBase64, cadena, p.firma)) {
    return { ok: false, mensaje: "La firma no corresponde a la cadena original con ese certificado." };
  }
  let cert: ReturnType<typeof leerCertificadoBase64>;
  try {
    cert = leerCertificadoBase64(p.certificadoBase64);
  } catch (e) {
    if (e instanceof ErrorFirma) return { ok: false, mensaje: e.message };
    throw e;
  }
  if (!cert.rfc) return { ok: false, mensaje: "El certificado no contiene RFC: usa el .cer de tu e.firma." };
  if (estadoVigencia(cert) !== "VIGENTE") return { ok: false, mensaje: "El certificado de la e.firma no está vigente." };

  let credencial: Credencial;
  try {
    credencial = await credencialParaEnvio(sol.empresa, config.ambiente);
  } catch (e) {
    if (e instanceof ErrorVucem) return { ok: false, mensaje: e.message };
    throw e;
  }
  const url = config.urlSolicitud as string;
  const xml = construirXml260211(
    payload,
    { certificadoBase64: p.certificadoBase64, cadenaOriginal: cadena, firma: p.firma },
    {
      operacion: config.operacionSolicitud as string,
      namespace: config.namespaceSolicitud,
      usuario: credencial.usuarioWs,
      password: credencial.password,
      soapAction: config.soapActionSolicitud,
      url,
    },
  );

  let httpStatus: number | null = null;
  let cuerpo: string | null = null;
  let respuesta: ReturnType<typeof parsearRespuestaSolicitud>;
  try {
    const r = await enviarSoap(url, xml, config.soapActionSolicitud, { ambiente: config.ambiente });
    httpStatus = r.httpStatus;
    cuerpo = r.cuerpo;
    respuesta = parsearRespuestaSolicitud(r.cuerpo);
    if (respuesta.exito && (r.httpStatus < 200 || r.httpStatus >= 300)) {
      respuesta = { ...respuesta, exito: false, mensajes: [...respuesta.mensajes, `HTTP ${r.httpStatus}`] };
    }
  } catch (e) {
    if (!(e instanceof ErrorEnvioVucem)) throw e;
    respuesta = { exito: false, mensajes: [e.message] };
  }

  const folio = respuesta.exito ? respuesta.folio : undefined;
  const mensajeVucem = respuesta.mensajes.join(" · ");
  await db.envioVucem.create({
    data: {
      empresaId: p.empresaId,
      solicitudId: sol.id,
      tipo: "SOLICITUD_260211",
      ambiente: config.ambiente,
      url,
      cadenaOriginal: cadena,
      requestXml: redactarPassword(xml),
      responseXml: recortarRespuesta(cuerpo === null ? null : redactarPassword(cuerpo)),
      httpStatus,
      exito: respuesta.exito,
      mensaje: (mensajeVucem || (respuesta.exito ? "Aceptada por VUCEM." : "VUCEM rechazó la solicitud.")).slice(0, 1000),
      resultado: folio ?? respuesta.numeroSolicitud ?? null,
      creadoPorId: p.usuarioId,
    },
  });

  if (folio) {
    await db.solicitud.updateMany({
      where: { id: sol.id, empresaId: p.empresaId, folioVucem: null },
      data: {
        estado: "PRESENTADA",
        canalPresentacion: "WS",
        folioVucem: folio,
        fechaPresentacion: new Date(),
        ...(respuesta.numeroSolicitud ? { numeroTemporal: respuesta.numeroSolicitud } : {}),
      },
    });
  } else if (respuesta.exito && respuesta.numeroSolicitud) {
    await db.solicitud.updateMany({
      where: { id: sol.id, empresaId: p.empresaId },
      data: { numeroTemporal: respuesta.numeroSolicitud },
    });
  }

  await registrarBitacora({
    empresaId: p.empresaId,
    usuarioId: p.usuarioId,
    accion: "ENVIAR_VUCEM",
    entidad: "Solicitud",
    entidadId: sol.id,
    detalle: {
      ambiente: config.ambiente,
      exito: respuesta.exito,
      ...(folio ? { folio } : {}),
      ...(respuesta.numeroSolicitud ? { numeroSolicitud: respuesta.numeroSolicitud } : {}),
      httpStatus,
      rfcFirmante: cert.rfc,
      numeroSerieCertificado: cert.numeroSerie,
      ...(respuesta.exito ? {} : { error: mensajeVucem.slice(0, 200) }),
    },
  });

  if (folio) {
    const aviso = /^\d{25}$/.test(folio) ? "" : " (el folio no tiene 25 dígitos: verifícalo en el portal)";
    return {
      ok: true,
      folio,
      mensaje: `Solicitud presentada${config.ambiente === "SIMULADOR" ? " en el SIMULADOR" : ""}. Folio ${folio}${aviso}.`,
      detalles: respuesta.mensajes,
    };
  }
  if (respuesta.exito) {
    return {
      ok: false,
      mensaje:
        "VUCEM aceptó la petición pero la respuesta no trae un folio reconocible. Revisa la respuesta XML en el historial y el portal de VUCEM antes de volver a enviar.",
      detalles: respuesta.mensajes,
    };
  }
  return { ok: false, mensaje: "VUCEM no aceptó la solicitud.", detalles: respuesta.mensajes };
}
