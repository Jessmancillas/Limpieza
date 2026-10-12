"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerContexto } from "@/lib/auth/contexto";
import { registrarBitacora } from "@/lib/bitacora";
import { db } from "@/lib/db";
import { erroresDeZod, formDataAObjeto, type EstadoFormulario } from "@/lib/formularios";
import { cargarSolicitudCompleta } from "@/lib/solicitudes/consultas";
import {
  esquemaDatosGenerales,
  esquemaManifiestos,
  esquemaNuevaSolicitud,
  esquemaPago,
  esquemaRepresentante,
} from "@/lib/solicitudes/esquemas";
import { aplicarSugerencias } from "@/lib/solicitudes/sugerencias";
import { validarSolicitud } from "@/lib/solicitudes/validacion";

import { sinPermisoEdicion, validarClavesCatalogo } from "../establecimientos/_compartido/servidor";

import {
  conConsecutivo,
  MENSAJE_NO_ENCONTRADA,
  MENSAJE_REVISA,
  prepararAccion,
  revalidarSolicitud,
  tramiteVigente,
  trasEditar,
} from "./_lib/servidor";

function textoSugerencias(s: { documentos: number; terceros: number }): string {
  const partes = [
    s.documentos > 0 && `${s.documentos} documento${s.documentos === 1 ? "" : "s"}`,
    s.terceros > 0 && `${s.terceros} tercero${s.terceros === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return partes.length > 0 ? ` Se ligaron automáticamente ${partes.join(" y ")} de tus catálogos.` : "";
}

/** Crea un borrador para el establecimiento elegido y abre la captura. */
export async function crearSolicitud(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContexto();
  const sinPermiso = sinPermisoEdicion(ctx);
  if (sinPermiso) return sinPermiso;
  const empresaId = ctx.empresa.id;

  const valores = formDataAObjeto(formData);
  const r = esquemaNuevaSolicitud.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };

  const est = await db.establecimiento.findFirst({ where: { id: r.data.establecimientoId, empresaId }, select: { id: true } });
  if (!est) return { ok: false, mensaje: MENSAJE_REVISA, errores: { establecimientoId: ["Elige un establecimiento de la lista"] }, valores };
  const tramite = await tramiteVigente();
  if (!tramite) {
    return {
      ok: false,
      mensaje: "No está cargada la definición del trámite 260211. Pide al administrador que ejecute la carga inicial (npm run db:seed).",
    };
  }

  // Si el solicitante es persona física, normalmente él mismo firma como representante.
  const e = ctx.empresa;
  const representante =
    e.tipoPersona === "FISICA"
      ? { rlRfc: e.rfc, rlNombre: e.nombre, rlApellidoPaterno: e.apellidoPaterno, rlApellidoMaterno: e.apellidoMaterno }
      : {};
  const creada = await conConsecutivo(empresaId, (numero) =>
    db.solicitud.create({
      data: {
        numero,
        empresaId,
        tramiteVersionId: tramite.id,
        establecimientoId: est.id,
        estado: "BORRADOR",
        creadoPorId: ctx.usuario.id,
        ...representante,
      },
      select: { id: true, numero: true },
    }),
  );
  const sugerencias = await aplicarSugerencias(creada.id, empresaId);
  await registrarBitacora({
    empresaId,
    usuarioId: ctx.usuario.id,
    accion: "CREAR",
    entidad: "Solicitud",
    entidadId: creada.id,
    detalle: { numero: creada.numero, establecimientoId: est.id, ...sugerencias },
  });
  revalidatePath("/solicitudes");
  revalidatePath("/");
  const extra = sugerencias.documentos + sugerencias.terceros > 0 ? `&sugeridos=${sugerencias.documentos}-${sugerencias.terceros}` : "";
  redirect(`/solicitudes/${creada.id}?creada=1${extra}`);
}

/** Establecimiento, régimen y aduana. */
export async function guardarDatosGenerales(id: string, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const p = await prepararAccion(id, { editable: true });
  if (p.error) return p.error;
  const { ctx, sol } = p;
  const empresaId = ctx.empresa.id;

  const valores = formDataAObjeto(formData);
  const r = esquemaDatosGenerales.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  const d = r.data;

  const est = await db.establecimiento.findFirst({ where: { id: d.establecimientoId, empresaId }, select: { id: true } });
  const errores = await validarClavesCatalogo([
    { campo: "cveRegimen", catalogo: "CAT_REGIMEN", clave: d.cveRegimen },
    { campo: "cveAduana", catalogo: "CAT_ADUANA", clave: d.cveAduana },
  ]);
  if (!est) errores.establecimientoId = ["Elige un establecimiento de la lista"];
  if (Object.keys(errores).length > 0) return { ok: false, mensaje: MENSAJE_REVISA, errores, valores };

  const anterior = await db.solicitud.findUniqueOrThrow({ where: { id: sol.id }, select: { establecimientoId: true } });
  await db.solicitud.update({
    where: { id: sol.id },
    data: { establecimientoId: d.establecimientoId, cveRegimen: d.cveRegimen ?? null, cveAduana: d.cveAduana ?? null },
  });

  let mensaje = "Datos generales guardados.";
  if (anterior.establecimientoId !== d.establecimientoId) {
    // Los documentos del establecimiento anterior (licencia, aviso…) ya no corresponden.
    let quitados = 0;
    if (anterior.establecimientoId) {
      const r2 = await db.solicitudDocumento.deleteMany({
        where: { solicitudId: sol.id, documento: { empresaId, establecimientoId: anterior.establecimientoId } },
      });
      quitados = r2.count;
    }
    const sugerencias = await aplicarSugerencias(sol.id, empresaId);
    if (quitados > 0) mensaje += ` Se desligaron ${quitados} documento(s) del establecimiento anterior.`;
    mensaje += textoSugerencias(sugerencias);
  }
  await registrarBitacora({
    empresaId,
    usuarioId: ctx.usuario.id,
    accion: "EDITAR",
    entidad: "Solicitud",
    entidadId: sol.id,
    detalle: { seccion: "datos generales", establecimientoId: d.establecimientoId, cveRegimen: d.cveRegimen, cveAduana: d.cveAduana },
  });
  return trasEditar(sol, mensaje);
}

export async function guardarRepresentante(id: string, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const p = await prepararAccion(id, { editable: true });
  if (p.error) return p.error;
  const { ctx, sol } = p;

  const valores = formDataAObjeto(formData);
  const r = esquemaRepresentante.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  const d = r.data;
  await db.solicitud.update({
    where: { id: sol.id },
    data: {
      rlRfc: d.rlRfc,
      rlNombre: d.rlNombre ?? null,
      rlApellidoPaterno: d.rlApellidoPaterno ?? null,
      rlApellidoMaterno: d.rlApellidoMaterno ?? null,
    },
  });
  await registrarBitacora({
    empresaId: ctx.empresa.id,
    usuarioId: ctx.usuario.id,
    accion: "EDITAR",
    entidad: "Solicitud",
    entidadId: sol.id,
    detalle: { seccion: "representante legal", rfc: d.rlRfc },
  });
  return trasEditar(sol, "Representante legal guardado.");
}

export async function guardarPago(id: string, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const p = await prepararAccion(id, { editable: true });
  if (p.error) return p.error;
  const { ctx, sol } = p;

  const valores = formDataAObjeto(formData);
  const r = esquemaPago.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  const d = r.data;
  if (!d.pagoOmitido) {
    const errores = await validarClavesCatalogo([{ campo: "cveBanco", catalogo: "CAT_BANCO", clave: d.cveBanco }]);
    if (Object.keys(errores).length > 0) return { ok: false, mensaje: MENSAJE_REVISA, errores, valores };
  }
  await db.solicitud.update({
    where: { id: sol.id },
    data: d.pagoOmitido
      ? { pagoOmitido: true, claveReferencia: null, cadenaDependencia: null, cveBanco: null, llavePago: null, fechaPago: null, importePago: null }
      : {
          pagoOmitido: false,
          claveReferencia: d.claveReferencia ?? null,
          cadenaDependencia: d.cadenaDependencia ?? null,
          cveBanco: d.cveBanco ?? null,
          llavePago: d.llavePago ?? null,
          fechaPago: d.fechaPago ?? null,
          importePago: d.importePago ? Number(d.importePago).toFixed(2) : null,
        },
  });
  await registrarBitacora({
    empresaId: ctx.empresa.id,
    usuarioId: ctx.usuario.id,
    accion: "EDITAR",
    entidad: "Solicitud",
    entidadId: sol.id,
    detalle: { seccion: "pago de derechos", pagoOmitido: d.pagoOmitido, claveReferencia: d.claveReferencia, importe: d.importePago },
  });
  return trasEditar(sol, d.pagoOmitido ? "Se registró que la solicitud no requiere pago de derechos." : "Pago de derechos guardado.");
}

export async function guardarManifiestos(id: string, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const p = await prepararAccion(id, { editable: true });
  if (p.error) return p.error;
  const { ctx, sol } = p;

  const valores = formDataAObjeto(formData);
  const r = esquemaManifiestos.safeParse(valores);
  if (!r.success) return { ok: false, mensaje: MENSAJE_REVISA, errores: erroresDeZod(r.error), valores };
  const informacionConfidencial = r.data.publicos === "NO";
  await db.solicitud.update({ where: { id: sol.id }, data: { cveDeclaracion: r.data.cveDeclaracion, informacionConfidencial } });
  await registrarBitacora({
    empresaId: ctx.empresa.id,
    usuarioId: ctx.usuario.id,
    accion: "EDITAR",
    entidad: "Solicitud",
    entidadId: sol.id,
    detalle: { seccion: "manifiestos", cveDeclaracion: r.data.cveDeclaracion, informacionConfidencial },
  });
  return trasEditar(sol, "Manifiestos y declaraciones guardados.");
}

/** Liga documentos y terceros deducibles de los catálogos (sin quitar nada). */
export async function ligarSugeridos(id: string): Promise<EstadoFormulario> {
  const p = await prepararAccion(id, { editable: true });
  if (p.error) return p.error;
  const s = await aplicarSugerencias(p.sol.id, p.ctx.empresa.id);
  if (s.documentos + s.terceros === 0) {
    return { ok: true, mensaje: "No se encontraron documentos ni terceros adicionales para ligar." };
  }
  return trasEditar(p.sol, textoSugerencias(s).trim());
}

/** BORRADOR → LISTA si la validación para el portal no tiene errores. */
export async function marcarLista(id: string): Promise<EstadoFormulario> {
  const p = await prepararAccion(id, { editable: true });
  if (p.error) return p.error;
  const { ctx, sol } = p;
  if (sol.estado !== "BORRADOR") return { ok: false, mensaje: "Solo un borrador se puede marcar como lista." };
  const completa = await cargarSolicitudCompleta(ctx.empresa.id, sol.id);
  if (!completa) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADA };
  const resultado = validarSolicitud(completa, { canal: "PORTAL" });
  if (!resultado.lista) {
    const n = resultado.errores.length;
    return { ok: false, mensaje: `Aún hay ${n} error${n === 1 ? "" : "es"} por corregir (ver la validación).` };
  }
  await db.solicitud.updateMany({ where: { id: sol.id, estado: "BORRADOR" }, data: { estado: "LISTA" } });
  await registrarBitacora({ empresaId: ctx.empresa.id, usuarioId: ctx.usuario.id, accion: "MARCAR_LISTA", entidad: "Solicitud", entidadId: sol.id });
  revalidarSolicitud(sol.id);
  return { ok: true, mensaje: "La solicitud está lista para presentarse." };
}

/** Copia la captura en un borrador nuevo (sin pago, declaración ni seguimiento). */
export async function duplicarSolicitud(id: string): Promise<EstadoFormulario> {
  const p = await prepararAccion(id, { editable: false });
  if (p.error) return p.error;
  const { ctx } = p;
  const empresaId = ctx.empresa.id;
  const o = await cargarSolicitudCompleta(empresaId, p.sol.id);
  if (!o) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADA };
  const tramite = await tramiteVigente();

  const nueva = await conConsecutivo(empresaId, (numero) =>
    db.solicitud.create({
      data: {
        numero,
        empresaId,
        tramiteVersionId: tramite?.id ?? o.tramiteVersionId,
        establecimientoId: o.establecimientoId,
        estado: "BORRADOR",
        cveRegimen: o.cveRegimen,
        cveAduana: o.cveAduana,
        informacionConfidencial: o.informacionConfidencial,
        rlRfc: o.rlRfc,
        rlNombre: o.rlNombre,
        rlApellidoPaterno: o.rlApellidoPaterno,
        rlApellidoMaterno: o.rlApellidoMaterno,
        creadoPorId: ctx.usuario.id,
        notas: `Copia de la solicitud ${o.numero}.`,
        partidas: {
          create: o.partidas.map((pa, i) => ({
            productoId: pa.productoId,
            orden: i + 1,
            idClasificacionProducto: pa.idClasificacionProducto,
            idSubClasificacionProducto: pa.idSubClasificacionProducto,
            denominacionEspecifica: pa.denominacionEspecifica,
            denominacionDistintiva: pa.denominacionDistintiva,
            denominacionComunCientifica: pa.denominacionComunCientifica,
            idTipoProducto: pa.idTipoProducto,
            especifique: pa.especifique,
            idFormaFarmaceutica: pa.idFormaFarmaceutica,
            idEstadoFisico: pa.idEstadoFisico,
            fraccionArancelaria: pa.fraccionArancelaria,
            descripcionFraccion: pa.descripcionFraccion,
            cantidadUMT: pa.cantidadUMT,
            cantidadUMC: pa.cantidadUMC,
            umt: pa.umt,
            umc: pa.umc,
            desUMC: pa.desUMC,
            presentacionTipoEnvase: pa.presentacionTipoEnvase,
            numRegistroSanitario: pa.numRegistroSanitario,
            fechaCaducidad: pa.fechaCaducidad,
            cvePaisOrigen: pa.cvePaisOrigen,
            cvePaisProcedencia: pa.cvePaisProcedencia,
            idUsoEspecifico: pa.idUsoEspecifico,
          })),
        },
        terceros: { create: o.terceros.map((t) => ({ terceroId: t.terceroId, rol: t.rol })) },
        documentos: { create: o.documentos.map((d) => ({ documentoId: d.documentoId, requisito: d.requisito })) },
      },
      select: { id: true, numero: true },
    }),
  );
  await registrarBitacora({
    empresaId,
    usuarioId: ctx.usuario.id,
    accion: "DUPLICAR",
    entidad: "Solicitud",
    entidadId: nueva.id,
    detalle: { origen: o.id, numeroOrigen: o.numero, numero: nueva.numero },
  });
  revalidatePath("/solicitudes");
  revalidatePath("/");
  redirect(`/solicitudes/${nueva.id}?duplicada=${o.numero}`);
}

/** Cancela la solicitud en la app (no presenta desistimiento ante COFEPRIS). */
export async function cancelarSolicitud(id: string): Promise<EstadoFormulario> {
  const p = await prepararAccion(id, { editable: false });
  if (p.error) return p.error;
  const { ctx, sol } = p;
  if (sol.estado === "CANCELADA" || sol.estado.startsWith("RESUELTA_")) {
    return { ok: false, mensaje: "Una solicitud resuelta o ya cancelada no se puede cancelar." };
  }
  await db.solicitud.update({ where: { id: sol.id }, data: { estado: "CANCELADA" } });
  await registrarBitacora({
    empresaId: ctx.empresa.id,
    usuarioId: ctx.usuario.id,
    accion: "CANCELAR",
    entidad: "Solicitud",
    entidadId: sol.id,
    detalle: { numero: sol.numero, estadoAnterior: sol.estado },
  });
  revalidarSolicitud(sol.id);
  return { ok: true, mensaje: "Solicitud cancelada." };
}
