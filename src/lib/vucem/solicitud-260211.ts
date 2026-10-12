// Petición del WS 260211 (Permiso sanitario de importación de dispositivos médicos con registro
// sanitario y/o fuentes de radiación) según el Manual WS 260211 (SAT-AGCTI v1.0, 17/04/2019).
//
// ⚠ IMPORTANTE: el manual NO publica el WSDL ni el XSD ("schema0.xsd"), solo la tabla de atributos
// (sección 1.1), el ejemplo de sobre (sección 3) y la composición de la cadena original
// (sección 4). La estructura del Body (agrupación y nombres de los elementos) es una
// reconstrucción razonable y DEBE ajustarse al XSD cuando se obtenga: todo el mapeo payload → XML
// está concentrado en `nodosCuerpo260211()` para que el ajuste toque un solo lugar.
//
// Supuestos documentados (el manual es copia de otro y tiene inconsistencias):
// - Los nombres de los datos son EXACTOS a la columna "Nombre Dato (VU)", incluidas sus erratas
//   (CveAduana, cantdadUMC, cvePaisProcedecnia, fraccionarancelaria, denominacionOnombreCientifico,
//   denominacionrazonSocial en proveedores/fabricantes/facturadores, Rfc/Nombre del representante).
// - La cadena original (sección 4) incluye datos del solicitante y su domicilio que no están en la
//   tabla de atributos: se toman de la empresa (datos tal como están registrados en VUCEM).
// - El manual dice "Permiso Sanitario Previo de Importación de Producto" y su ejemplo de header
//   menciona "FianzaService": son restos de otro manual; el operation/namespace/SOAPAction son
//   configurables (ConfiguracionVucem).
// - Mercancía: el manual lista CvePaisProcedecnia DOS veces en la cadena. Se respeta por omisión
//   (opción `duplicarPaisProcedencia`). En destinatarios lista "Pais" tres veces; también se
//   respeta (opción `repetirPaisDestinatario`).
// - Representante legal: la cadena lista "ClaveReferencia" (la del pago de derechos) tras los
//   apellidos; se incluye tal cual.
// - Campos repetibles (cveScian, idEDocument): cada valor es un campo de la cadena, separado por
//   "|" (así lo ejemplifica el manual para los documentos).
// - Destinatario: estadoLocalidad (dato 77) se llena con la entidad federativa del tercero y es
//   lo que va como "EntidadFederativa" en la cadena.
// - Nulos: en la cadena quedan vacíos (||); en el XML el elemento se omite.
// - Firma: el ejemplo del manual muestra "cid:" (adjuntos MTOM); aquí el certificado y la firma
//   van en base64 en línea, que es lo que aceptan los demás servicios de VUCEM.

import { TIPO_PERSONA_WS, type TipoPersona } from "@/lib/constantes";
import type { SolicitudCompleta } from "@/lib/solicitudes/consultas";

import {
  ErrorXml,
  NS_RESPUESTA,
  buscarTexto,
  elemento,
  encabezadoSeguridad,
  encabezadosAddressing,
  extraerFault,
  extraerRespuestaBase,
  parsearXml,
  sobreSoap,
  type FaultSoap,
} from "./soap";

/** Namespace del prefijo ws: en el ejemplo de la sección 3 del manual. */
export const NAMESPACE_260211_MANUAL = "http://ws.webService.webService.se.ws.www.ventanillaunica.gob.mx/";

type Valor = string | null;

/** Proveedores, fabricantes y facturadores (datos 40-53, 54-67 y 85-98). */
export type TerceroRelacionado260211 = {
  tipoPersona: Valor;
  nombre: Valor;
  apellidoPaterno: Valor;
  apellidoMaterno: Valor;
  denominacionrazonSocial: Valor;
  correoElectronico: Valor;
  pais: Valor;
  entidadFederativa: Valor;
  cp: Valor;
  calle: Valor;
  numeroExterior: Valor;
  numeroInterior: Valor;
  lada: Valor;
  telefono: Valor;
};

/** Destinatarios (datos 68-84). */
export type Destinatario260211 = {
  tipoPersona: Valor;
  nombre: Valor;
  apellidoPaterno: Valor;
  apellidoMaterno: Valor;
  denominacionRazonSocial: Valor;
  rfc: Valor;
  correoElectronico: Valor;
  pais: Valor;
  cp: Valor;
  estadoLocalidad: Valor;
  municipioDelegacion: Valor;
  localidad: Valor;
  colonia: Valor;
  calle: Valor;
  numeroExterior: Valor;
  numeroInterior: Valor;
  telefono: Valor;
};

/** Mercancía (datos 19-37). */
export type Mercancia260211 = {
  idClasificacionProducto: Valor;
  idSubClasificacionProducto: Valor;
  denominacionEspecifica: Valor;
  denominacionDistintiva: Valor;
  denominacionOnombreCientifico: Valor;
  idTipoProducto: Valor;
  especifique: Valor;
  idFormaFarmaceutica: Valor;
  idEstadoFisico: Valor;
  fraccionarancelaria: Valor;
  cantidadUMT: Valor;
  cantdadUMC: Valor;
  desUMC: Valor;
  presentacionTipoEnvase: Valor;
  numRegistroSanitario: Valor;
  /** dd/mm/aa como el ejemplo del manual (15/05/19). */
  fechaCaducidad: Valor;
  cvePaisOrigen: Valor;
  cvePaisProcedecnia: Valor;
  idUsoEspecifico: Valor;
};

export type Payload260211 = {
  solicitante: {
    rfcSolicitante: Valor;
    /** "0" física, "1" moral. */
    tipoPersonaSolicitante: Valor;
  };
  establecimiento: {
    denominacionRazonSocial: Valor;
    calleEstablecimiento: Valor;
    numeroExteriorEstablecimiento: Valor;
    codigoPostalEstablecimiento: Valor;
    entidadFederativaEstablecimiento: Valor;
    municipioDelegacionEstablecimiento: Valor;
    coloniaEstablecimiento: Valor;
    localidadEstablecimiento: Valor;
    noLicenciaSanitaria: Valor;
    /** Correo del responsable sanitario (dato 12). */
    correoElectronico: Valor;
    rfcResponsableSanitario: Valor;
    telefonoEstablecimiento: Valor;
    cveScian: string[];
    /** "0"/"1" */
    avisoFuncionamiento: Valor;
    cveRegimen: Valor;
    CveAduana: Valor;
  };
  mercancias: Mercancia260211[];
  manifiestos: {
    /** "1"/"0" */
    cveDeclaracion: Valor;
    /** "1"/"0" */
    informacionConfidencial: Valor;
  };
  tercerosProveedores: TerceroRelacionado260211[];
  tercerosFabricantes: TerceroRelacionado260211[];
  destinatarios: Destinatario260211[];
  tercerosFacturadores: TerceroRelacionado260211[];
  pagoDerechos: {
    claveReferencia: Valor;
    cadenaDependencia: Valor;
    cveBanco: Valor;
    llavePago: Valor;
    /** dd/mm/aaaa */
    fechaPago: Valor;
    /** Con 2 decimales ("3117.00"). */
    importePago: Valor;
  };
  representanteLegal: {
    Rfc: Valor;
    Nombre: Valor;
    apellidoPaterno: Valor;
    apellidoMaterno: Valor;
  };
  idEDocument: string[];
};

// ───────────────────────────── Formato de valores ─────────────────────────────

/** Texto sin espacios en los extremos; vacío → null. Los espacios internos se respetan. */
function txt(valor: string | null | undefined): Valor {
  if (valor === null || valor === undefined) return null;
  const t = valor.trim();
  return t === "" ? null : t;
}

function dosDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/** dd/mm/aa (componentes UTC, igual que el resto de la app). */
export function fechaDdMmAa(fecha: Date | null | undefined): Valor {
  if (!fecha) return null;
  return `${dosDigitos(fecha.getUTCDate())}/${dosDigitos(fecha.getUTCMonth() + 1)}/${String(fecha.getUTCFullYear()).slice(-2)}`;
}

/** dd/mm/aaaa (componentes UTC). */
export function fechaDdMmAaaa(fecha: Date | null | undefined): Valor {
  if (!fecha) return null;
  return `${dosDigitos(fecha.getUTCDate())}/${dosDigitos(fecha.getUTCMonth() + 1)}/${fecha.getUTCFullYear()}`;
}

/** Importe con exactamente 2 decimales, sin pasar por flotantes cuando no hace falta. */
export function importeDosDecimales(importe: string | null | undefined): Valor {
  const t = txt(importe)?.replace(/,/g, "");
  if (!t) return null;
  const m = /^(\d+)(?:\.(\d{0,2}))?$/.exec(t);
  if (m) return `${m[1].replace(/^0+(?=\d)/, "")}.${(m[2] ?? "").padEnd(2, "0")}`;
  const n = Number(t);
  return Number.isFinite(n) ? n.toFixed(2) : t;
}

function bandera(valor: boolean): "0" | "1" {
  return valor ? "1" : "0";
}

function tipoPersonaWs(tipo: string | null | undefined): Valor {
  return tipo && tipo in TIPO_PERSONA_WS ? TIPO_PERSONA_WS[tipo as TipoPersona] : null;
}

// ───────────────────────────── Payload ─────────────────────────────

type TerceroBd = SolicitudCompleta["terceros"][number]["tercero"];

function terceroRelacionado(t: TerceroBd): TerceroRelacionado260211 {
  const moral = t.tipoPersona === "MORAL";
  return {
    tipoPersona: tipoPersonaWs(t.tipoPersona),
    nombre: moral ? null : txt(t.nombre),
    apellidoPaterno: moral ? null : txt(t.apellidoPaterno),
    apellidoMaterno: moral ? null : txt(t.apellidoMaterno),
    denominacionrazonSocial: moral ? txt(t.denominacionRazonSocial) : null,
    correoElectronico: txt(t.correoElectronico),
    pais: txt(t.pais),
    entidadFederativa: txt(t.entidadFederativa),
    cp: txt(t.codigoPostal),
    calle: txt(t.calle),
    numeroExterior: txt(t.numeroExterior),
    numeroInterior: txt(t.numeroInterior),
    lada: txt(t.lada),
    telefono: txt(t.telefono),
  };
}

function destinatario(t: TerceroBd): Destinatario260211 {
  const moral = t.tipoPersona === "MORAL";
  return {
    tipoPersona: tipoPersonaWs(t.tipoPersona),
    nombre: moral ? null : txt(t.nombre),
    apellidoPaterno: moral ? null : txt(t.apellidoPaterno),
    apellidoMaterno: moral ? null : txt(t.apellidoMaterno),
    denominacionRazonSocial: moral ? txt(t.denominacionRazonSocial) : null,
    rfc: txt(t.rfc)?.toUpperCase() ?? null,
    correoElectronico: txt(t.correoElectronico),
    pais: txt(t.pais),
    cp: txt(t.codigoPostal),
    estadoLocalidad: txt(t.entidadFederativa),
    municipioDelegacion: txt(t.municipio),
    localidad: txt(t.localidad),
    colonia: txt(t.colonia),
    calle: txt(t.calle),
    numeroExterior: txt(t.numeroExterior),
    numeroInterior: txt(t.numeroInterior),
    telefono: txt(t.telefono),
  };
}

/** Arma el objeto con TODOS los atributos del manual (1-109) a partir de la solicitud cargada. */
export function construirPayload260211(sol: SolicitudCompleta): Payload260211 {
  const est = sol.establecimiento;
  const porRol = (rol: string) => sol.terceros.filter((st) => st.rol === rol).map((st) => st.tercero);
  const sinPago = sol.pagoOmitido;

  const eDocuments: string[] = [];
  for (const sd of sol.documentos) {
    const e = txt(sd.documento.eDocument);
    if (e && !eDocuments.includes(e)) eDocuments.push(e);
  }

  return {
    solicitante: {
      rfcSolicitante: txt(sol.empresa.rfc)?.toUpperCase() ?? null,
      tipoPersonaSolicitante: tipoPersonaWs(sol.empresa.tipoPersona),
    },
    establecimiento: {
      denominacionRazonSocial: txt(est?.denominacionRazonSocial),
      calleEstablecimiento: txt(est?.calle),
      numeroExteriorEstablecimiento: txt(est?.numeroExterior),
      codigoPostalEstablecimiento: txt(est?.codigoPostal),
      entidadFederativaEstablecimiento: txt(est?.entidadFederativa),
      municipioDelegacionEstablecimiento: txt(est?.municipio),
      coloniaEstablecimiento: txt(est?.colonia),
      localidadEstablecimiento: txt(est?.localidad),
      noLicenciaSanitaria: txt(est?.noLicenciaSanitaria),
      correoElectronico: txt(est?.correoElectronico),
      rfcResponsableSanitario: txt(est?.rfcResponsableSanitario)?.toUpperCase() ?? null,
      telefonoEstablecimiento: txt(est?.telefono),
      cveScian: (est?.scian ?? []).map((s) => s.clave.trim()).filter(Boolean),
      avisoFuncionamiento: est ? bandera(est.tieneAvisoFuncionamiento) : null,
      cveRegimen: txt(sol.cveRegimen),
      CveAduana: txt(sol.cveAduana),
    },
    mercancias: [...sol.partidas]
      .sort((a, b) => a.orden - b.orden)
      .map((p) => ({
        idClasificacionProducto: txt(p.idClasificacionProducto),
        idSubClasificacionProducto: txt(p.idSubClasificacionProducto),
        denominacionEspecifica: txt(p.denominacionEspecifica),
        denominacionDistintiva: txt(p.denominacionDistintiva),
        denominacionOnombreCientifico: txt(p.denominacionComunCientifica),
        idTipoProducto: txt(p.idTipoProducto),
        especifique: txt(p.especifique),
        idFormaFarmaceutica: txt(p.idFormaFarmaceutica),
        idEstadoFisico: txt(p.idEstadoFisico),
        fraccionarancelaria: txt(p.fraccionArancelaria),
        cantidadUMT: txt(p.cantidadUMT),
        cantdadUMC: txt(p.cantidadUMC),
        desUMC: txt(p.desUMC),
        presentacionTipoEnvase: txt(p.presentacionTipoEnvase),
        numRegistroSanitario: txt(p.numRegistroSanitario),
        fechaCaducidad: fechaDdMmAa(p.fechaCaducidad),
        cvePaisOrigen: txt(p.cvePaisOrigen),
        cvePaisProcedecnia: txt(p.cvePaisProcedencia),
        idUsoEspecifico: txt(p.idUsoEspecifico),
      })),
    manifiestos: {
      cveDeclaracion: bandera(sol.cveDeclaracion),
      informacionConfidencial: bandera(sol.informacionConfidencial),
    },
    tercerosProveedores: porRol("PROVEEDOR").map(terceroRelacionado),
    tercerosFabricantes: porRol("FABRICANTE").map(terceroRelacionado),
    destinatarios: porRol("DESTINATARIO").map(destinatario),
    tercerosFacturadores: porRol("FACTURADOR").map(terceroRelacionado),
    // Si el pago se omitió (exento / no aplica) no se envía ningún dato del pago.
    pagoDerechos: {
      claveReferencia: sinPago ? null : txt(sol.claveReferencia),
      cadenaDependencia: sinPago ? null : txt(sol.cadenaDependencia),
      cveBanco: sinPago ? null : txt(sol.cveBanco),
      llavePago: sinPago ? null : txt(sol.llavePago),
      fechaPago: sinPago ? null : fechaDdMmAaaa(sol.fechaPago),
      importePago: sinPago ? null : importeDosDecimales(sol.importePago),
    },
    representanteLegal: {
      Rfc: txt(sol.rlRfc)?.toUpperCase() ?? null,
      Nombre: txt(sol.rlNombre),
      apellidoPaterno: txt(sol.rlApellidoPaterno),
      apellidoMaterno: txt(sol.rlApellidoMaterno),
    },
    idEDocument: eDocuments,
  };
}

// ───────────────────────────── Cadena original (sección 4) ─────────────────────────────

/** Datos del solicitante que la cadena pide y no están en la tabla de atributos. */
export type EmpresaCadena = {
  tipoPersona: string;
  rfc: string;
  razonSocial: string | null;
  nombre: string | null;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  curp: string | null;
  actividadProductiva: string | null;
  correoElectronico: string | null;
  calle: string | null;
  numeroExterior: string | null;
  numeroInterior: string | null;
  codigoPostal: string | null;
  colonia: string | null;
  pais: string | null;
  entidadFederativa: string | null;
  localidad: string | null;
  municipio: string | null;
  telefono: string | null;
};

export type OpcionesCadena260211 = {
  /** El manual lista CvePaisProcedecnia dos veces. Por omisión: true (como el manual). */
  duplicarPaisProcedencia?: boolean;
  /** El manual lista "Pais" tres veces en destinatarios. Por omisión: true (como el manual). */
  repetirPaisDestinatario?: boolean;
};

export type CampoCadena = { nombre: string; valor: string };
export type SeccionCadena = { seccion: string; campos: CampoCadena[] };

const c = (nombre: string, valor: string | null | undefined): CampoCadena => ({ nombre, valor: valor ?? "" });

/** Campos de la cadena original por sección, en el orden EXACTO de la sección 4 del manual. */
export function seccionesCadena260211(
  payload: Payload260211,
  empresa: EmpresaCadena,
  opciones: OpcionesCadena260211 = {},
): SeccionCadena[] {
  const duplicarPais = opciones.duplicarPaisProcedencia ?? true;
  const repetirPais = opciones.repetirPaisDestinatario ?? true;
  const fisica = payload.solicitante.tipoPersonaSolicitante === TIPO_PERSONA_WS.FISICA;
  const rfc = payload.solicitante.rfcSolicitante ?? txt(empresa.rfc)?.toUpperCase() ?? null;
  const e = payload.establecimiento;

  const solicitante: CampoCadena[] = fisica
    ? [
        c("Nombre", txt(empresa.nombre)),
        c("apellidoPaterno", txt(empresa.apellidoPaterno)),
        c("apellidoMaterno", txt(empresa.apellidoMaterno)),
        c("curp", txt(empresa.curp)?.toUpperCase()),
        c("rfc", rfc),
        c("correoElectronico", txt(empresa.correoElectronico)),
        c("actividadProductiva", txt(empresa.actividadProductiva)),
      ]
    : [c("razonSocial", txt(empresa.razonSocial)), c("rfc", rfc), c("correoElectronico", txt(empresa.correoElectronico))];

  const tercero = (t: TerceroRelacionado260211): CampoCadena[] => [
    c("TipoPersona", t.tipoPersona),
    c("Nombre", t.nombre),
    c("ApellidoPaterno", t.apellidoPaterno),
    c("ApellidoMaterno", t.apellidoMaterno),
    c("DenominacionRazonSocial", t.denominacionrazonSocial),
    c("CorreoElectronico", t.correoElectronico),
    c("Calle", t.calle),
    c("NumeroExterior", t.numeroExterior),
    c("NumeroInterior", t.numeroInterior),
    c("Pais", t.pais),
    c("Cp", t.cp),
    c("EntidadFederativa", t.entidadFederativa),
    c("Telefono", t.telefono),
  ];

  return [
    { seccion: "Solicitante", campos: solicitante },
    {
      seccion: "Domicilio solicitante",
      campos: [
        c("calle", txt(empresa.calle)),
        c("numeroExterior", txt(empresa.numeroExterior)),
        c("numeroInterior", txt(empresa.numeroInterior)),
        c("CodigoPostal", txt(empresa.codigoPostal)),
        c("colonia", txt(empresa.colonia)),
        c("pais", txt(empresa.pais)),
        c("entidadFederativa", txt(empresa.entidadFederativa)),
        c("Localidad", txt(empresa.localidad)),
        c("delagacionMunicipio", txt(empresa.municipio)),
        c("telefono", txt(empresa.telefono)),
      ],
    },
    {
      seccion: "Datos del establecimiento",
      campos: [
        c("RfcResponsableSanitario", e.rfcResponsableSanitario),
        c("DenominacionRazonSocial", e.denominacionRazonSocial),
        c("CorreoElectronico", e.correoElectronico),
        c("CalleEstablecimiento", e.calleEstablecimiento),
        c("NumeroExteriorEstablecimiento", e.numeroExteriorEstablecimiento),
        c("CodigoPostalEstablecimiento", e.codigoPostalEstablecimiento),
        c("EntidadFederativaEstablecimiento", e.entidadFederativaEstablecimiento),
        c("MunicipioDelegacionEstablecimiento", e.municipioDelegacionEstablecimiento),
        c("ColoniaEstablecimiento", e.coloniaEstablecimiento),
        c("LocalidadEstablecimiento", e.localidadEstablecimiento),
        c("TelefonoEstablecimiento", e.telefonoEstablecimiento),
        ...e.cveScian.map((clave) => c("CveScian", clave)),
        c("AvisoFuncionamiento", e.avisoFuncionamiento),
        c("CveRegimen", e.cveRegimen),
        c("CveAduana", e.CveAduana),
        c("NoLicenciaSanitaria", e.noLicenciaSanitaria),
      ],
    },
    {
      seccion: "Mercancía",
      campos: payload.mercancias.flatMap((m) => [
        c("idClasificacionProducto", m.idClasificacionProducto),
        c("idSubClasificacionProducto", m.idSubClasificacionProducto),
        c("denominacionEspecifica", m.denominacionEspecifica),
        c("DenominacionDisitintiva", m.denominacionDistintiva),
        c("IdTipoProducto", m.idTipoProducto),
        c("IdFormaFarmaceutica", m.idFormaFarmaceutica),
        c("Fraccionarancelaria", m.fraccionarancelaria),
        c("CvePaisOrigen", m.cvePaisOrigen),
        c("CvePaisProcedecnia", m.cvePaisProcedecnia),
        ...(duplicarPais ? [c("CvePaisProcedecnia", m.cvePaisProcedecnia)] : []),
        c("IdUsoEspecifico", m.idUsoEspecifico),
        c("CantidadUMT", m.cantidadUMT),
        c("CantidadUMC", m.cantdadUMC),
        c("DesUMC", m.desUMC),
        c("NumRegistroSanitario", m.numRegistroSanitario),
        c("DenominacionOnombreCientifico", m.denominacionOnombreCientifico),
        c("IdEstadoFisico", m.idEstadoFisico),
        c("PresentacionTipoEnvase", m.presentacionTipoEnvase),
      ]),
    },
    {
      seccion: "Manifiesto",
      campos: [
        c("CveDeclaracion", payload.manifiestos.cveDeclaracion),
        c("InformacionConfidencial", payload.manifiestos.informacionConfidencial),
      ],
    },
    { seccion: "Terceros fabricantes", campos: payload.tercerosFabricantes.flatMap(tercero) },
    {
      seccion: "Terceros destinatarios",
      campos: payload.destinatarios.flatMap((d) => [
        c("TipoPersona", d.tipoPersona),
        c("Nombre", d.nombre),
        c("ApellidoPaterno", d.apellidoPaterno),
        c("ApellidoMaterno", d.apellidoMaterno),
        c("DenominacionRazonSocial", d.denominacionRazonSocial),
        ...(repetirPais ? [c("Pais", d.pais)] : []),
        c("Rfc", d.rfc),
        c("CorreoElectronico", d.correoElectronico),
        ...(repetirPais ? [c("Pais", d.pais)] : []),
        c("Calle", d.calle),
        c("NumeroExterior", d.numeroExterior),
        c("NumeroInterior", d.numeroInterior),
        c("Pais", d.pais),
        c("Cp", d.cp),
        c("EntidadFederativa", d.estadoLocalidad),
        c("MunicipioDelegacion", d.municipioDelegacion),
        c("Colonia", d.colonia),
        c("Localidad", d.localidad),
      ]),
    },
    { seccion: "Terceros proveedores", campos: payload.tercerosProveedores.flatMap(tercero) },
    { seccion: "Terceros facturadores", campos: payload.tercerosFacturadores.flatMap(tercero) },
    {
      seccion: "Pago de derechos",
      campos: [
        c("ClaveReferencia", payload.pagoDerechos.claveReferencia),
        c("CadenaDependecia", payload.pagoDerechos.cadenaDependencia),
        c("CveBanco", payload.pagoDerechos.cveBanco),
        c("LlavePago", payload.pagoDerechos.llavePago),
        c("FechaPago", payload.pagoDerechos.fechaPago),
        c("ImportePago", payload.pagoDerechos.importePago),
      ],
    },
    {
      seccion: "Representante legal",
      campos: [
        c("Rfc", payload.representanteLegal.Rfc),
        c("Nombre", payload.representanteLegal.Nombre),
        c("ApellidoPaterno", payload.representanteLegal.apellidoPaterno),
        c("ApellidoMaterno", payload.representanteLegal.apellidoMaterno),
        c("ClaveReferencia", payload.pagoDerechos.claveReferencia),
      ],
    },
    { seccion: "Documentos", campos: payload.idEDocument.map((id) => c("idDocument", id)) },
  ];
}

/** Cadena original: separador "|", inicia y termina con "|", nulos vacíos. */
export function construirCadenaOriginal260211(
  payload: Payload260211,
  empresa: EmpresaCadena,
  opciones: OpcionesCadena260211 = {},
): string {
  const valores = seccionesCadena260211(payload, empresa, opciones).flatMap((s) => s.campos.map((campo) => campo.valor));
  return `|${valores.join("|")}|`;
}

// ───────────────────────────── XML ─────────────────────────────

type Nodo = { nombre: string; valor?: Valor; hijos?: Nodo[] };

const h = (nombre: string, valor: Valor): Nodo => ({ nombre, valor });
const g = (nombre: string, hijos: Nodo[]): Nodo => ({ nombre, hijos });

function nodosTercero(nombre: string, t: TerceroRelacionado260211): Nodo {
  return g(nombre, [
    h("tipoPersona", t.tipoPersona),
    h("nombre", t.nombre),
    h("apellidoPaterno", t.apellidoPaterno),
    h("apellidoMaterno", t.apellidoMaterno),
    h("denominacionrazonSocial", t.denominacionrazonSocial),
    h("correoElectronico", t.correoElectronico),
    h("pais", t.pais),
    h("entidadFederativa", t.entidadFederativa),
    h("cp", t.cp),
    h("calle", t.calle),
    h("numeroExterior", t.numeroExterior),
    h("numeroInterior", t.numeroInterior),
    h("lada", t.lada),
    h("telefono", t.telefono),
  ]);
}

/**
 * ÚNICO lugar con el mapeo payload → elementos del Body. Ajustar aquí cuando se tenga el
 * schema0.xsd (nombres, agrupación y orden de los elementos).
 */
export function nodosCuerpo260211(p: Payload260211): Nodo[] {
  const e = p.establecimiento;
  return [
    g("solicitante", [h("tipoPersonaSolicitante", p.solicitante.tipoPersonaSolicitante), h("rfcSolicitante", p.solicitante.rfcSolicitante)]),
    g("establecimiento", [
      h("denominacionRazonSocial", e.denominacionRazonSocial),
      h("calleEstablecimiento", e.calleEstablecimiento),
      h("numeroExteriorEstablecimiento", e.numeroExteriorEstablecimiento),
      h("codigoPostalEstablecimiento", e.codigoPostalEstablecimiento),
      h("entidadFederativaEstablecimiento", e.entidadFederativaEstablecimiento),
      h("municipioDelegacionEstablecimiento", e.municipioDelegacionEstablecimiento),
      h("coloniaEstablecimiento", e.coloniaEstablecimiento),
      h("localidadEstablecimiento", e.localidadEstablecimiento),
      h("noLicenciaSanitaria", e.noLicenciaSanitaria),
      h("correoElectronico", e.correoElectronico),
      h("rfcResponsableSanitario", e.rfcResponsableSanitario),
      h("telefonoEstablecimiento", e.telefonoEstablecimiento),
      h("avisoFuncionamiento", e.avisoFuncionamiento),
      h("cveRegimen", e.cveRegimen),
      h("CveAduana", e.CveAduana),
    ]),
    g("scian", e.cveScian.map((clave) => h("cveScian", clave))),
    g(
      "mercancias",
      p.mercancias.map((m) =>
        g("mercancia", [
          h("idClasificacionProducto", m.idClasificacionProducto),
          h("idSubClasificacionProducto", m.idSubClasificacionProducto),
          h("denominacionEspecifica", m.denominacionEspecifica),
          h("denominacionDistintiva", m.denominacionDistintiva),
          h("denominacionOnombreCientifico", m.denominacionOnombreCientifico),
          h("idTipoProducto", m.idTipoProducto),
          h("especifique", m.especifique),
          h("idFormaFarmaceutica", m.idFormaFarmaceutica),
          h("idEstadoFisico", m.idEstadoFisico),
          h("fraccionarancelaria", m.fraccionarancelaria),
          h("cantidadUMT", m.cantidadUMT),
          h("cantdadUMC", m.cantdadUMC),
          h("desUMC", m.desUMC),
          h("presentacionTipoEnvase", m.presentacionTipoEnvase),
          h("numRegistroSanitario", m.numRegistroSanitario),
          h("fechaCaducidad", m.fechaCaducidad),
          h("cvePaisOrigen", m.cvePaisOrigen),
          h("cvePaisProcedecnia", m.cvePaisProcedecnia),
          h("idUsoEspecifico", m.idUsoEspecifico),
        ]),
      ),
    ),
    g("manifiestos", [h("cveDeclaracion", p.manifiestos.cveDeclaracion), h("informacionConfidencial", p.manifiestos.informacionConfidencial)]),
    g("tercerosProveedores", p.tercerosProveedores.map((t) => nodosTercero("proveedor", t))),
    g("tercerosFabricantes", p.tercerosFabricantes.map((t) => nodosTercero("fabricante", t))),
    g(
      "destinatarios",
      p.destinatarios.map((d) =>
        g("destinatario", [
          h("tipoPersona", d.tipoPersona),
          h("nombre", d.nombre),
          h("apellidoPaterno", d.apellidoPaterno),
          h("apellidoMaterno", d.apellidoMaterno),
          h("denominacionRazonSocial", d.denominacionRazonSocial),
          h("rfc", d.rfc),
          h("correoElectronico", d.correoElectronico),
          h("pais", d.pais),
          h("cp", d.cp),
          h("estadoLocalidad", d.estadoLocalidad),
          h("municipioDelegacion", d.municipioDelegacion),
          h("localidad", d.localidad),
          h("colonia", d.colonia),
          h("calle", d.calle),
          h("numeroExterior", d.numeroExterior),
          h("numeroInterior", d.numeroInterior),
          h("telefono", d.telefono),
        ]),
      ),
    ),
    g("tercerosFacturadores", p.tercerosFacturadores.map((t) => nodosTercero("facturador", t))),
    g("pagoDerechos", [
      h("claveReferencia", p.pagoDerechos.claveReferencia),
      h("cadenaDependencia", p.pagoDerechos.cadenaDependencia),
      h("cveBanco", p.pagoDerechos.cveBanco),
      h("llavePago", p.pagoDerechos.llavePago),
      h("fechaPago", p.pagoDerechos.fechaPago),
      h("importePago", p.pagoDerechos.importePago),
    ]),
    g("representanteLegal", [
      h("Rfc", p.representanteLegal.Rfc),
      h("Nombre", p.representanteLegal.Nombre),
      h("apellidoPaterno", p.representanteLegal.apellidoPaterno),
      h("apellidoMaterno", p.representanteLegal.apellidoMaterno),
    ]),
    g("documentos", p.idEDocument.map((id) => h("idEDocument", id))),
  ];
}

/** Serializa nodos: omite hojas nulas/vacías y grupos que quedan sin hijos. */
function serializar(nodos: Nodo[]): string {
  let salida = "";
  for (const nodo of nodos) {
    if (nodo.hijos) {
      const interior = serializar(nodo.hijos);
      if (interior) salida += `<${nodo.nombre}>${interior}</${nodo.nombre}>`;
    } else if (nodo.valor !== null && nodo.valor !== undefined && nodo.valor !== "") {
      salida += elemento(nodo.nombre, nodo.valor);
    }
  }
  return salida;
}

export type FirmaElectronica = { certificadoBase64: string; cadenaOriginal: string; firma: string };

export type ConfigXml260211 = {
  /** Nombre del elemento de operación (manual: "nombreDelServicio"). */
  operacion: string;
  /** Namespace del prefijo ws: (por omisión el del manual). */
  namespace?: string | null;
  usuario: string;
  password: string;
  /** Si se indica, se agregan los encabezados WS-Addressing de la sección 2.2. */
  soapAction?: string | null;
  url?: string | null;
  messageId?: string;
};

/** Sobre SOAP completo de la petición 260211. */
export function construirXml260211(payload: Payload260211, firma: FirmaElectronica, config: ConfigXml260211): string {
  const operacion = config.operacion.trim();
  if (!/^[A-Za-z_][\w.-]*$/.test(operacion)) throw new Error(`Nombre de operación inválido: «${operacion}».`);
  const encabezado =
    (config.soapAction ? encabezadosAddressing({ action: config.soapAction, to: config.url, messageId: config.messageId }) : "") +
    encabezadoSeguridad(config.usuario, config.password);
  const cuerpo =
    `<ws:${operacion}>` +
    `<res:firmaElectronica>` +
    elemento("res:certificado", firma.certificadoBase64) +
    elemento("res:cadenaOriginal", firma.cadenaOriginal) +
    elemento("res:firma", firma.firma) +
    `</res:firmaElectronica>` +
    serializar(nodosCuerpo260211(payload)) +
    `</ws:${operacion}>`;
  return sobreSoap({
    encabezado,
    cuerpo,
    namespaces: { ws: config.namespace?.trim() || NAMESPACE_260211_MANUAL, res: NS_RESPUESTA },
  });
}

// ───────────────────────────── Respuesta ─────────────────────────────

export type RespuestaSolicitud260211 = {
  /** Sin SOAP Fault ni tieneError=true. Que haya folio se revisa aparte. */
  exito: boolean;
  folio?: string;
  numeroSolicitud?: string;
  mensajes: string[];
  fault?: FaultSoap;
};

/**
 * Lee la respuesta del WS 260211. Sin XSD, se buscan los nodos plausibles: folio, numeroFolio,
 * numeroDeTramite (folio de 25 dígitos), numeroSolicitud/idSolicitud (número temporal),
 * respuestaBase/tieneError y mensajes/errores.
 */
export function parsearRespuestaSolicitud(xml: string): RespuestaSolicitud260211 {
  let raiz: ReturnType<typeof parsearXml>;
  try {
    raiz = parsearXml(xml);
  } catch (e) {
    return { exito: false, mensajes: [e instanceof ErrorXml ? e.message : "No se pudo leer la respuesta de VUCEM."] };
  }
  const fault = extraerFault(raiz);
  if (fault) {
    return { exito: false, fault, mensajes: [fault.detalle ? `${fault.mensaje} (${fault.detalle})` : fault.mensaje] };
  }
  const base = extraerRespuestaBase(raiz);
  const folio = buscarTexto(raiz, ["folio", "numeroFolio", "numeroDeTramite", "folioTramite"]) ?? undefined;
  const numeroSolicitud = buscarTexto(raiz, ["numeroSolicitud", "idSolicitud"]) ?? undefined;
  return {
    exito: base.tieneError !== true,
    ...(folio ? { folio } : {}),
    ...(numeroSolicitud ? { numeroSolicitud } : {}),
    mensajes: base.mensajes,
  };
}

/** Vista previa del XML sin firma (para mostrar al usuario antes de firmar). */
export function xmlVistaPrevia260211(payload: Payload260211, cadenaOriginal: string, config: Omit<ConfigXml260211, "password">): string {
  return construirXml260211(
    payload,
    { certificadoBase64: "(certificado de tu e.firma, en base64)", cadenaOriginal, firma: "(firma generada en tu navegador)" },
    { ...config, password: "********", messageId: "urn:uuid:(se genera al enviar)" },
  );
}
