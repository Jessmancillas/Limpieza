// COBIT 2019: brechas de capacidad y semáforo de indicadores (MEA01).

export type ControlEvaluado = { clave: string; nivelActual: number; nivelObjetivo: number; aplicable: boolean };

export function brecha(c: Pick<ControlEvaluado, "nivelActual" | "nivelObjetivo">): number {
  return Math.max(0, c.nivelObjetivo - c.nivelActual);
}

/** Nivel promedio de los controles aplicables (0-5). */
export function madurezPromedio(controles: ControlEvaluado[]): number | null {
  const aplicables = controles.filter((c) => c.aplicable);
  if (aplicables.length === 0) return null;
  return aplicables.reduce((s, c) => s + c.nivelActual, 0) / aplicables.length;
}

/** % de controles aplicables que alcanzan su nivel objetivo. */
export function cumplimiento(controles: ControlEvaluado[]): number | null {
  const aplicables = controles.filter((c) => c.aplicable);
  if (aplicables.length === 0) return null;
  return aplicables.filter((c) => c.nivelActual >= c.nivelObjetivo).length / aplicables.length;
}

/** Controles aplicables ordenados por brecha (mayor primero): hoja de ruta de mejora. */
export function prioridadesMejora<T extends ControlEvaluado>(controles: T[], limite = 5): T[] {
  return controles
    .filter((c) => c.aplicable && brecha(c) > 0)
    .sort((a, b) => brecha(b) - brecha(a) || a.nivelActual - b.nivelActual)
    .slice(0, limite);
}

export type Semaforo = "verde" | "amarillo" | "rojo" | "gris";

/**
 * Semáforo de un KPI contra su meta. sentido "mayor": más es mejor; "menor": menos es mejor.
 * Amarillo dentro del 10 % de la meta.
 */
export function semaforo(valor: number | null, meta: number, sentido: "mayor" | "menor"): Semaforo {
  if (valor === null || !Number.isFinite(valor)) return "gris";
  if (sentido === "mayor") {
    if (valor >= meta) return "verde";
    return valor >= meta * 0.9 ? "amarillo" : "rojo";
  }
  if (valor <= meta) return "verde";
  return valor <= meta * 1.1 ? "amarillo" : "rojo";
}
