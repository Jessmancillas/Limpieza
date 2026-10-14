"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { AREAS, enLista, ESTADOS_TICKET, type EstadoTicket, type TipoTicket } from "@/lib/erp/constantes";
import { prioridadItil, requiereAprobacionCambio, transicionesPermitidas, vencimientoSla } from "@/lib/erp/decisiones/itil";
import { validarTratamiento, valorRiesgo } from "@/lib/erp/decisiones/riesgos";
import { CONTROLES_REFERENCIA } from "@/lib/erp/marcos";
import { areasATexto, puedeOperar, verificarSegregacion } from "@/lib/erp/permisos";
import { bitacoraErp, obtenerContextoErp, sinPermisoArea } from "@/lib/erp/servidor/contexto";
import { siguienteNumero } from "@/lib/erp/servidor/folios";
import { esquemaControl, esquemaPoliticas, esquemaRiesgo, esquemaTicket } from "@/lib/erp/validacion";
import { erroresDeZod, formDataAObjeto, type EstadoFormulario } from "@/lib/formularios";

import { esIdValido, MENSAJE_NO_ENCONTRADO, MENSAJE_REVISA } from "../establecimientos/_compartido/servidor";

const SOLO_ADMIN = "Solo un administrador puede cambiar las políticas de gobierno.";

function revalidarGobierno() {
  revalidatePath("/gobierno", "layout");
  revalidatePath("/erp");
}

/** Políticas de decisión (umbrales de aprobación, tolerancias, crédito). Solo ADMIN. */
export async function guardarPoliticas(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  if (ctx.rol !== "ADMIN") return { ok: false, mensaje: SOLO_ADMIN };
  const valores = formDataAObjeto(formData);
  const r = esquemaPoliticas.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  const d = r.data;
  const errores: Record<string, string[]> = {};
  if (d.montoAprobacionNivel1 < d.montoAutoAprobacion) errores.montoAprobacionNivel1 = ["Debe ser mayor o igual al monto de aprobación automática."];
  if (d.puntajeCreditoRevision > d.puntajeCreditoMinimo) errores.puntajeCreditoRevision = ["Debe ser menor o igual al puntaje mínimo de aprobación."];
  if (Object.keys(errores).length > 0) return { ok: false, mensaje: MENSAJE_REVISA, errores, valores };
  const datos = {
    montoAutoAprobacion: d.montoAutoAprobacion,
    montoAprobacionNivel1: d.montoAprobacionNivel1,
    toleranciaPrecioBp: d.toleranciaPrecio,
    toleranciaCantidadBp: d.toleranciaCantidad,
    diasGraciaCredito: d.diasGraciaCredito,
    puntajeCreditoMinimo: d.puntajeCreditoMinimo,
    puntajeCreditoRevision: d.puntajeCreditoRevision,
    factorServicioZ: d.factorServicioZ,
    tasaIvaBp: d.tasaIva,
    segregacionEstricta: formData.get("segregacionEstricta") === "on",
  };
  await db.configuracionErp.update({ where: { empresaId: ctx.empresa.id }, data: datos });
  await bitacoraErp(ctx, "CAMBIAR_POLITICAS", "ConfiguracionErp", ctx.config.id, { antes: { ...ctx.config, actualizadoEn: undefined }, despues: datos });
  revalidarGobierno();
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "Políticas actualizadas." };
}

/** Áreas funcionales de un miembro (segregación de funciones). Solo ADMIN. */
export async function guardarAreasMiembro(membresiaId: string, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  if (ctx.rol !== "ADMIN") return { ok: false, mensaje: "Solo un administrador asigna áreas." };
  if (!esIdValido(membresiaId)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const m = await db.membresia.findFirst({ where: { id: membresiaId, empresaId: ctx.empresa.id }, include: { usuario: { select: { email: true } } } });
  if (!m) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const areas = formData.getAll("areas").filter((a): a is string => enLista(AREAS, a));
  const texto = areasATexto(areas);
  await db.membresia.update({ where: { id: m.id }, data: { areas: texto } });
  await bitacoraErp(ctx, "ASIGNAR_AREAS", "Membresia", m.id, { email: m.usuario.email, antes: m.areas, despues: texto });
  revalidarGobierno();
  return { ok: true, mensaje: "Áreas actualizadas." };
}

/** Crea en la empresa los controles de referencia (COBIT e ISO) que aún no tenga. */
export async function sembrarControles(): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "GOBIERNO");
  if (sinPermiso) return sinPermiso;
  const existentes = await db.controlGobierno.findMany({ where: { empresaId: ctx.empresa.id }, select: { marco: true, clave: true } });
  const ya = new Set(existentes.map((e) => `${e.marco}|${e.clave}`));
  const nuevos = CONTROLES_REFERENCIA.filter((c) => !ya.has(`${c.marco}|${c.clave}`));
  if (nuevos.length > 0) {
    await db.controlGobierno.createMany({
      data: nuevos.map((c) => ({
        empresaId: ctx.empresa.id,
        marco: c.marco,
        clave: c.clave,
        nombre: c.nombre,
        dominio: c.dominio,
        procesoErp: c.procesoErp,
        nivelObjetivo: c.nivelObjetivo,
        evidencia: c.soporte,
      })),
    });
    await bitacoraErp(ctx, "SEMBRAR_CONTROLES", "ControlGobierno", null, { nuevos: nuevos.length });
  }
  revalidarGobierno();
  return { ok: true, mensaje: nuevos.length > 0 ? `Se agregaron ${nuevos.length} controles de referencia.` : "Los controles ya estaban cargados." };
}

/** Autoevaluación de un objetivo COBIT o control ISO (nivel actual/objetivo, aplicabilidad). */
export async function evaluarControl(controlId: string, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "GOBIERNO");
  if (sinPermiso) return sinPermiso;
  if (!esIdValido(controlId)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const valores = formDataAObjeto(formData);
  const r = esquemaControl.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  if (!r.data.aplicable && !r.data.justificacion) {
    return { ok: false, mensaje: MENSAJE_REVISA, errores: { justificacion: ["Justifica la exclusión (declaración de aplicabilidad)."] }, valores };
  }
  const c = await db.controlGobierno.findFirst({ where: { id: controlId, empresaId: ctx.empresa.id } });
  if (!c) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  await db.controlGobierno.update({
    where: { id: c.id },
    data: {
      aplicable: r.data.aplicable,
      nivelActual: r.data.nivelActual,
      nivelObjetivo: r.data.nivelObjetivo,
      justificacion: r.data.justificacion ?? null,
      responsable: r.data.responsable ?? null,
      evidencia: r.data.evidencia ?? null,
      revisadoEn: new Date(),
    },
  });
  await bitacoraErp(ctx, "EVALUAR_CONTROL", "ControlGobierno", c.id, { marco: c.marco, clave: c.clave, de: c.nivelActual, a: r.data.nivelActual });
  revalidarGobierno();
  return { ok: true, mensaje: `${c.clave} evaluado.` };
}

/** Alta/edición de un riesgo de seguridad de la información (ISO/IEC 27001 6.1.2). */
export async function guardarRiesgo(id: string | null, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "GOBIERNO");
  if (sinPermiso) return sinPermiso;
  if (id !== null && !esIdValido(id)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const valores = formDataAObjeto(formData);
  const r = esquemaRiesgo.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  const valor = valorRiesgo(r.data.probabilidad, r.data.impacto);
  const error = validarTratamiento(valor, r.data.tratamiento, ctx.rol === "ADMIN");
  if (error) return { ok: false, mensaje: MENSAJE_REVISA, errores: { tratamiento: [error] }, valores };
  const datos = {
    ...r.data,
    controles: r.data.controles ?? null,
    responsable: r.data.responsable ?? null,
    probabilidadResidual: r.data.probabilidadResidual ?? null,
    impactoResidual: r.data.impactoResidual ?? null,
  };
  if (id) {
    const existente = await db.riesgoSeguridad.findFirst({ where: { id, empresaId: ctx.empresa.id } });
    if (!existente) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
    await db.riesgoSeguridad.update({ where: { id }, data: datos });
    await bitacoraErp(ctx, "EDITAR", "RiesgoSeguridad", id, { numero: existente.numero, valor, tratamiento: datos.tratamiento });
    revalidarGobierno();
    return { ok: true, mensaje: "Riesgo actualizado." };
  }
  const creado = await db.$transaction(async (tx) => {
    const numero = await siguienteNumero(tx, "riesgoSeguridad", ctx.empresa.id);
    return tx.riesgoSeguridad.create({ data: { ...datos, numero, empresaId: ctx.empresa.id } });
  });
  await bitacoraErp(ctx, "CREAR", "RiesgoSeguridad", creado.id, { numero: creado.numero, valor });
  revalidarGobierno();
  return { ok: true, mensaje: `Riesgo R-${creado.numero} registrado.` };
}

/** Alta de ticket ITIL: la prioridad y el vencimiento del SLA los calcula la matriz. */
export async function crearTicket(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  if (ctx.rol === "CONSULTA") return { ok: false, mensaje: "Tu rol es de solo consulta." };
  const valores = formDataAObjeto(formData);
  const r = esquemaTicket.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  if (r.data.tipo === "CAMBIO" && !r.data.tipoCambio) return { ok: false, mensaje: MENSAJE_REVISA, errores: { tipoCambio: ["Indica el tipo de cambio."] }, valores };
  const prioridad = prioridadItil(r.data.impacto, r.data.urgencia);
  const ahora = new Date();
  const t = await db.$transaction(async (tx) => {
    const numero = await siguienteNumero(tx, "ticketServicio", ctx.empresa.id);
    return tx.ticketServicio.create({
      data: {
        empresaId: ctx.empresa.id,
        numero,
        tipo: r.data.tipo,
        servicio: r.data.servicio,
        titulo: r.data.titulo,
        descripcion: r.data.descripcion,
        impacto: r.data.impacto,
        urgencia: r.data.urgencia,
        prioridad,
        tipoCambio: r.data.tipo === "CAMBIO" ? r.data.tipoCambio : null,
        estado: r.data.tipo === "CAMBIO" && requiereAprobacionCambio(r.data.tipoCambio) ? "PENDIENTE_APROBACION" : "NUEVO",
        venceEn: vencimientoSla(ahora, prioridad),
        reportadoPorId: ctx.usuario.id,
      },
    });
  });
  await bitacoraErp(ctx, "CREAR", "TicketServicio", t.id, { numero: t.numero, tipo: t.tipo, prioridad });
  revalidarGobierno();
  return { ok: true, mensaje: `Ticket #${t.numero} creado con prioridad P${prioridad}.` };
}

/** Transición de estado de un ticket. Aprobar/rechazar cambios es del CAB (aprobador o ADMIN). */
export async function cambiarEstadoTicket(ticketId: string, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  if (ctx.rol === "CONSULTA") return { ok: false, mensaje: "Tu rol es de solo consulta." };
  if (!esIdValido(ticketId)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const estado = formData.get("estado");
  if (!enLista(ESTADOS_TICKET, estado)) return { ok: false, mensaje: "Estado inválido." };
  const solucion = String(formData.get("solucion") ?? "").trim().slice(0, 2000) || null;
  const t = await db.ticketServicio.findFirst({ where: { id: ticketId, empresaId: ctx.empresa.id } });
  if (!t) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  if (!transicionesPermitidas(t.tipo as TipoTicket, t.estado as EstadoTicket).includes(estado)) {
    return { ok: false, mensaje: "Transición no permitida para este ticket." };
  }
  const decisionCab = estado === "APROBADO" || estado === "RECHAZADO";
  if (decisionCab) {
    if (!puedeOperar(ctx.rol, ctx.areas, "APROBADOR")) return { ok: false, mensaje: "Solo el CAB (aprobador o administrador) decide sobre cambios." };
    const sod = verificarSegregacion("OC_ELABORA_APRUEBA", ctx.usuario.id, t.reportadoPorId, ctx.config.segregacionEstricta);
    if (!sod.permitido) return { ok: false, mensaje: "Segregación de funciones: quien solicita el cambio no lo aprueba." };
  }
  if (estado === "RESUELTO" && !solucion) return { ok: false, mensaje: "Documenta la solución para resolver el ticket." };
  await db.ticketServicio.update({
    where: { id: t.id },
    data: {
      estado,
      ...(estado === "RESUELTO" ? { resueltoEn: new Date(), solucion } : {}),
      ...(decisionCab ? { aprobadoPorId: ctx.usuario.id } : {}),
    },
  });
  await bitacoraErp(ctx, "CAMBIAR_ESTADO", "TicketServicio", t.id, { numero: t.numero, de: t.estado, a: estado });
  revalidarGobierno();
  return { ok: true, mensaje: "Ticket actualizado." };
}
