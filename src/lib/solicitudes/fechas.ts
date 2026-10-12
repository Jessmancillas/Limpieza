// Utilidades de fechas "de calendario" en la zona de la Ciudad de México (funciones puras).
// Convención de la app: las fechas capturadas en <input type="date"> se guardan a mediodía UTC,
// así su día UTC y su día en México coinciden.

export const ZONA_MEXICO = "America/Mexico_City";
export const MS_DIA = 86_400_000;

const formatoDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_MEXICO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "aaaa-mm-dd" de una fecha según la hora de la Ciudad de México. */
export function claveDiaMexico(fecha: Date): string {
  return formatoDia.format(fecha);
}

/** Medianoche UTC (ms) del día "aaaa-mm-dd". */
export function msDeClave(clave: string): number {
  const [a, m, d] = clave.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}

/** "aaaa-mm-dd" de un instante interpretado en UTC. */
export function claveDeMsUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Fecha guardable (mediodía UTC) del día "aaaa-mm-dd". */
export function fechaDeClave(clave: string): Date {
  return new Date(msDeClave(clave) + MS_DIA / 2);
}

/** Hoy en la Ciudad de México, a mediodía UTC. */
export function hoyMexico(ahora: Date = new Date()): Date {
  return fechaDeClave(claveDiaMexico(ahora));
}

/**
 * Días naturales desde hoy (México) hasta una fecha guardada (se toma su día UTC).
 * Negativo si ya pasó; 0 si es hoy.
 */
export function diasNaturalesHasta(fecha: Date, hoy: Date = new Date()): number {
  const destino = Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());
  return Math.round((destino - msDeClave(claveDiaMexico(hoy))) / MS_DIA);
}

/** Suma días naturales a una fecha guardada (resultado a mediodía UTC). */
export function sumarDiasNaturales(fecha: Date, dias: number): Date {
  const base = Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());
  return new Date(base + dias * MS_DIA + MS_DIA / 2);
}
