"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { bitacoraErp, conErrores, obtenerContextoErp, sinPermisoArea } from "@/lib/erp/servidor/contexto";
import { registrarMovimiento } from "@/lib/erp/servidor/inventario";
import { esquemaAjuste, esquemaAlmacen, esquemaArticulo } from "@/lib/erp/validacion";
import { erroresDeZod, formDataAObjeto, type EstadoFormulario } from "@/lib/formularios";

import { esIdValido, MENSAJE_NO_ENCONTRADO, MENSAJE_REVISA } from "../establecimientos/_compartido/servidor";

function revalidarAlmacen() {
  revalidatePath("/almacen", "layout");
  revalidatePath("/compras", "layout");
  revalidatePath("/ventas", "layout");
  revalidatePath("/erp");
}

export async function guardarAlmacen(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "ALMACEN");
  if (sinPermiso) return sinPermiso;
  const valores = formDataAObjeto(formData);
  const r = esquemaAlmacen.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  const existe = await db.almacen.findFirst({ where: { empresaId: ctx.empresa.id, clave: r.data.clave }, select: { id: true } });
  if (existe) return { ok: false, mensaje: MENSAJE_REVISA, errores: { clave: ["Ya existe un almacén con esa clave."] }, valores };
  const a = await db.almacen.create({ data: { empresaId: ctx.empresa.id, clave: r.data.clave, nombre: r.data.nombre, ubicacion: r.data.ubicacion ?? null } });
  await bitacoraErp(ctx, "CREAR", "Almacen", a.id, { clave: a.clave });
  revalidarAlmacen();
  return { ok: true, mensaje: `Almacén ${a.clave} creado.` };
}

export async function cambiarActivoAlmacen(id: string): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "ALMACEN");
  if (sinPermiso) return sinPermiso;
  if (!esIdValido(id)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const a = await db.almacen.findFirst({ where: { id, empresaId: ctx.empresa.id } });
  if (!a) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  await db.almacen.update({ where: { id }, data: { activo: !a.activo } });
  await bitacoraErp(ctx, a.activo ? "DESACTIVAR" : "ACTIVAR", "Almacen", id);
  revalidarAlmacen();
  return { ok: true, mensaje: a.activo ? "Almacén desactivado." : "Almacén reactivado." };
}

export async function guardarArticulo(id: string | null, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "ALMACEN");
  if (sinPermiso) return sinPermiso;
  if (id !== null && !esIdValido(id)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const valores = formDataAObjeto(formData);
  const r = esquemaArticulo.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  const d = r.data;
  if (d.stockMaximo > 0 && d.stockMaximo < d.stockMinimo) {
    return { ok: false, mensaje: MENSAJE_REVISA, errores: { stockMaximo: ["El máximo no puede ser menor que el mínimo."] }, valores };
  }
  let proveedorPreferenteId: string | null = null;
  if (d.proveedorPreferenteId) {
    const p = await db.proveedor.findFirst({ where: { id: d.proveedorPreferenteId, empresaId: ctx.empresa.id }, select: { id: true } });
    if (!p) return { ok: false, mensaje: MENSAJE_REVISA, errores: { proveedorPreferenteId: ["Proveedor inválido."] }, valores };
    proveedorPreferenteId = p.id;
  }
  const duplicado = await db.articulo.findFirst({ where: { empresaId: ctx.empresa.id, sku: d.sku, ...(id ? { NOT: { id } } : {}) }, select: { id: true } });
  if (duplicado) return { ok: false, mensaje: MENSAJE_REVISA, errores: { sku: ["Ya existe un artículo con ese SKU."] }, valores };

  const datos = {
    sku: d.sku,
    nombre: d.nombre,
    categoria: d.categoria ?? null,
    unidad: d.unidad.toUpperCase(),
    precioVenta: d.precioVenta,
    tasaIvaBp: d.tasaIva,
    stockMinimo: d.stockMinimo,
    stockMaximo: d.stockMaximo,
    demandaAnual: d.demandaAnual,
    desviacionDemandaDiaria: d.desviacionDemandaDiaria,
    costoOrdenar: d.costoOrdenar,
    costoMantenerBp: d.costoMantener,
    tiempoEntregaDias: d.tiempoEntregaDias,
    proveedorPreferenteId,
  };
  if (id) {
    const existente = await db.articulo.findFirst({ where: { id, empresaId: ctx.empresa.id }, select: { id: true } });
    if (!existente) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
    await db.articulo.update({ where: { id }, data: datos });
    await bitacoraErp(ctx, "EDITAR", "Articulo", id, { sku: d.sku });
    revalidarAlmacen();
    return { ok: true, mensaje: "Artículo actualizado." };
  }
  const creado = await db.articulo.create({ data: { ...datos, empresaId: ctx.empresa.id } });
  await bitacoraErp(ctx, "CREAR", "Articulo", creado.id, { sku: d.sku });
  revalidarAlmacen();
  redirect(`/almacen/articulos/${creado.id}`);
}

export async function cambiarActivoArticulo(id: string): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "ALMACEN");
  if (sinPermiso) return sinPermiso;
  if (!esIdValido(id)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const a = await db.articulo.findFirst({ where: { id, empresaId: ctx.empresa.id } });
  if (!a) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  await db.articulo.update({ where: { id }, data: { activo: !a.activo } });
  await bitacoraErp(ctx, a.activo ? "DESACTIVAR" : "ACTIVAR", "Articulo", id);
  revalidarAlmacen();
  return { ok: true, mensaje: a.activo ? "Artículo desactivado." : "Artículo reactivado." };
}

/** Ajuste de inventario (conteo físico, merma, inventario inicial). Queda en el kárdex. */
export async function registrarAjuste(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "ALMACEN");
  if (sinPermiso) return sinPermiso;
  const valores = formDataAObjeto(formData);
  const r = esquemaAjuste.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  const [articulo, almacen] = await Promise.all([
    db.articulo.findFirst({ where: { id: r.data.articuloId, empresaId: ctx.empresa.id } }),
    db.almacen.findFirst({ where: { id: r.data.almacenId, empresaId: ctx.empresa.id } }),
  ]);
  if (!articulo || !almacen) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO, valores };
  const esEntrada = r.data.tipo !== "AJUSTE_SALIDA";
  const costo = r.data.costoUnitario ?? (articulo.ultimoCosto > 0 ? articulo.ultimoCosto : undefined);
  if (esEntrada && costo === undefined) {
    return { ok: false, mensaje: MENSAJE_REVISA, errores: { costoUnitario: ["Captura el costo unitario de la entrada."] }, valores };
  }
  return conErrores(async (): Promise<EstadoFormulario> => {
    const mov = await db.$transaction(async (tx) => {
      const m = await registrarMovimiento(tx, {
        empresaId: ctx.empresa.id,
        articuloId: articulo.id,
        almacenId: almacen.id,
        tipo: r.data.tipo,
        cantidad: r.data.cantidad,
        costoUnitario: costo,
        referenciaTipo: "AJUSTE",
        motivo: r.data.motivo,
        usuarioId: ctx.usuario.id,
      });
      if (esEntrada && articulo.ultimoCosto === 0 && costo) await tx.articulo.update({ where: { id: articulo.id }, data: { ultimoCosto: costo } });
      return m;
    });
    await bitacoraErp(ctx, "AJUSTE_INVENTARIO", "Articulo", articulo.id, { tipo: r.data.tipo, cantidad: r.data.cantidad, almacen: almacen.clave, motivo: r.data.motivo, movimiento: mov.id });
    revalidarAlmacen();
    return { ok: true, mensaje: `Ajuste registrado. Existencia en ${almacen.clave}: ${mov.saldoCantidad}.` };
  });
}
