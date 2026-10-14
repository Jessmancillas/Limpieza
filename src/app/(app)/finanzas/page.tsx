import Link from "next/link";

import { FormaAccion } from "@/components/erp/forma-accion";
import { Kpi, RejillaKpi } from "@/components/erp/indicadores";
import { Campo, EncabezadoPagina, Entrada, EstadoVacio, Insignia, Selector, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { CATEGORIAS_TESORERIA, ETIQUETA_CATEGORIA_TESORERIA, type CategoriaTesoreria } from "@/lib/erp/constantes";
import { priorizarPagos } from "@/lib/erp/decisiones/finanzas";
import { semaforo } from "@/lib/erp/decisiones/gobierno";
import { centavosATexto, formatoNumero, formatoPct, formatoPesos, pesosACentavos } from "@/lib/erp/dinero";
import { puedeOperar } from "@/lib/erp/permisos";
import { TONO_CUENTA } from "@/lib/erp/presentacion";
import { obtenerContextoErp } from "@/lib/erp/servidor/contexto";
import { cargarTableroEjecutivo } from "@/lib/erp/servidor/tablero";
import { formatoFecha } from "@/lib/formularios";

import { hoyInput, textoParam, type ParamsBusqueda } from "../_erp/comunes";
import { registrarMovimientoTesoreria } from "./acciones";

function dias(n: number | null) {
  return n === null ? "—" : `${formatoNumero(Math.round(n))} días`;
}

export default async function Finanzas({ searchParams }: { searchParams: ParamsBusqueda }) {
  const [sp, ctx] = await Promise.all([searchParams, obtenerContextoErp()]);
  const hoy = new Date();
  const [t, cuentas, movimientos] = await Promise.all([
    cargarTableroEjecutivo(ctx.empresa.id, ctx.config.factorServicioZ, hoy),
    db.cuentaPorPagar.findMany({
      where: { empresaId: ctx.empresa.id, estado: { in: ["PENDIENTE", "PARCIAL", "BLOQUEADA"] } },
      include: { proveedor: { select: { razonSocial: true, criticidad: true } } },
      orderBy: { fechaVencimiento: "asc" },
    }),
    db.movimientoTesoreria.findMany({ where: { empresaId: ctx.empresa.id }, orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }], take: 30 }),
  ]);
  const efectivoParam = pesosACentavos(textoParam(sp.efectivo));
  const efectivo = efectivoParam !== null && efectivoParam >= 0 ? efectivoParam : Math.max(0, t.efectivo);
  const pagables = cuentas.filter((c) => c.estado !== "BLOQUEADA");
  const programa = priorizarPagos(
    pagables.map((c) => ({ id: c.id, saldo: c.saldo, fechaVencimiento: c.fechaVencimiento, criticidadProveedor: c.proveedor.criticidad })),
    efectivo,
    hoy,
  );
  const cuenta = new Map(cuentas.map((c) => [c.id, c]));
  const bloqueadas = cuentas.filter((c) => c.estado === "BLOQUEADA");
  const f = t.financieros;
  const puede = puedeOperar(ctx.rol, ctx.areas, "FINANZAS");

  return (
    <>
      <EncabezadoPagina
        titulo="Finanzas y tesorería"
        descripcion={`Ciclo de conversión de efectivo, cuentas por pagar con programa de pagos priorizado y tesorería. Indicadores de los últimos ${t.periodoDias} días (COBIT APO06 / MEA01).`}
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Finanzas" }]}
      />
      <div className="space-y-6">
        <RejillaKpi>
          <Kpi titulo="Saldo de tesorería" valor={formatoPesos(t.efectivo)} detalle="Ingresos − egresos registrados" semaforo={t.efectivo >= 0 ? "verde" : "rojo"} />
          <Kpi titulo="Ventas netas" valor={formatoPesos(t.ventasNetas)} detalle={`Margen bruto ${formatoPct(f.margenBruto)}`} semaforo={semaforo(f.margenBruto, 0.25, "mayor")} marco="Meta margen ≥ 25 %" />
          <Kpi titulo="Ciclo de conversión" valor={dias(f.ccc)} detalle={`DSO ${dias(f.dso)} + DIO ${dias(f.dio)} − DPO ${dias(f.dpo)}`} semaforo={semaforo(f.ccc, 60, "menor")} marco="Meta ≤ 60 días" />
          <Kpi titulo="Cuentas por pagar" valor={formatoPesos(t.saldoProveedores)} detalle={`Vencidas ${formatoPesos(t.cxpVencidas)} · bloqueadas ${t.alertas.cxpBloqueadas}`} semaforo={t.cxpVencidas === 0 ? "verde" : "amarillo"} />
        </RejillaKpi>

        {bloqueadas.length > 0 && (
          <Tarjeta titulo="Cuentas bloqueadas por conciliación a tres vías" descripcion="No se pueden pagar hasta registrar la factura correcta o que un aprobador las libere.">
            <Tabla>
              <thead>
                <tr>
                  <Th>Folio</Th>
                  <Th>Proveedor</Th>
                  <Th className="text-right">Importe</Th>
                  <Th />
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {bloqueadas.map((c) => (
                  <tr key={c.id}>
                    <Td>{c.folio}</Td>
                    <Td>{c.proveedor.razonSocial}</Td>
                    <Td className="text-right tabular-nums">{formatoPesos(c.saldo)}</Td>
                    <Td className="text-right">
                      <Link href={`/finanzas/cxp/${c.id}`} className="text-primario hover:underline">
                        Resolver
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </Tarjeta>
        )}

        <Tarjeta
          titulo="Programa de pagos priorizado"
          descripcion="Modelo de decisión: puntaje = atraso (hasta 50) + cercanía al vencimiento (hasta 30) + criticidad del proveedor (crítico 20, estratégico 10). El efectivo se asigna en orden de puntaje."
          acciones={
            <form action="/finanzas" className="flex items-end gap-2">
              <label htmlFor="efectivo" className="text-xs text-texto-suave">
                Efectivo disponible
              </label>
              <Entrada id="efectivo" name="efectivo" inputMode="decimal" defaultValue={centavosATexto(efectivo)} className="w-36" />
              <button type="submit" className="rounded-md border border-borde bg-superficie px-3 py-2 text-sm hover:bg-fondo">
                Simular
              </button>
            </form>
          }
        >
          {programa.length === 0 ? (
            <EstadoVacio titulo="Sin cuentas por pagar" />
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th className="text-right">Puntaje</Th>
                  <Th>Folio</Th>
                  <Th>Proveedor</Th>
                  <Th>Vence</Th>
                  <Th className="text-right">Saldo</Th>
                  <Th className="text-right">Pago sugerido</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {programa.map((p) => {
                  const c = cuenta.get(p.id)!;
                  return (
                    <tr key={p.id} className={p.incluido ? undefined : "text-texto-suave"}>
                      <Td className="text-right tabular-nums">{p.puntaje}</Td>
                      <Td>
                        <Link href={`/finanzas/cxp/${c.id}`} className="text-primario hover:underline">
                          {c.folio}
                        </Link>
                      </Td>
                      <Td>
                        {c.proveedor.razonSocial}
                        {c.proveedor.criticidad !== "NORMAL" && <span className="block text-xs">{c.proveedor.criticidad.toLowerCase()}</span>}
                      </Td>
                      <Td>
                        {formatoFecha(c.fechaVencimiento)}
                        <span className={`block text-xs ${p.diasParaVencer < 0 ? "text-peligro" : "text-texto-suave"}`}>
                          {p.diasParaVencer < 0 ? `${-p.diasParaVencer} días vencida` : `en ${p.diasParaVencer} días`}
                        </span>
                      </Td>
                      <Td className="text-right tabular-nums">{formatoPesos(p.saldo)}</Td>
                      <Td className="text-right font-medium tabular-nums">{p.incluido ? formatoPesos(p.montoSugerido) : "—"}</Td>
                      <Td>
                        <Insignia tono={TONO_CUENTA[c.estado]}>{c.estado.toLowerCase()}</Insignia>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabla>
          )}
        </Tarjeta>

        <Tarjeta titulo="Tesorería">
          {puede && (
            <div className="mb-4 border-b border-borde pb-4">
              <FormaAccion accion={registrarMovimientoTesoreria} textoBoton="Registrar movimiento" reiniciar>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
                  <Campo etiqueta="Tipo" htmlFor="tipo">
                    <Selector id="tipo" name="tipo">
                      <option value="EGRESO">Egreso</option>
                      <option value="INGRESO">Ingreso</option>
                    </Selector>
                  </Campo>
                  <Campo etiqueta="Categoría" htmlFor="categoria">
                    <Selector id="categoria" name="categoria">
                      {CATEGORIAS_TESORERIA.filter((c) => c !== "COBRO_CLIENTE" && c !== "PAGO_PROVEEDOR").map((c) => (
                        <option key={c} value={c}>
                          {ETIQUETA_CATEGORIA_TESORERIA[c]}
                        </option>
                      ))}
                    </Selector>
                  </Campo>
                  <Campo etiqueta="Monto" htmlFor="montoT" requerido>
                    <Entrada id="montoT" name="monto" inputMode="decimal" required />
                  </Campo>
                  <Campo etiqueta="Fecha" htmlFor="fechaT" requerido>
                    <Entrada id="fechaT" name="fecha" type="date" defaultValue={hoyInput()} required />
                  </Campo>
                  <Campo etiqueta="Concepto" htmlFor="concepto" requerido>
                    <Entrada id="concepto" name="concepto" required />
                  </Campo>
                </div>
              </FormaAccion>
            </div>
          )}
          {movimientos.length === 0 ? (
            <p className="text-sm text-texto-suave">Sin movimientos.</p>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Categoría</Th>
                  <Th>Concepto</Th>
                  <Th className="text-right">Monto</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {movimientos.map((m) => (
                  <tr key={m.id}>
                    <Td>{formatoFecha(m.fecha)}</Td>
                    <Td>{ETIQUETA_CATEGORIA_TESORERIA[m.categoria as CategoriaTesoreria] ?? m.categoria}</Td>
                    <Td>{m.concepto}</Td>
                    <Td className={`text-right tabular-nums ${m.tipo === "EGRESO" ? "text-peligro" : "text-exito"}`}>
                      {m.tipo === "EGRESO" ? "−" : "+"}
                      {formatoPesos(m.monto)}
                    </Td>
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
