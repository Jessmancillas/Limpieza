// Áreas funcionales del ERP y segregación de funciones (ISO/IEC 27001 A.5.3 y A.5.15).
// Funciones puras (sin acceso a base) para poder usarlas en servidor, cliente y pruebas.

import type { Rol } from "@/lib/constantes";

import { AREAS, AREAS_POR_DEFECTO, type Area } from "./constantes";

/** Membresia.areas (texto separado por comas o null) → lista de áreas. */
export function areasDeMembresia(texto: string | null | undefined): Area[] {
  if (texto === null || texto === undefined) return [...AREAS_POR_DEFECTO];
  return texto
    .split(",")
    .map((a) => a.trim())
    .filter((a): a is Area => (AREAS as readonly string[]).includes(a));
}

export function areasATexto(areas: readonly string[]): string {
  return AREAS.filter((a) => areas.includes(a)).join(",");
}

/** ¿Puede operar (modificar) en el área? ADMIN siempre; CONSULTA nunca. */
export function puedeOperar(rol: Rol, areas: readonly Area[], area: Area): boolean {
  if (rol === "ADMIN") return true;
  if (rol === "CONSULTA") return false;
  return areas.includes(area);
}

/**
 * Reglas de incompatibilidad de funciones sobre un mismo documento. Cada una indica qué acción
 * no puede hacer la misma persona que hizo la anterior.
 */
export const REGLAS_SEGREGACION = [
  { id: "OC_ELABORA_APRUEBA", descripcion: "Quien elabora una orden de compra no la aprueba." },
  { id: "OC_APRUEBA_RECIBE", descripcion: "Quien aprueba una orden de compra no registra su recepción." },
  { id: "RECIBE_PAGA", descripcion: "Quien registra la recepción no paga la factura del proveedor." },
  { id: "PEDIDO_CAPTURA_AUTORIZA", descripcion: "Quien captura un pedido a crédito no autoriza la excepción de crédito." },
] as const;
export type ReglaSegregacion = (typeof REGLAS_SEGREGACION)[number]["id"];

export type ResultadoSegregacion = { permitido: boolean; mensaje?: string; advertencia?: string };

/**
 * Evalúa una regla de segregación. Si la política es estricta bloquea; si no, solo advierte
 * (y la acción queda registrada en la bitácora como excepción).
 */
export function verificarSegregacion(
  regla: ReglaSegregacion,
  usuarioId: string,
  responsableAnteriorId: string | null | undefined,
  estricta: boolean,
): ResultadoSegregacion {
  if (!responsableAnteriorId || responsableAnteriorId !== usuarioId) return { permitido: true };
  const texto = `Segregación de funciones: ${REGLAS_SEGREGACION.find((r) => r.id === regla)!.descripcion}`;
  return estricta ? { permitido: false, mensaje: texto } : { permitido: true, advertencia: texto };
}
