import "server-only";

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { tokenAleatorio } from "@/lib/crypto";

/** Carpeta privada de archivos (fuera de /public). */
export function carpetaAlmacen(): string {
  return path.resolve(process.env.STORAGE_DIR ?? "./storage");
}

function resolverSeguro(rutaRelativa: string): string {
  const base = carpetaAlmacen();
  const completa = path.resolve(base, rutaRelativa);
  if (!completa.startsWith(base + path.sep)) {
    throw new Error("Ruta de archivo inválida.");
  }
  return completa;
}

/**
 * Guarda un archivo de la empresa y regresa su ruta relativa.
 * Los nombres se generan aleatoriamente; el nombre original se guarda en la BD.
 */
export async function guardarArchivo(
  empresaId: string,
  datos: Buffer,
  extension: string,
  subcarpeta = "documentos",
): Promise<string> {
  const ext = extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const relativa = path.posix.join(empresaId, subcarpeta, `${tokenAleatorio(16)}.${ext}`);
  const completa = resolverSeguro(relativa);
  await mkdir(path.dirname(completa), { recursive: true });
  await writeFile(completa, datos);
  return relativa;
}

export async function leerArchivo(rutaRelativa: string): Promise<Buffer> {
  return readFile(resolverSeguro(rutaRelativa));
}

export async function borrarArchivo(rutaRelativa: string): Promise<void> {
  try {
    await unlink(resolverSeguro(rutaRelativa));
  } catch {
    // Si ya no existe, no hay nada que borrar.
  }
}

/** Verifica que una ruta pertenezca a la empresa (primer segmento = empresaId). */
export function rutaEsDeEmpresa(rutaRelativa: string, empresaId: string): boolean {
  return rutaRelativa.split("/")[0] === empresaId;
}
