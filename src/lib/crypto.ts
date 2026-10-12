import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";

function obtenerLlave(): Buffer {
  const b64 = process.env.APP_ENCRYPTION_KEY;
  if (!b64) {
    throw new Error(
      "Falta APP_ENCRYPTION_KEY. Genera una llave de 32 bytes en base64 (ver .env.example).",
    );
  }
  const llave = Buffer.from(b64, "base64");
  if (llave.length !== 32) {
    throw new Error("APP_ENCRYPTION_KEY debe ser de 32 bytes codificados en base64.");
  }
  return llave;
}

/** Cifra texto con AES-256-GCM. Formato: v1:<iv b64>:<tag b64>:<datos b64>. */
export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", obtenerLlave(), iv);
  const datos = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), datos.toString("base64")].join(":");
}

export function descifrar(paquete: string): string {
  const [version, ivB64, tagB64, datosB64] = paquete.split(":");
  if (version !== VERSION || !ivB64 || !tagB64 || datosB64 === undefined) {
    throw new Error("Formato de dato cifrado no reconocido.");
  }
  const decipher = createDecipheriv("aes-256-gcm", obtenerLlave(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(datosB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function sha256Hex(valor: string | Buffer): string {
  return createHash("sha256").update(valor).digest("hex");
}

export function sha1Hex(valor: Buffer): string {
  return createHash("sha1").update(valor).digest("hex");
}

export function tokenAleatorio(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
