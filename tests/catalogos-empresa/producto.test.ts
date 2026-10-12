import { describe, expect, it } from "vitest";

import {
  denominacionCopia,
  DIAS_AVISO_REGISTRO,
  esquemaProducto,
  estadoRegistroSanitario,
  LIMITES_PRODUCTO,
} from "@/lib/validacion/producto";

const base = {
  denominacionEspecifica: "JERINGA DESECHABLE ESTERIL 5 ML",
  denominacionDistintiva: "MARCA DEMO",
  denominacionComunCientifica: "JERINGA HIPODERMICA",
  idClasificacionProducto: "52",
  idSubClasificacionProducto: "25",
  idTipoProducto: "0245",
  especifique: "",
  idFormaFarmaceutica: "",
  idEstadoFisico: "",
  fraccionArancelaria: "90183101",
  descripcionFraccion: "Jeringas",
  umt: "6",
  umc: "6",
  desUMC: "PIEZA",
  presentacionTipoEnvase: "CAJA CON 100 PIEZAS",
  numRegistroSanitario: "1234C2020 SSA",
  vigenciaRegistroSanitario: "2030-06-30",
  cvePaisOrigen: "usa",
  idUsoEspecifico: "108",
  fabricanteId: "",
  notas: "",
};

function errores(entrada: Record<string, unknown>) {
  const r = esquemaProducto.safeParse(entrada);
  if (r.success) return {};
  const mapa: Record<string, string[]> = {};
  for (const i of r.error.issues) (mapa[i.path.join(".")] ??= []).push(i.message);
  return mapa;
}

describe("esquemaProducto", () => {
  it("acepta un producto válido", () => {
    const r = esquemaProducto.parse(base);
    expect(r.cvePaisOrigen).toBe("USA");
    expect(r.vigenciaRegistroSanitario?.toISOString()).toBe("2030-06-30T12:00:00.000Z");
    expect(r.fabricanteId).toBeUndefined();
  });

  it("forma farmacéutica y estado físico son opcionales en el producto", () => {
    const r = esquemaProducto.parse({ ...base, idFormaFarmaceutica: undefined, idEstadoFisico: undefined });
    expect(r.idFormaFarmaceutica).toBeUndefined();
    expect(r.idEstadoFisico).toBeUndefined();
  });

  it("exige los campos que el manual marca obligatorios", () => {
    const campos = [
      "denominacionEspecifica",
      "denominacionDistintiva",
      "denominacionComunCientifica",
      "idClasificacionProducto",
      "idSubClasificacionProducto",
      "idTipoProducto",
      "desUMC",
      "presentacionTipoEnvase",
      "cvePaisOrigen",
      "idUsoEspecifico",
    ];
    const e = errores(Object.fromEntries(Object.entries(base).map(([k, v]) => [k, campos.includes(k) ? "" : v])));
    for (const campo of campos) expect(e[campo], campo).toBeDefined();
  });

  describe("fracción arancelaria", () => {
    it.each(["9018310", "901831011", "9018.31.01", "ABCDEFGH", ""])("rechaza %j", (fraccion) => {
      expect(errores({ ...base, fraccionArancelaria: fraccion }).fraccionArancelaria).toBeDefined();
    });
    it("acepta 8 dígitos (con espacios alrededor)", () => {
      expect(esquemaProducto.parse({ ...base, fraccionArancelaria: " 90183101 " }).fraccionArancelaria).toBe("90183101");
    });
  });

  it("el país de origen es una clave de 3 letras", () => {
    expect(errores({ ...base, cvePaisOrigen: "US" }).cvePaisOrigen).toBeDefined();
    expect(errores({ ...base, cvePaisOrigen: "U5A" }).cvePaisOrigen).toBeDefined();
  });

  it("la vigencia requiere número de registro sanitario", () => {
    expect(errores({ ...base, numRegistroSanitario: "" }).numRegistroSanitario).toBeDefined();
    expect(esquemaProducto.safeParse({ ...base, numRegistroSanitario: "", vigenciaRegistroSanitario: "" }).success).toBe(true);
    expect(errores({ ...base, vigenciaRegistroSanitario: "30/06/2030" }).vigenciaRegistroSanitario).toBeDefined();
  });

  describe("longitudes máximas del manual (campos 19-37)", () => {
    const casos: Array<[keyof typeof base, number]> = [
      ["denominacionEspecifica", 256],
      ["denominacionDistintiva", 120],
      ["idClasificacionProducto", 14],
      ["idSubClasificacionProducto", 14],
      ["idTipoProducto", 4],
      ["desUMC", 100],
      ["presentacionTipoEnvase", 250],
      ["numRegistroSanitario", 50],
      ["idUsoEspecifico", 4],
      ["notas", LIMITES_PRODUCTO.notas],
    ];
    it.each(casos)("%s admite %i caracteres y no uno más", (campo, max) => {
      expect(errores({ ...base, [campo]: "1".repeat(max) })[campo]).toBeUndefined();
      expect(errores({ ...base, [campo]: "1".repeat(max + 1) })[campo]).toBeDefined();
    });
  });
});

describe("estadoRegistroSanitario", () => {
  // 12 de octubre de 2026, mediodía en la Ciudad de México (UTC-6).
  const hoy = new Date("2026-10-12T18:00:00.000Z");
  const vigencia = (yyyyMmDd: string) => new Date(`${yyyyMmDd}T12:00:00.000Z`);
  const estado = (num: string | null, vig: Date | null, ahora = hoy) =>
    estadoRegistroSanitario({ numRegistroSanitario: num, vigenciaRegistroSanitario: vig }, ahora);

  it("sin número de registro", () => {
    expect(estado(null, vigencia("2030-01-01")).estado).toBe("SIN_REGISTRO");
    expect(estado("  ", null).estado).toBe("SIN_REGISTRO");
  });

  it("con número pero sin vigencia", () => {
    expect(estado("123", null).estado).toBe("SIN_VIGENCIA");
  });

  it("vencido", () => {
    expect(estado("123", vigencia("2026-10-11"))).toEqual({ estado: "VENCIDO", dias: -1 });
  });

  it("vence hoy y hasta 90 días: por vencer", () => {
    expect(estado("123", vigencia("2026-10-12"))).toEqual({ estado: "POR_VENCER", dias: 0 });
    expect(estado("123", vigencia("2027-01-10"))).toEqual({ estado: "POR_VENCER", dias: DIAS_AVISO_REGISTRO });
  });

  it("más de 90 días: vigente", () => {
    expect(estado("123", vigencia("2027-01-11"))).toEqual({ estado: "VIGENTE", dias: 91 });
  });

  it("usa el día de la Ciudad de México, no el de UTC", () => {
    // 21:00 del 12 de octubre en CDMX = 03:00 UTC del 13: el registro que vence el 12 sigue vigente hoy.
    expect(estado("123", vigencia("2026-10-12"), new Date("2026-10-13T03:00:00.000Z")).estado).toBe("POR_VENCER");
  });
});

describe("denominacionCopia", () => {
  it("agrega (copia) sin exceder 256 caracteres", () => {
    expect(denominacionCopia("JERINGA")).toBe("JERINGA (copia)");
    const larga = denominacionCopia("X".repeat(256));
    expect(larga.length).toBe(256);
    expect(larga.endsWith(" (copia)")).toBe(true);
  });
});
