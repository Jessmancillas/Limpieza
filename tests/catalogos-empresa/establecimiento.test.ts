import { describe, expect, it } from "vitest";

import {
  entradaEstablecimientoDesdeFormData,
  esquemaEstablecimiento,
  faltaLicenciaOAviso,
  LIMITES_ESTABLECIMIENTO,
} from "@/lib/validacion/establecimiento";

const base = {
  denominacionRazonSocial: "ALMACEN DEMO SA DE CV",
  rfcResponsableSanitario: "pepj800101ab1",
  correoElectronico: "Responsable@Ejemplo.mx",
  telefono: "5555555555",
  calle: "CALLE BODEGA",
  numeroExterior: "12",
  codigoPostal: "54060",
  entidadFederativa: "MEX",
  municipio: "TLALNEPANTLA DE BAZ",
  colonia: "",
  localidad: "",
  noLicenciaSanitaria: "",
  tieneAvisoFuncionamiento: "on",
  scian: [{ clave: "435313", descripcion: "Comercio al por mayor de equipo médico" }],
};

function errores(entrada: Record<string, unknown>) {
  const r = esquemaEstablecimiento.safeParse(entrada);
  if (r.success) return {};
  const mapa: Record<string, string[]> = {};
  for (const i of r.error.issues) (mapa[i.path.join(".")] ??= []).push(i.message);
  return mapa;
}

describe("esquemaEstablecimiento", () => {
  it("acepta un establecimiento válido y normaliza RFC, correo y opcionales vacíos", () => {
    const r = esquemaEstablecimiento.parse(base);
    expect(r.rfcResponsableSanitario).toBe("PEPJ800101AB1");
    expect(r.correoElectronico).toBe("responsable@ejemplo.mx");
    expect(r.tieneAvisoFuncionamiento).toBe(true);
    expect(r.colonia).toBeUndefined();
    expect(r.noLicenciaSanitaria).toBeUndefined();
    expect(r.scian).toEqual([{ clave: "435313", descripcion: "Comercio al por mayor de equipo médico" }]);
  });

  it("acepta RFC de 12 caracteres para el responsable sanitario", () => {
    expect(esquemaEstablecimiento.safeParse({ ...base, rfcResponsableSanitario: "AAL0409235E6" }).success).toBe(true);
  });

  it("rechaza RFC inválido del responsable sanitario", () => {
    expect(errores({ ...base, rfcResponsableSanitario: "ABC123" }).rfcResponsableSanitario).toBeDefined();
  });

  it("exige los campos obligatorios del manual", () => {
    const e = errores({ ...base, denominacionRazonSocial: " ", telefono: "", calle: "", municipio: "", entidadFederativa: "", correoElectronico: "" });
    for (const campo of ["denominacionRazonSocial", "telefono", "calle", "municipio", "entidadFederativa", "correoElectronico"]) {
      expect(e[campo], campo).toBeDefined();
    }
  });

  describe("licencia sanitaria vs aviso de funcionamiento", () => {
    it("rechaza que vengan ambos", () => {
      const e = errores({ ...base, noLicenciaSanitaria: "12345", tieneAvisoFuncionamiento: "on" });
      expect(e.noLicenciaSanitaria?.[0]).toMatch(/no ambos/);
    });

    it("acepta solo licencia", () => {
      const r = esquemaEstablecimiento.parse({ ...base, noLicenciaSanitaria: "12345", tieneAvisoFuncionamiento: undefined });
      expect(r.noLicenciaSanitaria).toBe("12345");
      expect(r.tieneAvisoFuncionamiento).toBe(false);
    });

    it("permite guardar sin ninguno pero lo detecta para avisar", () => {
      const r = esquemaEstablecimiento.parse({ ...base, noLicenciaSanitaria: "", tieneAvisoFuncionamiento: undefined });
      expect(faltaLicenciaOAviso({ noLicenciaSanitaria: r.noLicenciaSanitaria ?? null, tieneAvisoFuncionamiento: r.tieneAvisoFuncionamiento })).toBe(true);
      expect(faltaLicenciaOAviso({ noLicenciaSanitaria: "1", tieneAvisoFuncionamiento: false })).toBe(false);
      expect(faltaLicenciaOAviso({ noLicenciaSanitaria: null, tieneAvisoFuncionamiento: true })).toBe(false);
    });
  });

  describe("claves SCIAN", () => {
    it("exige al menos una", () => {
      expect(errores({ ...base, scian: [] }).scian).toBeDefined();
    });

    it.each(["43531", "4353131", "43531A", "ABCDEF", ""])("rechaza la clave %j (no son 6 dígitos)", (clave) => {
      expect(errores({ ...base, scian: [{ clave }] })["scian.0.clave"]).toBeDefined();
    });

    it("acepta varias claves y descripción opcional", () => {
      const r = esquemaEstablecimiento.parse({ ...base, scian: [{ clave: "435313" }, { clave: " 325412 ", descripcion: "" }] });
      expect(r.scian.map((s) => s.clave)).toEqual(["435313", "325412"]);
      expect(r.scian[1].descripcion).toBeUndefined();
    });

    it("rechaza claves repetidas", () => {
      expect(errores({ ...base, scian: [{ clave: "435313" }, { clave: "435313" }] })["scian.1.clave"]).toEqual(["Clave SCIAN repetida"]);
    });
  });

  describe("longitudes máximas del manual (campos 3-14)", () => {
    const casos: Array<[keyof typeof base, number]> = [
      ["denominacionRazonSocial", 100],
      ["calle", 120],
      ["numeroExterior", LIMITES_ESTABLECIMIENTO.numeroExterior],
      ["municipio", 120],
      ["colonia", 100],
      ["localidad", 100],
      ["telefono", 30],
      ["entidadFederativa", LIMITES_ESTABLECIMIENTO.entidadFederativa],
    ];
    it.each(casos)("%s admite %i caracteres y no uno más", (campo, max) => {
      expect(errores({ ...base, [campo]: "A".repeat(max) })[campo]).toBeUndefined();
      expect(errores({ ...base, [campo]: "A".repeat(max + 1) })[campo]).toBeDefined();
    });

    it("la entidad es clave de CAT_ENTIDAD (se valida contra el catálogo): admite nombres largos de la semilla", () => {
      expect(errores({ ...base, entidadFederativa: "BAJA CALIFORNIA SUR" }).entidadFederativa).toBeUndefined();
    });

    it("número de licencia sanitaria: máximo 20", () => {
      const sinAviso = { ...base, tieneAvisoFuncionamiento: undefined };
      expect(errores({ ...sinAviso, noLicenciaSanitaria: "1".repeat(20) }).noLicenciaSanitaria).toBeUndefined();
      expect(errores({ ...sinAviso, noLicenciaSanitaria: "1".repeat(21) }).noLicenciaSanitaria).toBeDefined();
    });

    it("correo: válido y de máximo 320 caracteres", () => {
      expect(errores({ ...base, correoElectronico: "no-es-correo" }).correoElectronico).toBeDefined();
      const largo = `${"a".repeat(60)}@${Array.from({ length: 5 }, () => "b".repeat(60)).join(".")}.mx`;
      expect(largo.length).toBeGreaterThan(LIMITES_ESTABLECIMIENTO.correoElectronico);
      expect(errores({ ...base, correoElectronico: largo }).correoElectronico).toBeDefined();
    });

    it("código postal: 5 dígitos", () => {
      expect(errores({ ...base, codigoPostal: "5406" }).codigoPostal).toBeDefined();
      expect(errores({ ...base, codigoPostal: "540600" }).codigoPostal).toBeDefined();
      expect(errores({ ...base, codigoPostal: "ABCDE" }).codigoPostal).toBeDefined();
    });
  });
});

describe("entradaEstablecimientoDesdeFormData", () => {
  it("lee las claves SCIAN repetidas y omite filas vacías", () => {
    const fd = new FormData();
    fd.set("denominacionRazonSocial", "X");
    fd.append("scianClave", "435313");
    fd.append("scianDescripcion", "Equipo médico");
    fd.append("scianClave", "");
    fd.append("scianDescripcion", "");
    fd.append("scianClave", " 325412 ");
    fd.append("scianDescripcion", "");
    const { valores, entrada } = entradaEstablecimientoDesdeFormData(fd);
    expect(entrada.scian).toEqual([
      { clave: "435313", descripcion: "Equipo médico" },
      { clave: "325412", descripcion: "" },
    ]);
    expect(valores.scianClave).toBeUndefined();
    expect(valores.denominacionRazonSocial).toBe("X");
  });

  it("produce una entrada válida para el esquema", () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(base)) if (typeof v === "string") fd.set(k, v);
    fd.append("scianClave", "435313");
    fd.append("scianDescripcion", "");
    expect(esquemaEstablecimiento.safeParse(entradaEstablecimientoDesdeFormData(fd).entrada).success).toBe(true);
  });
});
