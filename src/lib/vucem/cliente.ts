import "server-only";

import type { AmbienteVucem } from "@/lib/constantes";

import { validarUrlEnvio } from "./urls";

// Cliente HTTP de los servicios SOAP de VUCEM (solo servidor).

export const TIEMPO_ESPERA_MS = 60_000;

export type RespuestaSoap = { httpStatus: number; cuerpo: string };

export class ErrorEnvioVucem extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorEnvioVucem";
  }
}

const MENSAJES_RED: Record<string, string> = {
  ENOTFOUND: "No se encontró el servidor (revisa la URL o tu conexión a internet).",
  EAI_AGAIN: "No se pudo resolver el nombre del servidor (DNS). Intenta de nuevo en unos minutos.",
  ECONNREFUSED: "El servidor rechazó la conexión.",
  ECONNRESET: "La conexión se cortó mientras se esperaba la respuesta.",
  ETIMEDOUT: "El servidor no respondió a tiempo.",
  UND_ERR_CONNECT_TIMEOUT: "El servidor no respondió a tiempo al conectar.",
  CERT_HAS_EXPIRED: "El certificado TLS del servidor está vencido.",
  DEPTH_ZERO_SELF_SIGNED_CERT: "El certificado TLS del servidor no es de confianza (autofirmado).",
  SELF_SIGNED_CERT_IN_CHAIN: "El certificado TLS del servidor no es de confianza.",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "No se pudo verificar el certificado TLS del servidor.",
};

function mensajeDeError(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") {
    return `VUCEM no respondió en ${TIEMPO_ESPERA_MS / 1000} segundos. Revisa más tarde si la operación quedó registrada antes de reintentar.`;
  }
  const causa = (error as { cause?: { code?: string; message?: string } })?.cause;
  const codigo = causa?.code ?? (error as { code?: string })?.code;
  if (codigo && MENSAJES_RED[codigo]) return `No se pudo conectar con VUCEM: ${MENSAJES_RED[codigo]}`;
  const detalle = causa?.message ?? (error instanceof Error ? error.message : String(error));
  return `No se pudo conectar con VUCEM (${detalle}).`;
}

/**
 * POST de un sobre SOAP 1.1. Regresa el estado HTTP y el cuerpo tal cual (un SOAP Fault llega
 * con HTTP 500 y también se regresa). Lanza ErrorEnvioVucem en errores de red o URL no permitida.
 */
export async function enviarSoap(
  url: string,
  xml: string,
  soapAction: string | null | undefined,
  opciones: { ambiente: AmbienteVucem; timeoutMs?: number },
): Promise<RespuestaSoap> {
  const problemaUrl = validarUrlEnvio(url, opciones.ambiente);
  if (problemaUrl) throw new ErrorEnvioVucem(problemaUrl);

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), opciones.timeoutMs ?? TIEMPO_ESPERA_MS);
  try {
    const respuesta = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        Accept: "text/xml, application/soap+xml, */*",
        SOAPAction: `"${soapAction ?? ""}"`,
      },
      body: xml,
      signal: controlador.signal,
      cache: "no-store",
      // Una redirección podría llevar el XML (con la contraseña) a otro servidor: no se sigue.
      redirect: "manual",
    });
    const cuerpo = await respuesta.text();
    if (respuesta.status >= 300 && respuesta.status < 400) {
      throw new ErrorEnvioVucem(
        `VUCEM respondió con una redirección (HTTP ${respuesta.status}${respuesta.headers.get("location") ? ` a ${respuesta.headers.get("location")}` : ""}). Revisa la URL configurada.`,
      );
    }
    return { httpStatus: respuesta.status, cuerpo };
  } catch (e) {
    if (e instanceof ErrorEnvioVucem) throw e;
    throw new ErrorEnvioVucem(mensajeDeError(e));
  } finally {
    clearTimeout(temporizador);
  }
}
