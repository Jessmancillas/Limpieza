import type { NextRequest } from "next/server";

import { obtenerContexto } from "@/lib/auth/contexto";
import { obtenerSesion } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { EXTENSION_POR_MIME, MIMES_ACEPTADOS, type MimeAceptado } from "@/lib/pdf/limites";
import { encabezadoDescarga, nombreArchivoSeguro } from "@/lib/pdf/nombre-documento";
import { leerArchivo, rutaEsDeEmpresa } from "@/lib/storage";

/** Encabezados comunes: nada de caché compartida ni interpretación del contenido por el navegador. */
const SEGURIDAD = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function texto(status: number, mensaje: string) {
  return new Response(mensaje, { status, headers: { ...SEGURIDAD, "Content-Type": "text/plain; charset=utf-8" } });
}

/**
 * Descarga del archivo de un documento: ?version=original (lo que subió el usuario) o
 * ?version=vucem (PDF convertido). Solo documentos de la empresa activa del usuario.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await obtenerSesion();
  if (!sesion) return texto(401, "Inicia sesión para descargar el documento.");
  const ctx = await obtenerContexto();
  const empresaId = ctx.empresa.id;

  const version = request.nextUrl.searchParams.get("version") ?? "vucem";
  if (version !== "original" && version !== "vucem") return texto(400, "Versión inválida: usa original o vucem.");

  const { id } = await params;
  const doc = await db.documento.findFirst({
    where: { id, empresaId },
    select: {
      nombre: true,
      archivoOriginalRuta: true,
      archivoOriginalNombre: true,
      archivoOriginalMime: true,
      archivoVucemRuta: true,
    },
  });
  if (!doc) return texto(404, "Documento no encontrado.");

  const ruta = version === "original" ? doc.archivoOriginalRuta : doc.archivoVucemRuta;
  if (!ruta) return texto(404, "El documento aún no tiene versión para VUCEM.");
  if (!rutaEsDeEmpresa(ruta, empresaId)) {
    console.error(`Ruta de archivo ajena a la empresa en el documento ${id}.`);
    return texto(404, "Documento no encontrado.");
  }

  let datos: Buffer;
  try {
    datos = await leerArchivo(ruta);
  } catch {
    return texto(404, "No se encontró el archivo en el almacenamiento.");
  }

  let tipo: string;
  let nombre: string;
  if (version === "vucem") {
    tipo = "application/pdf";
    nombre = nombreArchivoSeguro(doc.nombre, "pdf");
  } else {
    const mime = (MIMES_ACEPTADOS as readonly string[]).includes(doc.archivoOriginalMime)
      ? (doc.archivoOriginalMime as MimeAceptado)
      : null;
    tipo = mime ?? "application/octet-stream";
    nombre = nombreArchivoSeguro(doc.archivoOriginalNombre, mime ? EXTENSION_POR_MIME[mime] : undefined);
  }

  return new Response(new Uint8Array(datos), {
    status: 200,
    headers: {
      ...SEGURIDAD,
      "Content-Type": tipo,
      "Content-Length": String(datos.length),
      "Content-Disposition": encabezadoDescarga(nombre),
      // Si alguien lo abre directo en el navegador, que no pueda ejecutar nada.
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
