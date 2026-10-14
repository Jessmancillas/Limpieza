// Importes en centavos (enteros) y cantidades con hasta 3 decimales.

const formatoMoneda = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const formatoCantidad = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 });
const formatoPorcentaje = new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 1 });

/** 123456 → "$1,234.56" */
export function formatoPesos(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return "—";
  return formatoMoneda.format(centavos / 100);
}

export function formatoNumero(cantidad: number | null | undefined): string {
  if (cantidad === null || cantidad === undefined || !Number.isFinite(cantidad)) return "—";
  return formatoCantidad.format(cantidad);
}

/** 0.256 → "25.6 %" */
export function formatoPct(fraccion: number | null | undefined): string {
  if (fraccion === null || fraccion === undefined || !Number.isFinite(fraccion)) return "—";
  return formatoPorcentaje.format(fraccion);
}

const RE_IMPORTE = /^-?\d{1,13}(\.\d{1,2})?$/;
const RE_CANTIDAD = /^\d{1,12}(\.\d{1,3})?$/;

/** "1,234.5" → 123450. null si no es un importe válido. */
export function pesosACentavos(texto: string | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;
  const limpio = texto.trim().replace(/[$,\s]/g, "");
  if (!RE_IMPORTE.test(limpio)) return null;
  const [enteros, decimales = ""] = limpio.replace("-", "").split(".");
  const valor = Number(enteros) * 100 + Number(decimales.padEnd(2, "0"));
  return limpio.startsWith("-") ? -valor : valor;
}

/** 123450 → "1234.50" (para <input>) */
export function centavosATexto(centavos: number): string {
  const signo = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  return `${signo}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** "12.5" → 12.5; null si no es una cantidad positiva válida (hasta 3 decimales). */
export function textoACantidad(texto: string | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;
  const limpio = texto.trim().replace(/,/g, "");
  if (!RE_CANTIDAD.test(limpio)) return null;
  return redondearCantidad(Number(limpio));
}

export function redondearCantidad(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Aplica una tasa en puntos base a un importe en centavos, redondeando al centavo. */
export function aplicarBp(centavos: number, bp: number): number {
  return Math.round((centavos * bp) / 10_000);
}

/** Importe de una partida: cantidad × precio unitario (centavos), con descuento opcional. */
export function importePartida(cantidad: number, precioUnitario: number, descuentoBp = 0): number {
  const bruto = Math.round(cantidad * precioUnitario);
  return bruto - aplicarBp(bruto, descuentoBp);
}

/** Totales de un documento a partir de sus partidas. El IVA se calcula por partida. */
export function totalesDocumento(
  partidas: Array<{ cantidad: number; precioUnitario: number; tasaIvaBp: number; descuentoBp?: number }>,
): { subtotal: number; iva: number; total: number } {
  let subtotal = 0;
  let iva = 0;
  for (const p of partidas) {
    const importe = importePartida(p.cantidad, p.precioUnitario, p.descuentoBp ?? 0);
    subtotal += importe;
    iva += aplicarBp(importe, p.tasaIvaBp);
  }
  return { subtotal, iva, total: subtotal + iva };
}

/** Días naturales entre dos fechas (b - a), sin fracciones. */
export function diasEntre(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

export function sumarDias(fecha: Date, dias: number): Date {
  return new Date(fecha.getTime() + dias * 86_400_000);
}
