import "server-only";

import { ErrorPermiso, exigirEdicion, type Contexto } from "@/lib/auth/contexto";
import { CATALOGOS, type Catalogo } from "@/lib/constantes";
import { db } from "@/lib/db";
import type { EstadoFormulario } from "@/lib/formularios";

export const MENSAJE_REVISA = "Revisa los campos marcados.";
export const MENSAJE_NO_ENCONTRADO = "El registro no existe o no pertenece a la empresa activa.";

/**
 * Los ids de las acciones llegan como argumentos ligados (.bind) que viajan al navegador y
 * regresan sin cifrar: el cliente puede alterarlos. Solo se aceptan textos cortos (además, cada
 * acción verifica que el registro pertenezca a la empresa activa).
 */
export function esIdValido(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id.length <= 64;
}

/** null si el usuario puede modificar datos; si no, el estado con el mensaje de permiso. */
export function sinPermisoEdicion(ctx: Contexto): EstadoFormulario | null {
  try {
    exigirEdicion(ctx);
    return null;
  } catch (e) {
    if (e instanceof ErrorPermiso) return { ok: false, mensaje: e.message };
    throw e;
  }
}

/**
 * Verifica que cada clave exista (activa) en su catálogo VUCEM. Si el catálogo aún no tiene
 * registros se acepta la clave capturada a mano. Regresa errores por campo.
 */
export async function validarClavesCatalogo(
  campos: Array<{ campo: string; catalogo: Catalogo; clave: string | null | undefined }>,
): Promise<Record<string, string[]>> {
  const errores: Record<string, string[]> = {};
  for (const { campo, catalogo, clave } of campos) {
    if (!clave) continue;
    const registro = await db.catalogoVucem.findUnique({
      where: { catalogo_clave: { catalogo, clave } },
      select: { activo: true },
    });
    if (registro?.activo) continue;
    const hayCatalogo = (await db.catalogoVucem.count({ where: { catalogo, activo: true } })) > 0;
    if (hayCatalogo) errores[campo] = [`Elige una opción del catálogo «${CATALOGOS[catalogo]}»`];
  }
  return errores;
}

/** Plural sencillo en español: "1 solicitud", "3 solicitudes". */
export function plural(n: number, singular: string, pluralTexto: string): string {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}
