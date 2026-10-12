import "server-only";

import { cifrar, descifrar } from "@/lib/crypto";
import { db } from "@/lib/db";

// Contraseña de servicios web de VUCEM (la que se genera en el portal con la e.firma). Se guarda
// cifrada (AES-256-GCM) y solo se descifra en el servidor al momento de enviar. NUNCA se regresa
// al navegador ni se escribe en bitácora/logs.

export async function guardarCredencial(
  empresaId: string,
  usuarioWs: string,
  password: string,
  actualizadoPorId?: string | null,
): Promise<void> {
  const datos = {
    usuarioWs: usuarioWs.trim().toUpperCase(),
    passwordCifrado: cifrar(password),
    actualizadoPorId: actualizadoPorId ?? null,
  };
  await db.credencialVucem.upsert({
    where: { empresaId },
    create: { empresaId, ...datos },
    update: datos,
  });
}

/** Credencial descifrada, solo para armar el UsernameToken del envío. */
export async function obtenerCredencial(empresaId: string): Promise<{ usuarioWs: string; password: string } | null> {
  const registro = await db.credencialVucem.findUnique({ where: { empresaId } });
  if (!registro) return null;
  try {
    return { usuarioWs: registro.usuarioWs, password: descifrar(registro.passwordCifrado) };
  } catch {
    throw new Error(
      "No se pudo descifrar la contraseña de servicios web guardada (¿cambió APP_ENCRYPTION_KEY?). Captúrala de nuevo en Configuración → Conexión VUCEM.",
    );
  }
}

export type EstadoCredencial = { usuarioWs: string; actualizadoEn: Date; actualizadoPor: string | null };

/** Datos públicos de la credencial (sin contraseña) o null si no hay. */
export async function tieneCredencial(empresaId: string): Promise<EstadoCredencial | null> {
  const registro = await db.credencialVucem.findUnique({
    where: { empresaId },
    select: { usuarioWs: true, actualizadoEn: true, actualizadoPorId: true },
  });
  if (!registro) return null;
  const usuario = registro.actualizadoPorId
    ? await db.usuario.findUnique({ where: { id: registro.actualizadoPorId }, select: { nombre: true, email: true } })
    : null;
  return {
    usuarioWs: registro.usuarioWs,
    actualizadoEn: registro.actualizadoEn,
    actualizadoPor: usuario ? usuario.nombre || usuario.email : null,
  };
}

export async function borrarCredencial(empresaId: string): Promise<boolean> {
  const { count } = await db.credencialVucem.deleteMany({ where: { empresaId } });
  return count > 0;
}
