import Link from "next/link";
import { notFound } from "next/navigation";

import { FormaAccion } from "@/components/erp/forma-accion";
import { Aviso, Campo, Datos, EncabezadoPagina, Entrada, Insignia, Selector, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { ETIQUETA_CONCILIACION, METODOS_PAGO, type Conciliacion } from "@/lib/erp/constantes";
import { centavosATexto, formatoPesos } from "@/lib/erp/dinero";
import { puedeOperar, verificarSegregacion } from "@/lib/erp/permisos";
import { TONO_CONCILIACION, TONO_CUENTA } from "@/lib/erp/presentacion";
import { obtenerContextoErp } from "@/lib/erp/servidor/contexto";
import { formatoFecha } from "@/lib/formularios";

import { hoyInput } from "../../../_erp/comunes";
import { registrarFacturaCxP } from "../../../compras/acciones";
import { liberarCxP, pagarCxP } from "../../acciones";

export default async function DetalleCxP({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, ctx] = await Promise.all([params, obtenerContextoErp()]);
  const c = await db.cuentaPorPagar.findFirst({
    where: { id, empresaId: ctx.empresa.id },
    include: { proveedor: true, recepcion: { include: { ordenCompra: { select: { id: true, numero: true } } } }, pagos: { orderBy: { fecha: "desc" } } },
  });
  if (!c) notFound();
  const abierta = ["PENDIENTE", "PARCIAL"].includes(c.estado);
  const puedePagar = puedeOperar(ctx.rol, ctx.areas, "FINANZAS");
  const puedeLiberar = puedeOperar(ctx.rol, ctx.areas, "APROBADOR");
  const sod = verificarSegregacion("RECIBE_PAGA", ctx.usuario.id, c.recepcion?.recibidoPorId, ctx.config.segregacionEstricta);

  return (
    <>
      <EncabezadoPagina
        titulo={`Cuenta por pagar ${c.folio}`}
        descripcion={c.proveedor.razonSocial}
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Finanzas", href: "/finanzas" }, { etiqueta: c.folio }]}
        acciones={<Insignia tono={TONO_CUENTA[c.estado]}>{c.estado.toLowerCase()}</Insignia>}
      />
      <div className="space-y-6">
        <Tarjeta titulo="Resumen">
          <Datos
            filas={[
              ["Proveedor", <Link key="p" href={`/compras/proveedores/${c.proveedorId}`} className="text-primario hover:underline">{c.proveedor.razonSocial}</Link>],
              [
                "Orden de compra",
                c.recepcion ? (
                  <Link key="o" href={`/compras/ordenes/${c.recepcion.ordenCompra.id}`} className="text-primario hover:underline">
                    #{c.recepcion.ordenCompra.numero} · recepción {c.recepcion.numero}
                  </Link>
                ) : (
                  "—"
                ),
              ],
              ["Emisión / vencimiento", `${formatoFecha(c.fechaEmision)} / ${formatoFecha(c.fechaVencimiento)}`],
              ["Total / saldo", `${formatoPesos(c.total)} / ${formatoPesos(c.saldo)}`],
              [
                "Conciliación a tres vías",
                c.recepcion ? <Insignia key="c" tono={TONO_CONCILIACION[c.recepcion.conciliacion]}>{ETIQUETA_CONCILIACION[c.recepcion.conciliacion as Conciliacion] ?? c.recepcion.conciliacion}</Insignia> : "—",
              ],
              ["Factura", c.recepcion?.folioFactura ? `${c.recepcion.folioFactura} · ${formatoPesos(c.recepcion.importeFactura)}` : "Sin factura"],
            ]}
          />
        </Tarjeta>

        {c.estado === "BLOQUEADA" && (
          <div className="grid gap-6 lg:grid-cols-2">
            {puedePagar && c.recepcion && (
              <Tarjeta titulo="Registrar o corregir factura" descripcion="Vuelve a correr la conciliación; si cuadra, la cuenta se libera.">
                <FormaAccion accion={registrarFacturaCxP.bind(null, c.id)} textoBoton="Conciliar">
                  <div className="grid grid-cols-2 gap-3">
                    <Campo etiqueta="Folio / UUID" htmlFor="folioFactura" requerido>
                      <Entrada id="folioFactura" name="folioFactura" defaultValue={c.recepcion.folioFactura ?? ""} required />
                    </Campo>
                    <Campo etiqueta="Importe (con IVA)" htmlFor="importeFactura" requerido>
                      <Entrada id="importeFactura" name="importeFactura" inputMode="decimal" required />
                    </Campo>
                  </div>
                </FormaAccion>
              </Tarjeta>
            )}
            {puedeLiberar && (
              <Tarjeta titulo="Liberar por excepción" descripcion="Aprobador: acepta la diferencia con justificación (queda en la bitácora de excepciones).">
                <FormaAccion accion={liberarCxP.bind(null, c.id)} textoBoton="Liberar" variante="secundario">
                  <Campo etiqueta="Justificación" htmlFor="motivo" requerido>
                    <Entrada id="motivo" name="motivo" required minLength={10} />
                  </Campo>
                </FormaAccion>
              </Tarjeta>
            )}
          </div>
        )}

        {abierta && puedePagar && (
          <Tarjeta titulo="Registrar pago" descripcion="Se registra también como egreso en tesorería.">
            {!sod.permitido ? (
              <Aviso tono="info">{sod.mensaje}</Aviso>
            ) : (
              <FormaAccion accion={pagarCxP.bind(null, c.id)} textoBoton="Registrar pago">
                {sod.advertencia && <Aviso tono="aviso">{sod.advertencia}</Aviso>}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <Campo etiqueta="Fecha" htmlFor="fecha" requerido>
                    <Entrada id="fecha" name="fecha" type="date" defaultValue={hoyInput()} required />
                  </Campo>
                  <Campo etiqueta="Monto" htmlFor="monto" requerido>
                    <Entrada id="monto" name="monto" inputMode="decimal" defaultValue={centavosATexto(c.saldo)} required />
                  </Campo>
                  <Campo etiqueta="Método" htmlFor="metodo">
                    <Selector id="metodo" name="metodo">
                      {METODOS_PAGO.map((m) => (
                        <option key={m} value={m}>
                          {m.toLowerCase()}
                        </option>
                      ))}
                    </Selector>
                  </Campo>
                  <Campo etiqueta="Referencia" htmlFor="referencia">
                    <Entrada id="referencia" name="referencia" />
                  </Campo>
                </div>
              </FormaAccion>
            )}
          </Tarjeta>
        )}

        <Tarjeta titulo="Pagos">
          {c.pagos.length === 0 ? (
            <p className="text-sm text-texto-suave">Sin pagos.</p>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th className="text-right">Monto</Th>
                  <Th>Método</Th>
                  <Th>Referencia</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {c.pagos.map((p) => (
                  <tr key={p.id}>
                    <Td>{formatoFecha(p.fecha)}</Td>
                    <Td className="text-right tabular-nums">{formatoPesos(p.monto)}</Td>
                    <Td>{p.metodo.toLowerCase()}</Td>
                    <Td>{p.referencia ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Tarjeta>
      </div>
    </>
  );
}
