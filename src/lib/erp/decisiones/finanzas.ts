// Indicadores financieros del ciclo de conversión de efectivo y priorización de pagos
// (COBIT APO06 «Presupuesto y costos gestionados», MEA01 «Monitoreo del desempeño»).

import { diasEntre } from "../dinero";

export type EntradaIndicadores = {
  /** Ventas netas del periodo (centavos, sin IVA) */
  ventas: number;
  costoVentas: number;
  compras: number;
  saldoClientes: number;
  saldoProveedores: number;
  valorInventario: number;
  diasPeriodo: number;
};

export type Indicadores = {
  margenBruto: number | null;
  /** Días de venta en cartera */
  dso: number | null;
  /** Días de pago a proveedores */
  dpo: number | null;
  /** Días de inventario */
  dio: number | null;
  /** Ciclo de conversión de efectivo = DSO + DIO - DPO */
  ccc: number | null;
  rotacionInventario: number | null;
};

function razon(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

export function indicadoresFinancieros(e: EntradaIndicadores): Indicadores {
  const margenBruto = razon(e.ventas - e.costoVentas, e.ventas);
  const dso = e.ventas > 0 ? (e.saldoClientes / e.ventas) * e.diasPeriodo : null;
  const dpo = e.compras > 0 ? (e.saldoProveedores / e.compras) * e.diasPeriodo : null;
  const dio = e.costoVentas > 0 ? (e.valorInventario / e.costoVentas) * e.diasPeriodo : null;
  const ccc = dso !== null && dio !== null && dpo !== null ? dso + dio - dpo : null;
  const rotacionInventario = razon(e.costoVentas, e.valorInventario);
  return { margenBruto, dso, dpo, dio, ccc, rotacionInventario };
}

export type CuentaPagable = {
  id: string;
  saldo: number;
  fechaVencimiento: Date;
  criticidadProveedor: string;
};

export type PagoPriorizado = CuentaPagable & { puntaje: number; diasParaVencer: number; incluido: boolean; montoSugerido: number };

/**
 * Programa de pagos con efectivo limitado. Puntaje: atraso (hasta 50), cercanía del vencimiento
 * (hasta 30) y criticidad del proveedor (CRITICO 20, ESTRATEGICO 10). Se asigna el efectivo en
 * orden de puntaje; la última cuenta puede quedar con pago parcial.
 */
export function priorizarPagos(cuentas: CuentaPagable[], efectivoDisponible: number, hoy: Date): PagoPriorizado[] {
  const conPuntaje = cuentas.map((c) => {
    const diasParaVencer = diasEntre(hoy, c.fechaVencimiento);
    const atraso = diasParaVencer < 0 ? Math.min(50, 20 + -diasParaVencer) : 0;
    const cercania = diasParaVencer >= 0 ? Math.max(0, 30 - diasParaVencer) : 30;
    const criticidad = c.criticidadProveedor === "CRITICO" ? 20 : c.criticidadProveedor === "ESTRATEGICO" ? 10 : 0;
    return { ...c, diasParaVencer, puntaje: atraso + cercania + criticidad, incluido: false, montoSugerido: 0 };
  });
  conPuntaje.sort((a, b) => b.puntaje - a.puntaje || a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime());
  let restante = Math.max(0, efectivoDisponible);
  for (const c of conPuntaje) {
    if (restante <= 0) break;
    c.montoSugerido = Math.min(c.saldo, restante);
    c.incluido = c.montoSugerido > 0;
    restante -= c.montoSugerido;
  }
  return conPuntaje;
}
