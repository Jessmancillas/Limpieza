import "server-only";

import { db } from "@/lib/db";
import { leerDefinicion, type DefinicionTramite } from "@/lib/tramite/definicion";

import { hoyMexico } from "./fechas";

/**
 * Liga automáticamente lo que se puede deducir de los catálogos de la empresa:
 * - documentos del establecimiento (licencia/aviso, aviso de responsable) para requisitos sin documento;
 * - el documento de cada producto (registro sanitario) para requisitos "por producto";
 * - el fabricante de cada producto como FABRICANTE;
 * - el destinatario, si la empresa tiene uno solo activo.
 * Nunca quita nada ni liga documentos con conversión fallida o vencidos.
 */
export async function aplicarSugerencias(solicitudId: string, empresaId: string): Promise<{ documentos: number; terceros: number }> {
  const sol = await db.solicitud.findFirst({
    where: { id: solicitudId, empresaId },
    select: {
      id: true,
      establecimientoId: true,
      tramiteVersion: { select: { definicion: true } },
      partidas: { select: { productoId: true, producto: { select: { fabricanteId: true } } } },
      documentos: { select: { documentoId: true, requisito: true, documento: { select: { productoId: true } } } },
      terceros: { select: { terceroId: true, rol: true } },
    },
  });
  if (!sol) return { documentos: 0, terceros: 0 };

  let definicion: DefinicionTramite | null = null;
  try {
    definicion = leerDefinicion(sol.tramiteVersion.definicion);
  } catch {
    definicion = null;
  }

  const hoy = hoyMexico();
  const ligados = new Set(sol.documentos.map((d) => d.documentoId));
  const productoIds = [...new Set(sol.partidas.map((p) => p.productoId).filter((p): p is string => !!p))];
  let documentos = 0;
  let terceros = 0;

  const ligar = async (documentoId: string, requisito: string) => {
    if (ligados.has(documentoId)) return;
    await db.solicitudDocumento.create({ data: { solicitudId: sol.id, documentoId, requisito } });
    ligados.add(documentoId);
    documentos++;
  };
  const filtroVigente = { estadoConversion: { not: "ERROR" }, OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: hoy } }] };

  for (const req of definicion?.requisitos ?? []) {
    const deRequisito = sol.documentos.filter((d) => d.requisito === req.clave);
    if (req.porProducto) {
      for (const productoId of productoIds) {
        if (deRequisito.some((d) => d.documento.productoId === productoId)) continue;
        const doc = await db.documento.findFirst({
          where: { empresaId, productoId, tipo: { in: req.tipos }, id: { notIn: [...ligados] }, ...filtroVigente },
          orderBy: { creadoEn: "desc" },
          select: { id: true },
        });
        if (doc) await ligar(doc.id, req.clave);
      }
    } else if (deRequisito.length === 0 && sol.establecimientoId) {
      const doc = await db.documento.findFirst({
        where: {
          empresaId,
          establecimientoId: sol.establecimientoId,
          tipo: { in: req.tipos },
          id: { notIn: [...ligados] },
          ...filtroVigente,
        },
        orderBy: { creadoEn: "desc" },
        select: { id: true },
      });
      if (doc) await ligar(doc.id, req.clave);
    }
  }

  const tercerosLigados = new Set(sol.terceros.map((t) => `${t.rol}:${t.terceroId}`));
  const fabricanteIds = [...new Set(sol.partidas.map((p) => p.producto?.fabricanteId).filter((f): f is string => !!f))];
  if (fabricanteIds.length > 0) {
    const fabricantes = await db.tercero.findMany({
      where: { empresaId, tipo: "FABRICANTE", id: { in: fabricanteIds } },
      select: { id: true },
    });
    for (const f of fabricantes) {
      if (tercerosLigados.has(`FABRICANTE:${f.id}`)) continue;
      await db.solicitudTercero.create({ data: { solicitudId: sol.id, terceroId: f.id, rol: "FABRICANTE" } });
      tercerosLigados.add(`FABRICANTE:${f.id}`);
      terceros++;
    }
  }
  if (!sol.terceros.some((t) => t.rol === "DESTINATARIO")) {
    const destinatarios = await db.tercero.findMany({
      where: { empresaId, tipo: "DESTINATARIO", activo: true },
      select: { id: true },
      take: 2,
    });
    if (destinatarios.length === 1) {
      await db.solicitudTercero.create({ data: { solicitudId: sol.id, terceroId: destinatarios[0].id, rol: "DESTINATARIO" } });
      terceros++;
    }
  }

  return { documentos, terceros };
}
