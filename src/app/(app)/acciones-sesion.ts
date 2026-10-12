"use server";

import { redirect } from "next/navigation";

import { obtenerContexto } from "@/lib/auth/contexto";
import { cambiarEmpresaActivaDeSesion, cerrarSesion } from "@/lib/auth/session";

export async function salir() {
  await cerrarSesion();
  redirect("/login");
}

export async function cambiarEmpresa(formData: FormData) {
  const ctx = await obtenerContexto();
  const empresaId = String(formData.get("empresaId") ?? "");
  // Solo se permite cambiar a una empresa de la que el usuario es miembro.
  if (!ctx.membresias.some((m) => m.empresaId === empresaId)) redirect("/");
  await cambiarEmpresaActivaDeSesion(ctx.sesionId, empresaId);
  redirect("/");
}
