import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { sha256Hex, tokenAleatorio } from "@/lib/crypto";
import { db } from "@/lib/db";

export const COOKIE_SESION = "sesion";
const DURACION_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

export async function crearSesion(usuarioId: string, empresaActivaId: string | null) {
  const token = tokenAleatorio();
  const expiraEn = new Date(Date.now() + DURACION_MS);
  await db.sesion.create({
    data: { tokenHash: sha256Hex(token), usuarioId, empresaActivaId, expiraEn },
  });
  const almacen = await cookies();
  almacen.set(COOKIE_SESION, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiraEn,
  });
}

/** Sesión vigente del request actual (memorizada por request). */
export const obtenerSesion = cache(async () => {
  const almacen = await cookies();
  const token = almacen.get(COOKIE_SESION)?.value;
  if (!token) return null;
  const sesion = await db.sesion.findUnique({
    where: { tokenHash: sha256Hex(token) },
    include: { usuario: true },
  });
  if (!sesion || sesion.expiraEn < new Date() || !sesion.usuario.activo) return null;
  return sesion;
});

export async function cambiarEmpresaActivaDeSesion(sesionId: string, empresaId: string) {
  await db.sesion.update({ where: { id: sesionId }, data: { empresaActivaId: empresaId } });
}

export async function cerrarSesion() {
  const almacen = await cookies();
  const token = almacen.get(COOKIE_SESION)?.value;
  if (token) {
    await db.sesion.deleteMany({ where: { tokenHash: sha256Hex(token) } });
  }
  almacen.delete(COOKIE_SESION);
}
