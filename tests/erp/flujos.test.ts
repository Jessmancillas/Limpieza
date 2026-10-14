// Pruebas de integración del ERP contra una base SQLite temporal creada con las migraciones del
// proyecto: procure-to-pay, order-to-cash, segregación de funciones, modelos de decisión y
// gobierno. Se simulan la sesión (obtenerContexto), redirect y revalidatePath.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const dirTemporal = mkdtempSync(path.join(tmpdir(), "erp-"));
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
  compras: typeof import("@/app/(app)/compras/acciones");
  almacen: typeof import("@/app/(app)/almacen/acciones");
  ventas: typeof import("@/app/(app)/ventas/acciones");
  cobranza: typeof import("@/app/(app)/cobranza/acciones");
  finanzas: typeof import("@/app/(app)/finanzas/acciones");
  gobierno: typeof import("@/app/(app)/gobierno/acciones");
  consultas: typeof import("@/lib/erp/servidor/consultas");
  tablero: typeof import("@/lib/erp/servidor/tablero");
};
let m: Modulos;
let empresa: { id: string };
let otraEmpresa: { id: string };

const ESTADO = { ok: false };
const HOY = new Date().toISOString().slice(0, 10);

/** Usuarios ficticios con su rol y áreas (Membresia.areas). */
const USUARIOS = {
  admin: { rol: "ADMIN", areas: null },
  compras: { rol: "CAPTURISTA", areas: "COMPRAS" },
  aprobador: { rol: "CAPTURISTA", areas: "APROBADOR" },
  almacen: { rol: "CAPTURISTA", areas: "ALMACEN" },
  finanzas: { rol: "CAPTURISTA", areas: "FINANZAS" },
  ventas: { rol: "CAPTURISTA", areas: "VENTAS" },
  ventasAprobador: { rol: "CAPTURISTA", areas: "VENTAS,APROBADOR" },
  cobranza: { rol: "CAPTURISTA", areas: "COBRANZA" },
  gobierno: { rol: "CAPTURISTA", areas: "GOBIERNO" },
  consulta: { rol: "CONSULTA", areas: null },
} as const;
type Usuario = keyof typeof USUARIOS;

function como(usuario: Usuario, emp: { id: string } = empresa) {
  const u = USUARIOS[usuario];
  sesion.ctx = {
    sesionId: "s",
    usuario: { id: `u-${usuario}`, nombre: usuario },
    empresa: emp,
    rol: u.rol,
    membresias: [{ id: `m-${usuario}`, empresaId: emp.id, areas: u.areas, rol: u.rol }],
  };
}

function datos(campos: Record<string, string | string[] | undefined>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) {
    if (v === undefined) continue;
    for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  }
  return fd;
}

async function idRedirigido(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
  } catch (e) {
    if (e instanceof Redireccion) return e.url.split("/").pop()!.split("?")[0];
    throw e;
  }
  throw new Error("Se esperaba una redirección");
}

let almacenId: string;
let proveedorId: string;
let articuloId: string;

beforeAll(async () => {
  m = {
    db: (await import("@/lib/db")).db,
    compras: await import("@/app/(app)/compras/acciones"),
    almacen: await import("@/app/(app)/almacen/acciones"),
    ventas: await import("@/app/(app)/ventas/acciones"),
    cobranza: await import("@/app/(app)/cobranza/acciones"),
    finanzas: await import("@/app/(app)/finanzas/acciones"),
    gobierno: await import("@/app/(app)/gobierno/acciones"),
    consultas: await import("@/lib/erp/servidor/consultas"),
    tablero: await import("@/lib/erp/servidor/tablero"),
  };
  empresa = await m.db.empresa.create({ data: { rfc: "ERP010101AA1", razonSocial: "LIMPIEZA SA", correoElectronico: "a@a.mx" } });
  otraEmpresa = await m.db.empresa.create({ data: { rfc: "OTR010101AA1", razonSocial: "OTRA SA", correoElectronico: "b@b.mx" } });
});

afterAll(async () => {
  await m?.db.$disconnect();
  (globalThis as { prisma?: unknown }).prisma = undefined;
  rmSync(dirTemporal, { recursive: true, force: true });
});

describe("datos maestros", () => {
  it("da de alta almacén, proveedor y artículo con validación y permisos por área", async () => {
    como("ventas");
    expect((await m.almacen.guardarAlmacen(ESTADO, datos({ clave: "CEDIS", nombre: "Centro" }))).mensaje).toMatch(/Almacén/);

    como("admin");
    expect(await m.almacen.guardarAlmacen(ESTADO, datos({ clave: "cedis", nombre: "Centro de distribución" }))).toMatchObject({ ok: true });
    almacenId = (await m.db.almacen.findFirstOrThrow({ where: { empresaId: empresa.id, clave: "CEDIS" } })).id;
    expect((await m.almacen.guardarAlmacen(ESTADO, datos({ clave: "CEDIS", nombre: "Duplicado" }))).errores?.clave).toBeDefined();

    como("compras");
    const invalido = await m.compras.guardarProveedor(null, ESTADO, datos({ clave: "QUIM", razonSocial: "", diasCredito: "30", criticidad: "NORMAL" }));
    expect(invalido.errores?.razonSocial).toBeDefined();
    proveedorId = await idRedirigido(
      m.compras.guardarProveedor(null, ESTADO, datos({ clave: "QUIM", razonSocial: "QUIMICOS DEL NORTE", rfc: "QNO010101AB1", diasCredito: "30", criticidad: "CRITICO" })),
    );

    como("almacen");
    articuloId = await idRedirigido(
      m.almacen.guardarArticulo(
        null,
        ESTADO,
        datos({
          sku: "CLORO-5L",
          nombre: "Cloro 5 L",
          unidad: "pza",
          precioVenta: "150",
          tasaIva: "16",
          stockMinimo: "20",
          stockMaximo: "200",
          demandaAnual: "1200",
          desviacionDemandaDiaria: "1",
          costoOrdenar: "500",
          costoMantener: "25",
          tiempoEntregaDias: "7",
          proveedorPreferenteId: proveedorId,
        }),
      ),
    );
    const a = await m.db.articulo.findUniqueOrThrow({ where: { id: articuloId } });
    expect(a).toMatchObject({ sku: "CLORO-5L", unidad: "PZA", precioVenta: 15000, tasaIvaBp: 1600, costoOrdenar: 50000, costoMantenerBp: 2500 });
  });
});

let ocChica: string;
let ocGrande: string;

describe("procure-to-pay", () => {
  it("aprueba automáticamente la OC dentro de política", async () => {
    como("compras");
    ocChica = await idRedirigido(m.compras.crearOrdenCompra(ESTADO, datos({ proveedorId, almacenId, fechaEntrega: "2099-01-01" })));
    expect((await m.compras.enviarOC(ocChica)).mensaje).toMatch(/partida/);
    const sinCosto = await m.compras.agregarPartidaOC(ocChica, ESTADO, datos({ articuloId, cantidad: "10" }));
    expect(sinCosto.errores?.costoUnitario).toBeDefined();
    expect(await m.compras.agregarPartidaOC(ocChica, ESTADO, datos({ articuloId, cantidad: "10", costoUnitario: "100" }))).toMatchObject({ ok: true });
    const oc = await m.db.ordenCompra.findUniqueOrThrow({ where: { id: ocChica } });
    expect(oc).toMatchObject({ subtotal: 100000, iva: 16000, total: 116000 });
    const r = await m.compras.enviarOC(ocChica);
    expect(r.mensaje).toMatch(/automáticamente/);
    expect(await m.db.ordenCompra.findUniqueOrThrow({ where: { id: ocChica } })).toMatchObject({ estado: "APROBADA", nivelAprobacion: 0, aprobadoPorId: null });
  });

  it("exige dirección para montos altos y separa elaborar de aprobar", async () => {
    como("compras");
    ocGrande = await idRedirigido(m.compras.crearOrdenCompra(ESTADO, datos({ proveedorId, almacenId })));
    await m.compras.agregarPartidaOC(ocGrande, ESTADO, datos({ articuloId, cantidad: "100", costoUnitario: "1000" }));
    expect((await m.compras.enviarOC(ocGrande)).mensaje).toMatch(/nivel 2/);

    expect((await m.compras.aprobarOC(ocGrande)).ok).toBe(false);
    como("aprobador");
    expect((await m.compras.aprobarOC(ocGrande)).mensaje).toMatch(/dirección/);

    // El administrador no puede aprobar una OC que él mismo elaboró.
    como("admin");
    const propia = await idRedirigido(m.compras.crearOrdenCompra(ESTADO, datos({ proveedorId, almacenId })));
    await m.compras.agregarPartidaOC(propia, ESTADO, datos({ articuloId, cantidad: "100", costoUnitario: "1000" }));
    await m.compras.enviarOC(propia);
    expect((await m.compras.aprobarOC(propia)).mensaje).toMatch(/Segregación/);
    expect(await m.compras.cancelarOC(propia)).toMatchObject({ ok: true });

    expect(await m.compras.aprobarOC(ocGrande)).toMatchObject({ ok: true, mensaje: "OC aprobada." });
    expect(await m.db.ordenCompra.findUniqueOrThrow({ where: { id: ocGrande } })).toMatchObject({ estado: "APROBADA", aprobadoPorId: "u-admin" });
  });

  it("un usuario de otra empresa no ve ni aprueba la OC", async () => {
    como("admin", otraEmpresa);
    expect((await m.compras.aprobarOC(ocGrande)).ok).toBe(false);
    expect((await m.compras.registrarRecepcion(ocChica, ESTADO, datos({ fecha: HOY }))).ok).toBe(false);
  });

  it("recibe con conciliación a tres vías y costo promedio ponderado", async () => {
    // Quien aprobó (admin) no puede recibir.
    como("admin");
    const partidaGrande = (await m.db.partidaOrdenCompra.findFirstOrThrow({ where: { ordenCompraId: ocGrande } })).id;
    expect((await m.compras.registrarRecepcion(ocGrande, ESTADO, datos({ fecha: HOY, [`recibida_${partidaGrande}`]: "10" }))).mensaje).toMatch(/Segregación/);

    como("almacen");
    const partidaChica = (await m.db.partidaOrdenCompra.findFirstOrThrow({ where: { ordenCompraId: ocChica } })).id;
    const exceso = await m.compras.registrarRecepcion(ocChica, ESTADO, datos({ fecha: HOY, [`recibida_${partidaChica}`]: "11" }));
    expect(exceso.mensaje).toMatch(/más de lo ordenado/);
    const sinMotivo = await m.compras.registrarRecepcion(ocChica, ESTADO, datos({ fecha: HOY, [`rechazada_${partidaChica}`]: "1" }));
    expect(sinMotivo.errores).toHaveProperty("motivo_CLORO-5L");

    const ok = await m.compras.registrarRecepcion(
      ocChica,
      ESTADO,
      datos({ fecha: HOY, folioFactura: "F-001", importeFactura: "1160", [`recibida_${partidaChica}`]: "10" }),
    );
    expect(ok.mensaje).toMatch(/Conciliación a tres vías correcta/);
    expect(await m.db.ordenCompra.findUniqueOrThrow({ where: { id: ocChica } })).toMatchObject({ estado: "RECIBIDA" });
    const cxp = await m.db.cuentaPorPagar.findFirstOrThrow({ where: { folio: "F-001" } });
    expect(cxp).toMatchObject({ estado: "PENDIENTE", total: 116000, saldo: 116000 });

    // OC grande: recepción parcial con factura 10 % arriba → CxP bloqueada.
    const bloqueada = await m.compras.registrarRecepcion(
      ocGrande,
      ESTADO,
      datos({ fecha: HOY, folioFactura: "F-002", importeFactura: "63800", [`recibida_${partidaGrande}`]: "50" }),
    );
    expect(bloqueada.mensaje).toMatch(/BLOQUEADA/);
    expect(await m.db.ordenCompra.findUniqueOrThrow({ where: { id: ocGrande } })).toMatchObject({ estado: "RECIBIDA_PARCIAL" });

    const existencia = await m.db.existencia.findUniqueOrThrow({ where: { articuloId_almacenId: { articuloId, almacenId } } });
    // (10 × $100 + 50 × $1,000) / 60 = $850
    expect(existencia).toMatchObject({ cantidad: 60, costoPromedio: 85000 });
    const kardex = await m.db.movimientoInventario.findMany({ where: { articuloId }, orderBy: { creadoEn: "asc" } });
    expect(kardex.map((k) => [k.tipo, k.cantidad, k.saldoCantidad])).toEqual([
      ["ENTRADA_COMPRA", 10, 10],
      ["ENTRADA_COMPRA", 50, 60],
    ]);
  });

  it("paga con controles: área, bloqueo, segregación y tesorería", async () => {
    const cxp1 = await m.db.cuentaPorPagar.findFirstOrThrow({ where: { folio: "F-001" } });
    const cxp2 = await m.db.cuentaPorPagar.findFirstOrThrow({ where: { folio: "F-002" } });
    const pago = (monto: string) => datos({ fecha: HOY, monto, metodo: "TRANSFERENCIA" });

    como("almacen");
    expect((await m.finanzas.pagarCxP(cxp1.id, ESTADO, pago("1160"))).mensaje).toMatch(/Finanzas/);

    como("finanzas");
    expect((await m.finanzas.pagarCxP(cxp2.id, ESTADO, pago("100"))).mensaje).toMatch(/bloqueada/);
    expect((await m.finanzas.pagarCxP(cxp1.id, ESTADO, pago("2000"))).errores?.monto).toBeDefined();
    expect(await m.finanzas.pagarCxP(cxp1.id, ESTADO, pago("1160"))).toMatchObject({ ok: true });
    expect(await m.db.cuentaPorPagar.findUniqueOrThrow({ where: { id: cxp1.id } })).toMatchObject({ estado: "PAGADA", saldo: 0 });
    expect(await m.db.movimientoTesoreria.findFirstOrThrow({ where: { empresaId: empresa.id, tipo: "EGRESO" } })).toMatchObject({ monto: 116000, categoria: "PAGO_PROVEEDOR" });

    // Factura corregida: sigue fuera de tolerancia → el aprobador libera con justificación.
    expect((await m.compras.registrarFacturaCxP(cxp2.id, ESTADO, datos({ folioFactura: "F-002B", importeFactura: "60000" }))).ok).toBe(false);
    como("aprobador");
    expect((await m.finanzas.liberarCxP(cxp2.id, ESTADO, datos({ motivo: "corto" }))).ok).toBe(false);
    expect(await m.finanzas.liberarCxP(cxp2.id, ESTADO, datos({ motivo: "Incremento de precio pactado por correo" }))).toMatchObject({ ok: true });
    expect(await m.db.cuentaPorPagar.findUniqueOrThrow({ where: { id: cxp2.id } })).toMatchObject({ estado: "PENDIENTE", liberadaPorId: "u-aprobador" });
    expect(await m.db.bitacora.count({ where: { accion: "LIBERAR_EXCEPCION" } })).toBe(1);

    // Quien recibió no puede pagar (aunque tenga el área de finanzas).
    sesion.ctx = { ...(sesion.ctx as object), usuario: { id: "u-almacen", nombre: "almacen" }, membresias: [{ empresaId: empresa.id, areas: "ALMACEN,FINANZAS" }] };
    expect((await m.finanzas.pagarCxP(cxp2.id, ESTADO, pago("100"))).mensaje).toMatch(/Segregación/);
  });

  it("evalúa al proveedor con su historial", async () => {
    const e = (await m.consultas.evaluarProveedores(empresa.id)).get(proveedorId)!;
    expect(e.calidad).toBe(1);
    expect(e.puntualidad).toBe(1);
    expect(e.facturacion).toBe(0.5);
  });
});

let clienteId: string;

describe("order-to-cash", () => {
  it("solo un aprobador otorga línea de crédito", async () => {
    como("ventas");
    const r = await m.ventas.guardarCliente(null, ESTADO, datos({ clave: "HOTEL", razonSocial: "HOTEL CENTRO", diasCredito: "30", limiteCredito: "5000" }));
    expect(r.errores?.limiteCredito).toBeDefined();
    como("ventasAprobador");
    clienteId = await idRedirigido(m.ventas.guardarCliente(null, ESTADO, datos({ clave: "HOTEL", razonSocial: "HOTEL CENTRO", diasCredito: "30", limiteCredito: "5000" })));
    expect(await m.db.cliente.findUniqueOrThrow({ where: { id: clienteId } })).toMatchObject({ limiteCredito: 500000 });
  });

  it("aprueba crédito, surte al costo promedio y crea la CxC", async () => {
    como("ventas");
    const pedido = await idRedirigido(m.ventas.crearPedido(ESTADO, datos({ clienteId, almacenId, condicionPago: "CREDITO" })));
    expect((await m.ventas.agregarPartidaPedido(pedido, ESTADO, datos({ articuloId, cantidad: "5", descuento: "20" }))).errores?.descuento).toBeDefined();
    expect(await m.ventas.agregarPartidaPedido(pedido, ESTADO, datos({ articuloId, cantidad: "5" }))).toMatchObject({ ok: true });
    // 5 × $150 = $750 + IVA = $870
    const r = await m.ventas.confirmarPedido(pedido);
    expect(r.mensaje).toMatch(/aprobado \(puntaje 90\)/);

    expect((await m.ventas.entregarPedido(pedido)).ok).toBe(false); // ventas no surte
    como("almacen");
    expect(await m.ventas.entregarPedido(pedido)).toMatchObject({ ok: true });
    const p = await m.db.pedidoVenta.findUniqueOrThrow({ where: { id: pedido }, include: { cuentaPorCobrar: true } });
    expect(p).toMatchObject({ estado: "ENTREGADO", total: 87000, costoVenta: 425000 });
    expect(p.cuentaPorCobrar).toMatchObject({ total: 87000, saldo: 87000, estado: "PENDIENTE" });
    const dias = Math.round((p.cuentaPorCobrar!.fechaVencimiento.getTime() - p.cuentaPorCobrar!.fechaEmision.getTime()) / 86_400_000);
    expect(dias).toBe(30);
    expect((await m.db.existencia.findUniqueOrThrow({ where: { articuloId_almacenId: { articuloId, almacenId } } })).cantidad).toBe(55);
  });

  it("escala a autorización la excepción de crédito con segregación", async () => {
    como("ventasAprobador");
    const pedido = await idRedirigido(m.ventas.crearPedido(ESTADO, datos({ clienteId, almacenId, condicionPago: "CREDITO" })));
    await m.ventas.agregarPartidaPedido(pedido, ESTADO, datos({ articuloId, cantidad: "30" }));
    // Saldo $870 + $5,220 > límite $5,000 → revisar
    expect((await m.ventas.confirmarPedido(pedido)).mensaje).toMatch(/requiere autorización/);
    expect((await m.db.pedidoVenta.findUniqueOrThrow({ where: { id: pedido } })).estado).toBe("POR_AUTORIZAR");
    expect((await m.ventas.autorizarCredito(pedido)).mensaje).toMatch(/Segregación/);
    como("ventas");
    expect((await m.ventas.autorizarCredito(pedido)).ok).toBe(false);
    como("aprobador");
    expect(await m.ventas.autorizarCredito(pedido)).toMatchObject({ ok: true });

    // No hay existencia suficiente para 100 piezas: la entrega falla sin dejar cambios.
    como("ventas");
    const grande = await idRedirigido(m.ventas.crearPedido(ESTADO, datos({ clienteId, almacenId, condicionPago: "CONTADO" })));
    await m.ventas.agregarPartidaPedido(grande, ESTADO, datos({ articuloId, cantidad: "100" }));
    await m.ventas.confirmarPedido(grande);
    como("almacen");
    expect((await m.ventas.entregarPedido(grande)).mensaje).toMatch(/Existencia insuficiente/);
    expect((await m.db.pedidoVenta.findUniqueOrThrow({ where: { id: grande } })).estado).toBe("CONFIRMADO");
    expect((await m.db.existencia.findUniqueOrThrow({ where: { articuloId_almacenId: { articuloId, almacenId } } })).cantidad).toBe(55);
  });

  it("cobra, gestiona y suspende el crédito", async () => {
    const cxc = await m.db.cuentaPorCobrar.findFirstOrThrow({ where: { clienteId } });
    como("cobranza");
    expect((await m.cobranza.registrarCobro(cxc.id, ESTADO, datos({ fecha: HOY, monto: "1000", metodo: "TRANSFERENCIA" }))).errores?.monto).toBeDefined();
    expect(await m.cobranza.registrarCobro(cxc.id, ESTADO, datos({ fecha: HOY, monto: "370", metodo: "TRANSFERENCIA" }))).toMatchObject({ ok: true });
    expect(await m.db.cuentaPorCobrar.findUniqueOrThrow({ where: { id: cxc.id } })).toMatchObject({ estado: "PARCIAL", saldo: 50000 });
    expect((await m.cobranza.registrarGestion(cxc.id, ESTADO, datos({ tipo: "PROMESA_PAGO", nota: "Paga el viernes" }))).errores?.fechaPromesa).toBeDefined();
    expect(await m.cobranza.registrarGestion(cxc.id, ESTADO, datos({ tipo: "SUSPENSION", nota: "Atraso reiterado" }))).toMatchObject({ ok: true });
    expect((await m.db.cliente.findUniqueOrThrow({ where: { id: clienteId } })).estado).toBe("SUSPENDIDO");

    como("ventas");
    const pedido = await idRedirigido(m.ventas.crearPedido(ESTADO, datos({ clienteId, almacenId, condicionPago: "CREDITO" })));
    await m.ventas.agregarPartidaPedido(pedido, ESTADO, datos({ articuloId, cantidad: "1" }));
    expect((await m.ventas.confirmarPedido(pedido)).mensaje).toMatch(/rechazado/);
    expect((await m.db.pedidoVenta.findUniqueOrThrow({ where: { id: pedido } })).estado).toBe("BORRADOR");

    como("cobranza");
    expect(await m.cobranza.registrarCobro(cxc.id, ESTADO, datos({ fecha: HOY, monto: "500", metodo: "EFECTIVO" }))).toMatchObject({ ok: true });
    expect((await m.db.cuentaPorCobrar.findUniqueOrThrow({ where: { id: cxc.id } })).estado).toBe("PAGADA");
    const ingresos = await m.db.movimientoTesoreria.aggregate({ where: { empresaId: empresa.id, tipo: "INGRESO" }, _sum: { monto: true } });
    expect(ingresos._sum.monto).toBe(87000);
  });
});

describe("inventario y reabastecimiento", () => {
  it("ajusta inventario con motivo y genera OC sugeridas por proveedor preferente", async () => {
    como("almacen");
    const sinMotivo = await m.almacen.registrarAjuste(ESTADO, datos({ articuloId, almacenId, tipo: "AJUSTE_SALIDA", cantidad: "1", motivo: "" }));
    expect(sinMotivo.errores?.motivo).toBeDefined();
    expect((await m.almacen.registrarAjuste(ESTADO, datos({ articuloId, almacenId, tipo: "AJUSTE_SALIDA", cantidad: "500", motivo: "Merma" }))).mensaje).toMatch(/insuficiente/);
    expect(await m.almacen.registrarAjuste(ESTADO, datos({ articuloId, almacenId, tipo: "AJUSTE_SALIDA", cantidad: "50", motivo: "Merma por derrame" }))).toMatchObject({ ok: true });

    const [a] = await m.consultas.analizarInventario(empresa.id, 165);
    expect(a.existencia).toBe(5);
    expect(a.enTransito).toBe(50); // OC grande pendiente de recibir
    // ROP = 1200/365 × 7 + 1.65 × 1 × √7 ≈ 27.38; posición 55 > ROP → no sugiere
    expect(a.politica.puntoReorden).toBeCloseTo(27.38, 1);
    expect(a.sugerida).toBe(0);

    // Se cancela lo pendiente de la OC grande... no se puede (ya tiene recepciones); el stock mínimo sube.
    como("compras");
    expect((await m.compras.cancelarOC(ocGrande)).ok).toBe(false);
    await m.db.articulo.update({ where: { id: articuloId }, data: { stockMinimo: 80 } });
    const [b] = await m.consultas.analizarInventario(empresa.id, 165);
    expect(b.sugerida).toBeGreaterThan(0);
    const r = await m.compras.generarOCSugeridas(ESTADO, datos({ almacenId }));
    expect(r.mensaje).toMatch(/Se generaron 1 OC/);
    const sugerida = await m.db.ordenCompra.findFirstOrThrow({ where: { empresaId: empresa.id, notas: { contains: "reabastecimiento" } }, include: { partidas: true } });
    expect(sugerida.estado).toBe("BORRADOR");
    expect(sugerida.partidas[0].cantidad).toBe(b.sugerida);
  });
});

describe("gobierno: COBIT, ISO 27001 e ITIL", () => {
  it("carga y evalúa controles; políticas solo por administrador", async () => {
    como("compras");
    expect((await m.gobierno.sembrarControles()).ok).toBe(false);
    como("gobierno");
    const r = await m.gobierno.sembrarControles();
    expect(r.mensaje).toMatch(/Se agregaron \d+ controles/);
    expect((await m.gobierno.sembrarControles()).mensaje).toMatch(/ya estaban/);
    const c = await m.db.controlGobierno.findFirstOrThrow({ where: { empresaId: empresa.id, marco: "ISO27001", clave: "A.5.3" } });
    expect((await m.gobierno.evaluarControl(c.id, ESTADO, datos({ nivelActual: "0", nivelObjetivo: "4" }))).errores?.justificacion).toBeDefined();
    expect(await m.gobierno.evaluarControl(c.id, ESTADO, datos({ aplicable: "on", nivelActual: "4", nivelObjetivo: "4", evidencia: "Pruebas de integración" }))).toMatchObject({ ok: true });

    const politicas = { montoAutoAprobacion: "1000", montoAprobacionNivel1: "20000", toleranciaPrecio: "2", toleranciaCantidad: "0", diasGraciaCredito: "10", puntajeCreditoMinimo: "70", puntajeCreditoRevision: "40", factorServicioZ: "165", tasaIva: "16" };
    expect((await m.gobierno.guardarPoliticas(ESTADO, datos(politicas))).ok).toBe(false);
    como("admin");
    expect((await m.gobierno.guardarPoliticas(ESTADO, datos({ ...politicas, montoAprobacionNivel1: "500" }))).errores?.montoAprobacionNivel1).toBeDefined();
    expect(await m.gobierno.guardarPoliticas(ESTADO, datos({ ...politicas, segregacionEstricta: "on" }))).toMatchObject({ ok: true });
    expect(await m.db.configuracionErp.findUniqueOrThrow({ where: { empresaId: empresa.id } })).toMatchObject({ montoAutoAprobacion: 100000, puntajeCreditoMinimo: 70, segregacionEstricta: true });
  });

  it("registra riesgos con apetito y tickets ITIL con CAB", async () => {
    como("gobierno");
    const riesgo = { activo: "Base de clientes", amenaza: "Robo de credenciales", vulnerabilidad: "Sin MFA", probabilidad: "4", impacto: "4", estado: "ABIERTO" };
    expect((await m.gobierno.guardarRiesgo(null, ESTADO, datos({ ...riesgo, tratamiento: "ACEPTAR" }))).errores?.tratamiento).toBeDefined();
    expect(await m.gobierno.guardarRiesgo(null, ESTADO, datos({ ...riesgo, tratamiento: "MITIGAR", controles: "A.8.5" }))).toMatchObject({ ok: true, mensaje: "Riesgo R-1 registrado." });

    como("compras");
    expect(await m.gobierno.crearTicket(ESTADO, datos({ tipo: "INCIDENTE", servicio: "COMPRAS", titulo: "No carga OC", descripcion: "Error 500", impacto: "1", urgencia: "1" }))).toMatchObject({ mensaje: expect.stringMatching(/P1/) });
    const t1 = await m.db.ticketServicio.findFirstOrThrow({ where: { empresaId: empresa.id, numero: 1 } });
    expect(t1.venceEn.getTime() - t1.creadoEn.getTime()).toBeLessThanOrEqual(4 * 3_600_000 + 1000);
    expect((await m.gobierno.cambiarEstadoTicket(t1.id, ESTADO, datos({ estado: "RESUELTO" }))).mensaje).toMatch(/solución/);
    expect(await m.gobierno.cambiarEstadoTicket(t1.id, ESTADO, datos({ estado: "RESUELTO", solucion: "Reinicio del servicio" }))).toMatchObject({ ok: true });

    como("aprobador");
    await m.gobierno.crearTicket(ESTADO, datos({ tipo: "CAMBIO", tipoCambio: "NORMAL", servicio: "TI", titulo: "Actualizar Node", descripcion: "22 → 24", impacto: "2", urgencia: "3" }));
    const cambio = await m.db.ticketServicio.findFirstOrThrow({ where: { empresaId: empresa.id, tipo: "CAMBIO" } });
    expect(cambio.estado).toBe("PENDIENTE_APROBACION");
    expect((await m.gobierno.cambiarEstadoTicket(cambio.id, ESTADO, datos({ estado: "APROBADO" }))).mensaje).toMatch(/Segregación/);
    como("compras");
    expect((await m.gobierno.cambiarEstadoTicket(cambio.id, ESTADO, datos({ estado: "APROBADO" }))).mensaje).toMatch(/CAB/);
    como("admin");
    expect(await m.gobierno.cambiarEstadoTicket(cambio.id, ESTADO, datos({ estado: "APROBADO" }))).toMatchObject({ ok: true });
    expect((await m.gobierno.cambiarEstadoTicket(cambio.id, ESTADO, datos({ estado: "CERRADO" }))).mensaje).toMatch(/no permitida/);
  });

  it("solo lectura para CONSULTA y tablero ejecutivo consolidado", async () => {
    como("consulta");
    expect((await m.compras.crearOrdenCompra(ESTADO, datos({ proveedorId, almacenId }))).mensaje).toMatch(/solo consulta/);
    expect((await m.gobierno.crearTicket(ESTADO, datos({}))).mensaje).toMatch(/solo consulta/);

    const t = await m.tablero.cargarTableroEjecutivo(empresa.id, 165);
    expect(t.ventasNetas).toBe(75000);
    expect(t.costoVentas).toBe(425000);
    expect(t.alertas.cxpBloqueadas).toBe(0);
    expect(t.alertas.riesgosSobreApetito).toBe(1);
    expect(t.compras).toMatchObject({ recepciones: 2, calidad: 1, conciliacionOk: 0.5 });
    expect(t.servicio.cumplimientoSla).toBe(1);
    expect(t.gobierno.controlesCargados).toBeGreaterThan(20);
    expect(t.efectivo).toBe(87000 - 116000);
  });
});
