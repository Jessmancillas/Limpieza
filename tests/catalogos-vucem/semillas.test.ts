import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CATALOGOS } from "@/lib/constantes";

const DIR = path.resolve(__dirname, "../../prisma/datos/catalogos");

type Archivo = {
  catalogo: string;
  fuente?: string;
  porConfirmar?: boolean;
  registros: Array<{ clave: string; descripcion: string; padreClave?: string | null; porConfirmar?: boolean }>;
};

const archivos = readdirSync(DIR).filter((a) => a.endsWith(".json")).sort();
const leer = (archivo: string) => JSON.parse(readFileSync(path.join(DIR, archivo), "utf8")) as Archivo;

describe("semillas de catálogos VUCEM", () => {
  it("hay un archivo por cada catálogo conocido", () => {
    expect(archivos.map((a) => a.replace(/\.json$/, "")).sort()).toEqual(Object.keys(CATALOGOS).sort());
  });

  it.each(archivos)("%s tiene estructura válida y sin claves duplicadas", (archivo) => {
    const datos = leer(archivo);
    expect(datos.catalogo).toBe(archivo.replace(/\.json$/, ""));
    expect(Object.keys(CATALOGOS)).toContain(datos.catalogo);
    expect(datos.fuente).toBe("SEMILLA");
    expect(typeof datos.porConfirmar).toBe("boolean");
    expect(Array.isArray(datos.registros)).toBe(true);

    const claves = new Set<string>();
    for (const r of datos.registros) {
      expect(typeof r.clave).toBe("string");
      expect(r.clave.trim()).toBe(r.clave);
      expect(r.clave.length).toBeGreaterThan(0);
      expect(r.clave.length).toBeLessThanOrEqual(60);
      expect(typeof r.descripcion).toBe("string");
      expect(r.descripcion.trim().length).toBeGreaterThan(0);
      if (r.padreClave !== undefined && r.padreClave !== null) expect(typeof r.padreClave).toBe("string");
      if (r.porConfirmar !== undefined) expect(typeof r.porConfirmar).toBe("boolean");
      expect(claves.has(r.clave), `clave duplicada ${r.clave}`).toBe(false);
      claves.add(r.clave);
    }
  });

  it("CAT_PAIS trae los países ISO 3166-1 con clave alfa-3", () => {
    const datos = leer("CAT_PAIS.json");
    expect(datos.registros.length).toBeGreaterThanOrEqual(245);
    expect(datos.registros.length).toBeLessThanOrEqual(260);
    for (const r of datos.registros) expect(r.clave).toMatch(/^[A-Z]{3}$/);
    const mapa = new Map(datos.registros.map((r) => [r.clave, r.descripcion]));
    expect(mapa.get("MEX")).toBe("México");
    expect(mapa.get("USA")).toBe("Estados Unidos");
    expect(mapa.get("AUS")).toBe("Australia");
    expect(datos.porConfirmar).toBe(false);
  });

  it("CAT_ENTIDAD tiene las 32 entidades, en mayúsculas sin acentos y por confirmar", () => {
    const datos = leer("CAT_ENTIDAD.json");
    expect(datos.registros).toHaveLength(32);
    expect(datos.porConfirmar).toBe(true);
    for (const r of datos.registros) expect(r.clave).toMatch(/^[A-Z ]+$/);
    const claves = datos.registros.map((r) => r.clave);
    expect(claves).toEqual(expect.arrayContaining(["SINALOA", "CIUDAD DE MEXICO", "MEXICO", "NUEVO LEON"]));
  });

  it("CAT_UNIDAD_MEDIDA trae las 21 claves del Apéndice 7", () => {
    const datos = leer("CAT_UNIDAD_MEDIDA.json");
    expect(datos.registros.map((r) => r.clave)).toEqual(Array.from({ length: 21 }, (_, i) => String(i + 1)));
    expect(datos.registros.find((r) => r.clave === "6")?.descripcion).toBe("Pieza");
  });

  it("CAT_ADUANA usa claves de 3 dígitos e incluye el AICM", () => {
    const datos = leer("CAT_ADUANA.json");
    for (const r of datos.registros) expect(r.clave).toMatch(/^\d{3}$/);
    expect(datos.registros.find((r) => r.clave === "470")?.descripcion).toMatch(/Aeropuerto Internacional de la Ciudad de México/);
    expect(datos.porConfirmar).toBe(true);
  });

  it("CAT_SCIAN usa claves de 6 dígitos", () => {
    const datos = leer("CAT_SCIAN.json");
    for (const r of datos.registros) expect(r.clave).toMatch(/^\d{6}$/);
    expect(datos.registros.map((r) => r.clave)).toContain("435313");
  });

  it("la subclasificación de ejemplo apunta a la clasificación de ejemplo", () => {
    const clasif = leer("CAT_CLASIF_PRODUCTO.json").registros.map((r) => r.clave);
    for (const r of leer("CAT_SUBCLASIF_PRODUCTO.json").registros) expect(clasif).toContain(r.padreClave);
  });

  it("los catálogos con claves internas de VUCEM quedan por confirmar", () => {
    for (const c of ["CAT_REGIMEN", "CAT_CLASIF_PRODUCTO", "CAT_SUBCLASIF_PRODUCTO", "CAT_TIPO_PRODUCTO", "CAT_USO_ESPECIFICO", "CAT_ESTADO_FISICO", "CAT_BANCO"]) {
      const datos = leer(`${c}.json`);
      expect(datos.porConfirmar, c).toBe(true);
      for (const r of datos.registros) expect(r.porConfirmar ?? datos.porConfirmar, `${c}/${r.clave}`).toBe(true);
    }
  });
});
