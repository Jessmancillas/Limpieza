"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { bitacoraErp, obtenerContextoErp, sinPermisoArea } from "@/lib/erp/servidor/contexto";
import { esquemaGestion, esquemaPago } from "@/lib/erp/validacion";
import { erroresDeZod, formDataAObjeto, type EstadoFormulario } from "@/lib/formularios";

import { esIdValido, MENSAJE_NO_ENCONTRADO, MENSAJE_REVISA } from "../establecimientos/_compartido/servidor";

function revalidarCobranza() {
  revalidatePath("/cobranza", "layout");
  revalidatePath("/ventas", "layout");
  revalidatePath("/finanzas", "layout");
  revalidatePath("/erp");
}

/** Aplica un cobro a la cuenta por cobrar y lo registra como ingreso en tesorería. */
export async function registrarCobro(cxcId: string, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "COBRANZA");
  if (sinPermiso) return sinPermiso;
  if (!esIdValido(cxcId)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const valores = formDataAObjeto(formData);
  const r = esquemaPago.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  const cxc = await db.cuentaPorCobrar.findFirst({ where: { id: cxcId, empresaId: ctx.empresa.id }, include: { cliente: true } });
  if (!cxc) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  if (!["PENDIENTE", "PARCIAL"].includes(cxc.estado)) return { ok: false, mensaje: "La cuenta no tiene saldo por cobrar." };
  if (r.data.monto > cxc.saldo) return { ok: false, mensaje: MENSAJE_REVISA, errores: { monto: ["El cobro excede el saldo."] }, valores };

  const saldo = cxc.saldo - r.data.monto;
  await db.$transaction(async (tx) => {
    const cobro = await tx.cobro.create({
      data: { cuentaPorCobrarId: cxc.id, fecha: r.data.fecha, monto: r.data.monto, metodo: r.data.metodo, referencia: r.data.referencia ?? null, registradoPorId: ctx.usuario.id },
    });
    await tx.cuentaPorCobrar.update({ where: { id: cxc.id }, data: { saldo, estado: saldo === 0 ? "PAGADA" : "PARCIAL" } });
    await tx.movimientoTesoreria.create({
      data: {
        empresaId: ctx.empresa.id,
        tipo: "INGRESO",
        categoria: "COBRO_CLIENTE",
        monto: r.data.monto,
        fecha: r.data.fecha,
        concepto: `Cobro ${cxc.folio} · ${cxc.cliente.razonSocial}`,
        referenciaTipo: "COBRO",
        referenciaId: cobro.id,
        registradoPorId: ctx.usuario.id,
      },
    });
  });
  await bitacoraErp(ctx, "COBRAR", "CuentaPorCobrar", cxc.id, { folio: cxc.folio, monto: r.data.monto, saldo });
  revalidarCobranza();
  return { ok: true, mensaje: saldo === 0 ? "Cobro registrado: cuenta liquidada." : "Cobro parcial registrado." };
}

/** Gestión de cobranza. SUSPENSION suspende el crédito del cliente. */
export async function registrarGestion(cxcId: string, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "COBRANZA");
  if (sinPermiso) return sinPermiso;
  if (!esIdValido(cxcId)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const valores = formDataAObjeto(formData);
  const r = esquemaGestion.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  if (r.data.tipo === "PROMESA_PAGO" && !r.data.fechaPromesa) {
    return { ok: false, mensaje: MENSAJE_REVISA, errores: { fechaPromesa: ["Indica la fecha prometida."] }, valores };
  }
  const cxc = await db.cuentaPorCobrar.findFirst({ where: { id: cxcId, empresaId: ctx.empresa.id } });
  if (!cxc) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  await db.$transaction(async (tx) => {
    await tx.gestionCobranza.create({
      data: { cuentaPorCobrarId: cxc.id, tipo: r.data.tipo, nota: r.data.nota, fechaPromesa: r.data.fechaPromesa ?? null, registradoPorId: ctx.usuario.id },
    });
    if (r.data.tipo === "SUSPENSION") await tx.cliente.update({ where: { id: cxc.clienteId }, data: { estado: "SUSPENDIDO" } });
  });
  await bitacoraErp(ctx, "GESTION_COBRANZA", "CuentaPorCobrar", cxc.id, { tipo: r.data.tipo });
  revalidarCobranza();
  return { ok: true, mensaje: r.data.tipo === "SUSPENSION" ? "Gestión registrada y crédito del cliente suspendido." : "Gestión registrada." };
}

/** Castigo de cartera: solo administradores (decisión de dirección). */
export async function marcarIncobrable(cxcId: string): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  if (ctx.rol !== "ADMIN") return { ok: false, mensaje: "Solo un administrador puede castigar cartera como incobrable." };
  if (!esIdValido(cxcId)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const cxc = await db.cuentaPorCobrar.findFirst({ where: { id: cxcId, empresaId: ctx.empresa.id } });
  if (!cxc || !["PENDIENTE", "PARCIAL"].includes(cxc.estado)) return { ok: false, mensaje: "La cuenta no tiene saldo abierto." };
  await db.cuentaPorCobrar.update({ where: { id: cxc.id }, data: { estado: "INCOBRABLE" } });
  await bitacoraErp(ctx, "CASTIGAR_INCOBRABLE", "CuentaPorCobrar", cxc.id, { folio: cxc.folio, saldo: cxc.saldo });
  revalidarCobranza();
  return { ok: true, mensaje: "Cuenta castigada como incobrable." };
}
