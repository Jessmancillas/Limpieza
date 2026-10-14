import { notFound } from "next/navigation";

import { FormaAccion } from "@/components/erp/forma-accion";
import { Kpi, RejillaKpi } from "@/components/erp/indicadores";
import { EncabezadoPagina, Insignia, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { ETIQUETA_MOVIMIENTO, type TipoMovimiento } from "@/lib/erp/constantes";
import { POLITICA_ABC } from "@/lib/erp/decisiones/inventario";
import { formatoNumero, formatoPesos } from "@/lib/erp/dinero";
import { puedeOperar } from "@/lib/erp/permisos";
import { TONO_CLASE } from "@/lib/erp/presentacion";
import { analizarInventario } from "@/lib/erp/servidor/consultas";
import { obtenerContextoErp } from "@/lib/erp/servidor/contexto";
import { formatoFecha } from "@/lib/formularios";

import { cambiarActivoArticulo, guardarArticulo } from "../../acciones";
import { CamposArticulo } from "../campos";

export default async function DetalleArticulo({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, ctx] = await Promise.all([params, obtenerContextoErp()]);
  const articulo = await db.articulo.findFirst({ where: { id, empresaId: ctx.empresa.id }, include: { existencias: { include: { almacen: true } } } });
  if (!articulo) notFound();
  const [analisis, movimientos, proveedores] = await Promise.all([
    analizarInventario(ctx.empresa.id, ctx.config.factorServicioZ),
    db.movimientoInventario.findMany({ where: { articuloId: articulo.id }, include: { almacen: { select: { clave: true } } }, orderBy: { creadoEn: "desc" }, take: 50 }),
    db.proveedor.findMany({ where: { empresaId: ctx.empresa.id }, orderBy: { razonSocial: "asc" }, select: { id: true, clave: true, razonSocial: true } }),
  ]);
  const a = analisis.find((x) => x.id === articulo.id)!;
  const puede = puedeOperar(ctx.rol, ctx.areas, "ALMACEN");

  return (
    <>
      <EncabezadoPagina
        titulo={articulo.nombre}
        descripcion={`SKU ${articulo.sku}${articulo.categoria ? ` · ${articulo.categoria}` : ""}`}
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Inventario", href: "/almacen/articulos" }, { etiqueta: articulo.sku }]}
        acciones={
          <>
            <Insignia tono={TONO_CLASE[a.clase]}>Clase {a.clase}</Insignia>
            {!articulo.activo && <Insignia>Inactivo</Insignia>}
          </>
        }
      />
      <div className="space-y-6">
        <Tarjeta titulo="Política de inventario calculada" descripcion={POLITICA_ABC[a.clase]}>
          <RejillaKpi>
            <Kpi titulo="Existencia" valor={`${formatoNumero(a.existencia)} ${articulo.unidad}`} detalle={`En tránsito: ${formatoNumero(a.enTransito)}`} />
            <Kpi titulo="Punto de reorden" valor={formatoNumero(Math.ceil(a.politica.puntoReorden))} detalle={`Stock de seguridad: ${formatoNumero(Math.ceil(a.politica.stockSeguridad))}`} />
            <Kpi titulo="Lote económico (EOQ)" valor={a.politica.eoq ? formatoNumero(Math.ceil(a.politica.eoq)) : "—"} detalle={`Demanda anual: ${formatoNumero(a.demandaAnual)}${a.demandaEstimada ? " (estimada)" : ""}`} />
            <Kpi titulo="Sugerido comprar" valor={formatoNumero(a.sugerida)} detalle={`Costo promedio ${formatoPesos(a.costoUnitario)}`} semaforo={a.sugerida > 0 ? "amarillo" : "verde"} />
          </RejillaKpi>
        </Tarjeta>

        <Tarjeta titulo="Existencias por almacén">
          {articulo.existencias.length === 0 ? (
            <p className="text-sm text-texto-suave">Sin existencias. Registra una recepción o un inventario inicial en Kárdex y ajustes.</p>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Almacén</Th>
                  <Th className="text-right">Cantidad</Th>
                  <Th className="text-right">Costo promedio</Th>
                  <Th className="text-right">Valor</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {articulo.existencias.map((e) => (
                  <tr key={e.id}>
                    <Td>
                      {e.almacen.clave} · {e.almacen.nombre}
                    </Td>
                    <Td className="text-right tabular-nums">{formatoNumero(e.cantidad)}</Td>
                    <Td className="text-right tabular-nums">{formatoPesos(e.costoPromedio)}</Td>
                    <Td className="text-right tabular-nums">{formatoPesos(Math.round(e.cantidad * e.costoPromedio))}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Tarjeta>

        <Tarjeta titulo="Kárdex (últimos 50 movimientos)">
          {movimientos.length === 0 ? (
            <p className="text-sm text-texto-suave">Sin movimientos.</p>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Almacén</Th>
                  <Th>Tipo</Th>
                  <Th className="text-right">Cantidad</Th>
                  <Th className="text-right">Costo</Th>
                  <Th className="text-right">Saldo</Th>
                  <Th className="text-right">Costo prom.</Th>
                  <Th>Motivo</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {movimientos.map((m) => (
                  <tr key={m.id}>
                    <Td>{formatoFecha(m.creadoEn)}</Td>
                    <Td className="font-mono text-xs">{m.almacen.clave}</Td>
                    <Td>{ETIQUETA_MOVIMIENTO[m.tipo as TipoMovimiento] ?? m.tipo}</Td>
                    <Td className={`text-right tabular-nums ${m.cantidad < 0 ? "text-peligro" : "text-exito"}`}>{formatoNumero(m.cantidad)}</Td>
                    <Td className="text-right tabular-nums">{formatoPesos(m.costoUnitario)}</Td>
                    <Td className="text-right tabular-nums">{formatoNumero(m.saldoCantidad)}</Td>
                    <Td className="text-right tabular-nums">{formatoPesos(m.saldoCostoPromedio)}</Td>
                    <Td className="text-xs">{m.motivo ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Tarjeta>

        {puede && (
          <Tarjeta titulo="Datos del artículo" acciones={<FormaAccion accion={cambiarActivoArticulo.bind(null, articulo.id)} textoBoton={articulo.activo ? "Desactivar" : "Reactivar"} variante="secundario" tamano="sm" />}>
            <FormaAccion accion={guardarArticulo.bind(null, articulo.id)}>
              <CamposArticulo v={articulo} proveedores={proveedores} />
            </FormaAccion>
          </Tarjeta>
        )}
      </div>
    </>
  );
}
