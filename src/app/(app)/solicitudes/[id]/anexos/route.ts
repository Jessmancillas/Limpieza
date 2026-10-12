import JSZip from "jszip";
import type { NextRequest } from "next/server";

import { obtenerContexto } from "@/lib/auth/contexto";
import { planearAnexos } from "@/lib/solicitudes/anexos";
import { dispositionAdjunto } from "@/lib/solicitudes/archivos";
import { cargarSolicitudCompleta } from "@/lib/solicitudes/consultas";
import { leerArchivo, rutaEsDeEmpresa } from "@/lib/storage";
import { leerDefinicion, type DefinicionTramite } from "@/lib/tramite/definicion";

/** ZIP con los PDF convertidos para VUCEM de los documentos ligados a la solicitud. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await obtenerContexto();
  const empresaId = ctx.empresa.id;
  const sol = await cargarSolicitudCompleta(empresaId, id);
  if (!sol) return new Response("Solicitud no encontrada.", { status: 404, headers: { "Cache-Control": "no-store" } });

  let definicion: DefinicionTramite | null = null;
  try {
    definicion = leerDefinicion(sol.tramiteVersion.definicion);
  } catch {
    definicion = null;
  }

  const zip = new JSZip();
  const omitidos: string[] = [];
  for (const anexo of planearAnexos(sol.documentos, definicion)) {
    const d = anexo.documento;
    if (d.empresaId !== empresaId) continue;
    if (!d.archivoVucemRuta || !rutaEsDeEmpresa(d.archivoVucemRuta, empresaId)) {
      omitidos.push(`${anexo.nombreRequisito} · ${d.nombre}: aún no tiene el PDF convertido para VUCEM.`);
      continue;
    }
    try {
      zip.file(anexo.nombreArchivo, await leerArchivo(d.archivoVucemRuta));
    } catch {
      omitidos.push(`${anexo.nombreRequisito} · ${d.nombre}: no se encontró el archivo convertido.`);
    }
  }
  if (omitidos.length > 0) {
    zip.file(
      "LEEME.txt",
      ["Documentos ligados que no se incluyeron en este ZIP:", "", ...omitidos.map((o) => `- ${o}`), ""].join("\r\n"),
    );
  }

  // Los PDF ya vienen comprimidos: se guardan sin recomprimir.
  const contenido = await zip.generateAsync({ type: "arraybuffer", compression: "STORE" });
  return new Response(contenido, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": dispositionAdjunto(`solicitud-${sol.numero}-anexos.zip`),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
