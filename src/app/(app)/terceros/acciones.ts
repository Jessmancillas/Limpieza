"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerContexto } from "@/lib/auth/contexto";
import { registrarBitacora } from "@/lib/bitacora";
import { db } from "@/lib/db";
import { erroresDeZod, formDataAObjeto, type EstadoFormulario } from "@/lib/formularios";
import { datosTerceroParaGuardar, esquemaTercero, nombreTercero } from "@/lib/validacion/tercero";

import { rutaVolverSegura } from "../establecimientos/_compartido/rutas";
import {
  esIdValido,
  MENSAJE_NO_ENCONTRADO,
  MENSAJE_REVISA,
  plural,
  sinPermisoEdicion,
  validarClavesCatalogo,
} from "../establecimientos/_compartido/servidor";

/** Alta (id = null) o edición de un tercero (fabricante, proveedor, destinatario o facturador). */
export async function guardarTercero(id: string | null, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContexto();
  const sinPermiso = sinPermisoEdicion(ctx);
  if (sinPermiso) return sinPermiso;
  if (id !== null && !esIdValido(id)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };

  const valores = formDataAObjeto(formData);
  const resultado = esquemaTercero.safeParse(valores);
  if (!resultado.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(resultado.error), valores };
  const datos = datosTerceroParaGuardar(resultado.data);
  const erroresCatalogo = await validarClavesCatalogo([
    { campo: "pais", catalogo: "CAT_PAIS", clave: datos.pais },
    // La entidad de un tercero extranjero es texto libre (estado o provincia de su país).
    ...(datos.nacionalidad === "NACIONAL"
      ? [{ campo: "entidadFederativa", catalogo: "CAT_ENTIDAD" as const, clave: datos.entidadFederativa }]
      : []),
  ]);
  if (Object.keys(erroresCatalogo).length > 0) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresCatalogo, valores };
  const detalle = { tipo: datos.tipo, nombre: nombreTercero(datos), rfc: datos.rfc };

  if (id) {
    const existente = await db.tercero.findFirst({
      where: { id, empresaId: ctx.empresa.id },
      select: { id: true, tipo: true, _count: { select: { solicitudes: true, productosFabricados: true } } },
    });
    if (!existente) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
    const usado = existente._count.solicitudes + existente._count.productosFabricados > 0;
    if (existente.tipo !== datos.tipo && usado) {
      return {
        ok: false,
        mensaje: MENSAJE_REVISA,
        errores: { tipo: ["No se puede cambiar el tipo: ya se usa en solicitudes o productos. Da de alta un tercero nuevo."] },
        valores,
      };
    }
    await db.tercero.update({ where: { id: existente.id }, data: datos });
    await registrarBitacora({
      empresaId: ctx.empresa.id,
      usuarioId: ctx.usuario.id,
      accion: "EDITAR",
      entidad: "Tercero",
      entidadId: existente.id,
      detalle,
    });
    revalidatePath("/terceros");
    revalidatePath(`/terceros/${existente.id}`);
    // Productos y solicitudes muestran los datos vigentes del tercero.
    revalidatePath("/productos", "layout");
    revalidatePath("/solicitudes", "layout");
    return { ok: true, mensaje: "Cambios guardados." };
  }

  const creado = await db.tercero.create({ data: { ...datos, empresaId: ctx.empresa.id }, select: { id: true } });
  await registrarBitacora({
    empresaId: ctx.empresa.id,
    usuarioId: ctx.usuario.id,
    accion: "CREAR",
    entidad: "Tercero",
    entidadId: creado.id,
    detalle,
  });
  revalidatePath("/terceros");
  revalidatePath("/productos", "layout");

  // ?volver= permite regresar al formulario de origen (p. ej. un producto) con el tercero nuevo.
  const volver = rutaVolverSegura(formData.get("volver"));
  if (volver) redirect(`${volver}${volver.includes("?") ? "&" : "?"}nuevoTerceroId=${encodeURIComponent(creado.id)}`);
  redirect(`/terceros/${creado.id}?creado=1`);
}

/** Activa o desactiva el tercero (los inactivos no se ofrecen en productos ni solicitudes nuevas). */
export async function cambiarActivoTercero(id: string): Promise<EstadoFormulario> {
  const ctx = await obtenerContexto();
  const sinPermiso = sinPermisoEdicion(ctx);
  if (sinPermiso) return sinPermiso;
  if (!esIdValido(id)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };

  const t = await db.tercero.findFirst({ where: { id, empresaId: ctx.empresa.id }, select: { id: true, activo: true } });
  if (!t) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  await db.tercero.update({ where: { id: t.id }, data: { activo: !t.activo } });
  await registrarBitacora({
    empresaId: ctx.empresa.id,
    usuarioId: ctx.usuario.id,
    accion: t.activo ? "DESACTIVAR" : "ACTIVAR",
    entidad: "Tercero",
    entidadId: t.id,
  });
  revalidatePath("/terceros");
  revalidatePath(`/terceros/${t.id}`);
  return { ok: true, mensaje: t.activo ? "Tercero desactivado." : "Tercero reactivado." };
}

/** Elimina el tercero; si está ligado a solicitudes (relación Restrict) solo lo desactiva. */
export async function eliminarTercero(id: string): Promise<EstadoFormulario> {
  const ctx = await obtenerContexto();
  const sinPermiso = sinPermisoEdicion(ctx);
  if (sinPermiso) return sinPermiso;
  if (!esIdValido(id)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };

  const t = await db.tercero.findFirst({
    where: { id, empresaId: ctx.empresa.id },
    include: { _count: { select: { solicitudes: true, productosFabricados: true } } },
  });
  if (!t) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };

  if (t._count.solicitudes > 0) {
    await db.tercero.update({ where: { id: t.id }, data: { activo: false } });
    await registrarBitacora({
      empresaId: ctx.empresa.id,
      usuarioId: ctx.usuario.id,
      accion: "DESACTIVAR",
      entidad: "Tercero",
      entidadId: t.id,
      detalle: { motivo: "Se intentó eliminar pero está ligado a solicitudes", solicitudes: t._count.solicitudes },
    });
    revalidatePath("/terceros");
    revalidatePath(`/terceros/${t.id}`);
    return {
      ok: true,
      mensaje: `Está ligado a ${plural(t._count.solicitudes, "solicitud", "solicitudes")}: se desactivó en lugar de eliminarse.`,
    };
  }

  try {
    await db.tercero.delete({ where: { id: t.id } });
  } catch (e) {
    // Una solicitud pudo ligarlo entre la consulta y el borrado (relación Restrict).
    console.error("No se pudo eliminar el tercero", t.id, e);
    return { ok: false, mensaje: "No se pudo eliminar porque está ligado a otros registros. Desactívalo en su lugar." };
  }
  await registrarBitacora({
    empresaId: ctx.empresa.id,
    usuarioId: ctx.usuario.id,
    accion: "ELIMINAR",
    entidad: "Tercero",
    entidadId: t.id,
    detalle: { tipo: t.tipo, nombre: nombreTercero(t), productosSinFabricante: t._count.productosFabricados },
  });
  revalidatePath("/terceros");
  revalidatePath("/productos", "layout");
  redirect(`/terceros?tipo=${encodeURIComponent(t.tipo)}&eliminado=1`);
}
