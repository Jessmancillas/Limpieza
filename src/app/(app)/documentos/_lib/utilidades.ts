import { z } from "zod";

// Utilidades del módulo de documentos (sin dependencias de servidor; se prueban en tests/documentos).

/**
 * Ruta interna segura para redirigir después de guardar ("volver"). Solo rutas del mismo sitio
 * que empiezan con "/" (no "//" ni "/\", que los navegadores tratan como otro dominio).
 */
export function rutaInternaSegura(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const ruta = valor.trim();
  if (!ruta.startsWith("/") || ruta.startsWith("//") || ruta.length > 500) return null;
  if (ruta.includes("\\") || /[\u0000-\u001f\u007f]/.test(ruta)) return null;
  try {
    const base = "http://interno.invalid";
    const url = new URL(ruta, base);
    if (url.origin !== base) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export type EstadoVigencia =
  | { estado: "SIN_VIGENCIA" }
  | { estado: "VENCIDO"; dias: number }
  | { estado: "POR_VENCER"; dias: number }
  | { estado: "VIGENTE"; dias: number };

/** Días que se consideran "por vencer". */
export const DIAS_POR_VENCER = 60;

/** Fecha de hoy en la Ciudad de México, a mediodía UTC (igual que se guardan las fechas). */
export function hoyMexico(ahora = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
  return new Date(`${ymd}T12:00:00.000Z`);
}

/** Vencido (antes de hoy), por vencer (≤ 60 días) o vigente. */
export function estadoVigencia(vigenciaHasta: Date | null | undefined, ahora = new Date()): EstadoVigencia {
  if (!vigenciaHasta) return { estado: "SIN_VIGENCIA" };
  const dias = Math.round((vigenciaHasta.getTime() - hoyMexico(ahora).getTime()) / 86_400_000);
  if (dias < 0) return { estado: "VENCIDO", dias };
  if (dias <= DIAS_POR_VENCER) return { estado: "POR_VENCER", dias };
  return { estado: "VIGENTE", dias };
}

/** Reporte de conversión guardado como JSON en Documento.reporteConversion. */
export const esquemaReporte = z.object({
  version: z.number().optional(),
  fecha: z.string().optional(),
  origen: z.object({ mime: z.string(), bytes: z.number() }).partial().optional(),
  limites: z.object({ minDpi: z.number(), maxMB: z.number() }).partial().optional(),
  calidadJpeg: z.number().nullable().optional(),
  paginasEnBlancoEliminadas: z.array(z.number()).default([]),
  avisos: z.array(z.string()).default([]),
  notas: z.array(z.string()).default([]),
  error: z.string().optional(),
});

export type ReporteConversion = z.infer<typeof esquemaReporte>;

/** Lee el reporte sin fallar (null si no hay o está dañado). */
export function leerReporte(json: string | null | undefined): ReporteConversion | null {
  if (!json) return null;
  try {
    const resultado = esquemaReporte.safeParse(JSON.parse(json));
    return resultado.success ? resultado.data : null;
  } catch {
    return null;
  }
}

/** Primer valor de un parámetro de búsqueda. */
export function parametro(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}
