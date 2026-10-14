// Tonos de insignias por estado (presentación compartida de las pantallas del ERP).

type Tono = "neutro" | "primario" | "exito" | "aviso" | "peligro" | "info";

export const TONO_OC: Record<string, Tono> = {
  BORRADOR: "neutro",
  POR_APROBAR: "aviso",
  APROBADA: "primario",
  RECIBIDA_PARCIAL: "info",
  RECIBIDA: "exito",
  RECHAZADA: "peligro",
  CANCELADA: "neutro",
};
export const TONO_PEDIDO: Record<string, Tono> = {
  BORRADOR: "neutro",
  POR_AUTORIZAR: "aviso",
  CONFIRMADO: "primario",
  ENTREGADO: "exito",
  CANCELADO: "neutro",
};
export const TONO_CUENTA: Record<string, Tono> = {
  PENDIENTE: "aviso",
  BLOQUEADA: "peligro",
  PARCIAL: "info",
  PAGADA: "exito",
  INCOBRABLE: "peligro",
  CANCELADA: "neutro",
};
export const TONO_CONCILIACION: Record<string, Tono> = {
  OK: "exito",
  DIFERENCIA_PRECIO: "peligro",
  DIFERENCIA_CANTIDAD: "peligro",
  SIN_FACTURA: "aviso",
};
export const TONO_PROVEEDOR: Record<string, Tono> = { ACTIVO: "exito", EN_EVALUACION: "aviso", BLOQUEADO: "peligro" };
export const TONO_CLIENTE: Record<string, Tono> = { ACTIVO: "exito", SUSPENDIDO: "peligro" };
export const TONO_CLASE: Record<string, Tono> = { A: "exito", B: "info", C: "aviso", D: "peligro" };
export const TONO_DECISION: Record<string, Tono> = { APROBAR: "exito", REVISAR: "aviso", RECHAZAR: "peligro" };
export const TONO_NIVEL_RIESGO: Record<string, Tono> = { BAJO: "exito", MEDIO: "info", ALTO: "aviso", CRITICO: "peligro" };
export const TONO_TICKET: Record<string, Tono> = {
  NUEVO: "info",
  EN_PROCESO: "primario",
  PENDIENTE_APROBACION: "aviso",
  APROBADO: "primario",
  RESUELTO: "exito",
  CERRADO: "neutro",
  RECHAZADO: "peligro",
};
export const TONO_PRIORIDAD: Record<number, Tono> = { 1: "peligro", 2: "aviso", 3: "info", 4: "neutro", 5: "neutro" };
