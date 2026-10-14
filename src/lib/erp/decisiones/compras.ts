// Modelos de decisión de Compras (COBIT APO10 «Proveedores gestionados», DSS06 «Controles de
// procesos de negocio»). Funciones puras: se prueban en tests/erp/decisiones.test.ts.

import type { Rol } from "@/lib/constantes";

import type { Area, Conciliacion } from "../constantes";
import { verificarSegregacion } from "../permisos";

export type PoliticaAprobacion = {
  montoAutoAprobacion: number;
  montoAprobacionNivel1: number;
  segregacionEstricta: boolean;
};

/**
 * Matriz de autorización por monto (delegación de autoridad):
 * 0 = automática, 1 = aprobador (área APROBADOR o ADMIN), 2 = dirección (ADMIN).
 */
export function nivelAprobacionOC(totalCentavos: number, politica: PoliticaAprobacion): 0 | 1 | 2 {
  if (totalCentavos <= politica.montoAutoAprobacion) return 0;
  if (totalCentavos <= politica.montoAprobacionNivel1) return 1;
  return 2;
}

export const ETIQUETA_NIVEL_APROBACION: Record<0 | 1 | 2, string> = {
  0: "Automática (dentro de política)",
  1: "Aprobador",
  2: "Dirección (administrador)",
};

export type DecisionPermiso = { permitido: boolean; motivo?: string; advertencia?: string };

/**
 * ¿Puede este usuario aprobar la OC? Aplica la matriz por monto y la segregación de funciones
 * (quien elabora la OC no la aprueba: ISO/IEC 27001 A.5.3).
 */
export function puedeAprobarOC(args: {
  nivel: 0 | 1 | 2;
  rol: Rol;
  areas: readonly Area[];
  aprobadorId: string;
  creadorId: string | null;
  segregacionEstricta: boolean;
}): DecisionPermiso {
  const { nivel, rol, areas, aprobadorId, creadorId, segregacionEstricta } = args;
  if (rol === "CONSULTA") return { permitido: false, motivo: "Tu rol es de solo consulta." };
  if (nivel === 2 && rol !== "ADMIN") {
    return { permitido: false, motivo: "El monto requiere aprobación de dirección (administrador)." };
  }
  if (nivel === 1 && rol !== "ADMIN" && !areas.includes("APROBADOR")) {
    return { permitido: false, motivo: "Necesitas el área «Aprobador» para autorizar esta OC." };
  }
  const sod = verificarSegregacion("OC_ELABORA_APRUEBA", aprobadorId, creadorId, segregacionEstricta);
  return sod.permitido ? { permitido: true, advertencia: sod.advertencia } : { permitido: false, motivo: sod.mensaje };
}

export type PartidaConciliacion = {
  cantidadOrdenada: number;
  /** Recibido acumulado (incluye esta recepción) */
  cantidadRecibidaAcumulada: number;
  /** Recibido (aceptado) en esta recepción */
  cantidadRecibida: number;
  costoUnitario: number;
  tasaIvaBp: number;
};

export type ResultadoConciliacion = {
  resultado: Conciliacion;
  importeEsperado: number;
  diferencia: number;
  motivos: string[];
};

/**
 * Conciliación a tres vías: OC (precio y cantidad pactados) vs. recepción (cantidad aceptada) vs.
 * factura del proveedor (importe). Fuera de tolerancia la cuenta por pagar queda BLOQUEADA hasta
 * que un aprobador la libere.
 */
export function conciliarTresVias(args: {
  partidas: PartidaConciliacion[];
  importeFactura: number | null;
  toleranciaPrecioBp: number;
  toleranciaCantidadBp: number;
}): ResultadoConciliacion {
  const { partidas, importeFactura, toleranciaPrecioBp, toleranciaCantidadBp } = args;
  let importeEsperado = 0;
  const motivos: string[] = [];
  let excesoCantidad = false;
  for (const p of partidas) {
    const importe = Math.round(p.cantidadRecibida * p.costoUnitario);
    importeEsperado += importe + Math.round((importe * p.tasaIvaBp) / 10_000);
    const maximo = p.cantidadOrdenada * (1 + toleranciaCantidadBp / 10_000);
    if (p.cantidadRecibidaAcumulada > maximo + 1e-9) excesoCantidad = true;
  }
  if (excesoCantidad) motivos.push("Se recibió más de lo ordenado (fuera de tolerancia).");

  if (importeFactura === null) {
    motivos.push("Falta registrar la factura del proveedor.");
    return { resultado: excesoCantidad ? "DIFERENCIA_CANTIDAD" : "SIN_FACTURA", importeEsperado, diferencia: 0, motivos };
  }
  const diferencia = importeFactura - importeEsperado;
  const limite = Math.max(1, Math.round((importeEsperado * toleranciaPrecioBp) / 10_000));
  const difPrecio = Math.abs(diferencia) > limite;
  if (difPrecio) motivos.push(`La factura difiere del importe esperado por más de la tolerancia (${toleranciaPrecioBp / 100} %).`);

  const resultado: Conciliacion = excesoCantidad ? "DIFERENCIA_CANTIDAD" : difPrecio ? "DIFERENCIA_PRECIO" : "OK";
  return { resultado, importeEsperado, diferencia, motivos };
}

export type HistorialProveedor = {
  recepciones: Array<{ aTiempo: boolean; cantidadRecibida: number; cantidadRechazada: number; conciliacion: string }>;
  /** Cantidad ordenada y recibida en OC cerradas o recibidas (cumplimiento / fill rate) */
  cantidadOrdenada: number;
  cantidadRecibida: number;
};

export type EvaluacionProveedor = {
  puntaje: number;
  clase: "A" | "B" | "C" | "D";
  recomendacion: string;
  calidad: number;
  puntualidad: number;
  cumplimiento: number;
  facturacion: number;
};

export const PESOS_EVALUACION_PROVEEDOR = { calidad: 0.35, puntualidad: 0.3, cumplimiento: 0.2, facturacion: 0.15 } as const;

/**
 * Evaluación ponderada del desempeño del proveedor (scorecard): calidad (sin rechazos),
 * puntualidad (recepciones a tiempo), cumplimiento (fill rate) y facturación correcta
 * (conciliaciones OK). null si aún no hay recepciones.
 */
export function evaluarProveedor(h: HistorialProveedor): EvaluacionProveedor | null {
  if (h.recepciones.length === 0) return null;
  const recibido = h.recepciones.reduce((s, r) => s + r.cantidadRecibida + r.cantidadRechazada, 0);
  const rechazado = h.recepciones.reduce((s, r) => s + r.cantidadRechazada, 0);
  const calidad = recibido > 0 ? 1 - rechazado / recibido : 1;
  const puntualidad = h.recepciones.filter((r) => r.aTiempo).length / h.recepciones.length;
  const cumplimiento = h.cantidadOrdenada > 0 ? Math.min(1, h.cantidadRecibida / h.cantidadOrdenada) : 1;
  const conFactura = h.recepciones.filter((r) => r.conciliacion !== "SIN_FACTURA");
  const facturacion = conFactura.length > 0 ? conFactura.filter((r) => r.conciliacion === "OK").length / conFactura.length : 1;
  const W = PESOS_EVALUACION_PROVEEDOR;
  const puntaje = Math.round(
    100 * (W.calidad * calidad + W.puntualidad * puntualidad + W.cumplimiento * cumplimiento + W.facturacion * facturacion),
  );
  const clase = puntaje >= 85 ? "A" : puntaje >= 70 ? "B" : puntaje >= 50 ? "C" : "D";
  const recomendacion = {
    A: "Proveedor preferente: asignar volumen y negociar condiciones.",
    B: "Aceptable: mantener y dar seguimiento trimestral.",
    C: "En evaluación: solicitar plan de acción correctiva.",
    D: "Desempeño insuficiente: bloquear nuevas OC y buscar alternativa.",
  }[clase];
  return { puntaje, clase, recomendacion, calidad, puntualidad, cumplimiento, facturacion };
}
