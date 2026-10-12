// Pruebas de integración de las server actions del módulo (catálogos, empresa, usuarios) contra
// una base SQLite temporal creada con las migraciones. Se simulan sesión y caché de Next.
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const entorno = vi.hoisted(() => {
  // Se fija antes de importar @/lib/db, que lee DATABASE_URL al cargarse.
  const dir = `${process.env.TMPDIR ?? "/tmp"}/catalogos-vucem-${process.pid}-${Date.now()}`;
  const archivo = `${dir}/prueba.db`;
  process.env.DATABASE_URL = `file:${archivo}`;
  return { dir, archivo, ctx: null as null | Record<string, unknown> };
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

// Crea el esquema antes de importar el cliente Prisma.
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
  const catalogos = await import("@/app/(app)/catalogos-vucem/acciones");
  const empresa = await import("@/app/(app)/configuracion/empresa/acciones");
  const usuarios = await import("@/app/(app)/configuracion/usuarios/acciones");
  const { hashPassword, verificarPassword } = await import("@/lib/auth/password");
  return { db, catalogos, empresa, usuarios, hashPassword, verificarPassword };
}

function formulario(campos: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.append(k, v);
  return fd;
}

const VACIO = { ok: false };
let ids: { empresa: string; admin: string; sesion: string };

beforeAll(async () => {
  const { db, hashPassword } = await modulos();
  const admin = await db.usuario.create({
    data: { email: "admin@ejemplo.mx", nombre: "Admin", passwordHash: await hashPassword("contrasena-actual-1") },
  });
  const empresa = await db.empresa.create({
    data: { rfc: "AAA010101AAA", tipoPersona: "MORAL", razonSocial: "EMPRESA SA DE CV", correoElectronico: "e@ejemplo.mx" },
  });
  await db.membresia.create({ data: { usuarioId: admin.id, empresaId: empresa.id, rol: "ADMIN" } });
  const sesion = await db.sesion.create({
    data: { tokenHash: "x", usuarioId: admin.id, empresaActivaId: empresa.id, expiraEn: new Date(Date.now() + 3600_000) },
  });
  ids = { empresa: empresa.id, admin: admin.id, sesion: sesion.id };
});

function comoRol(rol: string) {
  entorno.ctx = { sesionId: ids.sesion, usuario: { id: ids.admin, nombre: "Admin", email: "admin@ejemplo.mx" }, empresa: { id: ids.empresa }, rol, membresias: [] };
}

beforeEach(() => comoRol("ADMIN"));

describe("catálogos VUCEM", () => {
  it("importa CSV: inserta, actualiza, reporta errores y deja bitácora", async () => {
    const { db, catalogos } = await modulos();
    await db.catalogoVucem.create({
      data: { catalogo: "CAT_ADUANA", clave: "470", descripcion: "AICM", fuente: "SEMILLA", porConfirmar: true, activo: false },
    });
    const r = await catalogos.importarCatalogoCsv(
      "CAT_ADUANA",
      VACIO,
      formulario({ texto: "clave;descripcion\n470;Aeropuerto Internacional de la Ciudad de México\n200;México, Cd. de Méx.\n;sin clave" }),
    );
    expect(r.resumen).toMatchObject({ insertados: 1, actualizados: 1, totalErrores: 1, separador: "punto y coma", conEncabezado: true });
    expect(r.resumen?.errores[0].renglon).toBe(4);
    const aicm = await db.catalogoVucem.findUniqueOrThrow({ where: { catalogo_clave: { catalogo: "CAT_ADUANA", clave: "470" } } });
    expect(aicm).toMatchObject({ fuente: "IMPORTADO", porConfirmar: false, activo: true, descripcion: "Aeropuerto Internacional de la Ciudad de México" });
    const bitacora = await db.bitacora.findFirst({ where: { accion: "IMPORTAR", entidadId: "CAT_ADUANA" } });
    expect(JSON.parse(bitacora?.detalle ?? "{}")).toMatchObject({ insertados: 1, actualizados: 1, errores: 1 });
  });

  it("importa desde archivo y desactiva ausentes solo si no hay errores", async () => {
    const { db, catalogos } = await modulos();
    const archivo = new File(["﻿470,AICM\n"], "aduanas.csv", { type: "text/csv" });
    const r = await catalogos.importarCatalogoCsv("CAT_ADUANA", VACIO, formulario({ archivo, desactivarAusentes: "on" }));
    expect(r.resumen).toMatchObject({ actualizados: 1, desactivados: 1 });
    const inactiva = await db.catalogoVucem.findUniqueOrThrow({ where: { catalogo_clave: { catalogo: "CAT_ADUANA", clave: "200" } } });
    expect(inactiva.activo).toBe(false);
  });

  it("importa catálogos grandes en bloque y vuelve a importarlos como actualización", async () => {
    const { db, catalogos } = await modulos();
    const renglones = Array.from({ length: 3000 }, (_, i) => `${1000 + i}\tTipo de documento ${i}`).join("\n");
    const r1 = await catalogos.importarCatalogoCsv("CAT_TIPO_DOCUMENTO", VACIO, formulario({ texto: renglones }));
    const r2 = await catalogos.importarCatalogoCsv("CAT_TIPO_DOCUMENTO", VACIO, formulario({ texto: renglones }));
    expect(r1.resumen).toMatchObject({ insertados: 3000, actualizados: 0, totalErrores: 0 });
    expect(r2.resumen).toMatchObject({ insertados: 0, actualizados: 3000 });
    expect(await db.catalogoVucem.count({ where: { catalogo: "CAT_TIPO_DOCUMENTO" } })).toBe(3000);
  });

  it("rechaza archivos que no son UTF-8", async () => {
    const { catalogos } = await modulos();
    const archivo = new File([new Uint8Array([0x31, 0x2c, 0x4d, 0xe9, 0x78, 0x0a])], "latin1.csv");
    const r = await catalogos.importarCatalogoCsv("CAT_PAIS", VACIO, formulario({ archivo }));
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/UTF-8/);
  });

  it("solo ADMIN modifica y el catálogo debe existir", async () => {
    const { catalogos } = await modulos();
    comoRol("CAPTURISTA");
    const r1 = await catalogos.crearRegistroCatalogo("CAT_PAIS", VACIO, formulario({ clave: "XXX", descripcion: "X" }));
    expect(r1.ok).toBe(false);
    comoRol("ADMIN");
    const r2 = await catalogos.importarCatalogoCsv("CAT_FALSO", VACIO, formulario({ texto: "1,a" }));
    expect(r2).toMatchObject({ ok: false, mensaje: "El catálogo no existe." });
  });

  it("alta manual con fuente MANUAL y sin duplicados", async () => {
    const { db, catalogos } = await modulos();
    const r = await catalogos.crearRegistroCatalogo("CAT_REGIMEN", VACIO, formulario({ clave: "02", descripcion: "Otro", porConfirmar: "on" }));
    expect(r.ok).toBe(true);
    const reg = await db.catalogoVucem.findUniqueOrThrow({ where: { catalogo_clave: { catalogo: "CAT_REGIMEN", clave: "02" } } });
    expect(reg).toMatchObject({ fuente: "MANUAL", porConfirmar: true, activo: true });
    const dup = await catalogos.crearRegistroCatalogo("CAT_REGIMEN", VACIO, formulario({ clave: "02", descripcion: "Otro" }));
    expect(dup.errores?.clave?.[0]).toMatch(/ya existe/);
  });

  it("edita solo registros del catálogo de la URL", async () => {
    const { db, catalogos } = await modulos();
    const reg = await db.catalogoVucem.findUniqueOrThrow({ where: { catalogo_clave: { catalogo: "CAT_REGIMEN", clave: "02" } } });
    const ajeno = await catalogos.editarRegistroCatalogo("CAT_PAIS", reg.id, VACIO, formulario({ descripcion: "Hack" }));
    expect(ajeno.ok).toBe(false);
    const r = await catalogos.editarRegistroCatalogo("CAT_REGIMEN", reg.id, VACIO, formulario({ descripcion: "Otro régimen", padreClave: "" }));
    expect(r.ok).toBe(true);
    const nuevo = await db.catalogoVucem.findUniqueOrThrow({ where: { id: reg.id } });
    // Casillas sin marcar = false.
    expect(nuevo).toMatchObject({ descripcion: "Otro régimen", activo: false, porConfirmar: false, padreClave: null });
  });
});

describe("configuración de empresa", () => {
  const base = {
    tipoPersona: "MORAL",
    razonSocial: "EMPRESA NUEVA SA DE CV",
    correoElectronico: "nuevo@ejemplo.mx",
    pais: "MEX",
  };

  it("actualiza datos y limpia opcionales vacíos", async () => {
    const { db, empresa } = await modulos();
    const r = await empresa.actualizarEmpresa(VACIO, formulario({ ...base, rfc: "AAA010101AAA", telefono: "" }));
    expect(r.ok).toBe(true);
    const e = await db.empresa.findUniqueOrThrow({ where: { id: ids.empresa } });
    expect(e).toMatchObject({ razonSocial: "EMPRESA NUEVA SA DE CV", telefono: null, correoElectronico: "nuevo@ejemplo.mx" });
  });

  it("no permite cambiar el RFC con solicitudes presentadas", async () => {
    const { db, empresa } = await modulos();
    const tramite = await db.tramiteVersion.create({
      data: { claveVucem: "260211", nombre: "x", plataforma: "VUCEM_CLASICA", vigenteDesde: new Date(), definicion: "{}" },
    });
    await db.solicitud.create({
      data: { numero: 1, empresaId: ids.empresa, tramiteVersionId: tramite.id, folioVucem: "1".repeat(25) },
    });
    const r = await empresa.actualizarEmpresa(VACIO, formulario({ ...base, rfc: "BBB010101BB1" }));
    expect(r.ok).toBe(false);
    expect(r.errores?.rfc?.[0]).toMatch(/No se puede cambiar el RFC/);
  });

  it("solo ADMIN", async () => {
    const { empresa } = await modulos();
    comoRol("CONSULTA");
    const r = await empresa.actualizarEmpresa(VACIO, formulario({ ...base, rfc: "AAA010101AAA" }));
    expect(r.ok).toBe(false);
  });
});

describe("usuarios", () => {
  it("crea usuario nuevo con contraseña temporal de 16 caracteres (solo hash en BD)", async () => {
    const { db, usuarios, verificarPassword } = await modulos();
    const r = await usuarios.agregarMiembro(VACIO, formulario({ email: "Nuevo@Ejemplo.mx", nombre: "Nuevo", rol: "CAPTURISTA" }));
    expect(r.ok).toBe(true);
    expect(r.passwordTemporal).toHaveLength(16);
    const u = await db.usuario.findUniqueOrThrow({ where: { email: "nuevo@ejemplo.mx" } });
    expect(u.passwordHash).not.toContain(r.passwordTemporal!);
    expect(await verificarPassword(r.passwordTemporal!, u.passwordHash)).toBe(true);
    const b = await db.bitacora.findFirst({ where: { accion: "CREAR_USUARIO" } });
    expect(b?.detalle).not.toContain(r.passwordTemporal!);
  });

  it("agrega usuario existente sin crear cuenta y rechaza duplicados", async () => {
    const { db, usuarios, hashPassword } = await modulos();
    await db.usuario.create({ data: { email: "otro@ejemplo.mx", nombre: "Otro", passwordHash: await hashPassword("x".repeat(12)) } });
    const r = await usuarios.agregarMiembro(VACIO, formulario({ email: "otro@ejemplo.mx", rol: "CONSULTA" }));
    expect(r.ok).toBe(true);
    expect(r.passwordTemporal).toBeUndefined();
    const dup = await usuarios.agregarMiembro(VACIO, formulario({ email: "otro@ejemplo.mx", rol: "CONSULTA" }));
    expect(dup.errores?.email?.[0]).toMatch(/ya es miembro/);
    const sinNombre = await usuarios.agregarMiembro(VACIO, formulario({ email: "inexistente@ejemplo.mx", rol: "CONSULTA" }));
    expect(sinNombre.errores?.nombre).toBeDefined();
  });

  it("protege al único administrador", async () => {
    const { db, usuarios } = await modulos();
    const propia = await db.membresia.findFirstOrThrow({ where: { usuarioId: ids.admin, empresaId: ids.empresa } });
    const r1 = await usuarios.cambiarRol(VACIO, formulario({ membresiaId: propia.id, rol: "CONSULTA" }));
    expect(r1.ok).toBe(false);
    const r2 = await usuarios.quitarMiembro(VACIO, formulario({ membresiaId: propia.id }));
    expect(r2.ok).toBe(false);
    expect(r2.mensaje).toMatch(/único administrador/);
    expect(await db.membresia.count({ where: { id: propia.id } })).toBe(1);
  });

  it("cambia rol y quita miembros de la propia empresa solamente", async () => {
    const { db, usuarios } = await modulos();
    const otra = await db.membresia.findFirstOrThrow({ where: { usuario: { email: "otro@ejemplo.mx" } } });
    expect((await usuarios.cambiarRol(VACIO, formulario({ membresiaId: otra.id, rol: "ADMIN" }))).ok).toBe(true);
    expect((await db.membresia.findUniqueOrThrow({ where: { id: otra.id } })).rol).toBe("ADMIN");

    const ajena = await db.empresa.create({ data: { rfc: "CCC010101CCC", razonSocial: "AJENA", correoElectronico: "a@a.mx" } });
    const membresiaAjena = await db.membresia.create({ data: { usuarioId: otra.usuarioId, empresaId: ajena.id, rol: "ADMIN" } });
    const r = await usuarios.quitarMiembro(VACIO, formulario({ membresiaId: membresiaAjena.id }));
    expect(r.ok).toBe(false);
    expect(await db.membresia.count({ where: { id: membresiaAjena.id } })).toBe(1);

    expect((await usuarios.quitarMiembro(VACIO, formulario({ membresiaId: otra.id }))).ok).toBe(true);
  });

  it("cambia la contraseña propia verificando la actual y cierra otras sesiones", async () => {
    const { db, usuarios, verificarPassword } = await modulos();
    await db.sesion.create({ data: { tokenHash: "otra", usuarioId: ids.admin, expiraEn: new Date(Date.now() + 3600_000) } });
    const mala = await usuarios.cambiarMiPassword(
      VACIO,
      formulario({ actual: "incorrecta", nueva: "nueva-contrasena-2", confirmacion: "nueva-contrasena-2" }),
    );
    expect(mala.errores?.actual).toBeDefined();
    const r = await usuarios.cambiarMiPassword(
      VACIO,
      formulario({ actual: "contrasena-actual-1", nueva: "nueva-contrasena-2", confirmacion: "nueva-contrasena-2" }),
    );
    expect(r.ok).toBe(true);
    expect(r.valores).toBeUndefined();
    const u = await db.usuario.findUniqueOrThrow({ where: { id: ids.admin } });
    expect(await verificarPassword("nueva-contrasena-2", u.passwordHash)).toBe(true);
    expect(await db.sesion.findMany({ where: { usuarioId: ids.admin } })).toHaveLength(1);
  });
});

describe("páginas (render en servidor)", () => {
  async function render(elemento: unknown): Promise<string> {
    const { renderToStaticMarkup } = await import("react-dom/server");
    return renderToStaticMarkup(elemento as Parameters<typeof renderToStaticMarkup>[0]);
  }

  beforeEach(async () => {
    const { db } = await modulos();
    const empresaCompleta = await db.empresa.findUniqueOrThrow({ where: { id: ids.empresa } });
    entorno.ctx = { ...entorno.ctx, empresa: empresaCompleta };
  });

  it("índice de catálogos con conteos", async () => {
    const { default: Pagina } = await import("@/app/(app)/catalogos-vucem/page");
    const html = await render(await Pagina());
    expect(html).toContain("Aduanas");
    expect(html).toContain("/catalogos-vucem/CAT_PAIS");
  });

  it("detalle de catálogo con búsqueda sin acentos, edición y 404", async () => {
    const { db } = await modulos();
    const { default: Pagina } = await import("@/app/(app)/catalogos-vucem/[catalogo]/page");
    const reg = await db.catalogoVucem.findUniqueOrThrow({ where: { catalogo_clave: { catalogo: "CAT_ADUANA", clave: "470" } } });
    const html = await render(
      await Pagina({
        params: Promise.resolve({ catalogo: "CAT_ADUANA" }),
        searchParams: Promise.resolve({ q: "aicm", editar: reg.id }),
      }),
    );
    expect(html).toContain("Editar clave 470");
    expect(html).toContain("Importar CSV");
    await expect(
      Pagina({ params: Promise.resolve({ catalogo: "CAT_NADA" }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NOT_FOUND");

    comoRol("CONSULTA");
    const empresaCompleta = await db.empresa.findUniqueOrThrow({ where: { id: ids.empresa } });
    entorno.ctx = { ...entorno.ctx, empresa: empresaCompleta };
    const soloLectura = await render(
      await Pagina({ params: Promise.resolve({ catalogo: "CAT_ADUANA" }), searchParams: Promise.resolve({ editar: reg.id }) }),
    );
    expect(soloLectura).not.toContain("Importar CSV");
    expect(soloLectura).not.toContain("Editar clave");
  });

  it("empresa, usuarios y bitácora", async () => {
    const empresaPag = (await import("@/app/(app)/configuracion/empresa/page")).default;
    expect(await render(await empresaPag())).toContain("El RFC ya no se puede cambiar");

    const usuariosPag = (await import("@/app/(app)/configuracion/usuarios/page")).default;
    const htmlUsuarios = await render(await usuariosPag());
    expect(htmlUsuarios).toContain("admin@ejemplo.mx");
    expect(htmlUsuarios).toContain("Agregar miembro");

    const bitacoraPag = (await import("@/app/(app)/configuracion/bitacora/page")).default;
    const htmlBitacora = await render(await bitacoraPag({ searchParams: Promise.resolve({ accion: "IMPORTAR" }) }));
    expect(htmlBitacora).toContain("CAT_ADUANA");
    // Con el filtro, CREAR_USUARIO solo aparece en la opción del selector (value + texto), no como renglón.
    expect(htmlBitacora.split("CREAR_USUARIO").length - 1).toBe(2);

    comoRol("CONSULTA");
    const { db } = await modulos();
    entorno.ctx = { ...entorno.ctx, empresa: await db.empresa.findUniqueOrThrow({ where: { id: ids.empresa } }) };
    expect(await render(await bitacoraPag({ searchParams: Promise.resolve({}) }))).toContain("Solo un administrador");
    expect(await render(await usuariosPag())).not.toContain("Agregar miembro");
  });
});
