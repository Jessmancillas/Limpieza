// Modelo de decisión de crédito a clientes (COBIT APO12 «Riesgo gestionado»). Puntaje 0-100
// con reglas duras; el resultado se guarda en el pedido para auditoría.

export type EntradaCredito = {
  estadoCliente: string;
  limiteCredito: number;
  saldoActual: number;
  montoPedido: number;
  /** Mayor atraso (días) de los saldos abiertos */
  maxDiasVencido: number;
  /** Saldo vencido / saldo total (0-1) */
  fraccionVencida: number;
  /** Atraso promedio (días) con que pagó sus facturas liquidadas */
  atrasoPromedioPago: number;
  facturasPagadas: number;
};

export type PoliticaCredito = { diasGraciaCredito: number; puntajeCreditoMinimo: number; puntajeCreditoRevision: number };

export type DecisionCredito = { puntaje: number; decision: "APROBAR" | "REVISAR" | "RECHAZAR"; motivos: string[] };

export function evaluarCredito(e: EntradaCredito, p: PoliticaCredito): DecisionCredito {
  const motivos: string[] = [];
  if (e.estadoCliente === "SUSPENDIDO") return { puntaje: 0, decision: "RECHAZAR", motivos: ["Cliente con crédito suspendido por cobranza."] };
  if (e.limiteCredito <= 0) return { puntaje: 0, decision: "RECHAZAR", motivos: ["El cliente no tiene línea de crédito: solo contado."] };

  let puntaje = 100;
  const utilizacion = (e.saldoActual + e.montoPedido) / e.limiteCredito;
  if (utilizacion > 1) {
    puntaje -= 40;
    motivos.push(`Excede el límite de crédito (uso ${Math.round(utilizacion * 100)} %).`);
  } else if (utilizacion > 0.8) {
    puntaje -= 15;
    motivos.push(`Uso alto de la línea de crédito (${Math.round(utilizacion * 100)} %).`);
  }
  if (e.atrasoPromedioPago > 0) {
    const castigo = Math.min(30, Math.round(e.atrasoPromedioPago));
    puntaje -= castigo;
    motivos.push(`Paga en promedio ${Math.round(e.atrasoPromedioPago)} días tarde.`);
  }
  if (e.fraccionVencida > 0) {
    puntaje -= Math.round(e.fraccionVencida * 40);
    motivos.push(`${Math.round(e.fraccionVencida * 100)} % de su saldo está vencido.`);
  }
  const vencidoGrave = e.maxDiasVencido > p.diasGraciaCredito;
  if (vencidoGrave) {
    puntaje -= 25;
    motivos.push(`Tiene saldos con ${e.maxDiasVencido} días de atraso (gracia: ${p.diasGraciaCredito}).`);
  }
  if (e.facturasPagadas === 0) {
    puntaje -= 10;
    motivos.push("Sin historial de pagos.");
  }
  puntaje = Math.max(0, Math.min(100, puntaje));

  let decision: DecisionCredito["decision"];
  if (puntaje >= p.puntajeCreditoMinimo && utilizacion <= 1 && !vencidoGrave) decision = "APROBAR";
  else if (puntaje >= p.puntajeCreditoRevision) decision = "REVISAR";
  else decision = "RECHAZAR";
  if (decision === "APROBAR" && motivos.length === 0) motivos.push("Cumple la política de crédito.");
  return { puntaje, decision, motivos };
}
