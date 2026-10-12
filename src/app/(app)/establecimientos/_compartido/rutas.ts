/**
 * Ruta interna segura para regresar después de guardar (parámetro ?volver=). Evita redirecciones
 * abiertas: solo rutas relativas a la app ("/productos/nuevo"), nunca "//dominio" ni URLs absolutas.
 */
export function rutaVolverSegura(volver: unknown): string | null {
  if (typeof volver !== "string") return null;
  const v = volver.trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\") || v.length > 500) return null;
  // Sin caracteres de control (los navegadores los eliminan y "/\t/sitio" se volvería "//sitio").
  for (const c of v) if (c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f) return null;
  return v;
}
