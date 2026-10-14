// Valores permitidos de los campos "enum" del ERP (guardados como texto, igual que el resto del
// esquema). Mantener sincronizado con los comentarios de prisma/schema.prisma.

/** Áreas funcionales: base de la segregación de funciones (ISO/IEC 27001 A.5.3, COBIT DSS06). */
export const AREAS = ["COMPRAS", "ALMACEN", "VENTAS", "COBRANZA", "FINANZAS", "APROBADOR", "GOBIERNO"] as const;
export type Area = (typeof AREAS)[number];
export const ETIQUETA_AREA: Record<Area, string> = {
  COMPRAS: "Compras",
  ALMACEN: "Almacén",
  VENTAS: "Ventas",
  COBRANZA: "Cobranza",
  FINANZAS: "Finanzas",
  APROBADOR: "Aprobador (OC y crédito)",
  GOBIERNO: "Gobierno, riesgo y cumplimiento",
};
export const ETIQUETA_AREA_CORTA: Record<Area, string> = {
  COMPRAS: "Compras",
  ALMACEN: "Almacén",
  VENTAS: "Ventas",
  COBRANZA: "Cobranza",
  FINANZAS: "Finanzas",
  APROBADOR: "Aprobador",
  GOBIERNO: "Gobierno",
};
/** Áreas que tiene un usuario sin restricción explícita (Membresia.areas = null). */
export const AREAS_POR_DEFECTO: Area[] = ["COMPRAS", "ALMACEN", "VENTAS", "COBRANZA", "FINANZAS"];

export const ESTADOS_OC = ["BORRADOR", "POR_APROBAR", "APROBADA", "RECIBIDA_PARCIAL", "RECIBIDA", "RECHAZADA", "CANCELADA"] as const;
export type EstadoOC = (typeof ESTADOS_OC)[number];
export const ETIQUETA_ESTADO_OC: Record<EstadoOC, string> = {
  BORRADOR: "Borrador",
  POR_APROBAR: "Por aprobar",
  APROBADA: "Aprobada",
  RECIBIDA_PARCIAL: "Recibida parcial",
  RECIBIDA: "Recibida",
  RECHAZADA: "Rechazada",
  CANCELADA: "Cancelada",
};

export const ESTADOS_PROVEEDOR = ["ACTIVO", "EN_EVALUACION", "BLOQUEADO"] as const;
export type EstadoProveedor = (typeof ESTADOS_PROVEEDOR)[number];
export const CRITICIDADES = ["CRITICO", "ESTRATEGICO", "NORMAL"] as const;
export type Criticidad = (typeof CRITICIDADES)[number];

export const CONCILIACIONES = ["OK", "DIFERENCIA_PRECIO", "DIFERENCIA_CANTIDAD", "SIN_FACTURA"] as const;
export type Conciliacion = (typeof CONCILIACIONES)[number];
export const ETIQUETA_CONCILIACION: Record<Conciliacion, string> = {
  OK: "Conciliada",
  DIFERENCIA_PRECIO: "Diferencia de precio",
  DIFERENCIA_CANTIDAD: "Diferencia de cantidad",
  SIN_FACTURA: "Sin factura",
};

export const TIPOS_MOVIMIENTO = ["ENTRADA_COMPRA", "SALIDA_VENTA", "AJUSTE_ENTRADA", "AJUSTE_SALIDA", "INVENTARIO_INICIAL"] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];
export const ETIQUETA_MOVIMIENTO: Record<TipoMovimiento, string> = {
  ENTRADA_COMPRA: "Entrada por compra",
  SALIDA_VENTA: "Salida por venta",
  AJUSTE_ENTRADA: "Ajuste (entrada)",
  AJUSTE_SALIDA: "Ajuste (salida)",
  INVENTARIO_INICIAL: "Inventario inicial",
};

export const ESTADOS_PEDIDO = ["BORRADOR", "POR_AUTORIZAR", "CONFIRMADO", "ENTREGADO", "CANCELADO"] as const;
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];
export const ETIQUETA_ESTADO_PEDIDO: Record<EstadoPedido, string> = {
  BORRADOR: "Borrador",
  POR_AUTORIZAR: "Por autorizar (crédito)",
  CONFIRMADO: "Confirmado",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};
export const CONDICIONES_PAGO = ["CONTADO", "CREDITO"] as const;
export type CondicionPago = (typeof CONDICIONES_PAGO)[number];

export const ESTADOS_CXP = ["PENDIENTE", "BLOQUEADA", "PARCIAL", "PAGADA", "CANCELADA"] as const;
export type EstadoCxP = (typeof ESTADOS_CXP)[number];
export const ESTADOS_CXC = ["PENDIENTE", "PARCIAL", "PAGADA", "INCOBRABLE", "CANCELADA"] as const;
export type EstadoCxC = (typeof ESTADOS_CXC)[number];

export const METODOS_PAGO = ["TRANSFERENCIA", "CHEQUE", "EFECTIVO", "TARJETA"] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

export const TIPOS_GESTION = ["RECORDATORIO", "LLAMADA", "CORREO", "VISITA", "PROMESA_PAGO", "SUSPENSION", "JURIDICO"] as const;
export type TipoGestion = (typeof TIPOS_GESTION)[number];
export const ETIQUETA_GESTION: Record<TipoGestion, string> = {
  RECORDATORIO: "Recordatorio",
  LLAMADA: "Llamada",
  CORREO: "Correo",
  VISITA: "Visita",
  PROMESA_PAGO: "Promesa de pago",
  SUSPENSION: "Suspensión de crédito",
  JURIDICO: "Turnado a jurídico",
};

export const CATEGORIAS_TESORERIA = ["COBRO_CLIENTE", "PAGO_PROVEEDOR", "NOMINA", "IMPUESTOS", "SERVICIOS", "OTRO"] as const;
export type CategoriaTesoreria = (typeof CATEGORIAS_TESORERIA)[number];
export const ETIQUETA_CATEGORIA_TESORERIA: Record<CategoriaTesoreria, string> = {
  COBRO_CLIENTE: "Cobro a cliente",
  PAGO_PROVEEDOR: "Pago a proveedor",
  NOMINA: "Nómina",
  IMPUESTOS: "Impuestos",
  SERVICIOS: "Servicios",
  OTRO: "Otro",
};

// ── Gobierno ──
export const MARCOS = ["COBIT", "ISO27001"] as const;
export type Marco = (typeof MARCOS)[number];

export const TIPOS_TICKET = ["INCIDENTE", "PROBLEMA", "SOLICITUD", "CAMBIO"] as const;
export type TipoTicket = (typeof TIPOS_TICKET)[number];
export const ETIQUETA_TIPO_TICKET: Record<TipoTicket, string> = {
  INCIDENTE: "Incidente",
  PROBLEMA: "Problema",
  SOLICITUD: "Solicitud de servicio",
  CAMBIO: "Cambio",
};
export const TIPOS_CAMBIO = ["ESTANDAR", "NORMAL", "EMERGENCIA"] as const;
export type TipoCambio = (typeof TIPOS_CAMBIO)[number];
export const ESTADOS_TICKET = ["NUEVO", "EN_PROCESO", "PENDIENTE_APROBACION", "APROBADO", "RESUELTO", "CERRADO", "RECHAZADO"] as const;
export type EstadoTicket = (typeof ESTADOS_TICKET)[number];
export const ETIQUETA_ESTADO_TICKET: Record<EstadoTicket, string> = {
  NUEVO: "Nuevo",
  EN_PROCESO: "En proceso",
  PENDIENTE_APROBACION: "Pendiente de aprobación (CAB)",
  APROBADO: "Aprobado",
  RESUELTO: "Resuelto",
  CERRADO: "Cerrado",
  RECHAZADO: "Rechazado",
};
export const SERVICIOS_NEGOCIO = ["COMPRAS", "ALMACEN", "VENTAS", "COBRANZA", "FINANZAS", "TI"] as const;
export type ServicioNegocio = (typeof SERVICIOS_NEGOCIO)[number];

export const TRATAMIENTOS_RIESGO = ["MITIGAR", "ACEPTAR", "TRANSFERIR", "EVITAR"] as const;
export type TratamientoRiesgo = (typeof TRATAMIENTOS_RIESGO)[number];
export const ESTADOS_RIESGO = ["ABIERTO", "EN_TRATAMIENTO", "CERRADO"] as const;
export type EstadoRiesgo = (typeof ESTADOS_RIESGO)[number];

/** true si `valor` está en la lista (para validar textos de formularios). */
export function enLista<T extends string>(lista: readonly T[], valor: unknown): valor is T {
  return typeof valor === "string" && (lista as readonly string[]).includes(valor);
}
