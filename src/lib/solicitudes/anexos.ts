import type { DefinicionTramite } from "@/lib/tramite/definicion";

import type { SolicitudCompleta } from "./consultas";

// Orden y nombres de los anexos de una solicitud (lo usan la hoja de captura y el ZIP de anexos,
// para que el nombre que ve el usuario en la hoja sea el mismo del archivo descargado).

/** Texto seguro para nombre de archivo: sin acentos, solo letras, dígitos, "-" y "_". */
export function sanearNombreArchivo(texto: string, max = 60): string {
  const limpio = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, max)
    .replace(/[_-]+$/g, "");
  return limpio || "documento";
}

export type AnexoPlaneado = {
  /** Consecutivo 1..N */
  indice: number;
  /** Nombre dentro del ZIP: "NN_<requisito>_<nombre>.pdf" */
  nombreArchivo: string;
  requisito: string;
  /** Nombre del requisito según la definición (o la clave si ya no existe). */
  nombreRequisito: string;
  documento: SolicitudCompleta["documentos"][number]["documento"];
};

/**
 * Lista ordenada de anexos: primero por el orden de los requisitos en la definición del trámite,
 * luego en el orden en que se ligaron. Los ligados a requisitos que ya no existen van al final.
 */
export function planearAnexos(
  documentos: Pick<SolicitudCompleta, "documentos">["documentos"],
  definicion: DefinicionTramite | null,
): AnexoPlaneado[] {
  const orden = new Map((definicion?.requisitos ?? []).map((r, i) => [r.clave, i]));
  const nombres = new Map((definicion?.requisitos ?? []).map((r) => [r.clave, r.nombre]));
  const ordenados = documentos
    .map((sd, i) => ({ sd, i }))
    .sort((a, b) => (orden.get(a.sd.requisito) ?? 9999) - (orden.get(b.sd.requisito) ?? 9999) || a.i - b.i);
  const ancho = Math.max(2, String(ordenados.length).length);
  return ordenados.map(({ sd }, i) => {
    const indice = i + 1;
    const nn = String(indice).padStart(ancho, "0");
    return {
      indice,
      nombreArchivo: `${nn}_${sanearNombreArchivo(sd.requisito, 30)}_${sanearNombreArchivo(sd.documento.nombre)}.pdf`,
      requisito: sd.requisito,
      nombreRequisito: nombres.get(sd.requisito) ?? sd.requisito,
      documento: sd.documento,
    };
  });
}
