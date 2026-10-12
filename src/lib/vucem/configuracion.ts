import "server-only";

import { AMBIENTES_VUCEM, type AmbienteVucem } from "@/lib/constantes";
import { db } from "@/lib/db";

import { URL_DIGITALIZACION_PRODUCCION } from "./digitalizacion";
import { NAMESPACE_260211_MANUAL } from "./solicitud-260211";
import { urlSimulador } from "./urls";

/** Operación por omisión en el simulador (el manual solo dice "nombreDelServicio"). */
export const OPERACION_SIMULADOR = "registrarSolicitud260211";

type RegistroConfig = {
  ambiente: string;
  urlSolicitud: string | null;
  operacionSolicitud: string | null;
  namespaceSolicitud: string | null;
  soapActionSolicitud: string | null;
  urlDigitalizacion: string | null;
  correoDigitalizacion: string | null;
  actualizadoEn?: Date;
};

export type ConfiguracionVucemEfectiva = {
  ambiente: AmbienteVucem;
  urlSolicitud: string | null;
  operacionSolicitud: string | null;
  namespaceSolicitud: string;
  soapActionSolicitud: string | null;
  urlDigitalizacion: string | null;
  correoDigitalizacion: string;
  /** Lo que falta para poder enviar la solicitud 260211 (vacío = listo). */
  faltantesSolicitud: string[];
  /** Lo que falta para poder digitalizar (vacío = listo). */
  faltantesDigitalizacion: string[];
  guardada: boolean;
  actualizadoEn: Date | null;
};

export function esAmbiente(valor: string): valor is AmbienteVucem {
  return (AMBIENTES_VUCEM as readonly string[]).includes(valor);
}

/**
 * Configuración que realmente se usa: en SIMULADOR las URLs apuntan al simulador interno; la URL
 * de digitalización es la oficial de producción si no se configuró otra; el correo de
 * digitalización es el de la empresa si no se configuró otro.
 */
export function configuracionEfectiva(registro: RegistroConfig | null, correoEmpresa: string): ConfiguracionVucemEfectiva {
  const ambiente: AmbienteVucem = registro && esAmbiente(registro.ambiente) ? registro.ambiente : "SIMULADOR";
  const simulador = ambiente === "SIMULADOR";
  const limpio = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

  const urlSolicitud = simulador ? urlSimulador("solicitud") : limpio(registro?.urlSolicitud);
  const operacionSolicitud = limpio(registro?.operacionSolicitud) ?? (simulador ? OPERACION_SIMULADOR : null);
  const urlDigitalizacion = simulador
    ? urlSimulador("digitalizacion")
    : limpio(registro?.urlDigitalizacion) ?? (ambiente === "PRODUCCION" ? URL_DIGITALIZACION_PRODUCCION : null);
  const correoDigitalizacion = limpio(registro?.correoDigitalizacion) ?? correoEmpresa;

  const faltantesSolicitud: string[] = [];
  if (!urlSolicitud) faltantesSolicitud.push("la URL del WS 260211");
  if (!operacionSolicitud) faltantesSolicitud.push("el nombre de la operación del WS 260211");
  const faltantesDigitalizacion: string[] = [];
  if (!urlDigitalizacion) faltantesDigitalizacion.push("la URL del servicio de digitalización");
  if (!correoDigitalizacion) faltantesDigitalizacion.push("el correo para digitalización");

  return {
    ambiente,
    urlSolicitud,
    operacionSolicitud,
    namespaceSolicitud: limpio(registro?.namespaceSolicitud) ?? NAMESPACE_260211_MANUAL,
    soapActionSolicitud: limpio(registro?.soapActionSolicitud),
    urlDigitalizacion,
    correoDigitalizacion,
    faltantesSolicitud,
    faltantesDigitalizacion,
    guardada: registro !== null,
    actualizadoEn: registro?.actualizadoEn ?? null,
  };
}

export async function obtenerConfiguracionVucem(empresaId: string): Promise<ConfiguracionVucemEfectiva> {
  const [registro, empresa] = await Promise.all([
    db.configuracionVucem.findUnique({ where: { empresaId } }),
    db.empresa.findUniqueOrThrow({ where: { id: empresaId }, select: { correoElectronico: true } }),
  ]);
  return configuracionEfectiva(registro, empresa.correoElectronico);
}
