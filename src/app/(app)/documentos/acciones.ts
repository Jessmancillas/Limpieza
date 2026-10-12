"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerContexto } from "@/lib/auth/contexto";
import { registrarBitacora } from "@/lib/bitacora";
import { db } from "@/lib/db";
import { erroresDeZod, formDataAObjeto, type EstadoFormulario } from "@/lib/formularios";
import { EXTENSION_POR_MIME } from "@/lib/pdf/limites";
import { guardarArchivo, leerArchivo, rutaEsDeEmpresa } from "@/lib/storage";

import {
  MENSAJE_NO_ENCONTRADO,
  MENSAJE_REVISA,
  sinPermisoEdicion,
  validarClavesCatalogo,
} from "../establecimientos/_compartido/servidor";
import { esquemaMetadatosDocumento, type MetadatosDocumento } from "./_lib/esquema";
import {
  borrarArchivosDeEmpresa,
  convertirYGuardar,
  EDOCUMENT_REINICIADO,
  leerArchivoSubido,
  solicitudesPresentadasConDocumento,
  validarLigas,
} from "./_lib/servidor";
import { rutaInternaSegura } from "./_lib/utilidades";

const ENTIDAD = "Documento";

/** Valida los datos descriptivos del documento (tipo, nombre, ligas, vigencia y tipo VUCEM). */
async function validarMetadatos(
  empresaId: string,
  valores: Record<string, string>,
): Promise<{ datos: MetadatosDocumento } | { errores: Record<string, string[]> }> {
  const resultado = esquemaMetadatosDocumento.safeParse(valores);
  if (!resultado.success) return { errores: erroresDeZod(resultado.error) };
  const d = resultado.data;
  const errores = {
    ...(await validarLigas(empresaId, d)),
    ...(await validarClavesCatalogo([
      { campo: "idTipoDocumentoVucem", catalogo: "CAT_TIPO_DOCUMENTO", clave: d.idTipoDocumentoVucem },
    ])),
  };
  return Object.keys(errores).length > 0 ? { errores } : { datos: d };
}

function datosMetadatos(d: MetadatosDocumento) {
  return {
    tipo: d.tipo,
    nombre: d.nombre,
    idTipoDocumentoVucem: d.idTipoDocumentoVucem ?? null,
    productoId: d.productoId ?? null,
    establecimientoId: d.establecimientoId ?? null,
    vigenciaHasta: d.vigenciaHasta ?? null,
  };
}

/** Revalida las páginas donde aparece el documento. */
function revalidarDocumento(
  id: string,
  ligas: Array<{ productoId?: string | null; establecimientoId?: string | null } | null | undefined>,
) {
  revalidatePath("/documentos");
  revalidatePath(`/documentos/${id}`);
  for (const l of ligas) {
    if (l?.productoId) revalidatePath(`/productos/${l.productoId}`);
    if (l?.establecimientoId) revalidatePath(`/establecimientos/${l.establecimientoId}`);
  }
}

/**
 * Alta de documento: guarda el original, lo convierte al formato VUCEM y guarda el PDF convertido.
 * Si la conversión falla, el documento se guarda con estado ERROR y el mensaje en el reporte.
 */
export async function crearDocumento(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContexto();
  const sinPermiso = sinPermisoEdicion(ctx);
  if (sinPermiso) return sinPermiso;
  const empresaId = ctx.empresa.id;

  const valores = formDataAObjeto(formData);
  const [validacion, archivo] = await Promise.all([validarMetadatos(empresaId, valores), leerArchivoSubido(formData)]);
  const errores = "errores" in validacion ? { ...validacion.errores } : {};
  if ("error" in archivo) errores.archivo = [archivo.error];
  if (!("datos" in validacion) || "error" in archivo) return { ok: false, mensaje: MENSAJE_REVISA, errores, valores };
  const d = validacion.datos;

  const rutaOriginal = await guardarArchivo(empresaId, archivo.datos, EXTENSION_POR_MIME[archivo.mime], "documentos");
  let conversion: Awaited<ReturnType<typeof convertirYGuardar>> | null = null;
  let creado: { id: string };
  try {
    conversion = await convertirYGuardar(empresaId, archivo);
    creado = await db.documento.create({
      data: {
        empresaId,
        ...datosMetadatos(d),
        archivoOriginalRuta: rutaOriginal,
        archivoOriginalNombre: archivo.nombre,
        archivoOriginalBytes: archivo.datos.length,
        archivoOriginalMime: archivo.mime,
        ...conversion.campos,
        creadoPorId: ctx.usuario.id,
      },
      select: { id: true },
    });
  } catch (e) {
    // No dejar archivos huérfanos si no se pudo registrar el documento.
    await borrarArchivosDeEmpresa(empresaId, [rutaOriginal, conversion?.campos.archivoVucemRuta]);
    console.error("No se pudo guardar el documento:", e);
    return { ok: false, mensaje: "No se pudo guardar el documento. Intenta de nuevo.", valores };
  }

  await registrarBitacora({
    empresaId,
    usuarioId: ctx.usuario.id,
    accion: "CREAR",
    entidad: ENTIDAD,
    entidadId: creado.id,
    detalle: {
      nombre: d.nombre,
      tipo: d.tipo,
      estadoConversion: conversion.campos.estadoConversion,
      paginas: conversion.campos.paginas,
      bytesVucem: conversion.campos.archivoVucemBytes,
    },
  });
  revalidarDocumento(creado.id, [d]);

  const volver = rutaInternaSegura(valores.volver);
  // Si la conversión falló se muestra el detalle (con el error y la liga para regresar).
  if (conversion.error || !volver) {
    const consulta = new URLSearchParams({ creado: "1", ...(volver ? { volver } : {}) });
    redirect(`/documentos/${creado.id}?${consulta.toString()}`);
  }
  redirect(volver);
}

/** Edición de los datos descriptivos (no cambia el archivo). */
export async function actualizarDocumento(id: string, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContexto();
  const sinPermiso = sinPermisoEdicion(ctx);
  if (sinPermiso) return sinPermiso;
  const empresaId = ctx.empresa.id;

  const existente = await db.documento.findFirst({
    where: { id, empresaId },
    select: { id: true, nombre: true, tipo: true, productoId: true, establecimientoId: true },
  });
  if (!existente) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };

  const valores = formDataAObjeto(formData);
  const validacion = await validarMetadatos(empresaId, valores);
  if ("errores" in validacion) return { ok: false, mensaje: MENSAJE_REVISA, errores: validacion.errores, valores };
  const datos = datosMetadatos(validacion.datos);

  await db.documento.update({ where: { id: existente.id }, data: datos });
  await registrarBitacora({
    empresaId,
    usuarioId: ctx.usuario.id,
    accion: "EDITAR",
    entidad: ENTIDAD,
    entidadId: existente.id,
    detalle: { nombre: datos.nombre, tipo: datos.tipo, ...(existente.nombre !== datos.nombre ? { nombreAnterior: existente.nombre } : {}) },
  });
  revalidarDocumento(existente.id, [existente, datos]);
  return { ok: true, mensaje: "Cambios guardados." };
}

const MENSAJE_PRESENTADO = (numeros: number[]) =>
  `El documento forma parte de ${numeros.length === 1 ? "la solicitud" : "las solicitudes"} ${numeros.join(", ")}, ` +
  "ya presentada(s) ante VUCEM: su archivo no se puede cambiar. Sube un documento nuevo si necesitas otra versión.";

/** Vuelve a convertir el archivo original con los límites vigentes del trámite. */
export async function reconvertirDocumento(id: string, _previo: EstadoFormulario, _formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContexto();
  const sinPermiso = sinPermisoEdicion(ctx);
  if (sinPermiso) return sinPermiso;
  const empresaId = ctx.empresa.id;

  const doc = await db.documento.findFirst({ where: { id, empresaId } });
  if (!doc) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const presentadas = await solicitudesPresentadasConDocumento(empresaId, doc.id);
  if (presentadas.length > 0) return { ok: false, mensaje: MENSAJE_PRESENTADO(presentadas.map((s) => s.numero)) };
  if (!rutaEsDeEmpresa(doc.archivoOriginalRuta, empresaId)) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };

  let original: Buffer;
  try {
    original = await leerArchivo(doc.archivoOriginalRuta);
  } catch {
    return { ok: false, mensaje: "No se encontró el archivo original en el almacenamiento. Usa «Reemplazar archivo» para subirlo de nuevo." };
  }

  const conversion = await convertirYGuardar(empresaId, { datos: original, mime: doc.archivoOriginalMime });
  // El eDocument identifica un archivo concreto: si el PDF cambió, la digitalización anterior ya no aplica.
  const cambio = conversion.campos.sha1Vucem !== doc.sha1Vucem;
  const reiniciarEDoc = cambio && doc.estadoEDocument !== "NO_ENVIADO";
  try {
    await db.documento.update({
      where: { id: doc.id },
      data: { ...conversion.campos, ...(reiniciarEDoc ? EDOCUMENT_REINICIADO : {}) },
    });
  } catch (e) {
    await borrarArchivosDeEmpresa(empresaId, [conversion.campos.archivoVucemRuta]);
    throw e;
  }
  // El PDF anterior ya no se usa (si el nuevo es idéntico, igual se guardó en otra ruta).
  if (doc.archivoVucemRuta && doc.archivoVucemRuta !== conversion.campos.archivoVucemRuta) {
    await borrarArchivosDeEmpresa(empresaId, [doc.archivoVucemRuta]);
  }

  await registrarBitacora({
    empresaId,
    usuarioId: ctx.usuario.id,
    accion: "RECONVERTIR",
    entidad: ENTIDAD,
    entidadId: doc.id,
    detalle: {
      nombre: doc.nombre,
      estadoConversion: conversion.campos.estadoConversion,
      cambioArchivo: cambio,
      ...(reiniciarEDoc ? { eDocumentAnterior: doc.eDocument, estadoEDocumentAnterior: doc.estadoEDocument } : {}),
    },
  });
  revalidarDocumento(doc.id, [doc]);

  if (conversion.error) return { ok: false, mensaje: `No se pudo convertir: ${conversion.error}` };
  return {
    ok: true,
    mensaje: reiniciarEDoc
      ? "Documento convertido de nuevo. El PDF cambió, así que hay que volver a digitalizarlo (eDocument)."
      : "Documento convertido de nuevo.",
  };
}

/** Sustituye el archivo: lo convierte y reinicia la digitalización (el eDocument era de otro archivo). */
export async function reemplazarArchivo(id: string, _previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContexto();
  const sinPermiso = sinPermisoEdicion(ctx);
  if (sinPermiso) return sinPermiso;
  const empresaId = ctx.empresa.id;

  const doc = await db.documento.findFirst({ where: { id, empresaId } });
  if (!doc) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const presentadas = await solicitudesPresentadasConDocumento(empresaId, doc.id);
  if (presentadas.length > 0) return { ok: false, mensaje: MENSAJE_PRESENTADO(presentadas.map((s) => s.numero)) };

  const archivo = await leerArchivoSubido(formData);
  if ("error" in archivo) return { ok: false, mensaje: archivo.error, errores: { archivo: [archivo.error] } };

  const rutaOriginal = await guardarArchivo(empresaId, archivo.datos, EXTENSION_POR_MIME[archivo.mime], "documentos");
  let conversion: Awaited<ReturnType<typeof convertirYGuardar>> | null = null;
  try {
    conversion = await convertirYGuardar(empresaId, archivo);
    await db.documento.update({
      where: { id: doc.id },
      data: {
        archivoOriginalRuta: rutaOriginal,
        archivoOriginalNombre: archivo.nombre,
        archivoOriginalBytes: archivo.datos.length,
        archivoOriginalMime: archivo.mime,
        ...conversion.campos,
        ...EDOCUMENT_REINICIADO,
      },
    });
  } catch (e) {
    await borrarArchivosDeEmpresa(empresaId, [rutaOriginal, conversion?.campos.archivoVucemRuta]);
    console.error("No se pudo reemplazar el archivo del documento:", e);
    return { ok: false, mensaje: "No se pudo reemplazar el archivo. Intenta de nuevo." };
  }
  await borrarArchivosDeEmpresa(empresaId, [doc.archivoOriginalRuta, doc.archivoVucemRuta]);

  await registrarBitacora({
    empresaId,
    usuarioId: ctx.usuario.id,
    accion: "REEMPLAZAR_ARCHIVO",
    entidad: ENTIDAD,
    entidadId: doc.id,
    detalle: {
      nombre: doc.nombre,
      archivoAnterior: doc.archivoOriginalNombre,
      archivoNuevo: archivo.nombre,
      estadoConversion: conversion.campos.estadoConversion,
      ...(doc.estadoEDocument !== "NO_ENVIADO" ? { eDocumentAnterior: doc.eDocument, estadoEDocumentAnterior: doc.estadoEDocument } : {}),
    },
  });
  revalidarDocumento(doc.id, [doc]);

  if (conversion.error) return { ok: false, mensaje: `Archivo reemplazado, pero no se pudo convertir: ${conversion.error}` };
  return {
    ok: true,
    mensaje:
      doc.estadoEDocument !== "NO_ENVIADO"
        ? "Archivo reemplazado y convertido. La digitalización anterior (eDocument) se descartó: vuelve a digitalizarlo."
        : "Archivo reemplazado y convertido.",
  };
}

/** Elimina el documento y sus archivos, solo si no está ligado a ninguna solicitud. */
export async function eliminarDocumento(id: string, _previo: EstadoFormulario, _formData: FormData): Promise<EstadoFormulario> {
  const ctx = await obtenerContexto();
  const sinPermiso = sinPermisoEdicion(ctx);
  if (sinPermiso) return sinPermiso;
  const empresaId = ctx.empresa.id;

  const doc = await db.documento.findFirst({
    where: { id, empresaId },
    select: {
      id: true,
      nombre: true,
      tipo: true,
      productoId: true,
      establecimientoId: true,
      archivoOriginalRuta: true,
      archivoVucemRuta: true,
      eDocument: true,
      _count: { select: { solicitudes: true } },
    },
  });
  if (!doc) return { ok: false, mensaje: MENSAJE_NO_ENCONTRADO };
  const mensajeEnUso = "El documento está ligado a una o más solicitudes: quítalo de ellas antes de eliminarlo.";
  if (doc._count.solicitudes > 0) return { ok: false, mensaje: mensajeEnUso };

  try {
    // deleteMany con empresaId: nunca borra un documento de otra empresa.
    await db.documento.deleteMany({ where: { id: doc.id, empresaId } });
  } catch {
    // SolicitudDocumento usa onDelete: Restrict (alguien lo ligó mientras tanto).
    return { ok: false, mensaje: mensajeEnUso };
  }
  await borrarArchivosDeEmpresa(empresaId, [doc.archivoOriginalRuta, doc.archivoVucemRuta]);
  await registrarBitacora({
    empresaId,
    usuarioId: ctx.usuario.id,
    accion: "ELIMINAR",
    entidad: ENTIDAD,
    entidadId: doc.id,
    detalle: { nombre: doc.nombre, tipo: doc.tipo, ...(doc.eDocument ? { eDocument: doc.eDocument } : {}) },
  });
  revalidarDocumento(doc.id, [doc]);
  redirect("/documentos?eliminado=1");
}
