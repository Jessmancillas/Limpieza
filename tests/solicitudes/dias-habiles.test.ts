import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { diasHabilesEntre, esDiaHabil, sumarDiasHabiles } from "@/lib/solicitudes/dias-habiles";
import { claveDiaMexico, diasNaturalesHasta, hoyMexico } from "@/lib/solicitudes/fechas";

const f = (aaaammdd: string) => new Date(`${aaaammdd}T12:00:00.000Z`);
const clave = (d: Date) => d.toISOString().slice(0, 10);

const INHABILES = (JSON.parse(readFileSync(path.resolve(__dirname, "../../prisma/datos/dias-inhabiles.json"), "utf8")) as Array<{
  fecha: string;
  descripcion: string;
}>).map((d) => f(d.fecha));

describe("sumarDiasHabiles", () => {
  it("no cuenta el día de la notificación ni el fin de semana", () => {
    // Viernes 9 de octubre de 2026 + 1 día hábil = lunes 12.
    expect(clave(sumarDiasHabiles(f("2026-10-09"), 1, []))).toBe("2026-10-12");
    // Notificación en sábado: el plazo corre desde el lunes.
    expect(clave(sumarDiasHabiles(f("2026-10-10"), 1, []))).toBe("2026-10-12");
    expect(clave(sumarDiasHabiles(f("2026-10-09"), 0, []))).toBe("2026-10-09");
  });

  it("plazo de 5 días hábiles", () => {
    // Lunes 5 de octubre de 2026 + 5 = lunes 12.
    expect(clave(sumarDiasHabiles(f("2026-10-05"), 5, INHABILES))).toBe("2026-10-12");
    // Miércoles 7 + 5 = miércoles 14.
    expect(clave(sumarDiasHabiles(f("2026-10-07"), 5, INHABILES))).toBe("2026-10-14");
  });

  it("plazo de 10 días hábiles", () => {
    // Lunes 5 de octubre de 2026 + 10 = lunes 19.
    expect(clave(sumarDiasHabiles(f("2026-10-05"), 10, INHABILES))).toBe("2026-10-19");
  });

  it("salta los días inhábiles oficiales", () => {
    // Viernes 13 de noviembre de 2026 + 1: el lunes 16 es inhábil (Revolución) → martes 17.
    expect(clave(sumarDiasHabiles(f("2026-11-13"), 1, INHABILES))).toBe("2026-11-17");
    // Semana Santa 2026: miércoles 1 de abril + 1 → jueves 2 y viernes 3 inhábiles → lunes 6.
    expect(clave(sumarDiasHabiles(f("2026-04-01"), 1, INHABILES))).toBe("2026-04-06");
    // Fin de año: jueves 24 de diciembre de 2026 + 5 → 28, 29, 30, 31, (1 ene inhábil) → lunes 4.
    expect(clave(sumarDiasHabiles(f("2026-12-24"), 5, INHABILES))).toBe("2027-01-04");
    // 10 días hábiles con un periodo vacacional publicado en el DOF (ficticio).
    const vacaciones = ["2026-12-21", "2026-12-22", "2026-12-23", "2026-12-24", "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31"].map(f);
    expect(clave(sumarDiasHabiles(f("2026-12-18"), 10, [...INHABILES, ...vacaciones]))).toBe("2027-01-15");
  });

  it("compara por fecha en la Ciudad de México", () => {
    // 23:30 del viernes 9 en CDMX = 05:30 UTC del sábado 10: la notificación cuenta como viernes.
    const nocheViernes = new Date("2026-10-10T05:30:00.000Z");
    expect(claveDiaMexico(nocheViernes)).toBe("2026-10-09");
    expect(clave(sumarDiasHabiles(nocheViernes, 1, []))).toBe("2026-10-12");
    // El resultado se guarda a mediodía UTC.
    expect(sumarDiasHabiles(nocheViernes, 1, []).toISOString()).toBe("2026-10-12T12:00:00.000Z");
  });

  it("rechaza plazos inválidos", () => {
    expect(() => sumarDiasHabiles(f("2026-10-05"), -1, [])).toThrow(RangeError);
    expect(() => sumarDiasHabiles(f("2026-10-05"), 1.5, [])).toThrow(RangeError);
  });
});

describe("diasHabilesEntre", () => {
  it("cuenta días hábiles posteriores hasta la fecha final inclusive", () => {
    expect(diasHabilesEntre(f("2026-10-09"), f("2026-10-12"), [])).toBe(1);
    expect(diasHabilesEntre(f("2026-10-05"), f("2026-10-19"), INHABILES)).toBe(10);
    expect(diasHabilesEntre(f("2026-10-12"), f("2026-10-12"), [])).toBe(0);
    expect(diasHabilesEntre(f("2026-11-13"), f("2026-11-17"), INHABILES)).toBe(1);
  });

  it("es negativo cuando la fecha ya pasó", () => {
    expect(diasHabilesEntre(f("2026-10-14"), f("2026-10-12"), [])).toBe(-2);
  });

  it("es inverso de sumarDiasHabiles", () => {
    for (const plazo of [1, 5, 10, 15, 30]) {
      const desde = f("2026-03-10");
      expect(diasHabilesEntre(desde, sumarDiasHabiles(desde, plazo, INHABILES), INHABILES)).toBe(plazo);
    }
  });
});

describe("utilidades de fechas", () => {
  it("esDiaHabil y días naturales", () => {
    expect(esDiaHabil(f("2026-09-16"), INHABILES)).toBe(false);
    expect(esDiaHabil(f("2026-09-17"), INHABILES)).toBe(true);
    expect(esDiaHabil(f("2026-10-10"), INHABILES)).toBe(false);
    expect(diasNaturalesHasta(f("2026-10-15"), new Date("2026-10-12T17:00:00Z"))).toBe(3);
    expect(clave(hoyMexico(new Date("2026-10-13T03:00:00Z")))).toBe("2026-10-12");
  });

  it("el archivo de días inhábiles tiene 2026 y 2027 completos", () => {
    const fechas = INHABILES.map(clave);
    expect(fechas).toEqual(expect.arrayContaining(["2026-01-01", "2026-02-02", "2026-03-16", "2026-04-02", "2026-04-03", "2026-05-01"]));
    expect(fechas).toEqual(expect.arrayContaining(["2026-09-16", "2026-11-16", "2026-12-25"]));
    expect(fechas).toEqual(expect.arrayContaining(["2027-02-01", "2027-03-15", "2027-03-25", "2027-03-26", "2027-11-15"]));
    expect(new Set(fechas).size).toBe(fechas.length);
  });
});
