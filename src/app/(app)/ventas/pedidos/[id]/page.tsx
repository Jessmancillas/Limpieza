import Link from "next/link";
import { notFound } from "next/navigation";

import { FormaAccion } from "@/components/erp/forma-accion";
import { InsigniaEstado } from "@/components/erp/indicadores";
import { Aviso, Campo, Datos, EncabezadoPagina, Entrada, Insignia, Selector, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { ETIQUETA_ESTADO_PEDIDO } from "@/lib/erp/constantes";
import type { DecisionCredito } from "@/lib/erp/decisiones/credito";
import { formatoNumero, formatoPct, formatoPesos, importePartida } from "@/lib/erp/dinero";
import { puedeOperar, verificarSegregacion } from "@/lib/erp/permisos";
import { TONO_DECISION, TONO_PEDIDO } from "@/lib/erp/presentacion";
import { obtenerContextoErp } from "@/lib/erp/servidor/contexto";
import { formatoFecha } from "@/lib/formularios";

import {
  agregarPartidaPedido,
  autorizarCredito,
  cambiarCondicionPedido,
  cancelarPedido,
  confirmarPedido,
  entregarPedido,
  quitarPartidaPedido,
  regresarPedidoABorrador,
} from "../../acciones";

function leerDecision(texto: string | null): DecisionCredito | null {
  if (!texto) return null;
  try {
    return JSON.parse(texto) as DecisionCredito;
  } catch {
    return null;
  }
}

export default async function DetallePedido({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, ctx] = await Promise.all([params, obtenerContextoErp()]);
  const pedido = await db.pedidoVenta.findFirst({
    where: { id, empresaId: ctx.empresa.id },
    include: { cliente: true, almacen: true, partidas: { include: { articulo: true }, orderBy: { id: "asc" } }, cuentaPorCobrar: true },
  });
  if (!pedido) notFound();
  const [articulos, existencias] = await Promise.all([
    pedido.estado === "BORRADOR"
      ? db.articulo.findMany({ where: { empresaId: ctx.empresa.id, activo: true }, orderBy: { sku: "asc" }, select: { id: true, sku: true, nombre: true, precioVenta: true } })
      : Promise.resolve([]),
    db.existencia.findMany({ where: { almacenId: pedido.almacenId, articuloId: { in: pedido.partidas.map((p) => p.articuloId) } } }),
  ]);
  const disponible = new Map(existencias.map((e) => [e.articuloId, e.cantidad]));
  const faltantes = pedido.partidas.filter((p) => (disponible.get(p.articuloId) ?? 0) < p.cantidad);
  const decision = leerDecision(pedido.evaluacionCredito);
  const puedeVender = puedeOperar(ctx.rol, ctx.areas, "VENTAS");
  const puedeSurtir = puedeOperar(ctx.rol, ctx.areas, "ALMACEN");
  const puedeAutorizar = puedeOperar(ctx.rol, ctx.areas, "APROBADOR");
  const sodAutorizar = verificarSegregacion("PEDIDO_CAPTURA_AUTORIZA", ctx.usuario.id, pedido.creadoPorId, ctx.config.segregacionEstricta);
  const margen = pedido.estado === "ENTREGADO" && pedido.subtotal > 0 ? (pedido.subtotal - pedido.costoVenta) / pedido.subtotal : null;

  return (
    <>
      <EncabezadoPagina
        titulo={`Pedido #${pedido.numero}`}
        descripcion={`${pedido.cliente.razonSocial} · ${pedido.condicionPago === "CREDITO" ? "crédito" : "contado"} · almacén ${pedido.almacen.clave}`}
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Pedidos", href: "/ventas/pedidos" }, { etiqueta: `#${pedido.numero}` }]}
        acciones={<InsigniaEstado estado={pedido.estado} tonos={TONO_PEDIDO} etiquetas={ETIQUETA_ESTADO_PEDIDO} />}
      />
      <div className="space-y-6">
        <Tarjeta titulo="Resumen">
          <Datos
            filas={[
              ["Cliente", <Link key="c" href={`/ventas/clientes/${pedido.clienteId}`} className="text-primario hover:underline">{pedido.cliente.razonSocial}</Link>],
              ["Condición de pago", pedido.condicionPago === "CREDITO" ? `Crédito (${pedido.cliente.diasCredito} días)` : "Contado"],
              ["Subtotal / IVA / Total", `${formatoPesos(pedido.subtotal)} / ${formatoPesos(pedido.iva)} / ${formatoPesos(pedido.total)}`],
              ["Costo de venta / margen bruto", pedido.estado === "ENTREGADO" ? `${formatoPesos(pedido.costoVenta)} · ${formatoPct(margen)}` : "Se calcula al entregar"],
              ["Entregado", formatoFecha(pedido.entregadoEn)],
              [
                "Cuenta por cobrar",
                pedido.cuentaPorCobrar ? (
                  <Link key="x" href={`/cobranza/${pedido.cuentaPorCobrar.id}`} className="text-primario hover:underline">
                    {pedido.cuentaPorCobrar.folio}
                  </Link>
                ) : (
                  "—"
                ),
              ],
            ]}
          />
        </Tarjeta>

        {decision && (
          <Tarjeta titulo="Decisión de crédito" descripcion="Resultado del modelo al confirmar (queda como evidencia de auditoría).">
            <p className="text-sm">
              Puntaje <strong>{decision.puntaje}</strong> → <Insignia tono={TONO_DECISION[decision.decision]}>{decision.decision}</Insignia>
            </p>
            <ul className="mt-2 list-inside list-disc text-sm text-texto-suave">
              {decision.motivos.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </Tarjeta>
        )}

        <Tarjeta titulo="Partidas">
          {pedido.partidas.length === 0 ? (
            <p className="text-sm text-texto-suave">Sin partidas.</p>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Artículo</Th>
                  <Th className="text-right">Cantidad</Th>
                  <Th className="text-right">Disponible</Th>
                  <Th className="text-right">Precio</Th>
                  <Th className="text-right">Desc.</Th>
                  <Th className="text-right">Importe</Th>
                  {pedido.estado === "BORRADOR" && puedeVender && <Th />}
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {pedido.partidas.map((p) => {
                  const disp = disponible.get(p.articuloId) ?? 0;
                  return (
                    <tr key={p.id}>
                      <Td>
                        <span className="font-mono text-xs">{p.articulo.sku}</span> {p.articulo.nombre}
                      </Td>
                      <Td className="text-right tabular-nums">{formatoNumero(p.cantidad)}</Td>
                      <Td className={`text-right tabular-nums ${pedido.estado !== "ENTREGADO" && disp < p.cantidad ? "text-peligro" : ""}`}>{formatoNumero(disp)}</Td>
                      <Td className="text-right tabular-nums">{formatoPesos(p.precioUnitario)}</Td>
                      <Td className="text-right tabular-nums">{p.descuentoBp ? `${p.descuentoBp / 100} %` : "—"}</Td>
                      <Td className="text-right tabular-nums">{formatoPesos(importePartida(p.cantidad, p.precioUnitario, p.descuentoBp))}</Td>
                      {pedido.estado === "BORRADOR" && puedeVender && (
                        <Td className="text-right">
                          <FormaAccion accion={quitarPartidaPedido.bind(null, pedido.id, p.id)} textoBoton="Quitar" variante="fantasma" tamano="sm" />
                        </Td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </Tabla>
          )}
          {pedido.estado === "BORRADOR" && puedeVender && articulos.length > 0 && (
            <div className="mt-4 border-t border-borde pt-4">
              <FormaAccion accion={agregarPartidaPedido.bind(null, pedido.id)} textoBoton="Agregar partida" reiniciar>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
                  <Campo etiqueta="Artículo" htmlFor="articuloId" requerido>
                    <Selector id="articuloId" name="articuloId" required defaultValue="">
                      <option value="" disabled>
                        Elige…
                      </option>
                      {articulos.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.sku} · {a.nombre} ({formatoPesos(a.precioVenta)})
                        </option>
                      ))}
                    </Selector>
                  </Campo>
                  <Campo etiqueta="Cantidad" htmlFor="cantidad" requerido>
                    <Entrada id="cantidad" name="cantidad" inputMode="decimal" required />
                  </Campo>
                  <Campo etiqueta="Precio (sin IVA)" htmlFor="precioUnitario" ayuda="Vacío = lista">
                    <Entrada id="precioUnitario" name="precioUnitario" inputMode="decimal" />
                  </Campo>
                  <Campo etiqueta="Descuento %" htmlFor="descuento" ayuda="> 15 % requiere aprobador">
                    <Entrada id="descuento" name="descuento" inputMode="decimal" />
                  </Campo>
                </div>
              </FormaAccion>
            </div>
          )}
        </Tarjeta>

        {pedido.estado === "BORRADOR" && puedeVender && (
          <Tarjeta titulo="Confirmar" descripcion={pedido.condicionPago === "CREDITO" ? "A crédito se ejecuta el modelo de decisión de crédito." : "Pedido de contado."}>
            <div className="flex flex-wrap gap-2">
              <FormaAccion accion={confirmarPedido.bind(null, pedido.id)} textoBoton="Confirmar pedido" />
              <FormaAccion accion={cambiarCondicionPedido.bind(null, pedido.id)} textoBoton={pedido.condicionPago === "CREDITO" ? "Cambiar a contado" : "Cambiar a crédito"} variante="secundario" />
              <FormaAccion accion={cancelarPedido.bind(null, pedido.id)} textoBoton="Cancelar" variante="peligro" confirmar="¿Cancelar el pedido?" />
            </div>
          </Tarjeta>
        )}

        {pedido.estado === "POR_AUTORIZAR" && (
          <Tarjeta titulo="Autorización de crédito" descripcion="Excepción a la política de crédito (requiere el área Aprobador).">
            {!puedeAutorizar ? (
              <Aviso tono="info">Espera a que un aprobador autorice la excepción.</Aviso>
            ) : !sodAutorizar.permitido ? (
              <Aviso tono="info">{sodAutorizar.mensaje}</Aviso>
            ) : (
              <FormaAccion accion={autorizarCredito.bind(null, pedido.id)} textoBoton="Autorizar excepción de crédito" />
            )}
            {puedeVender && (
              <div className="mt-3">
                <FormaAccion accion={regresarPedidoABorrador.bind(null, pedido.id)} textoBoton="Regresar a borrador" variante="secundario" tamano="sm" />
              </div>
            )}
          </Tarjeta>
        )}

        {pedido.estado === "CONFIRMADO" && (
          <Tarjeta titulo="Surtido y entrega" descripcion="Genera la salida de inventario al costo promedio y la cuenta por cobrar.">
            {faltantes.length > 0 && (
              <div className="mb-3">
                <Aviso tono="aviso">Existencia insuficiente en {pedido.almacen.clave} para: {faltantes.map((f) => f.articulo.sku).join(", ")}.</Aviso>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {puedeSurtir && <FormaAccion accion={entregarPedido.bind(null, pedido.id)} textoBoton="Registrar entrega" />}
              {puedeVender && <FormaAccion accion={regresarPedidoABorrador.bind(null, pedido.id)} textoBoton="Regresar a borrador" variante="secundario" />}
              {puedeVender && <FormaAccion accion={cancelarPedido.bind(null, pedido.id)} textoBoton="Cancelar" variante="peligro" confirmar="¿Cancelar el pedido?" />}
            </div>
          </Tarjeta>
        )}
      </div>
    </>
  );
}
