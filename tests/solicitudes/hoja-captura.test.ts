import { describe, expect, it } from "vitest";

import { planearAnexos, sanearNombreArchivo } from "@/lib/solicitudes/anexos";
import { construirHojaCaptura } from "@/lib/solicitudes/hoja-captura";
import { DEFINICION_260211_INICIAL } from "@/lib/tramite/definicion";

import { partida, solicitudCompleta } from "./fabrica";

describe("construirHojaCaptura", () => {
  it("respeta el orden de secciones del portal VUCEM 260211", () => {
    const hoja = construirHojaCaptura(solicitudCompleta());
    expect(hoja.map((s) => s.titulo)).toEqual([
      "Solicitante",
      "Datos de la solicitud",
      "Terceros relacionados",
      "Pago de derechos",
      "Requisitos y anexos",
    ]);
    expect(hoja.map((s) => s.numero)).toEqual([1, 2, 3, 4, 5]);
  });

  it("datos de la solicitud: establecimiento, domicilio, SCIAN, aviso/licencia, régimen y aduana, mercancías, manifiestos y representante", () => {
    const sol = solicitudCompleta({ partidas: [partida(), partida({ id: "par-2", orden: 2, denominacionEspecifica: "CATETER" })] });
    const datos = construirHojaCaptura(sol)[1];
    expect(datos.grupos.map((g) => g.titulo)).toEqual([
      "Establecimiento",
      "Domicilio del establecimiento",
      "SCIAN",
      "Aviso de funcionamiento o licencia sanitaria",
      "Régimen y aduana",
      "Mercancía 1: JERINGA DESECHABLE ESTERIL 5 ML",
      "Mercancía 2: CATETER",
      "Manifiestos y declaraciones",
      "Representante legal",
    ]);
  });

  it("terceros en orden fabricante, destinatario, proveedor, facturador", () => {
    const terceros = construirHojaCaptura(solicitudCompleta())[2];
    expect(terceros.grupos.map((g) => g.titulo)).toEqual([
      "Fabricante: MEDICAL DEVICES EXAMPLE INC",
      "Destinatario (destino final): DISPOSITIVOS MEDICOS DEMO SA DE CV",
      "Proveedor",
      "Facturador",
    ]);
    expect(terceros.grupos[2].campos).toEqual([]);
  });

  it("agrega la descripción del catálogo junto a la clave", () => {
    const hoja = construirHojaCaptura(solicitudCompleta(), {
      CAT_ADUANA: new Map([["470", "AEROPUERTO INTERNACIONAL DE LA CIUDAD DE MEXICO"]]),
      CAT_PAIS: new Map([["USA", "Estados Unidos de América"]]),
    });
    const regimen = hoja[1].grupos.find((g) => g.titulo === "Régimen y aduana")!;
    expect(regimen.campos[1]).toEqual({
      etiqueta: "Aduana de entrada",
      valor: "470",
      descripcion: "AEROPUERTO INTERNACIONAL DE LA CIUDAD DE MEXICO",
    });
    const mercancia = hoja[1].grupos.find((g) => g.titulo.startsWith("Mercancía 1"))!;
    expect(mercancia.campos.find((c) => c.etiqueta === "País de origen")?.descripcion).toBe("Estados Unidos de América");
  });

  it("pago omitido y anexos con el nombre del archivo del ZIP", () => {
    const hoja = construirHojaCaptura(solicitudCompleta({ pagoOmitido: true }));
    expect(hoja[3].grupos[0].campos).toEqual([]);
    expect(hoja[3].grupos[0].nota).toMatch(/no requiere pago/);
    const anexos = hoja[4];
    expect(anexos.grupos.map((g) => g.titulo)).toEqual(DEFINICION_260211_INICIAL.requisitos.map((r) => `${r.nombre}${r.obligatorio ? " (obligatorio)" : ""}`));
    expect(anexos.grupos[0].campos[0].valor).toBe("01_LICENCIA_O_AVISO_Licencia_sanitaria.pdf");
  });
});

describe("planearAnexos", () => {
  it("ordena por requisito y nombra NN_requisito_nombre.pdf saneado", () => {
    const sol = solicitudCompleta();
    const invertidos = [...sol.documentos].reverse();
    invertidos[0] = { ...invertidos[0], documento: { ...invertidos[0].documento, nombre: "Registro sanitario: jeringa ñandú / 5 ml" } };
    const plan = planearAnexos(invertidos, DEFINICION_260211_INICIAL);
    expect(plan.map((a) => a.nombreArchivo)).toEqual([
      "01_LICENCIA_O_AVISO_Licencia_sanitaria.pdf",
      "02_AVISO_RESPONSABLE_Aviso_de_responsable_sanitario.pdf",
      "03_REGISTRO_SANITARIO_Registro_sanitario_jeringa_nandu_5_ml.pdf",
    ]);
  });

  it("sanearNombreArchivo quita rutas y caracteres especiales", () => {
    expect(sanearNombreArchivo("../../etc/passwd")).toBe("etc_passwd");
    expect(sanearNombreArchivo("   ")).toBe("documento");
    expect(sanearNombreArchivo("Año 2026 — versión «final»")).toBe("Ano_2026_version_final");
  });
});
