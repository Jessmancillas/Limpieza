import { ETIQUETA_TIPO_DOCUMENTO, type Catalogo, type TipoDocumento, type TipoTercero } from "@/lib/constantes";
import { leerDefinicion, type DefinicionTramite } from "@/lib/tramite/definicion";
import { nombreTercero } from "@/lib/validacion/tercero";

import { planearAnexos } from "./anexos";
import type { SolicitudCompleta } from "./consultas";

// Hoja de captura para presentar la solicitud en el portal VUCEM (trámite 260211): todos los
// datos en el orden de las pantallas del portal, listos para copiar. Función pura.

export type CampoHoja = {
  etiqueta: string;
  /** Valor a capturar (clave de catálogo cuando aplica). "" = sin dato. */
  valor: string;
  /** Descripción de la clave según el catálogo. */
  descripcion?: string;
  nota?: string;
};
export type GrupoHoja = { titulo: string; campos: CampoHoja[]; nota?: string };
export type SeccionHoja = { numero: number; id: string; titulo: string; grupos: GrupoHoja[] };

/** Descripciones de catálogos VUCEM (clave → descripción). */
export type MapasCatalogo = Partial<Record<Catalogo, ReadonlyMap<string, string>>>;

/** Orden en que el portal muestra los terceros relacionados. */
export const ORDEN_TERCEROS: TipoTercero[] = ["FABRICANTE", "DESTINATARIO", "PROVEEDOR", "FACTURADOR"];
const TITULO_ROL: Record<TipoTercero, string> = {
  FABRICANTE: "Fabricante",
  DESTINATARIO: "Destinatario (destino final)",
  PROVEEDOR: "Proveedor",
  FACTURADOR: "Facturador",
};

function fecha(f: Date | null | undefined): string {
  if (!f) return "";
  const d = String(f.getUTCDate()).padStart(2, "0");
  const m = String(f.getUTCMonth() + 1).padStart(2, "0");
  return `${d}/${m}/${f.getUTCFullYear()}`;
}

const texto = (v: string | null | undefined) => (v ?? "").trim();

export function construirHojaCaptura(sol: SolicitudCompleta, mapas: MapasCatalogo = {}): SeccionHoja[] {
  const cat = (catalogo: Catalogo, etiqueta: string, clave: string | null | undefined, nota?: string): CampoHoja => {
    const valor = texto(clave);
    const descripcion = valor ? mapas[catalogo]?.get(valor) : undefined;
    return { etiqueta, valor, ...(descripcion ? { descripcion } : {}), ...(nota ? { nota } : {}) };
  };
  const campo = (etiqueta: string, valor: string | null | undefined, nota?: string): CampoHoja => ({
    etiqueta,
    valor: texto(valor),
    ...(nota ? { nota } : {}),
  });

  // 1. Solicitante
  const e = sol.empresa;
  const moral = e.tipoPersona === "MORAL";
  const solicitante: SeccionHoja = {
    numero: 1,
    id: "solicitante",
    titulo: "Solicitante",
    grupos: [
      {
        titulo: "Datos generales del solicitante",
        nota: "VUCEM los precarga con la e.firma con que inicias sesión; solo verifica que coincidan.",
        campos: [
          campo("RFC", e.rfc),
          campo("Tipo de persona", moral ? "Moral" : "Física", `Servicio web: ${moral ? "1" : "0"}`),
          moral
            ? campo("Denominación o razón social", e.razonSocial)
            : campo("Nombre", [e.nombre, e.apellidoPaterno, e.apellidoMaterno].filter(Boolean).join(" ")),
          ...(!moral && e.curp ? [campo("CURP", e.curp)] : []),
          campo("Correo electrónico", e.correoElectronico),
          campo("Teléfono", e.telefono),
        ],
      },
      {
        titulo: "Domicilio fiscal",
        campos: [
          campo("Calle", e.calle),
          campo("Número exterior", e.numeroExterior),
          campo("Número interior", e.numeroInterior),
          campo("Código postal", e.codigoPostal),
          campo("Colonia", e.colonia),
          campo("Localidad", e.localidad),
          campo("Municipio o alcaldía", e.municipio),
          cat("CAT_ENTIDAD", "Entidad federativa", e.entidadFederativa),
          cat("CAT_PAIS", "País", e.pais),
        ],
      },
    ],
  };

  // 2. Datos de la solicitud
  const est = sol.establecimiento;
  const gruposSolicitud: GrupoHoja[] = [
    {
      titulo: "Establecimiento",
      ...(est ? {} : { nota: "Falta elegir el establecimiento." }),
      campos: [
        campo("Denominación o razón social", est?.denominacionRazonSocial),
        campo("Correo electrónico del responsable sanitario", est?.correoElectronico),
        campo("RFC del responsable sanitario", est?.rfcResponsableSanitario),
        campo("Teléfono", est?.telefono),
      ],
    },
    {
      titulo: "Domicilio del establecimiento",
      campos: [
        campo("Calle", est?.calle),
        campo("Número exterior", est?.numeroExterior),
        campo("Código postal", est?.codigoPostal),
        cat("CAT_ENTIDAD", "Entidad federativa", est?.entidadFederativa),
        campo("Municipio o alcaldía", est?.municipio),
        campo("Colonia", est?.colonia),
        campo("Localidad", est?.localidad),
      ],
    },
    {
      titulo: "SCIAN",
      ...(est?.scian.length ? {} : { nota: "El establecimiento no tiene claves SCIAN." }),
      campos: (est?.scian ?? []).map((s, i) => {
        const descripcion = s.descripcion || mapas.CAT_SCIAN?.get(s.clave);
        return { etiqueta: `Clave SCIAN ${i + 1}`, valor: s.clave, ...(descripcion ? { descripcion } : {}) };
      }),
    },
    {
      titulo: "Aviso de funcionamiento o licencia sanitaria",
      nota: "En el portal son excluyentes: marca el aviso o captura el número de licencia.",
      campos: [
        campo("¿Cuenta con aviso de funcionamiento?", est ? (est.tieneAvisoFuncionamiento ? "Sí" : "No") : ""),
        campo("Número de licencia sanitaria", est?.noLicenciaSanitaria),
      ],
    },
    {
      titulo: "Régimen y aduana",
      campos: [cat("CAT_REGIMEN", "Régimen", sol.cveRegimen), cat("CAT_ADUANA", "Aduana de entrada", sol.cveAduana)],
    },
  ];

  if (sol.partidas.length === 0) gruposSolicitud.push({ titulo: "Mercancías", nota: "No hay mercancías capturadas.", campos: [] });
  sol.partidas.forEach((p, i) => {
    gruposSolicitud.push({
      titulo: `Mercancía ${i + 1}: ${p.denominacionEspecifica}`,
      campos: [
        cat("CAT_CLASIF_PRODUCTO", "Clasificación del producto", p.idClasificacionProducto),
        cat("CAT_SUBCLASIF_PRODUCTO", "Subclasificación del producto", p.idSubClasificacionProducto),
        campo("Denominación específica", p.denominacionEspecifica),
        campo("Denominación distintiva (marca)", p.denominacionDistintiva),
        campo("Denominación común o nombre científico", p.denominacionComunCientifica),
        cat("CAT_TIPO_PRODUCTO", "Tipo de producto", p.idTipoProducto),
        campo("Especifique", p.especifique),
        cat("CAT_FORMA_FARMACEUTICA", "Forma farmacéutica", p.idFormaFarmaceutica),
        cat("CAT_ESTADO_FISICO", "Estado físico", p.idEstadoFisico),
        { ...campo("Fracción arancelaria", p.fraccionArancelaria), ...(p.descripcionFraccion ? { descripcion: p.descripcionFraccion } : {}) },
        campo("Cantidad UMT", p.cantidadUMT),
        cat("CAT_UNIDAD_MEDIDA", "Unidad de medida tarifaria (UMT)", p.umt),
        campo("Cantidad UMC", p.cantidadUMC),
        cat("CAT_UNIDAD_MEDIDA", "Unidad de medida comercial (UMC)", p.umc),
        campo("Descripción de la UMC", p.desUMC),
        campo("Presentación o tipo de envase", p.presentacionTipoEnvase),
        campo("Número de registro sanitario", p.numRegistroSanitario),
        campo("Fecha de caducidad", fecha(p.fechaCaducidad)),
        cat("CAT_PAIS", "País de origen", p.cvePaisOrigen),
        cat("CAT_PAIS", "País de procedencia", p.cvePaisProcedencia),
        cat("CAT_USO_ESPECIFICO", "Uso específico", p.idUsoEspecifico),
      ],
    });
  });

  gruposSolicitud.push(
    {
      titulo: "Manifiestos y declaraciones",
      campos: [
        campo("Declaración bajo protesta de decir verdad", sol.cveDeclaracion ? "Acepto" : "", sol.cveDeclaracion ? undefined : "Pendiente de aceptar."),
        campo(
          "¿Está de acuerdo en hacer públicos los datos o anexos?",
          sol.informacionConfidencial ? "No" : "Sí",
          sol.informacionConfidencial ? "Contiene información confidencial." : undefined,
        ),
      ],
    },
    {
      titulo: "Representante legal",
      campos: [
        campo("RFC", sol.rlRfc),
        campo("Nombre", sol.rlNombre),
        campo("Apellido paterno", sol.rlApellidoPaterno),
        campo("Apellido materno", sol.rlApellidoMaterno),
      ],
    },
  );

  const datosSolicitud: SeccionHoja = { numero: 2, id: "datos-solicitud", titulo: "Datos de la solicitud", grupos: gruposSolicitud };

  // 3. Terceros relacionados
  const gruposTerceros: GrupoHoja[] = [];
  for (const rol of ORDEN_TERCEROS) {
    const lista = sol.terceros.filter((t) => t.rol === rol);
    if (lista.length === 0) {
      gruposTerceros.push({
        titulo: TITULO_ROL[rol],
        nota: rol === "FABRICANTE" || rol === "DESTINATARIO" ? "Falta capturarlo (el portal lo exige)." : "No se capturó.",
        campos: [],
      });
      continue;
    }
    lista.forEach(({ tercero: t }, i) => {
      const fisica = t.tipoPersona === "FISICA";
      gruposTerceros.push({
        titulo: `${TITULO_ROL[rol]}${lista.length > 1 ? ` ${i + 1}` : ""}: ${nombreTercero(t)}`,
        campos: [
          campo("Tipo de persona", fisica ? "Física" : "Moral"),
          ...(fisica
            ? [campo("Nombre", t.nombre), campo("Apellido paterno", t.apellidoPaterno), campo("Apellido materno", t.apellidoMaterno)]
            : []),
          ...(!fisica || rol === "DESTINATARIO" ? [campo("Denominación o razón social", t.denominacionRazonSocial)] : []),
          ...(t.rfc || rol === "DESTINATARIO" ? [campo("RFC", t.rfc)] : []),
          campo("Correo electrónico", t.correoElectronico),
          cat("CAT_PAIS", "País", t.pais),
          t.nacionalidad === "NACIONAL" || t.pais === "MEX"
            ? cat("CAT_ENTIDAD", "Entidad federativa", t.entidadFederativa)
            : campo("Estado o provincia", t.entidadFederativa),
          ...(t.municipio || rol === "DESTINATARIO" ? [campo("Municipio o alcaldía", t.municipio)] : []),
          ...(t.localidad || rol === "DESTINATARIO" ? [campo("Localidad", t.localidad)] : []),
          ...(t.colonia || rol === "DESTINATARIO" ? [campo("Colonia", t.colonia)] : []),
          campo("Código postal", t.codigoPostal),
          campo("Calle", t.calle),
          campo("Número exterior", t.numeroExterior),
          campo("Número interior", t.numeroInterior),
          ...(rol !== "DESTINATARIO" ? [campo("Lada", t.lada)] : []),
          campo("Teléfono", t.telefono),
        ],
      });
    });
  }
  const terceros: SeccionHoja = { numero: 3, id: "terceros", titulo: "Terceros relacionados", grupos: gruposTerceros };

  // 4. Pago de derechos
  const pago: SeccionHoja = {
    numero: 4,
    id: "pago",
    titulo: "Pago de derechos",
    grupos: [
      sol.pagoOmitido
        ? { titulo: "Pago de derechos", nota: "Se indicó que esta solicitud no requiere pago de derechos.", campos: [] }
        : {
            titulo: "Datos del pago (e5cinco)",
            campos: [
              campo("Clave de referencia", sol.claveReferencia),
              campo("Cadena de la dependencia", sol.cadenaDependencia),
              cat("CAT_BANCO", "Banco", sol.cveBanco),
              campo("Llave de pago", sol.llavePago),
              campo("Fecha de pago", fecha(sol.fechaPago)),
              campo("Importe pagado", sol.importePago),
            ],
          },
    ],
  };

  // 5. Requisitos / anexos
  let definicion: DefinicionTramite | null = null;
  try {
    definicion = leerDefinicion(sol.tramiteVersion.definicion);
  } catch {
    definicion = null;
  }
  const anexos = planearAnexos(sol.documentos, definicion);
  const gruposAnexos: GrupoHoja[] = [];
  const describirAnexo = (a: (typeof anexos)[number]): CampoHoja => {
    const d = a.documento;
    const notas = [
      ETIQUETA_TIPO_DOCUMENTO[d.tipo as TipoDocumento] ?? d.tipo,
      d.eDocument ? `eDocument ${d.eDocument}` : null,
      d.estadoConversion === "OK" || d.estadoConversion === "ADVERTENCIA" ? null : "Pendiente de convertir",
    ].filter(Boolean);
    return { etiqueta: d.nombre, valor: a.nombreArchivo, nota: notas.join(" · ") };
  };
  for (const req of definicion?.requisitos ?? []) {
    const lista = anexos.filter((a) => a.requisito === req.clave);
    gruposAnexos.push({
      titulo: `${req.nombre}${req.obligatorio ? " (obligatorio)" : ""}`,
      ...(lista.length === 0 ? { nota: req.obligatorio ? "Falta anexar." : "Sin documentos." } : req.nota ? { nota: req.nota } : {}),
      campos: lista.map(describirAnexo),
    });
  }
  const huerfanos = anexos.filter((a) => !definicion?.requisitos.some((r) => r.clave === a.requisito));
  if (huerfanos.length > 0) gruposAnexos.push({ titulo: "Otros anexos", campos: huerfanos.map(describirAnexo) });
  if (!definicion) gruposAnexos.unshift({ titulo: "Requisitos", nota: "La definición del trámite no es válida.", campos: [] });

  const requisitos: SeccionHoja = {
    numero: 5,
    id: "anexos",
    titulo: "Requisitos y anexos",
    grupos: gruposAnexos,
  };

  return [solicitante, datosSolicitud, terceros, pago, requisitos];
}
