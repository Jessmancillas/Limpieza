import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  NS_DIGITALIZAR,
  cadenaDigitalizacion,
  normalizarNombreDocumentoVucem,
  omitirArchivo,
  parsearRespuestaConsulta,
  parsearRespuestaRegistro,
  xmlConsulta,
  xmlRegistro,
} from "@/lib/vucem/digitalizacion";
import { NS_RESPUESTA, esXmlBienFormado, redactarPassword } from "@/lib/vucem/soap";

import { leerFixture } from "./fabrica";

const pdf = leerFixture("documento-prueba.pdf");
// Calculado con `sha1sum documento-prueba.pdf` al generar el fixture.
const SHA1_PDF = "e598327f0247fb4ded946aa49dea69b8ce654aab";

describe("cadena original de digitalización", () => {
  it("usa el SHA-1 del binario del PDF en hex minúsculas y el formato exacto con pipes", () => {
    const sha1 = createHash("sha1").update(pdf).digest("hex");
    expect(sha1).toBe(SHA1_PDF);
    const cadena = cadenaDigitalizacion({
      rfcFirmante: "pepj800101ab1",
      correoElectronico: "permisos@ejemplo.mx",
      idTipoDocumento: "123",
      nombreDocumento: "Licencia | sanitaria\n almacén",
      rfcConsulta: "DME200101AB1",
      sha1: sha1.toUpperCase(),
    });
    expect(cadena).toBe(`|PEPJ800101AB1|permisos@ejemplo.mx|123|Licencia sanitaria almacén|DME200101AB1|${SHA1_PDF}|`);
    expect(cadena.split("|")).toHaveLength(8);
  });

  it("rechaza un SHA-1 mal formado", () => {
    expect(() =>
      cadenaDigitalizacion({ rfcFirmante: "X", correoElectronico: "a@b.mx", idTipoDocumento: "1", nombreDocumento: "x", rfcConsulta: "Y", sha1: "abc" }),
    ).toThrow();
  });

  it("normaliza nombreDocumento: sin saltos de línea ni pipes, máximo 100", () => {
    expect(normalizarNombreDocumentoVucem("  A|B\r\nC\tD  ")).toBe("A B C D");
    expect(normalizarNombreDocumentoVucem("ñ".repeat(150))).toHaveLength(100);
  });
});

describe("XML de registro y consulta", () => {
  const registro = xmlRegistro({
    usuario: "DME200101AB1",
    password: "secreta&<>",
    correoElectronico: "permisos@ejemplo.mx",
    idTipoDocumento: "123",
    nombreDocumento: "Licencia & permiso",
    rfcConsulta: "DME200101AB1",
    archivoBase64: pdf.toString("base64"),
    certificadoBase64: "Q0VSVA==",
    cadenaOriginal: "|A|B|",
    firma: "RklSTUE=",
  });

  it("está bien formado y usa los namespaces del servicio", () => {
    expect(esXmlBienFormado(registro)).toBe(true);
    expect(registro).toContain(`<registroDigitalizarDocumentoServiceRequest xmlns="${NS_DIGITALIZAR}">`);
    expect(registro).toContain(`<firmaElectronica xmlns="${NS_RESPUESTA}"><certificado>Q0VSVA==</certificado><cadenaOriginal>|A|B|</cadenaOriginal><firma>RklSTUE=</firma></firmaElectronica>`);
    expect(registro).toMatch(/<documento><idTipoDocumento>123<\/idTipoDocumento><nombreDocumento>Licencia &amp; permiso<\/nombreDocumento><rfcConsulta>DME200101AB1<\/rfcConsulta><archivo>/);
    expect(registro).toContain("<peticionBase>");
    expect(registro).toContain("<wsse:Username>DME200101AB1</wsse:Username>");
    expect(registro).toContain("#PasswordText\">secreta&amp;&lt;&gt;</wsse:Password>");
  });

  it("redactarPassword oculta la contraseña y omitirArchivo quita el PDF", () => {
    const guardado = redactarPassword(omitirArchivo(registro));
    expect(guardado).not.toContain("secreta");
    expect(guardado).toContain(">********</wsse:Password>");
    expect(guardado).not.toContain(pdf.toString("base64"));
    expect(guardado).toMatch(/<archivo>\[PDF en base64 omitido: ~\d+ bytes\]<\/archivo>/);
    expect(esXmlBienFormado(guardado)).toBe(true);
    expect(redactarPassword("<a:Password Type='x'>abc</a:Password><Password>def</Password>")).toBe(
      "<a:Password Type='x'>********</a:Password><Password>********</Password>",
    );
  });

  it("la consulta solo lleva UsernameToken y el número de operación", () => {
    const consulta = xmlConsulta({ usuario: "DME200101AB1", password: "x", numeroOperacion: "123456" });
    expect(esXmlBienFormado(consulta)).toBe(true);
    expect(consulta).toContain(`<ConsultaEDocumentDigitalizarDocumento xmlns="${NS_DIGITALIZAR}"><numeroOperacion>123456</numeroOperacion></ConsultaEDocumentDigitalizarDocumento>`);
    expect(consulta).not.toContain("firmaElectronica");
  });
});

const sobre = (cuerpo: string) =>
  `<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body>` +
  `<ns2:respuesta xmlns="${NS_RESPUESTA}" xmlns:ns2="${NS_DIGITALIZAR}">${cuerpo}</ns2:respuesta></S:Body></S:Envelope>`;

describe("respuestas", () => {
  it("registro: número de operación", () => {
    expect(parsearRespuestaRegistro(sobre(`<ns2:respuestaBase><tieneError>false</tieneError></ns2:respuestaBase><ns2:numeroOperacion>000123456789</ns2:numeroOperacion>`))).toEqual({
      ok: true,
      numeroOperacion: "000123456789",
      mensajes: [],
    });
    const fault = parsearRespuestaRegistro(
      `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Client</faultcode><faultstring>Usuario no autorizado</faultstring></soap:Fault></soap:Body></soap:Envelope>`,
    );
    expect(fault).toEqual({ ok: false, mensaje: "Usuario no autorizado" });
    expect(parsearRespuestaRegistro("<html>Error 502</html")).toMatchObject({ ok: false });
  });

  it("consulta: OK con eDocument y número de trámite", () => {
    const r = parsearRespuestaConsulta(
      sobre(
        `<ns2:numeroDeTramite>0500300200125000000012345</ns2:numeroDeTramite><ns2:eDocument>0170251ABCD12</ns2:eDocument>` +
          `<ns2:cadenaOriginal>|0500300200125000000012345|0170251ABCD12|</ns2:cadenaOriginal><ns2:respuestaBase><tieneError>false</tieneError></ns2:respuestaBase>`,
      ),
    );
    expect(r).toEqual({
      estado: "OK",
      eDocument: "0170251ABCD12",
      numeroDeTramite: "0500300200125000000012345",
      cadenaOriginal: "|0500300200125000000012345|0170251ABCD12|",
    });
  });

  it("consulta: pendiente si no hay error ni eDocument", () => {
    expect(parsearRespuestaConsulta(sobre(`<ns2:respuestaBase><tieneError>false</tieneError></ns2:respuestaBase>`))).toEqual({ estado: "PENDIENTE" });
  });

  it("consulta: error con mensajes", () => {
    expect(
      parsearRespuestaConsulta(
        sobre(`<ns2:respuestaBase><tieneError>true</tieneError><error><mensaje>El archivo no es válido</mensaje></error></ns2:respuestaBase>`),
      ),
    ).toEqual({ estado: "ERROR", mensaje: "El archivo no es válido" });
  });
});
