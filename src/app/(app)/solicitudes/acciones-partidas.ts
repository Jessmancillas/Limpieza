"use server";

import { registrarBitacora } from "@/lib/bitacora";
import { db } from "@/lib/db";
import { erroresDeZod, formDataAObjeto, type EstadoFormulario } from "@/lib/formularios";
import { esquemaAgregarPartida, esquemaPartida } from "@/lib/solicitudes/esquemas";
import { aplicarSugerencias } from "@/lib/solicitudes/sugerencias";

import { validarClavesCatalogo } from "../establecimientos/_compartido/servidor";

import { MENSAJE_REVISA, prepararAccion, trasEditar } from "./_lib/servidor";

const MENSAJE_PARTIDA_NO_ENCONTRADA = "La mercancía no existe en esta solicitud.";

/** Datos del producto que se copian a la partida (snapshot). */
function snapshotProducto(p: {
  idClasificacionProducto: string | null;
  idSubClasificacionProducto: string | null;
  denominacionEspecifica: string;
  denominacionDistintiva: string;
  denominacionComunCientifica: string;
  idTipoProducto: string | null;
  especifique: string | null;
  idFormaFarmaceutica: string | null;
  idEstadoFisico: string | null;
  fraccionArancelaria: string;
  descripcionFraccion: string | null;
  umt: string | null;
  umc: string | null;
  desUMC: string;
  presentacionTipoEnvase: string;
  numRegistroSanitario: string | null;
  cvePaisOrigen: string | null;
}) {
  return {
    idClasificacionProducto: p.idClasificacionProducto,
    idSubClasificacionProducto: p.idSubClasificacionProducto,
    denominacionEspecifica: p.denominacionEspecifica,
    denominacionDistintiva: p.denominacionDistintiva,
    denominacionComunCientifica: p.denominacionComunCientifica,
    idTipoProducto: p.idTipoProducto,
    especifique: p.especifique,
    idFormaFarmaceutica: p.idFormaFarmaceutica,
    idEstadoFisico: p.idEstadoFisico,
    fraccionArancelaria: p.fraccionArancelaria,
    descripcionFraccion: p.descripcionFraccion,
    umt: p.umt,
    umc: p.umc,
    desUMC: p.desUMC,
    presentacionTipoEnvase: p.presentacionTipoEnvase,
    numRegistroSanitario: p.numRegistroSanitario,
    cvePaisOrigen: p.cvePaisOrigen ?? "",
  };
}

/** Agrega una mercancía copiando los datos del producto del catálogo. */
export async function agregarPartida(id: string, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const p = await prepararAccion(id, { editable: true });
  if (p.error) return p.error;
  const { ctx, sol } = p;
  const empresaId = ctx.empresa.id;

  const valores = formDataAObjeto(formData);
  const r = esquemaAgregarPartida.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  const d = r.data;

  const producto = await db.producto.findFirst({ where: { id: d.productoId, empresaId } });
  const errores = await validarClavesCatalogo([
    { campo: "cvePaisProcedencia", catalogo: "CAT_PAIS", clave: d.cvePaisProcedencia },
    { campo: "idUsoEspecifico", catalogo: "CAT_USO_ESPECIFICO", clave: d.idUsoEspecifico },
  ]);
  if (!producto) errores.productoId = ["Elige un producto de la lista"];
  if (Object.keys(errores).length > 0 || !producto) return { ok: false, mensaje: MENSAJE_REVISA, errores, valores };

  const ultima = await db.partidaSolicitud.findFirst({ where: { solicitudId: sol.id }, orderBy: { orden: "desc" }, select: { orden: true } });
  const partida = await db.partidaSolicitud.create({
    data: {
      solicitudId: sol.id,
      productoId: producto.id,
      orden: (ultima?.orden ?? 0) + 1,
      ...snapshotProducto(producto),
      cantidadUMT: d.cantidadUMT,
      cantidadUMC: d.cantidadUMC,
      cvePaisProcedencia: d.cvePaisProcedencia,
      fechaCaducidad: d.fechaCaducidad ?? null,
      idUsoEspecifico: d.idUsoEspecifico ?? producto.idUsoEspecifico,
    },
    select: { id: true },
  });
  const sugerencias = await aplicarSugerencias(sol.id, empresaId);
  await registrarBitacora({
    empresaId,
    usuarioId: ctx.usuario.id,
    accion: "AGREGAR_MERCANCIA",
    entidad: "Solicitud",
    entidadId: sol.id,
    detalle: { partidaId: partida.id, productoId: producto.id, denominacion: producto.denominacionEspecifica, ...sugerencias },
  });
  const extras = [
    sugerencias.terceros > 0 && "su fabricante",
    sugerencias.documentos > 0 && `${sugerencias.documentos} documento(s)`,
  ].filter(Boolean);
  return trasEditar(
    sol,
    `Mercancía «${producto.denominacionEspecifica}» agregada.${extras.length ? ` También se ligó ${extras.join(" y ")}.` : ""}`,
  );
}

/** Edita los datos copiados de la mercancía (solo en esta solicitud; el catálogo no cambia). */
export async function guardarPartida(
  id: string,
  partidaId: string,
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const p = await prepararAccion(id, { editable: true });
  if (p.error) return p.error;
  const { ctx, sol } = p;

  const valores = formDataAObjeto(formData);
  const r = esquemaPartida.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  const d = r.data;
  const existente = await db.partidaSolicitud.findFirst({ where: { id: partidaId, solicitudId: sol.id }, select: { id: true } });
  if (!existente) return { ok: false, mensaje: MENSAJE_PARTIDA_NO_ENCONTRADA };

  const errores = await validarClavesCatalogo([
    { campo: "idClasificacionProducto", catalogo: "CAT_CLASIF_PRODUCTO", clave: d.idClasificacionProducto },
    { campo: "idSubClasificacionProducto", catalogo: "CAT_SUBCLASIF_PRODUCTO", clave: d.idSubClasificacionProducto },
    { campo: "idTipoProducto", catalogo: "CAT_TIPO_PRODUCTO", clave: d.idTipoProducto },
    { campo: "idFormaFarmaceutica", catalogo: "CAT_FORMA_FARMACEUTICA", clave: d.idFormaFarmaceutica },
    { campo: "idEstadoFisico", catalogo: "CAT_ESTADO_FISICO", clave: d.idEstadoFisico },
    { campo: "umt", catalogo: "CAT_UNIDAD_MEDIDA", clave: d.umt },
    { campo: "umc", catalogo: "CAT_UNIDAD_MEDIDA", clave: d.umc },
    { campo: "cvePaisOrigen", catalogo: "CAT_PAIS", clave: d.cvePaisOrigen },
    { campo: "cvePaisProcedencia", catalogo: "CAT_PAIS", clave: d.cvePaisProcedencia },
    { campo: "idUsoEspecifico", catalogo: "CAT_USO_ESPECIFICO", clave: d.idUsoEspecifico },
  ]);
  if (Object.keys(errores).length > 0) return { ok: false, mensaje: MENSAJE_REVISA, errores, valores };

  await db.partidaSolicitud.update({
    where: { id: existente.id },
    data: {
      idClasificacionProducto: d.idClasificacionProducto ?? null,
      idSubClasificacionProducto: d.idSubClasificacionProducto ?? null,
      denominacionEspecifica: d.denominacionEspecifica,
      denominacionDistintiva: d.denominacionDistintiva,
      denominacionComunCientifica: d.denominacionComunCientifica,
      idTipoProducto: d.idTipoProducto ?? null,
      especifique: d.especifique ?? null,
      idFormaFarmaceutica: d.idFormaFarmaceutica ?? null,
      idEstadoFisico: d.idEstadoFisico ?? null,
      fraccionArancelaria: d.fraccionArancelaria,
      descripcionFraccion: d.descripcionFraccion ?? null,
      cantidadUMT: d.cantidadUMT,
      cantidadUMC: d.cantidadUMC,
      umt: d.umt ?? null,
      umc: d.umc ?? null,
      desUMC: d.desUMC,
      presentacionTipoEnvase: d.presentacionTipoEnvase,
      numRegistroSanitario: d.numRegistroSanitario ?? null,
      fechaCaducidad: d.fechaCaducidad ?? null,
      cvePaisOrigen: d.cvePaisOrigen,
      cvePaisProcedencia: d.cvePaisProcedencia,
      idUsoEspecifico: d.idUsoEspecifico ?? null,
    },
  });
  await registrarBitacora({
    empresaId: ctx.empresa.id,
    usuarioId: ctx.usuario.id,
    accion: "EDITAR_MERCANCIA",
    entidad: "Solicitud",
    entidadId: sol.id,
    detalle: { partidaId: existente.id, denominacion: d.denominacionEspecifica, fraccion: d.fraccionArancelaria },
  });
  return trasEditar(sol, "Mercancía actualizada.");
}

/** Vuelve a copiar los datos del producto del catálogo (conserva cantidades, procedencia y caducidad). */
export async function recopiarPartida(id: string, partidaId: string): Promise<EstadoFormulario> {
  const p = await prepararAccion(id, { editable: true });
  if (p.error) return p.error;
  const { ctx, sol } = p;
  const partida = await db.partidaSolicitud.findFirst({
    where: { id: partidaId, solicitudId: sol.id },
    select: { id: true, productoId: true },
  });
  if (!partida) return { ok: false, mensaje: MENSAJE_PARTIDA_NO_ENCONTRADA };
  const producto = partida.productoId
    ? await db.producto.findFirst({ where: { id: partida.productoId, empresaId: ctx.empresa.id } })
    : null;
  if (!producto) return { ok: false, mensaje: "La mercancía ya no está ligada a un producto del catálogo." };
  await db.partidaSolicitud.update({
    where: { id: partida.id },
    data: { ...snapshotProducto(producto), idUsoEspecifico: producto.idUsoEspecifico },
  });
  await registrarBitacora({
    empresaId: ctx.empresa.id,
    usuarioId: ctx.usuario.id,
    accion: "EDITAR_MERCANCIA",
    entidad: "Solicitud",
    entidadId: sol.id,
    detalle: { partidaId: partida.id, recopiadaDe: producto.id },
  });
  return trasEditar(sol, "Se copiaron de nuevo los datos del producto.");
}

export async function quitarPartida(id: string, partidaId: string): Promise<EstadoFormulario> {
  const p = await prepararAccion(id, { editable: true });
  if (p.error) return p.error;
  const { ctx, sol } = p;
  const partida = await db.partidaSolicitud.findFirst({
    where: { id: partidaId, solicitudId: sol.id },
    select: { id: true, denominacionEspecifica: true },
  });
  if (!partida) return { ok: false, mensaje: MENSAJE_PARTIDA_NO_ENCONTRADA };
  await db.partidaSolicitud.delete({ where: { id: partida.id } });
  await registrarBitacora({
    empresaId: ctx.empresa.id,
    usuarioId: ctx.usuario.id,
    accion: "QUITAR_MERCANCIA",
    entidad: "Solicitud",
    entidadId: sol.id,
    detalle: { partidaId: partida.id, denominacion: partida.denominacionEspecifica },
  });
  return trasEditar(sol, `Mercancía «${partida.denominacionEspecifica}» quitada.`);
}
