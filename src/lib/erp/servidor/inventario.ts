import "server-only";

import type { Prisma } from "@/generated/prisma/client";

import type { TipoMovimiento } from "../constantes";
import { costoPromedioPonderado } from "../decisiones/inventario";
import { formatoNumero, redondearCantidad } from "../dinero";

import { ErrorNegocio } from "./contexto";

type Tx = Prisma.TransactionClient;

/**
 * Registra un movimiento en el kárdex y actualiza la existencia del almacén.
 * Entradas recalculan el costo promedio ponderado; salidas salen al costo promedio vigente y no
 * pueden dejar la existencia en negativo. Regresa el movimiento creado.
 */
export async function registrarMovimiento(
  tx: Tx,
  m: {
    empresaId: string;
    articuloId: string;
    almacenId: string;
    tipo: TipoMovimiento;
    /** Siempre positiva; el signo lo da el tipo */
    cantidad: number;
    /** Costo unitario de la entrada (centavos). En salidas se ignora (se usa el promedio). */
    costoUnitario?: number;
    referenciaTipo?: string;
    referenciaId?: string;
    motivo?: string | null;
    usuarioId: string;
  },
) {
  if (!(m.cantidad > 0)) throw new ErrorNegocio("La cantidad debe ser mayor a cero.");
  const esEntrada = m.tipo === "ENTRADA_COMPRA" || m.tipo === "AJUSTE_ENTRADA" || m.tipo === "INVENTARIO_INICIAL";
  const actual = await tx.existencia.findUnique({ where: { articuloId_almacenId: { articuloId: m.articuloId, almacenId: m.almacenId } } });
  const existencia = actual?.cantidad ?? 0;
  const costoPromedio = actual?.costoPromedio ?? 0;

  let nuevaCantidad: number;
  let nuevoCosto: number;
  let costoMovimiento: number;
  if (esEntrada) {
    costoMovimiento = Math.max(0, Math.round(m.costoUnitario ?? costoPromedio));
    nuevaCantidad = redondearCantidad(existencia + m.cantidad);
    nuevoCosto = costoPromedioPonderado(existencia, costoPromedio, m.cantidad, costoMovimiento);
  } else {
    if (m.cantidad > existencia + 1e-9) {
      const articulo = await tx.articulo.findUnique({ where: { id: m.articuloId }, select: { sku: true } });
      throw new ErrorNegocio(
        `Existencia insuficiente de ${articulo?.sku ?? "artículo"}: hay ${formatoNumero(existencia)} y se requieren ${formatoNumero(m.cantidad)}.`,
      );
    }
    costoMovimiento = costoPromedio;
    nuevaCantidad = redondearCantidad(existencia - m.cantidad);
    nuevoCosto = costoPromedio;
  }

  await tx.existencia.upsert({
    where: { articuloId_almacenId: { articuloId: m.articuloId, almacenId: m.almacenId } },
    create: { articuloId: m.articuloId, almacenId: m.almacenId, cantidad: nuevaCantidad, costoPromedio: nuevoCosto },
    update: { cantidad: nuevaCantidad, costoPromedio: nuevoCosto },
  });
  return tx.movimientoInventario.create({
    data: {
      empresaId: m.empresaId,
      articuloId: m.articuloId,
      almacenId: m.almacenId,
      tipo: m.tipo,
      cantidad: esEntrada ? m.cantidad : -m.cantidad,
      costoUnitario: costoMovimiento,
      saldoCantidad: nuevaCantidad,
      saldoCostoPromedio: nuevoCosto,
      referenciaTipo: m.referenciaTipo ?? null,
      referenciaId: m.referenciaId ?? null,
      motivo: m.motivo ?? null,
      creadoPorId: m.usuarioId,
    },
  });
}
