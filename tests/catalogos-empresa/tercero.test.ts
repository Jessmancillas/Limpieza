import { describe, expect, it } from "vitest";

import { datosTerceroParaGuardar, esquemaTercero, LIMITES_TERCERO, nombreTercero } from "@/lib/validacion/tercero";

const fabricanteExtranjero = {
  tipo: "FABRICANTE",
  tipoPersona: "MORAL",
  nacionalidad: "EXTRANJERO",
  denominacionRazonSocial: "MEDICAL DEVICES EXAMPLE INC",
  correoElectronico: "export@example.com",
  pais: "usa",
  entidadFederativa: "CA",
  codigoPostal: "94105",
  calle: "MARKET ST",
  numeroExterior: "500",
};

const destinatarioNacional = {
  tipo: "DESTINATARIO",
  tipoPersona: "MORAL",
  nacionalidad: "NACIONAL",
  denominacionRazonSocial: "DISPOSITIVOS MEDICOS DEMO SA DE CV",
  rfc: "DME200101AB1",
  pais: "MEX",
  entidadFederativa: "MEX",
  municipio: "TLALNEPANTLA DE BAZ",
  colonia: "INDUSTRIAL",
  localidad: "TLALNEPANTLA",
  codigoPostal: "54060",
  calle: "CALLE BODEGA",
  numeroExterior: "12",
  numeroInterior: "S/N",
  telefono: "5555555556",
};

function errores(entrada: Record<string, unknown>) {
  const r = esquemaTercero.safeParse(entrada);
  if (r.success) return {};
  const mapa: Record<string, string[]> = {};
  for (const i of r.error.issues) (mapa[i.path.join(".")] ??= []).push(i.message);
  return mapa;
}

describe("esquemaTercero: fabricante / proveedor / facturador", () => {
  it("acepta un fabricante extranjero persona moral sin RFC", () => {
    const r = esquemaTercero.parse(fabricanteExtranjero);
    expect(r.pais).toBe("USA");
    expect(r.rfc).toBeUndefined();
  });

  it.each(["FABRICANTE", "PROVEEDOR", "FACTURADOR"])("%s exige correo electrónico", (tipo) => {
    expect(errores({ ...fabricanteExtranjero, tipo, correoElectronico: "" }).correoElectronico).toBeDefined();
  });

  it("exige calle, número exterior, país y entidad", () => {
    const e = errores({ ...fabricanteExtranjero, calle: "", numeroExterior: "", pais: "", entidadFederativa: "" });
    expect(Object.keys(e)).toEqual(expect.arrayContaining(["calle", "numeroExterior", "pais", "entidadFederativa"]));
  });

  it("persona moral exige denominación; persona física exige nombre y apellido paterno", () => {
    expect(errores({ ...fabricanteExtranjero, denominacionRazonSocial: "" }).denominacionRazonSocial).toBeDefined();
    const fisica = { ...fabricanteExtranjero, tipoPersona: "FISICA", denominacionRazonSocial: "" };
    const e = errores(fisica);
    expect(e.nombre).toBeDefined();
    expect(e.apellidoPaterno).toBeDefined();
    expect(e.denominacionRazonSocial).toBeUndefined();
    expect(esquemaTercero.safeParse({ ...fisica, nombre: "JOSE", apellidoPaterno: "MARTINEZ" }).success).toBe(true);
  });

  it("si el extranjero trae RFC, debe ser válido", () => {
    expect(errores({ ...fabricanteExtranjero, rfc: "XYZ" }).rfc).toBeDefined();
    expect(esquemaTercero.parse({ ...fabricanteExtranjero, rfc: "xexx010101000" }).rfc).toBe("XEXX010101000");
  });

  it("estado o provincia del extranjero: máximo 6 caracteres", () => {
    expect(errores({ ...fabricanteExtranjero, entidadFederativa: "A".repeat(6) }).entidadFederativa).toBeUndefined();
    expect(errores({ ...fabricanteExtranjero, entidadFederativa: "CALIFORNIA" }).entidadFederativa).toBeDefined();
  });

  describe("nacional", () => {
    const nacional = {
      ...fabricanteExtranjero,
      nacionalidad: "NACIONAL",
      rfc: "DME200101AB1",
      pais: "MEX",
      entidadFederativa: "JAL",
      municipio: "GUADALAJARA",
      colonia: "CENTRO",
      codigoPostal: "44100",
    };

    it("acepta un fabricante nacional completo", () => {
      expect(esquemaTercero.safeParse(nacional).success).toBe(true);
    });

    it("exige RFC válido y congruente con el tipo de persona", () => {
      expect(errores({ ...nacional, rfc: "" }).rfc).toBeDefined();
      expect(errores({ ...nacional, rfc: "ABC" }).rfc).toBeDefined();
      expect(errores({ ...nacional, rfc: "PEPJ800101AB1" }).rfc).toEqual(["Una persona moral tiene RFC de 12 caracteres"]);
      expect(
        errores({ ...nacional, tipoPersona: "FISICA", nombre: "JUAN", apellidoPaterno: "PEREZ", rfc: "DME200101AB1" }).rfc,
      ).toEqual(["Una persona física tiene RFC de 13 caracteres"]);
    });

    it("exige domicilio mexicano: país MEX, entidad, municipio, colonia y CP de 5 dígitos", () => {
      const e = errores({ ...nacional, pais: "USA", entidadFederativa: "", municipio: "", colonia: "", codigoPostal: "123" });
      expect(Object.keys(e)).toEqual(expect.arrayContaining(["pais", "entidadFederativa", "municipio", "colonia", "codigoPostal"]));
      expect(errores({ ...nacional, codigoPostal: "" }).codigoPostal).toBeDefined();
    });

    it("la CURP solo aplica a personas físicas nacionales", () => {
      const fisica = { ...nacional, tipoPersona: "FISICA", nombre: "JUAN", apellidoPaterno: "PEREZ", rfc: "PEPJ800101AB1" };
      expect(esquemaTercero.parse({ ...fisica, curp: "pepj800101hdfrrn09" }).curp).toBe("PEPJ800101HDFRRN09");
      expect(errores({ ...fisica, curp: "NOESCURP" }).curp).toBeDefined();
      expect(errores({ ...nacional, curp: "PEPJ800101HDFRRN09" }).curp).toBeDefined();
      expect(
        errores({ ...fabricanteExtranjero, tipoPersona: "FISICA", nombre: "J", apellidoPaterno: "P", curp: "PEPJ800101HDFRRN09" }).curp,
      ).toBeDefined();
    });
  });

  describe("longitudes máximas del manual", () => {
    const fisica = { ...fabricanteExtranjero, tipoPersona: "FISICA", nombre: "JUAN", apellidoPaterno: "PEREZ" };
    const casos: Array<[string, number, Record<string, unknown>]> = [
      ["nombre", 200, fisica],
      ["apellidoPaterno", 200, fisica],
      ["apellidoMaterno", 200, fisica],
      ["denominacionRazonSocial", 254, fabricanteExtranjero],
      ["calle", 100, fabricanteExtranjero],
      ["numeroExterior", 55, fabricanteExtranjero],
      ["numeroInterior", 55, fabricanteExtranjero],
      ["codigoPostal", 12, fabricanteExtranjero],
      ["lada", 44, fabricanteExtranjero],
      ["telefono", 30, fabricanteExtranjero],
    ];
    it.each(casos)("%s admite %i caracteres y no uno más", (campo, max, entrada) => {
      expect(errores({ ...entrada, [campo]: "1".repeat(max) })[campo]).toBeUndefined();
      expect(errores({ ...entrada, [campo]: "1".repeat(max + 1) })[campo]).toBeDefined();
    });

    it("el país es una clave de 3 letras", () => {
      expect(errores({ ...fabricanteExtranjero, pais: "US" }).pais).toBeDefined();
      expect(errores({ ...fabricanteExtranjero, pais: "USAA" }).pais).toBeDefined();
    });
  });
});

describe("esquemaTercero: destinatario", () => {
  it("acepta un destinatario nacional completo sin correo", () => {
    expect(esquemaTercero.safeParse(destinatarioNacional).success).toBe(true);
  });

  it("exige RFC y denominación aunque sea extranjero o persona física", () => {
    const e = errores({ ...destinatarioNacional, nacionalidad: "EXTRANJERO", rfc: "", denominacionRazonSocial: "" });
    expect(e.rfc).toBeDefined();
    expect(e.denominacionRazonSocial).toBeDefined();
    const fisica = {
      ...destinatarioNacional,
      tipoPersona: "FISICA",
      nombre: "JUAN",
      apellidoPaterno: "PEREZ",
      rfc: "PEPJ800101AB1",
      denominacionRazonSocial: "",
    };
    expect(errores(fisica).denominacionRazonSocial).toBeDefined();
    expect(esquemaTercero.safeParse({ ...fisica, denominacionRazonSocial: "JUAN PEREZ" }).success).toBe(true);
  });

  it("exige domicilio con municipio, localidad, colonia, CP, número interior y teléfono", () => {
    const e = errores({
      ...destinatarioNacional,
      municipio: "",
      localidad: "",
      colonia: "",
      codigoPostal: "",
      numeroInterior: "",
      telefono: "",
    });
    expect(Object.keys(e)).toEqual(
      expect.arrayContaining(["municipio", "localidad", "colonia", "codigoPostal", "numeroInterior", "telefono"]),
    );
  });

  it("aplica los tamaños propios del destinatario (denominación 100, número exterior 9, estado 12)", () => {
    expect(errores({ ...destinatarioNacional, denominacionRazonSocial: "A".repeat(100) }).denominacionRazonSocial).toBeUndefined();
    expect(errores({ ...destinatarioNacional, denominacionRazonSocial: "A".repeat(101) }).denominacionRazonSocial).toBeDefined();
    expect(errores({ ...destinatarioNacional, numeroExterior: "123456789" }).numeroExterior).toBeUndefined();
    expect(errores({ ...destinatarioNacional, numeroExterior: "1234567890" }).numeroExterior).toBeDefined();
    const destinatarioExtranjero = { ...destinatarioNacional, nacionalidad: "EXTRANJERO", pais: "USA", codigoPostal: "94105" };
    expect(errores({ ...destinatarioExtranjero, entidadFederativa: "A".repeat(12) }).entidadFederativa).toBeUndefined();
    expect(errores({ ...destinatarioExtranjero, entidadFederativa: "A".repeat(13) }).entidadFederativa).toBeDefined();
    // Nacional: clave de CAT_ENTIDAD, validada contra el catálogo en la acción.
    expect(errores({ ...destinatarioNacional, entidadFederativa: "BAJA CALIFORNIA SUR" }).entidadFederativa).toBeUndefined();
    expect(LIMITES_TERCERO.denominacionDestinatario).toBe(100);
  });
});

describe("datosTerceroParaGuardar", () => {
  it("descarta datos de persona que no aplican", () => {
    const moral = esquemaTercero.parse({ ...fabricanteExtranjero, nombre: "OCULTO", apellidoPaterno: "OCULTO" });
    const d = datosTerceroParaGuardar(moral);
    expect(d.nombre).toBeNull();
    expect(d.apellidoPaterno).toBeNull();
    expect(d.denominacionRazonSocial).toBe("MEDICAL DEVICES EXAMPLE INC");
    expect(d.curp).toBeNull();
    expect(d.numeroInterior).toBeNull();

    const fisica = esquemaTercero.parse({
      ...fabricanteExtranjero,
      tipoPersona: "FISICA",
      nombre: "JUAN",
      apellidoPaterno: "PEREZ",
      denominacionRazonSocial: "OCULTA",
    });
    expect(datosTerceroParaGuardar(fisica).denominacionRazonSocial).toBeNull();
  });

  it("conserva la denominación del destinatario persona física", () => {
    const d = datosTerceroParaGuardar(
      esquemaTercero.parse({
        ...destinatarioNacional,
        tipoPersona: "FISICA",
        nombre: "JUAN",
        apellidoPaterno: "PEREZ",
        rfc: "PEPJ800101AB1",
        denominacionRazonSocial: "JUAN PEREZ",
      }),
    );
    expect(d.denominacionRazonSocial).toBe("JUAN PEREZ");
    expect(nombreTercero(d)).toBe("JUAN PEREZ");
  });
});
