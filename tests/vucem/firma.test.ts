import { createVerify } from "node:crypto";

import forge from "node-forge";
import { describe, expect, it } from "vitest";

import {
  decodificarNumeroSerie,
  descifrarLlave,
  ErrorFirma,
  estadoVigencia,
  firmarCadena,
  leerCertificado,
  leerCertificadoBase64,
  verificarFirma,
  verificarParLlaveCertificado,
} from "@/lib/firma/firmar";

import { PASSWORD_LLAVE, leerFixture } from "./fabrica";

const cer = new Uint8Array(leerFixture("efirma-prueba.cer"));
const key = new Uint8Array(leerFixture("efirma-prueba.key"));

describe("leerCertificado", () => {
  it("extrae RFC, CURP, nombre, serie SAT y vigencia", () => {
    const info = leerCertificado(cer);
    expect(info.rfc).toBe("DME200101AB1");
    expect(info.curp).toBe("XAXX010101HDFRRR01");
    expect(info.nombre).toBe("EMPRESA DEMO DE PRUEBA SA DE CV");
    expect(info.numeroSerie).toBe("30001000000500003416");
    expect(info.vigenteDesde.getTime()).toBeLessThan(info.vigenteHasta.getTime());
    expect(estadoVigencia(info, new Date(info.vigenteDesde.getTime() + 1000))).toBe("VIGENTE");
    expect(estadoVigencia(info, new Date(info.vigenteHasta.getTime() + 1000))).toBe("VENCIDO");
    expect(estadoVigencia(info, new Date(info.vigenteDesde.getTime() - 1000))).toBe("AUN_NO_VIGENTE");
    // El base64 es exactamente el DER del .cer.
    expect(Buffer.from(info.certificadoBase64, "base64").equals(Buffer.from(cer))).toBe(true);
  });

  it("acepta ArrayBuffer y base64, y el PEM da el mismo DER", () => {
    const desdeBuffer = leerCertificado(cer.slice().buffer);
    expect(desdeBuffer.rfc).toBe("DME200101AB1");
    expect(leerCertificadoBase64(desdeBuffer.certificadoBase64).numeroSerie).toBe("30001000000500003416");
    const pem = forge.pki.certificateToPem(desdeBuffer.certificado);
    expect(leerCertificado(new TextEncoder().encode(pem)).certificadoBase64).toBe(desdeBuffer.certificadoBase64);
  });

  it("rechaza archivos que no son certificados", () => {
    expect(() => leerCertificado(new TextEncoder().encode("no soy un certificado"))).toThrow(ErrorFirma);
  });

  it("decodifica series ASCII y deja en hex las que no lo son", () => {
    expect(decodificarNumeroSerie("3330303031")).toBe("30001");
    expect(decodificarNumeroSerie("00ff10")).toBe("00FF10");
  });
});

describe("descifrarLlave", () => {
  it("descifra la llave PKCS#8 (PBES2 DES-EDE3-CBC) y corresponde al certificado", () => {
    const llave = descifrarLlave(key, PASSWORD_LLAVE);
    expect(verificarParLlaveCertificado(llave, leerCertificado(cer))).toBe(true);
  });

  it("descifra también la variante con PRF hmacWithSHA1 (como las .key del SAT)", () => {
    const llave = descifrarLlave(new Uint8Array(leerFixture("efirma-prueba-sha1prf.key")), PASSWORD_LLAVE);
    expect(verificarParLlaveCertificado(llave, leerCertificado(cer).certificado)).toBe(true);
  });

  it("contraseña incorrecta → error claro", () => {
    expect(() => descifrarLlave(key, "incorrecta")).toThrow(/contraseña incorrecta o llave inválida/);
    expect(() => descifrarLlave(key, "")).toThrow(ErrorFirma);
    expect(() => descifrarLlave(new Uint8Array([1, 2, 3]), PASSWORD_LLAVE)).toThrow(/contraseña incorrecta o llave inválida/);
  });

  it("detecta una llave que no corresponde al certificado", () => {
    const otra = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
    expect(verificarParLlaveCertificado(otra.privateKey, leerCertificado(cer))).toBe(false);
  });
});

describe("firmarCadena / verificarFirma", () => {
  const llave = descifrarLlave(key, PASSWORD_LLAVE);
  const { certificadoBase64 } = leerCertificado(cer);
  const cadena = "|DME200101AB1|permisos@ejemplo.mx|123|Licencia sanitaria Ñandú|DME200101AB1|e598327f0247fb4ded946aa49dea69b8ce654aab|";

  it("firma SHA256withRSA en base64 (344 caracteres con RSA-2048) verificable con OpenSSL/Node", () => {
    const firma = firmarCadena(llave, cadena);
    expect(firma).toHaveLength(344);
    expect(verificarFirma(certificadoBase64, cadena, firma)).toBe(true);
    const pem = forge.pki.certificateToPem(leerCertificado(cer).certificado);
    const verificador = createVerify("RSA-SHA256");
    verificador.update(Buffer.from(cadena, "utf8"));
    expect(verificador.verify(pem, firma, "base64")).toBe(true);
  });

  it("no verifica si cambia la cadena, la firma o el certificado", () => {
    const firma = firmarCadena(llave, cadena);
    expect(verificarFirma(certificadoBase64, `${cadena} `, firma)).toBe(false);
    expect(verificarFirma(certificadoBase64, cadena, `A${firma.slice(1)}`)).toBe(false);
    expect(verificarFirma("no-es-base64", cadena, firma)).toBe(false);
  });

  it("una firma con SHA-1 no verifica", () => {
    const md = forge.md.sha1.create();
    md.update(cadena, "utf8");
    const firmaSha1 = forge.util.encode64(llave.sign(md));
    expect(verificarFirma(certificadoBase64, cadena, firmaSha1)).toBe(false);
  });
});
