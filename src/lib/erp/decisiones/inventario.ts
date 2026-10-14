// Modelos de decisión de inventario: EOQ, stock de seguridad, punto de reorden, clasificación ABC
// y costo promedio ponderado (COBIT BAI09 «Activos gestionados», APO06 «Presupuesto y costos»).

/**
 * Lote económico de compra (Wilson): EOQ = √(2·D·S / H)
 * D = demanda anual (unidades), S = costo de ordenar (centavos/pedido),
 * H = costo anual de mantener una unidad (centavos).
 */
export function loteEconomico(demandaAnual: number, costoOrdenar: number, costoMantenerUnidad: number): number | null {
  if (!(demandaAnual > 0) || !(costoOrdenar > 0) || !(costoMantenerUnidad > 0)) return null;
  return Math.sqrt((2 * demandaAnual * costoOrdenar) / costoMantenerUnidad);
}

/** Stock de seguridad = z · σ_diaria · √L */
export function stockSeguridad(z: number, desviacionDiaria: number, tiempoEntregaDias: number): number {
  if (!(z > 0) || !(desviacionDiaria > 0) || !(tiempoEntregaDias > 0)) return 0;
  return z * desviacionDiaria * Math.sqrt(tiempoEntregaDias);
}

/** Punto de reorden = demanda diaria · L + stock de seguridad */
export function puntoReorden(demandaDiaria: number, tiempoEntregaDias: number, ss: number): number {
  return Math.max(0, demandaDiaria * Math.max(0, tiempoEntregaDias) + ss);
}

export type ParametrosArticulo = {
  demandaAnual: number;
  costoOrdenar: number;
  costoMantenerBp: number;
  costoUnitario: number;
  tiempoEntregaDias: number;
  desviacionDemandaDiaria: number;
  stockMinimo: number;
  stockMaximo: number;
};

export type PoliticaInventario = {
  eoq: number | null;
  stockSeguridad: number;
  puntoReorden: number;
  demandaDiaria: number;
};

/** Calcula EOQ, SS y ROP de un artículo. El ROP nunca queda por debajo del stock mínimo. */
export function politicaInventario(p: ParametrosArticulo, z: number): PoliticaInventario {
  const demandaDiaria = p.demandaAnual > 0 ? p.demandaAnual / 365 : 0;
  const H = (p.costoUnitario * p.costoMantenerBp) / 10_000;
  const eoq = loteEconomico(p.demandaAnual, p.costoOrdenar, H);
  const ss = stockSeguridad(z, p.desviacionDemandaDiaria, p.tiempoEntregaDias);
  const rop = Math.max(p.stockMinimo, puntoReorden(demandaDiaria, p.tiempoEntregaDias, ss));
  return { eoq, stockSeguridad: ss, puntoReorden: rop, demandaDiaria };
}

/**
 * Cantidad a pedir cuando la posición (existencia + en tránsito) llega al punto de reorden.
 * Usa el EOQ; sin EOQ, rellena hasta el máximo. Nunca deja la posición bajo el ROP ni excede el
 * máximo (si hay máximo y no contradice el ROP). Regresa 0 si no hay que pedir.
 */
export function cantidadSugerida(args: {
  existencia: number;
  enTransito: number;
  puntoReorden: number;
  eoq: number | null;
  stockMaximo: number;
}): number {
  const { existencia, enTransito, puntoReorden: rop, eoq, stockMaximo } = args;
  const posicion = existencia + enTransito;
  if (posicion > rop || (rop <= 0 && stockMaximo <= 0)) return 0;
  let q = eoq && eoq > 0 ? eoq : stockMaximo - posicion;
  q = Math.max(q, rop - posicion);
  if (stockMaximo > 0 && posicion + q > stockMaximo) q = Math.max(stockMaximo - posicion, rop - posicion);
  return q > 0 ? Math.ceil(q) : 0;
}

export type ClaseABC = "A" | "B" | "C";

/**
 * Clasificación ABC (Pareto) por valor de consumo anual: A hasta el 80 % acumulado, B hasta el
 * 95 % y C el resto. Los artículos sin consumo son C.
 */
export function clasificarABC(items: Array<{ id: string; valorConsumo: number }>): Map<string, ClaseABC> {
  const ordenados = [...items].sort((a, b) => b.valorConsumo - a.valorConsumo);
  const total = ordenados.reduce((s, i) => s + Math.max(0, i.valorConsumo), 0);
  const res = new Map<string, ClaseABC>();
  let acumulado = 0;
  for (const i of ordenados) {
    if (total <= 0 || i.valorConsumo <= 0) {
      res.set(i.id, "C");
      continue;
    }
    // La clase se decide con el acumulado ANTES de sumar el artículo: el que cruza el 80 % es A.
    const previo = acumulado / total;
    acumulado += i.valorConsumo;
    res.set(i.id, previo < 0.8 ? "A" : previo < 0.95 ? "B" : "C");
  }
  return res;
}

export const POLITICA_ABC: Record<ClaseABC, string> = {
  A: "Control estricto: conteo cíclico mensual, revisión continua y negociación de precio.",
  B: "Control moderado: conteo trimestral y revisión periódica.",
  C: "Control simple: conteo semestral y lotes grandes.",
};

/** Nuevo costo promedio ponderado tras una entrada. */
export function costoPromedioPonderado(existencia: number, costoPromedio: number, cantidadEntrada: number, costoEntrada: number): number {
  const total = existencia + cantidadEntrada;
  if (total <= 0) return costoEntrada;
  if (existencia <= 0) return costoEntrada;
  return Math.round((existencia * costoPromedio + cantidadEntrada * costoEntrada) / total);
}
