import { describe, expect, it } from "vitest";

import { detectarSeparador, dividirCsv, parsearCatalogoCsv } from "@/app/(app)/catalogos-vucem/csv";

describe("dividirCsv", () => {
  it("respeta comillas, separadores y saltos de línea dentro de un valor", () => {
    const { filas, errores } = dividirCsv('a,"b, con coma"\r\nc,"línea 1\nlínea 2"\n"d ""x""",e\n', ",");
    expect(errores).toEqual([]);
    expect(filas).toEqual([
      { renglon: 1, celdas: ["a", "b, con coma"] },
      { renglon: 2, celdas: ["c", "línea 1\nlínea 2"] },
      { renglon: 4, celdas: ['d "x"', "e"] },
    ]);
  });

  it("omite renglones vacíos y conserva el número de renglón original", () => {
    const { filas } = dividirCsv("\n1;Uno\n\n   \n2;Dos", ";");
    expect(filas.map((f) => f.renglon)).toEqual([2, 5]);
  });

  it("reporta comillas sin cerrar", () => {
    const { filas, errores } = dividirCsv('1,Uno\n2,"Dos', ",");
    expect(filas).toHaveLength(1);
    expect(errores).toEqual([{ renglon: 2, mensaje: expect.stringContaining("Comillas") }]);
  });
});

describe("detectarSeparador", () => {
  it("prefiere tabulador, luego punto y coma, luego coma", () => {
    expect(detectarSeparador("470\tAeropuerto, CDMX")).toBe("\t");
    expect(detectarSeparador("470;Aeropuerto, CDMX\n200;México, Cd. de Méx.")).toBe(";");
    expect(detectarSeparador("MEX,México\nUSA,Estados Unidos")).toBe(",");
  });

  it("no elige punto y coma si no es consistente en todas las filas", () => {
    expect(detectarSeparador("1,Kilo\n2,Gramo; neto\n3,Metro")).toBe(",");
  });
});

describe("parsearCatalogoCsv", () => {
  it("lee clave y descripción con encabezado y BOM", () => {
    const r = parsearCatalogoCsv("﻿clave,descripcion\nMEX,México\nUSA,Estados Unidos\n");
    expect(r.separador).toBe(",");
    expect(r.conEncabezado).toBe(true);
    expect(r.errores).toEqual([]);
    expect(r.registros).toEqual([
      { renglon: 2, clave: "MEX", descripcion: "México" },
      { renglon: 3, clave: "USA", descripcion: "Estados Unidos" },
    ]);
  });

  it("acepta encabezado con acentos y mayúsculas", () => {
    const r = parsearCatalogoCsv("CLAVE;DESCRIPCIÓN;CLAVE PADRE\n25;Sub;52");
    expect(r.conEncabezado).toBe(true);
    expect(r.registros).toEqual([{ renglon: 2, clave: "25", descripcion: "Sub", padreClave: "52" }]);
  });

  it("funciona sin encabezado y con tabuladores (copiado de Excel)", () => {
    const r = parsearCatalogoCsv("470\tAeropuerto Internacional de la Ciudad de México\n200\tMéxico, Cd. de Méx.");
    expect(r.separador).toBe("\t");
    expect(r.conEncabezado).toBe(false);
    expect(r.registros.map((x) => x.clave)).toEqual(["470", "200"]);
    expect(r.registros[1].descripcion).toBe("México, Cd. de Méx.");
  });

  it("distingue tercera columna ausente (undefined) de vacía (null)", () => {
    const r = parsearCatalogoCsv("a;Uno\nb;Dos;\nc;Tres;X", { separador: ";" });
    expect(r.registros).toEqual([
      { renglon: 1, clave: "a", descripcion: "Uno" },
      { renglon: 2, clave: "b", descripcion: "Dos", padreClave: null },
      { renglon: 3, clave: "c", descripcion: "Tres", padreClave: "X" },
    ]);
  });

  it("ignora separadores vacíos sobrantes al final", () => {
    const r = parsearCatalogoCsv("1;Kilo;;;\n2;Gramo;;", { separador: ";" });
    expect(r.errores).toEqual([]);
    expect(r.registros).toHaveLength(2);
  });

  it("reporta errores por renglón sin detener la importación", () => {
    const csv = ["clave,descripcion", "1,Kilo", ",Sin clave", "3,", "4", "1,Repetida", "5,a,b,c", "6,Seis"].join("\n");
    const r = parsearCatalogoCsv(csv);
    expect(r.registros.map((x) => x.clave)).toEqual(["1", "6"]);
    expect(r.errores.map((e) => e.renglon)).toEqual([3, 4, 5, 6, 7]);
    expect(r.errores.find((e) => e.renglon === 6)?.mensaje).toContain("renglón 2");
  });

  it("valida longitudes máximas", () => {
    const r = parsearCatalogoCsv(`${"X".repeat(61)},Larga\nok,${"d".repeat(501)}`);
    expect(r.registros).toEqual([]);
    expect(r.errores).toHaveLength(2);
  });

  it("normaliza espacios de la descripción", () => {
    const r = parsearCatalogoCsv('1,"  Metro    cúbico  "');
    expect(r.registros[0].descripcion).toBe("Metro cúbico");
  });

  it("regresa error general si no hay datos", () => {
    expect(parsearCatalogoCsv("   \n").errorGeneral).toBeTruthy();
    expect(parsearCatalogoCsv("").errorGeneral).toBeTruthy();
  });

  it("respeta el separador forzado", () => {
    const r = parsearCatalogoCsv("1,Kilo;2", { separador: "," });
    expect(r.registros).toEqual([{ renglon: 1, clave: "1", descripcion: "Kilo;2" }]);
  });
});
