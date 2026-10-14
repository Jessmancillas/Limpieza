import Link from "next/link";

import { Kpi, RejillaKpi } from "@/components/erp/indicadores";
import { EncabezadoPagina, Insignia, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { semaforo } from "@/lib/erp/decisiones/gobierno";
import { formatoNumero, formatoPct, formatoPesos } from "@/lib/erp/dinero";
import { obtenerContextoErp } from "@/lib/erp/servidor/contexto";
import { cargarTableroEjecutivo } from "@/lib/erp/servidor/tablero";

function dias(n: number | null) {
  return n === null ? "—" : `${formatoNumero(Math.round(n))} d`;
}

export default async function TableroEjecutivo() {
  const ctx = await obtenerContextoErp();
  const t = await cargarTableroEjecutivo(ctx.empresa.id, ctx.config.factorServicioZ);
  const f = t.financieros;
  const a = t.alertas;

  const decisiones: Array<{ texto: string; n: number; href: string; tono: "aviso" | "peligro" | "info"; marco: string }> = [
    { texto: "Órdenes de compra por aprobar", n: a.ocPorAprobar, href: "/compras/ordenes?estado=POR_APROBAR", tono: "aviso", marco: "DSS06" },
    { texto: "Pedidos con excepción de crédito por autorizar", n: a.pedidosPorAutorizar, href: "/ventas/pedidos", tono: "aviso", marco: "APO12" },
    { texto: "Cuentas por pagar bloqueadas (conciliación a tres vías)", n: a.cxpBloqueadas, href: "/finanzas", tono: "peligro", marco: "DSS06" },
    { texto: "Artículos bajo el punto de reorden", n: a.articulosBajoRop, href: "/compras/reabastecimiento", tono: "aviso", marco: "BAI09" },
    { texto: "Artículos agotados", n: a.articulosAgotados, href: "/almacen/articulos", tono: "peligro", marco: "DSS01" },
    { texto: "Tickets con SLA vencido", n: a.slaVencidos, href: "/gobierno/servicios", tono: "peligro", marco: "DSS02" },
    { texto: "Riesgos sobre el apetito sin tratar", n: a.riesgosSobreApetito, href: "/gobierno/riesgos", tono: "peligro", marco: "ISO 27001" },
    { texto: `Excepciones de control en ${t.periodoDias} días (liberaciones, autorizaciones, castigos, cambios de política)`, n: a.excepciones, href: "/configuracion/bitacora", tono: "info", marco: "MEA02" },
  ];
  const pendientes = decisiones.filter((d) => d.n > 0);

  return (
    <>
      <EncabezadoPagina
        titulo="Tablero ejecutivo"
        descripcion={`Indicadores de desempeño y conformidad de la arquitectura empresarial (COBIT 2019 MEA01). Periodo: últimos ${t.periodoDias} días.`}
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Tablero ejecutivo" }]}
      />
      <div className="space-y-6">
        <Tarjeta titulo="Decisiones pendientes" descripcion="Excepciones que los modelos de decisión escalaron a una persona.">
          {pendientes.length === 0 ? (
            <p className="text-sm text-texto-suave">No hay decisiones pendientes.</p>
          ) : (
            <ul className="divide-y divide-borde">
              {pendientes.map((d) => (
                <li key={d.texto} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <Link href={d.href} className="hover:text-primario hover:underline">
                    {d.texto}
                  </Link>
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-texto-suave">{d.marco}</span>
                    <Insignia tono={d.tono}>{d.n}</Insignia>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-texto-suave">Finanzas</h2>
          <RejillaKpi>
            <Kpi titulo="Ventas netas" valor={formatoPesos(t.ventasNetas)} detalle={`${t.pedidosEntregados} pedidos entregados`} />
            <Kpi titulo="Margen bruto" valor={formatoPct(f.margenBruto)} semaforo={semaforo(f.margenBruto, 0.25, "mayor")} marco="APO06 · meta ≥ 25 %" />
            <Kpi titulo="Ciclo de conversión de efectivo" valor={dias(f.ccc)} detalle={`DSO ${dias(f.dso)} · DIO ${dias(f.dio)} · DPO ${dias(f.dpo)}`} semaforo={semaforo(f.ccc, 60, "menor")} marco="APO06 · meta ≤ 60 d" />
            <Kpi titulo="Tesorería" valor={formatoPesos(t.efectivo)} detalle={`CxC ${formatoPesos(t.saldoClientes)} · CxP ${formatoPesos(t.saldoProveedores)}`} semaforo={t.efectivo >= 0 ? "verde" : "rojo"} />
          </RejillaKpi>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-texto-suave">Compras, almacén y cobranza</h2>
          <RejillaKpi>
            <Kpi titulo="Calidad de proveedores" valor={formatoPct(t.compras.calidad)} detalle={`${t.compras.recepciones} recepciones`} semaforo={semaforo(t.compras.calidad, 0.98, "mayor")} marco="APO10 · meta ≥ 98 %" />
            <Kpi titulo="Entregas a tiempo" valor={formatoPct(t.compras.puntualidad)} semaforo={semaforo(t.compras.puntualidad, 0.9, "mayor")} marco="APO10 · meta ≥ 90 %" />
            <Kpi titulo="Facturas conciliadas" valor={formatoPct(t.compras.conciliacionOk)} detalle="Conciliación a tres vías sin diferencias" semaforo={semaforo(t.compras.conciliacionOk, 0.95, "mayor")} marco="DSS06 · meta ≥ 95 %" />
            <Kpi titulo="Cartera vencida" valor={formatoPct(t.fraccionVencida)} detalle={`Provisión ${formatoPesos(t.antiguedad.provision)}`} semaforo={semaforo(t.fraccionVencida, 0.15, "menor")} marco="APO12 · meta ≤ 15 %" />
          </RejillaKpi>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-texto-suave">Gobierno, servicio y seguridad</h2>
          <RejillaKpi>
            <Kpi titulo="Valor del inventario" valor={formatoPesos(t.valorInventario)} detalle={`Rotación ${f.rotacionInventario === null ? "—" : formatoNumero(Math.round(f.rotacionInventario * 10) / 10)}× en el periodo`} marco="BAI09" />
            <Kpi titulo="Madurez COBIT" valor={t.gobierno.madurezCobit === null ? "—" : `${formatoNumero(Math.round(t.gobierno.madurezCobit * 10) / 10)} / 5`} semaforo={semaforo(t.gobierno.madurezCobit, 3, "mayor")} marco="MEA01 · meta 3" />
            <Kpi titulo="Cumplimiento ISO 27001" valor={formatoPct(t.gobierno.cumplimientoIso)} semaforo={semaforo(t.gobierno.cumplimientoIso, 0.8, "mayor")} marco="APO13 · meta ≥ 80 %" />
            <Kpi titulo="Cumplimiento de SLA" valor={formatoPct(t.servicio.cumplimientoSla)} detalle={`${t.servicio.abiertos} tickets abiertos`} semaforo={semaforo(t.servicio.cumplimientoSla, 0.9, "mayor")} marco="DSS02 · meta ≥ 90 %" />
          </RejillaKpi>
        </section>

        <Tarjeta titulo="Mapa de procesos y modelos de decisión" descripcion="Cada proceso del ERP con su modelo de decisión y el marco que lo respalda.">
          <Tabla>
            <thead>
              <tr>
                <Th>Proceso</Th>
                <Th>Modelo de decisión</Th>
                <Th>COBIT 2019</Th>
                <Th>ITIL 4 / ISO 27001</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {[
                ["Compras: autorización de OC", "Matriz de autorización por monto + segregación elabora/aprueba", "DSS06, APO10", "ISO A.5.3"],
                ["Compras: recepción y pago", "Conciliación a tres vías con tolerancias; bloqueo y liberación por excepción", "DSS06, APO06", "ISO A.5.3, A.8.15"],
                ["Compras: proveedores", "Scorecard ponderado (calidad, puntualidad, cumplimiento, facturación) → clase A-D", "APO10", "ISO A.5.19"],
                ["Almacén: reabastecimiento", "EOQ, stock de seguridad (z·σ·√L), punto de reorden, clasificación ABC", "BAI09, APO06", "—"],
                ["Ventas: crédito", "Scoring 0-100 con reglas duras → aprobar / revisar / rechazar", "APO12", "ISO A.5.3"],
                ["Cobranza", "Antigüedad por tramo → estrategia y provisión; suspensión de crédito", "APO12, MEA01", "—"],
                ["Finanzas: pagos", "Priorización por atraso, vencimiento y criticidad con efectivo limitado", "APO06", "—"],
                ["Servicio de TI", "Prioridad impacto × urgencia → SLA; CAB para cambios", "DSS02, BAI06", "ITIL 4; ISO A.5.24, A.8.32"],
                ["Seguridad", "Riesgo p × i vs. apetito (9); tratamiento y residual", "APO12, APO13", "ISO 6.1.2, Anexo A"],
              ].map(([proceso, modelo, cobit, otros]) => (
                <tr key={proceso}>
                  <Td className="font-medium">{proceso}</Td>
                  <Td>{modelo}</Td>
                  <Td className="text-xs">{cobit}</Td>
                  <Td className="text-xs">{otros}</Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </Tarjeta>
      </div>
    </>
  );
}
