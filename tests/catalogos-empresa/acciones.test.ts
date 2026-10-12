// Pruebas de integración de las server actions de catálogos contra una base SQLite temporal
// creada con las migraciones del proyecto. Se simulan la sesión (obtenerContexto), redirect y
// revalidatePath.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const dirTemporal = mkdtempSync(path.join(tmpdir(), "catalogos-empresa-"));
const archivoDb = path.join(dirTemporal, "prueba.db");
{
  const sqlite = new Database(archivoDb);
  const dirMigraciones = path.resolve(__dirname, "../../prisma/migrations");
  for (const m of readdirSync(dirMigraciones).filter((d) => !d.includes(".")).sort()) {
    sqlite.exec(readFileSync(path.join(dirMigraciones, m, "migration.sql"), "utf8"));
  }
  sqlite.close();
}
process.env.DATABASE_URL = `file:${archivoDb}`;
(globalThis as { prisma?: unknown }).prisma = undefined;

class Redireccion extends Error {
  constructor(public url: string) {
    super(`REDIRECT ${url}`);
  }
}

const sesion = vi.hoisted(() => ({ ctx: null as unknown }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redireccion(url);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/lib/auth/contexto", async (original) => {
  const real = await original<typeof import("@/lib/auth/contexto")>();
  return { ...real, obtenerContexto: async () => sesion.ctx };
});

type Modulos = {
  db: typeof import("@/lib/db").db;
  est: typeof import("@/app/(app)/establecimientos/acciones");
  ter: typeof import("@/app/(app)/terceros/acciones");
  pro: typeof import("@/app/(app)/productos/acciones");
};
let m: Modulos;
let empresaA: { id: string };
let empresaB: { id: string };
let tramiteId: string;

const ESTADO = { ok: false };

function datosForm(campos: Record<string, string | string[] | undefined>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) {
    if (v === undefined) continue;
    for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  }
  return fd;
}

async function redireccion(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
  } catch (e) {
    if (e instanceof Redireccion) return e.url;
    throw e;
  }
  throw new Error("Se esperaba una redirección");
}

function usarEmpresa(empresa: { id: string }, rol = "ADMIN") {
  sesion.ctx = { sesionId: "s", usuario: { id: "usuario-prueba", nombre: "Prueba" }, empresa, rol, membresias: [] };
}

async function crearSolicitud(empresaId: string, numero: number, extra: Record<string, unknown> = {}) {
  return m.db.solicitud.create({ data: { empresaId, numero, tramiteVersionId: tramiteId, ...extra } });
}

beforeAll(async () => {
  m = {
    db: (await import("@/lib/db")).db,
    est: await import("@/app/(app)/establecimientos/acciones"),
    ter: await import("@/app/(app)/terceros/acciones"),
    pro: await import("@/app/(app)/productos/acciones"),
  };
  empresaA = await m.db.empresa.create({ data: { rfc: "AAA010101AA1", razonSocial: "EMPRESA A", correoElectronico: "a@a.mx" } });
  empresaB = await m.db.empresa.create({ data: { rfc: "BBB010101BB1", razonSocial: "EMPRESA B", correoElectronico: "b@b.mx" } });
  tramiteId = (
    await m.db.tramiteVersion.create({
      data: { claveVucem: "260211", nombre: "Prueba", plataforma: "VUCEM_CLASICA", vigenteDesde: new Date(), definicion: "{}" },
    })
  ).id;
});

afterAll(async () => {
  await m?.db.$disconnect();
  (globalThis as { prisma?: unknown }).prisma = undefined;
  rmSync(dirTemporal, { recursive: true, force: true });
});

beforeEach(() => usarEmpresa(empresaA));

const establecimientoValido = {
  denominacionRazonSocial: "ALMACEN CENTRAL",
  rfcResponsableSanitario: "PEPJ800101AB1",
  correoElectronico: "resp@a.mx",
  telefono: "5555555555",
  calle: "CALLE 1",
  numeroExterior: "10",
  codigoPostal: "54060",
  entidadFederativa: "CIUDAD DE MEXICO",
  municipio: "TLALNEPANTLA",
  colonia: "",
  localidad: "",
  noLicenciaSanitaria: "",
  tieneAvisoFuncionamiento: "on",
  scianClave: ["435313", "325412"],
  scianDescripcion: ["Equipo médico", ""],
};

describe("acciones de establecimientos", () => {
  it("crea, edita (reemplaza SCIAN), registra bitácora y protege otras empresas", async () => {
    const url = await redireccion(m.est.guardarEstablecimiento(null, ESTADO, datosForm(establecimientoValido)));
    const id = url.match(/^\/establecimientos\/([^?]+)\?creado=1$/)?.[1];
    expect(id).toBeTruthy();
    const creado = await m.db.establecimiento.findUniqueOrThrow({ where: { id }, include: { scian: { orderBy: { clave: "asc" } } } });
    expect(creado.empresaId).toBe(empresaA.id);
    expect(creado.scian.map((s) => s.clave)).toEqual(["325412", "435313"]);
    expect(creado.colonia).toBeNull();

    const r = await m.est.guardarEstablecimiento(
      id!,
      ESTADO,
      datosForm({ ...establecimientoValido, tieneAvisoFuncionamiento: undefined, noLicenciaSanitaria: "LIC-1", scianClave: ["339112"], scianDescripcion: [""] }),
    );
    expect(r).toEqual({ ok: true, mensaje: "Cambios guardados." });
    const editado = await m.db.establecimiento.findUniqueOrThrow({ where: { id }, include: { scian: true } });
    expect(editado.noLicenciaSanitaria).toBe("LIC-1");
    expect(editado.tieneAvisoFuncionamiento).toBe(false);
    expect(editado.scian.map((s) => s.clave)).toEqual(["339112"]);

    const bitacora = await m.db.bitacora.findMany({ where: { entidad: "Establecimiento", entidadId: id } });
    expect(bitacora.map((b) => b.accion).sort()).toEqual(["CREAR", "EDITAR"]);

    usarEmpresa(empresaB);
    const ajeno = await m.est.guardarEstablecimiento(id!, ESTADO, datosForm(establecimientoValido));
    expect(ajeno.ok).toBe(false);
    expect((await m.est.eliminarEstablecimiento(id!)).ok).toBe(false);
    expect(await m.db.establecimiento.count({ where: { id } })).toBe(1);
  });

  it("regresa errores por campo sin guardar", async () => {
    const r = await m.est.guardarEstablecimiento(
      null,
      ESTADO,
      datosForm({ ...establecimientoValido, noLicenciaSanitaria: "LIC", scianClave: ["12"], scianDescripcion: [""] }),
    );
    expect(r.ok).toBe(false);
    expect(r.errores?.noLicenciaSanitaria).toBeDefined();
    expect(r.errores?.["scian.0.clave"]).toBeDefined();
    expect(r.valores?.denominacionRazonSocial).toBe("ALMACEN CENTRAL");
  });

  it("la entidad debe existir en CAT_ENTIDAD cuando el catálogo está cargado", async () => {
    await m.db.catalogoVucem.create({ data: { catalogo: "CAT_ENTIDAD", clave: "CIUDAD DE MEXICO", descripcion: "Ciudad de México" } });
    const r = await m.est.guardarEstablecimiento(null, ESTADO, datosForm({ ...establecimientoValido, entidadFederativa: "ATLANTIDA" }));
    expect(r.errores?.entidadFederativa).toBeDefined();
    const url = await redireccion(
      m.est.guardarEstablecimiento(null, ESTADO, datosForm({ ...establecimientoValido, entidadFederativa: "CIUDAD DE MEXICO" })),
    );
    expect(url).toMatch(/creado=1/);
  });

  it("el rol de consulta no puede modificar", async () => {
    usarEmpresa(empresaA, "CONSULTA");
    const r = await m.est.guardarEstablecimiento(null, ESTADO, datosForm(establecimientoValido));
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/permiso/);
  });

  it("borra si no tiene solicitudes y desactiva si las tiene", async () => {
    const libre = await redireccion(m.est.guardarEstablecimiento(null, ESTADO, datosForm(establecimientoValido)));
    const idLibre = libre.split("/")[2].split("?")[0];
    expect(await redireccion(m.est.eliminarEstablecimiento(idLibre))).toBe("/establecimientos?eliminado=1");
    expect(await m.db.establecimiento.count({ where: { id: idLibre } })).toBe(0);

    const usado = await redireccion(m.est.guardarEstablecimiento(null, ESTADO, datosForm(establecimientoValido)));
    const idUsado = usado.split("/")[2].split("?")[0];
    await crearSolicitud(empresaA.id, 1, { establecimientoId: idUsado });
    const r = await m.est.eliminarEstablecimiento(idUsado);
    expect(r.ok).toBe(true);
    expect(r.mensaje).toMatch(/desactivó/);
    expect((await m.db.establecimiento.findUniqueOrThrow({ where: { id: idUsado } })).activo).toBe(false);

    expect((await m.est.cambiarActivoEstablecimiento(idUsado)).mensaje).toMatch(/reactivado/);
    expect((await m.db.establecimiento.findUniqueOrThrow({ where: { id: idUsado } })).activo).toBe(true);
  });
});

const fabricante = {
  tipo: "FABRICANTE",
  tipoPersona: "MORAL",
  nacionalidad: "EXTRANJERO",
  denominacionRazonSocial: "MEDICAL INC",
  correoElectronico: "x@example.com",
  pais: "USA",
  entidadFederativa: "CA",
  codigoPostal: "94105",
  calle: "MARKET ST",
  numeroExterior: "500",
  // Campos ocultos que no aplican a persona moral: no deben guardarse.
  nombre: "NO APLICA",
};

describe("acciones de terceros", () => {
  it("crea un fabricante y limpia los campos que no aplican", async () => {
    const url = await redireccion(m.ter.guardarTercero(null, ESTADO, datosForm(fabricante)));
    const id = url.match(/^\/terceros\/([^?]+)\?creado=1$/)?.[1];
    const t = await m.db.tercero.findUniqueOrThrow({ where: { id } });
    expect(t.empresaId).toBe(empresaA.id);
    expect(t.nombre).toBeNull();
    expect(t.pais).toBe("USA");
  });

  it("con ?volver= regresa al formulario de origen con el tercero nuevo", async () => {
    const url = await redireccion(m.ter.guardarTercero(null, ESTADO, datosForm({ ...fabricante, volver: "/productos/nuevo" })));
    expect(url).toMatch(/^\/productos\/nuevo\?nuevoTerceroId=\w+$/);
    const externo = await redireccion(m.ter.guardarTercero(null, ESTADO, datosForm({ ...fabricante, volver: "//evil.example" })));
    expect(externo).toMatch(/^\/terceros\//);
  });

  it("no permite cambiar el tipo si ya se usa, y desactiva en lugar de borrar si está en una solicitud", async () => {
    const url = await redireccion(m.ter.guardarTercero(null, ESTADO, datosForm(fabricante)));
    const id = url.split("/")[2].split("?")[0];
    const sol = await crearSolicitud(empresaA.id, 2);
    await m.db.solicitudTercero.create({ data: { solicitudId: sol.id, terceroId: id, rol: "FABRICANTE" } });

    const r = await m.ter.guardarTercero(id, ESTADO, datosForm({ ...fabricante, tipo: "PROVEEDOR" }));
    expect(r.errores?.tipo).toBeDefined();

    const e = await m.ter.eliminarTercero(id);
    expect(e.ok).toBe(true);
    expect((await m.db.tercero.findUniqueOrThrow({ where: { id } })).activo).toBe(false);
  });
});

const producto = {
  denominacionEspecifica: "JERINGA 5 ML",
  denominacionDistintiva: "MARCA",
  denominacionComunCientifica: "JERINGA",
  idClasificacionProducto: "52",
  idSubClasificacionProducto: "25",
  idTipoProducto: "0245",
  fraccionArancelaria: "90183101",
  desUMC: "PIEZA",
  presentacionTipoEnvase: "CAJA CON 100",
  numRegistroSanitario: "1234C2020 SSA",
  vigenciaRegistroSanitario: "2030-06-30",
  cvePaisOrigen: "USA",
  idUsoEspecifico: "108",
};

describe("acciones de productos", () => {
  it("valida que el fabricante sea de la empresa y de tipo FABRICANTE", async () => {
    usarEmpresa(empresaB);
    const ajeno = await redireccion(m.ter.guardarTercero(null, ESTADO, datosForm(fabricante)));
    const idAjeno = ajeno.split("/")[2].split("?")[0];
    usarEmpresa(empresaA);
    const r = await m.pro.guardarProducto(null, ESTADO, datosForm({ ...producto, fabricanteId: idAjeno }));
    expect(r.errores?.fabricanteId).toBeDefined();
  });

  it("valida las claves contra los catálogos cargados y la subclasificación contra su clasificación", async () => {
    await m.db.catalogoVucem.createMany({
      data: [
        { catalogo: "CAT_SUBCLASIF_PRODUCTO", clave: "25", descripcion: "S25", padreClave: "52" },
        { catalogo: "CAT_SUBCLASIF_PRODUCTO", clave: "99", descripcion: "S99", padreClave: "10" },
        { catalogo: "CAT_PAIS", clave: "USA", descripcion: "Estados Unidos" },
        { catalogo: "CAT_PAIS", clave: "MEX", descripcion: "México" },
      ],
    });
    const r = await m.pro.guardarProducto(null, ESTADO, datosForm({ ...producto, idSubClasificacionProducto: "99" }));
    expect(r.errores?.idSubClasificacionProducto).toEqual(["La subclasificación no corresponde a la clasificación elegida"]);
    const r2 = await m.pro.guardarProducto(null, ESTADO, datosForm({ ...producto, cvePaisOrigen: "ZZZ" }));
    expect(r2.errores?.cvePaisOrigen?.[0]).toMatch(/catálogo/);
    // Catálogo vacío (CAT_TIPO_PRODUCTO): se acepta la clave escrita a mano.
    expect(r2.errores?.idTipoProducto).toBeUndefined();
  });

  it("crea, duplica y desactiva en lugar de borrar si está en una partida", async () => {
    const urlFab = await redireccion(m.ter.guardarTercero(null, ESTADO, datosForm(fabricante)));
    const fabricanteId = urlFab.split("/")[2].split("?")[0];
    const url = await redireccion(m.pro.guardarProducto(null, ESTADO, datosForm({ ...producto, fabricanteId })));
    const id = url.match(/^\/productos\/([^?]+)\?creado=1$/)?.[1];
    const p = await m.db.producto.findUniqueOrThrow({ where: { id } });
    expect(p.fabricanteId).toBe(fabricanteId);
    expect(p.vigenciaRegistroSanitario?.toISOString()).toBe("2030-06-30T12:00:00.000Z");

    const urlCopia = await redireccion(m.pro.duplicarProducto(id!));
    const idCopia = urlCopia.match(/^\/productos\/([^?]+)\?duplicado=1$/)?.[1];
    const copia = await m.db.producto.findUniqueOrThrow({ where: { id: idCopia } });
    expect(copia.denominacionEspecifica).toBe("JERINGA 5 ML (copia)");
    expect(copia.fabricanteId).toBe(fabricanteId);
    expect(copia.empresaId).toBe(empresaA.id);

    expect(await redireccion(m.pro.eliminarProducto(idCopia!))).toBe("/productos?eliminado=1");

    const sol = await crearSolicitud(empresaA.id, 3);
    await m.db.partidaSolicitud.create({
      data: {
        solicitudId: sol.id,
        productoId: id,
        orden: 1,
        denominacionEspecifica: p.denominacionEspecifica,
        denominacionDistintiva: p.denominacionDistintiva,
        denominacionComunCientifica: p.denominacionComunCientifica,
        fraccionArancelaria: p.fraccionArancelaria,
        cantidadUMT: "1",
        cantidadUMC: "1",
        desUMC: p.desUMC,
        presentacionTipoEnvase: p.presentacionTipoEnvase,
        cvePaisOrigen: "USA",
        cvePaisProcedencia: "USA",
      },
    });
    const r = await m.pro.eliminarProducto(id!);
    expect(r.ok).toBe(true);
    expect((await m.db.producto.findUniqueOrThrow({ where: { id } })).activo).toBe(false);

    usarEmpresa(empresaB);
    expect((await m.pro.duplicarProducto(id!)).ok).toBe(false);
  });
});
