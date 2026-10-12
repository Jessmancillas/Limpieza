import { claveDeMsUtc, claveDiaMexico, MS_DIA, msDeClave } from "./fechas";

// Plazos en días hábiles (LFPA art. 28): no cuentan sábados, domingos ni los días inhábiles
// oficiales o publicados en el DOF (vacaciones de COFEPRIS). El día de la notificación no cuenta.
// Las fechas se comparan por día calendario en la zona America/Mexico_City.

const LIMITE_ITERACIONES = 40_000;

function conjuntoInhabiles(inhabiles: Date[]): Set<string> {
  return new Set(inhabiles.map(claveDiaMexico));
}

function esHabil(msDia: number, inhabiles: Set<string>): boolean {
  const dia = new Date(msDia).getUTCDay();
  return dia !== 0 && dia !== 6 && !inhabiles.has(claveDeMsUtc(msDia));
}

/** true si la fecha (día en México) es hábil. */
export function esDiaHabil(fecha: Date, inhabiles: Date[]): boolean {
  return esHabil(msDeClave(claveDiaMexico(fecha)), conjuntoInhabiles(inhabiles));
}

/**
 * Fecha (mediodía UTC) del día hábil número `dias` contado a partir del día siguiente a `desde`.
 * Con dias = 0 regresa el mismo día de `desde`.
 */
export function sumarDiasHabiles(desde: Date, dias: number, inhabiles: Date[]): Date {
  if (!Number.isInteger(dias) || dias < 0) throw new RangeError("El plazo debe ser un número entero de días mayor o igual a 0.");
  const conjunto = conjuntoInhabiles(inhabiles);
  let ms = msDeClave(claveDiaMexico(desde));
  let restantes = dias;
  let vueltas = 0;
  while (restantes > 0) {
    ms += MS_DIA;
    if (esHabil(ms, conjunto)) restantes--;
    if (++vueltas > LIMITE_ITERACIONES) throw new RangeError("Plazo demasiado largo.");
  }
  return new Date(ms + MS_DIA / 2);
}

/**
 * Días hábiles de `a` a `b`: cuenta los días hábiles posteriores a `a` hasta `b` inclusive.
 * Si `b` es anterior a `a` el resultado es negativo (días hábiles transcurridos desde `b`).
 * Ejemplo: hoy viernes y fecha límite el lunes siguiente → 1.
 */
export function diasHabilesEntre(a: Date, b: Date, inhabiles: Date[]): number {
  const conjunto = conjuntoInhabiles(inhabiles);
  const msA = msDeClave(claveDiaMexico(a));
  const msB = msDeClave(claveDiaMexico(b));
  if (msA === msB) return 0;
  const [desde, hasta, signo] = msB > msA ? [msA, msB, 1] : [msB, msA, -1];
  if ((hasta - desde) / MS_DIA > LIMITE_ITERACIONES) throw new RangeError("Intervalo demasiado largo.");
  let n = 0;
  for (let ms = desde + MS_DIA; ms <= hasta; ms += MS_DIA) if (esHabil(ms, conjunto)) n++;
  return signo * n;
}
