// Utilidades de presentación (puras) para la página de envío a VUCEM.

/** Indenta un XML de una sola línea para mostrarlo (no altera el contenido de los elementos). */
export function formatearXml(xml: string): string {
  const partes = xml.replace(/>\s+</g, "><").split(/(<[^>]+>)/).filter((p) => p !== "");
  let nivel = 0;
  const lineas: string[] = [];
  let i = 0;
  while (i < partes.length) {
    const parte = partes[i];
    const sangria = "  ".repeat(nivel);
    if (parte.startsWith("<?") || parte.startsWith("<!")) {
      lineas.push(sangria + parte);
    } else if (parte.startsWith("</")) {
      nivel = Math.max(0, nivel - 1);
      lineas.push("  ".repeat(nivel) + parte);
    } else if (parte.startsWith("<") && parte.endsWith("/>")) {
      lineas.push(sangria + parte);
    } else if (parte.startsWith("<")) {
      // <a>texto</a> en una sola línea.
      const texto = partes[i + 1];
      const cierre = partes[i + 2];
      if (texto !== undefined && !texto.startsWith("<") && cierre?.startsWith("</")) {
        lineas.push(sangria + parte + texto + cierre);
        i += 3;
        continue;
      }
      lineas.push(sangria + parte);
      nivel++;
    } else {
      lineas.push(sangria + parte);
    }
    i++;
  }
  return lineas.join("\n");
}

export const ETIQUETA_TIPO_ENVIO: Record<string, string> = {
  SOLICITUD_260211: "Solicitud 260211",
  DIGITALIZACION_REGISTRO: "Digitalización (registro)",
  DIGITALIZACION_CONSULTA: "Digitalización (consulta)",
};

export const ETIQUETA_ESTADO_EDOCUMENT: Record<string, string> = {
  NO_ENVIADO: "Sin digitalizar",
  PENDIENTE: "En proceso",
  OK: "Con eDocument",
  ERROR: "Error",
};

export const TONO_ESTADO_EDOCUMENT: Record<string, "neutro" | "info" | "exito" | "peligro"> = {
  NO_ENVIADO: "neutro",
  PENDIENTE: "info",
  OK: "exito",
  ERROR: "peligro",
};
