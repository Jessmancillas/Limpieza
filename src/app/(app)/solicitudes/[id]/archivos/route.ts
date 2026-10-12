import type { NextRequest } from "next/server";

import { obtenerContexto } from "@/lib/auth/contexto";
import { db } from "@/lib/db";
import { dispositionAdjunto } from "@/lib/solicitudes/archivos";
import { leerArchivo, rutaEsDeEmpresa } from "@/lib/storage";

const SIN_CACHE = { "Cache-Control": "no-store" };

/** Descarga del acuse (?tipo=acuse) o del PDF de la resolución (?tipo=resolucion). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tipo = request.nextUrl.searchParams.get("tipo");
  if (tipo !== "acuse" && tipo !== "resolucion") {
    return new Response("Tipo de archivo inválido.", { status: 400, headers: SIN_CACHE });
  }
  const ctx = await obtenerContexto();
  const empresaId = ctx.empresa.id;
  const sol = await db.solicitud.findFirst({
    where: { id, empresaId },
    select: { numero: true, acuseRuta: true, resolucion: { select: { documentoRuta: true } } },
  });
  const ruta = tipo === "acuse" ? sol?.acuseRuta : sol?.resolucion?.documentoRuta;
  if (!sol || !ruta || !rutaEsDeEmpresa(ruta, empresaId)) {
    return new Response("Archivo no encontrado.", { status: 404, headers: SIN_CACHE });
  }
  let datos: Buffer;
  try {
    datos = await leerArchivo(ruta);
  } catch {
    return new Response("Archivo no encontrado.", { status: 404, headers: SIN_CACHE });
  }
  const nombre = `solicitud-${sol.numero}-${tipo === "acuse" ? "acuse" : "resolucion"}.pdf`;
  return new Response(new Uint8Array(datos), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": dispositionAdjunto(nombre),
      "Content-Length": String(datos.length),
      ...SIN_CACHE,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
