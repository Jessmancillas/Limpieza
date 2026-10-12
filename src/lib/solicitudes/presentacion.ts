import { ETIQUETA_ESTADO_SOLICITUD, type EstadoSolicitud, type SentidoResolucion } from "@/lib/constantes";

import { SECCION } from "./validacion";

// Ayudas de presentación (sin dependencias de servidor).

export type TonoInsignia = "neutro" | "primario" | "exito" | "aviso" | "peligro" | "info";

export const TONO_ESTADO: Record<EstadoSolicitud, TonoInsignia> = {
  BORRADOR: "neutro",
  LISTA: "primario",
  PRESENTADA: "info",
  REQUERIMIENTO: "aviso",
  RESUELTA_ACEPTADA: "exito",
  RESUELTA_RECHAZADA: "peligro",
  RESUELTA_PARCIAL: "aviso",
  CANCELADA: "neutro",
};

export function etiquetaEstado(estado: string): string {
  return ETIQUETA_ESTADO_SOLICITUD[estado as EstadoSolicitud] ?? estado;
}

export function tonoEstado(estado: string): TonoInsignia {
  return TONO_ESTADO[estado as EstadoSolicitud] ?? "neutro";
}

export const ETIQUETA_SENTIDO: Record<SentidoResolucion, string> = {
  ACEPTADA: "Aceptada",
  RECHAZADA: "Rechazada",
  PARCIAL: "Parcial",
};

export const TONO_SENTIDO: Record<SentidoResolucion, TonoInsignia> = {
  ACEPTADA: "exito",
  RECHAZADA: "peligro",
  PARCIAL: "aviso",
};

/** Ancla (id del elemento) de cada sección de validación en la página de la solicitud. */
export const ANCLA_SECCION: Record<string, string> = {
  [SECCION.SOLICITANTE]: "solicitante",
  [SECCION.ESTABLECIMIENTO]: "datos-generales",
  [SECCION.REGIMEN_ADUANA]: "datos-generales",
  [SECCION.MERCANCIAS]: "mercancias",
  [SECCION.MANIFIESTOS]: "manifiestos",
  [SECCION.REPRESENTANTE]: "representante",
  [SECCION.TERCEROS]: "terceros",
  [SECCION.PAGO]: "pago",
  [SECCION.DOCUMENTOS]: "documentos",
};

/** Estados en los que ya hay seguimiento (requerimientos, resolución). */
export const ESTADOS_EN_SEGUIMIENTO = new Set(["PRESENTADA", "REQUERIMIENTO", "RESUELTA_ACEPTADA", "RESUELTA_RECHAZADA", "RESUELTA_PARCIAL"]);
export const ESTADOS_RESUELTOS = new Set(["RESUELTA_ACEPTADA", "RESUELTA_RECHAZADA", "RESUELTA_PARCIAL"]);

/** Texto "en N días hábiles" / "hoy" / "vencido hace N días hábiles". */
export function textoDiasHabiles(dias: number): string {
  if (dias === 0) return "Vence hoy";
  if (dias > 0) return `${dias} día${dias === 1 ? "" : "s"} hábil${dias === 1 ? "" : "es"}`;
  const n = -dias;
  return `Vencido hace ${n} día${n === 1 ? "" : "s"} hábil${n === 1 ? "" : "es"}`;
}
