// Resumen legible del campo `detalle` (JSON) de la bitácora. Módulo puro.

const LLAVES_SENSIBLES = /pass|contrase|token|secret|llave|privad|cookie/i;

function valorCorto(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "boolean") return valor ? "sí" : "no";
  if (Array.isArray(valor)) return valor.map(valorCorto).join(", ");
  if (typeof valor === "object") {
    const obj = valor as Record<string, unknown>;
    // Formato {antes, despues} que usan los cambios de catálogos.
    if ("antes" in obj && "despues" in obj) return `${valorCorto(obj.antes)} → ${valorCorto(obj.despues)}`;
    return Object.entries(obj)
      .map(([k, v]) => `${k}: ${LLAVES_SENSIBLES.test(k) ? "[oculto]" : valorCorto(v)}`)
      .join(", ");
  }
  return String(valor);
}

/** "clave: valor; clave: valor" truncado a `max` caracteres; oculta llaves que parezcan secretos. */
export function resumirDetalle(detalle: string | null | undefined, max = 180): string {
  if (!detalle) return "";
  let texto: string;
  try {
    const datos: unknown = JSON.parse(detalle);
    if (datos && typeof datos === "object" && !Array.isArray(datos)) {
      texto = Object.entries(datos as Record<string, unknown>)
        .map(([k, v]) => `${k}: ${LLAVES_SENSIBLES.test(k) ? "[oculto]" : valorCorto(v)}`)
        .join("; ");
    } else {
      texto = valorCorto(datos);
    }
  } catch {
    texto = detalle;
  }
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}
