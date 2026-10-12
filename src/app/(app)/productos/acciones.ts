"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerContexto } from "@/lib/auth/contexto";
import { registrarBitacora } from "@/lib/bitacora";
import { db } from "@/lib/db";
import { erroresDeZod, formDataAObjeto, type EstadoFormulario } from "@/lib/formularios";
import { denominacionCopia, esquemaProducto } from "@/lib/validacion/producto";

import {
  MENSAJE_NO_ENCONTRADO,
  MENSAJE_REVISA,
  plural,
  sinPermisoEdicion,
  validarClavesCatalogo,
} from "../establecimientos/_compartido/servidor";

/** Alta (id = null) o edición de un producto (dispositivo médico) del catálogo de la empresa. */
export async function guardarProducto(id: string | null, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContexto();
  const sinPermiso = sinPermisoEdicion(ctx);
  if (sinPermiso) return sinPermiso;
  const empresaId = ctx.empresa.id;

  const valores = formDataAObjeto(formData);
  const resultado = esquemaProducto.safeParse(valores);
  if (!resultado.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(resultado.error), valores };
  const d = resultado.data;

  const errores = await validarClavesCatalogo([
    { campo: "idClasificacionProducto", catalogo: "CAT_CLASIF_PRODUCTO", clave: d.idClasificacionProducto },
    { campo: "idSubClasificacionProducto", catalogo: "CAT_SUBCLASIF_PRODUCTO", clave: d.idSubClasificacionProducto },
    { campo: "idTipoProducto", catalogo: "CAT_TIPO_PRODUCTO", clave: d.idTipoProducto },
    { campo: "idFormaFarmaceutica", catalogo: "CAT_FORMA_FARMACEUTICA", clave: d.idFormaFarmaceutica },
    { campo: "idEstadoFisico", catalogo: "CAT_ESTADO_FISICO", clave: d.idEstadoFisico },
    { campo: "umt", catalogo: "CAT_UNIDAD_MEDIDA", clave: d.umt },
    { campo: "umc", catalogo: "CAT_UNIDAD_MEDIDA", clave: d.umc },
    { campo: "cvePaisOrigen", catalogo: "CAT_PAIS", clave: d.cvePaisOrigen },
    { campo: "idUsoEspecifico", catalogo: "CAT_USO_ESPECIFICO", clave: d.idUsoEspecifico },
  ]);
  // El fabricante debe ser un tercero FABRICANTE de la misma empresa.
  if (d.fabricanteId) {
    const fabricante = await db.tercero.findFirst({
      where: { id: d.fabricanteId, empresaId, tipo: "FABRICANTE" },
      select: { id: true },
    });
    if (!fabricante) errores.fabricanteId = ["Elige un fabricante de la lista"];
  }
  // La subclasificación debe colgar de la clasificación elegida (si el catálogo la conoce).
  const subclasificacion = await db.catalogoVucem.findUnique({
    where: { catalogo_clave: { catalogo: "CAT_SUBCLASIF_PRODUCTO", clave: d.idSubClasificacionProducto } },
    select: { padreClave: true },
  });
  if (!errores.idSubClasificacionProducto && subclasificacion?.padreClave && subclasificacion.padreClave !== d.idClasificacionProducto) {
    errores.idSubClasificacionProducto = ["La subclasificación no corresponde a la clasificación elegida"];
  }
  if (Object.keys(errores).length > 0) return { ok: false, mensaje: MENSAJE_REVISA, errores, valores };

  const datos = {
    denominacionEspecifica: d.denominacionEspecifica,
    denominacionDistintiva: d.denominacionDistintiva,
    denominacionComunCientifica: d.denominacionComunCientifica,
    idClasificacionProducto: d.idClasificacionProducto,
    idSubClasificacionProducto: d.idSubClasificacionProducto,
    idTipoProducto: d.idTipoProducto,
    especifique: d.especifique ?? null,
    idFormaFarmaceutica: d.idFormaFarmaceutica ?? null,
    idEstadoFisico: d.idEstadoFisico ?? null,
    fraccionArancelaria: d.fraccionArancelaria,
    descripcionFraccion: d.descripcionFraccion ?? null,
    umt: d.umt ?? null,
    umc: d.umc ?? null,
    desUMC: d.desUMC,
    presentacionTipoEnvase: d.presentacionTipoEnvase,
    numRegistroSanitario: d.numRegistroSanitario ?? null,
    vigenciaRegistroSanitario: d.vigenciaRegistroSanitario ?? null,
    cvePaisOrigen: d.cvePaisOrigen,
    idUsoEspecifico: d.idUsoEspecifico,
    fabricanteId: d.fabricanteId ?? null,
    notas: d.notas ?? null,
  };
  const detalle = {
    denominacion: datos.denominacionEspecifica,
    fraccion: datos.fraccionArancelaria,
    registroSanitario: datos.numRegistroSanitario,
  };

  if (id) {
    const existente = await db.producto.findFirst({ where: { id, empresaId }, select: { id: true } });
    if (!existente) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
    await db.producto.update({ where: { id: existente.id }, data: datos });
    await registrarBitacora({ empresaId, usuarioId: ctx.usuario.id, accion: "EDITAR", entidad: "Producto", entidadId: existente.id, detalle });
    revalidatePath("/productos");
    revalidatePath(`/productos/${existente.id}`);
    return { ok: true, mensaje: "Cambios guardados." };
  }

  const creado = await db.producto.create({ data: { ...datos, empresaId }, select: { id: true } });
  await registrarBitacora({ empresaId, usuarioId: ctx.usuario.id, accion: "CREAR", entidad: "Producto", entidadId: creado.id, detalle });
  revalidatePath("/productos");
  redirect(`/productos/${creado.id}?creado=1`);
}

/** Crea una copia del producto (con "(copia)" en la denominación) y abre la copia. */
export async function duplicarProducto(id: string): Promise<EstadoFormulario> {
  const ctx = await obtenerContexto();
  const sinPermiso = sinPermisoEdicion(ctx);
  if (sinPermiso) return sinPermiso;
  const empresaId = ctx.empresa.id;

  const original = await db.producto.findFirst({ where: { id, empresaId } });
  if (!original) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const copia = await db.producto.create({
    data: {
      empresaId,
      denominacionEspecifica: denominacionCopia(original.denominacionEspecifica),
      denominacionDistintiva: original.denominacionDistintiva,
      denominacionComunCientifica: original.denominacionComunCientifica,
      idClasificacionProducto: original.idClasificacionProducto,
      idSubClasificacionProducto: original.idSubClasificacionProducto,
      idTipoProducto: original.idTipoProducto,
      especifique: original.especifique,
      idFormaFarmaceutica: original.idFormaFarmaceutica,
      idEstadoFisico: original.idEstadoFisico,
      fraccionArancelaria: original.fraccionArancelaria,
      descripcionFraccion: original.descripcionFraccion,
      umt: original.umt,
      umc: original.umc,
      desUMC: original.desUMC,
      presentacionTipoEnvase: original.presentacionTipoEnvase,
      numRegistroSanitario: original.numRegistroSanitario,
      vigenciaRegistroSanitario: original.vigenciaRegistroSanitario,
      cvePaisOrigen: original.cvePaisOrigen,
      idUsoEspecifico: original.idUsoEspecifico,
      fabricanteId: original.fabricanteId,
      notas: original.notas,
    },
    select: { id: true },
  });
  await registrarBitacora({
    empresaId,
    usuarioId: ctx.usuario.id,
    accion: "DUPLICAR",
    entidad: "Producto",
    entidadId: copia.id,
    detalle: { origen: original.id, denominacion: original.denominacionEspecifica },
  });
  revalidatePath("/productos");
  redirect(`/productos/${copia.id}?duplicado=1`);
}

/** Activa o desactiva el producto (los inactivos no se ofrecen al capturar solicitudes). */
export async function cambiarActivoProducto(id: string): Promise<EstadoFormulario> {
  const ctx = await obtenerContexto();
  const sinPermiso = sinPermisoEdicion(ctx);
  if (sinPermiso) return sinPermiso;

  const p = await db.producto.findFirst({ where: { id, empresaId: ctx.empresa.id }, select: { id: true, activo: true } });
  if (!p) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  await db.producto.update({ where: { id: p.id }, data: { activo: !p.activo } });
  await registrarBitacora({
    empresaId: ctx.empresa.id,
    usuarioId: ctx.usuario.id,
    accion: p.activo ? "DESACTIVAR" : "ACTIVAR",
    entidad: "Producto",
    entidadId: p.id,
  });
  revalidatePath("/productos");
  revalidatePath(`/productos/${p.id}`);
  return { ok: true, mensaje: p.activo ? "Producto desactivado." : "Producto reactivado." };
}

/** Elimina el producto; si ya se usó en solicitudes, solo lo desactiva. */
export async function eliminarProducto(id: string): Promise<EstadoFormulario> {
  const ctx = await obtenerContexto();
  const sinPermiso = sinPermisoEdicion(ctx);
  if (sinPermiso) return sinPermiso;

  const p = await db.producto.findFirst({
    where: { id, empresaId: ctx.empresa.id },
    select: { id: true, denominacionEspecifica: true, _count: { select: { partidas: true, documentos: true } } },
  });
  if (!p) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };

  if (p._count.partidas > 0) {
    await db.producto.update({ where: { id: p.id }, data: { activo: false } });
    await registrarBitacora({
      empresaId: ctx.empresa.id,
      usuarioId: ctx.usuario.id,
      accion: "DESACTIVAR",
      entidad: "Producto",
      entidadId: p.id,
      detalle: { motivo: "Se intentó eliminar pero se usa en solicitudes", partidas: p._count.partidas },
    });
    revalidatePath("/productos");
    revalidatePath(`/productos/${p.id}`);
    return {
      ok: true,
      mensaje: `Se usa en ${plural(p._count.partidas, "partida", "partidas")} de solicitudes: se desactivó en lugar de eliminarse.`,
    };
  }

  await db.producto.delete({ where: { id: p.id } });
  await registrarBitacora({
    empresaId: ctx.empresa.id,
    usuarioId: ctx.usuario.id,
    accion: "ELIMINAR",
    entidad: "Producto",
    entidadId: p.id,
    detalle: { denominacion: p.denominacionEspecifica, documentosSinProducto: p._count.documentos },
  });
  revalidatePath("/productos");
  redirect("/productos?eliminado=1");
}
