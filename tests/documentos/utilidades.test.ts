import { describe, expect, it } from "vitest";

import { esquemaMetadatosDocumento } from "@/app/(app)/documentos/_lib/esquema";
import { estadoVigencia, hoyMexico, leerReporte, rutaInternaSegura } from "@/app/(app)/documentos/_lib/utilidades";
import { encabezadoDescarga, nombreArchivoSeguro, normalizarNombreDocumento } from "@/lib/pdf/nombre-documento";

describe("rutaInternaSegura", () => {
  it("acepta rutas internas", () => {
    expect(rutaInternaSegura("/productos/abc123")).toBe("/productos/abc123");
    expect(rutaInternaSegura(" /establecimientos/x?tab=docs ")).toBe("/establecimientos/x?tab=docs");
  });

  it("rechaza redirecciones a otros sitios o valores raros", () => {
    for (const malo of [
      "//evil.com",
      "/\\evil.com",
      "https://evil.com",
      "evil.com",
      "javascript:alert(1)",
      "/\t/evil.com",
      "",
      undefined,
      null,
      ["/productos"],
      `/${"a".repeat(600)}`,
    ]) {
      expect(rutaInternaSegura(malo), String(malo)).toBeNull();
    }
  });
});

describe("estadoVigencia", () => {
  // 15 de enero de 2026, 23:30 en la Ciudad de México (ya es 16 en UTC).
  const ahora = new Date("2026-01-16T05:30:00Z");
  const fecha = (ymd: string) => new Date(`${ymd}T12:00:00.000Z`);

  it("usa el día de la Ciudad de México", () => {
    expect(hoyMexico(ahora).toISOString()).toBe("2026-01-15T12:00:00.000Z");
  });

  it("clasifica vencido, por vencer (≤ 60 días), vigente y sin vigencia", () => {
    expect(estadoVigencia(null, ahora)).toEqual({ estado: "SIN_VIGENCIA" });
    expect(estadoVigencia(fecha("2026-01-14"), ahora)).toEqual({ estado: "VENCIDO", dias: -1 });
    expect(estadoVigencia(fecha("2026-01-15"), ahora)).toEqual({ estado: "POR_VENCER", dias: 0 });
    expect(estadoVigencia(fecha("2026-03-16"), ahora)).toEqual({ estado: "POR_VENCER", dias: 60 });
    expect(estadoVigencia(fecha("2026-03-17"), ahora)).toEqual({ estado: "VIGENTE", dias: 61 });
  });
});

describe("leerReporte", () => {
  it("lee el JSON guardado y tolera datos dañados", () => {
    expect(leerReporte(JSON.stringify({ avisos: ["a"], paginasEnBlancoEliminadas: [2] }))).toMatchObject({
      avisos: ["a"],
      notas: [],
      paginasEnBlancoEliminadas: [2],
    });
    expect(leerReporte("{no es json")).toBeNull();
    expect(leerReporte(JSON.stringify({ avisos: "x" }))).toBeNull();
    expect(leerReporte(null)).toBeNull();
  });
});

describe("nombre del documento (nombreDocumento de VUCEM)", () => {
  it("quita caracteres raros, conserva acentos españoles y recorta a 100", () => {
    expect(normalizarNombreDocumento('  Licencia | sanitaria <2026> "ACME" & Cía  ')).toBe("Licencia sanitaria 2026 ACME y Cía");
    expect(normalizarNombreDocumento("Façade São Paulo — Niño")).toBe("Facade Sao Paulo Niño");
    expect(normalizarNombreDocumento("📄 Registro\tsanitario\n")).toBe("Registro sanitario");
    expect(normalizarNombreDocumento("x".repeat(150))).toHaveLength(100);
  });

  it("el esquema normaliza el nombre y valida lo demás", () => {
    const ok = esquemaMetadatosDocumento.safeParse({
      tipo: "REGISTRO_SANITARIO",
      nombre: "Registro | sanitario",
      idTipoDocumentoVucem: "",
      productoId: "",
      establecimientoId: "",
      vigenciaHasta: "2027-05-31",
    });
    expect(ok.success).toBe(true);
    expect(ok.data).toMatchObject({ nombre: "Registro sanitario", productoId: undefined, idTipoDocumentoVucem: undefined });
    expect(ok.data?.vigenciaHasta?.toISOString()).toBe("2027-05-31T12:00:00.000Z");

    const malo = esquemaMetadatosDocumento.safeParse({
      tipo: "CONTRATO",
      nombre: "|||",
      idTipoDocumentoVucem: "12|3",
      productoId: "x' OR 1=1",
      vigenciaHasta: "31/05/2027",
    });
    expect(malo.success).toBe(false);
    const campos = new Set(malo.error?.issues.map((i) => i.path[0]));
    expect([...campos].sort()).toEqual(["idTipoDocumentoVucem", "nombre", "productoId", "tipo", "vigenciaHasta"]);

    const largo = esquemaMetadatosDocumento.safeParse({ tipo: "OTRO", nombre: "a".repeat(101) });
    expect(largo.success).toBe(false);
  });
});

describe("nombres de descarga", () => {
  it("nombreArchivoSeguro quita rutas y respeta extensiones equivalentes", () => {
    expect(nombreArchivoSeguro("../../etc/passwd")).toBe("_.._etc_passwd");
    expect(nombreArchivoSeguro("foto.JPEG", "jpg")).toBe("foto.JPEG");
    expect(nombreArchivoSeguro("escaneo.tiff", "tif")).toBe("escaneo.tiff");
    expect(nombreArchivoSeguro("Licencia sanitaria", "pdf")).toBe("Licencia sanitaria.pdf");
    expect(nombreArchivoSeguro("   ", "pdf")).toBe("documento.pdf");
  });

  it("Content-Disposition con respaldo ASCII y filename* (RFC 5987)", () => {
    const h = encabezadoDescarga('Licencia "sanitaria"; Ñoño (2026).pdf');
    expect(h.startsWith("attachment; ")).toBe(true);
    const ascii = h.match(/filename="([^"]*)"/)?.[1];
    expect(ascii).toBeDefined();
    expect(ascii).toMatch(/^[\x20-\x7e]+$/);
    expect(ascii).not.toMatch(/[";\\]/);
    const utf8 = h.match(/filename\*=UTF-8''(\S+)$/)?.[1];
    expect(utf8).toBeDefined();
    expect(utf8).not.toMatch(/[\s"'();]/);
    expect(decodeURIComponent(utf8!)).toBe("Licencia _sanitaria_; Ñoño (2026).pdf");
  });
});
