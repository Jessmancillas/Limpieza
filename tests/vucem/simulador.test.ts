import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as postDigitalizacion } from "@/app/api/vucem-simulador/digitalizacion/route";
import { POST as postSolicitud } from "@/app/api/vucem-simulador/solicitud/route";
import { descifrarLlave, firmarCadena, leerCertificado } from "@/lib/firma/firmar";
import {
  cadenaDigitalizacion,
  parsearRespuestaConsulta,
  parsearRespuestaRegistro,
  xmlConsulta,
  xmlRegistro,
} from "@/lib/vucem/digitalizacion";
import {
  eDocumentSimulado,
  folioSimulado,
  numeroTramiteSimulado,
  passwordSimulador,
  procesarDigitalizacion,
  procesarSolicitud,
  simuladorHabilitado,
} from "@/lib/vucem/simulador";
import {
  construirCadenaOriginal260211,
  construirPayload260211,
  construirXml260211,
  parsearRespuestaSolicitud,
} from "@/lib/vucem/solicitud-260211";
import { urlSimulador, validarUrlEnvio } from "@/lib/vucem/urls";

import { PASSWORD_LLAVE, leerFixture, solicitud } from "./fabrica";

const cert = leerCertificado(new Uint8Array(leerFixture("efirma-prueba.cer")));
const llave = descifrarLlave(new Uint8Array(leerFixture("efirma-prueba.key")), PASSWORD_LLAVE);
const pdf = leerFixture("documento-prueba.pdf");
const RFC = "DME200101AB1";

function peticionRegistro(opciones: { password?: string; nombre?: string; alterarCadena?: boolean; archivo?: Buffer } = {}) {
  const archivo = opciones.archivo ?? pdf;
  const datos = {
    correoElectronico: "permisos@ejemplo.mx",
    idTipoDocumento: "123",
    nombreDocumento: opciones.nombre ?? "Licencia sanitaria",
    rfcConsulta: RFC,
  };
  let cadena = cadenaDigitalizacion({ ...datos, rfcFirmante: cert.rfc ?? "", sha1: createHash("sha1").update(pdf).digest("hex") });
  if (opciones.alterarCadena) cadena = cadena.replace("Licencia", "Licencia2");
  return xmlRegistro({
    ...datos,
    usuario: RFC,
    password: opciones.password ?? passwordSimulador(),
    archivoBase64: archivo.toString("base64"),
    certificadoBase64: cert.certificadoBase64,
    cadenaOriginal: cadena,
    firma: firmarCadena(llave, cadena),
  });
}

describe("simulador de digitalización", () => {
  it("viaje completo: registro → en proceso → eDocument", () => {
    const ahora = 1_000_000;
    const registro = procesarDigitalizacion(peticionRegistro(), { ahora });
    expect(registro.status).toBe(200);
    const leido = parsearRespuestaRegistro(registro.xml);
    expect(leido.ok).toBe(true);
    if (!leido.ok) return;

    const consulta = xmlConsulta({ usuario: RFC, password: passwordSimulador(), numeroOperacion: leido.numeroOperacion });
    const pendiente = procesarDigitalizacion(consulta, { ahora: ahora + 1000, demoraMs: 4000 });
    expect(parsearRespuestaConsulta(pendiente.xml)).toEqual({ estado: "PENDIENTE" });

    const lista = parsearRespuestaConsulta(procesarDigitalizacion(consulta, { ahora: ahora + 5000, demoraMs: 4000 }).xml);
    expect(lista.estado).toBe("OK");
    if (lista.estado !== "OK") return;
    expect(lista.eDocument).toMatch(/^[0-9A-Z]{13}$/);
    expect(lista.numeroDeTramite).toMatch(/^\d{25}$/);
    expect(lista.cadenaOriginal).toBe(`|${lista.numeroDeTramite}|${lista.eDocument}|`);
    // Determinístico a partir del número de operación.
    expect(lista.eDocument).toBe(eDocumentSimulado(leido.numeroOperacion));
    expect(lista.numeroDeTramite).toBe(numeroTramiteSimulado(leido.numeroOperacion));
  });

  it("rechaza contraseña incorrecta, cadena alterada, archivo distinto y lo que no es PDF", () => {
    const casos: Array<[string, RegExp]> = [
      [peticionRegistro({ password: "otra" }), /contraseña/],
      [peticionRegistro({ alterarCadena: true }), /cadena original no corresponde/],
      [peticionRegistro({ archivo: Buffer.concat([pdf, Buffer.from("\n%extra")]) }), /SHA-1/],
      [peticionRegistro({ archivo: Buffer.from("hola") }), /no es un PDF/],
    ];
    for (const [xml, error] of casos) {
      const r = procesarDigitalizacion(xml);
      expect(r.status).toBe(500);
      const leido = parsearRespuestaRegistro(r.xml);
      expect(leido.ok).toBe(false);
      if (!leido.ok) expect(leido.mensaje).toMatch(error);
    }
  });

  it("simula un error de digitalización a petición", () => {
    const leido = parsearRespuestaRegistro(procesarDigitalizacion(peticionRegistro({ nombre: "Prueba simular error" })).xml);
    expect(leido.ok).toBe(true);
    if (!leido.ok) return;
    const consulta = xmlConsulta({ usuario: RFC, password: passwordSimulador(), numeroOperacion: leido.numeroOperacion });
    expect(parsearRespuestaConsulta(procesarDigitalizacion(consulta, { demoraMs: 0 }).xml).estado).toBe("ERROR");
  });
});

describe("simulador del WS 260211", () => {
  const sol = solicitud();
  const payload = construirPayload260211(sol);
  const cadena = construirCadenaOriginal260211(payload, sol.empresa);
  const xml = (firma = firmarCadena(llave, cadena), password = passwordSimulador(), usuario = RFC) =>
    construirXml260211(
      payload,
      { certificadoBase64: cert.certificadoBase64, cadenaOriginal: cadena, firma },
      { operacion: "registrarSolicitud260211", usuario, password, soapAction: "urn:x", url: urlSimulador("solicitud") },
    );

  it("viaje completo: firma válida → folio de 25 dígitos", () => {
    const r = procesarSolicitud(xml(), { ahora: new Date("2026-10-12T12:00:00Z") });
    expect(r.status).toBe(200);
    const leido = parsearRespuestaSolicitud(r.xml);
    expect(leido.exito).toBe(true);
    expect(leido.folio).toMatch(/^0402600201120264006\d{6}$/);
    expect(leido.folio).toHaveLength(25);
    expect(leido.mensajes.join(" ")).toMatch(/SIMULADOR/);
  });

  it("rechaza firma inválida, contraseña incorrecta y RFC de usuario distinto", () => {
    const otraCadenaFirma = firmarCadena(llave, `${cadena}x|`);
    expect(parsearRespuestaSolicitud(procesarSolicitud(xml(otraCadenaFirma)).xml).mensajes.join()).toMatch(/firma/);
    expect(parsearRespuestaSolicitud(procesarSolicitud(xml(undefined, "mala")).xml).mensajes.join()).toMatch(/contraseña/);
    expect(parsearRespuestaSolicitud(procesarSolicitud(xml(undefined, undefined, "XAXX010101000")).xml).exito).toBe(false);
  });

  it("formato de folio", () => {
    expect(folioSimulado(2026, 7)).toBe("0402600201120264006000007");
  });
});

describe("route handlers del simulador", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("responden XML y se deshabilitan en producción salvo VUCEM_SIMULADOR=true", async () => {
    const r = await postDigitalizacion(new Request("http://localhost/api/vucem-simulador/digitalizacion", { method: "POST", body: peticionRegistro() }));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/xml");
    expect(parsearRespuestaRegistro(await r.text()).ok).toBe(true);

    vi.stubEnv("NODE_ENV", "production");
    expect(simuladorHabilitado()).toBe(false);
    const cerrado = await postSolicitud(new Request("http://localhost/api/vucem-simulador/solicitud", { method: "POST", body: "<x/>" }));
    expect(cerrado.status).toBe(404);
    vi.stubEnv("VUCEM_SIMULADOR", "true");
    expect(simuladorHabilitado()).toBe(true);
  });
});

describe("validarUrlEnvio", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("SIMULADOR solo al simulador interno; PRUEBAS/PRODUCCION solo https", () => {
    vi.stubEnv("APP_URL", "http://localhost:3000/");
    expect(urlSimulador("solicitud")).toBe("http://localhost:3000/api/vucem-simulador/solicitud");
    expect(validarUrlEnvio("http://localhost:3000/api/vucem-simulador/digitalizacion", "SIMULADOR")).toBeNull();
    expect(validarUrlEnvio("https://www.ventanillaunica.gob.mx/ventanilla/DigitalizarDocumentoService", "SIMULADOR")).not.toBeNull();
    expect(validarUrlEnvio("http://localhost:3000/api/otra", "SIMULADOR")).not.toBeNull();
    expect(validarUrlEnvio("https://www.ventanillaunica.gob.mx/ventanilla/DigitalizarDocumentoService", "PRODUCCION")).toBeNull();
    expect(validarUrlEnvio("http://www.ventanillaunica.gob.mx/x", "PRUEBAS")).not.toBeNull();
    expect(validarUrlEnvio("https://usuario:clave@vucem.example/x", "PRODUCCION")).not.toBeNull();
    expect(validarUrlEnvio("no es url", "PRODUCCION")).not.toBeNull();
  });
});
