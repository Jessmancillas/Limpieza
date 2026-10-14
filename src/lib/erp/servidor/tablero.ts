import "server-only";

import { db } from "@/lib/db";

import { resumenAntiguedad } from "../decisiones/cobranza";
import { indicadoresFinancieros, type Indicadores } from "../decisiones/finanzas";
import { brecha, cumplimiento, madurezPromedio } from "../decisiones/gobierno";
import { slaIncumplido } from "../decisiones/itil";
import { APETITO_RIESGO, valorRiesgo } from "../decisiones/riesgos";
import { sumarDias } from "../dinero";

import { analizarInventario } from "./consultas";

export const DIAS_PERIODO = 90;

export type TableroEjecutivo = Awaited<ReturnType<typeof cargarTableroEjecutivo>>;

/** Indicadores del tablero ejecutivo (COBIT MEA01) para la empresa. */
export async function cargarTableroEjecutivo(empresaId: string, factorZ: number, hoy = new Date()) {
  const desde = sumarDias(hoy, -DIAS_PERIODO);
  const [
    ventas,
    compras,
    cxc,
    cxp,
    tesoreria,
    inventario,
    ocPorAprobar,
    pedidosPorAutorizar,
    cxpBloqueadas,
    recepciones,
    tickets,
    riesgos,
    controles,
    excepciones,
  ] = await Promise.all([
    db.pedidoVenta.aggregate({ where: { empresaId, estado: "ENTREGADO", entregadoEn: { gte: desde } }, _sum: { subtotal: true, costoVenta: true }, _count: true }),
    db.recepcion.findMany({ where: { empresaId, fecha: { gte: desde } }, select: { partidas: { select: { cantidadRecibida: true, partidaOrden: { select: { costoUnitario: true } } } } } }),
    db.cuentaPorCobrar.findMany({ where: { empresaId, estado: { in: ["PENDIENTE", "PARCIAL"] } }, select: { saldo: true, fechaVencimiento: true } }),
    db.cuentaPorPagar.findMany({ where: { empresaId, estado: { in: ["PENDIENTE", "PARCIAL", "BLOQUEADA"] } }, select: { saldo: true, fechaVencimiento: true, estado: true } }),
    db.movimientoTesoreria.groupBy({ by: ["tipo"], where: { empresaId }, _sum: { monto: true } }),
    analizarInventario(empresaId, factorZ, hoy),
    db.ordenCompra.count({ where: { empresaId, estado: "POR_APROBAR" } }),
    db.pedidoVenta.count({ where: { empresaId, estado: "POR_AUTORIZAR" } }),
    db.cuentaPorPagar.count({ where: { empresaId, estado: "BLOQUEADA" } }),
    db.recepcion.findMany({ where: { empresaId, fecha: { gte: desde } }, select: { aTiempo: true, conciliacion: true, partidas: { select: { cantidadRecibida: true, cantidadRechazada: true } } } }),
    db.ticketServicio.findMany({ where: { empresaId }, select: { venceEn: true, resueltoEn: true, estado: true, prioridad: true, tipo: true } }),
    db.riesgoSeguridad.findMany({ where: { empresaId }, select: { probabilidad: true, impacto: true, estado: true, tratamiento: true } }),
    db.controlGobierno.findMany({ where: { empresaId }, select: { marco: true, clave: true, nombre: true, nivelActual: true, nivelObjetivo: true, aplicable: true } }),
    db.bitacora.count({
      where: { empresaId, creadoEn: { gte: desde }, accion: { in: ["LIBERAR_EXCEPCION", "AUTORIZAR_CREDITO", "CASTIGAR_INCOBRABLE", "CAMBIAR_POLITICAS"] } },
    }),
  ]);

  const ventasNetas = ventas._sum.subtotal ?? 0;
  const costoVentas = ventas._sum.costoVenta ?? 0;
  const comprasPeriodo = compras.reduce((s, r) => s + r.partidas.reduce((t, p) => t + Math.round(p.cantidadRecibida * p.partidaOrden.costoUnitario), 0), 0);
  const saldoClientes = cxc.reduce((s, c) => s + c.saldo, 0);
  const saldoProveedores = cxp.reduce((s, c) => s + c.saldo, 0);
  const valorInventario = inventario.reduce((s, a) => s + a.valorInventario, 0);
  const financieros: Indicadores = indicadoresFinancieros({
    ventas: ventasNetas,
    costoVentas,
    compras: comprasPeriodo,
    saldoClientes,
    saldoProveedores,
    valorInventario,
    diasPeriodo: DIAS_PERIODO,
  });
  const ingresos = tesoreria.find((t) => t.tipo === "INGRESO")?._sum.monto ?? 0;
  const egresos = tesoreria.find((t) => t.tipo === "EGRESO")?._sum.monto ?? 0;
  const antiguedad = resumenAntiguedad(cxc, hoy);

  const totalRecibido = recepciones.reduce((s, r) => s + r.partidas.reduce((t, p) => t + p.cantidadRecibida + p.cantidadRechazada, 0), 0);
  const totalRechazado = recepciones.reduce((s, r) => s + r.partidas.reduce((t, p) => t + p.cantidadRechazada, 0), 0);
  const conFactura = recepciones.filter((r) => r.conciliacion !== "SIN_FACTURA");

  const ticketsCerrables = tickets.filter((t) => t.tipo !== "CAMBIO");
  const ticketsAbiertos = tickets.filter((t) => !["RESUELTO", "CERRADO", "RECHAZADO"].includes(t.estado));
  const slaVencidos = ticketsAbiertos.filter((t) => slaIncumplido(t, hoy)).length;
  const conSla = ticketsCerrables.filter((t) => t.resueltoEn);
  const riesgosSobreApetito = riesgos.filter((r) => r.estado !== "CERRADO" && valorRiesgo(r.probabilidad, r.impacto) > APETITO_RIESGO && r.tratamiento !== "ACEPTAR");
  const cobit = controles.filter((c) => c.marco === "COBIT");
  const iso = controles.filter((c) => c.marco === "ISO27001");

  return {
    periodoDias: DIAS_PERIODO,
    ventasNetas,
    costoVentas,
    pedidosEntregados: ventas._count,
    comprasPeriodo,
    saldoClientes,
    saldoProveedores,
    valorInventario,
    financieros,
    efectivo: ingresos - egresos,
    antiguedad,
    fraccionVencida: antiguedad.total > 0 ? (antiguedad.total - antiguedad.CORRIENTE.saldo) / antiguedad.total : null,
    cxpVencidas: cxp.filter((c) => c.fechaVencimiento < hoy && c.estado !== "BLOQUEADA").reduce((s, c) => s + c.saldo, 0),
    alertas: {
      ocPorAprobar,
      pedidosPorAutorizar,
      cxpBloqueadas,
      articulosBajoRop: inventario.filter((a) => a.activo && a.sugerida > 0).length,
      articulosAgotados: inventario.filter((a) => a.activo && a.existencia <= 0).length,
      slaVencidos,
      riesgosSobreApetito: riesgosSobreApetito.length,
      excepciones,
    },
    compras: {
      recepciones: recepciones.length,
      calidad: totalRecibido > 0 ? 1 - totalRechazado / totalRecibido : null,
      puntualidad: recepciones.length > 0 ? recepciones.filter((r) => r.aTiempo).length / recepciones.length : null,
      conciliacionOk: conFactura.length > 0 ? conFactura.filter((r) => r.conciliacion === "OK").length / conFactura.length : null,
    },
    servicio: {
      abiertos: ticketsAbiertos.length,
      cumplimientoSla: conSla.length > 0 ? conSla.filter((t) => !slaIncumplido(t, hoy)).length / conSla.length : null,
    },
    gobierno: {
      madurezCobit: madurezPromedio(cobit),
      cumplimientoIso: cumplimiento(iso),
      brechas: controles.filter((c) => c.aplicable && brecha(c) > 0).length,
      controlesCargados: controles.length,
    },
  };
}
