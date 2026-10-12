"use server";

import { redirect } from "next/navigation";

import { registrarBitacora } from "@/lib/bitacora";
import { db } from "@/lib/db";
import { erroresDeZod, formatoFecha, formDataAObjeto, type EstadoFormulario } from "@/lib/formularios";
import { leerPdfOpcional } from "@/lib/solicitudes/archivos";
import { sumarDiasHabiles } from "@/lib/solicitudes/dias-habiles";
import { obtenerDiasInhabiles } from "@/lib/solicitudes/dias-inhabiles-bd";
import {
  esquemaAtencion,
  esquemaPresentacion,
  esquemaRequerimiento,
  esquemaResolucion,
  PLAZO_MINIMO_HABITUAL,
} from "@/lib/solicitudes/esquemas";
import { diasNaturalesHasta } from "@/lib/solicitudes/fechas";
import { borrarArchivo, guardarArchivo, rutaEsDeEmpresa } from "@/lib/storage";

import { MENSAJE_REVISA, prepararAccion, revalidarSolicitud } from "./_lib/servidor";

// Seguimiento: presentación en el portal, requerimientos y resolución.

const ESTADOS_PRESENTADA = new Set(["PRESENTADA", "REQUERIMIENTO"]);
const esFutura = (fecha: Date) => diasNaturalesHasta(fecha) > 0;

/**
 * Registra (o corrige) la presentación hecha en el portal VUCEM: folio, fecha y acuse.
 * Desde BORRADOR/LISTA cambia el estado a PRESENTADA con canal PORTAL.
 */
export async function registrarPresentacion(id: string, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const p = await prepararAccion(id, { editable: false });
  if (p.error) return p.error;
  const { ctx, sol } = p;
  const empresaId = ctx.empresa.id;
  if (sol.estado === "CANCELADA" || sol.estado.startsWith("RESUELTA_")) {
    return { ok: false, mensaje: "La solicitud está cancelada o resuelta: no se puede registrar su presentación." };
  }

  const valores = formDataAObjeto(formData);
  const r = esquemaPresentacion.safeParse(valores);
  const errores: Record<string, string[]> = r.success ? {} : erroresDeZod(r.error);
  if (r.success && esFutura(r.data.fechaPresentacion)) errores.fechaPresentacion = ["La fecha de presentación no puede ser posterior a hoy"];
  if (r.success) {
    const otra = await db.solicitud.findFirst({
      where: { empresaId, folioVucem: r.data.folioVucem, id: { not: sol.id } },
      select: { numero: true },
    });
    if (otra) errores.folioVucem = [`Ese folio ya está registrado en la solicitud ${otra.numero}`];
  }
  const acuse = await leerPdfOpcional(formData.get("acuse"));
  if (acuse.error) errores.acuse = [acuse.error];
  if (!r.success || Object.keys(errores).length > 0) return { ok: false, mensaje: MENSAJE_REVISA, errores, valores };
  const d = r.data;

  const actual = await db.solicitud.findUniqueOrThrow({ where: { id: sol.id }, select: { acuseRuta: true } });
  const nuevaRuta = acuse.datos ? await guardarArchivo(empresaId, acuse.datos, "pdf", "acuses") : null;
  const registrar = sol.estado === "BORRADOR" || sol.estado === "LISTA";
  await db.solicitud.update({
    where: { id: sol.id },
    data: {
      numeroTemporal: d.numeroTemporal ?? null,
      folioVucem: d.folioVucem,
      fechaPresentacion: d.fechaPresentacion,
      ...(nuevaRuta ? { acuseRuta: nuevaRuta } : {}),
      ...(registrar ? { canalPresentacion: "PORTAL", estado: "PRESENTADA" } : {}),
    },
  });
  if (nuevaRuta && actual.acuseRuta && rutaEsDeEmpresa(actual.acuseRuta, empresaId)) await borrarArchivo(actual.acuseRuta);
  await registrarBitacora({
    empresaId,
    usuarioId: ctx.usuario.id,
    accion: registrar ? "PRESENTAR_PORTAL" : "EDITAR_PRESENTACION",
    entidad: "Solicitud",
    entidadId: sol.id,
    detalle: { folioVucem: d.folioVucem, numeroTemporal: d.numeroTemporal, fecha: d.fechaPresentacion.toISOString().slice(0, 10), acuse: !!nuevaRuta },
  });
  revalidarSolicitud(sol.id);
  redirect(`/solicitudes/${sol.id}?${registrar ? "presentada" : "presentacion"}=1`);
}

/** Alta de un requerimiento de información; calcula la fecha límite en días hábiles. */
export async function registrarRequerimiento(id: string, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const p = await prepararAccion(id, { editable: false });
  if (p.error) return p.error;
  const { ctx, sol } = p;
  if (!ESTADOS_PRESENTADA.has(sol.estado)) {
    return { ok: false, mensaje: "Solo se registran requerimientos de solicitudes presentadas y sin resolver." };
  }

  const valores = formDataAObjeto(formData);
  const r = esquemaRequerimiento.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  const d = r.data;
  const { fechaPresentacion } = await db.solicitud.findUniqueOrThrow({ where: { id: sol.id }, select: { fechaPresentacion: true } });
  if (esFutura(d.fechaNotificacion)) {
    return { ok: false, mensaje: MENSAJE_REVISA, errores: { fechaNotificacion: ["La fecha de notificación no puede ser posterior a hoy"] }, valores };
  }
  if (fechaPresentacion && d.fechaNotificacion.getTime() < fechaPresentacion.getTime() - 12 * 3_600_000) {
    return {
      ok: false,
      mensaje: MENSAJE_REVISA,
      errores: { fechaNotificacion: [`La notificación no puede ser anterior a la presentación (${formatoFecha(fechaPresentacion)})`] },
      valores,
    };
  }

  const fechaLimite = sumarDiasHabiles(d.fechaNotificacion, d.plazoDiasHabiles, await obtenerDiasInhabiles());
  const [req] = await db.$transaction([
    db.requerimiento.create({
      data: {
        solicitudId: sol.id,
        fechaNotificacion: d.fechaNotificacion,
        plazoDiasHabiles: d.plazoDiasHabiles,
        fechaLimite,
        descripcion: d.descripcion,
      },
      select: { id: true },
    }),
    db.solicitud.update({ where: { id: sol.id }, data: { estado: "REQUERIMIENTO" } }),
  ]);
  await registrarBitacora({
    empresaId: ctx.empresa.id,
    usuarioId: ctx.usuario.id,
    accion: "REGISTRAR_REQUERIMIENTO",
    entidad: "Solicitud",
    entidadId: sol.id,
    detalle: { requerimientoId: req.id, plazo: d.plazoDiasHabiles, fechaLimite: fechaLimite.toISOString().slice(0, 10) },
  });
  revalidarSolicitud(sol.id);
  const avisoPlazo =
    d.plazoDiasHabiles < PLAZO_MINIMO_HABITUAL
      ? ` Atención: el plazo es menor a ${PLAZO_MINIMO_HABITUAL} días hábiles (mínimo habitual según el art. 17-A de la LFPA); verifica el oficio.`
      : "";
  return { ok: true, mensaje: `Requerimiento registrado. Fecha límite para atenderlo: ${formatoFecha(fechaLimite)}.${avisoPlazo}` };
}

export async function atenderRequerimiento(
  id: string,
  requerimientoId: string,
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const p = await prepararAccion(id, { editable: false });
  if (p.error) return p.error;
  const { ctx, sol } = p;
  const req = await db.requerimiento.findFirst({ where: { id: requerimientoId, solicitudId: sol.id } });
  if (!req) return { ok: false, mensaje: "El requerimiento no existe en esta solicitud." };
  if (req.estado !== "PENDIENTE") return { ok: false, mensaje: "El requerimiento ya estaba atendido." };

  const valores = formDataAObjeto(formData);
  const r = esquemaAtencion.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  const d = r.data;
  if (esFutura(d.fechaAtencion)) return { ok: false, mensaje: MENSAJE_REVISA, errores: { fechaAtencion: ["La fecha no puede ser posterior a hoy"] }, valores };
  if (d.fechaAtencion.getTime() < req.fechaNotificacion.getTime()) {
    return { ok: false, mensaje: MENSAJE_REVISA, errores: { fechaAtencion: ["La atención no puede ser anterior a la notificación"] }, valores };
  }

  await db.requerimiento.update({
    where: { id: req.id },
    data: { estado: "ATENDIDO", fechaAtencion: d.fechaAtencion, notas: d.notas ?? req.notas },
  });
  const pendientes = await db.requerimiento.count({ where: { solicitudId: sol.id, estado: "PENDIENTE" } });
  if (pendientes === 0) await db.solicitud.updateMany({ where: { id: sol.id, estado: "REQUERIMIENTO" }, data: { estado: "PRESENTADA" } });
  await registrarBitacora({
    empresaId: ctx.empresa.id,
    usuarioId: ctx.usuario.id,
    accion: "ATENDER_REQUERIMIENTO",
    entidad: "Solicitud",
    entidadId: sol.id,
    detalle: { requerimientoId: req.id, fechaAtencion: d.fechaAtencion.toISOString().slice(0, 10) },
  });
  revalidarSolicitud(sol.id);
  const fueraDePlazo = d.fechaAtencion.getTime() > req.fechaLimite.getTime() ? " Se atendió después de la fecha límite." : "";
  return { ok: true, mensaje: `Requerimiento marcado como atendido.${fueraDePlazo}` };
}

/** Elimina un requerimiento capturado por error. */
export async function eliminarRequerimiento(id: string, requerimientoId: string): Promise<EstadoFormulario> {
  const p = await prepararAccion(id, { editable: false });
  if (p.error) return p.error;
  const { ctx, sol } = p;
  if (!ESTADOS_PRESENTADA.has(sol.estado)) return { ok: false, mensaje: "La solicitud ya está resuelta o cancelada." };
  const req = await db.requerimiento.findFirst({ where: { id: requerimientoId, solicitudId: sol.id }, select: { id: true } });
  if (!req) return { ok: false, mensaje: "El requerimiento no existe en esta solicitud." };
  await db.requerimiento.delete({ where: { id: req.id } });
  const pendientes = await db.requerimiento.count({ where: { solicitudId: sol.id, estado: "PENDIENTE" } });
  if (pendientes === 0) await db.solicitud.updateMany({ where: { id: sol.id, estado: "REQUERIMIENTO" }, data: { estado: "PRESENTADA" } });
  await registrarBitacora({
    empresaId: ctx.empresa.id,
    usuarioId: ctx.usuario.id,
    accion: "ELIMINAR_REQUERIMIENTO",
    entidad: "Solicitud",
    entidadId: sol.id,
    detalle: { requerimientoId: req.id },
  });
  revalidarSolicitud(sol.id);
  return { ok: true, mensaje: "Requerimiento eliminado." };
}

/** Registra (o corrige) la resolución de COFEPRIS. */
export async function registrarResolucion(id: string, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const p = await prepararAccion(id, { editable: false });
  if (p.error) return p.error;
  const { ctx, sol } = p;
  const empresaId = ctx.empresa.id;
  if (!ESTADOS_PRESENTADA.has(sol.estado) && !sol.estado.startsWith("RESUELTA_")) {
    return { ok: false, mensaje: "Solo se registra la resolución de solicitudes presentadas." };
  }

  const valores = formDataAObjeto(formData);
  const r = esquemaResolucion.safeParse(valores);
  const errores: Record<string, string[]> = r.success ? {} : erroresDeZod(r.error);
  const partidas = await db.partidaSolicitud.findMany({ where: { solicitudId: sol.id }, orderBy: { orden: "asc" }, select: { id: true } });
  const resultados = new Map<string, "ACEPTADA" | "RECHAZADA">();
  if (r.success) {
    const d = r.data;
    if (esFutura(d.fechaResolucion)) errores.fechaResolucion = ["La fecha de resolución no puede ser posterior a hoy"];
    if (d.vigenciaHasta && d.vigenciaHasta.getTime() < d.fechaResolucion.getTime()) {
      errores.vigenciaHasta = ["La vigencia no puede ser anterior a la fecha de resolución"];
    }
    for (const pa of partidas) {
      if (d.sentido !== "PARCIAL") {
        resultados.set(pa.id, d.sentido);
        continue;
      }
      const v = formData.get(`resultado_${pa.id}`);
      if (v === "ACEPTADA" || v === "RECHAZADA") resultados.set(pa.id, v);
      else errores[`resultado_${pa.id}`] = ["Indica si esta mercancía se aceptó o rechazó"];
    }
    if (d.sentido === "PARCIAL" && resultados.size === partidas.length) {
      const valoresRes = [...resultados.values()];
      if (!valoresRes.includes("ACEPTADA") || !valoresRes.includes("RECHAZADA")) {
        errores.sentido = ["En una resolución parcial hay mercancías aceptadas y rechazadas; si todas tienen el mismo resultado elige ese sentido"];
      }
    }
  }
  const pdf = await leerPdfOpcional(formData.get("documento"));
  if (pdf.error) errores.documento = [pdf.error];
  if (!r.success || Object.keys(errores).length > 0) return { ok: false, mensaje: MENSAJE_REVISA, errores, valores };
  const d = r.data;

  const anterior = await db.resolucion.findUnique({ where: { solicitudId: sol.id }, select: { documentoRuta: true } });
  const nuevaRuta = pdf.datos ? await guardarArchivo(empresaId, pdf.datos, "pdf", "resoluciones") : null;
  const datos = {
    sentido: d.sentido,
    numeroPermiso: d.numeroPermiso,
    fechaResolucion: d.fechaResolucion,
    vigenciaHasta: d.vigenciaHasta ?? null,
    restricciones: d.restricciones ?? null,
    observaciones: d.observaciones ?? null,
    ...(nuevaRuta ? { documentoRuta: nuevaRuta } : {}),
  };
  await db.$transaction([
    db.resolucion.upsert({ where: { solicitudId: sol.id }, create: { solicitudId: sol.id, ...datos }, update: datos }),
    ...[...resultados.entries()].map(([partidaId, resultado]) =>
      db.partidaSolicitud.update({ where: { id: partidaId }, data: { resultado } }),
    ),
    db.solicitud.update({ where: { id: sol.id }, data: { estado: `RESUELTA_${d.sentido}` } }),
  ]);
  if (nuevaRuta && anterior?.documentoRuta && rutaEsDeEmpresa(anterior.documentoRuta, empresaId)) await borrarArchivo(anterior.documentoRuta);
  await registrarBitacora({
    empresaId,
    usuarioId: ctx.usuario.id,
    accion: anterior ? "EDITAR_RESOLUCION" : "REGISTRAR_RESOLUCION",
    entidad: "Solicitud",
    entidadId: sol.id,
    detalle: { sentido: d.sentido, numeroPermiso: d.numeroPermiso, vigenciaHasta: d.vigenciaHasta?.toISOString().slice(0, 10) ?? null },
  });
  revalidarSolicitud(sol.id);
  return { ok: true, mensaje: anterior ? "Resolución actualizada." : "Resolución registrada." };
}
