import forge from "node-forge";

// Núcleo de la e.firma (FIEL del SAT). Módulo ISOMÓRFICO: solo usa node-forge, sin APIs de Node
// ni del DOM, porque corre en el navegador (componente Firmador) y en el servidor/pruebas
// (verificación de firmas y simulador). La llave privada NUNCA sale del navegador.
//
// Formato que usa VUCEM: firma RSA PKCS#1 v1.5 con SHA-256 sobre la cadena original en UTF-8,
// en base64; el certificado viaja como el DER del .cer en base64.

export type Bytes = Uint8Array | ArrayBuffer;

export class ErrorFirma extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorFirma";
  }
}

export type InfoCertificado = {
  /** DER del certificado en base64 (lo que se envía como <certificado>). */
  certificadoBase64: string;
  /** Número de serie como lo muestra el SAT (p. ej. "30001000000500003416"). */
  numeroSerie: string;
  /** RFC del titular (x500UniqueIdentifier, parte antes de "/"); null si no lo trae. */
  rfc: string | null;
  /** CURP del titular si el certificado la trae (serialNumber del subject). */
  curp: string | null;
  /** Nombre o razón social del titular (CN). */
  nombre: string;
  vigenteDesde: Date;
  vigenteHasta: Date;
};

export type CertificadoLeido = InfoCertificado & { certificado: forge.pki.Certificate };

const OID_X500_UNIQUE_IDENTIFIER = "2.5.4.45";
const OID_SERIAL_NUMBER = "2.5.4.5";
const OID_COMMON_NAME = "2.5.4.3";

function aBinario(datos: Bytes): string {
  const arreglo = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
  return forge.util.binary.raw.encode(arreglo);
}

function textoPem(binario: string): string | null {
  return binario.startsWith("-----BEGIN") ? binario : null;
}

/** Decodifica el valor de un atributo del subject (UTF8String/BMPString vienen como bytes). */
function valorAtributo(atributo: { value?: unknown; valueTagClass?: number } | undefined): string | null {
  if (!atributo || typeof atributo.value !== "string") return null;
  const valor = atributo.value;
  if (atributo.valueTagClass === forge.asn1.Type.UTF8) {
    try {
      return forge.util.decodeUtf8(valor);
    } catch {
      return valor;
    }
  }
  if (atributo.valueTagClass === forge.asn1.Type.BMPSTRING) {
    let salida = "";
    for (let i = 0; i + 1 < valor.length; i += 2) {
      salida += String.fromCharCode((valor.charCodeAt(i) << 8) | valor.charCodeAt(i + 1));
    }
    return salida;
  }
  return valor;
}

/**
 * El SAT codifica el número de serie como los bytes ASCII de sus dígitos
 * (hex "3330303031…" → "30001…"). Si no es texto imprimible, se regresa el hex en mayúsculas.
 */
export function decodificarNumeroSerie(hex: string): string {
  const limpio = hex.replace(/^0+(?=[0-9a-f]{2})/i, "");
  const par = limpio.length % 2 === 0 ? limpio : `0${limpio}`;
  let texto = "";
  for (let i = 0; i < par.length; i += 2) {
    const codigo = Number.parseInt(par.slice(i, i + 2), 16);
    if (Number.isNaN(codigo) || codigo < 0x20 || codigo > 0x7e) return hex.toUpperCase();
    texto += String.fromCharCode(codigo);
  }
  return texto;
}

function certificadoDesdeBinario(binario: string): forge.pki.Certificate {
  try {
    const pem = textoPem(binario);
    if (pem) return forge.pki.certificateFromPem(pem);
    return forge.pki.certificateFromAsn1(forge.asn1.fromDer(binario));
  } catch {
    throw new ErrorFirma("El archivo .cer no es un certificado válido (se espera el .cer de tu e.firma).");
  }
}

/** Lee el certificado (.cer en DER, o PEM) y extrae los datos que usa VUCEM. */
export function leerCertificado(der: Bytes): CertificadoLeido {
  const binario = aBinario(der);
  const certificado = certificadoDesdeBinario(binario);
  const derFinal = textoPem(binario)
    ? forge.asn1.toDer(forge.pki.certificateToAsn1(certificado)).getBytes()
    : binario;

  const atributos = certificado.subject.attributes;
  const buscar = (oid: string) => valorAtributo(atributos.find((a) => a.type === oid));

  // x500UniqueIdentifier: "RFC" (física) o "RFC_EMPRESA / RFC_REPRESENTANTE" (moral).
  const unico = buscar(OID_X500_UNIQUE_IDENTIFIER);
  const rfc = unico ? unico.split("/")[0].trim().toUpperCase() || null : null;
  // serialNumber: "CURP" (física) o " / CURP_REPRESENTANTE" (moral).
  const serie = buscar(OID_SERIAL_NUMBER);
  const curp = serie ? serie.split("/").map((s) => s.trim()).find((s) => s.length > 0) ?? null : null;

  return {
    certificado,
    certificadoBase64: forge.util.encode64(derFinal),
    numeroSerie: decodificarNumeroSerie(certificado.serialNumber),
    rfc,
    curp,
    nombre: buscar(OID_COMMON_NAME) ?? "",
    vigenteDesde: certificado.validity.notBefore,
    vigenteHasta: certificado.validity.notAfter,
  };
}

export type EstadoVigencia = "VIGENTE" | "AUN_NO_VIGENTE" | "VENCIDO";

export function estadoVigencia(info: Pick<InfoCertificado, "vigenteDesde" | "vigenteHasta">, ahora: Date = new Date()): EstadoVigencia {
  if (ahora.getTime() < info.vigenteDesde.getTime()) return "AUN_NO_VIGENTE";
  if (ahora.getTime() > info.vigenteHasta.getTime()) return "VENCIDO";
  return "VIGENTE";
}

const ERROR_LLAVE = "No se pudo abrir la llave privada: contraseña incorrecta o llave inválida.";

/**
 * Descifra la llave privada del SAT (.key = PKCS#8 cifrado en DER, PBES2 con DES-EDE3-CBC).
 * También acepta PEM "ENCRYPTED PRIVATE KEY".
 */
export function descifrarLlave(llave: Bytes, password: string): forge.pki.rsa.PrivateKey {
  if (!password) throw new ErrorFirma("Escribe la contraseña de la llave privada.");
  const binario = aBinario(llave);
  let llavePrivada: forge.pki.PrivateKey | null = null;
  try {
    const pem = textoPem(binario);
    if (pem) {
      llavePrivada = forge.pki.decryptRsaPrivateKey(pem, password) as forge.pki.PrivateKey | null;
    } else {
      const info = forge.pki.decryptPrivateKeyInfo(forge.asn1.fromDer(binario), password);
      if (info) llavePrivada = forge.pki.privateKeyFromAsn1(info);
    }
  } catch {
    throw new ErrorFirma(ERROR_LLAVE);
  }
  const rsa = llavePrivada as forge.pki.rsa.PrivateKey | null;
  if (!rsa || typeof rsa.sign !== "function" || !rsa.n) throw new ErrorFirma(ERROR_LLAVE);
  return rsa;
}

/** true si la llave privada corresponde al certificado (mismo módulo y exponente). */
export function verificarParLlaveCertificado(
  llave: forge.pki.rsa.PrivateKey,
  certificado: forge.pki.Certificate | CertificadoLeido,
): boolean {
  const cert = "certificado" in certificado ? certificado.certificado : certificado;
  const publica = cert.publicKey as forge.pki.rsa.PublicKey;
  if (!publica?.n || !publica.e) return false;
  return publica.n.equals(llave.n) && publica.e.equals(llave.e);
}

/** Firma la cadena original (UTF-8) con SHA256withRSA (PKCS#1 v1.5). Regresa base64. */
export function firmarCadena(llave: forge.pki.rsa.PrivateKey, cadena: string): string {
  const md = forge.md.sha256.create();
  md.update(cadena, "utf8");
  return forge.util.encode64(llave.sign(md));
}

/** Verifica una firma SHA256withRSA en base64 contra el certificado (DER en base64). */
export function verificarFirma(certificadoBase64: string, cadena: string, firmaBase64: string): boolean {
  try {
    const certificado = forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.util.decode64(certificadoBase64.trim())));
    const publica = certificado.publicKey as forge.pki.rsa.PublicKey;
    const md = forge.md.sha256.create();
    md.update(cadena, "utf8");
    return publica.verify(md.digest().bytes(), forge.util.decode64(firmaBase64.replace(/\s+/g, "")));
  } catch {
    return false;
  }
}

/** Lee el certificado a partir de su DER en base64 (como viaja en el XML). */
export function leerCertificadoBase64(certificadoBase64: string): CertificadoLeido {
  let binario: string;
  try {
    binario = forge.util.decode64(certificadoBase64.replace(/\s+/g, ""));
  } catch {
    throw new ErrorFirma("El certificado no está en base64 válido.");
  }
  return leerCertificado(forge.util.binary.raw.decode(binario));
}
