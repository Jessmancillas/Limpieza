import { ETIQUETA_TIPO_TERCERO, type TipoDocumento, type TipoTercero } from "@/lib/constantes";
import { leerDefinicion, type DefinicionTramite } from "@/lib/tramite/definicion";
import { normalizarRfc, RE_CANTIDAD, RE_CP_MX, RE_FRACCION, RE_IMPORTE, RE_RFC, RE_SCIAN } from "@/lib/validacion/comunes";
import { nombreTercero } from "@/lib/validacion/tercero";

import type { SolicitudCompleta } from "./consultas";
import { diasNaturalesHasta } from "./fechas";

// Validación previa de la solicitud 260211 contra el Manual WS 260211, sección 1.1 (campos 1-109).
// Función PURA: recibe la solicitud ya cargada (cargarSolicitudCompleta) y no consulta la BD.

export type Problema = { seccion: string; campo?: string; mensaje: string };
export type ResultadoValidacion = { errores: Problema[]; avisos: Problema[]; lista: boolean };

/** Nombres de sección (en el orden del portal). */
export const SECCION = {
  SOLICITANTE: "Solicitante",
  ESTABLECIMIENTO: "Establecimiento",
  REGIMEN_ADUANA: "Régimen y aduana",
  MERCANCIAS: "Mercancías",
  MANIFIESTOS: "Manifiestos y declaraciones",
  REPRESENTANTE: "Representante legal",
  TERCEROS: "Terceros relacionados",
  PAGO: "Pago de derechos",
  DOCUMENTOS: "Requisitos y anexos",
} as const;

export const ORDEN_SECCIONES: string[] = Object.values(SECCION);

/** Columna "Tam" del manual. */
export const TAM = {
  rfc: 13,
  denominacionEstablecimiento: 100,
  calleEstablecimiento: 120,
  numeroExteriorEstablecimiento: 320,
  codigoPostal: 12,
  entidadEstablecimiento: 12,
  municipioEstablecimiento: 120,
  coloniaEstablecimiento: 100,
  localidadEstablecimiento: 100,
  noLicenciaSanitaria: 20,
  correo: 320,
  telefono: 30,
  cveScian: 6,
  cveRegimen: 2,
  cveAduana: 3,
  idClasificacionProducto: 14,
  idSubClasificacionProducto: 14,
  denominacionEspecifica: 256,
  denominacionDistintiva: 120,
  idTipoProducto: 4,
  fraccionArancelaria: 8,
  cantidad: 18,
  desUMC: 100,
  presentacionTipoEnvase: 250,
  numRegistroSanitario: 50,
  cvePais: 3,
  idUsoEspecifico: 4,
  // Proveedores, fabricantes y facturadores (40-67, 85-98)
  terceroNombre: 200,
  terceroApellido: 200,
  terceroDenominacion: 254,
  terceroEntidad: 6,
  terceroCp: 12,
  terceroCalle: 100,
  terceroNumeroExterior: 55,
  terceroNumeroInterior: 55,
  terceroLada: 44,
  terceroTelefono: 30,
  // Destinatario (68-84). Municipio: el manual dice 6 pero su propio ejemplo lo excede; se usa 120.
  destinatarioDenominacion: 100,
  destinatarioEntidad: 12,
  destinatarioMunicipio: 120,
  destinatarioLocalidad: 120,
  destinatarioColonia: 120,
  destinatarioNumeroExterior: 9,
  // Pago de derechos (99-104)
  claveReferencia: 9,
  cadenaDependencia: 14,
  cveBanco: 20,
  llavePago: 30,
  // Representante legal (105-108)
  rlNombre: 200,
  rlApellido: 200,
} as const;

/** VUCEM: megabyte decimal (criterio más estricto, igual que el módulo de documentos). */
const BYTES_POR_MB = 1_000_000;
const DIAS_AVISO_REGISTRO = 30;
const DIAS_AVISO_DOCUMENTO = 30;

const vacio = (v: string | null | undefined): v is null | undefined | "" => !v || v.trim() === "";
const largo = (v: string) => [...v].length;
const RE_PAIS = /^[A-Z]{3}$/;
const RE_LONG = /^\d+$/;

function formatoFechaCorta(fecha: Date): string {
  const d = String(fecha.getUTCDate()).padStart(2, "0");
  const m = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  return `${d}/${m}/${fecha.getUTCFullYear()}`;
}

function recortar(texto: string, max = 40): string {
  return largo(texto) > max ? `${[...texto].slice(0, max - 1).join("")}…` : texto;
}

export function validarSolicitud(
  sol: SolicitudCompleta,
  opciones?: { canal?: "WS" | "PORTAL"; hoy?: Date },
): ResultadoValidacion {
  const canal = opciones?.canal ?? "PORTAL";
  const hoy = opciones?.hoy ?? new Date();
  const errores: Problema[] = [];
  const avisos: Problema[] = [];

  const error = (seccion: string, campo: string | undefined, mensaje: string) => errores.push({ seccion, campo, mensaje });
  const aviso = (seccion: string, campo: string | undefined, mensaje: string) => avisos.push({ seccion, campo, mensaje });
  /** Campo con Requerido=SI: presente y dentro del tamaño. */
  const requerido = (seccion: string, campo: string, valor: string | null | undefined, etiqueta: string, max?: number) => {
    if (vacio(valor)) error(seccion, campo, `Falta ${etiqueta}.`);
    else if (max && largo(valor.trim()) > max) error(seccion, campo, `${capitalizar(etiqueta)}: máximo ${max} caracteres (tiene ${largo(valor.trim())}).`);
  };
  /** Campo con Requerido=NO: solo el tamaño. */
  const opcional = (seccion: string, campo: string, valor: string | null | undefined, etiqueta: string, max: number) => {
    if (!vacio(valor) && largo(valor.trim()) > max) error(seccion, campo, `${capitalizar(etiqueta)}: máximo ${max} caracteres (tiene ${largo(valor.trim())}).`);
  };
  /** Campos tipo Long del manual: en el XML deben ser numéricos (en el portal se eligen de una lista). */
  const numericoWs = (seccion: string, campo: string, valor: string | null | undefined, etiqueta: string) => {
    if (canal === "WS" && !vacio(valor) && !RE_LONG.test(valor.trim())) {
      error(seccion, campo, `${capitalizar(etiqueta)}: el servicio web espera una clave numérica (tiene «${valor}»).`);
    }
  };
  /** Entidad federativa: clave de CAT_ENTIDAD (por confirmar) o texto libre de extranjeros. */
  const entidad = (
    seccion: string,
    campo: string,
    valor: string | null | undefined,
    etiqueta: string,
    max: number,
    esCatalogo: boolean,
    prefijo?: string,
  ) => {
    const texto = (t: string) => (prefijo ? `${prefijo}: ${t}` : capitalizar(t));
    if (vacio(valor)) return error(seccion, campo, texto(`falta ${etiqueta}.`));
    if (largo(valor.trim()) <= max) return;
    if (esCatalogo) {
      aviso(
        seccion,
        campo,
        texto(
          `${etiqueta} «${valor}» tiene más de ${max} caracteres (tamaño del manual). El catálogo CAT_ENTIDAD está por confirmar: verifica la clave oficial antes de enviar.`,
        ),
      );
    } else {
      error(seccion, campo, texto(`${etiqueta}, máximo ${max} caracteres (tiene ${largo(valor.trim())}).`));
    }
  };

  // ── 1-2. Solicitante (datos de la empresa) ──
  const empresa = sol.empresa;
  const rfcSolicitante = normalizarRfc(empresa.rfc ?? "");
  if (!rfcSolicitante) error(SECCION.SOLICITANTE, "rfcSolicitante", "Falta el RFC del solicitante (datos de la empresa).");
  else if (!RE_RFC.test(rfcSolicitante)) error(SECCION.SOLICITANTE, "rfcSolicitante", `El RFC del solicitante «${empresa.rfc}» no es válido.`);
  if (empresa.tipoPersona !== "MORAL" && empresa.tipoPersona !== "FISICA") {
    error(SECCION.SOLICITANTE, "tipoPersonaSolicitante", "Falta el tipo de persona del solicitante (física o moral).");
  } else if (RE_RFC.test(rfcSolicitante)) {
    const esMoral = rfcSolicitante.length === 12;
    if (esMoral !== (empresa.tipoPersona === "MORAL")) {
      error(
        SECCION.SOLICITANTE,
        "tipoPersonaSolicitante",
        `El tipo de persona del solicitante (${empresa.tipoPersona === "MORAL" ? "moral" : "física"}) no corresponde a su RFC de ${rfcSolicitante.length} caracteres.`,
      );
    }
  }

  // ── 3-16. Establecimiento ──
  const est = sol.establecimiento;
  const SE = SECCION.ESTABLECIMIENTO;
  if (!est) {
    error(SE, "establecimiento", "Elige el establecimiento (domicilio donde se almacenarán los dispositivos).");
  } else {
    if (!est.activo) aviso(SE, "establecimiento", "El establecimiento elegido está inactivo en el catálogo.");
    requerido(SE, "denominacionRazonSocial", est.denominacionRazonSocial, "la denominación o razón social del establecimiento", TAM.denominacionEstablecimiento);
    requerido(SE, "calleEstablecimiento", est.calle, "la calle del establecimiento", TAM.calleEstablecimiento);
    opcional(SE, "numeroExteriorEstablecimiento", est.numeroExterior, "el número exterior del establecimiento", TAM.numeroExteriorEstablecimiento);
    requerido(SE, "codigoPostalEstablecimiento", est.codigoPostal, "el código postal del establecimiento", TAM.codigoPostal);
    if (!vacio(est.codigoPostal) && !RE_CP_MX.test(est.codigoPostal.trim())) {
      error(SE, "codigoPostalEstablecimiento", "El código postal del establecimiento debe tener 5 dígitos.");
    }
    entidad(SE, "entidadFederativaEstablecimiento", est.entidadFederativa, "la entidad federativa del establecimiento", TAM.entidadEstablecimiento, true);
    requerido(SE, "municipioDelegacionEstablecimiento", est.municipio, "el municipio o alcaldía del establecimiento", TAM.municipioEstablecimiento);
    opcional(SE, "coloniaEstablecimiento", est.colonia, "la colonia del establecimiento", TAM.coloniaEstablecimiento);
    opcional(SE, "localidadEstablecimiento", est.localidad, "la localidad del establecimiento", TAM.localidadEstablecimiento);
    opcional(SE, "noLicenciaSanitaria", est.noLicenciaSanitaria, "el número de licencia sanitaria", TAM.noLicenciaSanitaria);
    requerido(SE, "correoElectronico", est.correoElectronico, "el correo electrónico del responsable sanitario", TAM.correo);
    requerido(SE, "rfcResponsableSanitario", est.rfcResponsableSanitario, "el RFC del responsable sanitario", TAM.rfc);
    if (!vacio(est.rfcResponsableSanitario) && !RE_RFC.test(normalizarRfc(est.rfcResponsableSanitario))) {
      error(SE, "rfcResponsableSanitario", `El RFC del responsable sanitario «${est.rfcResponsableSanitario}» no es válido.`);
    }
    requerido(SE, "telefonoEstablecimiento", est.telefono, "el teléfono del establecimiento", TAM.telefono);
    const scianValidos = est.scian.filter((s) => RE_SCIAN.test(s.clave));
    if (scianValidos.length === 0) error(SE, "cveScian", "Agrega al menos una clave SCIAN de 6 dígitos al establecimiento.");
    for (const s of est.scian) {
      if (!RE_SCIAN.test(s.clave)) error(SE, "cveScian", `La clave SCIAN «${s.clave}» debe tener 6 dígitos.`);
    }
    if (vacio(est.noLicenciaSanitaria) && !est.tieneAvisoFuncionamiento) {
      aviso(SE, "noLicenciaSanitaria", "El establecimiento no tiene número de licencia sanitaria ni aviso de funcionamiento.");
    }
  }

  // ── 17-18. Régimen y aduana ──
  const SR = SECCION.REGIMEN_ADUANA;
  requerido(SR, "cveRegimen", sol.cveRegimen, "la clave del régimen", TAM.cveRegimen);
  if (vacio(sol.cveAduana)) error(SR, "cveAduana", "Falta la aduana de entrada.");
  else if (largo(sol.cveAduana.trim()) !== TAM.cveAduana) {
    error(SR, "cveAduana", `La clave de aduana debe tener ${TAM.cveAduana} caracteres (tiene «${sol.cveAduana}»).`);
  }

  // ── 19-37. Mercancías ──
  const SM = SECCION.MERCANCIAS;
  if (sol.partidas.length === 0) error(SM, "mercancias", "Agrega al menos una mercancía.");
  sol.partidas.forEach((p, i) => {
    const pre = `Mercancía ${i + 1} (${recortar(p.denominacionEspecifica || "sin denominación")})`;
    const req = (campo: string, valor: string | null | undefined, etiqueta: string, max?: number) => {
      if (vacio(valor)) error(SM, campo, `${pre}: falta ${etiqueta}.`);
      else if (max && largo(valor.trim()) > max) error(SM, campo, `${pre}: ${etiqueta}, máximo ${max} caracteres (tiene ${largo(valor.trim())}).`);
    };
    const opc = (campo: string, valor: string | null | undefined, etiqueta: string, max: number) => {
      if (!vacio(valor) && largo(valor.trim()) > max) error(SM, campo, `${pre}: ${etiqueta}, máximo ${max} caracteres (tiene ${largo(valor.trim())}).`);
    };

    req("idClasificacionProducto", p.idClasificacionProducto, "la clasificación del producto", TAM.idClasificacionProducto);
    numericoWs(SM, "idClasificacionProducto", p.idClasificacionProducto, `${pre}: clasificación del producto`);
    req("idSubClasificacionProducto", p.idSubClasificacionProducto, "la subclasificación del producto", TAM.idSubClasificacionProducto);
    numericoWs(SM, "idSubClasificacionProducto", p.idSubClasificacionProducto, `${pre}: subclasificación del producto`);
    req("denominacionEspecifica", p.denominacionEspecifica, "la denominación específica", TAM.denominacionEspecifica);
    req("denominacionDistintiva", p.denominacionDistintiva, "la denominación distintiva (marca)", TAM.denominacionDistintiva);
    req("denominacionOnombreCientifico", p.denominacionComunCientifica, "la denominación común o nombre científico");
    req("idTipoProducto", p.idTipoProducto, "el tipo de producto", TAM.idTipoProducto);
    numericoWs(SM, "idTipoProducto", p.idTipoProducto, `${pre}: tipo de producto`);

    // Forma farmacéutica y estado físico: el manual los marca requeridos (26-27), aunque en
    // dispositivos médicos pueden no aplicar. El servicio web los exige; en el portal se avisa.
    for (const [campo, valor, etiqueta] of [
      ["idFormaFarmaceutica", p.idFormaFarmaceutica, "la forma farmacéutica"],
      ["idEstadoFisico", p.idEstadoFisico, "el estado físico"],
    ] as const) {
      if (!vacio(valor)) continue;
      const mensaje = `${pre}: falta ${etiqueta}. El Manual WS 260211 lo marca como requerido; en dispositivos médicos puede no aplicar.`;
      if (canal === "WS") error(SM, campo, `${mensaje} El servicio web lo exige: captura la clave que corresponda.`);
      else aviso(SM, campo, `${mensaje} Verifica si el portal lo solicita para este producto.`);
    }

    if (vacio(p.fraccionArancelaria)) error(SM, "fraccionarancelaria", `${pre}: falta la fracción arancelaria.`);
    else if (!RE_FRACCION.test(p.fraccionArancelaria.trim())) {
      error(SM, "fraccionarancelaria", `${pre}: la fracción arancelaria «${p.fraccionArancelaria}» debe tener 8 dígitos.`);
    }
    for (const [campo, valor, etiqueta] of [
      ["cantidadUMT", p.cantidadUMT, "la cantidad en unidad de medida tarifaria (UMT)"],
      ["cantidadUMC", p.cantidadUMC, "la cantidad en unidad de medida comercial (UMC)"],
    ] as const) {
      if (vacio(valor)) error(SM, campo, `${pre}: falta ${etiqueta}.`);
      else if (!RE_CANTIDAD.test(valor.trim()) || !(Number(valor) > 0)) {
        error(SM, campo, `${pre}: ${etiqueta} debe ser mayor a 0, con máximo 3 decimales (tiene «${valor}»).`);
      }
    }
    req("desUMC", p.desUMC, "la descripción de la unidad de medida comercial", TAM.desUMC);
    req("presentacionTipoEnvase", p.presentacionTipoEnvase, "la presentación o tipo de envase", TAM.presentacionTipoEnvase);

    // Registro sanitario: NO requerido en el manual, pero este trámite es para dispositivos CON registro.
    if (vacio(p.numRegistroSanitario)) {
      error(SM, "numRegistroSanitario", `${pre}: falta el número de registro sanitario (este trámite es para dispositivos médicos que cuentan con registro).`);
    } else {
      opc("numRegistroSanitario", p.numRegistroSanitario, "el número de registro sanitario", TAM.numRegistroSanitario);
      const producto = p.producto;
      if (producto) {
        const mismoRegistro =
          !vacio(producto.numRegistroSanitario) &&
          producto.numRegistroSanitario.trim().toUpperCase() === p.numRegistroSanitario.trim().toUpperCase();
        if (!mismoRegistro) {
          aviso(SM, "numRegistroSanitario", `${pre}: el registro sanitario de la mercancía no coincide con el del producto en el catálogo; no se pudo verificar su vigencia.`);
        } else if (!producto.vigenciaRegistroSanitario) {
          aviso(SM, "numRegistroSanitario", `${pre}: el producto no tiene capturada la vigencia de su registro sanitario; no se pudo verificar.`);
        } else {
          const dias = diasNaturalesHasta(producto.vigenciaRegistroSanitario, hoy);
          const fecha = formatoFechaCorta(producto.vigenciaRegistroSanitario);
          if (dias < 0) error(SM, "numRegistroSanitario", `${pre}: el registro sanitario venció el ${fecha}.`);
          else if (dias <= DIAS_AVISO_REGISTRO) {
            aviso(SM, "numRegistroSanitario", `${pre}: el registro sanitario vence el ${fecha} (${dias === 0 ? "hoy" : `en ${dias} día${dias === 1 ? "" : "s"}`}).`);
          }
        }
      }
    }
    if (p.fechaCaducidad && diasNaturalesHasta(p.fechaCaducidad, hoy) < 0) {
      aviso(SM, "fechaCaducidad", `${pre}: la fecha de caducidad (${formatoFechaCorta(p.fechaCaducidad)}) ya pasó.`);
    }

    for (const [campo, valor, etiqueta] of [
      ["cvePaisOrigen", p.cvePaisOrigen, "el país de origen"],
      ["cvePaisProcedencia", p.cvePaisProcedencia, "el país de procedencia"],
    ] as const) {
      if (vacio(valor)) error(SM, campo, `${pre}: falta ${etiqueta}.`);
      else if (!RE_PAIS.test(valor.trim())) error(SM, campo, `${pre}: ${etiqueta} debe ser una clave de 3 letras (tiene «${valor}»).`);
    }
    req("idUsoEspecifico", p.idUsoEspecifico, "el uso específico", TAM.idUsoEspecifico);
  });

  // ── 38-39. Manifiestos y declaraciones ──
  if (!sol.cveDeclaracion) {
    error(SECCION.MANIFIESTOS, "cveDeclaracion", "Debes aceptar la declaración bajo protesta de decir verdad.");
  }

  // ── 105-108. Representante legal ──
  const SRL = SECCION.REPRESENTANTE;
  const rlRfc = normalizarRfc(sol.rlRfc ?? "");
  if (!rlRfc) error(SRL, "rfc", "Falta el RFC del representante legal.");
  else if (!RE_RFC.test(rlRfc)) error(SRL, "rfc", `El RFC del representante legal «${sol.rlRfc}» no es válido.`);
  else if (rlRfc.length === 13) {
    requerido(SRL, "nombre", sol.rlNombre, "el nombre del representante legal (requerido para persona física)", TAM.rlNombre);
    requerido(SRL, "apellidoPaterno", sol.rlApellidoPaterno, "el apellido paterno del representante legal (requerido para persona física)", TAM.rlApellido);
  }
  if (rlRfc.length !== 13) {
    opcional(SRL, "nombre", sol.rlNombre, "el nombre del representante legal", TAM.rlNombre);
    opcional(SRL, "apellidoPaterno", sol.rlApellidoPaterno, "el apellido paterno del representante legal", TAM.rlApellido);
  }
  opcional(SRL, "apellidoMaterno", sol.rlApellidoMaterno, "el apellido materno del representante legal", TAM.rlApellido);

  // ── 40-98. Terceros ──
  const ST = SECCION.TERCEROS;
  const porRol = (rol: TipoTercero) => sol.terceros.filter((t) => t.rol === rol);
  if (porRol("FABRICANTE").length === 0) error(ST, "fabricante", "Agrega al menos un fabricante (el portal lo exige).");
  if (porRol("DESTINATARIO").length === 0) error(ST, "destinatario", "Agrega el destinatario (destino final de la mercancía; el portal lo exige).");
  const contador = new Map<string, number>();
  for (const st of sol.terceros) {
    const n = (contador.get(st.rol) ?? 0) + 1;
    contador.set(st.rol, n);
    const t = st.tercero;
    const etiquetaRol = ETIQUETA_TIPO_TERCERO[st.rol as TipoTercero]?.split(" ")[0] ?? st.rol;
    const pre = `${etiquetaRol} «${recortar(nombreTercero(t))}»`;
    const req = (campo: string, valor: string | null | undefined, etiqueta: string, max?: number) => {
      if (vacio(valor)) error(ST, campo, `${pre}: falta ${etiqueta}.`);
      else if (max && largo(valor.trim()) > max) error(ST, campo, `${pre}: ${etiqueta}, máximo ${max} caracteres (tiene ${largo(valor.trim())}).`);
    };
    const opc = (campo: string, valor: string | null | undefined, etiqueta: string, max: number) => {
      if (!vacio(valor) && largo(valor.trim()) > max) error(ST, campo, `${pre}: ${etiqueta}, máximo ${max} caracteres (tiene ${largo(valor.trim())}).`);
    };
    const esDestinatario = st.rol === "DESTINATARIO";
    const nacional = t.nacionalidad === "NACIONAL" || t.pais === "MEX";

    if (t.tipoPersona !== "FISICA" && t.tipoPersona !== "MORAL") error(ST, "tipoPersona", `${pre}: falta el tipo de persona.`);
    if (t.tipoPersona === "FISICA") {
      req("nombre", t.nombre, "el nombre", TAM.terceroNombre);
      req("apellidoPaterno", t.apellidoPaterno, "el apellido paterno", TAM.terceroApellido);
      opc("apellidoMaterno", t.apellidoMaterno, "el apellido materno", TAM.terceroApellido);
    }
    if (t.tipoPersona === "MORAL" || esDestinatario) {
      req(
        "denominacionRazonSocial",
        t.denominacionRazonSocial,
        "la denominación o razón social",
        esDestinatario ? TAM.destinatarioDenominacion : TAM.terceroDenominacion,
      );
    }
    if (vacio(t.pais)) error(ST, "pais", `${pre}: falta el país.`);
    else if (!RE_PAIS.test(t.pais.trim())) error(ST, "pais", `${pre}: el país debe ser una clave de 3 letras (tiene «${t.pais}»).`);
    req("calle", t.calle, "la calle", TAM.terceroCalle);

    if (esDestinatario) {
      const rfc = normalizarRfc(t.rfc ?? "");
      if (!rfc) error(ST, "rfc", `${pre}: falta el RFC del destinatario.`);
      else if (!RE_RFC.test(rfc)) error(ST, "rfc", `${pre}: el RFC «${t.rfc}» no es válido.`);
      opc("correoElectronico", t.correoElectronico, "el correo electrónico", TAM.correo);
      req("cp", t.codigoPostal, "el código postal", TAM.terceroCp);
      entidad(ST, "estadoLocalidad", t.entidadFederativa, "la entidad federativa", TAM.destinatarioEntidad, nacional, pre);
      req("municipioDelegacion", t.municipio, "el municipio o alcaldía", TAM.destinatarioMunicipio);
      req("localidad", t.localidad, "la localidad", TAM.destinatarioLocalidad);
      req("colonia", t.colonia, "la colonia", TAM.destinatarioColonia);
      req("numeroExterior", t.numeroExterior, "el número exterior", TAM.destinatarioNumeroExterior);
      req("numeroInterior", t.numeroInterior, "el número interior (si no tiene, captura S/N)", TAM.terceroNumeroInterior);
      req("telefono", t.telefono, "el teléfono", TAM.terceroTelefono);
    } else {
      req("correoElectronico", t.correoElectronico, "el correo electrónico", TAM.correo);
      entidad(ST, "entidadFederativa", t.entidadFederativa, "la entidad federativa, estado o provincia", TAM.terceroEntidad, nacional, pre);
      opc("cp", t.codigoPostal, "el código postal", TAM.terceroCp);
      req("numeroExterior", t.numeroExterior, "el número exterior", TAM.terceroNumeroExterior);
      opc("numeroInterior", t.numeroInterior, "el número interior", TAM.terceroNumeroInterior);
      opc("lada", t.lada, "la lada", TAM.terceroLada);
      opc("telefono", t.telefono, "el teléfono", TAM.terceroTelefono);
    }
  }

  // ── 99-104. Pago de derechos ──
  const SP = SECCION.PAGO;
  if (sol.pagoOmitido) {
    aviso(SP, "pagoOmitido", "Se indicó que la solicitud no requiere pago de derechos. Verifica que el trámite esté exento antes de presentarlo.");
  } else {
    requerido(SP, "claveReferencia", sol.claveReferencia, "la clave de referencia del pago", TAM.claveReferencia);
    requerido(SP, "cadenaDependencia", sol.cadenaDependencia, "la cadena de la dependencia", TAM.cadenaDependencia);
    requerido(SP, "cveBanco", sol.cveBanco, "el banco del pago", TAM.cveBanco);
    numericoWs(SP, "cveBanco", sol.cveBanco, "la clave del banco");
    requerido(SP, "llavePago", sol.llavePago, "la llave de pago", TAM.llavePago);
    if (!sol.fechaPago) error(SP, "fechaPago", "Falta la fecha de pago.");
    else if (diasNaturalesHasta(sol.fechaPago, hoy) > 0) error(SP, "fechaPago", "La fecha de pago no puede ser posterior a hoy.");
    if (vacio(sol.importePago)) error(SP, "importePago", "Falta el importe pagado.");
    else if (!RE_IMPORTE.test(sol.importePago.trim()) || !(Number(sol.importePago) > 0)) {
      error(SP, "importePago", `El importe «${sol.importePago}» no es válido (mayor a 0, hasta 13 enteros y 2 decimales).`);
    }
  }

  // ── 109. Requisitos y anexos ──
  const SD = SECCION.DOCUMENTOS;
  let definicion: DefinicionTramite | null = null;
  try {
    definicion = leerDefinicion(sol.tramiteVersion.definicion);
  } catch {
    error(SD, undefined, "La definición del trámite (requisitos y límites) no es válida; no se pudieron revisar los anexos.");
  }
  if (definicion) {
    const maxBytes = definicion.limitesPdf.maxMB * BYTES_POR_MB;
    const productos = new Map<string, string>();
    for (const p of sol.partidas) if (p.productoId) productos.set(p.productoId, p.denominacionEspecifica);
    const partidasSinProducto = sol.partidas.filter((p) => !p.productoId).length;

    for (const req of definicion.requisitos) {
      const ligados = sol.documentos.filter((sd) => sd.requisito === req.clave);
      if (req.obligatorio && ligados.length === 0) {
        error(SD, req.clave, `Falta el requisito obligatorio «${req.nombre}».`);
      }
      if (req.porProducto) {
        for (const [productoId, denominacion] of productos) {
          const tiene = ligados.some((sd) => sd.documento.productoId === productoId && req.tipos.includes(sd.documento.tipo as TipoDocumento));
          if (!tiene) aviso(SD, req.clave, `«${req.nombre}»: no hay documento ligado para el producto «${recortar(denominacion)}».`);
        }
        if (partidasSinProducto > 0 && ligados.length > 0) {
          aviso(SD, req.clave, `«${req.nombre}»: ${partidasSinProducto} mercancía(s) no están ligadas a un producto del catálogo; verifica que su documento esté anexado.`);
        }
      }
    }

    for (const sd of sol.documentos) {
      const d = sd.documento;
      const req = definicion.requisitos.find((r) => r.clave === sd.requisito);
      const nombre = `«${recortar(d.nombre, 60)}»`;
      if (!req) {
        aviso(SD, sd.requisito, `El documento ${nombre} está ligado al requisito «${sd.requisito}», que no existe en la definición vigente del trámite.`);
      } else if (!req.tipos.includes(d.tipo as TipoDocumento)) {
        error(SD, sd.requisito, `El documento ${nombre} no es del tipo que pide «${req.nombre}».`);
      }
      if (d.estadoConversion === "ERROR") {
        error(SD, sd.requisito, `La conversión a PDF VUCEM del documento ${nombre} falló: vuelve a subirlo o reemplázalo.`);
      } else if (d.estadoConversion !== "OK" && d.estadoConversion !== "ADVERTENCIA") {
        error(SD, sd.requisito, `El documento ${nombre} aún no está convertido al formato de VUCEM.`);
      } else if (!d.archivoVucemRuta) {
        error(SD, sd.requisito, `El documento ${nombre} no tiene el PDF convertido para VUCEM.`);
      }
      if (d.archivoVucemBytes != null && d.archivoVucemBytes > maxBytes) {
        error(
          SD,
          sd.requisito,
          `El documento ${nombre} pesa ${(d.archivoVucemBytes / BYTES_POR_MB).toFixed(2)} MB; el máximo es ${definicion.limitesPdf.maxMB} MB.`,
        );
      }
      if (d.vigenciaHasta) {
        const dias = diasNaturalesHasta(d.vigenciaHasta, hoy);
        if (dias < 0) error(SD, sd.requisito, `El documento ${nombre} venció el ${formatoFechaCorta(d.vigenciaHasta)}.`);
        else if (dias <= DIAS_AVISO_DOCUMENTO) {
          aviso(SD, sd.requisito, `El documento ${nombre} vence el ${formatoFechaCorta(d.vigenciaHasta)}.`);
        }
      }
      if (canal === "WS" && !d.eDocument) {
        aviso(
          SD,
          "idEDocument",
          `El documento ${nombre} aún no tiene eDocument: se digitalizará antes de enviar.${d.estadoEDocument === "ERROR" && d.errorEDocument ? ` Último error: ${d.errorEDocument}` : ""}`,
        );
      }
    }
  }

  return { errores, avisos, lista: errores.length === 0 };
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Agrupa problemas por sección, en el orden del portal. */
export function agruparPorSeccion(problemas: Problema[]): Array<{ seccion: string; problemas: Problema[] }> {
  const grupos = new Map<string, Problema[]>();
  for (const p of problemas) {
    const lista = grupos.get(p.seccion) ?? [];
    lista.push(p);
    grupos.set(p.seccion, lista);
  }
  const indice = (s: string) => {
    const i = ORDEN_SECCIONES.indexOf(s);
    return i === -1 ? ORDEN_SECCIONES.length : i;
  };
  return [...grupos.entries()].sort((a, b) => indice(a[0]) - indice(b[0])).map(([seccion, problemas]) => ({ seccion, problemas }));
}
