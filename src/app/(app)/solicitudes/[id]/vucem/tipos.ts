// Tipos compartidos entre las server actions y los componentes cliente de /solicitudes/[id]/vucem.

export type ResultadoAccion = { ok: boolean; mensaje: string; detalles?: string[] };

export type CadenaDocumento = { documentoId: string; nombre: string; cadena: string };

export type ResultadoPreparacion =
  | { ok: true; rfcFirmante: string; documentos: CadenaDocumento[]; omitidos: Array<{ nombre: string; motivo: string }> }
  | { ok: false; mensaje: string };

export type ResultadoPorDocumento = { documentoId: string; nombre: string; ok: boolean; mensaje: string };

export type ResultadoDigitalizacion = ResultadoAccion & { resultados: ResultadoPorDocumento[] };

export type ResultadoConsultaEstado = ResultadoAccion & { pendientes: number; resultados: ResultadoPorDocumento[] };

export type ResultadoEnvio = ResultadoAccion & { folio?: string };
