// Render en servidor de los formularios cliente para comprobar qué campos se muestran según
// tipo de tercero, tipo de persona y nacionalidad (y que no truenan al pintarse).
import { createElement, type AnchorHTMLAttributes } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { FormularioEstablecimiento } from "@/app/(app)/establecimientos/formulario";
import { FormularioProducto, type ValoresProducto } from "@/app/(app)/productos/formulario";
import { FormularioTercero, type ValoresTercero } from "@/app/(app)/terceros/formulario";
import type { EstadoFormulario } from "@/lib/formularios";

vi.mock("next/link", () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => createElement("a", { href, ...props }),
}));

const accion = async (e: EstadoFormulario) => e;
/** HTML sin los separadores de texto que inserta React en SSR. */
const html = (elemento: Parameters<typeof renderToString>[0]) => renderToString(elemento).replaceAll("<!-- -->", "");
const paises = [{ clave: "USA", descripcion: "Estados Unidos", padreClave: null, porConfirmar: false }];

const terceroBase: ValoresTercero = {
  tipo: "FABRICANTE",
  tipoPersona: "MORAL",
  nacionalidad: "EXTRANJERO",
  nombre: null,
  apellidoPaterno: null,
  apellidoMaterno: null,
  denominacionRazonSocial: "MEDICAL INC",
  rfc: null,
  curp: null,
  correoElectronico: "x@example.com",
  pais: "USA",
  entidadFederativa: "CA",
  municipio: null,
  colonia: null,
  localidad: null,
  codigoPostal: null,
  calle: "MARKET",
  numeroExterior: "1",
  numeroInterior: null,
  lada: null,
  telefono: null,
};

function pintarTercero(inicial: Partial<ValoresTercero>) {
  return html(
    createElement(FormularioTercero, {
      accion,
      inicial: { ...terceroBase, ...inicial },
      opcionesPais: paises,
      opcionesEntidad: [],
    }),
  );
}

const campos = (pagina: string) => new Set([...pagina.matchAll(/name="([^"]+)"/g)].map((m) => m[1]));

describe("FormularioTercero", () => {
  it("fabricante extranjero moral: denominación, país del catálogo, sin CURP ni colonia", () => {
    const pagina = pintarTercero({});
    const c = campos(pagina);
    expect(c.has("denominacionRazonSocial")).toBe(true);
    expect(c.has("nombre")).toBe(false);
    expect(c.has("curp")).toBe(false);
    expect(c.has("colonia")).toBe(false);
    expect(pagina).toContain("Estados Unidos (USA)");
  });

  it("persona física nacional: nombre, apellidos, CURP, domicilio mexicano y país fijo MEX", () => {
    const pagina = pintarTercero({ tipoPersona: "FISICA", nacionalidad: "NACIONAL", pais: "MEX" });
    const c = campos(pagina);
    for (const n of ["nombre", "apellidoPaterno", "apellidoMaterno", "curp", "municipio", "colonia", "localidad"]) expect(c.has(n), n).toBe(true);
    expect(c.has("denominacionRazonSocial")).toBe(false);
    expect(pagina).toContain('type="hidden" name="pais" value="MEX"');
  });

  it("destinatario persona física: pide también la denominación", () => {
    const c = campos(pintarTercero({ tipo: "DESTINATARIO", tipoPersona: "FISICA", nacionalidad: "NACIONAL", pais: "MEX" }));
    expect(c.has("nombre")).toBe(true);
    expect(c.has("denominacionRazonSocial")).toBe(true);
  });

  it("incluye ?volver= como campo oculto", () => {
    expect(
      html(
        createElement(FormularioTercero, {
          accion,
          inicial: terceroBase,
          opcionesPais: paises,
          opcionesEntidad: [],
          volver: "/productos/nuevo",
        }),
      ),
    ).toContain('name="volver" value="/productos/nuevo"');
  });
});

describe("FormularioEstablecimiento", () => {
  it("pinta las claves SCIAN como campos repetidos y avisa si falta licencia y aviso", () => {
    const pagina = html(
      createElement(FormularioEstablecimiento, {
        accion,
        inicial: {
          denominacionRazonSocial: "ALMACEN",
          rfcResponsableSanitario: "PEPJ800101AB1",
          correoElectronico: "a@a.mx",
          telefono: "1",
          calle: "C",
          numeroExterior: null,
          codigoPostal: "54060",
          entidadFederativa: "MEX",
          municipio: "M",
          colonia: null,
          localidad: null,
          noLicenciaSanitaria: null,
          tieneAvisoFuncionamiento: false,
          scian: [
            { clave: "435313", descripcion: "Equipo" },
            { clave: "325412", descripcion: null },
          ],
        },
        opcionesEntidad: [],
        opcionesScian: [],
      }),
    );
    expect(pagina.match(/name="scianClave"/g)).toHaveLength(2);
    expect(pagina).toContain('value="435313"');
    expect(pagina).toContain("Falta la licencia sanitaria o el aviso de funcionamiento");
    // Sin catálogo de entidades se ofrece captura libre de la clave.
    expect(pagina).toContain("no tiene opciones cargadas");
  });
});

describe("FormularioProducto", () => {
  it("filtra la subclasificación por la clasificación y enlaza el alta de fabricante", () => {
    const opcion = (clave: string, padreClave: string | null = null) => ({ clave, descripcion: `D${clave}`, padreClave, porConfirmar: false });
    const inicial: ValoresProducto = {
      denominacionEspecifica: "JERINGA",
      denominacionDistintiva: "M",
      denominacionComunCientifica: "J",
      idClasificacionProducto: "52",
      idSubClasificacionProducto: "25",
      idTipoProducto: null,
      especifique: null,
      idFormaFarmaceutica: null,
      idEstadoFisico: null,
      fraccionArancelaria: "90183101",
      descripcionFraccion: null,
      umt: null,
      umc: null,
      desUMC: "PIEZA",
      presentacionTipoEnvase: "CAJA",
      numRegistroSanitario: null,
      vigenciaRegistroSanitario: "",
      cvePaisOrigen: "USA",
      idUsoEspecifico: null,
      fabricanteId: "f1",
      notas: null,
    };
    const pagina = html(
      createElement(FormularioProducto, {
        accion,
        inicial,
        rutaActual: "/productos/abc",
        opciones: {
          clasificacion: [opcion("52"), opcion("10")],
          subclasificacion: [opcion("25", "52"), opcion("99", "10")],
          tipoProducto: [],
          formaFarmaceutica: [],
          estadoFisico: [],
          unidadMedida: [],
          pais: paises,
          usoEspecifico: [],
          fabricantes: [{ id: "f1", nombre: "MEDICAL INC", pais: "USA", activo: true }],
        },
      }),
    );
    expect(pagina).toContain("D25 (25)");
    expect(pagina).not.toContain("D99 (99)");
    expect(pagina).toContain("/terceros/nuevo?tipo=FABRICANTE&amp;volver=%2Fproductos%2Fabc");
    expect(pagina).toContain("MEDICAL INC (USA)");
  });
});
