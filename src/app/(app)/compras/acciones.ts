"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { enLista, ESTADOS_PROVEEDOR } from "@/lib/erp/constantes";
import { conciliarTresVias, nivelAprobacionOC, puedeAprobarOC } from "@/lib/erp/decisiones/compras";
import { redondearCantidad, sumarDias, totalesDocumento } from "@/lib/erp/dinero";
import { verificarSegregacion } from "@/lib/erp/permisos";
import { analizarInventario } from "@/lib/erp/servidor/consultas";
import { bitacoraErp, conErrores, ErrorNegocio, obtenerContextoErp, sinPermisoArea } from "@/lib/erp/servidor/contexto";
import { siguienteNumero } from "@/lib/erp/servidor/folios";
import { registrarMovimiento } from "@/lib/erp/servidor/inventario";
import { esquemaFactura, esquemaOrdenCompra, esquemaPartidaCompra, esquemaProveedor, zFecha, zPesosOpcional } from "@/lib/erp/validacion";
import { erroresDeZod, formDataAObjeto, type EstadoFormulario } from "@/lib/formularios";

import { esIdValido, MENSAJE_NO_ENCONTRADO, MENSAJE_REVISA } from "../establecimientos/_compartido/servidor";

function revalidarCompras() {
  revalidatePath("/compras", "layout");
  revalidatePath("/almacen", "layout");
  revalidatePath("/finanzas", "layout");
  revalidatePath("/erp");
}

// ───────────────────────────── Proveedores ─────────────────────────────

export async function guardarProveedor(id: string | null, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "COMPRAS");
  if (sinPermiso) return sinPermiso;
  if (id !== null && !esIdValido(id)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };

  const valores = formDataAObjeto(formData);
  const r = esquemaProveedor.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  const datos = { ...r.data, rfc: r.data.rfc ?? null, contacto: r.data.contacto ?? null, correoElectronico: r.data.correoElectronico ?? null, telefono: r.data.telefono ?? null, notas: r.data.notas ?? null };

  const duplicado = await db.proveedor.findFirst({ where: { empresaId: ctx.empresa.id, clave: datos.clave, ...(id ? { NOT: { id } } : {}) }, select: { id: true } });
  if (duplicado) return { ok: false, mensaje: MENSAJE_REVISA, errores: { clave: ["Ya existe un proveedor con esa clave."] }, valores };

  if (id) {
    const existente = await db.proveedor.findFirst({ where: { id, empresaId: ctx.empresa.id }, select: { id: true } });
    if (!existente) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
    await db.proveedor.update({ where: { id }, data: datos });
    await bitacoraErp(ctx, "EDITAR", "Proveedor", id, { clave: datos.clave });
    revalidarCompras();
    return { ok: true, mensaje: "Proveedor actualizado." };
  }
  const creado = await db.proveedor.create({ data: { ...datos, empresaId: ctx.empresa.id } });
  await bitacoraErp(ctx, "CREAR", "Proveedor", creado.id, { clave: datos.clave });
  revalidarCompras();
  redirect(`/compras/proveedores/${creado.id}`);
}

/** ACTIVO / EN_EVALUACION / BLOQUEADO (decisión del scorecard). Bloquear impide nuevas OC. */
export async function cambiarEstadoProveedor(id: string, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "COMPRAS");
  if (sinPermiso) return sinPermiso;
  const estado = formData.get("estado");
  if (!esIdValido(id) || !enLista(ESTADOS_PROVEEDOR, estado)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const p = await db.proveedor.findFirst({ where: { id, empresaId: ctx.empresa.id }, select: { id: true, estado: true } });
  if (!p) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  await db.proveedor.update({ where: { id }, data: { estado } });
  await bitacoraErp(ctx, "CAMBIAR_ESTADO", "Proveedor", id, { de: p.estado, a: estado });
  revalidarCompras();
  return { ok: true, mensaje: "Estado del proveedor actualizado." };
}

// ───────────────────────────── Órdenes de compra ─────────────────────────────

async function recalcularOC(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], ordenId: string) {
  const partidas = await tx.partidaOrdenCompra.findMany({ where: { ordenCompraId: ordenId } });
  const t = totalesDocumento(partidas.map((p) => ({ cantidad: p.cantidad, precioUnitario: p.costoUnitario, tasaIvaBp: p.tasaIvaBp })));
  await tx.ordenCompra.update({ where: { id: ordenId }, data: t });
}

export async function crearOrdenCompra(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "COMPRAS");
  if (sinPermiso) return sinPermiso;
  const valores = formDataAObjeto(formData);
  const r = esquemaOrdenCompra.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  const [proveedor, almacen] = await Promise.all([
    db.proveedor.findFirst({ where: { id: r.data.proveedorId, empresaId: ctx.empresa.id } }),
    db.almacen.findFirst({ where: { id: r.data.almacenId, empresaId: ctx.empresa.id, activo: true } }),
  ]);
  if (!proveedor || !almacen) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO, valores };
  if (proveedor.estado === "BLOQUEADO") return { ok: false, mensaje: "El proveedor está bloqueado: no se le pueden emitir órdenes de compra.", valores };

  const orden = await db.$transaction(async (tx) => {
    const numero = await siguienteNumero(tx, "ordenCompra", ctx.empresa.id);
    return tx.ordenCompra.create({
      data: {
        empresaId: ctx.empresa.id,
        numero,
        proveedorId: proveedor.id,
        almacenId: almacen.id,
        fechaEntrega: r.data.fechaEntrega ?? null,
        notas: r.data.notas ?? null,
        creadoPorId: ctx.usuario.id,
      },
    });
  });
  await bitacoraErp(ctx, "CREAR", "OrdenCompra", orden.id, { numero: orden.numero, proveedor: proveedor.clave });
  revalidarCompras();
  redirect(`/compras/ordenes/${orden.id}`);
}

async function ordenEditable(empresaId: string, ordenId: string) {
  if (!esIdValido(ordenId)) throw new ErrorNegocio(MENSAJE_NO_ENCONTRADO);
  const orden = await db.ordenCompra.findFirst({ where: { id: ordenId, empresaId } });
  if (!orden) throw new ErrorNegocio(MENSAJE_NO_ENCONTRADO);
  if (orden.estado !== "BORRADOR") throw new ErrorNegocio("Solo se modifican órdenes en borrador.");
  return orden;
}

export async function agregarPartidaOC(ordenId: string, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "COMPRAS");
  if (sinPermiso) return sinPermiso;
  return conErrores(async (): Promise<EstadoFormulario> => {
    const orden = await ordenEditable(ctx.empresa.id, ordenId);
    const valores = formDataAObjeto(formData);
    const r = esquemaPartidaCompra.safeParse(valores);
    if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
    const articulo = await db.articulo.findFirst({ where: { id: r.data.articuloId, empresaId: ctx.empresa.id, activo: true } });
    if (!articulo) return { ok: false, mensaje: "Elige un artículo activo." };
    const costoUnitario = r.data.costoUnitario ?? articulo.ultimoCosto;
    if (!(costoUnitario > 0)) return { ok: false, mensaje: MENSAJE_REVISA, errores: { costoUnitario: ["Captura el costo unitario (el artículo no tiene último costo)."] } };
    await db.$transaction(async (tx) => {
      await tx.partidaOrdenCompra.create({
        data: { ordenCompraId: orden.id, articuloId: articulo.id, cantidad: r.data.cantidad, costoUnitario, tasaIvaBp: articulo.tasaIvaBp },
      });
      await recalcularOC(tx, orden.id);
    });
    revalidarCompras();
    return { ok: true, mensaje: `Se agregó ${articulo.sku}.` };
  });
}

export async function quitarPartidaOC(ordenId: string, partidaId: string): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "COMPRAS");
  if (sinPermiso) return sinPermiso;
  return conErrores(async (): Promise<EstadoFormulario> => {
    const orden = await ordenEditable(ctx.empresa.id, ordenId);
    if (!esIdValido(partidaId)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
    await db.$transaction(async (tx) => {
      await tx.partidaOrdenCompra.deleteMany({ where: { id: partidaId, ordenCompraId: orden.id } });
      await recalcularOC(tx, orden.id);
    });
    revalidarCompras();
    return { ok: true, mensaje: "Partida eliminada." };
  });
}

/**
 * Envía la OC al flujo de autorización. Modelo de decisión: matriz por monto. Si el total está
 * dentro de la política (nivel 0) se aprueba automáticamente.
 */
export async function enviarOC(ordenId: string): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "COMPRAS");
  if (sinPermiso) return sinPermiso;
  return conErrores(async (): Promise<EstadoFormulario> => {
    const orden = await ordenEditable(ctx.empresa.id, ordenId);
    const partidas = await db.partidaOrdenCompra.count({ where: { ordenCompraId: orden.id } });
    if (partidas === 0) return { ok: false, mensaje: "Agrega al menos una partida." };
    const nivel = nivelAprobacionOC(orden.total, ctx.config);
    const ahora = new Date();
    await db.ordenCompra.update({
      where: { id: orden.id },
      data: nivel === 0
        ? { estado: "APROBADA", nivelAprobacion: 0, enviadaEn: ahora, aprobadoEn: ahora }
        : { estado: "POR_APROBAR", nivelAprobacion: nivel, enviadaEn: ahora },
    });
    await bitacoraErp(ctx, nivel === 0 ? "APROBAR_AUTOMATICO" : "ENVIAR_APROBACION", "OrdenCompra", orden.id, { numero: orden.numero, total: orden.total, nivel });
    revalidarCompras();
    return {
      ok: true,
      mensaje: nivel === 0 ? "Dentro de política: la OC quedó aprobada automáticamente." : `Enviada a aprobación (nivel ${nivel}).`,
    };
  });
}

export async function aprobarOC(ordenId: string): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  if (!esIdValido(ordenId)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const orden = await db.ordenCompra.findFirst({ where: { id: ordenId, empresaId: ctx.empresa.id } });
  if (!orden) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  if (orden.estado !== "POR_APROBAR") return { ok: false, mensaje: "La OC no está pendiente de aprobación." };
  // El nivel se recalcula con la política vigente (no se confía en el guardado si cambió el monto).
  const nivel = Math.max(orden.nivelAprobacion, nivelAprobacionOC(orden.total, ctx.config)) as 0 | 1 | 2;
  const decision = puedeAprobarOC({
    nivel,
    rol: ctx.rol,
    areas: ctx.areas,
    aprobadorId: ctx.usuario.id,
    creadorId: orden.creadoPorId,
    segregacionEstricta: ctx.config.segregacionEstricta,
  });
  if (!decision.permitido) return { ok: false, mensaje: decision.motivo };
  await db.ordenCompra.update({ where: { id: orden.id }, data: { estado: "APROBADA", aprobadoPorId: ctx.usuario.id, aprobadoEn: new Date() } });
  await bitacoraErp(ctx, "APROBAR", "OrdenCompra", orden.id, { numero: orden.numero, total: orden.total, nivel, excepcion: decision.advertencia });
  revalidarCompras();
  return { ok: true, mensaje: decision.advertencia ? `OC aprobada. Excepción registrada: ${decision.advertencia}` : "OC aprobada." };
}

export async function rechazarOC(ordenId: string, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  if (!esIdValido(ordenId)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const motivo = String(formData.get("motivo") ?? "").trim().slice(0, 500);
  if (!motivo) return { ok: false, mensaje: "Explica el motivo del rechazo." };
  const orden = await db.ordenCompra.findFirst({ where: { id: ordenId, empresaId: ctx.empresa.id } });
  if (!orden || orden.estado !== "POR_APROBAR") return { ok: false, mensaje: "La OC no está pendiente de aprobación." };
  const decision = puedeAprobarOC({ nivel: orden.nivelAprobacion as 0 | 1 | 2, rol: ctx.rol, areas: ctx.areas, aprobadorId: ctx.usuario.id, creadorId: null, segregacionEstricta: true });
  if (!decision.permitido) return { ok: false, mensaje: decision.motivo };
  await db.ordenCompra.update({ where: { id: orden.id }, data: { estado: "RECHAZADA", motivoRechazo: motivo, aprobadoPorId: ctx.usuario.id, aprobadoEn: new Date() } });
  await bitacoraErp(ctx, "RECHAZAR", "OrdenCompra", orden.id, { numero: orden.numero, motivo });
  revalidarCompras();
  return { ok: true, mensaje: "OC rechazada." };
}

/** Regresa una OC rechazada a borrador para corregirla. */
export async function reabrirOC(ordenId: string): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "COMPRAS");
  if (sinPermiso) return sinPermiso;
  if (!esIdValido(ordenId)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const orden = await db.ordenCompra.findFirst({ where: { id: ordenId, empresaId: ctx.empresa.id } });
  if (!orden || !["RECHAZADA", "POR_APROBAR"].includes(orden.estado)) return { ok: false, mensaje: "Solo se reabren OC rechazadas o pendientes de aprobación." };
  await db.ordenCompra.update({ where: { id: orden.id }, data: { estado: "BORRADOR", aprobadoPorId: null, aprobadoEn: null, enviadaEn: null } });
  await bitacoraErp(ctx, "REABRIR", "OrdenCompra", orden.id, { numero: orden.numero });
  revalidarCompras();
  return { ok: true, mensaje: "La OC volvió a borrador." };
}

export async function cancelarOC(ordenId: string): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "COMPRAS");
  if (sinPermiso) return sinPermiso;
  if (!esIdValido(ordenId)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const orden = await db.ordenCompra.findFirst({ where: { id: ordenId, empresaId: ctx.empresa.id }, include: { _count: { select: { recepciones: true } } } });
  if (!orden) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  if (orden._count.recepciones > 0 || ["RECIBIDA", "CANCELADA"].includes(orden.estado)) {
    return { ok: false, mensaje: "No se puede cancelar: ya tiene recepciones o está cerrada." };
  }
  await db.ordenCompra.update({ where: { id: orden.id }, data: { estado: "CANCELADA" } });
  await bitacoraErp(ctx, "CANCELAR", "OrdenCompra", orden.id, { numero: orden.numero });
  revalidarCompras();
  return { ok: true, mensaje: "OC cancelada." };
}

// ───────────────────────────── Recepción ─────────────────────────────

/**
 * Recepción de mercancía: entradas al kárdex al costo de la OC, conciliación a tres vías con la
 * factura y alta de la cuenta por pagar (BLOQUEADA si la conciliación no cuadra).
 * Campos: fecha, folioFactura, importeFactura, notas y por partida `recibida_<id>`,
 * `rechazada_<id>`, `motivo_<id>`.
 */
export async function registrarRecepcion(ordenId: string, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "ALMACEN");
  if (sinPermiso) return sinPermiso;
  if (!esIdValido(ordenId)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const valores = formDataAObjeto(formData);

  return conErrores(async (): Promise<EstadoFormulario> => {
    const orden = await db.ordenCompra.findFirst({
      where: { id: ordenId, empresaId: ctx.empresa.id },
      include: { partidas: { include: { articulo: true } }, proveedor: true },
    });
    if (!orden) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
    if (!["APROBADA", "RECIBIDA_PARCIAL"].includes(orden.estado)) return { ok: false, mensaje: "Solo se reciben órdenes aprobadas." };

    const sod = verificarSegregacion("OC_APRUEBA_RECIBE", ctx.usuario.id, orden.aprobadoPorId, ctx.config.segregacionEstricta);
    if (!sod.permitido) return { ok: false, mensaje: sod.mensaje };

    const fecha = zFecha().safeParse(valores.fecha ?? "");
    if (!fecha.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: { fecha: ["Fecha de recepción inválida"] }, valores };
    const importeFactura = zPesosOpcional.safeParse(valores.importeFactura);
    if (!importeFactura.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: { importeFactura: ["Importe inválido"] }, valores };
    const folioFactura = (valores.folioFactura ?? "").trim().slice(0, 60) || null;
    if ((importeFactura.data ?? null) !== null && !folioFactura) {
      return { ok: false, mensaje: MENSAJE_REVISA, errores: { folioFactura: ["Captura el folio de la factura"] }, valores };
    }

    const errores: Record<string, string[]> = {};
    const lineas: Array<{ partida: (typeof orden.partidas)[number]; recibida: number; rechazada: number; motivo: string | null }> = [];
    for (const p of orden.partidas) {
      const leer = (campo: string) => {
        const t = (valores[`${campo}_${p.id}`] ?? "").trim();
        if (t === "") return 0;
        const n = Number(t);
        if (!Number.isFinite(n) || n < 0 || !/^\d{1,12}(\.\d{1,3})?$/.test(t)) {
          errores[`${campo}_${p.articulo.sku}`] = ["Cantidad inválida"];
          return 0;
        }
        return redondearCantidad(n);
      };
      const recibida = leer("recibida");
      const rechazada = leer("rechazada");
      const motivo = (valores[`motivo_${p.id}`] ?? "").trim().slice(0, 200) || null;
      if (rechazada > 0 && !motivo) errores[`motivo_${p.articulo.sku}`] = ["Indica el motivo del rechazo"];
      if (recibida > 0 || rechazada > 0) lineas.push({ partida: p, recibida, rechazada, motivo });
    }
    if (Object.keys(errores).length > 0) return { ok: false, mensaje: MENSAJE_REVISA, errores, valores };
    if (lineas.length === 0) return { ok: false, mensaje: "Captura la cantidad recibida de al menos una partida.", valores };

    const conciliacion = conciliarTresVias({
      partidas: lineas.map((l) => ({
        cantidadOrdenada: l.partida.cantidad,
        cantidadRecibidaAcumulada: l.partida.cantidadRecibida + l.recibida,
        cantidadRecibida: l.recibida,
        costoUnitario: l.partida.costoUnitario,
        tasaIvaBp: l.partida.tasaIvaBp,
      })),
      importeFactura: importeFactura.data ?? null,
      toleranciaPrecioBp: ctx.config.toleranciaPrecioBp,
      toleranciaCantidadBp: ctx.config.toleranciaCantidadBp,
    });
    if (conciliacion.resultado === "DIFERENCIA_CANTIDAD") {
      return { ok: false, mensaje: `No se puede recibir más de lo ordenado. ${conciliacion.motivos.join(" ")}`, valores };
    }
    const finDia = orden.fechaEntrega ? new Date(orden.fechaEntrega.getTime() + 86_399_999) : null;
    const aTiempo = !finDia || fecha.data <= finDia;

    const recepcion = await db.$transaction(async (tx) => {
      const numero = await siguienteNumero(tx, "recepcion", ctx.empresa.id);
      const rec = await tx.recepcion.create({
        data: {
          empresaId: ctx.empresa.id,
          numero,
          ordenCompraId: orden.id,
          almacenId: orden.almacenId,
          fecha: fecha.data,
          folioFactura,
          importeFactura: importeFactura.data ?? null,
          conciliacion: conciliacion.resultado,
          aTiempo,
          recibidoPorId: ctx.usuario.id,
          notas: (valores.notas ?? "").trim().slice(0, 500) || null,
        },
      });
      for (const l of lineas) {
        await tx.partidaRecepcion.create({
          data: { recepcionId: rec.id, partidaOrdenId: l.partida.id, cantidadRecibida: l.recibida, cantidadRechazada: l.rechazada, motivoRechazo: l.motivo },
        });
        if (l.recibida > 0) {
          await registrarMovimiento(tx, {
            empresaId: ctx.empresa.id,
            articuloId: l.partida.articuloId,
            almacenId: orden.almacenId,
            tipo: "ENTRADA_COMPRA",
            cantidad: l.recibida,
            costoUnitario: l.partida.costoUnitario,
            referenciaTipo: "RECEPCION",
            referenciaId: rec.id,
            usuarioId: ctx.usuario.id,
          });
          await tx.articulo.update({ where: { id: l.partida.articuloId }, data: { ultimoCosto: l.partida.costoUnitario } });
        }
        await tx.partidaOrdenCompra.update({
          where: { id: l.partida.id },
          data: { cantidadRecibida: redondearCantidad(l.partida.cantidadRecibida + l.recibida) },
        });
      }
      const pendientes = await tx.partidaOrdenCompra.findMany({ where: { ordenCompraId: orden.id }, select: { cantidad: true, cantidadRecibida: true } });
      const completa = pendientes.every((p) => p.cantidadRecibida >= p.cantidad - 1e-9);
      await tx.ordenCompra.update({ where: { id: orden.id }, data: { estado: completa ? "RECIBIDA" : "RECIBIDA_PARCIAL" } });

      const total = importeFactura.data ?? conciliacion.importeEsperado;
      if (total > 0) {
        await tx.cuentaPorPagar.create({
          data: {
            empresaId: ctx.empresa.id,
            proveedorId: orden.proveedorId,
            recepcionId: rec.id,
            folio: folioFactura ?? `REC-${numero}`,
            fechaEmision: fecha.data,
            fechaVencimiento: sumarDias(fecha.data, orden.proveedor.diasCredito),
            total,
            saldo: total,
            estado: conciliacion.resultado === "OK" ? "PENDIENTE" : "BLOQUEADA",
          },
        });
      }
      return rec;
    });

    await bitacoraErp(ctx, "RECIBIR", "OrdenCompra", orden.id, {
      recepcion: recepcion.numero,
      conciliacion: conciliacion.resultado,
      diferencia: conciliacion.diferencia,
      aTiempo,
      excepcion: sod.advertencia,
    });
    revalidarCompras();
    const aviso =
      conciliacion.resultado === "OK"
        ? "Conciliación a tres vías correcta: la cuenta por pagar quedó liberada."
        : `La cuenta por pagar quedó BLOQUEADA: ${conciliacion.motivos.join(" ")}`;
    return { ok: true, mensaje: `Recepción ${recepcion.numero} registrada. ${aviso}` };
  });
}

// ───────────────────────────── Sugerencias de compra ─────────────────────────────

/**
 * Genera OC en borrador con las cantidades sugeridas por el modelo de inventario (EOQ/ROP),
 * agrupadas por proveedor preferente. Los artículos sin proveedor preferente se omiten.
 */
export async function generarOCSugeridas(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "COMPRAS");
  if (sinPermiso) return sinPermiso;
  const almacenId = String(formData.get("almacenId") ?? "");
  const almacen = esIdValido(almacenId) ? await db.almacen.findFirst({ where: { id: almacenId, empresaId: ctx.empresa.id, activo: true } }) : null;
  if (!almacen) return { ok: false, mensaje: "Elige el almacén destino." };

  const analisis = (await analizarInventario(ctx.empresa.id, ctx.config.factorServicioZ)).filter((a) => a.sugerida > 0 && a.proveedorPreferenteId);
  if (analisis.length === 0) return { ok: false, mensaje: "No hay artículos con proveedor preferente que requieran compra." };
  const proveedores = await db.proveedor.findMany({
    where: { empresaId: ctx.empresa.id, id: { in: [...new Set(analisis.map((a) => a.proveedorPreferenteId!))] }, estado: { not: "BLOQUEADO" } },
  });
  const articulos = await db.articulo.findMany({ where: { id: { in: analisis.map((a) => a.id) } }, select: { id: true, ultimoCosto: true, tasaIvaBp: true } });
  const infoArticulo = new Map(articulos.map((a) => [a.id, a]));

  const creadas: number[] = [];
  for (const p of proveedores) {
    const lineas = analisis.filter((a) => a.proveedorPreferenteId === p.id);
    const orden = await db.$transaction(async (tx) => {
      const numero = await siguienteNumero(tx, "ordenCompra", ctx.empresa.id);
      const oc = await tx.ordenCompra.create({
        data: { empresaId: ctx.empresa.id, numero, proveedorId: p.id, almacenId: almacen.id, creadoPorId: ctx.usuario.id, notas: "Generada por el modelo de reabastecimiento (EOQ / punto de reorden)." },
      });
      for (const l of lineas) {
        const info = infoArticulo.get(l.id)!;
        await tx.partidaOrdenCompra.create({
          data: { ordenCompraId: oc.id, articuloId: l.id, cantidad: l.sugerida, costoUnitario: info.ultimoCosto || l.costoUnitario, tasaIvaBp: info.tasaIvaBp },
        });
      }
      await recalcularOC(tx, oc.id);
      return oc;
    });
    creadas.push(orden.numero);
    await bitacoraErp(ctx, "CREAR_SUGERIDA", "OrdenCompra", orden.id, { numero: orden.numero, proveedor: p.clave, partidas: lineas.length });
  }
  revalidarCompras();
  if (creadas.length === 0) return { ok: false, mensaje: "Los proveedores preferentes están bloqueados: no se generaron OC." };
  return { ok: true, mensaje: `Se generaron ${creadas.length} OC en borrador: ${creadas.map((n) => `#${n}`).join(", ")}. Revísalas y envíalas a aprobación.` };
}

// ───────────────────────────── Factura de CxP ─────────────────────────────

/** Registra (o corrige) la factura de una CxP bloqueada y vuelve a correr la conciliación. */
export async function registrarFacturaCxP(cxpId: string, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContextoErp();
  const sinPermiso = sinPermisoArea(ctx, "FINANZAS");
  if (sinPermiso) return sinPermiso;
  if (!esIdValido(cxpId)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const valores = formDataAObjeto(formData);
  const r = esquemaFactura.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  const cxp = await db.cuentaPorPagar.findFirst({
    where: { id: cxpId, empresaId: ctx.empresa.id },
    include: { pagos: true, recepcion: { include: { partidas: { include: { partidaOrden: true } } } } },
  });
  if (!cxp) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  if (cxp.pagos.length > 0 || !["BLOQUEADA", "PENDIENTE"].includes(cxp.estado)) return { ok: false, mensaje: "Solo se corrige la factura de cuentas sin pagos." };
  if (!cxp.recepcion) return { ok: false, mensaje: "Esta cuenta no proviene de una recepción." };

  const conc = conciliarTresVias({
    partidas: cxp.recepcion.partidas.map((p) => ({
      cantidadOrdenada: p.partidaOrden.cantidad,
      cantidadRecibidaAcumulada: p.partidaOrden.cantidadRecibida,
      cantidadRecibida: p.cantidadRecibida,
      costoUnitario: p.partidaOrden.costoUnitario,
      tasaIvaBp: p.partidaOrden.tasaIvaBp,
    })),
    importeFactura: r.data.importeFactura,
    toleranciaPrecioBp: ctx.config.toleranciaPrecioBp,
    toleranciaCantidadBp: ctx.config.toleranciaCantidadBp,
  });
  await db.$transaction([
    db.recepcion.update({ where: { id: cxp.recepcion.id }, data: { folioFactura: r.data.folioFactura, importeFactura: r.data.importeFactura, conciliacion: conc.resultado } }),
    db.cuentaPorPagar.update({
      where: { id: cxp.id },
      data: { folio: r.data.folioFactura, total: r.data.importeFactura, saldo: r.data.importeFactura, estado: conc.resultado === "OK" ? "PENDIENTE" : "BLOQUEADA" },
    }),
  ]);
  await bitacoraErp(ctx, "REGISTRAR_FACTURA", "CuentaPorPagar", cxp.id, { folio: r.data.folioFactura, conciliacion: conc.resultado, diferencia: conc.diferencia });
  revalidarCompras();
  return conc.resultado === "OK"
    ? { ok: true, mensaje: "Factura conciliada: la cuenta quedó liberada para pago." }
    : { ok: false, mensaje: `La factura sigue fuera de tolerancia: ${conc.motivos.join(" ")} Un aprobador puede liberarla con justificación.` };
}
