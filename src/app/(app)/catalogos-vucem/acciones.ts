"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ErrorPermiso, exigirRol, obtenerContexto } from "@/lib/auth/contexto";
import { registrarBitacora } from "@/lib/bitacora";
import { CATALOGOS } from "@/lib/constantes";
import { db } from "@/lib/db";
import { erroresDeZod, formDataAObjeto, type EstadoFormulario } from "@/lib/formularios";
import { zCheckbox, zTexto, zTextoOpcional } from "@/lib/validacion/comunes";

import { LIMITES_CSV, NOMBRE_SEPARADOR, parsearCatalogoCsv, type ErrorRenglon, type OpcionSeparador } from "./csv";
import { esCatalogo } from "./info";

const MAX_BYTES_CSV = 5 * 1024 * 1024;
const MAX_ERRORES_REPORTADOS = 200;

export type ResumenImportacion = {
  insertados: number;
  actualizados: number;
  desactivados: number;
  totalErrores: number;
  errores: ErrorRenglon[];
  separador: string;
  conEncabezado: boolean;
};

export type EstadoImportacion = EstadoFormulario & { resumen?: ResumenImportacion };

/** Valida permiso de administrador y que el catálogo exista. Regresa el contexto. */
async function prepararAdmin(catalogo: string) {
  const ctx = await obtenerContexto();
  exigirRol(ctx, ["ADMIN"]);
  if (!esCatalogo(catalogo)) throw new ErrorPermiso("El catálogo no existe.");
  return ctx;
}

function revalidar(catalogo: string) {
  revalidatePath("/catalogos-vucem");
  revalidatePath(`/catalogos-vucem/${catalogo}`);
}

const esquemaAlta = z.object({
  clave: zTexto(LIMITES_CSV.clave, "La clave es obligatoria"),
  descripcion: zTexto(LIMITES_CSV.descripcion, "La descripción es obligatoria"),
  padreClave: zTextoOpcional(LIMITES_CSV.clave),
  porConfirmar: zCheckbox,
});

export async function crearRegistroCatalogo(
  catalogo: string,
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const valores = formDataAObjeto(formData);
  try {
    const ctx = await prepararAdmin(catalogo);
    const datos = esquemaAlta.safeParse(valores);
    if (!datos.success) return { ok: false, errores: erroresDeZod(datos.error), valores };

    const { clave, descripcion, padreClave, porConfirmar } = datos.data;
    const existente = await db.catalogoVucem.findUnique({ where: { catalogo_clave: { catalogo, clave } } });
    if (existente) {
      return { ok: false, errores: { clave: [`La clave "${clave}" ya existe en este catálogo; edítala desde la tabla.`] }, valores };
    }

    const registro = await db.catalogoVucem.create({
      data: { catalogo, clave, descripcion, padreClave: padreClave ?? null, porConfirmar, fuente: "MANUAL", activo: true },
    });
    await registrarBitacora({
      empresaId: ctx.empresa.id,
      usuarioId: ctx.usuario.id,
      accion: "CREAR",
      entidad: "CatalogoVucem",
      entidadId: registro.id,
      detalle: { catalogo, clave, descripcion, padreClave: padreClave ?? null, porConfirmar },
    });
    revalidar(catalogo);
    return { ok: true, mensaje: `Clave "${clave}" agregada a ${CATALOGOS[catalogo as keyof typeof CATALOGOS]}.` };
  } catch (e) {
    if (e instanceof ErrorPermiso) return { ok: false, mensaje: e.message, valores };
    throw e;
  }
}

const esquemaEdicion = z.object({
  descripcion: zTexto(LIMITES_CSV.descripcion, "La descripción es obligatoria"),
  padreClave: zTextoOpcional(LIMITES_CSV.clave),
  activo: zCheckbox,
  porConfirmar: zCheckbox,
});

export async function editarRegistroCatalogo(
  catalogo: string,
  id: string,
  _previo: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const valores = formDataAObjeto(formData);
  try {
    const ctx = await prepararAdmin(catalogo);
    // El id viene del cliente: se verifica que pertenezca al catálogo de la URL.
    const actual = await db.catalogoVucem.findFirst({ where: { id, catalogo } });
    if (!actual) return { ok: false, mensaje: "La clave ya no existe en este catálogo." };

    const datos = esquemaEdicion.safeParse(valores);
    if (!datos.success) return { ok: false, errores: erroresDeZod(datos.error), valores };

    const nuevo = {
      descripcion: datos.data.descripcion,
      padreClave: datos.data.padreClave ?? null,
      activo: datos.data.activo,
      porConfirmar: datos.data.porConfirmar,
    };
    const cambios: Record<string, { antes: unknown; despues: unknown }> = {};
    for (const campo of Object.keys(nuevo) as Array<keyof typeof nuevo>) {
      if (actual[campo] !== nuevo[campo]) cambios[campo] = { antes: actual[campo], despues: nuevo[campo] };
    }
    if (Object.keys(cambios).length === 0) return { ok: true, mensaje: "Sin cambios." };

    await db.catalogoVucem.update({ where: { id: actual.id }, data: nuevo });
    await registrarBitacora({
      empresaId: ctx.empresa.id,
      usuarioId: ctx.usuario.id,
      accion: "ACTUALIZAR",
      entidad: "CatalogoVucem",
      entidadId: actual.id,
      detalle: { catalogo, clave: actual.clave, cambios },
    });
    revalidar(catalogo);
    return { ok: true, mensaje: `Clave "${actual.clave}" actualizada.` };
  } catch (e) {
    if (e instanceof ErrorPermiso) return { ok: false, mensaje: e.message, valores };
    throw e;
  }
}

const SEPARADORES: Record<string, OpcionSeparador> = {
  auto: "auto",
  coma: ",",
  puntoycoma: ";",
  tabulador: "\t",
};

/** Lee el CSV del archivo subido o, si no hay archivo, del texto pegado. */
async function leerEntradaCsv(formData: FormData): Promise<{ texto: string; origen: string } | { error: string }> {
  const archivo = formData.get("archivo");
  if (archivo instanceof File && archivo.size > 0) {
    if (archivo.size > MAX_BYTES_CSV) return { error: "El archivo excede 5 MB. Divídelo en partes." };
    try {
      const texto = new TextDecoder("utf-8", { fatal: true }).decode(await archivo.arrayBuffer());
      return { texto, origen: `archivo ${archivo.name}` };
    } catch {
      return {
        error: 'El archivo no está en UTF-8. En Excel guárdalo como "CSV UTF-8 (delimitado por comas)" e inténtalo de nuevo.',
      };
    }
  }
  const texto = formData.get("texto");
  if (typeof texto === "string" && texto.trim() !== "") {
    if (texto.length > MAX_BYTES_CSV) return { error: "El texto excede 5 MB. Divídelo en partes." };
    return { texto, origen: "texto pegado" };
  }
  return { error: "Selecciona un archivo CSV o pega el contenido en el cuadro de texto." };
}

export async function importarCatalogoCsv(
  catalogo: string,
  _previo: EstadoImportacion,
  formData: FormData,
): Promise<EstadoImportacion> {
  try {
    const ctx = await prepararAdmin(catalogo);
    const entrada = await leerEntradaCsv(formData);
    if ("error" in entrada) return { ok: false, mensaje: entrada.error };

    const separador = SEPARADORES[String(formData.get("separador") ?? "auto")] ?? "auto";
    const desactivarAusentes = formData.get("desactivarAusentes") === "on";
    const resultado = parsearCatalogoCsv(entrada.texto, { separador });
    if (resultado.errorGeneral) return { ok: false, mensaje: resultado.errorGeneral };

    let insertados = 0;
    let actualizados = 0;
    let desactivados = 0;
    const sinErrores = resultado.errores.length === 0;

    await db.$transaction(
      async (tx) => {
        const existentes = new Set(
          (await tx.catalogoVucem.findMany({ where: { catalogo }, select: { clave: true } })).map((r) => r.clave),
        );
        const nuevos = resultado.registros.filter((r) => !existentes.has(r.clave));
        // Altas en bloque (rápido para la primera carga del catálogo oficial); cambios uno por uno.
        for (let i = 0; i < nuevos.length; i += 500) {
          const { count } = await tx.catalogoVucem.createMany({
            data: nuevos.slice(i, i + 500).map((r) => ({
              catalogo,
              clave: r.clave,
              descripcion: r.descripcion,
              padreClave: r.padreClave ?? null,
              fuente: "IMPORTADO",
              porConfirmar: false,
              activo: true,
            })),
          });
          insertados += count;
        }
        for (const r of resultado.registros) {
          if (!existentes.has(r.clave)) continue;
          await tx.catalogoVucem.update({
            where: { catalogo_clave: { catalogo, clave: r.clave } },
            data: {
              descripcion: r.descripcion,
              fuente: "IMPORTADO",
              porConfirmar: false,
              activo: true,
              ...(r.padreClave === undefined ? {} : { padreClave: r.padreClave }),
            },
          });
          actualizados++;
        }
        // Solo si el archivo vino completo y sin errores, para no desactivar claves por un renglón mal formado.
        if (desactivarAusentes && sinErrores && resultado.registros.length > 0) {
          const enArchivo = new Set(resultado.registros.map((r) => r.clave));
          const ausentes = [...existentes].filter((c) => !enArchivo.has(c));
          for (let i = 0; i < ausentes.length; i += 500) {
            const { count } = await tx.catalogoVucem.updateMany({
              where: { catalogo, activo: true, clave: { in: ausentes.slice(i, i + 500) } },
              data: { activo: false },
            });
            desactivados += count;
          }
        }
      },
      { timeout: 120_000 },
    );

    await registrarBitacora({
      empresaId: ctx.empresa.id,
      usuarioId: ctx.usuario.id,
      accion: "IMPORTAR",
      entidad: "CatalogoVucem",
      entidadId: catalogo,
      detalle: {
        catalogo,
        origen: entrada.origen,
        insertados,
        actualizados,
        desactivados,
        errores: resultado.errores.length,
      },
    });
    revalidar(catalogo);

    const resumen: ResumenImportacion = {
      insertados,
      actualizados,
      desactivados,
      totalErrores: resultado.errores.length,
      errores: resultado.errores.slice(0, MAX_ERRORES_REPORTADOS),
      separador: NOMBRE_SEPARADOR[resultado.separador],
      conEncabezado: resultado.conEncabezado,
    };
    const partes = [`${insertados} nuevas`, `${actualizados} actualizadas`];
    if (desactivados > 0) partes.push(`${desactivados} desactivadas`);
    if (resultado.errores.length > 0) partes.push(`${resultado.errores.length} renglones con error`);
    let mensaje = `Importación terminada: ${partes.join(", ")}.`;
    if (desactivarAusentes && !sinErrores) {
      mensaje += " No se desactivaron claves ausentes porque el archivo tiene errores.";
    }
    return { ok: insertados + actualizados > 0 || sinErrores, mensaje, resumen };
  } catch (e) {
    if (e instanceof ErrorPermiso) return { ok: false, mensaje: e.message };
    throw e;
  }
}
