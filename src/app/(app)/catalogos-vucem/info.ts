import { CATALOGOS, type Catalogo } from "@/lib/constantes";

/** true si el texto es el nombre técnico de un catálogo conocido (CAT_PAIS, CAT_ADUANA…). */
export function esCatalogo(valor: string): valor is Catalogo {
  return Object.prototype.hasOwnProperty.call(CATALOGOS, valor);
}

export const ETIQUETA_FUENTE: Record<string, string> = {
  SEMILLA: "Semilla",
  IMPORTADO: "Importado",
  MANUAL: "Manual",
};

const CLAVES_INTERNAS =
  "Las claves de este catálogo son identificadores internos de VUCEM y no se publican. " +
  "Las de la semilla son solo los ejemplos del manual del servicio web: importa el catálogo oficial " +
  "(CSV) antes de presentar solicitudes reales.";

/** Explicación que se muestra en la página de cada catálogo. */
export const NOTA_CATALOGO: Partial<Record<Catalogo, string>> = {
  CAT_PAIS:
    "Países según ISO 3166-1 alfa-3 con nombre en español. El servicio web usa claves de 3 letras " +
    "(MEX, USA, AUS…) para país de origen, procedencia y domicilio de terceros.",
  CAT_ENTIDAD:
    "Las 32 entidades federativas, con la clave escrita como nombre en mayúsculas sin acentos " +
    "(p. ej. SINALOA, CIUDAD DE MEXICO), que es como aparece el ejemplo del establecimiento en el manual. " +
    "En otros apartados el manual muestra una clave corta (p. ej. MEX) y longitudes máximas menores, " +
    "por eso todas las claves están marcadas por confirmar: si VUCEM te rechaza el valor, importa el catálogo oficial.",
  CAT_UNIDAD_MEDIDA:
    "Claves del Apéndice 7 del Anexo 22 de las Reglas Generales de Comercio Exterior. VUCEM puede usar " +
    "un catálogo propio de unidades por trámite (CAT_UNIDAD_MEDIDA_TTRA): confírmalo antes de presentar.",
  CAT_ADUANA:
    "Aduanas del Apéndice 1 del Anexo 22 (RGCE), clave de 3 dígitos: aduana (2) + sección (1), p. ej. 470 " +
    "= Aeropuerto Internacional de la Ciudad de México. Solo se incluyen las secciones principales.",
  CAT_REGIMEN: "Solo trae la clave de ejemplo del manual. Importa o captura las claves de régimen vigentes.",
  CAT_SCIAN:
    "Selección de claves SCIAN 2018 (INEGI) relacionadas con dispositivos médicos. Puedes agregar o importar " +
    "las claves que tenga registradas tu establecimiento.",
  CAT_CLASIF_PRODUCTO: CLAVES_INTERNAS,
  CAT_SUBCLASIF_PRODUCTO: `${CLAVES_INTERNAS} La columna "clave padre" indica la clasificación a la que pertenece cada subclasificación.`,
  CAT_TIPO_PRODUCTO: CLAVES_INTERNAS,
  CAT_FORMA_FARMACEUTICA: CLAVES_INTERNAS,
  CAT_ESTADO_FISICO: CLAVES_INTERNAS,
  CAT_USO_ESPECIFICO: CLAVES_INTERNAS,
  CAT_BANCO: "Clave del banco donde se pagaron los derechos (e5cinco). Solo trae la clave de ejemplo del manual.",
  CAT_TIPO_DOCUMENTO:
    "Tipos de documento del servicio de digitalización de VUCEM (idTipoDocumento). No se incluye semilla: " +
    "importa el catálogo oficial.",
};
