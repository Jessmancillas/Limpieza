"use server";

import { revalidatePath } from "next/cache";

import { ErrorPermiso, exigirRol, obtenerContexto } from "@/lib/auth/contexto";
import { registrarBitacora } from "@/lib/bitacora";
import { db } from "@/lib/db";
import { erroresDeZod, formatoFecha, formDataAObjeto, type EstadoFormulario } from "@/lib/formularios";
import { recalcularRequerimientosPendientes } from "@/lib/solicitudes/dias-inhabiles-bd";
import { esquemaDiaInhabil } from "@/lib/solicitudes/esquemas";

import { esErrorUnico, MENSAJE_REVISA } from "./_lib/servidor";

// Los días inhábiles son globales (aplican a todas las empresas); solo un administrador los cambia.
// Al cambiar, se recalculan las fechas límite de los requerimientos pendientes de las empresas
// del usuario.

async function contextoAdmin() {
  const ctx = await obtenerContexto();
  try {
    exigirRol(ctx, ["ADMIN"]);
  } catch (e) {
    if (e instanceof ErrorPermiso) return { error: { ok: false, mensaje: "Solo un administrador puede modificar los días inhábiles." } };
    throw e;
  }
  return { ctx };
}

function revalidar() {
  revalidatePath("/solicitudes/dias-inhabiles");
  revalidatePath("/solicitudes", "layout");
  revalidatePath("/");
}

function textoRecalculo(n: number): string {
  return n > 0 ? ` Se actualizó la fecha límite de ${n} requerimiento${n === 1 ? "" : "s"} pendiente${n === 1 ? "" : "s"}.` : "";
}

export async function agregarDiaInhabil(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const a = await contextoAdmin();
  if (a.error) return a.error;
  const { ctx } = a;
  const valores = formDataAObjeto(formData);
  const r = esquemaDiaInhabil.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  try {
    await db.diaInhabil.create({ data: { fecha: r.data.fecha, descripcion: r.data.descripcion } });
  } catch (e) {
    if (esErrorUnico(e)) return { ok: false, mensaje: MENSAJE_REVISA, errores: { fecha: ["Ese día ya está registrado"] }, valores };
    throw e;
  }
  const n = await recalcularRequerimientosPendientes(ctx.membresias.map((m) => m.empresaId));
  await registrarBitacora({
    empresaId: ctx.empresa.id,
    usuarioId: ctx.usuario.id,
    accion: "CREAR",
    entidad: "DiaInhabil",
    detalle: { fecha: r.data.fecha.toISOString().slice(0, 10), descripcion: r.data.descripcion, requerimientosRecalculados: n },
  });
  revalidar();
  return { ok: true, mensaje: `Día inhábil ${formatoFecha(r.data.fecha)} agregado.${textoRecalculo(n)}` };
}

export async function eliminarDiaInhabil(diaId: string): Promise<EstadoFormulario> {
  const a = await contextoAdmin();
  if (a.error) return a.error;
  const { ctx } = a;
  const dia = await db.diaInhabil.findUnique({ where: { id: diaId } });
  if (!dia) return { ok: false, mensaje: "Ese día inhábil ya no existe." };
  await db.diaInhabil.delete({ where: { id: dia.id } });
  const n = await recalcularRequerimientosPendientes(ctx.membresias.map((m) => m.empresaId));
  await registrarBitacora({
    empresaId: ctx.empresa.id,
    usuarioId: ctx.usuario.id,
    accion: "ELIMINAR",
    entidad: "DiaInhabil",
    detalle: { fecha: dia.fecha.toISOString().slice(0, 10), descripcion: dia.descripcion, requerimientosRecalculados: n },
  });
  revalidar();
  return { ok: true, mensaje: `Día inhábil ${formatoFecha(dia.fecha)} eliminado.${textoRecalculo(n)}` };
}
