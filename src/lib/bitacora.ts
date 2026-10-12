import "server-only";

import { db } from "@/lib/db";

/** Registra una acción en la bitácora. Nunca incluir contraseñas, llaves ni tokens. */
export async function registrarBitacora(entrada: {
  empresaId?: string | null;
  usuarioId?: string | null;
  accion: string;
  entidad: string;
  entidadId?: string | null;
  detalle?: Record<string, unknown>;
}) {
  await db.bitacora.create({
    data: {
      empresaId: entrada.empresaId ?? null,
      usuarioId: entrada.usuarioId ?? null,
      accion: entrada.accion,
      entidad: entrada.entidad,
      entidadId: entrada.entidadId ?? null,
      detalle: entrada.detalle ? JSON.stringify(entrada.detalle) : null,
    },
  });
}
