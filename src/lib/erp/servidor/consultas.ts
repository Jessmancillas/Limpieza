import "server-only";

import { db } from "@/lib/db";

import { clasificarABC, cantidadSugerida, politicaInventario, type ClaseABC, type PoliticaInventario } from "../decisiones/inventario";
import { evaluarProveedor, type EvaluacionProveedor } from "../decisiones/compras";
import type { EntradaCredito } from "../decisiones/credito";
import { diasVencido } from "../decisiones/cobranza";
import { diasEntre, redondearCantidad, sumarDias } from "../dinero";

/** Estados de OC cuya cantidad pendiente cuenta como "en tránsito" (ya comprometida). */
export const ESTADOS_OC_ABIERTA = ["BORRADOR", "POR_APROBAR", "APROBADA", "RECIBIDA_PARCIAL"];

export type AnalisisArticulo = {
  id: string;
  sku: string;
  nombre: string;
  unidad: string;
  activo: boolean;
  categoria: string | null;
  proveedorPreferenteId: string | null;
  existencia: number;
  enTransito: number;
  costoUnitario: number;
  valorInventario: number;
  demandaAnual: number;
  demandaEstimada: boolean;
  valorConsumo: number;
  clase: ClaseABC;
  politica: PoliticaInventario;
  sugerida: number;
  stockMinimo: number;
  stockMaximo: number;
};

/**
 * Análisis de inventario de la empresa: existencias, en tránsito, demanda (capturada o estimada
 * con las salidas de los últimos 365 días), clasificación ABC, EOQ, ROP y cantidad sugerida.
 */
export async function analizarInventario(empresaId: string, factorZ: number, hoy = new Date()): Promise<AnalisisArticulo[]> {
  const desde = sumarDias(hoy, -365);
  const [articulos, existencias, transito, salidas] = await Promise.all([
    db.articulo.findMany({ where: { empresaId }, orderBy: { sku: "asc" } }),
    db.existencia.groupBy({
      by: ["articuloId"],
      where: { articulo: { empresaId } },
      _sum: { cantidad: true },
    }),
    db.partidaOrdenCompra.findMany({
      where: { ordenCompra: { empresaId, estado: { in: ESTADOS_OC_ABIERTA } } },
      select: { articuloId: true, cantidad: true, cantidadRecibida: true },
    }),
    db.movimientoInventario.groupBy({
      by: ["articuloId"],
      where: { empresaId, tipo: "SALIDA_VENTA", creadoEn: { gte: desde } },
      _sum: { cantidad: true },
    }),
  ]);
  // Costo promedio global por artículo (ponderado por existencia de cada almacén).
  const costos = await db.existencia.findMany({ where: { articulo: { empresaId } }, select: { articuloId: true, cantidad: true, costoPromedio: true } });
  const costoPorArticulo = new Map<string, { cant: number; valor: number }>();
  for (const c of costos) {
    const acc = costoPorArticulo.get(c.articuloId) ?? { cant: 0, valor: 0 };
    acc.cant += Math.max(0, c.cantidad);
    acc.valor += Math.max(0, c.cantidad) * c.costoPromedio;
    costoPorArticulo.set(c.articuloId, acc);
  }
  const existenciaPor = new Map(existencias.map((e) => [e.articuloId, e._sum.cantidad ?? 0]));
  const salidasPor = new Map(salidas.map((s) => [s.articuloId, -(s._sum.cantidad ?? 0)]));
  const transitoPor = new Map<string, number>();
  for (const t of transito) transitoPor.set(t.articuloId, (transitoPor.get(t.articuloId) ?? 0) + Math.max(0, t.cantidad - t.cantidadRecibida));

  const base = articulos.map((a) => {
    const c = costoPorArticulo.get(a.id);
    const costoUnitario = c && c.cant > 0 ? Math.round(c.valor / c.cant) : a.ultimoCosto;
    const demandaEstimada = !(a.demandaAnual > 0);
    const demandaAnual = demandaEstimada ? salidasPor.get(a.id) ?? 0 : a.demandaAnual;
    const existencia = redondearCantidad(existenciaPor.get(a.id) ?? 0);
    return { a, costoUnitario, demandaAnual, demandaEstimada, existencia, valorConsumo: demandaAnual * costoUnitario };
  });
  const abc = clasificarABC(base.map((b) => ({ id: b.a.id, valorConsumo: b.valorConsumo })));

  return base.map(({ a, costoUnitario, demandaAnual, demandaEstimada, existencia, valorConsumo }) => {
    const politica = politicaInventario(
      {
        demandaAnual,
        costoOrdenar: a.costoOrdenar,
        costoMantenerBp: a.costoMantenerBp,
        costoUnitario,
        tiempoEntregaDias: a.tiempoEntregaDias,
        desviacionDemandaDiaria: a.desviacionDemandaDiaria,
        stockMinimo: a.stockMinimo,
        stockMaximo: a.stockMaximo,
      },
      factorZ / 100,
    );
    const enTransito = redondearCantidad(transitoPor.get(a.id) ?? 0);
    return {
      id: a.id,
      sku: a.sku,
      nombre: a.nombre,
      unidad: a.unidad,
      activo: a.activo,
      categoria: a.categoria,
      proveedorPreferenteId: a.proveedorPreferenteId,
      existencia,
      enTransito,
      costoUnitario,
      valorInventario: Math.round(Math.max(0, existencia) * costoUnitario),
      demandaAnual,
      demandaEstimada,
      valorConsumo,
      clase: abc.get(a.id) ?? "C",
      politica,
      sugerida: a.activo
        ? cantidadSugerida({ existencia, enTransito, puntoReorden: politica.puntoReorden, eoq: politica.eoq, stockMaximo: a.stockMaximo })
        : 0,
      stockMinimo: a.stockMinimo,
      stockMaximo: a.stockMaximo,
    };
  });
}

/** Scorecard de todos los proveedores de la empresa (null = sin recepciones). */
export async function evaluarProveedores(empresaId: string): Promise<Map<string, EvaluacionProveedor | null>> {
  const [proveedores, recepciones, partidas] = await Promise.all([
    db.proveedor.findMany({ where: { empresaId }, select: { id: true } }),
    db.recepcion.findMany({
      where: { empresaId },
      select: {
        aTiempo: true,
        conciliacion: true,
        ordenCompra: { select: { proveedorId: true } },
        partidas: { select: { cantidadRecibida: true, cantidadRechazada: true } },
      },
    }),
    db.partidaOrdenCompra.findMany({
      where: { ordenCompra: { empresaId, estado: { in: ["RECIBIDA_PARCIAL", "RECIBIDA"] } } },
      select: { cantidad: true, cantidadRecibida: true, ordenCompra: { select: { proveedorId: true } } },
    }),
  ]);
  const res = new Map<string, EvaluacionProveedor | null>();
  for (const p of proveedores) {
    const propias = recepciones.filter((r) => r.ordenCompra.proveedorId === p.id);
    const ps = partidas.filter((x) => x.ordenCompra.proveedorId === p.id);
    res.set(
      p.id,
      evaluarProveedor({
        recepciones: propias.map((r) => ({
          aTiempo: r.aTiempo,
          conciliacion: r.conciliacion,
          cantidadRecibida: r.partidas.reduce((s, x) => s + x.cantidadRecibida, 0),
          cantidadRechazada: r.partidas.reduce((s, x) => s + x.cantidadRechazada, 0),
        })),
        cantidadOrdenada: ps.reduce((s, x) => s + x.cantidad, 0),
        cantidadRecibida: ps.reduce((s, x) => s + x.cantidadRecibida, 0),
      }),
    );
  }
  return res;
}

/** Datos del modelo de crédito para un cliente y un pedido de `montoPedido` centavos. */
export async function entradaCreditoCliente(empresaId: string, clienteId: string, montoPedido: number, hoy = new Date()): Promise<EntradaCredito | null> {
  const cliente = await db.cliente.findFirst({
    where: { id: clienteId, empresaId },
    include: {
      cuentasPorCobrar: {
        where: { estado: { in: ["PENDIENTE", "PARCIAL", "PAGADA"] } },
        include: { cobros: { select: { fecha: true }, orderBy: { fecha: "desc" }, take: 1 } },
      },
    },
  });
  if (!cliente) return null;
  const abiertas = cliente.cuentasPorCobrar.filter((c) => c.estado !== "PAGADA" && c.saldo > 0);
  const pagadas = cliente.cuentasPorCobrar.filter((c) => c.estado === "PAGADA");
  const saldoActual = abiertas.reduce((s, c) => s + c.saldo, 0);
  const saldoVencido = abiertas.filter((c) => c.fechaVencimiento < hoy).reduce((s, c) => s + c.saldo, 0);
  const maxDiasVencido = abiertas.reduce((m, c) => Math.max(m, diasVencido(c.fechaVencimiento, hoy)), 0);
  const atrasos = pagadas.map((c) => Math.max(0, diasEntre(c.fechaVencimiento, c.cobros[0]?.fecha ?? c.fechaVencimiento)));
  return {
    estadoCliente: cliente.estado,
    limiteCredito: cliente.limiteCredito,
    saldoActual,
    montoPedido,
    maxDiasVencido,
    fraccionVencida: saldoActual > 0 ? saldoVencido / saldoActual : 0,
    atrasoPromedioPago: atrasos.length > 0 ? atrasos.reduce((s, x) => s + x, 0) / atrasos.length : 0,
    facturasPagadas: pagadas.length,
  };
}
