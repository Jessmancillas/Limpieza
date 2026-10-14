import { z } from "zod";

import { zCorreoOpcional, zRfcOpcional, zTexto, zTextoOpcional } from "@/lib/validacion/comunes";

import {
  CATEGORIAS_TESORERIA,
  CONDICIONES_PAGO,
  CRITICIDADES,
  ESTADOS_RIESGO,
  METODOS_PAGO,
  SERVICIOS_NEGOCIO,
  TIPOS_CAMBIO,
  TIPOS_GESTION,
  TIPOS_TICKET,
  TRATAMIENTOS_RIESGO,
} from "./constantes";
import { pesosACentavos, textoACantidad } from "./dinero";

// Esquemas de los formularios del ERP (servidor). Importes en pesos → centavos.

export const zPesos = (mensaje = "Importe inválido (hasta 2 decimales)") =>
  z.string({ error: mensaje }).transform((v, ctx) => {
    const c = pesosACentavos(v);
    if (c === null || c < 0) {
      ctx.addIssue({ code: "custom", message: mensaje });
      return z.NEVER;
    }
    return c;
  });

export const zPesosPositivos = (mensaje = "Captura un importe mayor a cero") => zPesos(mensaje).refine((v) => v > 0, mensaje);

export const zPesosOpcional = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), zPesos().optional());

export const zCantidadErp = z.string({ error: "Cantidad inválida" }).transform((v, ctx) => {
  const n = textoACantidad(v);
  if (n === null || n <= 0) {
    ctx.addIssue({ code: "custom", message: "Cantidad inválida (mayor a 0, hasta 3 decimales)" });
    return z.NEVER;
  }
  return n;
});

/** Cantidad >= 0 (vacío = 0) para parámetros como stock mínimo. */
export const zCantidadCero = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? "0" : v),
  z.string().transform((v, ctx) => {
    if (v.trim() === "0") return 0;
    const n = textoACantidad(v);
    if (n === null) {
      ctx.addIssue({ code: "custom", message: "Cantidad inválida (hasta 3 decimales)" });
      return z.NEVER;
    }
    return n;
  }),
);

export const zEntero = (min: number, max: number, mensaje = `Número entero entre ${min} y ${max}`) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.coerce.number({ error: mensaje }).int(mensaje).min(min, mensaje).max(max, mensaje));

/** Porcentaje "16" o "2.5" → puntos base. */
export const zPorcentajeBp = (max = 100) =>
  z.string().transform((v, ctx) => {
    const t = v.trim();
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(t) || Number(t) > max) {
      ctx.addIssue({ code: "custom", message: `Porcentaje inválido (0 a ${max}, hasta 2 decimales)` });
      return z.NEVER;
    }
    return Math.round(Number(t) * 100);
  });

export const zFecha = (mensaje = "Fecha inválida") =>
  z.string({ error: mensaje }).trim().regex(/^\d{4}-\d{2}-\d{2}$/, mensaje).transform((v) => new Date(`${v}T00:00:00.000Z`)).refine((d) => !Number.isNaN(d.getTime()), mensaje);

export const zFechaOpcional = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), zFecha().optional());

export const zClave = z
  .string({ error: "La clave es obligatoria" })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9._-]{0,29}$/, "Clave: letras, números, punto, guion (máx. 30)");

export const esquemaProveedor = z.object({
  clave: zClave,
  razonSocial: zTexto(200),
  rfc: zRfcOpcional,
  contacto: zTextoOpcional(120),
  correoElectronico: zCorreoOpcional,
  telefono: zTextoOpcional(30),
  diasCredito: zEntero(0, 365),
  criticidad: z.enum(CRITICIDADES, { error: "Elige la criticidad" }),
  notas: zTextoOpcional(1000),
});

export const esquemaCliente = z.object({
  clave: zClave,
  razonSocial: zTexto(200),
  rfc: zRfcOpcional,
  contacto: zTextoOpcional(120),
  correoElectronico: zCorreoOpcional,
  telefono: zTextoOpcional(30),
  diasCredito: zEntero(0, 365),
  limiteCredito: zPesos(),
  notas: zTextoOpcional(1000),
});

export const esquemaAlmacen = z.object({ clave: zClave, nombre: zTexto(120), ubicacion: zTextoOpcional(200) });

export const esquemaArticulo = z.object({
  sku: zClave,
  nombre: zTexto(200),
  categoria: zTextoOpcional(80),
  unidad: zTexto(20),
  precioVenta: zPesos(),
  tasaIva: zPorcentajeBp(100),
  stockMinimo: zCantidadCero,
  stockMaximo: zCantidadCero,
  demandaAnual: zCantidadCero,
  desviacionDemandaDiaria: zCantidadCero,
  costoOrdenar: zPesos(),
  costoMantener: zPorcentajeBp(100),
  tiempoEntregaDias: zEntero(0, 365),
  proveedorPreferenteId: zTextoOpcional(64),
});

export const esquemaPartidaCompra = z.object({
  articuloId: zTexto(64, "Elige un artículo"),
  cantidad: zCantidadErp,
  costoUnitario: zPesosOpcional,
});

export const esquemaPartidaVenta = z.object({
  articuloId: zTexto(64, "Elige un artículo"),
  cantidad: zCantidadErp,
  precioUnitario: zPesosOpcional,
  descuento: z.preprocess((v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? "0" : v), zPorcentajeBp(100)),
});

export const esquemaOrdenCompra = z.object({
  proveedorId: zTexto(64, "Elige un proveedor"),
  almacenId: zTexto(64, "Elige un almacén"),
  fechaEntrega: zFechaOpcional,
  notas: zTextoOpcional(1000),
});

export const esquemaPedido = z.object({
  clienteId: zTexto(64, "Elige un cliente"),
  almacenId: zTexto(64, "Elige un almacén"),
  condicionPago: z.enum(CONDICIONES_PAGO, { error: "Elige la condición de pago" }),
  notas: zTextoOpcional(1000),
});

export const esquemaAjuste = z.object({
  articuloId: zTexto(64, "Elige un artículo"),
  almacenId: zTexto(64, "Elige un almacén"),
  tipo: z.enum(["AJUSTE_ENTRADA", "AJUSTE_SALIDA", "INVENTARIO_INICIAL"], { error: "Elige el tipo de ajuste" }),
  cantidad: zCantidadErp,
  costoUnitario: zPesosOpcional,
  motivo: zTexto(300, "Explica el motivo del ajuste"),
});

export const esquemaPago = z.object({
  fecha: zFecha(),
  monto: zPesosPositivos(),
  metodo: z.enum(METODOS_PAGO, { error: "Elige el método" }),
  referencia: zTextoOpcional(100),
});

export const esquemaGestion = z.object({
  tipo: z.enum(TIPOS_GESTION, { error: "Elige el tipo de gestión" }),
  nota: zTexto(1000),
  fechaPromesa: zFechaOpcional,
});

export const esquemaTesoreria = z.object({
  tipo: z.enum(["INGRESO", "EGRESO"], { error: "Elige ingreso o egreso" }),
  categoria: z.enum(CATEGORIAS_TESORERIA, { error: "Elige la categoría" }),
  monto: zPesosPositivos(),
  fecha: zFecha(),
  concepto: zTexto(200),
});

export const esquemaFactura = z.object({ folioFactura: zTexto(60, "Captura el folio o UUID de la factura"), importeFactura: zPesosPositivos() });

export const esquemaPoliticas = z.object({
  montoAutoAprobacion: zPesos(),
  montoAprobacionNivel1: zPesos(),
  toleranciaPrecio: zPorcentajeBp(50),
  toleranciaCantidad: zPorcentajeBp(50),
  diasGraciaCredito: zEntero(0, 120),
  puntajeCreditoMinimo: zEntero(0, 100),
  puntajeCreditoRevision: zEntero(0, 100),
  factorServicioZ: zEntero(0, 400),
  tasaIva: zPorcentajeBp(100),
});

export const esquemaControl = z.object({
  aplicable: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  nivelActual: zEntero(0, 5),
  nivelObjetivo: zEntero(0, 5),
  justificacion: zTextoOpcional(500),
  responsable: zTextoOpcional(120),
  evidencia: zTextoOpcional(1000),
});

export const esquemaRiesgo = z.object({
  activo: zTexto(200),
  amenaza: zTexto(300),
  vulnerabilidad: zTexto(300),
  probabilidad: zEntero(1, 5),
  impacto: zEntero(1, 5),
  tratamiento: z.enum(TRATAMIENTOS_RIESGO, { error: "Elige el tratamiento" }),
  controles: zTextoOpcional(500),
  responsable: zTextoOpcional(120),
  probabilidadResidual: z.preprocess((v) => (v === "" ? undefined : v), zEntero(1, 5).optional()),
  impactoResidual: z.preprocess((v) => (v === "" ? undefined : v), zEntero(1, 5).optional()),
  estado: z.enum(ESTADOS_RIESGO, { error: "Elige el estado" }),
});

export const esquemaTicket = z.object({
  tipo: z.enum(TIPOS_TICKET, { error: "Elige el tipo" }),
  servicio: z.enum(SERVICIOS_NEGOCIO, { error: "Elige el servicio" }),
  titulo: zTexto(150),
  descripcion: zTexto(2000),
  impacto: zEntero(1, 3),
  urgencia: zEntero(1, 3),
  tipoCambio: z.preprocess((v) => (v === "" ? undefined : v), z.enum(TIPOS_CAMBIO).optional()),
});
