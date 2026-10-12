"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerContexto } from "@/lib/auth/contexto";
import { registrarBitacora } from "@/lib/bitacora";
import { db } from "@/lib/db";
import { erroresDeZod, type EstadoFormulario } from "@/lib/formularios";
import { entradaEstablecimientoDesdeFormData, esquemaEstablecimiento } from "@/lib/validacion/establecimiento";

import {
  esIdValido,
  MENSAJE_NO_ENCONTRADO,
  MENSAJE_REVISA,
  plural,
  sinPermisoEdicion,
  validarClavesCatalogo,
} from "./_compartido/servidor";

/** Alta (id = null) o edición de un establecimiento con sus claves SCIAN. */
export async function guardarEstablecimiento(
  id: string | null,
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const ctx = await obtenerContexto();
  const sinPermiso = sinPermisoEdicion(ctx);
  if (sinPermiso) return sinPermiso;
  if (id !== null && !esIdValido(id)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };

  const { valores, entrada } = entradaEstablecimientoDesdeFormData(formData);
  const resultado = esquemaEstablecimiento.safeParse(entrada);
  if (!resultado.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(resultado.error), valores };

  const { scian, ...d } = resultado.data;
  const erroresCatalogo = await validarClavesCatalogo([
    { campo: "entidadFederativa", catalogo: "CAT_ENTIDAD", clave: d.entidadFederativa },
  ]);
  if (Object.keys(erroresCatalogo).length > 0) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresCatalogo, valores };

  const datos = {
    denominacionRazonSocial: d.denominacionRazonSocial,
    rfcResponsableSanitario: d.rfcResponsableSanitario,
    correoElectronico: d.correoElectronico,
    telefono: d.telefono,
    calle: d.calle,
    numeroExterior: d.numeroExterior ?? null,
    codigoPostal: d.codigoPostal,
    entidadFederativa: d.entidadFederativa,
    municipio: d.municipio,
    colonia: d.colonia ?? null,
    localidad: d.localidad ?? null,
    noLicenciaSanitaria: d.noLicenciaSanitaria ?? null,
    tieneAvisoFuncionamiento: d.tieneAvisoFuncionamiento,
  };
  const filasScian = scian.map((s) => ({ clave: s.clave, descripcion: s.descripcion ?? null }));
  const detalle = { denominacion: datos.denominacionRazonSocial, scian: filasScian.map((s) => s.clave) };

  if (id) {
    const existente = await db.establecimiento.findFirst({ where: { id, empresaId: ctx.empresa.id }, select: { id: true } });
    if (!existente) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
    await db.$transaction([
      db.establecimiento.update({ where: { id: existente.id }, data: datos }),
      db.establecimientoScian.deleteMany({ where: { establecimientoId: existente.id } }),
      db.establecimientoScian.createMany({ data: filasScian.map((s) => ({ ...s, establecimientoId: existente.id })) }),
    ]);
    await registrarBitacora({
      empresaId: ctx.empresa.id,
      usuarioId: ctx.usuario.id,
      accion: "EDITAR",
      entidad: "Establecimiento",
      entidadId: existente.id,
      detalle,
    });
    revalidatePath("/establecimientos");
    revalidatePath(`/establecimientos/${existente.id}`);
    // Las solicitudes leen los datos vigentes del establecimiento.
    revalidatePath("/solicitudes", "layout");
    return { ok: true, mensaje: "Cambios guardados." };
  }

  const creado = await db.establecimiento.create({
    data: { ...datos, empresaId: ctx.empresa.id, scian: { create: filasScian } },
    select: { id: true },
  });
  await registrarBitacora({
    empresaId: ctx.empresa.id,
    usuarioId: ctx.usuario.id,
    accion: "CREAR",
    entidad: "Establecimiento",
    entidadId: creado.id,
    detalle,
  });
  revalidatePath("/establecimientos");
  redirect(`/establecimientos/${creado.id}?creado=1`);
}

/** Activa o desactiva el establecimiento (los inactivos no se ofrecen en solicitudes nuevas). */
export async function cambiarActivoEstablecimiento(id: string): Promise<EstadoFormulario> {
  const ctx = await obtenerContexto();
  const sinPermiso = sinPermisoEdicion(ctx);
  if (sinPermiso) return sinPermiso;
  if (!esIdValido(id)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };

  const est = await db.establecimiento.findFirst({ where: { id, empresaId: ctx.empresa.id }, select: { id: true, activo: true } });
  if (!est) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  await db.establecimiento.update({ where: { id: est.id }, data: { activo: !est.activo } });
  await registrarBitacora({
    empresaId: ctx.empresa.id,
    usuarioId: ctx.usuario.id,
    accion: est.activo ? "DESACTIVAR" : "ACTIVAR",
    entidad: "Establecimiento",
    entidadId: est.id,
  });
  revalidatePath("/establecimientos");
  revalidatePath(`/establecimientos/${est.id}`);
  return { ok: true, mensaje: est.activo ? "Establecimiento desactivado." : "Establecimiento reactivado." };
}

/** Elimina el establecimiento; si ya se usó en solicitudes, solo lo desactiva. */
export async function eliminarEstablecimiento(id: string): Promise<EstadoFormulario> {
  const ctx = await obtenerContexto();
  const sinPermiso = sinPermisoEdicion(ctx);
  if (sinPermiso) return sinPermiso;
  if (!esIdValido(id)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };

  const est = await db.establecimiento.findFirst({
    where: { id, empresaId: ctx.empresa.id },
    select: { id: true, denominacionRazonSocial: true, _count: { select: { solicitudes: true } } },
  });
  if (!est) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };

  if (est._count.solicitudes > 0) {
    await db.establecimiento.update({ where: { id: est.id }, data: { activo: false } });
    await registrarBitacora({
      empresaId: ctx.empresa.id,
      usuarioId: ctx.usuario.id,
      accion: "DESACTIVAR",
      entidad: "Establecimiento",
      entidadId: est.id,
      detalle: { motivo: "Se intentó eliminar pero tiene solicitudes", solicitudes: est._count.solicitudes },
    });
    revalidatePath("/establecimientos");
    revalidatePath(`/establecimientos/${est.id}`);
    return {
      ok: true,
      mensaje: `Se usa en ${plural(est._count.solicitudes, "solicitud", "solicitudes")}: se desactivó en lugar de eliminarse.`,
    };
  }

  await db.establecimiento.delete({ where: { id: est.id } });
  await registrarBitacora({
    empresaId: ctx.empresa.id,
    usuarioId: ctx.usuario.id,
    accion: "ELIMINAR",
    entidad: "Establecimiento",
    entidadId: est.id,
    detalle: { denominacion: est.denominacionRazonSocial },
  });
  revalidatePath("/establecimientos");
  redirect("/establecimientos?eliminado=1");
}
