"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { validarClavesCatalogo } from "@/app/(app)/establecimientos/_compartido/servidor";
import { ErrorPermiso, exigirEdicion, obtenerContexto, type Contexto } from "@/lib/auth/contexto";
import { registrarBitacora } from "@/lib/bitacora";
import { db } from "@/lib/db";
import { ErrorFirma, estadoVigencia, leerCertificadoBase64 } from "@/lib/firma/firmar";
import { erroresDeZod, formDataAObjeto, type EstadoFormulario } from "@/lib/formularios";
import { obtenerConfiguracionVucem } from "@/lib/vucem/configuracion";
import {
  ErrorVucem,
  cadenaDeDocumento,
  consultarDigitalizacion,
  credencialParaEnvio,
  descartarEDocument,
  eDocumentsDeOtroAmbiente,
  enviarSolicitud260211,
  motivoNoDigitalizable,
  registrarDigitalizacion,
} from "@/lib/vucem/servicio";

import type {
  CadenaDocumento,
  ResultadoConsultaEstado,
  ResultadoDigitalizacion,
  ResultadoEnvio,
  ResultadoPorDocumento,
  ResultadoPreparacion,
} from "./tipos";

// Server actions del envío por servicio web. Todas verifican sesión, empresa activa y permiso
// de edición; la contraseña de servicios web nunca sale del servidor.

const zId = z.string().trim().min(1).max(64);
const zBase64 = z
  .string()
  .max(20_000)
  .regex(/^[A-Za-z0-9+/=\s]+$/, "No es base64");
const zCadena = z.string().min(3).max(200_000);
const MAX_DOCUMENTOS = 50;

function rutas(solicitudId: string) {
  revalidatePath(`/solicitudes/${solicitudId}/vucem`);
  revalidatePath(`/solicitudes/${solicitudId}`);
}

type Acceso = { ctx: Contexto } | { error: string };

async function acceso(solicitudId: unknown): Promise<Acceso> {
  const id = zId.safeParse(solicitudId);
  if (!id.success) return { error: "Solicitud inválida." };
  const ctx = await obtenerContexto();
  try {
    exigirEdicion(ctx);
  } catch (e) {
    if (e instanceof ErrorPermiso) return { error: e.message };
    throw e;
  }
  const sol = await db.solicitud.findFirst({ where: { id: id.data, empresaId: ctx.empresa.id }, select: { id: true } });
  if (!sol) return { error: "La solicitud no existe o no pertenece a la empresa activa." };
  return { ctx };
}

/** Documentos ligados a la solicitud y de la empresa activa. */
async function documentosDeSolicitud(solicitudId: string, empresaId: string) {
  const ligas = await db.solicitudDocumento.findMany({
    where: { solicitudId, solicitud: { empresaId }, documento: { empresaId } },
    include: { documento: true },
    orderBy: { id: "asc" },
  });
  return ligas.map((l) => l.documento);
}

/**
 * Paso 1a: con el certificado ya cargado en el navegador, arma las cadenas a firmar (empiezan con
 * el RFC del firmante, que se toma del certificado).
 */
export async function prepararDigitalizacion(solicitudId: string, certificadoBase64: string): Promise<ResultadoPreparacion> {
  const a = await acceso(solicitudId);
  if ("error" in a) return { ok: false, mensaje: a.error };
  const { ctx } = a;
  const cert64 = zBase64.safeParse(certificadoBase64);
  if (!cert64.success) return { ok: false, mensaje: "Certificado inválido." };

  let rfcFirmante: string;
  try {
    const cert = leerCertificadoBase64(cert64.data);
    if (!cert.rfc) return { ok: false, mensaje: "El certificado no contiene RFC: usa el .cer de tu e.firma." };
    if (estadoVigencia(cert) !== "VIGENTE") return { ok: false, mensaje: "El certificado de la e.firma no está vigente." };
    rfcFirmante = cert.rfc;
  } catch (e) {
    if (e instanceof ErrorFirma) return { ok: false, mensaje: e.message };
    throw e;
  }

  const config = await obtenerConfiguracionVucem(ctx.empresa.id);
  if (config.faltantesDigitalizacion.length > 0) {
    return { ok: false, mensaje: `Falta configurar ${config.faltantesDigitalizacion.join(" y ")} (Configuración → Conexión VUCEM).` };
  }

  const documentos: CadenaDocumento[] = [];
  const omitidos: Array<{ nombre: string; motivo: string }> = [];
  for (const doc of await documentosDeSolicitud(solicitudId, ctx.empresa.id)) {
    if (doc.eDocument) continue;
    const motivo = motivoNoDigitalizable(doc);
    if (motivo) {
      omitidos.push({ nombre: doc.nombre, motivo });
      continue;
    }
    try {
      const { cadena } = await cadenaDeDocumento({ empresa: ctx.empresa, documento: doc, rfcFirmante, correo: config.correoDigitalizacion });
      documentos.push({ documentoId: doc.id, nombre: doc.nombre, cadena });
    } catch (e) {
      if (e instanceof ErrorVucem) omitidos.push({ nombre: doc.nombre, motivo: e.message });
      else throw e;
    }
    if (documentos.length >= MAX_DOCUMENTOS) break;
  }
  return { ok: true, rfcFirmante, documentos, omitidos };
}

const esquemaFirmasDigitalizacion = z.object({
  certificadoBase64: zBase64,
  firmas: z
    .array(z.object({ documentoId: zId, cadena: zCadena, firma: zBase64 }))
    .min(1, "No hay documentos firmados.")
    .max(MAX_DOCUMENTOS),
});

/** Paso 1b: recibe las firmas y envía cada registro de digitalización. */
export async function enviarDigitalizacion(
  solicitudId: string,
  datos: { certificadoBase64: string; firmas: Array<{ documentoId: string; cadena: string; firma: string }> },
): Promise<ResultadoDigitalizacion> {
  const a = await acceso(solicitudId);
  if ("error" in a) return { ok: false, mensaje: a.error, resultados: [] };
  const { ctx } = a;
  const r = esquemaFirmasDigitalizacion.safeParse(datos);
  if (!r.success) return { ok: false, mensaje: "Datos de firma inválidos.", resultados: [] };

  const documentos = await documentosDeSolicitud(solicitudId, ctx.empresa.id);
  const nombres = new Map(documentos.map((d) => [d.id, d.nombre]));
  const config = await obtenerConfiguracionVucem(ctx.empresa.id);
  if (config.faltantesDigitalizacion.length > 0) {
    return { ok: false, mensaje: `Falta configurar ${config.faltantesDigitalizacion.join(" y ")}.`, resultados: [] };
  }
  let credencial;
  try {
    credencial = await credencialParaEnvio(ctx.empresa, config.ambiente);
  } catch (e) {
    if (e instanceof ErrorVucem) return { ok: false, mensaje: e.message, resultados: [] };
    throw e;
  }

  const resultados: ResultadoPorDocumento[] = [];
  const vistos = new Set<string>();
  for (const f of r.data.firmas) {
    const nombre = nombres.get(f.documentoId);
    if (!nombre || vistos.has(f.documentoId)) {
      resultados.push({ documentoId: f.documentoId, nombre: nombre ?? "Documento", ok: false, mensaje: "El documento no está ligado a esta solicitud." });
      continue;
    }
    vistos.add(f.documentoId);
    const res = await registrarDigitalizacion({
      empresa: ctx.empresa,
      documentoId: f.documentoId,
      certificadoBase64: r.data.certificadoBase64,
      cadenaFirmada: f.cadena,
      firma: f.firma,
      config,
      credencial,
      usuarioId: ctx.usuario.id,
      solicitudId,
    });
    resultados.push({ ...res, nombre });
  }
  rutas(solicitudId);
  const enviados = resultados.filter((x) => x.ok).length;
  return {
    ok: enviados === resultados.length,
    mensaje:
      enviados === resultados.length
        ? `Se enviaron ${enviados} documento(s) a digitalizar. VUCEM los procesa en unos segundos o minutos.`
        : `Se enviaron ${enviados} de ${resultados.length} documento(s).`,
    resultados,
  };
}

/** Consulta el estado de los documentos en proceso (botón y sondeo automático). */
export async function consultarEstadoDigitalizacion(solicitudId: string): Promise<ResultadoConsultaEstado> {
  const a = await acceso(solicitudId);
  if ("error" in a) return { ok: false, mensaje: a.error, pendientes: 0, resultados: [] };
  const { ctx } = a;
  const enProceso = (await documentosDeSolicitud(solicitudId, ctx.empresa.id)).filter(
    (d) => d.estadoEDocument === "PENDIENTE" && d.numeroOperacionEDoc && !d.eDocument,
  );
  if (enProceso.length === 0) return { ok: true, mensaje: "No hay documentos en proceso.", pendientes: 0, resultados: [] };

  const config = await obtenerConfiguracionVucem(ctx.empresa.id);
  let credencial;
  try {
    credencial = await credencialParaEnvio(ctx.empresa, config.ambiente);
  } catch (e) {
    if (e instanceof ErrorVucem) return { ok: false, mensaje: e.message, pendientes: enProceso.length, resultados: [] };
    throw e;
  }

  const resultados: ResultadoPorDocumento[] = [];
  let pendientes = 0;
  for (const doc of enProceso) {
    const res = await consultarDigitalizacion({
      empresa: ctx.empresa,
      documento: doc,
      config,
      credencial,
      usuarioId: ctx.usuario.id,
      solicitudId,
    });
    if (res.estado === "PENDIENTE") pendientes++;
    resultados.push({ documentoId: doc.id, nombre: doc.nombre, ok: res.estado === "OK", mensaje: res.mensaje });
  }
  if (pendientes < enProceso.length) rutas(solicitudId);
  const listos = resultados.filter((x) => x.ok).length;
  return {
    ok: true,
    mensaje:
      pendientes === 0
        ? `Consulta terminada: ${listos} con eDocument${listos < resultados.length ? `, ${resultados.length - listos} con error` : ""}.`
        : `${pendientes} documento(s) siguen en proceso en VUCEM.`,
    pendientes,
    resultados,
  };
}

const esquemaTipoDocumento = z.object({
  solicitudId: zId,
  documentoId: zId,
  idTipoDocumentoVucem: z
    .string({ error: "Elige el tipo de documento" })
    .trim()
    .min(1, "Elige el tipo de documento")
    .max(20, "Máximo 20 caracteres")
    .regex(/^[A-Za-z0-9._-]+$/, "Clave inválida"),
});

/** Guarda el idTipoDocumento (CAT_TIPO_DOCUMENTO) de un anexo que aún no se digitaliza. */
export async function guardarTipoDocumentoVucem(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const valores = formDataAObjeto(formData);
  const r = esquemaTipoDocumento.safeParse(valores);
  if (!r.success) return { ok: false, errores: erroresDeZod(r.error), valores };
  const a = await acceso(r.data.solicitudId);
  if ("error" in a) return { ok: false, mensaje: a.error, valores };
  const { ctx } = a;

  const liga = await db.solicitudDocumento.findFirst({
    where: { solicitudId: r.data.solicitudId, documentoId: r.data.documentoId, documento: { empresaId: ctx.empresa.id } },
    include: { documento: { select: { id: true, eDocument: true, estadoEDocument: true, idTipoDocumentoVucem: true } } },
  });
  if (!liga) return { ok: false, mensaje: "El documento no está ligado a esta solicitud.", valores };
  if (liga.documento.eDocument || liga.documento.estadoEDocument === "PENDIENTE") {
    return { ok: false, mensaje: "El documento ya se envió a digitalizar; su tipo ya no se puede cambiar aquí.", valores };
  }
  const erroresCatalogo = await validarClavesCatalogo([
    { campo: "idTipoDocumentoVucem", catalogo: "CAT_TIPO_DOCUMENTO", clave: r.data.idTipoDocumentoVucem },
  ]);
  if (Object.keys(erroresCatalogo).length > 0) return { ok: false, errores: erroresCatalogo, valores };

  await db.documento.update({ where: { id: liga.documento.id }, data: { idTipoDocumentoVucem: r.data.idTipoDocumentoVucem } });
  await registrarBitacora({
    empresaId: ctx.empresa.id,
    usuarioId: ctx.usuario.id,
    accion: "EDITAR",
    entidad: "Documento",
    entidadId: liga.documento.id,
    detalle: { campos: ["idTipoDocumentoVucem"], idTipoDocumentoVucem: { antes: liga.documento.idTipoDocumentoVucem, despues: r.data.idTipoDocumentoVucem } },
  });
  rutas(r.data.solicitudId);
  revalidatePath(`/documentos/${liga.documento.id}`);
  return { ok: true, mensaje: "Tipo de documento guardado." };
}

const esquemaDescartar = z.object({ solicitudId: zId, documentoId: zId });

/** Descarta un eDocument generado en otro ambiente (p. ej. el SIMULADOR) para volver a digitalizar. */
export async function descartarEDocumentDeOtroAmbiente(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const r = esquemaDescartar.safeParse(formDataAObjeto(formData));
  if (!r.success) return { ok: false, mensaje: "Datos inválidos." };
  const a = await acceso(r.data.solicitudId);
  if ("error" in a) return { ok: false, mensaje: a.error };
  const { ctx } = a;
  const sol = await db.solicitud.findFirst({ where: { id: r.data.solicitudId, empresaId: ctx.empresa.id }, select: { folioVucem: true } });
  if (sol?.folioVucem) return { ok: false, mensaje: "La solicitud ya se presentó; no se modifican sus anexos." };
  const documentos = await documentosDeSolicitud(r.data.solicitudId, ctx.empresa.id);
  const config = await obtenerConfiguracionVucem(ctx.empresa.id);
  const ajeno = (await eDocumentsDeOtroAmbiente(ctx.empresa.id, documentos, config.ambiente)).find((e) => e.documentoId === r.data.documentoId);
  if (!ajeno) return { ok: false, mensaje: "Ese eDocument es del ambiente actual; no se descarta." };
  await descartarEDocument(ctx.empresa.id, ajeno.documentoId, ctx.usuario.id, `Generado en ${ajeno.ambiente}; ambiente actual ${config.ambiente}`);
  rutas(r.data.solicitudId);
  revalidatePath(`/documentos/${ajeno.documentoId}`);
  return { ok: true, mensaje: "eDocument descartado: ya puedes digitalizarlo de nuevo." };
}

const esquemaEnvio = z.object({
  certificadoBase64: zBase64,
  cadenaOriginal: zCadena,
  firma: zBase64,
  confirmarReenvio: z.boolean().default(false),
});

/** Paso 2: envía la solicitud firmada al WS 260211. */
export async function enviarSolicitudVucem(
  solicitudId: string,
  datos: { certificadoBase64: string; cadenaOriginal: string; firma: string; confirmarReenvio?: boolean },
): Promise<ResultadoEnvio> {
  const a = await acceso(solicitudId);
  if ("error" in a) return { ok: false, mensaje: a.error };
  const { ctx } = a;
  const r = esquemaEnvio.safeParse(datos);
  if (!r.success) return { ok: false, mensaje: "Datos de firma inválidos." };

  const config = await obtenerConfiguracionVucem(ctx.empresa.id);
  const resultado = await enviarSolicitud260211({
    empresaId: ctx.empresa.id,
    usuarioId: ctx.usuario.id,
    solicitudId,
    certificadoBase64: r.data.certificadoBase64,
    cadenaOriginal: r.data.cadenaOriginal,
    firma: r.data.firma,
    confirmarReenvio: r.data.confirmarReenvio,
    config,
  });
  rutas(solicitudId);
  revalidatePath("/solicitudes");
  revalidatePath("/");
  return resultado;
}
