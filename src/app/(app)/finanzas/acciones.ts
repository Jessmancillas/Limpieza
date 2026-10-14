"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { verificarSegregacion } from "@/lib/erp/permisos";
import { bitacoraErp, obtenerContextoErp, sinPermisoArea } from "@/lib/erp/servidor/contexto";
import { esquemaPago, esquemaTesoreria } from "@/lib/erp/validacion";
import { erroresDeZod, formDataAObjeto, type EstadoFormulario } from "@/lib/formularios";

import { esIdValido, MENSAJE_NO_ENCONTRADO, MENSAJE_REVISA } from "../establecimientos/_compartido/servidor";

function revalidarFinanzas() {
  revalidatePath("/finanzas", "layout");
  revalidatePath("/compras", "layout");
  revalidatePath("/erp");
}

/**
 * Pago a proveedor. Controles: la CxP no debe estar bloqueada por la conciliación y quien
 * registró la recepción no puede pagarla (segregación de funciones).
 */
export async function pagarCxP(cxpId: string, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "FINANZAS");
  if (sinPermiso) return sinPermiso;
  if (!esIdValido(cxpId)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const valores = formDataAObjeto(formData);
  const r = esquemaPago.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  const cxp = await db.cuentaPorPagar.findFirst({ where: { id: cxpId, empresaId: ctx.empresa.id }, include: { proveedor: true, recepcion: true } });
  if (!cxp) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  if (cxp.estado === "BLOQUEADA") return { ok: false, mensaje: "La cuenta está bloqueada por diferencias en la conciliación a tres vías." };
  if (!["PENDIENTE", "PARCIAL"].includes(cxp.estado)) return { ok: false, mensaje: "La cuenta no tiene saldo por pagar." };
  if (r.data.monto > cxp.saldo) return { ok: false, mensaje: MENSAJE_REVISA, errores: { monto: ["El pago excede el saldo."] }, valores };
  const sod = verificarSegregacion("RECIBE_PAGA", ctx.usuario.id, cxp.recepcion?.recibidoPorId, ctx.config.segregacionEstricta);
  if (!sod.permitido) return { ok: false, mensaje: sod.mensaje };

  const saldo = cxp.saldo - r.data.monto;
  await db.$transaction(async (tx) => {
    const pago = await tx.pagoProveedor.create({
      data: { cuentaPorPagarId: cxp.id, fecha: r.data.fecha, monto: r.data.monto, metodo: r.data.metodo, referencia: r.data.referencia ?? null, registradoPorId: ctx.usuario.id },
    });
    await tx.cuentaPorPagar.update({ where: { id: cxp.id }, data: { saldo, estado: saldo === 0 ? "PAGADA" : "PARCIAL" } });
    await tx.movimientoTesoreria.create({
      data: {
        empresaId: ctx.empresa.id,
        tipo: "EGRESO",
        categoria: "PAGO_PROVEEDOR",
        monto: r.data.monto,
        fecha: r.data.fecha,
        concepto: `Pago ${cxp.folio} · ${cxp.proveedor.razonSocial}`,
        referenciaTipo: "PAGO",
        referenciaId: pago.id,
        registradoPorId: ctx.usuario.id,
      },
    });
  });
  await bitacoraErp(ctx, "PAGAR", "CuentaPorPagar", cxp.id, { folio: cxp.folio, monto: r.data.monto, saldo, excepcion: sod.advertencia });
  revalidarFinanzas();
  return { ok: true, mensaje: saldo === 0 ? "Pago registrado: cuenta liquidada." : "Pago parcial registrado." };
}

/** Liberación de una CxP bloqueada (excepción a la conciliación) por un aprobador, con motivo. */
export async function liberarCxP(cxpId: string, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "APROBADOR");
  if (sinPermiso) return sinPermiso;
  if (!esIdValido(cxpId)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const motivo = String(formData.get("motivo") ?? "").trim().slice(0, 500);
  if (motivo.length < 10) return { ok: false, mensaje: "Justifica la liberación (mínimo 10 caracteres)." };
  const cxp = await db.cuentaPorPagar.findFirst({ where: { id: cxpId, empresaId: ctx.empresa.id }, include: { recepcion: true } });
  if (!cxp || cxp.estado !== "BLOQUEADA") return { ok: false, mensaje: "La cuenta no está bloqueada." };
  if (!cxp.recepcion?.folioFactura) return { ok: false, mensaje: "Primero registra la factura del proveedor." };
  await db.cuentaPorPagar.update({ where: { id: cxp.id }, data: { estado: "PENDIENTE", liberadaPorId: ctx.usuario.id } });
  await bitacoraErp(ctx, "LIBERAR_EXCEPCION", "CuentaPorPagar", cxp.id, { folio: cxp.folio, motivo, conciliacion: cxp.recepcion.conciliacion });
  revalidarFinanzas();
  return { ok: true, mensaje: "Cuenta liberada para pago. La excepción quedó en la bitácora." };
}

export async function registrarMovimientoTesoreria(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "FINANZAS");
  if (sinPermiso) return sinPermiso;
  const valores = formDataAObjeto(formData);
  const r = esquemaTesoreria.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  if (r.data.categoria === "COBRO_CLIENTE" || r.data.categoria === "PAGO_PROVEEDOR") {
    return { ok: false, mensaje: MENSAJE_REVISA, errores: { categoria: ["Cobros y pagos se registran desde Cobranza y Cuentas por pagar."] }, valores };
  }
  const m = await db.movimientoTesoreria.create({ data: { ...r.data, empresaId: ctx.empresa.id, registradoPorId: ctx.usuario.id } });
  await bitacoraErp(ctx, "CREAR", "MovimientoTesoreria", m.id, { tipo: m.tipo, categoria: m.categoria, monto: m.monto });
  revalidarFinanzas();
  return { ok: true, mensaje: "Movimiento registrado." };
}
