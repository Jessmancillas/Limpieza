import Link from "next/link";
import { notFound } from "next/navigation";

import { FormaAccion } from "@/components/erp/forma-accion";
import { InsigniaEstado } from "@/components/erp/indicadores";
import { Aviso, Campo, Datos, EncabezadoPagina, Entrada, Insignia, Selector, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { ETIQUETA_CONCILIACION, ETIQUETA_ESTADO_OC, type Conciliacion } from "@/lib/erp/constantes";
import { ETIQUETA_NIVEL_APROBACION, nivelAprobacionOC, puedeAprobarOC } from "@/lib/erp/decisiones/compras";
import { aplicarBp, formatoNumero, formatoPesos, importePartida } from "@/lib/erp/dinero";
import { puedeOperar, verificarSegregacion } from "@/lib/erp/permisos";
import { TONO_CONCILIACION, TONO_OC } from "@/lib/erp/presentacion";
import { obtenerContextoErp } from "@/lib/erp/servidor/contexto";
import { formatoFecha } from "@/lib/formularios";

import { hoyInput } from "../../../_erp/comunes";
import { agregarPartidaOC, aprobarOC, cancelarOC, enviarOC, quitarPartidaOC, reabrirOC, rechazarOC, registrarRecepcion } from "../../acciones";

export default async function DetalleOrdenCompra({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, ctx] = await Promise.all([params, obtenerContextoErp()]);
  const orden = await db.ordenCompra.findFirst({
    where: { id, empresaId: ctx.empresa.id },
    include: {
      proveedor: true,
      almacen: true,
      partidas: { include: { articulo: true }, orderBy: { id: "asc" } },
      recepciones: { include: { partidas: true, cuentaPorPagar: true }, orderBy: { numero: "asc" } },
    },
  });
  if (!orden) notFound();
  const usuarios = await db.usuario.findMany({
    where: { id: { in: [orden.creadoPorId, orden.aprobadoPorId, ...orden.recepciones.map((r) => r.recibidoPorId)].filter((x): x is string => !!x) } },
    select: { id: true, nombre: true },
  });
  const nombre = (uid: string | null) => (uid ? usuarios.find((u) => u.id === uid)?.nombre ?? "—" : "—");
  const articulos =
    orden.estado === "BORRADOR"
      ? await db.articulo.findMany({ where: { empresaId: ctx.empresa.id, activo: true }, orderBy: { sku: "asc" }, select: { id: true, sku: true, nombre: true, ultimoCosto: true, unidad: true } })
      : [];

  const puedeComprar = puedeOperar(ctx.rol, ctx.areas, "COMPRAS");
  const puedeRecibir = puedeOperar(ctx.rol, ctx.areas, "ALMACEN");
  const nivelPolitica = nivelAprobacionOC(orden.total, ctx.config);
  const decisionAprobar =
    orden.estado === "POR_APROBAR"
      ? puedeAprobarOC({
          nivel: Math.max(orden.nivelAprobacion, nivelPolitica) as 0 | 1 | 2,
          rol: ctx.rol,
          areas: ctx.areas,
          aprobadorId: ctx.usuario.id,
          creadorId: orden.creadoPorId,
          segregacionEstricta: ctx.config.segregacionEstricta,
        })
      : null;
  const sodRecibir = verificarSegregacion("OC_APRUEBA_RECIBE", ctx.usuario.id, orden.aprobadoPorId, ctx.config.segregacionEstricta);
  const recibible = ["APROBADA", "RECIBIDA_PARCIAL"].includes(orden.estado);

  return (
    <>
      <EncabezadoPagina
        titulo={`Orden de compra #${orden.numero}`}
        descripcion={`${orden.proveedor.razonSocial} · almacén ${orden.almacen.clave}`}
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Órdenes de compra", href: "/compras/ordenes" }, { etiqueta: `#${orden.numero}` }]}
        acciones={<InsigniaEstado estado={orden.estado} tonos={TONO_OC} etiquetas={ETIQUETA_ESTADO_OC} />}
      />
      <div className="space-y-6">
        <Tarjeta titulo="Resumen y trazabilidad">
          <Datos
            filas={[
              ["Proveedor", <Link key="p" href={`/compras/proveedores/${orden.proveedorId}`} className="text-primario hover:underline">{orden.proveedor.razonSocial}</Link>],
              ["Crédito del proveedor", `${orden.proveedor.diasCredito} días`],
              ["Entrega comprometida", formatoFecha(orden.fechaEntrega)],
              ["Subtotal / IVA / Total", `${formatoPesos(orden.subtotal)} / ${formatoPesos(orden.iva)} / ${formatoPesos(orden.total)}`],
              ["Elaboró", nombre(orden.creadoPorId)],
              [
                "Autorización requerida",
                orden.estado === "BORRADOR"
                  ? `${ETIQUETA_NIVEL_APROBACION[nivelPolitica]} (según el total actual)`
                  : ETIQUETA_NIVEL_APROBACION[orden.nivelAprobacion as 0 | 1 | 2],
              ],
              ["Aprobó / rechazó", orden.aprobadoEn ? `${orden.aprobadoPorId ? nombre(orden.aprobadoPorId) : "Automática (política)"} · ${formatoFecha(orden.aprobadoEn)}` : "—"],
              ["Motivo de rechazo", orden.motivoRechazo ?? "—"],
            ]}
          />
        </Tarjeta>

        <Tarjeta titulo="Partidas">
          {orden.partidas.length === 0 ? (
            <p className="text-sm text-texto-suave">Sin partidas.</p>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Artículo</Th>
                  <Th className="text-right">Cantidad</Th>
                  <Th className="text-right">Recibido</Th>
                  <Th className="text-right">Costo unitario</Th>
                  <Th className="text-right">Importe</Th>
                  <Th className="text-right">IVA</Th>
                  {orden.estado === "BORRADOR" && puedeComprar && <Th />}
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {orden.partidas.map((p) => {
                  const importe = importePartida(p.cantidad, p.costoUnitario);
                  return (
                    <tr key={p.id}>
                      <Td>
                        <span className="font-mono text-xs">{p.articulo.sku}</span> {p.articulo.nombre}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {formatoNumero(p.cantidad)} {p.articulo.unidad}
                      </Td>
                      <Td className="text-right tabular-nums">{formatoNumero(p.cantidadRecibida)}</Td>
                      <Td className="text-right tabular-nums">{formatoPesos(p.costoUnitario)}</Td>
                      <Td className="text-right tabular-nums">{formatoPesos(importe)}</Td>
                      <Td className="text-right tabular-nums">{formatoPesos(aplicarBp(importe, p.tasaIvaBp))}</Td>
                      {orden.estado === "BORRADOR" && puedeComprar && (
                        <Td className="text-right">
                          <FormaAccion accion={quitarPartidaOC.bind(null, orden.id, p.id)} textoBoton="Quitar" variante="fantasma" tamano="sm" />
                        </Td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </Tabla>
          )}

          {orden.estado === "BORRADOR" && puedeComprar && (
            <div className="mt-4 border-t border-borde pt-4">
              {articulos.length === 0 ? (
                <p className="text-sm text-texto-suave">
                  No hay artículos activos.{" "}
                  <Link href="/almacen/articulos/nuevo" className="text-primario hover:underline">
                    Da de alta uno
                  </Link>
                  .
                </p>
              ) : (
                <FormaAccion accion={agregarPartidaOC.bind(null, orden.id)} textoBoton="Agregar partida" reiniciar>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
                    <Campo etiqueta="Artículo" htmlFor="articuloId" requerido>
                      <Selector id="articuloId" name="articuloId" required defaultValue="">
                        <option value="" disabled>
                          Elige…
                        </option>
                        {articulos.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.sku} · {a.nombre} {a.ultimoCosto > 0 ? `(último ${formatoPesos(a.ultimoCosto)})` : ""}
                          </option>
                        ))}
                      </Selector>
                    </Campo>
                    <Campo etiqueta="Cantidad" htmlFor="cantidad" requerido>
                      <Entrada id="cantidad" name="cantidad" inputMode="decimal" required />
                    </Campo>
                    <Campo etiqueta="Costo unitario (sin IVA)" htmlFor="costoUnitario" ayuda="Vacío = último costo">
                      <Entrada id="costoUnitario" name="costoUnitario" inputMode="decimal" />
                    </Campo>
                  </div>
                </FormaAccion>
              )}
            </div>
          )}
        </Tarjeta>

        {puedeComprar && orden.estado === "BORRADOR" && (
          <Tarjeta titulo="Enviar a autorización" descripcion="Modelo de decisión: matriz de autorización por monto (COBIT DSS06).">
            <div className="flex flex-wrap gap-2">
              <FormaAccion accion={enviarOC.bind(null, orden.id)} textoBoton="Enviar" />
              <FormaAccion accion={cancelarOC.bind(null, orden.id)} textoBoton="Cancelar OC" variante="peligro" confirmar="¿Cancelar la orden de compra?" />
            </div>
          </Tarjeta>
        )}

        {orden.estado === "POR_APROBAR" && decisionAprobar && (
          <Tarjeta titulo="Autorización" descripcion={`Nivel requerido: ${ETIQUETA_NIVEL_APROBACION[Math.max(orden.nivelAprobacion, nivelPolitica) as 0 | 1 | 2]}.`}>
            {decisionAprobar.permitido ? (
              <div className="space-y-3">
                {decisionAprobar.advertencia && <Aviso tono="aviso">{decisionAprobar.advertencia} (quedará como excepción en la bitácora)</Aviso>}
                <div className="flex flex-wrap items-start gap-4">
                  <FormaAccion accion={aprobarOC.bind(null, orden.id)} textoBoton="Aprobar" />
                  <FormaAccion accion={rechazarOC.bind(null, orden.id)} textoBoton="Rechazar" variante="peligro" className="flex flex-wrap items-start gap-2 space-y-0">
                    <Entrada name="motivo" placeholder="Motivo del rechazo" aria-label="Motivo del rechazo" className="w-64" />
                  </FormaAccion>
                </div>
              </div>
            ) : (
              <Aviso tono="info">{decisionAprobar.motivo}</Aviso>
            )}
            {puedeComprar && (
              <div className="mt-3">
                <FormaAccion accion={reabrirOC.bind(null, orden.id)} textoBoton="Regresar a borrador" variante="secundario" tamano="sm" />
              </div>
            )}
          </Tarjeta>
        )}
        {orden.estado === "RECHAZADA" && puedeComprar && (
          <Tarjeta titulo="Orden rechazada">
            <FormaAccion accion={reabrirOC.bind(null, orden.id)} textoBoton="Regresar a borrador para corregir" variante="secundario" />
          </Tarjeta>
        )}

        {recibible && puedeRecibir && (
          <Tarjeta
            titulo="Registrar recepción"
            descripcion={`Conciliación a tres vías: tolerancia de precio ${ctx.config.toleranciaPrecioBp / 100} %, de cantidad ${ctx.config.toleranciaCantidadBp / 100} %. Fuera de tolerancia, la cuenta por pagar queda bloqueada.`}
          >
            {!sodRecibir.permitido ? (
              <Aviso tono="info">{sodRecibir.mensaje}</Aviso>
            ) : (
              <FormaAccion accion={registrarRecepcion.bind(null, orden.id)} textoBoton="Registrar recepción" textoEnviando="Registrando…">
                {sodRecibir.advertencia && <Aviso tono="aviso">{sodRecibir.advertencia}</Aviso>}
                <Tabla>
                  <thead>
                    <tr>
                      <Th>Artículo</Th>
                      <Th className="text-right">Pendiente</Th>
                      <Th>Recibido (aceptado)</Th>
                      <Th>Rechazado</Th>
                      <Th>Motivo de rechazo</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borde">
                    {orden.partidas.map((p) => {
                      const pendiente = Math.max(0, p.cantidad - p.cantidadRecibida);
                      return (
                        <tr key={p.id}>
                          <Td>
                            <span className="font-mono text-xs">{p.articulo.sku}</span> {p.articulo.nombre}
                          </Td>
                          <Td className="text-right tabular-nums">{formatoNumero(pendiente)}</Td>
                          <Td>
                            <Entrada name={`recibida_${p.id}`} inputMode="decimal" defaultValue={pendiente > 0 ? String(pendiente) : ""} aria-label={`Recibido de ${p.articulo.sku}`} className="w-28" />
                          </Td>
                          <Td>
                            <Entrada name={`rechazada_${p.id}`} inputMode="decimal" aria-label={`Rechazado de ${p.articulo.sku}`} className="w-24" />
                          </Td>
                          <Td>
                            <Entrada name={`motivo_${p.id}`} aria-label={`Motivo de rechazo de ${p.articulo.sku}`} />
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Tabla>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <Campo etiqueta="Fecha de recepción" htmlFor="fecha" requerido>
                    <Entrada id="fecha" name="fecha" type="date" defaultValue={hoyInput()} required />
                  </Campo>
                  <Campo etiqueta="Folio / UUID de factura" htmlFor="folioFactura">
                    <Entrada id="folioFactura" name="folioFactura" />
                  </Campo>
                  <Campo etiqueta="Importe de factura (con IVA)" htmlFor="importeFactura" ayuda="Vacío = sin factura (CxP bloqueada)">
                    <Entrada id="importeFactura" name="importeFactura" inputMode="decimal" />
                  </Campo>
                  <Campo etiqueta="Notas" htmlFor="notas">
                    <Entrada id="notas" name="notas" />
                  </Campo>
                </div>
              </FormaAccion>
            )}
          </Tarjeta>
        )}

        {orden.recepciones.length > 0 && (
          <Tarjeta titulo="Recepciones">
            <Tabla>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Fecha</Th>
                  <Th>Recibió</Th>
                  <Th>A tiempo</Th>
                  <Th>Factura</Th>
                  <Th>Conciliación</Th>
                  <Th>Cuenta por pagar</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {orden.recepciones.map((r) => (
                  <tr key={r.id}>
                    <Td>{r.numero}</Td>
                    <Td>{formatoFecha(r.fecha)}</Td>
                    <Td>{nombre(r.recibidoPorId)}</Td>
                    <Td>{r.aTiempo ? <Insignia tono="exito">Sí</Insignia> : <Insignia tono="aviso">Tarde</Insignia>}</Td>
                    <Td className="text-xs">{r.folioFactura ? `${r.folioFactura} · ${formatoPesos(r.importeFactura)}` : "—"}</Td>
                    <Td>
                      <Insignia tono={TONO_CONCILIACION[r.conciliacion]}>{ETIQUETA_CONCILIACION[r.conciliacion as Conciliacion] ?? r.conciliacion}</Insignia>
                    </Td>
                    <Td>
                      {r.cuentaPorPagar ? (
                        <Link href={`/finanzas/cxp/${r.cuentaPorPagar.id}`} className="text-primario hover:underline">
                          {r.cuentaPorPagar.folio} · {r.cuentaPorPagar.estado.toLowerCase()}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </Tarjeta>
        )}
      </div>
    </>
  );
}
