import "server-only";

import { revalidatePath } from "next/cache";

import { obtenerContexto, type Contexto } from "@/lib/auth/contexto";
import { db } from "@/lib/db";
import type { EstadoFormulario } from "@/lib/formularios";
import { ESTADOS_NO_EDITABLES, siguienteNumeroSolicitud } from "@/lib/solicitudes/consultas";

import { sinPermisoEdicion } from "../../establecimientos/_compartido/servidor";

export const MENSAJE_NO_ENCONTRADA = "La solicitud no existe o no pertenece a la empresa activa.";
export const MENSAJE_NO_EDITABLE = "La solicitud ya se presentó o se canceló: sus datos ya no se pueden modificar.";
export const MENSAJE_REVISA = "Revisa los campos marcados.";

export type SolicitudBasica = { id: string; numero: number; estado: string; empresaId: string };

/** Contexto + solicitud de la empresa activa, verificando permiso de edición. */
export async function prepararAccion(
  id: string,
  { editable }: { editable: boolean },
): Promise<{ ctx: Contexto; sol: SolicitudBasica; error?: undefined } | { error: EstadoFormulario }> {
  const ctx = await obtenerContexto();
  const sinPermiso = sinPermisoEdicion(ctx);
  if (sinPermiso) return { error: sinPermiso };
  const sol = await db.solicitud.findFirst({
    where: { id, empresaId: ctx.empresa.id },
    select: { id: true, numero: true, estado: true, empresaId: true },
  });
  if (!sol) return { error: { ok: false, mensaje: MENSAJE_NO_ENCONTRADA } };
  if (editable && ESTADOS_NO_EDITABLES.has(sol.estado)) return { error: { ok: false, mensaje: MENSAJE_NO_EDITABLE } };
  return { ctx, sol };
}

export function revalidarSolicitud(id: string) {
  revalidatePath("/solicitudes");
  revalidatePath(`/solicitudes/${id}`);
  revalidatePath("/");
}

/**
 * Tras modificar los datos de captura: si la solicitud estaba "lista", vuelve a borrador (hay que
 * revisarla de nuevo). Regresa el estado del formulario con el mensaje.
 */
export async function trasEditar(sol: SolicitudBasica, mensaje: string): Promise<EstadoFormulario> {
  let texto = mensaje;
  if (sol.estado === "LISTA") {
    const r = await db.solicitud.updateMany({ where: { id: sol.id, estado: "LISTA" }, data: { estado: "BORRADOR" } });
    if (r.count > 0) texto += " La solicitud volvió a borrador: revisa la validación y márcala como lista de nuevo.";
  } else {
    // Actualiza la fecha de modificación (orden de "últimas solicitudes").
    await db.solicitud.update({ where: { id: sol.id }, data: { actualizadoEn: new Date() } });
  }
  revalidarSolicitud(sol.id);
  return { ok: true, mensaje: texto };
}

/** Ejecuta una alta con el siguiente consecutivo de la empresa (reintenta si otro usuario lo tomó). */
export async function conConsecutivo<T>(empresaId: string, crear: (numero: number) => Promise<T>): Promise<T> {
  for (let intento = 0; ; intento++) {
    try {
      return await crear(await siguienteNumeroSolicitud(empresaId));
    } catch (e) {
      if (!esErrorUnico(e) || intento >= 4) throw e;
    }
  }
}

/** Versión activa más reciente del trámite 260211. */
export async function tramiteVigente() {
  return db.tramiteVersion.findFirst({
    where: { claveVucem: "260211", activo: true },
    orderBy: { vigenteDesde: "desc" },
    select: { id: true },
  });
}

/** true si el error de Prisma es por un índice único. */
export function esErrorUnico(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}
