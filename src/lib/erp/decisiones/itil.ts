// ITIL 4: matriz de prioridad (impacto × urgencia), SLA y habilitación de cambios.

import type { EstadoTicket, TipoCambio, TipoTicket } from "../constantes";

/** Impacto y urgencia: 1 = alto, 2 = medio, 3 = bajo. */
export function prioridadItil(impacto: number, urgencia: number): 1 | 2 | 3 | 4 | 5 {
  const i = Math.min(3, Math.max(1, Math.round(impacto)));
  const u = Math.min(3, Math.max(1, Math.round(urgencia)));
  return (i + u - 1) as 1 | 2 | 3 | 4 | 5;
}

export const INFO_PRIORIDAD: Record<1 | 2 | 3 | 4 | 5, { etiqueta: string; slaHoras: number }> = {
  1: { etiqueta: "P1 · Crítica", slaHoras: 4 },
  2: { etiqueta: "P2 · Alta", slaHoras: 8 },
  3: { etiqueta: "P3 · Media", slaHoras: 24 },
  4: { etiqueta: "P4 · Baja", slaHoras: 72 },
  5: { etiqueta: "P5 · Planificación", slaHoras: 168 },
};

export function vencimientoSla(creado: Date, prioridad: 1 | 2 | 3 | 4 | 5): Date {
  return new Date(creado.getTime() + INFO_PRIORIDAD[prioridad].slaHoras * 3_600_000);
}

/** Cambios estándar están preaprobados; normales van al CAB y los de emergencia al ECAB. */
export function requiereAprobacionCambio(tipo: TipoCambio | null | undefined): boolean {
  return tipo === "NORMAL" || tipo === "EMERGENCIA";
}

/** Transiciones de estado permitidas por tipo de ticket. */
export function transicionesPermitidas(tipo: TipoTicket, estado: EstadoTicket): EstadoTicket[] {
  if (tipo === "CAMBIO") {
    const mapa: Partial<Record<EstadoTicket, EstadoTicket[]>> = {
      NUEVO: ["PENDIENTE_APROBACION", "EN_PROCESO"],
      PENDIENTE_APROBACION: ["APROBADO", "RECHAZADO"],
      APROBADO: ["EN_PROCESO"],
      EN_PROCESO: ["RESUELTO"],
      RESUELTO: ["CERRADO", "EN_PROCESO"],
    };
    return mapa[estado] ?? [];
  }
  const mapa: Partial<Record<EstadoTicket, EstadoTicket[]>> = {
    NUEVO: ["EN_PROCESO", "RESUELTO"],
    EN_PROCESO: ["RESUELTO"],
    RESUELTO: ["CERRADO", "EN_PROCESO"],
  };
  return mapa[estado] ?? [];
}

/** ¿Se incumplió el SLA? (abierto y vencido, o resuelto después del vencimiento) */
export function slaIncumplido(t: { venceEn: Date; resueltoEn: Date | null; estado: string }, ahora: Date): boolean {
  if (t.resueltoEn) return t.resueltoEn > t.venceEn;
  if (t.estado === "CERRADO" || t.estado === "RECHAZADO") return false;
  return ahora > t.venceEn;
}
