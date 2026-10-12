import "server-only";

import { db } from "@/lib/db";

import { diasHabilesEntre } from "./dias-habiles";
import { obtenerDiasInhabiles } from "./dias-inhabiles-bd";
import { diasNaturalesHasta, hoyMexico, sumarDiasNaturales } from "./fechas";

export const DIAS_PERMISO_POR_VENCER = 30;
export const DIAS_REGISTRO_POR_VENCER = 90;
export const DIAS_DOCUMENTO_POR_VENCER = 60;

/** Datos del tablero de inicio. Todo filtrado por empresa. */
export async function cargarTablero(empresaId: string, ahora: Date = new Date()) {
  const hoy = hoyMexico(ahora);
  const [
    conteos,
    requerimientos,
    permisos,
    productos,
    documentos,
    ultimas,
    inhabiles,
    totalEstablecimientos,
    totalProductos,
    totalFabricantes,
    totalDocumentos,
    totalSolicitudes,
    credencial,
  ] = await Promise.all([
    db.solicitud.groupBy({ by: ["estado"], where: { empresaId }, _count: { _all: true } }),
    db.requerimiento.findMany({
      where: {
        estado: "PENDIENTE",
        solicitud: { empresaId, estado: { notIn: ["CANCELADA", "RESUELTA_ACEPTADA", "RESUELTA_RECHAZADA", "RESUELTA_PARCIAL"] } },
      },
      orderBy: { fechaLimite: "asc" },
      take: 20,
      select: {
        id: true,
        fechaNotificacion: true,
        fechaLimite: true,
        plazoDiasHabiles: true,
        descripcion: true,
        solicitud: { select: { id: true, numero: true, folioVucem: true } },
      },
    }),
    db.resolucion.findMany({
      where: {
        solicitud: { empresaId },
        sentido: { in: ["ACEPTADA", "PARCIAL"] },
        vigenciaHasta: { gte: hoy, lte: sumarDiasNaturales(hoy, DIAS_PERMISO_POR_VENCER) },
      },
      orderBy: { vigenciaHasta: "asc" },
      take: 20,
      select: {
        id: true,
        numeroPermiso: true,
        vigenciaHasta: true,
        solicitud: { select: { id: true, numero: true } },
      },
    }),
    db.producto.findMany({
      where: {
        empresaId,
        activo: true,
        numRegistroSanitario: { not: null },
        vigenciaRegistroSanitario: { lte: sumarDiasNaturales(hoy, DIAS_REGISTRO_POR_VENCER) },
      },
      orderBy: { vigenciaRegistroSanitario: "asc" },
      take: 20,
      select: { id: true, denominacionEspecifica: true, numRegistroSanitario: true, vigenciaRegistroSanitario: true },
    }),
    db.documento.findMany({
      where: { empresaId, vigenciaHasta: { lte: sumarDiasNaturales(hoy, DIAS_DOCUMENTO_POR_VENCER) } },
      orderBy: { vigenciaHasta: "asc" },
      take: 20,
      select: { id: true, nombre: true, tipo: true, vigenciaHasta: true },
    }),
    db.solicitud.findMany({
      where: { empresaId },
      orderBy: { actualizadoEn: "desc" },
      take: 5,
      select: {
        id: true,
        numero: true,
        estado: true,
        folioVucem: true,
        actualizadoEn: true,
        establecimiento: { select: { denominacionRazonSocial: true } },
        _count: { select: { partidas: true } },
      },
    }),
    obtenerDiasInhabiles(),
    db.establecimiento.count({ where: { empresaId } }),
    db.producto.count({ where: { empresaId } }),
    db.tercero.count({ where: { empresaId, tipo: "FABRICANTE" } }),
    db.documento.count({ where: { empresaId } }),
    db.solicitud.count({ where: { empresaId } }),
    db.credencialVucem.findUnique({ where: { empresaId }, select: { id: true } }),
  ]);

  return {
    hoy,
    conteos: new Map(conteos.map((c) => [c.estado, c._count._all])),
    requerimientos: requerimientos.map((r) => ({ ...r, diasRestantes: diasHabilesEntre(hoy, r.fechaLimite, inhabiles) })),
    permisos: permisos.map((p) => ({ ...p, dias: p.vigenciaHasta ? diasNaturalesHasta(p.vigenciaHasta, ahora) : null })),
    productos: productos.map((p) => ({ ...p, dias: p.vigenciaRegistroSanitario ? diasNaturalesHasta(p.vigenciaRegistroSanitario, ahora) : null })),
    documentos: documentos.map((d) => ({ ...d, dias: d.vigenciaHasta ? diasNaturalesHasta(d.vigenciaHasta, ahora) : null })),
    ultimas,
    totales: {
      establecimientos: totalEstablecimientos,
      productos: totalProductos,
      fabricantes: totalFabricantes,
      documentos: totalDocumentos,
      solicitudes: totalSolicitudes,
      credencialVucem: !!credencial,
    },
  };
}

export type DatosTablero = Awaited<ReturnType<typeof cargarTablero>>;
