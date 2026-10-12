// Lectura de catálogos en CSV (módulo puro, sin dependencias del servidor; se prueba con Vitest).
//
// Formato aceptado: columnas `clave,descripcion[,padreClave]`, separadas por coma, punto y coma o
// tabulador; primera fila de encabezado opcional; texto UTF-8 (con o sin BOM); comillas dobles
// estilo RFC 4180 para valores que contienen el separador, saltos de línea o comillas ("").

export type Separador = "," | ";" | "\t";
export type OpcionSeparador = Separador | "auto";

export const LIMITES_CSV = {
  clave: 60,
  descripcion: 500,
  renglones: 20_000,
} as const;

export type RegistroCsv = {
  /** Número de renglón en el archivo (1 = primera línea). */
  renglon: number;
  clave: string;
  descripcion: string;
  /** undefined = el renglón no trae tercera columna (no se toca el padre al actualizar). */
  padreClave?: string | null;
};

export type ErrorRenglon = { renglon: number; mensaje: string };

export type ResultadoCsv = {
  separador: Separador;
  conEncabezado: boolean;
  registros: RegistroCsv[];
  errores: ErrorRenglon[];
  /** Error que impide procesar el archivo completo (vacío, demasiado grande…). */
  errorGeneral?: string;
};

type Fila = { renglon: number; celdas: string[] };

export function quitarBom(texto: string): string {
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

/** Normaliza para comparar sin importar mayúsculas ni acentos. */
export function normalizarTexto(valor: string): string {
  return valor.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/**
 * Divide el texto en filas y celdas respetando comillas. Las filas totalmente vacías se omiten.
 * Si una comilla queda sin cerrar, se reporta en `errores` y se descarta esa fila.
 */
export function dividirCsv(texto: string, separador: Separador): { filas: Fila[]; errores: ErrorRenglon[] } {
  const filas: Fila[] = [];
  const errores: ErrorRenglon[] = [];
  const t = quitarBom(texto);

  let celdas: string[] = [];
  let celda = "";
  let entreComillas = false;
  let celdaConComillas = false;
  let linea = 1;
  let renglonInicio = 1;

  const cerrarCelda = () => {
    celdas.push(celdaConComillas ? celda : celda.trim());
    celda = "";
    celdaConComillas = false;
  };
  const cerrarFila = () => {
    cerrarCelda();
    const vacia = celdas.every((c) => c.trim() === "");
    if (!vacia) filas.push({ renglon: renglonInicio, celdas });
    celdas = [];
  };

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (entreComillas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          celda += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        if (c === "\n" || (c === "\r" && t[i + 1] !== "\n")) linea++;
        celda += c;
      }
      continue;
    }
    if (c === '"' && celda.trim() === "") {
      // Comilla al inicio de la celda: valor entrecomillado.
      celda = "";
      entreComillas = true;
      celdaConComillas = true;
    } else if (c === separador) {
      cerrarCelda();
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      cerrarFila();
      linea++;
      renglonInicio = linea;
    } else {
      celda += c;
    }
  }

  if (entreComillas) {
    errores.push({ renglon: renglonInicio, mensaje: "Comillas sin cerrar: se descartó el renglón." });
  } else if (celda !== "" || celdas.length > 0) {
    cerrarFila();
  }
  return { filas, errores };
}

/** Quita celdas vacías sobrantes al final (p. ej. "A;B;;" exportado por Excel). */
function recortarCeldas(celdas: string[]): string[] {
  const r = [...celdas];
  while (r.length > 3 && r[r.length - 1].trim() === "") r.pop();
  return r;
}

/**
 * Detecta el separador: el primero (tabulador, punto y coma, coma) con el que las primeras filas
 * tienen 2 o 3 columnas. Se prefiere punto y coma sobre coma porque Excel en español exporta así y
 * las descripciones suelen llevar comas.
 */
export function detectarSeparador(texto: string): Separador {
  const candidatos: Separador[] = ["\t", ";", ","];
  let mejor: Separador = ",";
  let mejorPuntaje = -1;
  for (const s of candidatos) {
    const { filas } = dividirCsv(texto, s);
    const muestra = filas.slice(0, 10);
    if (muestra.length === 0) continue;
    const validas = muestra.filter((f) => {
      const n = recortarCeldas(f.celdas).length;
      return n === 2 || n === 3;
    }).length;
    if (validas === muestra.length) return s;
    if (validas > mejorPuntaje) {
      mejor = s;
      mejorPuntaje = validas;
    }
  }
  return mejor;
}

function esEncabezado(celdas: string[]): boolean {
  const primera = normalizarTexto(celdas[0] ?? "");
  const segunda = normalizarTexto(celdas[1] ?? "");
  return ["clave", "cve", "codigo", "id"].includes(primera) || segunda.startsWith("descripcion");
}

/** Lee un CSV de catálogo y valida cada renglón. No lanza errores: todo se reporta en el resultado. */
export function parsearCatalogoCsv(texto: string, opciones: { separador?: OpcionSeparador } = {}): ResultadoCsv {
  const limpio = quitarBom(texto ?? "");
  const separador =
    !opciones.separador || opciones.separador === "auto" ? detectarSeparador(limpio) : opciones.separador;
  const base: ResultadoCsv = { separador, conEncabezado: false, registros: [], errores: [] };

  if (limpio.trim() === "") return { ...base, errorGeneral: "No hay datos: el archivo o el texto está vacío." };

  const { filas, errores } = dividirCsv(limpio, separador);
  if (filas.length === 0) return { ...base, errores, errorGeneral: "No se encontraron renglones con datos." };

  const conEncabezado = esEncabezado(filas[0].celdas);
  const datos = conEncabezado ? filas.slice(1) : filas;
  if (datos.length > LIMITES_CSV.renglones) {
    return {
      ...base,
      conEncabezado,
      errorGeneral: `El archivo tiene ${datos.length.toLocaleString("es-MX")} renglones; el máximo por importación es ${LIMITES_CSV.renglones.toLocaleString("es-MX")}. Divídelo en partes.`,
    };
  }

  const registros: RegistroCsv[] = [];
  const vistos = new Map<string, number>();

  for (const fila of datos) {
    const celdas = recortarCeldas(fila.celdas);
    const r = fila.renglon;
    if (celdas.length < 2) {
      errores.push({ renglon: r, mensaje: "Faltan columnas: se esperan clave y descripción." });
      continue;
    }
    if (celdas.length > 3) {
      errores.push({ renglon: r, mensaje: `Tiene ${celdas.length} columnas; máximo 3 (clave, descripción, clave padre).` });
      continue;
    }
    const clave = celdas[0].trim();
    const descripcion = celdas[1].trim().replace(/\s+/g, " ");
    const padre = celdas.length === 3 ? celdas[2].trim() : undefined;

    if (!clave) {
      errores.push({ renglon: r, mensaje: "La clave está vacía." });
      continue;
    }
    if (clave.length > LIMITES_CSV.clave) {
      errores.push({ renglon: r, mensaje: `La clave excede ${LIMITES_CSV.clave} caracteres.` });
      continue;
    }
    if (!descripcion) {
      errores.push({ renglon: r, mensaje: `La descripción de la clave "${clave}" está vacía.` });
      continue;
    }
    if (descripcion.length > LIMITES_CSV.descripcion) {
      errores.push({ renglon: r, mensaje: `La descripción excede ${LIMITES_CSV.descripcion} caracteres.` });
      continue;
    }
    if (padre && padre.length > LIMITES_CSV.clave) {
      errores.push({ renglon: r, mensaje: `La clave padre excede ${LIMITES_CSV.clave} caracteres.` });
      continue;
    }
    const previo = vistos.get(clave);
    if (previo !== undefined) {
      errores.push({ renglon: r, mensaje: `La clave "${clave}" está repetida (ya aparece en el renglón ${previo}).` });
      continue;
    }
    vistos.set(clave, r);
    registros.push({
      renglon: r,
      clave,
      descripcion,
      ...(padre === undefined ? {} : { padreClave: padre === "" ? null : padre }),
    });
  }

  errores.sort((a, b) => a.renglon - b.renglon);
  return { separador, conEncabezado, registros, errores };
}

export const NOMBRE_SEPARADOR: Record<Separador, string> = {
  ",": "coma",
  ";": "punto y coma",
  "\t": "tabulador",
};
