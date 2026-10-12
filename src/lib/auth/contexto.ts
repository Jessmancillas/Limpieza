import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import type { Rol } from "@/lib/constantes";
import { db } from "@/lib/db";

import { obtenerSesion } from "./session";

/** Usuario autenticado o redirección a /login. */
export const requerirUsuario = cache(async () => {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  return sesion;
});

/**
 * Contexto de trabajo: usuario + empresa activa + rol.
 * TODA consulta de datos de negocio debe filtrar por `ctx.empresa.id`.
 */
export const obtenerContexto = cache(async () => {
  const sesion = await requerirUsuario();
  const membresias = await db.membresia.findMany({
    where: { usuarioId: sesion.usuarioId },
    include: { empresa: true },
    orderBy: { creadoEn: "asc" },
  });
  if (membresias.length === 0) redirect("/empresas/nueva");

  const activa =
    membresias.find((m) => m.empresaId === sesion.empresaActivaId) ?? membresias[0];

  return {
    sesionId: sesion.id,
    usuario: sesion.usuario,
    empresa: activa.empresa,
    rol: activa.rol as Rol,
    membresias,
  };
});

export type Contexto = Awaited<ReturnType<typeof obtenerContexto>>;

export class ErrorPermiso extends Error {
  constructor(mensaje = "No tienes permiso para realizar esta acción.") {
    super(mensaje);
    this.name = "ErrorPermiso";
  }
}

/** Lanza ErrorPermiso si el rol del usuario no está en la lista. */
export function exigirRol(ctx: Contexto, roles: Rol[]) {
  if (!roles.includes(ctx.rol)) throw new ErrorPermiso();
}

/** Atajo: puede modificar datos (ADMIN o CAPTURISTA). */
export function exigirEdicion(ctx: Contexto) {
  exigirRol(ctx, ["ADMIN", "CAPTURISTA"]);
}
