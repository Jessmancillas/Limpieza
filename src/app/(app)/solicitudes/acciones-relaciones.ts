"use server";

import { registrarBitacora } from "@/lib/bitacora";
import { ETIQUETA_TIPO_TERCERO } from "@/lib/constantes";
import { db } from "@/lib/db";
import { erroresDeZod, formDataAObjeto, type EstadoFormulario } from "@/lib/formularios";
import { esquemaLigarDocumento, esquemaTerceroSolicitud } from "@/lib/solicitudes/esquemas";
import { leerDefinicion } from "@/lib/tramite/definicion";
import { nombreTercero } from "@/lib/validacion/tercero";

import { esErrorUnico, MENSAJE_REVISA, prepararAccion, trasEditar } from "./_lib/servidor";

// Terceros y documentos ligados a la solicitud.

export async function agregarTercero(id: string, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const p = await prepararAccion(id, { editable: true });
  if (p.error) return p.error;
  const { ctx, sol } = p;

  const valores = formDataAObjeto(formData);
  const r = esquemaTerceroSolicitud.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  const { terceroId, rol } = r.data;
  const tercero = await db.tercero.findFirst({ where: { id: terceroId, empresaId: ctx.empresa.id, tipo: rol } });
  if (!tercero) {
    return { ok: false, mensaje: MENSAJE_REVISA, errores: { terceroId: [`Elige un ${ETIQUETA_TIPO_TERCERO[rol].toLowerCase()} de la lista`] }, valores };
  }
  try {
    await db.solicitudTercero.create({ data: { solicitudId: sol.id, terceroId: tercero.id, rol } });
  } catch (e) {
    if (esErrorUnico(e)) return { ok: false, mensaje: "Ese tercero ya está agregado a la solicitud." };
    throw e;
  }
  await registrarBitacora({
    empresaId: ctx.empresa.id,
    usuarioId: ctx.usuario.id,
    accion: "AGREGAR_TERCERO",
    entidad: "Solicitud",
    entidadId: sol.id,
    detalle: { terceroId: tercero.id, rol, nombre: nombreTercero(tercero) },
  });
  return trasEditar(sol, `${ETIQUETA_TIPO_TERCERO[rol].split(" ")[0]} «${nombreTercero(tercero)}» agregado.`);
}

export async function quitarTercero(id: string, solicitudTerceroId: string): Promise<EstadoFormulario> {
  const p = await prepararAccion(id, { editable: true });
  if (p.error) return p.error;
  const { ctx, sol } = p;
  const st = await db.solicitudTercero.findFirst({
    where: { id: solicitudTerceroId, solicitudId: sol.id },
    include: { tercero: true },
  });
  if (!st) return { ok: false, mensaje: "Ese tercero no está en la solicitud." };
  await db.solicitudTercero.delete({ where: { id: st.id } });
  await registrarBitacora({
    empresaId: ctx.empresa.id,
    usuarioId: ctx.usuario.id,
    accion: "QUITAR_TERCERO",
    entidad: "Solicitud",
    entidadId: sol.id,
    detalle: { terceroId: st.terceroId, rol: st.rol },
  });
  return trasEditar(sol, `«${nombreTercero(st.tercero)}» quitado de la solicitud.`);
}

export async function ligarDocumento(id: string, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const p = await prepararAccion(id, { editable: true });
  if (p.error) return p.error;
  const { ctx, sol } = p;

  const valores = formDataAObjeto(formData);
  const r = esquemaLigarDocumento.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  const { documentoId, requisito } = r.data;

  const tramite = await db.solicitud.findUniqueOrThrow({ where: { id: sol.id }, select: { tramiteVersion: { select: { definicion: true } } } });
  let requisitos: ReturnType<typeof leerDefinicion>["requisitos"] = [];
  try {
    requisitos = leerDefinicion(tramite.tramiteVersion.definicion).requisitos;
  } catch {
    return { ok: false, mensaje: "La definición del trámite no es válida." };
  }
  const req = requisitos.find((x) => x.clave === requisito);
  if (!req) return { ok: false, mensaje: "Ese requisito no existe en el trámite." };
  const documento = await db.documento.findFirst({
    where: { id: documentoId, empresaId: ctx.empresa.id },
    select: { id: true, tipo: true, nombre: true },
  });
  if (!documento) return { ok: false, mensaje: MENSAJE_REVISA, errores: { documentoId: ["Elige un documento de la lista"] }, valores };
  if (!(req.tipos as readonly string[]).includes(documento.tipo)) {
    return { ok: false, mensaje: MENSAJE_REVISA, errores: { documentoId: [`El documento no es del tipo que pide «${req.nombre}»`] }, valores };
  }
  try {
    await db.solicitudDocumento.create({ data: { solicitudId: sol.id, documentoId: documento.id, requisito: req.clave } });
  } catch (e) {
    if (esErrorUnico(e)) return { ok: false, mensaje: "Ese documento ya está ligado a la solicitud." };
    throw e;
  }
  await registrarBitacora({
    empresaId: ctx.empresa.id,
    usuarioId: ctx.usuario.id,
    accion: "LIGAR_DOCUMENTO",
    entidad: "Solicitud",
    entidadId: sol.id,
    detalle: { documentoId: documento.id, requisito: req.clave, nombre: documento.nombre },
  });
  return trasEditar(sol, `Documento «${documento.nombre}» ligado.`);
}

export async function desligarDocumento(id: string, solicitudDocumentoId: string): Promise<EstadoFormulario> {
  const p = await prepararAccion(id, { editable: true });
  if (p.error) return p.error;
  const { ctx, sol } = p;
  const sd = await db.solicitudDocumento.findFirst({
    where: { id: solicitudDocumentoId, solicitudId: sol.id },
    include: { documento: { select: { nombre: true } } },
  });
  if (!sd) return { ok: false, mensaje: "Ese documento no está ligado a la solicitud." };
  await db.solicitudDocumento.delete({ where: { id: sd.id } });
  await registrarBitacora({
    empresaId: ctx.empresa.id,
    usuarioId: ctx.usuario.id,
    accion: "DESLIGAR_DOCUMENTO",
    entidad: "Solicitud",
    entidadId: sol.id,
    detalle: { documentoId: sd.documentoId, requisito: sd.requisito },
  });
  return trasEditar(sol, `Documento «${sd.documento.nombre}» desligado (el documento se conserva en Documentos).`);
}
