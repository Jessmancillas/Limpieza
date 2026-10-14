// Antigüedad de saldos y estrategia de cobranza por tramo (COBIT APO12 / MEA01).

import { diasEntre } from "../dinero";

export const TRAMOS = ["CORRIENTE", "D1_30", "D31_60", "D61_90", "MAS_90"] as const;
export type Tramo = (typeof TRAMOS)[number];

export const INFO_TRAMO: Record<Tramo, { etiqueta: string; estrategia: string; provisionBp: number }> = {
  CORRIENTE: { etiqueta: "Por vencer", estrategia: "Recordatorio preventivo 3 días antes del vencimiento.", provisionBp: 0 },
  D1_30: { etiqueta: "1-30 días", estrategia: "Llamada y correo; obtener promesa de pago.", provisionBp: 300 },
  D31_60: { etiqueta: "31-60 días", estrategia: "Suspender crédito nuevo; visita y convenio de pago.", provisionBp: 1500 },
  D61_90: { etiqueta: "61-90 días", estrategia: "Escalar a dirección; última notificación formal.", provisionBp: 4000 },
  MAS_90: { etiqueta: "Más de 90 días", estrategia: "Turnar a jurídico y evaluar castigo como incobrable.", provisionBp: 8000 },
};

export function diasVencido(fechaVencimiento: Date, hoy: Date): number {
  return Math.max(0, diasEntre(fechaVencimiento, hoy));
}

export function tramoAntiguedad(fechaVencimiento: Date, hoy: Date): Tramo {
  const d = diasEntre(fechaVencimiento, hoy);
  if (d <= 0) return "CORRIENTE";
  if (d <= 30) return "D1_30";
  if (d <= 60) return "D31_60";
  if (d <= 90) return "D61_90";
  return "MAS_90";
}

export type ResumenAntiguedad = Record<Tramo, { saldo: number; cuentas: number }> & {
  total: number;
  provision: number;
};

/** Agrupa saldos por tramo y estima la provisión para cuentas incobrables. */
export function resumenAntiguedad(cuentas: Array<{ saldo: number; fechaVencimiento: Date }>, hoy: Date): ResumenAntiguedad {
  const vacio = () => ({ saldo: 0, cuentas: 0 });
  const r: ResumenAntiguedad = { CORRIENTE: vacio(), D1_30: vacio(), D31_60: vacio(), D61_90: vacio(), MAS_90: vacio(), total: 0, provision: 0 };
  for (const c of cuentas) {
    if (c.saldo <= 0) continue;
    const t = tramoAntiguedad(c.fechaVencimiento, hoy);
    r[t].saldo += c.saldo;
    r[t].cuentas += 1;
    r.total += c.saldo;
    r.provision += Math.round((c.saldo * INFO_TRAMO[t].provisionBp) / 10_000);
  }
  return r;
}

/** Siguiente acción sugerida según el atraso y si incumplió una promesa de pago. */
export function accionSugerida(dias: number, promesaIncumplida: boolean): string {
  if (promesaIncumplida && dias > 0) return "Promesa de pago incumplida: escalar y suspender crédito.";
  if (dias <= 0) return INFO_TRAMO.CORRIENTE.estrategia;
  if (dias <= 30) return INFO_TRAMO.D1_30.estrategia;
  if (dias <= 60) return INFO_TRAMO.D31_60.estrategia;
  if (dias <= 90) return INFO_TRAMO.D61_90.estrategia;
  return INFO_TRAMO.MAS_90.estrategia;
}
