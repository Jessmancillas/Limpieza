import "server-only";

import { db } from "@/lib/db";

/**
 * Carga una solicitud con todo lo necesario para validarla, mostrarla, generar la hoja de
 * captura y armar el XML del WS 260211. SIEMPRE filtra por empresaId.
 */
export async function cargarSolicitudCompleta(empresaId: string, solicitudId: string) {
  return db.solicitud.findFirst({
    where: { id: solicitudId, empresaId },
    include: {
      empresa: true,
      tramiteVersion: true,
      establecimiento: { include: { scian: { orderBy: { clave: "asc" } } } },
      partidas: { orderBy: { orden: "asc" }, include: { producto: true } },
      terceros: { include: { tercero: true }, orderBy: { id: "asc" } },
      documentos: { include: { documento: true }, orderBy: { id: "asc" } },
      requerimientos: { orderBy: { fechaNotificacion: "desc" } },
      resolucion: true,
      envios: { orderBy: { creadoEn: "desc" }, take: 50 },
    },
  });
}

export type SolicitudCompleta = NonNullable<Awaited<ReturnType<typeof cargarSolicitudCompleta>>>;

/** Siguiente consecutivo de solicitud para la empresa. */
export async function siguienteNumeroSolicitud(empresaId: string): Promise<number> {
  const ultima = await db.solicitud.findFirst({
    where: { empresaId },
    orderBy: { numero: "desc" },
    select: { numero: true },
  });
  return (ultima?.numero ?? 0) + 1;
}

/** Estados en los que la solicitud ya no se puede editar (ya se presentó). */
export const ESTADOS_NO_EDITABLES = new Set([
  "PRESENTADA",
  "REQUERIMIENTO",
  "RESUELTA_ACEPTADA",
  "RESUELTA_RECHAZADA",
  "RESUELTA_PARCIAL",
  "CANCELADA",
]);
