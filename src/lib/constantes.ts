// Valores permitidos para los campos "enum" guardados como texto en la base de datos.
// Mantener sincronizado con los comentarios de prisma/schema.prisma.

export const ROLES = ["ADMIN", "CAPTURISTA", "CONSULTA"] as const;
export type Rol = (typeof ROLES)[number];
export const ETIQUETA_ROL: Record<Rol, string> = {
  ADMIN: "Administrador",
  CAPTURISTA: "Capturista",
  CONSULTA: "Solo consulta",
};

export const TIPOS_PERSONA = ["MORAL", "FISICA"] as const;
export type TipoPersona = (typeof TIPOS_PERSONA)[number];
/** Valor que espera el WS 260211: 0 = física, 1 = moral. */
export const TIPO_PERSONA_WS: Record<TipoPersona, "0" | "1"> = { FISICA: "0", MORAL: "1" };

export const TIPOS_TERCERO = ["FABRICANTE", "PROVEEDOR", "DESTINATARIO", "FACTURADOR"] as const;
export type TipoTercero = (typeof TIPOS_TERCERO)[number];
export const ETIQUETA_TIPO_TERCERO: Record<TipoTercero, string> = {
  FABRICANTE: "Fabricante",
  PROVEEDOR: "Proveedor",
  DESTINATARIO: "Destinatario (destino final)",
  FACTURADOR: "Facturador",
};

export const NACIONALIDADES = ["NACIONAL", "EXTRANJERO"] as const;
export type Nacionalidad = (typeof NACIONALIDADES)[number];

/** Tipos de documento / requisito del trámite 260211. */
export const TIPOS_DOCUMENTO = [
  "LICENCIA_SANITARIA",
  "AVISO_FUNCIONAMIENTO",
  "AVISO_RESPONSABLE",
  "REGISTRO_SANITARIO",
  "MARBETE",
  "PAGO_DERECHOS",
  "PERMISO_CNSNS",
  "OTRO",
] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];
export const ETIQUETA_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  LICENCIA_SANITARIA: "Licencia sanitaria",
  AVISO_FUNCIONAMIENTO: "Aviso de funcionamiento",
  AVISO_RESPONSABLE: "Aviso de responsable sanitario",
  REGISTRO_SANITARIO: "Registro sanitario y sus modificaciones",
  MARBETE: "Proyecto de marbete / etiqueta",
  PAGO_DERECHOS: "Comprobante de pago de derechos",
  PERMISO_CNSNS: "Permiso CNSNS (fuentes de radiación)",
  OTRO: "Otro",
};

export const ESTADOS_CONVERSION = ["PENDIENTE", "OK", "ADVERTENCIA", "ERROR"] as const;
export type EstadoConversion = (typeof ESTADOS_CONVERSION)[number];

export const ESTADOS_EDOCUMENT = ["NO_ENVIADO", "PENDIENTE", "OK", "ERROR"] as const;
export type EstadoEDocument = (typeof ESTADOS_EDOCUMENT)[number];

export const ESTADOS_SOLICITUD = [
  "BORRADOR",
  "LISTA",
  "PRESENTADA",
  "REQUERIMIENTO",
  "RESUELTA_ACEPTADA",
  "RESUELTA_RECHAZADA",
  "RESUELTA_PARCIAL",
  "CANCELADA",
] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];
export const ETIQUETA_ESTADO_SOLICITUD: Record<EstadoSolicitud, string> = {
  BORRADOR: "Borrador",
  LISTA: "Lista para presentar",
  PRESENTADA: "Presentada",
  REQUERIMIENTO: "Con requerimiento",
  RESUELTA_ACEPTADA: "Resuelta: aceptada",
  RESUELTA_RECHAZADA: "Resuelta: rechazada",
  RESUELTA_PARCIAL: "Resuelta: parcial",
  CANCELADA: "Cancelada",
};

export const SENTIDOS_RESOLUCION = ["ACEPTADA", "RECHAZADA", "PARCIAL"] as const;
export type SentidoResolucion = (typeof SENTIDOS_RESOLUCION)[number];

export const CANALES_PRESENTACION = ["WS", "PORTAL"] as const;
export type CanalPresentacion = (typeof CANALES_PRESENTACION)[number];

export const AMBIENTES_VUCEM = ["SIMULADOR", "PRUEBAS", "PRODUCCION"] as const;
export type AmbienteVucem = (typeof AMBIENTES_VUCEM)[number];

export const TIPOS_ENVIO_VUCEM = [
  "SOLICITUD_260211",
  "DIGITALIZACION_REGISTRO",
  "DIGITALIZACION_CONSULTA",
] as const;
export type TipoEnvioVucem = (typeof TIPOS_ENVIO_VUCEM)[number];

/** Catálogos VUCEM/SAT usados por el trámite 260211 (nombres del manual). */
export const CATALOGOS = {
  CAT_ADUANA: "Aduanas",
  CAT_REGIMEN: "Regímenes",
  CAT_PAIS: "Países",
  CAT_ENTIDAD: "Entidades federativas",
  CAT_SCIAN: "SCIAN",
  CAT_CLASIF_PRODUCTO: "Clasificación del producto",
  CAT_SUBCLASIF_PRODUCTO: "Subclasificación del producto",
  CAT_TIPO_PRODUCTO: "Tipo de producto",
  CAT_FORMA_FARMACEUTICA: "Forma farmacéutica",
  CAT_ESTADO_FISICO: "Estado físico",
  CAT_USO_ESPECIFICO: "Uso específico",
  CAT_UNIDAD_MEDIDA: "Unidades de medida",
  CAT_BANCO: "Bancos (pago de derechos)",
  CAT_TIPO_DOCUMENTO: "Tipos de documento (digitalización)",
} as const;
export type Catalogo = keyof typeof CATALOGOS;
