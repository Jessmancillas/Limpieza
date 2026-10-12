import type { AmbienteVucem } from "@/lib/constantes";

// Reglas de URL de los servicios web (módulo puro; lo usan la configuración, el cliente SOAP y
// las pruebas).

export const RUTA_SIMULADOR = "/api/vucem-simulador";
export type ServicioSimulador = "digitalizacion" | "solicitud";

/** URL base de la app (para calcular las URLs del simulador interno). */
export function urlBaseApp(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").trim().replace(/\/+$/, "");
}

export function urlSimulador(servicio: ServicioSimulador): string {
  return `${urlBaseApp()}${RUTA_SIMULADOR}/${servicio}`;
}

export const AYUDA_AMBIENTE: Record<AmbienteVucem, string> = {
  SIMULADOR:
    "Simulador interno de esta app para practicar el flujo completo (firma, digitalización y envío) sin tocar VUCEM. Los folios y eDocuments que genera NO son reales.",
  PRUEBAS:
    "Ambiente de pruebas de VUCEM (si la Mesa de Ayuda te dio acceso). Requiere las URLs https que te proporcionen y tu contraseña de servicios web.",
  PRODUCCION:
    "VUCEM real: las solicitudes enviadas quedan presentadas ante COFEPRIS con folio oficial y efectos legales.",
};

/**
 * null si la URL es aceptable para el ambiente; si no, el motivo.
 * SIMULADOR: solo el simulador interno. PRUEBAS/PRODUCCION: solo https://.
 */
export function validarUrlEnvio(url: string, ambiente: AmbienteVucem): string | null {
  let analizada: URL;
  try {
    analizada = new URL(url);
  } catch {
    return `La URL «${url}» no es válida.`;
  }
  if (analizada.username || analizada.password) return "La URL no debe incluir usuario ni contraseña.";
  if (ambiente === "SIMULADOR") {
    const base = new URL(`${urlBaseApp()}${RUTA_SIMULADOR}/`);
    const permitida = analizada.origin === base.origin && analizada.pathname.startsWith(base.pathname);
    return permitida ? null : `En modo SIMULADOR solo se puede enviar al simulador interno (${base.href}).`;
  }
  if (analizada.protocol !== "https:") return "La URL de VUCEM debe empezar con https://.";
  return null;
}
