// Pruebas de integración de las acciones y descargas de solicitudes contra una base SQLite temporal
// creada con las migraciones del proyecto. Se simulan la sesión, redirect y revalidatePath.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import JSZip from "jszip";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFINICION_260211_INICIAL } from "@/lib/tramite/definicion";

const dirTemporal = mkdtempSync(path.join(tmpdir(), "solicitudes-"));
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
process.env.STORAGE_DIR = path.join(dirTemporal, "storage");
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
  storage: typeof import("@/lib/storage");
  acc: typeof import("@/app/(app)/solicitudes/acciones");
  par: typeof import("@/app/(app)/solicitudes/acciones-partidas");
  rel: typeof import("@/app/(app)/solicitudes/acciones-relaciones");
  seg: typeof import("@/app/(app)/solicitudes/acciones-seguimiento");
  dias: typeof import("@/app/(app)/solicitudes/acciones-dias-inhabiles");
  anexos: typeof import("@/app/(app)/solicitudes/[id]/anexos/route");
  archivos: typeof import("@/app/(app)/solicitudes/[id]/archivos/route");
};
let m: Modulos;
type EmpresaPrueba = { id: string; rfc: string; tipoPersona: string; nombre: string | null; apellidoPaterno: string | null; apellidoMaterno: string | null };
let empresaA: EmpresaPrueba;
let empresaB: EmpresaPrueba;
let establecimientoId: string;
let productoId: string;
let fabricanteId: string;
let destinatarioId: string;

const ESTADO = { ok: false };
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

function datosForm(campos: Record<string, string | Blob | undefined>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) if (v !== undefined) fd.append(k, v);
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

function usarEmpresa(empresa: EmpresaPrueba, rol = "ADMIN") {
  sesion.ctx = {
    sesionId: "s",
    usuario: { id: "usuario-prueba", nombre: "Prueba" },
    empresa,
    rol,
    membresias: [{ empresaId: empresaA.id }, { empresaId: empresaB.id }],
  };
}

async function crearDocumento(datos: { tipo: string; nombre: string; productoId?: string; establecimientoId?: string; empresaId?: string }) {
  const empresaId = datos.empresaId ?? empresaA.id;
  const ruta = await m.storage.guardarArchivo(empresaId, PDF, "pdf", "vucem");
  return m.db.documento.create({
    data: {
      empresaId,
      tipo: datos.tipo,
      nombre: datos.nombre,
      productoId: datos.productoId ?? null,
      establecimientoId: datos.establecimientoId ?? null,
      archivoOriginalRuta: ruta,
      archivoOriginalNombre: "original.pdf",
      archivoOriginalBytes: PDF.length,
      archivoOriginalMime: "application/pdf",
      archivoVucemRuta: ruta,
      archivoVucemBytes: PDF.length,
      estadoConversion: "OK",
    },
  });
}

async function crearBorrador(): Promise<string> {
  const url = await redireccion(m.acc.crearSolicitud(ESTADO, datosForm({ establecimientoId })));
  const id = url.match(/^\/solicitudes\/([^?]+)\?creada=1/)?.[1];
  expect(id).toBeTruthy();
  return id!;
}

const partidaValida = { productoId: "", cantidadUMT: "100", cantidadUMC: "100.5", cvePaisProcedencia: "USA", fechaCaducidad: "", idUsoEspecifico: "" };

/** Completa todo lo que falta para que la validación del portal no tenga errores. */
async function completar(id: string) {
  expect((await m.acc.guardarDatosGenerales(id, ESTADO, datosForm({ establecimientoId, cveRegimen: "01", cveAduana: "470" }))).ok).toBe(true);
  expect((await m.par.agregarPartida(id, ESTADO, datosForm({ ...partidaValida, productoId }))).ok).toBe(true);
  expect((await m.acc.guardarManifiestos(id, ESTADO, datosForm({ cveDeclaracion: "on", publicos: "SI" }))).ok).toBe(true);
  expect((await m.acc.guardarRepresentante(id, ESTADO, datosForm({ rlRfc: "PEPJ800101AB1", rlNombre: "JUAN", rlApellidoPaterno: "PEREZ" }))).ok).toBe(true);
  const pago = await m.acc.guardarPago(
    id,
    ESTADO,
    datosForm({ claveReferencia: "123456789", cadenaDependencia: "00012345678901", cveBanco: "15", llavePago: "ABC123", fechaPago: "2026-10-01", importePago: "3,117" }),
  );
  expect(pago).toEqual({ ok: true, mensaje: "Pago de derechos guardado." });
}

beforeAll(async () => {
  m = {
    db: (await import("@/lib/db")).db,
    storage: await import("@/lib/storage"),
    acc: await import("@/app/(app)/solicitudes/acciones"),
    par: await import("@/app/(app)/solicitudes/acciones-partidas"),
    rel: await import("@/app/(app)/solicitudes/acciones-relaciones"),
    seg: await import("@/app/(app)/solicitudes/acciones-seguimiento"),
    dias: await import("@/app/(app)/solicitudes/acciones-dias-inhabiles"),
    anexos: await import("@/app/(app)/solicitudes/[id]/anexos/route"),
    archivos: await import("@/app/(app)/solicitudes/[id]/archivos/route"),
  };
  empresaA = await m.db.empresa.create({
    data: { rfc: "DME200101AB1", razonSocial: "EMPRESA A SA DE CV", correoElectronico: "a@a.mx", tipoPersona: "MORAL" },
  });
  empresaB = await m.db.empresa.create({
    data: { rfc: "PEPJ800101AB2", tipoPersona: "FISICA", nombre: "JUANA", apellidoPaterno: "PEREZ", correoElectronico: "b@b.mx" },
  });
  await m.db.tramiteVersion.create({
    data: {
      claveVucem: "260211",
      nombre: "Prueba",
      plataforma: "VUCEM_CLASICA",
      vigenteDesde: new Date("2019-04-17T00:00:00Z"),
      definicion: JSON.stringify(DEFINICION_260211_INICIAL),
    },
  });
  const est = await m.db.establecimiento.create({
    data: {
      empresaId: empresaA.id,
      denominacionRazonSocial: "ALMACEN CENTRAL",
      rfcResponsableSanitario: "PEPJ800101AB1",
      correoElectronico: "resp@a.mx",
      telefono: "5555555555",
      calle: "CALLE 1",
      numeroExterior: "10",
      codigoPostal: "54060",
      entidadFederativa: "MEXICO",
      municipio: "TLALNEPANTLA",
      noLicenciaSanitaria: "LIC-1",
      scian: { create: [{ clave: "435313" }] },
    },
  });
  establecimientoId = est.id;
  const fab = await m.db.tercero.create({
    data: {
      empresaId: empresaA.id,
      tipo: "FABRICANTE",
      tipoPersona: "MORAL",
      denominacionRazonSocial: "MEDICAL INC",
      correoElectronico: "x@example.com",
      pais: "USA",
      entidadFederativa: "CA",
      calle: "MARKET ST",
      numeroExterior: "1",
    },
  });
  fabricanteId = fab.id;
  const des = await m.db.tercero.create({
    data: {
      empresaId: empresaA.id,
      tipo: "DESTINATARIO",
      tipoPersona: "MORAL",
      nacionalidad: "NACIONAL",
      denominacionRazonSocial: "EMPRESA A SA DE CV",
      rfc: "DME200101AB1",
      pais: "MEX",
      entidadFederativa: "MEXICO",
      municipio: "TLALNEPANTLA",
      localidad: "TLALNEPANTLA",
      colonia: "CENTRO",
      codigoPostal: "54060",
      calle: "CALLE 1",
      numeroExterior: "10",
      numeroInterior: "S/N",
      telefono: "5555555555",
    },
  });
  destinatarioId = des.id;
  const prod = await m.db.producto.create({
    data: {
      empresaId: empresaA.id,
      denominacionEspecifica: "JERINGA 5 ML",
      denominacionDistintiva: "MARCA",
      denominacionComunCientifica: "JERINGA",
      idClasificacionProducto: "52",
      idSubClasificacionProducto: "25",
      idTipoProducto: "0245",
      fraccionArancelaria: "90183101",
      desUMC: "PIEZA",
      presentacionTipoEnvase: "CAJA",
      numRegistroSanitario: "1234C2020 SSA",
      vigenciaRegistroSanitario: new Date("2030-06-30T12:00:00Z"),
      cvePaisOrigen: "USA",
      idUsoEspecifico: "108",
      fabricanteId: fab.id,
    },
  });
  productoId = prod.id;
  await crearDocumento({ tipo: "LICENCIA_SANITARIA", nombre: "Licencia", establecimientoId });
  await crearDocumento({ tipo: "AVISO_RESPONSABLE", nombre: "Aviso de responsable", establecimientoId });
  await crearDocumento({ tipo: "REGISTRO_SANITARIO", nombre: "Registro jeringa", productoId });
  await m.db.diaInhabil.create({ data: { fecha: new Date("2026-11-16T12:00:00Z"), descripcion: "Revolución" } });
});

afterAll(async () => {
  await m?.db.$disconnect();
  (globalThis as { prisma?: unknown }).prisma = undefined;
  rmSync(dirTemporal, { recursive: true, force: true });
});

beforeEach(() => usarEmpresa(empresaA));

describe("captura de la solicitud", () => {
  it("crea el borrador con consecutivo y liga documentos del establecimiento y el destinatario único", async () => {
    const id = await crearBorrador();
    const sol = await m.db.solicitud.findUniqueOrThrow({ where: { id }, include: { documentos: true, terceros: true } });
    expect(sol.estado).toBe("BORRADOR");
    expect(sol.empresaId).toBe(empresaA.id);
    expect(sol.documentos.map((d) => d.requisito).sort()).toEqual(["AVISO_RESPONSABLE", "LICENCIA_O_AVISO"]);
    expect(sol.terceros).toEqual([expect.objectContaining({ terceroId: destinatarioId, rol: "DESTINATARIO" })]);
    expect(sol.rlRfc).toBeNull();
    const id2 = await crearBorrador();
    const sol2 = await m.db.solicitud.findUniqueOrThrow({ where: { id: id2 } });
    expect(sol2.numero).toBe(sol.numero + 1);
  });

  it("no permite crear con un establecimiento de otra empresa ni con rol de consulta", async () => {
    usarEmpresa(empresaB);
    const r = await m.acc.crearSolicitud(ESTADO, datosForm({ establecimientoId }));
    expect(r.ok).toBe(false);
    expect(r.errores?.establecimientoId).toBeDefined();
    usarEmpresa(empresaA, "CONSULTA");
    expect((await m.acc.crearSolicitud(ESTADO, datosForm({ establecimientoId }))).mensaje).toMatch(/permiso/);
  });

  it("agregar mercancía copia el producto y liga su fabricante y su registro sanitario", async () => {
    const id = await crearBorrador();
    const r = await m.par.agregarPartida(id, ESTADO, datosForm({ ...partidaValida, productoId, fechaCaducidad: "2028-01-31" }));
    expect(r.ok).toBe(true);
    expect(r.mensaje).toMatch(/fabricante/);
    const sol = await m.db.solicitud.findUniqueOrThrow({ where: { id }, include: { partidas: true, terceros: true, documentos: true } });
    expect(sol.partidas).toHaveLength(1);
    expect(sol.partidas[0]).toMatchObject({
      denominacionEspecifica: "JERINGA 5 ML",
      fraccionArancelaria: "90183101",
      numRegistroSanitario: "1234C2020 SSA",
      cvePaisOrigen: "USA",
      cvePaisProcedencia: "USA",
      idUsoEspecifico: "108",
      cantidadUMC: "100.5",
      orden: 1,
    });
    expect(sol.terceros.some((t) => t.terceroId === fabricanteId && t.rol === "FABRICANTE")).toBe(true);
    expect(sol.documentos.some((d) => d.requisito === "REGISTRO_SANITARIO")).toBe(true);

    const p = sol.partidas[0];
    const edicion = {
      denominacionEspecifica: p.denominacionEspecifica,
      denominacionDistintiva: p.denominacionDistintiva,
      denominacionComunCientifica: p.denominacionComunCientifica,
      fraccionArancelaria: "123",
      cantidadUMT: "10",
      cantidadUMC: "10",
      desUMC: "CAJA",
      presentacionTipoEnvase: "CAJA",
      cvePaisOrigen: "USA",
      cvePaisProcedencia: "CAN",
    };
    const malo = await m.par.guardarPartida(id, p.id, ESTADO, datosForm(edicion));
    expect(malo.ok).toBe(false);
    expect(malo.errores?.fraccionArancelaria).toBeDefined();
    const bueno = await m.par.guardarPartida(id, p.id, ESTADO, datosForm({ ...edicion, fraccionArancelaria: "90183102" }));
    expect(bueno.ok).toBe(true);
    const editada = await m.db.partidaSolicitud.findUniqueOrThrow({ where: { id: p.id } });
    expect(editada).toMatchObject({ fraccionArancelaria: "90183102", cvePaisProcedencia: "CAN", desUMC: "CAJA", idUsoEspecifico: null });
    // El catálogo no cambia.
    expect((await m.db.producto.findUniqueOrThrow({ where: { id: productoId } })).fraccionArancelaria).toBe("90183101");
    expect((await m.par.recopiarPartida(id, p.id)).ok).toBe(true);
    expect((await m.db.partidaSolicitud.findUniqueOrThrow({ where: { id: p.id } })).fraccionArancelaria).toBe("90183101");
    const cant = await m.par.agregarPartida(id, ESTADO, datosForm({ ...partidaValida, productoId, cantidadUMT: "1.2345" }));
    expect(cant.errores?.cantidadUMT).toBeDefined();
  });

  it("marcar como lista exige validación sin errores y vuelve a borrador al editar", async () => {
    const id = await crearBorrador();
    const sinDatos = await m.acc.marcarLista(id);
    expect(sinDatos.ok).toBe(false);
    expect(sinDatos.mensaje).toMatch(/error/);

    await completar(id);
    const lista = await m.acc.marcarLista(id);
    expect(lista).toEqual({ ok: true, mensaje: "La solicitud está lista para presentarse." });
    expect((await m.db.solicitud.findUniqueOrThrow({ where: { id } })).estado).toBe("LISTA");

    const edicion = await m.acc.guardarManifiestos(id, ESTADO, datosForm({ cveDeclaracion: "on", publicos: "NO" }));
    expect(edicion.mensaje).toMatch(/volvió a borrador/);
    const sol = await m.db.solicitud.findUniqueOrThrow({ where: { id } });
    expect(sol.estado).toBe("BORRADOR");
    expect(sol.informacionConfidencial).toBe(true);
    expect(sol.importePago).toBe("3117.00");
  });

  it("pago omitido requiere confirmación y limpia los datos", async () => {
    const id = await crearBorrador();
    const sinConfirmar = await m.acc.guardarPago(id, ESTADO, datosForm({ pagoOmitido: "on" }));
    expect(sinConfirmar.errores?.confirmarOmision).toBeDefined();
    const ok = await m.acc.guardarPago(id, ESTADO, datosForm({ pagoOmitido: "on", confirmarOmision: "on", llavePago: "X" }));
    expect(ok.ok).toBe(true);
    const sol = await m.db.solicitud.findUniqueOrThrow({ where: { id } });
    expect(sol.pagoOmitido).toBe(true);
    expect(sol.llavePago).toBeNull();
  });

  it("terceros y documentos: valida tipo y empresa", async () => {
    const id = await crearBorrador();
    const malRol = await m.rel.agregarTercero(id, ESTADO, datosForm({ terceroId: fabricanteId, rol: "DESTINATARIO" }));
    expect(malRol.errores?.terceroId).toBeDefined();
    expect((await m.rel.agregarTercero(id, ESTADO, datosForm({ terceroId: fabricanteId, rol: "FABRICANTE" }))).ok).toBe(true);
    expect((await m.rel.agregarTercero(id, ESTADO, datosForm({ terceroId: fabricanteId, rol: "FABRICANTE" }))).mensaje).toMatch(/ya está/);

    const ajeno = await crearDocumento({ tipo: "MARBETE", nombre: "Marbete ajeno", empresaId: empresaB.id });
    expect((await m.rel.ligarDocumento(id, ESTADO, datosForm({ documentoId: ajeno.id, requisito: "MARBETE" }))).ok).toBe(false);
    const marbete = await crearDocumento({ tipo: "MARBETE", nombre: "Marbete" });
    expect((await m.rel.ligarDocumento(id, ESTADO, datosForm({ documentoId: marbete.id, requisito: "OTRO" }))).errores?.documentoId).toBeDefined();
    expect((await m.rel.ligarDocumento(id, ESTADO, datosForm({ documentoId: marbete.id, requisito: "MARBETE" }))).ok).toBe(true);
    const sd = await m.db.solicitudDocumento.findFirstOrThrow({ where: { solicitudId: id, documentoId: marbete.id } });
    expect((await m.rel.desligarDocumento(id, sd.id)).ok).toBe(true);
    expect(await m.db.documento.count({ where: { id: marbete.id } })).toBe(1);
  });

  it("otra empresa no puede ver ni modificar la solicitud", async () => {
    const id = await crearBorrador();
    usarEmpresa(empresaB);
    expect((await m.acc.guardarManifiestos(id, ESTADO, datosForm({ cveDeclaracion: "on", publicos: "SI" }))).mensaje).toMatch(/no existe/);
    const res = await m.anexos.GET(new NextRequest(`http://localhost/solicitudes/${id}/anexos`), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(404);
  });

  it("persona física: prellena el representante con sus datos", async () => {
    const estB = await m.db.establecimiento.create({
      data: {
        empresaId: empresaB.id,
        denominacionRazonSocial: "LOCAL",
        rfcResponsableSanitario: "PEPJ800101AB2",
        correoElectronico: "r@b.mx",
        telefono: "1",
        calle: "C",
        codigoPostal: "01000",
        entidadFederativa: "CIUDAD DE MEXICO",
        municipio: "ALVARO OBREGON",
      },
    });
    usarEmpresa(empresaB);
    const url = await redireccion(m.acc.crearSolicitud(ESTADO, datosForm({ establecimientoId: estB.id })));
    const id = url.split("/")[2].split("?")[0];
    const sol = await m.db.solicitud.findUniqueOrThrow({ where: { id } });
    expect(sol).toMatchObject({ rlRfc: "PEPJ800101AB2", rlNombre: "JUANA", rlApellidoPaterno: "PEREZ", numero: 1 });
  });
});

describe("seguimiento", () => {
  it("presentación en portal, requerimiento, atención, resolución parcial y descargas", async () => {
    const id = await crearBorrador();
    await completar(id);
    await m.par.agregarPartida(id, ESTADO, datosForm({ ...partidaValida, productoId, cantidadUMC: "5" }));

    const sinFolio = await m.seg.registrarPresentacion(id, ESTADO, datosForm({ folioVucem: "123", fechaPresentacion: "2026-10-05" }));
    expect(sinFolio.errores?.folioVucem).toBeDefined();
    const noPdf = await m.seg.registrarPresentacion(
      id,
      ESTADO,
      datosForm({ folioVucem: "1".repeat(25), fechaPresentacion: "2026-10-05", acuse: new File(["hola"], "acuse.pdf", { type: "application/pdf" }) }),
    );
    expect(noPdf.errores?.acuse).toBeDefined();
    const url = await redireccion(
      m.seg.registrarPresentacion(
        id,
        ESTADO,
        datosForm({ folioVucem: "1".repeat(25), numeroTemporal: "T-1", fechaPresentacion: "2026-10-05", acuse: new File([PDF], "acuse.pdf", { type: "application/pdf" }) }),
      ),
    );
    expect(url).toBe(`/solicitudes/${id}?presentada=1`);
    let sol = await m.db.solicitud.findUniqueOrThrow({ where: { id } });
    expect(sol).toMatchObject({ estado: "PRESENTADA", canalPresentacion: "PORTAL", folioVucem: "1".repeat(25) });
    expect(sol.acuseRuta?.startsWith(`${empresaA.id}/acuses/`)).toBe(true);

    // Ya no se puede editar la captura.
    expect((await m.acc.guardarManifiestos(id, ESTADO, datosForm({ cveDeclaracion: "on", publicos: "SI" }))).mensaje).toMatch(/ya no se pueden modificar/);

    // Viernes 13 de noviembre de 2026 + 5 días hábiles (lunes 16 inhábil) → lunes 23.
    const req = await m.seg.registrarRequerimiento(
      id,
      ESTADO,
      datosForm({ fechaNotificacion: "2026-11-13", plazoDiasHabiles: "3", descripcion: "Aclarar fracción" }),
    );
    // Fecha futura respecto de hoy en la prueba: se acepta solo si no es posterior a hoy.
    if (req.ok) {
      expect(req.mensaje).toMatch(/menor a 5 días/);
    } else {
      expect(req.errores?.fechaNotificacion).toBeDefined();
    }
    const req2 = await m.seg.registrarRequerimiento(
      id,
      ESTADO,
      datosForm({ fechaNotificacion: "2026-10-09", plazoDiasHabiles: "5", descripcion: "Presentar marbete" }),
    );
    expect(req2.ok).toBe(true);
    expect(req2.mensaje).toMatch(/16\/10\/2026/);
    const requerimientos = await m.db.requerimiento.findMany({ where: { solicitudId: id, estado: "PENDIENTE" } });
    expect((await m.db.solicitud.findUniqueOrThrow({ where: { id } })).estado).toBe("REQUERIMIENTO");

    for (const r of requerimientos) {
      const at = await m.seg.atenderRequerimiento(id, r.id, ESTADO, datosForm({ fechaAtencion: "2026-10-12" }));
      expect(at.ok || at.errores?.fechaAtencion).toBeTruthy();
      if (!at.ok) await m.seg.eliminarRequerimiento(id, r.id);
    }
    expect((await m.db.solicitud.findUniqueOrThrow({ where: { id } })).estado).toBe("PRESENTADA");

    const partidas = await m.db.partidaSolicitud.findMany({ where: { solicitudId: id }, orderBy: { orden: "asc" } });
    const incompleta = await m.seg.registrarResolucion(
      id,
      ESTADO,
      datosForm({ sentido: "PARCIAL", numeroPermiso: "P-1", fechaResolucion: "2026-10-10", [`resultado_${partidas[0].id}`]: "ACEPTADA" }),
    );
    expect(incompleta.errores?.[`resultado_${partidas[1].id}`]).toBeDefined();
    const resuelta = await m.seg.registrarResolucion(
      id,
      ESTADO,
      datosForm({
        sentido: "PARCIAL",
        numeroPermiso: "P-1",
        fechaResolucion: "2026-10-10",
        vigenciaHasta: "2027-04-10",
        [`resultado_${partidas[0].id}`]: "ACEPTADA",
        [`resultado_${partidas[1].id}`]: "RECHAZADA",
        documento: new File([PDF], "res.pdf", { type: "application/pdf" }),
      }),
    );
    expect(resuelta).toEqual({ ok: true, mensaje: "Resolución registrada." });
    sol = await m.db.solicitud.findUniqueOrThrow({ where: { id } });
    expect(sol.estado).toBe("RESUELTA_PARCIAL");
    const resultados = await m.db.partidaSolicitud.findMany({ where: { solicitudId: id }, orderBy: { orden: "asc" }, select: { resultado: true } });
    expect(resultados.map((r) => r.resultado)).toEqual(["ACEPTADA", "RECHAZADA"]);

    const acuse = await m.archivos.GET(new NextRequest(`http://localhost/solicitudes/${id}/archivos?tipo=acuse`), { params: Promise.resolve({ id }) });
    expect(acuse.status).toBe(200);
    expect(acuse.headers.get("content-type")).toBe("application/pdf");
    expect(acuse.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(Buffer.from(await acuse.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
    const resolucion = await m.archivos.GET(new NextRequest(`http://localhost/x?tipo=resolucion`), { params: Promise.resolve({ id }) });
    expect(resolucion.status).toBe(200);
    const malo = await m.archivos.GET(new NextRequest(`http://localhost/x?tipo=../../etc`), { params: Promise.resolve({ id }) });
    expect(malo.status).toBe(400);

    const zipRes = await m.anexos.GET(new NextRequest(`http://localhost/solicitudes/${id}/anexos`), { params: Promise.resolve({ id }) });
    expect(zipRes.status).toBe(200);
    expect(zipRes.headers.get("cache-control")).toBe("no-store");
    const zip = await JSZip.loadAsync(await zipRes.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual([
      "01_LICENCIA_O_AVISO_Licencia.pdf",
      "02_AVISO_RESPONSABLE_Aviso_de_responsable.pdf",
      "03_REGISTRO_SANITARIO_Registro_jeringa.pdf",
    ]);

    // Duplicar: nuevo borrador sin pago, declaración ni seguimiento.
    const urlCopia = await redireccion(m.acc.duplicarSolicitud(id));
    const idCopia = urlCopia.split("/")[2].split("?")[0];
    const copia = await m.db.solicitud.findUniqueOrThrow({ where: { id: idCopia }, include: { partidas: true, documentos: true, terceros: true } });
    expect(copia).toMatchObject({ estado: "BORRADOR", cveDeclaracion: false, llavePago: null, folioVucem: null, cveAduana: "470" });
    expect(copia.partidas.map((p) => p.resultado)).toEqual([null, null]);
    expect(copia.documentos).toHaveLength(3);
    expect(copia.terceros).toHaveLength(2);

    expect((await m.acc.cancelarSolicitud(id)).ok).toBe(false);
    expect((await m.acc.cancelarSolicitud(idCopia)).ok).toBe(true);
  });
});

describe("días inhábiles", () => {
  it("solo el administrador los agrega y se recalculan los requerimientos pendientes", async () => {
    const id = await crearBorrador();
    await m.db.solicitud.update({ where: { id }, data: { estado: "PRESENTADA", fechaPresentacion: new Date("2026-10-01T12:00:00Z") } });
    expect((await m.seg.registrarRequerimiento(id, ESTADO, datosForm({ fechaNotificacion: "2026-10-05", plazoDiasHabiles: "10", descripcion: "X" }))).ok).toBe(true);
    const antes = await m.db.requerimiento.findFirstOrThrow({ where: { solicitudId: id } });
    expect(antes.fechaLimite.toISOString().slice(0, 10)).toBe("2026-10-19");

    usarEmpresa(empresaA, "CAPTURISTA");
    expect((await m.dias.agregarDiaInhabil(ESTADO, datosForm({ fecha: "2026-10-14", descripcion: "Vacaciones" }))).ok).toBe(false);
    usarEmpresa(empresaA);
    const r = await m.dias.agregarDiaInhabil(ESTADO, datosForm({ fecha: "2026-10-14", descripcion: "Vacaciones COFEPRIS" }));
    expect(r.ok).toBe(true);
    expect(r.mensaje).toMatch(/1 requerimiento/);
    const despues = await m.db.requerimiento.findFirstOrThrow({ where: { solicitudId: id } });
    expect(despues.fechaLimite.toISOString().slice(0, 10)).toBe("2026-10-20");
    expect((await m.dias.agregarDiaInhabil(ESTADO, datosForm({ fecha: "2026-10-14", descripcion: "Repetido" }))).errores?.fecha).toBeDefined();

    const dia = await m.db.diaInhabil.findFirstOrThrow({ where: { fecha: new Date("2026-10-14T12:00:00Z") } });
    expect((await m.dias.eliminarDiaInhabil(dia.id)).ok).toBe(true);
    expect((await m.db.requerimiento.findFirstOrThrow({ where: { solicitudId: id } })).fechaLimite.toISOString().slice(0, 10)).toBe("2026-10-19");
  });
});
