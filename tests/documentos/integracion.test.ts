// Pruebas de integración del módulo de documentos: server actions y descarga contra una base
// SQLite temporal (creada con las migraciones) y un almacenamiento temporal. Se simulan la
// sesión y la caché/navegación de Next. La conversión a formato VUCEM es la real.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { NextRequest } from "next/server";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const entorno = vi.hoisted(() => {
  // Se fijan antes de importar @/lib/db (lee DATABASE_URL al cargarse) y @/lib/storage.
  const dir = `${process.env.TMPDIR ?? "/tmp"}/documentos-${process.pid}-${Date.now()}`;
  const archivo = `${dir}/prueba.db`;
  process.env.DATABASE_URL = `file:${archivo}`;
  process.env.STORAGE_DIR = `${dir}/almacen`;
  return {
    dir,
    archivo,
    almacen: `${dir}/almacen`,
    ctx: null as null | Record<string, unknown>,
    sesion: null as null | Record<string, unknown>,
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((ruta: string) => {
    throw new Error(`REDIRECT:${ruta}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("@/lib/auth/session", () => ({ obtenerSesion: vi.fn(async () => entorno.sesion) }));
vi.mock("@/lib/auth/contexto", () => {
  class ErrorPermiso extends Error {
    constructor(mensaje = "No tienes permiso para realizar esta acción.") {
      super(mensaje);
      this.name = "ErrorPermiso";
    }
  }
  return {
    ErrorPermiso,
    obtenerContexto: vi.fn(async () => entorno.ctx),
    exigirRol: (ctx: { rol: string }, roles: string[]) => {
      if (!roles.includes(ctx.rol)) throw new ErrorPermiso();
    },
    exigirEdicion: (ctx: { rol: string }) => {
      if (!["ADMIN", "CAPTURISTA"].includes(ctx.rol)) throw new ErrorPermiso();
    },
  };
});

beforeAll(() => {
  mkdirSync(entorno.dir, { recursive: true });
  const sqlite = new Database(entorno.archivo);
  const dirMig = path.resolve(__dirname, "../../prisma/migrations");
  for (const m of readdirSync(dirMig).filter((d) => !d.endsWith(".toml")).sort()) {
    sqlite.exec(readFileSync(path.join(dirMig, m, "migration.sql"), "utf8"));
  }
  sqlite.close();
});

afterAll(async () => {
  const { db } = await import("@/lib/db");
  await db.$disconnect();
  rmSync(entorno.dir, { recursive: true, force: true });
});

async function modulos() {
  const { db } = await import("@/lib/db");
  const acciones = await import("@/app/(app)/documentos/acciones");
  const ruta = await import("@/app/api/documentos/[id]/archivo/route");
  const { sha1Hex } = await import("@/lib/crypto");
  return { db, acciones, ruta, sha1Hex };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

async function pdfConTexto(texto = "Licencia sanitaria", paginas = 1): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < paginas; i++) {
    const p = doc.addPage([612, 792]);
    p.drawText(`${texto} ${i + 1}`, { x: 72, y: 700, size: 24, font: fuente, color: rgb(0.8, 0, 0) });
  }
  return Buffer.from(await doc.save());
}

async function pdfEnBlanco(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  return Buffer.from(await doc.save());
}

function archivo(datos: Buffer, nombre: string, tipo = "application/pdf"): File {
  return new File([new Uint8Array(datos)], nombre, { type: tipo });
}

function formulario(campos: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.append(k, v);
  return fd;
}

/** Ejecuta una acción que termina en redirect y regresa la ruta. */
async function rutaDeRedireccion(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
  } catch (e) {
    const m = (e as Error).message.match(/^REDIRECT:(.*)$/);
    if (m) return m[1];
    throw e;
  }
  throw new Error("La acción no redirigió.");
}

function idDeRuta(ruta: string): string {
  const id = ruta.match(/^\/documentos\/([^/?]+)/)?.[1];
  if (!id) throw new Error(`Ruta inesperada: ${ruta}`);
  return id;
}

function descargar(id: string, version?: string) {
  const { ruta } = estado.modulos!;
  const url = `http://localhost/api/documentos/${id}/archivo${version ? `?version=${version}` : ""}`;
  return ruta.GET(new NextRequest(url), { params: Promise.resolve({ id }) });
}

const VACIO = { ok: false };
const estado: {
  modulos?: Awaited<ReturnType<typeof modulos>>;
  empresa: string;
  otraEmpresa: string;
  usuario: string;
  producto: string;
  productoAjeno: string;
  establecimiento: string;
  tramiteVersion: string;
} = { empresa: "", otraEmpresa: "", usuario: "", producto: "", productoAjeno: "", establecimiento: "", tramiteVersion: "" };

beforeAll(async () => {
  estado.modulos = await modulos();
  const { db } = estado.modulos;
  const usuario = await db.usuario.create({ data: { email: "cap@ejemplo.mx", nombre: "Capturista", passwordHash: "x" } });
  const empresa = await db.empresa.create({
    data: { rfc: "AAA010101AAA", razonSocial: "IMPORTADORA SA DE CV", correoElectronico: "e@ejemplo.mx" },
  });
  const otra = await db.empresa.create({ data: { rfc: "BBB010101BBB", razonSocial: "OTRA SA DE CV", correoElectronico: "o@ejemplo.mx" } });
  const datosProducto = {
    denominacionEspecifica: "Jeringa desechable",
    denominacionDistintiva: "MARCA",
    denominacionComunCientifica: "Jeringa",
    fraccionArancelaria: "90183101",
    desUMC: "Pieza",
    presentacionTipoEnvase: "Caja",
  };
  const producto = await db.producto.create({ data: { ...datosProducto, empresaId: empresa.id } });
  const productoAjeno = await db.producto.create({ data: { ...datosProducto, empresaId: otra.id } });
  const establecimiento = await db.establecimiento.create({
    data: {
      empresaId: empresa.id,
      denominacionRazonSocial: "Almacén Central",
      rfcResponsableSanitario: "AAAA010101AAA",
      correoElectronico: "a@ejemplo.mx",
      telefono: "5555555555",
      calle: "Reforma",
      codigoPostal: "06600",
      entidadFederativa: "CIUDAD DE MEXICO",
      municipio: "Cuauhtémoc",
    },
  });
  const tramite = await db.tramiteVersion.create({
    data: {
      claveVucem: "260211",
      nombre: "Permiso sanitario",
      plataforma: "VUCEM_CLASICA",
      vigenteDesde: new Date("2020-01-01T00:00:00Z"),
      definicion: JSON.stringify({ requisitos: [], limitesPdf: { maxMB: 10, minDpi: 300 } }),
    },
  });
  Object.assign(estado, {
    empresa: empresa.id,
    otraEmpresa: otra.id,
    usuario: usuario.id,
    producto: producto.id,
    productoAjeno: productoAjeno.id,
    establecimiento: establecimiento.id,
    tramiteVersion: tramite.id,
  });
});

function comoRol(rol: string, empresaId = estado.empresa) {
  entorno.sesion = { id: "sesion", usuarioId: estado.usuario };
  entorno.ctx = { sesionId: "sesion", usuario: { id: estado.usuario, nombre: "Capturista" }, empresa: { id: empresaId }, rol, membresias: [] };
}

beforeEach(() => comoRol("CAPTURISTA"));

async function crear(campos: Record<string, string | File>) {
  const { acciones } = estado.modulos!;
  return rutaDeRedireccion(acciones.crearDocumento(VACIO, formulario(campos)));
}

function existe(rutaRelativa: string | null) {
  return rutaRelativa !== null && existsSync(path.join(entorno.almacen, rutaRelativa));
}

// ─── Pruebas ──────────────────────────────────────────────────────────────────

describe("crearDocumento", () => {
  it("guarda original y versión VUCEM, liga el producto y regresa a «volver»", async () => {
    const { db, sha1Hex } = estado.modulos!;
    const ruta = await crear({
      archivo: archivo(await pdfConTexto(), "registro sanitario.pdf"),
      tipo: "REGISTRO_SANITARIO",
      nombre: "Registro | sanitario <jeringa>",
      productoId: estado.producto,
      vigenciaHasta: "2030-12-31",
      volver: `/productos/${estado.producto}`,
    });
    expect(ruta).toBe(`/productos/${estado.producto}`);

    const doc = await db.documento.findFirstOrThrow({ where: { empresaId: estado.empresa }, orderBy: { creadoEn: "desc" } });
    expect(doc).toMatchObject({
      tipo: "REGISTRO_SANITARIO",
      nombre: "Registro sanitario jeringa",
      productoId: estado.producto,
      archivoOriginalNombre: "registro sanitario.pdf",
      archivoOriginalMime: "application/pdf",
      estadoConversion: "OK",
      paginas: 1,
      dpi: 300,
      estadoEDocument: "NO_ENVIADO",
      creadoPorId: estado.usuario,
    });
    expect(doc.vigenciaHasta?.toISOString()).toBe("2030-12-31T12:00:00.000Z");
    expect(doc.archivoOriginalRuta.startsWith(`${estado.empresa}/`)).toBe(true);
    expect(doc.archivoVucemRuta?.startsWith(`${estado.empresa}/`)).toBe(true);
    const vucem = readFileSync(path.join(entorno.almacen, doc.archivoVucemRuta!));
    expect(sha1Hex(vucem)).toBe(doc.sha1Vucem);
    expect(vucem.length).toBe(doc.archivoVucemBytes);
    expect(JSON.parse(doc.reporteConversion!)).toMatchObject({ limites: { minDpi: 300, maxMB: 10 }, avisos: [] });

    const bitacora = await db.bitacora.findFirst({ where: { entidad: "Documento", entidadId: doc.id, accion: "CREAR" } });
    expect(bitacora).not.toBeNull();
  });

  it("sin «volver» seguro va al detalle", async () => {
    const ruta = await crear({ archivo: archivo(await pdfConTexto(), "a.pdf"), tipo: "OTRO", nombre: "Otro", volver: "//evil.com" });
    expect(ruta).toMatch(/^\/documentos\/[^/?]+\?creado=1$/);
  });

  it("si la conversión falla guarda el documento con ERROR y muestra el detalle", async () => {
    const { db } = estado.modulos!;
    const ruta = await crear({
      archivo: archivo(await pdfEnBlanco(), "vacio.pdf"),
      tipo: "LICENCIA_SANITARIA",
      nombre: "Licencia",
      establecimientoId: estado.establecimiento,
      volver: `/establecimientos/${estado.establecimiento}`,
    });
    expect(ruta).toMatch(/\?creado=1&volver=%2Festablecimientos%2F/);
    const doc = await db.documento.findUniqueOrThrow({ where: { id: idDeRuta(ruta) } });
    expect(doc).toMatchObject({ estadoConversion: "ERROR", archivoVucemRuta: null, sha1Vucem: null, establecimientoId: estado.establecimiento });
    expect(JSON.parse(doc.reporteConversion!).error).toMatch(/en blanco/);
    expect(existe(doc.archivoOriginalRuta)).toBe(true);
  });

  it("usa los límites de la versión del trámite vigente", async () => {
    const { db } = estado.modulos!;
    const estricta = await db.tramiteVersion.create({
      data: {
        claveVucem: "260211",
        nombre: "Permiso sanitario (límite de prueba)",
        plataforma: "VUCEM_3",
        vigenteDesde: new Date("2024-01-01T00:00:00Z"),
        definicion: JSON.stringify({ requisitos: [], limitesPdf: { maxMB: 0.001, minDpi: 300 } }),
      },
    });
    try {
      const ruta = await crear({ archivo: archivo(await pdfConTexto(), "b.pdf"), tipo: "OTRO", nombre: "Límite" });
      const doc = await db.documento.findUniqueOrThrow({ where: { id: idDeRuta(ruta) } });
      expect(doc.estadoConversion).toBe("ERROR");
      expect(JSON.parse(doc.reporteConversion!)).toMatchObject({ limites: { maxMB: 0.001 } });
    } finally {
      await db.tramiteVersion.delete({ where: { id: estricta.id } });
    }
  });

  it("convierte imágenes PNG", async () => {
    const { db } = estado.modulos!;
    const sharp = (await import("sharp")).default;
    const png = await sharp({ create: { width: 2550, height: 3300, channels: 3, background: "#ffffff" } })
      .composite([{ input: await sharp({ create: { width: 800, height: 400, channels: 3, background: "#204080" } }).png().toBuffer(), top: 300, left: 300 }])
      .png()
      .toBuffer();
    const ruta = await crear({ archivo: archivo(png, "marbete.png", "image/png"), tipo: "MARBETE", nombre: "Marbete" });
    const doc = await db.documento.findUniqueOrThrow({ where: { id: idDeRuta(ruta) } });
    expect(doc).toMatchObject({ archivoOriginalMime: "image/png", estadoConversion: "OK", paginas: 1 });
    expect(doc.archivoOriginalRuta.endsWith(".png")).toBe(true);
  });

  it("rechaza archivos no soportados sin guardar nada", async () => {
    const { acciones, db } = estado.modulos!;
    const antes = await db.documento.count();
    const r = await acciones.crearDocumento(
      VACIO,
      formulario({ archivo: archivo(Buffer.from("PK\u0003\u0004zip"), "doc.pdf"), tipo: "OTRO", nombre: "Zip" }),
    );
    expect(r.ok).toBe(false);
    expect(r.errores?.archivo?.[0]).toMatch(/no soportado/);
    expect(await db.documento.count()).toBe(antes);
  });

  it("valida datos y no acepta productos de otra empresa", async () => {
    const { acciones } = estado.modulos!;
    const r = await acciones.crearDocumento(
      VACIO,
      formulario({ archivo: archivo(await pdfConTexto(), "c.pdf"), tipo: "", nombre: "", productoId: estado.productoAjeno }),
    );
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errores ?? {}).sort()).toEqual(["nombre", "tipo"]);
    const r2 = await acciones.crearDocumento(
      VACIO,
      formulario({ archivo: archivo(await pdfConTexto(), "c.pdf"), tipo: "OTRO", nombre: "Ok", productoId: estado.productoAjeno }),
    );
    expect(r2.errores?.productoId).toBeDefined();
    expect(r2.valores?.nombre).toBe("Ok");
  });

  it("el rol de consulta no puede subir documentos", async () => {
    comoRol("CONSULTA");
    const { acciones } = estado.modulos!;
    const r = await acciones.crearDocumento(VACIO, formulario({ archivo: archivo(await pdfConTexto(), "d.pdf"), tipo: "OTRO", nombre: "X" }));
    expect(r).toMatchObject({ ok: false, mensaje: expect.stringMatching(/permiso/) });
  });
});

describe("edición, re-conversión, reemplazo y eliminación", () => {
  async function documentoNuevo() {
    const ruta = await crear({ archivo: archivo(await pdfConTexto("Aviso"), "aviso.pdf"), tipo: "AVISO_RESPONSABLE", nombre: "Aviso" });
    return idDeRuta(ruta);
  }

  it("actualiza los metadatos y normaliza el nombre", async () => {
    const { acciones, db } = estado.modulos!;
    const id = await documentoNuevo();
    const r = await acciones.actualizarDocumento(
      id,
      VACIO,
      formulario({ tipo: "AVISO_FUNCIONAMIENTO", nombre: "Aviso “nuevo”", establecimientoId: estado.establecimiento, idTipoDocumentoVucem: "123" }),
    );
    expect(r).toMatchObject({ ok: true });
    const doc = await db.documento.findUniqueOrThrow({ where: { id } });
    expect(doc).toMatchObject({ tipo: "AVISO_FUNCIONAMIENTO", nombre: "Aviso nuevo", establecimientoId: estado.establecimiento, idTipoDocumentoVucem: "123" });
  });

  it("no permite tocar documentos de otra empresa", async () => {
    const { acciones } = estado.modulos!;
    const id = await documentoNuevo();
    comoRol("ADMIN", estado.otraEmpresa);
    expect((await acciones.actualizarDocumento(id, VACIO, formulario({ tipo: "OTRO", nombre: "x" }))).ok).toBe(false);
    expect((await acciones.reconvertirDocumento(id)).ok).toBe(false);
    expect((await acciones.eliminarDocumento(id)).ok).toBe(false);
    expect((await descargar(id, "original")).status).toBe(404);
  });

  it("reemplazar el archivo re-convierte, borra los archivos anteriores y reinicia el eDocument", async () => {
    const { acciones, db } = estado.modulos!;
    const id = await documentoNuevo();
    const antes = await db.documento.update({
      where: { id },
      data: { estadoEDocument: "OK", eDocument: "0401AAAA1234", numeroOperacionEDoc: "999", errorEDocument: null },
    });
    const r = await acciones.reemplazarArchivo(id, VACIO, formulario({ archivo: archivo(await pdfConTexto("Otro", 2), "nuevo.pdf") }));
    expect(r.ok).toBe(true);
    expect(r.mensaje).toMatch(/digitaliz/);
    const despues = await db.documento.findUniqueOrThrow({ where: { id } });
    expect(despues).toMatchObject({
      archivoOriginalNombre: "nuevo.pdf",
      paginas: 2,
      estadoEDocument: "NO_ENVIADO",
      eDocument: null,
      numeroOperacionEDoc: null,
    });
    expect(despues.sha1Vucem).not.toBe(antes.sha1Vucem);
    expect(existe(antes.archivoOriginalRuta)).toBe(false);
    expect(existe(antes.archivoVucemRuta)).toBe(false);
    expect(existe(despues.archivoOriginalRuta)).toBe(true);
    expect(existe(despues.archivoVucemRuta)).toBe(true);
  });

  it("re-convertir conserva el eDocument si el PDF resultante es idéntico", async () => {
    const { acciones, db } = estado.modulos!;
    const id = await documentoNuevo();
    const antes = await db.documento.update({ where: { id }, data: { estadoEDocument: "OK", eDocument: "0401BBBB" } });
    const r = await acciones.reconvertirDocumento(id);
    expect(r.ok).toBe(true);
    const despues = await db.documento.findUniqueOrThrow({ where: { id } });
    expect(despues.sha1Vucem).toBe(antes.sha1Vucem);
    expect(despues).toMatchObject({ estadoEDocument: "OK", eDocument: "0401BBBB" });
    expect(existe(antes.archivoVucemRuta)).toBe(false);
    expect(existe(despues.archivoVucemRuta)).toBe(true);
  });

  it("no cambia el archivo ni elimina documentos usados en solicitudes presentadas", async () => {
    const { acciones, db } = estado.modulos!;
    const id = await documentoNuevo();
    const solicitud = await db.solicitud.create({
      data: { numero: 1, empresaId: estado.empresa, tramiteVersionId: estado.tramiteVersion, estado: "PRESENTADA" },
    });
    await db.solicitudDocumento.create({ data: { solicitudId: solicitud.id, documentoId: id, requisito: "AVISO_RESPONSABLE" } });

    expect((await acciones.reconvertirDocumento(id)).mensaje).toMatch(/solicitud 1/);
    const r = await acciones.reemplazarArchivo(id, VACIO, formulario({ archivo: archivo(await pdfConTexto(), "x.pdf") }));
    expect(r).toMatchObject({ ok: false, mensaje: expect.stringMatching(/ya presentada/) });
    expect((await acciones.eliminarDocumento(id)).mensaje).toMatch(/ligado/);
    expect(await db.documento.findUnique({ where: { id } })).not.toBeNull();
  });

  it("elimina el documento y sus archivos", async () => {
    const { acciones, db } = estado.modulos!;
    const id = await documentoNuevo();
    const doc = await db.documento.findUniqueOrThrow({ where: { id } });
    expect(await rutaDeRedireccion(acciones.eliminarDocumento(id))).toBe("/documentos?eliminado=1");
    expect(await db.documento.findUnique({ where: { id } })).toBeNull();
    expect(existe(doc.archivoOriginalRuta)).toBe(false);
    expect(existe(doc.archivoVucemRuta)).toBe(false);
    expect(await db.bitacora.findFirst({ where: { entidadId: id, accion: "ELIMINAR" } })).not.toBeNull();
  });
});

describe("GET /api/documentos/[id]/archivo", () => {
  it("descarga la versión VUCEM y el original con encabezados seguros", async () => {
    const { db } = estado.modulos!;
    const ruta = await crear({
      archivo: archivo(await pdfConTexto(), "Licencia «2026».pdf"),
      tipo: "LICENCIA_SANITARIA",
      nombre: "Licencia sanitaria Ñuñoa",
    });
    const id = idDeRuta(ruta);
    const doc = await db.documento.findUniqueOrThrow({ where: { id } });

    const r = await descargar(id, "vucem");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    const disposicion = r.headers.get("content-disposition") ?? "";
    expect(disposicion).toMatch(/^attachment; filename="Licencia sanitaria Nunoa\.pdf"; filename\*=UTF-8''/);
    expect(decodeURIComponent(disposicion.split("UTF-8''")[1])).toBe("Licencia sanitaria Ñuñoa.pdf");
    const cuerpo = Buffer.from(await r.arrayBuffer());
    expect(cuerpo.length).toBe(doc.archivoVucemBytes);

    const original = await descargar(id, "original");
    expect(original.status).toBe(200);
    expect(decodeURIComponent((original.headers.get("content-disposition") ?? "").split("UTF-8''")[1])).toBe("Licencia «2026».pdf");
    expect(Buffer.from(await original.arrayBuffer()).length).toBe(doc.archivoOriginalBytes);
  });

  it("401 sin sesión, 400 con versión inválida y 404 si no existe", async () => {
    const id = idDeRuta(await crear({ archivo: archivo(await pdfConTexto(), "e.pdf"), tipo: "OTRO", nombre: "E" }));
    expect((await descargar(id, "otra")).status).toBe(400);
    expect((await descargar("no-existe", "vucem")).status).toBe(404);
    entorno.sesion = null;
    expect((await descargar(id, "vucem")).status).toBe(401);
  });

  it("404 si el documento no tiene versión VUCEM", async () => {
    const ruta = await crear({ archivo: archivo(await pdfEnBlanco(), "blanco.pdf"), tipo: "OTRO", nombre: "Blanco" });
    expect((await descargar(idDeRuta(ruta), "vucem")).status).toBe(404);
    expect((await descargar(idDeRuta(ruta), "original")).status).toBe(200);
  });
});

describe("páginas", () => {
  it("la lista, el alta (prellenada) y el detalle se renderizan con los datos de la empresa", async () => {
    const id = idDeRuta(
      await crear({ archivo: archivo(await pdfConTexto(), "rs.pdf"), tipo: "REGISTRO_SANITARIO", nombre: "Registro de jeringa", productoId: estado.producto }),
    );
    const conError = idDeRuta(await crear({ archivo: archivo(await pdfEnBlanco(), "b.pdf"), tipo: "OTRO", nombre: "Hoja en blanco" }));
    const Lista = (await import("@/app/(app)/documentos/page")).default;
    const Nuevo = (await import("@/app/(app)/documentos/nuevo/page")).default;
    const Detalle = (await import("@/app/(app)/documentos/[id]/page")).default;

    const lista = renderToStaticMarkup(await Lista({ searchParams: Promise.resolve({}) }));
    expect(lista).toContain("Registro de jeringa");
    expect(lista).toContain(`/api/documentos/${id}/archivo?version=vucem`);
    const filtrada = renderToStaticMarkup(await Lista({ searchParams: Promise.resolve({ conversion: "ERROR" }) }));
    expect(filtrada).toContain("Hoja en blanco");
    expect(filtrada).not.toContain("Registro de jeringa");

    const nuevo = renderToStaticMarkup(
      await Nuevo({
        searchParams: Promise.resolve({ tipo: "REGISTRO_SANITARIO", productoId: estado.producto, volver: `/productos/${estado.producto}` }),
      }),
    );
    expect(nuevo).toContain('value="Registro sanitario y sus modificaciones"');
    expect(nuevo).toMatch(new RegExp(`<option value="${estado.producto}" selected=""`));
    expect(nuevo).toContain(`name="volver" value="/productos/${estado.producto}"`);
    // Un producto de otra empresa no se prellena.
    const ajeno = renderToStaticMarkup(await Nuevo({ searchParams: Promise.resolve({ productoId: estado.productoAjeno, volver: "//evil.com" }) }));
    expect(ajeno).not.toContain(estado.productoAjeno);
    expect(ajeno).not.toContain("evil.com");

    const detalle = renderToStaticMarkup(await Detalle({ params: Promise.resolve({ id }), searchParams: Promise.resolve({ creado: "1" }) }));
    expect(detalle).toContain("SHA-1");
    expect(detalle).toContain("Eliminar documento");
    const detalleError = renderToStaticMarkup(
      await Detalle({ params: Promise.resolve({ id: conError }), searchParams: Promise.resolve({ creado: "1" }) }),
    );
    expect(detalleError).toContain("no se pudo convertir");

    comoRol("CONSULTA");
    const soloLectura = renderToStaticMarkup(await Detalle({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) }));
    expect(soloLectura).not.toContain("Eliminar documento");
    comoRol("ADMIN", estado.otraEmpresa);
    await expect(Detalle({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) })).rejects.toThrow("NOT_FOUND");
  });
});
