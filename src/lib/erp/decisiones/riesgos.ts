// Evaluación de riesgos de seguridad de la información (ISO/IEC 27001:2022 cláusula 6.1.2 y
// 8.2, ISO/IEC 27005). Matriz probabilidad × impacto de 5 × 5.

export type NivelRiesgo = "BAJO" | "MEDIO" | "ALTO" | "CRITICO";

/** Riesgos por encima de este valor (p × i) superan el apetito de riesgo y deben tratarse. */
export const APETITO_RIESGO = 9;

export function valorRiesgo(probabilidad: number, impacto: number): number {
  const p = Math.min(5, Math.max(1, Math.round(probabilidad)));
  const i = Math.min(5, Math.max(1, Math.round(impacto)));
  return p * i;
}

export function nivelRiesgo(valor: number): NivelRiesgo {
  if (valor <= 4) return "BAJO";
  if (valor <= APETITO_RIESGO) return "MEDIO";
  if (valor <= 16) return "ALTO";
  return "CRITICO";
}

export const INFO_NIVEL_RIESGO: Record<NivelRiesgo, { tratamiento: string; plazoDias: number }> = {
  BAJO: { tratamiento: "Aceptar y monitorear en la revisión anual.", plazoDias: 365 },
  MEDIO: { tratamiento: "Aceptar con aprobación del dueño del riesgo o mitigar con controles existentes.", plazoDias: 180 },
  ALTO: { tratamiento: "Mitigar: implementar controles del Anexo A en el plan de tratamiento.", plazoDias: 90 },
  CRITICO: { tratamiento: "Mitigar o evitar de inmediato; informar a la dirección.", plazoDias: 30 },
};

/**
 * Valida la decisión de tratamiento: aceptar un riesgo por encima del apetito requiere a un
 * administrador (dueño del riesgo a nivel dirección).
 */
export function validarTratamiento(valor: number, tratamiento: string, esAdmin: boolean): string | null {
  if (tratamiento === "ACEPTAR" && valor > APETITO_RIESGO && !esAdmin) {
    return "Solo un administrador puede aceptar un riesgo que supera el apetito de riesgo.";
  }
  return null;
}
