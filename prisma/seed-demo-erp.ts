/**
 * Datos de demostración del ERP (FICTICIOS): almacén, proveedores, artículos con inventario
 * inicial, clientes y los controles de referencia de COBIT / ISO 27001.
 */
import type { PrismaClient } from "../src/generated/prisma/client";
import { CONTROLES_REFERENCIA } from "../src/lib/erp/marcos";

export async function sembrarDemoErp(db: PrismaClient, empresaId: string, usuarioId: string) {
  await db.configuracionErp.create({ data: { empresaId } });
  const almacen = await db.almacen.create({ data: { empresaId, clave: "CEDIS", nombre: "Centro de distribución", ubicacion: "Tlalnepantla, Edo. Méx." } });

  const [quimicos, empaques] = await Promise.all([
    db.proveedor.create({
      data: { empresaId, clave: "QUIM-NTE", razonSocial: "QUIMICOS DEL NORTE SA DE CV", rfc: "QNO010101AB1", diasCredito: 30, criticidad: "CRITICO", contacto: "Compras QN" },
    }),
    db.proveedor.create({ data: { empresaId, clave: "EMP-SUR", razonSocial: "EMPAQUES DEL SUR SA DE CV", rfc: "ESU020202CD2", diasCredito: 15, criticidad: "NORMAL" } }),
  ]);

  const articulos = [
    { sku: "CLORO-5L", nombre: "Cloro concentrado 5 L", categoria: "Desinfectantes", costo: 4500, precio: 8900, inicial: 120, demanda: 2400, min: 60, max: 400, prov: quimicos.id },
    { sku: "DESENG-1L", nombre: "Desengrasante industrial 1 L", categoria: "Desengrasantes", costo: 3200, precio: 6500, inicial: 25, demanda: 900, min: 40, max: 200, prov: quimicos.id },
    { sku: "JABON-20L", nombre: "Jabón líquido para manos 20 L", categoria: "Higiene", costo: 21000, precio: 39000, inicial: 15, demanda: 180, min: 10, max: 60, prov: quimicos.id },
    { sku: "BOLSA-90", nombre: "Bolsa para basura 90×120 (rollo)", categoria: "Consumibles", costo: 6000, precio: 11000, inicial: 8, demanda: 600, min: 30, max: 150, prov: empaques.id },
  ];
  for (const a of articulos) {
    const art = await db.articulo.create({
      data: {
        empresaId,
        sku: a.sku,
        nombre: a.nombre,
        categoria: a.categoria,
        precioVenta: a.precio,
        ultimoCosto: a.costo,
        stockMinimo: a.min,
        stockMaximo: a.max,
        demandaAnual: a.demanda,
        desviacionDemandaDiaria: Math.round((a.demanda / 365) * 0.3 * 100) / 100,
        tiempoEntregaDias: 7,
        proveedorPreferenteId: a.prov,
      },
    });
    await db.existencia.create({ data: { articuloId: art.id, almacenId: almacen.id, cantidad: a.inicial, costoPromedio: a.costo } });
    await db.movimientoInventario.create({
      data: {
        empresaId,
        articuloId: art.id,
        almacenId: almacen.id,
        tipo: "INVENTARIO_INICIAL",
        cantidad: a.inicial,
        costoUnitario: a.costo,
        saldoCantidad: a.inicial,
        saldoCostoPromedio: a.costo,
        referenciaTipo: "AJUSTE",
        motivo: "Inventario inicial (demostración)",
        creadoPorId: usuarioId,
      },
    });
  }

  await db.cliente.createMany({
    data: [
      { empresaId, clave: "HOTEL-CTR", razonSocial: "HOTEL CENTRO HISTORICO SA DE CV", rfc: "HCH030303EF3", diasCredito: 30, limiteCredito: 5_000_000 },
      { empresaId, clave: "MOSTRADOR", razonSocial: "VENTA DE MOSTRADOR", diasCredito: 0, limiteCredito: 0 },
    ],
  });

  await db.controlGobierno.createMany({
    data: CONTROLES_REFERENCIA.map((c) => ({
      empresaId,
      marco: c.marco,
      clave: c.clave,
      nombre: c.nombre,
      dominio: c.dominio,
      procesoErp: c.procesoErp,
      nivelObjetivo: c.nivelObjetivo,
      nivelActual: 2,
      evidencia: c.soporte,
    })),
  });
  console.log("  ERP de demostración: almacén CEDIS, 2 proveedores, 4 artículos, 2 clientes y controles COBIT/ISO 27001.");
}
