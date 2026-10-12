import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Utilerías de Poppler (pdfinfo, pdftoppm). Siempre con execFile y argumentos en arreglo:
// nunca se pasa nada por un shell.

/** Carpeta de los binarios de Poppler (en macOS con Homebrew: POPPLER_DIR=/opt/homebrew/bin). */
function binario(programa: "pdfinfo" | "pdftoppm"): string {
  return path.join(process.env.POPPLER_DIR ?? "/usr/bin", programa);
}

export class ErrorPoppler extends Error {
  constructor(
    mensaje: string,
    readonly codigo: number | string | null,
    readonly stderr: string,
    readonly porTiempo: boolean,
  ) {
    super(mensaje);
    this.name = "ErrorPoppler";
  }
}

export function ejecutarPoppler(
  programa: "pdfinfo" | "pdftoppm",
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      binario(programa),
      args,
      {
        timeout: Math.max(1, Math.floor(timeoutMs)),
        killSignal: "SIGKILL",
        maxBuffer: 4 * 1024 * 1024,
        encoding: "latin1",
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          const porTiempo = Boolean((error as { killed?: boolean }).killed) || error.signal === "SIGKILL";
          reject(new ErrorPoppler(`${programa} falló`, error.code ?? null, String(stderr ?? ""), porTiempo));
          return;
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

/** Indica si el error de Poppler se debe a que el PDF pide contraseña para abrirse. */
export function esErrorDeContrasena(error: unknown): boolean {
  return error instanceof ErrorPoppler && /incorrect password|password/i.test(error.stderr);
}

/** Crea un directorio temporal único, ejecuta `fn` y lo borra siempre al terminar. */
export async function conDirectorioTemporal<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "vucem-pdf-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export type InfoPdf = {
  paginas: number;
  cifrado: boolean;
  /** "AcroForm" | "XFA" | "none" según pdfinfo (null si no lo reporta). */
  formulario: string | null;
  /** pdfinfo ≥ 0.86 reporta "JavaScript: yes/no" (null si no lo reporta). */
  javascript: boolean | null;
  /** Tamaño de cada página en puntos (solo las solicitadas con `hastaPagina`). */
  tamanos: Array<{ ancho: number; alto: number }>;
};

/** Ejecuta pdfinfo sobre un archivo y analiza su salida. */
export async function leerInfoPdf(ruta: string, timeoutMs: number, hastaPagina = 1): Promise<InfoPdf> {
  const { stdout } = await ejecutarPoppler("pdfinfo", ["-f", "1", "-l", String(Math.max(1, hastaPagina)), ruta], timeoutMs);
  const campo = (nombre: string) => stdout.match(new RegExp(`^${nombre}:\\s*(.*)$`, "m"))?.[1]?.trim() ?? null;
  const paginas = Number.parseInt(campo("Pages") ?? "", 10);
  const javascript = campo("JavaScript");
  const tamanos = [...stdout.matchAll(/^Page\s+\d+\s+size:\s*([\d.]+)\s*x\s*([\d.]+)\s*pts/gm)].map((m) => ({
    ancho: Number(m[1]),
    alto: Number(m[2]),
  }));
  return {
    paginas: Number.isFinite(paginas) ? paginas : 0,
    cifrado: /^yes/i.test(campo("Encrypted") ?? ""),
    formulario: campo("Form"),
    javascript: javascript === null ? null : /^yes/i.test(javascript),
    tamanos,
  };
}
