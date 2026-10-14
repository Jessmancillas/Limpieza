"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { evaluarCredito, type DecisionCredito } from "@/lib/erp/decisiones/credito";
import { sumarDias, totalesDocumento } from "@/lib/erp/dinero";
import { puedeOperar, verificarSegregacion } from "@/lib/erp/permisos";
import { entradaCreditoCliente } from "@/lib/erp/servidor/consultas";
import { bitacoraErp, conErrores, ErrorNegocio, obtenerContextoErp, sinPermisoArea } from "@/lib/erp/servidor/contexto";
import { folio, siguienteNumero } from "@/lib/erp/servidor/folios";
import { registrarMovimiento } from "@/lib/erp/servidor/inventario";
import { esquemaCliente, esquemaPartidaVenta, esquemaPedido } from "@/lib/erp/validacion";
import { erroresDeZod, formDataAObjeto, type EstadoFormulario } from "@/lib/formularios";

import { esIdValido, MENSAJE_NO_ENCONTRADO, MENSAJE_REVISA } from "../establecimientos/_compartido/servidor";

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

function revalidarVentas() {
  revalidatePath("/ventas", "layout");
  revalidatePath("/cobranza", "layout");
  revalidatePath("/almacen", "layout");
  revalidatePath("/erp");
}

// ───────────────────────────── Clientes ─────────────────────────────

export async function guardarCliente(id: string | null, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "VENTAS");
  if (sinPermiso) return sinPermiso;
  if (id !== null && !esIdValido(id)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const valores = formDataAObjeto(formData);
  const r = esquemaCliente.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  const datos = { ...r.data, rfc: r.data.rfc ?? null, contacto: r.data.contacto ?? null, correoElectronico: r.data.correoElectronico ?? null, telefono: r.data.telefono ?? null, notas: r.data.notas ?? null };
  const duplicado = await db.cliente.findFirst({ where: { empresaId: ctx.empresa.id, clave: datos.clave, ...(id ? { NOT: { id } } : {}) }, select: { id: true } });
  if (duplicado) return { ok: false, mensaje: MENSAJE_REVISA, errores: { clave: ["Ya existe un cliente con esa clave."] }, valores };

  if (id) {
    const existente = await db.cliente.findFirst({ where: { id, empresaId: ctx.empresa.id } });
    if (!existente) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
    // Aumentar la línea de crédito es una decisión de riesgo: requiere Aprobador o administrador.
    if (datos.limiteCredito > existente.limiteCredito && !puedeOperar(ctx.rol, ctx.areas, "APROBADOR")) {
      return { ok: false, mensaje: MENSAJE_REVISA, errores: { limiteCredito: ["Solo un aprobador puede aumentar la línea de crédito."] }, valores };
    }
    await db.cliente.update({ where: { id }, data: datos });
    await bitacoraErp(ctx, "EDITAR", "Cliente", id, { clave: datos.clave, limiteAnterior: existente.limiteCredito, limiteNuevo: datos.limiteCredito });
    revalidarVentas();
    return { ok: true, mensaje: "Cliente actualizado." };
  }
  if (datos.limiteCredito > 0 && !puedeOperar(ctx.rol, ctx.areas, "APROBADOR")) {
    return { ok: false, mensaje: MENSAJE_REVISA, errores: { limiteCredito: ["Solo un aprobador puede otorgar línea de crédito. Da de alta en contado."] }, valores };
  }
  const creado = await db.cliente.create({ data: { ...datos, empresaId: ctx.empresa.id } });
  await bitacoraErp(ctx, "CREAR", "Cliente", creado.id, { clave: datos.clave, limiteCredito: datos.limiteCredito });
  revalidarVentas();
  redirect(`/ventas/clientes/${creado.id}`);
}

/** Suspende o reactiva el crédito del cliente (decisión de cobranza). */
export async function cambiarEstadoCliente(id: string): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "COBRANZA");
  if (sinPermiso) return sinPermiso;
  if (!esIdValido(id)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const c = await db.cliente.findFirst({ where: { id, empresaId: ctx.empresa.id } });
  if (!c) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const estado = c.estado === "SUSPENDIDO" ? "ACTIVO" : "SUSPENDIDO";
  await db.cliente.update({ where: { id }, data: { estado } });
  await bitacoraErp(ctx, estado === "SUSPENDIDO" ? "SUSPENDER_CREDITO" : "REACTIVAR_CREDITO", "Cliente", id);
  revalidarVentas();
  return { ok: true, mensaje: estado === "SUSPENDIDO" ? "Crédito suspendido." : "Crédito reactivado." };
}

// ───────────────────────────── Pedidos ─────────────────────────────

export async function crearPedido(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "VENTAS");
  if (sinPermiso) return sinPermiso;
  const valores = formDataAObjeto(formData);
  const r = esquemaPedido.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  const [cliente, almacen] = await Promise.all([
    db.cliente.findFirst({ where: { id: r.data.clienteId, empresaId: ctx.empresa.id } }),
    db.almacen.findFirst({ where: { id: r.data.almacenId, empresaId: ctx.empresa.id, activo: true } }),
  ]);
  if (!cliente || !almacen) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO, valores };
  const pedido = await db.$transaction(async (tx) => {
    const numero = await siguienteNumero(tx, "pedidoVenta", ctx.empresa.id);
    return tx.pedidoVenta.create({
      data: { empresaId: ctx.empresa.id, numero, clienteId: cliente.id, almacenId: almacen.id, condicionPago: r.data.condicionPago, notas: r.data.notas ?? null, creadoPorId: ctx.usuario.id },
    });
  });
  await bitacoraErp(ctx, "CREAR", "PedidoVenta", pedido.id, { numero: pedido.numero, cliente: cliente.clave });
  revalidarVentas();
  redirect(`/ventas/pedidos/${pedido.id}`);
}

async function pedidoEditable(empresaId: string, pedidoId: string) {
  if (!esIdValido(pedidoId)) throw new ErrorNegocio(MENSAJE_NO_ENCONTRADO);
  const pedido = await db.pedidoVenta.findFirst({ where: { id: pedidoId, empresaId } });
  if (!pedido) throw new ErrorNegocio(MENSAJE_NO_ENCONTRADO);
  if (pedido.estado !== "BORRADOR") throw new ErrorNegocio("Solo se modifican pedidos en borrador.");
  return pedido;
}

async function recalcularPedido(tx: Tx, pedidoId: string) {
  const partidas = await tx.partidaVenta.findMany({ where: { pedidoId } });
  const t = totalesDocumento(partidas.map((p) => ({ cantidad: p.cantidad, precioUnitario: p.precioUnitario, tasaIvaBp: p.tasaIvaBp, descuentoBp: p.descuentoBp })));
  await tx.pedidoVenta.update({ where: { id: pedidoId }, data: t });
}

export async function agregarPartidaPedido(pedidoId: string, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "VENTAS");
  if (sinPermiso) return sinPermiso;
  return conErrores(async (): Promise<EstadoFormulario> => {
    const pedido = await pedidoEditable(ctx.empresa.id, pedidoId);
    const valores = formDataAObjeto(formData);
    const r = esquemaPartidaVenta.safeParse(valores);
    if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
    const articulo = await db.articulo.findFirst({ where: { id: r.data.articuloId, empresaId: ctx.empresa.id, activo: true } });
    if (!articulo) return { ok: false, mensaje: "Elige un artículo activo." };
    const precio = r.data.precioUnitario ?? articulo.precioVenta;
    if (!(precio > 0)) return { ok: false, mensaje: MENSAJE_REVISA, errores: { precioUnitario: ["El artículo no tiene precio de lista: captúralo."] } };
    // Descuentos mayores al 15 % requieren aprobador (política comercial).
    if (r.data.descuento > 1500 && !puedeOperar(ctx.rol, ctx.areas, "APROBADOR")) {
      return { ok: false, mensaje: MENSAJE_REVISA, errores: { descuento: ["Descuentos mayores a 15 % requieren a un aprobador."] } };
    }
    await db.$transaction(async (tx) => {
      await tx.partidaVenta.create({
        data: { pedidoId: pedido.id, articuloId: articulo.id, cantidad: r.data.cantidad, precioUnitario: precio, descuentoBp: r.data.descuento, tasaIvaBp: articulo.tasaIvaBp },
      });
      await recalcularPedido(tx, pedido.id);
    });
    revalidarVentas();
    return { ok: true, mensaje: `Se agregó ${articulo.sku}.` };
  });
}

export async function quitarPartidaPedido(pedidoId: string, partidaId: string): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "VENTAS");
  if (sinPermiso) return sinPermiso;
  return conErrores(async (): Promise<EstadoFormulario> => {
    const pedido = await pedidoEditable(ctx.empresa.id, pedidoId);
    if (!esIdValido(partidaId)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
    await db.$transaction(async (tx) => {
      await tx.partidaVenta.deleteMany({ where: { id: partidaId, pedidoId: pedido.id } });
      await recalcularPedido(tx, pedido.id);
    });
    revalidarVentas();
    return { ok: true, mensaje: "Partida eliminada." };
  });
}

/**
 * Confirma el pedido. A crédito corre el modelo de decisión de crédito:
 * APROBAR → confirmado; REVISAR → por autorizar (aprobador); RECHAZAR → sigue en borrador.
 */
export async function confirmarPedido(pedidoId: string): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "VENTAS");
  if (sinPermiso) return sinPermiso;
  return conErrores(async (): Promise<EstadoFormulario> => {
    const pedido = await pedidoEditable(ctx.empresa.id, pedidoId);
    const partidas = await db.partidaVenta.count({ where: { pedidoId: pedido.id } });
    if (partidas === 0) return { ok: false, mensaje: "Agrega al menos una partida." };

    if (pedido.condicionPago === "CONTADO") {
      await db.pedidoVenta.update({ where: { id: pedido.id }, data: { estado: "CONFIRMADO" } });
      await bitacoraErp(ctx, "CONFIRMAR", "PedidoVenta", pedido.id, { numero: pedido.numero, condicion: "CONTADO" });
      revalidarVentas();
      return { ok: true, mensaje: "Pedido de contado confirmado." };
    }

    const entrada = await entradaCreditoCliente(ctx.empresa.id, pedido.clienteId, pedido.total);
    if (!entrada) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
    const decision: DecisionCredito = evaluarCredito(entrada, ctx.config);
    const estado = decision.decision === "APROBAR" ? "CONFIRMADO" : decision.decision === "REVISAR" ? "POR_AUTORIZAR" : "BORRADOR";
    await db.pedidoVenta.update({ where: { id: pedido.id }, data: { estado, evaluacionCredito: JSON.stringify(decision) } });
    await bitacoraErp(ctx, "EVALUAR_CREDITO", "PedidoVenta", pedido.id, { numero: pedido.numero, ...decision });
    revalidarVentas();
    const motivos = decision.motivos.join(" ");
    if (decision.decision === "APROBAR") return { ok: true, mensaje: `Crédito aprobado (puntaje ${decision.puntaje}). Pedido confirmado.` };
    if (decision.decision === "REVISAR") return { ok: true, mensaje: `Puntaje ${decision.puntaje}: requiere autorización de un aprobador. ${motivos}` };
    return { ok: false, mensaje: `Crédito rechazado (puntaje ${decision.puntaje}). ${motivos} Cambia a contado o atiende la cobranza.` };
  });
}

/** Excepción de crédito autorizada por un aprobador (no por quien capturó el pedido). */
export async function autorizarCredito(pedidoId: string): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "APROBADOR");
  if (sinPermiso) return sinPermiso;
  if (!esIdValido(pedidoId)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const pedido = await db.pedidoVenta.findFirst({ where: { id: pedidoId, empresaId: ctx.empresa.id } });
  if (!pedido || pedido.estado !== "POR_AUTORIZAR") return { ok: false, mensaje: "El pedido no está pendiente de autorización." };
  const sod = verificarSegregacion("PEDIDO_CAPTURA_AUTORIZA", ctx.usuario.id, pedido.creadoPorId, ctx.config.segregacionEstricta);
  if (!sod.permitido) return { ok: false, mensaje: sod.mensaje };
  await db.pedidoVenta.update({ where: { id: pedido.id }, data: { estado: "CONFIRMADO", autorizadoPorId: ctx.usuario.id } });
  await bitacoraErp(ctx, "AUTORIZAR_CREDITO", "PedidoVenta", pedido.id, { numero: pedido.numero, total: pedido.total, excepcion: sod.advertencia });
  revalidarVentas();
  return { ok: true, mensaje: "Excepción de crédito autorizada: pedido confirmado." };
}

/** Regresa a borrador (para cambiar condición de pago o partidas). */
export async function regresarPedidoABorrador(pedidoId: string): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "VENTAS");
  if (sinPermiso) return sinPermiso;
  if (!esIdValido(pedidoId)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const pedido = await db.pedidoVenta.findFirst({ where: { id: pedidoId, empresaId: ctx.empresa.id } });
  if (!pedido || !["POR_AUTORIZAR", "CONFIRMADO"].includes(pedido.estado)) return { ok: false, mensaje: "Solo pedidos por autorizar o confirmados (sin entregar)." };
  await db.pedidoVenta.update({ where: { id: pedido.id }, data: { estado: "BORRADOR", autorizadoPorId: null } });
  await bitacoraErp(ctx, "REGRESAR_BORRADOR", "PedidoVenta", pedido.id, { numero: pedido.numero });
  revalidarVentas();
  return { ok: true, mensaje: "El pedido volvió a borrador." };
}

export async function cambiarCondicionPedido(pedidoId: string): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "VENTAS");
  if (sinPermiso) return sinPermiso;
  return conErrores(async (): Promise<EstadoFormulario> => {
    const pedido = await pedidoEditable(ctx.empresa.id, pedidoId);
    const condicionPago = pedido.condicionPago === "CREDITO" ? "CONTADO" : "CREDITO";
    await db.pedidoVenta.update({ where: { id: pedido.id }, data: { condicionPago, evaluacionCredito: null } });
    revalidarVentas();
    return { ok: true, mensaje: `Condición de pago: ${condicionPago === "CREDITO" ? "crédito" : "contado"}.` };
  });
}

/**
 * Entrega (surtido): salida de inventario al costo promedio, costo de venta y alta de la cuenta
 * por cobrar (contado vence el mismo día; crédito según los días del cliente).
 */
export async function entregarPedido(pedidoId: string): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "ALMACEN");
  if (sinPermiso) return sinPermiso;
  if (!esIdValido(pedidoId)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  return conErrores(async (): Promise<EstadoFormulario> => {
    const pedido = await db.pedidoVenta.findFirst({
      where: { id: pedidoId, empresaId: ctx.empresa.id },
      include: { partidas: true, cliente: true },
    });
    if (!pedido) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
    if (pedido.estado !== "CONFIRMADO") return { ok: false, mensaje: "Solo se entregan pedidos confirmados." };
    if (pedido.condicionPago === "CREDITO" && pedido.cliente.estado === "SUSPENDIDO") {
      return { ok: false, mensaje: "El crédito del cliente se suspendió después de confirmar: no se puede entregar a crédito." };
    }
    const ahora = new Date();
    await db.$transaction(async (tx) => {
      let costoVenta = 0;
      for (const p of pedido.partidas) {
        const mov = await registrarMovimiento(tx, {
          empresaId: ctx.empresa.id,
          articuloId: p.articuloId,
          almacenId: pedido.almacenId,
          tipo: "SALIDA_VENTA",
          cantidad: p.cantidad,
          referenciaTipo: "PEDIDO_VENTA",
          referenciaId: pedido.id,
          usuarioId: ctx.usuario.id,
        });
        costoVenta += Math.round(p.cantidad * mov.costoUnitario);
        await tx.partidaVenta.update({ where: { id: p.id }, data: { costoUnitario: mov.costoUnitario } });
      }
      await tx.pedidoVenta.update({ where: { id: pedido.id }, data: { estado: "ENTREGADO", entregadoEn: ahora, costoVenta } });
      await tx.cuentaPorCobrar.create({
        data: {
          empresaId: ctx.empresa.id,
          clienteId: pedido.clienteId,
          pedidoId: pedido.id,
          folio: folio("FAC", pedido.numero),
          fechaEmision: ahora,
          fechaVencimiento: sumarDias(ahora, pedido.condicionPago === "CREDITO" ? pedido.cliente.diasCredito : 0),
          total: pedido.total,
          saldo: pedido.total,
        },
      });
    });
    await bitacoraErp(ctx, "ENTREGAR", "PedidoVenta", pedido.id, { numero: pedido.numero, total: pedido.total });
    revalidarVentas();
    return { ok: true, mensaje: "Pedido entregado: se registró la salida de inventario y la cuenta por cobrar." };
  });
}

export async function cancelarPedido(pedidoId: string): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "VENTAS");
  if (sinPermiso) return sinPermiso;
  if (!esIdValido(pedidoId)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const pedido = await db.pedidoVenta.findFirst({ where: { id: pedidoId, empresaId: ctx.empresa.id } });
  if (!pedido) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  if (["ENTREGADO", "CANCELADO"].includes(pedido.estado)) return { ok: false, mensaje: "El pedido ya fue entregado o cancelado." };
  await db.pedidoVenta.update({ where: { id: pedido.id }, data: { estado: "CANCELADO" } });
  await bitacoraErp(ctx, "CANCELAR", "PedidoVenta", pedido.id, { numero: pedido.numero });
  revalidarVentas();
  return { ok: true, mensaje: "Pedido cancelado." };
}
