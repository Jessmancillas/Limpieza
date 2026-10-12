// Integración del módulo VUCEM: server actions de configuración y de envío contra una base SQLite
// temporal (migraciones reales) y un almacenamiento temporal. `fetch` se redirige a la lógica del
// simulador (sin servidor HTTP) y la e.firma es la de prueba de tests/vucem/fixtures.
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { descifrarLlave, firmarCadena, leerCertificado } from "@/lib/firma/firmar";
import { DEFINICION_260211_INICIAL } from "@/lib/tramite/definicion";

import { PASSWORD_LLAVE, leerFixture } from "./fabrica";

const entorno = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR ?? "/tmp"}/vucem-${process.pid}-${Date.now()}`;
  process.env.DATABASE_URL = `file:${dir}/prueba.db`;
  process.env.STORAGE_DIR = `${dir}/almacen`;
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.APP_URL = "http://localhost:3000";
  return { dir, ctx: null as null | Record<string, unknown>, peticiones: [] as Array<{ url: string; soapAction: string | null; body: string }> };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  redirect: vi.fn((ruta: string) => {
    throw new Error(`REDIRECT:${ruta}`);
  }),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
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

const cert = leerCertificado(new Uint8Array(leerFixture("efirma-prueba.cer")));
const llave = descifrarLlave(new Uint8Array(leerFixture("efirma-prueba.key")), PASSWORD_LLAVE);
const pdf = leerFixture("documento-prueba.pdf");

beforeAll(async () => {
  mkdirSync(entorno.dir, { recursive: true });
  const sqlite = new Database(`${entorno.dir}/prueba.db`);
  const dirMig = path.resolve(__dirname, "../../prisma/migrations");
  for (const m of readdirSync(dirMig).filter((d) => !d.endsWith(".toml")).sort()) {
    sqlite.exec(readFileSync(path.join(dirMig, m, "migration.sql"), "utf8"));
  }
  sqlite.close();

  const { procesarDigitalizacion, procesarSolicitud } = await import("@/lib/vucem/simulador");
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const body = String(init.body);
    const headers = init.headers as Record<string, string>;
    entorno.peticiones.push({ url, soapAction: headers.SOAPAction ?? null, body });
    expect(headers["Content-Type"]).toBe("text/xml; charset=utf-8");
    const r = url.endsWith("/digitalizacion") ? procesarDigitalizacion(body, { demoraMs: 0 }) : procesarSolicitud(body);
    return new Response(r.xml, { status: r.status });
  });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  const { db } = await import("@/lib/db");
  await db.$disconnect();
  rmSync(entorno.dir, { recursive: true, force: true });
});

const ids = { empresa: "", usuario: "", solicitud: "", docs: [] as string[] };
let empresaCompleta: Record<string, unknown> = {};

function comoRol(rol: string) {
  entorno.ctx = { sesionId: "s", usuario: { id: ids.usuario, nombre: "Admin" }, empresa: empresaCompleta, rol, membresias: [] };
}

async function sembrar() {
  const { db } = await import("@/lib/db");
  const { guardarArchivo } = await import("@/lib/storage");
  const usuario = await db.usuario.create({ data: { email: "admin@ejemplo.mx", nombre: "Admin", passwordHash: "x" } });
  const empresa = await db.empresa.create({
    data: {
      rfc: "DME200101AB1",
      tipoPersona: "MORAL",
      razonSocial: "DISPOSITIVOS MEDICOS DEMO SA DE CV",
      correoElectronico: "permisos@ejemplo.mx",
      telefono: "5555555555",
      calle: "AV. EJEMPLO",
      numeroExterior: "100",
      codigoPostal: "06600",
      colonia: "JUAREZ",
      localidad: "CIUDAD DE MEXICO",
      municipio: "CUAUHTEMOC",
      entidadFederativa: "CIUDAD DE MEXICO",
    },
  });
  await db.membresia.create({ data: { usuarioId: usuario.id, empresaId: empresa.id, rol: "ADMIN" } });
  const tv = await db.tramiteVersion.create({
    data: {
      claveVucem: "260211",
      nombre: "Permiso sanitario de importación de dispositivos médicos",
      plataforma: "VUCEM_CLASICA",
      vigenteDesde: new Date("2019-04-17T00:00:00Z"),
      definicion: JSON.stringify(DEFINICION_260211_INICIAL),
    },
  });
  const est = await db.establecimiento.create({
    data: {
      empresaId: empresa.id,
      denominacionRazonSocial: "DISPOSITIVOS MEDICOS DEMO SA DE CV - ALMACEN",
      rfcResponsableSanitario: "PEPJ800101AB1",
      correoElectronico: "responsable@ejemplo.mx",
      telefono: "5555555556",
      calle: "CALLE BODEGA",
      numeroExterior: "12",
      codigoPostal: "54060",
      entidadFederativa: "MEXICO",
      municipio: "TLALNEPANTLA DE BAZ",
      colonia: "INDUSTRIAL",
      localidad: "TLALNEPANTLA",
      noLicenciaSanitaria: "41414141",
      scian: { create: [{ clave: "435313" }] },
    },
  });
  const fabricante = await db.tercero.create({
    data: {
      empresaId: empresa.id,
      tipo: "FABRICANTE",
      tipoPersona: "MORAL",
      denominacionRazonSocial: "MEDICAL DEVICES EXAMPLE INC",
      correoElectronico: "export@example.com",
      pais: "USA",
      entidadFederativa: "CA",
      codigoPostal: "94105",
      calle: "MARKET ST",
      numeroExterior: "500",
      telefono: "4155550100",
    },
  });
  const destinatario = await db.tercero.create({
    data: {
      empresaId: empresa.id,
      tipo: "DESTINATARIO",
      tipoPersona: "MORAL",
      nacionalidad: "NACIONAL",
      denominacionRazonSocial: "DISPOSITIVOS MEDICOS DEMO SA DE CV",
      rfc: "DME200101AB1",
      correoElectronico: "permisos@ejemplo.mx",
      pais: "MEX",
      entidadFederativa: "MEXICO",
      municipio: "TLALNEPANTLA DE BAZ",
      colonia: "INDUSTRIAL",
      localidad: "TLALNEPANTLA",
      codigoPostal: "54060",
      calle: "CALLE BODEGA",
      numeroExterior: "12",
      numeroInterior: "S/N",
      telefono: "5555555556",
    },
  });
  const producto = await db.producto.create({
    data: {
      empresaId: empresa.id,
      denominacionEspecifica: "JERINGA DESECHABLE ESTERIL 5 ML",
      denominacionDistintiva: "MARCA DEMO",
      denominacionComunCientifica: "JERINGA HIPODERMICA",
      fraccionArancelaria: "90183101",
      desUMC: "PIEZA",
      presentacionTipoEnvase: "CAJA CON 100 PIEZAS",
      numRegistroSanitario: "1234C2020 SSA",
      vigenciaRegistroSanitario: new Date("2030-06-30T12:00:00Z"),
    },
  });
  const ruta = await guardarArchivo(empresa.id, pdf, "pdf");
  const crearDoc = (tipo: string, nombre: string, extra: Record<string, unknown> = {}) =>
    db.documento.create({
      data: {
        empresaId: empresa.id,
        tipo,
        nombre,
        idTipoDocumentoVucem: "123",
        archivoOriginalRuta: ruta,
        archivoOriginalNombre: "x.pdf",
        archivoOriginalBytes: pdf.length,
        archivoOriginalMime: "application/pdf",
        archivoVucemRuta: ruta,
        archivoVucemBytes: pdf.length,
        paginas: 1,
        dpi: 300,
        estadoConversion: "OK",
        ...extra,
      },
    });
  const docs = [
    await crearDoc("LICENCIA_SANITARIA", "Licencia sanitaria", { establecimientoId: est.id }),
    await crearDoc("AVISO_RESPONSABLE", "Aviso de responsable sanitario", { establecimientoId: est.id }),
    await crearDoc("REGISTRO_SANITARIO", "Registro sanitario jeringa", { productoId: producto.id, idTipoDocumentoVucem: null }),
  ];
  const sol = await db.solicitud.create({
    data: {
      numero: 1,
      empresaId: empresa.id,
      tramiteVersionId: tv.id,
      establecimientoId: est.id,
      estado: "LISTA",
      cveRegimen: "01",
      cveAduana: "470",
      cveDeclaracion: true,
      rlRfc: "PEPJ800101AB1",
      rlNombre: "JUAN",
      rlApellidoPaterno: "PEREZ",
      claveReferencia: "123456789",
      cadenaDependencia: "00012345678901",
      cveBanco: "15",
      llavePago: "ABC123DEF456",
      fechaPago: new Date("2026-10-05T12:00:00Z"),
      importePago: "3117.00",
      partidas: {
        create: [
          {
            productoId: producto.id,
            orden: 1,
            idClasificacionProducto: "52",
            idSubClasificacionProducto: "25",
            denominacionEspecifica: "JERINGA DESECHABLE ESTERIL 5 ML",
            denominacionDistintiva: "MARCA DEMO",
            denominacionComunCientifica: "JERINGA HIPODERMICA",
            idTipoProducto: "245",
            idFormaFarmaceutica: "12",
            idEstadoFisico: "3",
            fraccionArancelaria: "90183101",
            cantidadUMT: "1000",
            cantidadUMC: "1000",
            umt: "6",
            umc: "6",
            desUMC: "PIEZA",
            presentacionTipoEnvase: "CAJA CON 100 PIEZAS",
            numRegistroSanitario: "1234C2020 SSA",
            cvePaisOrigen: "USA",
            cvePaisProcedencia: "USA",
            idUsoEspecifico: "108",
          },
        ],
      },
      terceros: {
        create: [
          { terceroId: fabricante.id, rol: "FABRICANTE" },
          { terceroId: destinatario.id, rol: "DESTINATARIO" },
        ],
      },
      documentos: {
        create: [
          { documentoId: docs[0].id, requisito: "LICENCIA_O_AVISO" },
          { documentoId: docs[1].id, requisito: "AVISO_RESPONSABLE" },
          { documentoId: docs[2].id, requisito: "REGISTRO_SANITARIO" },
        ],
      },
    },
  });
  ids.empresa = empresa.id;
  ids.usuario = usuario.id;
  ids.solicitud = sol.id;
  ids.docs = docs.map((d) => d.id);
  empresaCompleta = empresa;
}

function formData(datos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(datos)) fd.set(k, v);
  return fd;
}

describe("flujo completo VUCEM contra el simulador", () => {
  beforeAll(sembrar);
  beforeEach(() => comoRol("ADMIN"));

  it("configuración: ambiente SIMULADOR y contraseña cifrada (nunca en claro ni en bitácora)", async () => {
    const { db } = await import("@/lib/db");
    const { guardarConfiguracionVucem, guardarCredencialVucem } = await import("@/app/(app)/configuracion/vucem/acciones");
    const { passwordSimulador } = await import("@/lib/vucem/simulador");

    const cfg = await guardarConfiguracionVucem({ ok: false }, formData({ ambiente: "SIMULADOR", operacionSolicitud: "registrarSolicitud", urlSolicitud: "http://inseguro" }));
    expect(cfg.ok).toBe(false);
    expect(cfg.errores?.urlSolicitud).toBeDefined();
    const ok = await guardarConfiguracionVucem({ ok: false }, formData({ ambiente: "SIMULADOR", operacionSolicitud: "registrarSolicitud", soapActionSolicitud: "urn:registrar" }));
    expect(ok).toMatchObject({ ok: true });

    const prod = await guardarConfiguracionVucem({ ok: false }, formData({ ambiente: "PRODUCCION" }));
    expect(prod.errores?.confirmarProduccion).toBeDefined();

    const cred = await guardarCredencialVucem({ ok: false }, formData({ usuarioWs: "dme200101ab1", password: passwordSimulador() }));
    expect(cred.ok).toBe(true);
    expect(JSON.stringify(cred)).not.toContain(passwordSimulador());
    const guardada = await db.credencialVucem.findUniqueOrThrow({ where: { empresaId: ids.empresa } });
    expect(guardada.usuarioWs).toBe("DME200101AB1");
    expect(guardada.passwordCifrado).not.toContain(passwordSimulador());
    const bitacora = await db.bitacora.findMany({ where: { empresaId: ids.empresa } });
    expect(JSON.stringify(bitacora)).not.toContain(passwordSimulador());

    comoRol("CAPTURISTA");
    expect((await guardarCredencialVucem({ ok: false }, formData({ usuarioWs: "DME200101AB1", password: "x" }))).mensaje).toMatch(/administrador/);
  });

  it("páginas antes de digitalizar", async () => {
    const PaginaConfig = (await import("@/app/(app)/configuracion/vucem/page")).default;
    const PaginaEnvio = (await import("@/app/(app)/solicitudes/[id]/vucem/page")).default;
    const config = renderToStaticMarkup(await PaginaConfig());
    expect(config).toContain("El Manual WS 260211 no publica la URL ni el WSDL");
    expect(config).toContain("Guardada");
    expect(config).not.toContain("simulador-vucem");
    expect(config).toContain("Reemplazar contraseña");

    const envio = renderToStaticMarkup(await PaginaEnvio({ params: Promise.resolve({ id: ids.solicitud }) }));
    expect(envio).toContain("Paso 1 · Digitalizar anexos");
    expect(envio).toContain("Tu e.firma se usa solo en este navegador; el archivo .key y su contraseña nunca se envían al servidor.");
    expect(envio).toContain("Faltan 3 documento(s) por digitalizar");
    expect(envio).toContain("&gt;********&lt;/wsse:Password&gt;");
    expect(envio).not.toContain("simulador-vucem");

    comoRol("CONSULTA");
    const consulta = renderToStaticMarkup(await PaginaEnvio({ params: Promise.resolve({ id: ids.solicitud }) }));
    expect(consulta).toContain("solo consulta");
    expect(consulta).not.toContain("Tu e.firma se usa solo en este navegador");
    const configConsulta = renderToStaticMarkup(await PaginaConfig());
    expect(configConsulta).not.toContain("Reemplazar contraseña");
    expect(configConsulta).not.toContain('name="ambiente"');
    comoRol("ADMIN");
    await expect(PaginaEnvio({ params: Promise.resolve({ id: "no-existe" }) })).rejects.toThrow("NOT_FOUND");
  });

  it("digitalización: tipo de documento, cadenas desde el certificado, registro y consulta", async () => {
    const { db } = await import("@/lib/db");
    const acciones = await import("@/app/(app)/solicitudes/[id]/vucem/acciones");

    // El registro sanitario no tiene tipo VUCEM: se omite hasta elegirlo.
    let prep = await acciones.prepararDigitalizacion(ids.solicitud, cert.certificadoBase64);
    expect(prep.ok).toBe(true);
    if (!prep.ok) return;
    expect(prep.rfcFirmante).toBe("DME200101AB1");
    expect(prep.documentos).toHaveLength(2);
    expect(prep.omitidos[0].motivo).toMatch(/tipo de documento/);

    const tipo = await acciones.guardarTipoDocumentoVucem(
      { ok: false },
      formData({ solicitudId: ids.solicitud, documentoId: ids.docs[2], idTipoDocumentoVucem: "456" }),
    );
    expect(tipo.ok).toBe(true);
    prep = await acciones.prepararDigitalizacion(ids.solicitud, cert.certificadoBase64);
    if (!prep.ok) throw new Error(prep.mensaje);
    expect(prep.documentos).toHaveLength(3);
    expect(prep.documentos[0].cadena).toMatch(/^\|DME200101AB1\|permisos@ejemplo\.mx\|123\|Licencia sanitaria\|DME200101AB1\|e598327f0247fb4ded946aa49dea69b8ce654aab\|$/);

    // Una firma que no corresponde se rechaza sin enviar nada.
    const malas = await acciones.enviarDigitalizacion(ids.solicitud, {
      certificadoBase64: cert.certificadoBase64,
      firmas: [{ documentoId: prep.documentos[0].documentoId, cadena: prep.documentos[0].cadena, firma: firmarCadena(llave, "|otra|") }],
    });
    expect(malas.resultados[0]).toMatchObject({ ok: false });
    expect(entorno.peticiones).toHaveLength(0);

    const r = await acciones.enviarDigitalizacion(ids.solicitud, {
      certificadoBase64: cert.certificadoBase64,
      firmas: prep.documentos.map((d) => ({ documentoId: d.documentoId, cadena: d.cadena, firma: firmarCadena(llave, d.cadena) })),
    });
    expect(r.ok).toBe(true);
    expect(entorno.peticiones.every((p) => p.soapAction === '"http://www.ventanillaunica.gob.mx/RegistroDigitalizarDocumento"')).toBe(true);
    const enProceso = await db.documento.findMany({ where: { id: { in: ids.docs } } });
    expect(enProceso.every((d) => d.estadoEDocument === "PENDIENTE" && d.numeroOperacionEDoc)).toBe(true);

    const envios = await db.envioVucem.findMany({ where: { tipo: "DIGITALIZACION_REGISTRO" } });
    expect(envios).toHaveLength(3);
    for (const e of envios) {
      expect(e.requestXml).toContain(">********</wsse:Password>");
      expect(e.requestXml).not.toContain(pdf.toString("base64"));
      expect(e.exito).toBe(true);
    }

    // Doble envío: ya están en proceso.
    const repetido = await acciones.prepararDigitalizacion(ids.solicitud, cert.certificadoBase64);
    expect(repetido.ok && repetido.documentos).toEqual([]);

    const consulta = await acciones.consultarEstadoDigitalizacion(ids.solicitud);
    expect(consulta).toMatchObject({ ok: true, pendientes: 0 });
    const listos = await db.documento.findMany({ where: { id: { in: ids.docs } } });
    for (const d of listos) {
      expect(d.estadoEDocument).toBe("OK");
      expect(d.eDocument).toMatch(/^[0-9A-Z]{13}$/);
      expect(d.numeroTramiteEDoc).toMatch(/^\d{25}$/);
    }
  });

  it("envío 260211: exige cadena idéntica y firma válida; con folio queda PRESENTADA y no se reenvía", async () => {
    const { db } = await import("@/lib/db");
    const acciones = await import("@/app/(app)/solicitudes/[id]/vucem/acciones");
    const { cargarSolicitudCompleta } = await import("@/lib/solicitudes/consultas");
    const { validarSolicitud } = await import("@/lib/solicitudes/validacion");
    const { construirCadenaOriginal260211, construirPayload260211 } = await import("@/lib/vucem/solicitud-260211");

    const sol = await cargarSolicitudCompleta(ids.empresa, ids.solicitud);
    if (!sol) throw new Error("sin solicitud");
    const validacion = validarSolicitud(sol, { canal: "WS" });
    expect(validacion.errores).toEqual([]);
    const cadena = construirCadenaOriginal260211(construirPayload260211(sol), sol.empresa);
    expect(cadena.split("|").filter((c) => /^[0-9A-Z]{13}$/.test(c)).length).toBeGreaterThanOrEqual(3);

    const alterada = await acciones.enviarSolicitudVucem(ids.solicitud, {
      certificadoBase64: cert.certificadoBase64,
      cadenaOriginal: `${cadena}X|`,
      firma: firmarCadena(llave, `${cadena}X|`),
    });
    expect(alterada).toMatchObject({ ok: false });
    expect(alterada.mensaje).toMatch(/cambió/);

    const firmaMala = await acciones.enviarSolicitudVucem(ids.solicitud, {
      certificadoBase64: cert.certificadoBase64,
      cadenaOriginal: cadena,
      firma: firmarCadena(llave, "|otra|"),
    });
    expect(firmaMala.mensaje).toMatch(/firma/);

    comoRol("CONSULTA");
    const sinPermiso = await acciones.enviarSolicitudVucem(ids.solicitud, { certificadoBase64: cert.certificadoBase64, cadenaOriginal: cadena, firma: firmarCadena(llave, cadena) });
    expect(sinPermiso.ok).toBe(false);
    comoRol("ADMIN");

    const r = await acciones.enviarSolicitudVucem(ids.solicitud, {
      certificadoBase64: cert.certificadoBase64,
      cadenaOriginal: cadena,
      firma: firmarCadena(llave, cadena),
    });
    expect(r.ok).toBe(true);
    expect(r.folio).toMatch(/^04026002011\d{4}4006\d{6}$/);
    const ultima = entorno.peticiones.at(-1);
    expect(ultima?.soapAction).toBe('"urn:registrar"');
    expect(ultima?.body).toContain("<ws:registrarSolicitud>");

    const presentada = await db.solicitud.findUniqueOrThrow({ where: { id: ids.solicitud } });
    expect(presentada).toMatchObject({ estado: "PRESENTADA", canalPresentacion: "WS", folioVucem: r.folio });
    expect(presentada.fechaPresentacion).toBeInstanceOf(Date);

    const envio = await db.envioVucem.findFirstOrThrow({ where: { tipo: "SOLICITUD_260211", exito: true } });
    expect(envio.requestXml).toContain(">********</wsse:Password>");
    expect(envio.requestXml).not.toContain("simulador-vucem");
    expect(envio.resultado).toBe(r.folio);
    expect(await db.bitacora.count({ where: { accion: "ENVIAR_VUCEM", entidadId: ids.solicitud } })).toBe(1);

    const otraVez = await acciones.enviarSolicitudVucem(ids.solicitud, {
      certificadoBase64: cert.certificadoBase64,
      cadenaOriginal: cadena,
      firma: firmarCadena(llave, cadena),
    });
    expect(otraVez.ok).toBe(false);
    expect(otraVez.detalles?.join()).toMatch(/folio/);

    const PaginaEnvio = (await import("@/app/(app)/solicitudes/[id]/vucem/page")).default;
    const html = renderToStaticMarkup(await PaginaEnvio({ params: Promise.resolve({ id: ids.solicitud }) }));
    expect(html).toContain(`Presentada con folio ${r.folio}`);
    expect(html).toContain("no se puede volver a enviar");
    expect(html).toContain("Solicitud 260211");
    expect(html).not.toContain("simulador-vucem");
  });

  it("otra empresa no puede usar la solicitud", async () => {
    const acciones = await import("@/app/(app)/solicitudes/[id]/vucem/acciones");
    entorno.ctx = { ...(entorno.ctx as object), empresa: { id: "otra-empresa", rfc: "AAA010101AAA" } };
    const r = await acciones.prepararDigitalizacion(ids.solicitud, cert.certificadoBase64);
    expect(r).toMatchObject({ ok: false });
  });
});

