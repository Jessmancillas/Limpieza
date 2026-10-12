import "server-only";

import { db } from "@/lib/db";

import { sumarDiasHabiles } from "./dias-habiles";

/** Días inhábiles registrados (oficiales y los publicados en el DOF por COFEPRIS). */
export async function obtenerDiasInhabiles(): Promise<Date[]> {
  const dias = await db.diaInhabil.findMany({ select: { fecha: true }, orderBy: { fecha: "asc" } });
  return dias.map((d) => d.fecha);
}

/**
 * Recalcula la fecha límite de los requerimientos pendientes de las empresas indicadas (se usa
 * cuando cambian los días inhábiles). Regresa cuántos cambiaron.
 */
export async function recalcularRequerimientosPendientes(empresaIds: string[]): Promise<number> {
  if (empresaIds.length === 0) return 0;
  const [inhabiles, pendientes] = await Promise.all([
    obtenerDiasInhabiles(),
    db.requerimiento.findMany({
      where: { estado: "PENDIENTE", solicitud: { empresaId: { in: empresaIds } } },
      select: { id: true, fechaNotificacion: true, plazoDiasHabiles: true, fechaLimite: true },
    }),
  ]);
  let cambiados = 0;
  for (const r of pendientes) {
    const nueva = sumarDiasHabiles(r.fechaNotificacion, r.plazoDiasHabiles, inhabiles);
    if (nueva.getTime() !== r.fechaLimite.getTime()) {
      await db.requerimiento.update({ where: { id: r.id }, data: { fechaLimite: nueva } });
      cambiados++;
    }
  }
  return cambiados;
}
