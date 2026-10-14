import "server-only";

import { obtenerContexto, type Contexto } from "@/lib/auth/contexto";
import { registrarBitacora } from "@/lib/bitacora";
import { db } from "@/lib/db";
import type { EstadoFormulario } from "@/lib/formularios";

import { ETIQUETA_AREA, type Area } from "../constantes";
import { areasDeMembresia, puedeOperar } from "../permisos";

export type ContextoErp = Contexto & {
  areas: Area[];
  config: Awaited<ReturnType<typeof obtenerConfiguracionErp>>;
};

/** Políticas de decisión de la empresa (se crean con valores por defecto la primera vez). */
export async function obtenerConfiguracionErp(empresaId: string) {
  return db.configuracionErp.upsert({ where: { empresaId }, create: { empresaId }, update: {} });
}

/** Contexto de sesión + áreas funcionales del usuario en la empresa activa + políticas. */
export async function obtenerContextoErp(): Promise<ContextoErp> {
  const ctx = await obtenerContexto();
  const membresia = ctx.membresias.find((m) => m.empresaId === ctx.empresa.id);
  const config = await obtenerConfiguracionErp(ctx.empresa.id);
  return { ...ctx, areas: areasDeMembresia(membresia ? membresia.areas : null), config };
}

/** null si puede operar en el área; si no, el estado con el mensaje (para server actions). */
export function sinPermisoArea(ctx: ContextoErp, area: Area): EstadoFormulario | null {
  if (puedeOperar(ctx.rol, ctx.areas, area)) return null;
  return {
    ok: false,
    mensaje:
      ctx.rol === "CONSULTA"
        ? "Tu rol es de solo consulta."
        : `No tienes asignada el área «${ETIQUETA_AREA[area]}». Pide a un administrador que te la asigne.`,
  };
}

/** Error de regla de negocio: su mensaje se muestra tal cual al usuario. */
export class ErrorNegocio extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorNegocio";
  }
}

/** Ejecuta la acción y convierte ErrorNegocio en un estado de formulario con mensaje. */
export async function conErrores(fn: () => Promise<EstadoFormulario>): Promise<EstadoFormulario> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ErrorNegocio) return { ok: false, mensaje: e.message };
    throw e;
  }
}

/** Bitácora del ERP con el usuario y la empresa del contexto (ISO/IEC 27001 A.8.15). */
export async function bitacoraErp(ctx: Pick<ContextoErp, "empresa" | "usuario">, accion: string, entidad: string, entidadId: string | null, detalle?: Record<string, unknown>) {
  await registrarBitacora({ empresaId: ctx.empresa.id, usuarioId: ctx.usuario.id, accion, entidad, entidadId, detalle });
}
