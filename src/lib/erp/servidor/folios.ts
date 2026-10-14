import "server-only";

import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;
export type DocumentoConFolio = "ordenCompra" | "recepcion" | "pedidoVenta" | "riesgoSeguridad" | "ticketServicio";

/** Siguiente consecutivo por empresa. Llamar dentro de la transacción que crea el documento. */
export async function siguienteNumero(tx: Tx, documento: DocumentoConFolio, empresaId: string): Promise<number> {
  const args = { where: { empresaId }, _max: { numero: true } } as const;
  let max: number | null;
  switch (documento) {
    case "ordenCompra":
      max = (await tx.ordenCompra.aggregate(args))._max.numero;
      break;
    case "recepcion":
      max = (await tx.recepcion.aggregate(args))._max.numero;
      break;
    case "pedidoVenta":
      max = (await tx.pedidoVenta.aggregate(args))._max.numero;
      break;
    case "riesgoSeguridad":
      max = (await tx.riesgoSeguridad.aggregate(args))._max.numero;
      break;
    case "ticketServicio":
      max = (await tx.ticketServicio.aggregate(args))._max.numero;
      break;
  }
  return (max ?? 0) + 1;
}

export function folio(prefijo: string, numero: number): string {
  return `${prefijo}-${String(numero).padStart(5, "0")}`;
}
