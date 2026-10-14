import Link from "next/link";

import { Kpi, RejillaKpi } from "@/components/erp/indicadores";
import { cx, EncabezadoPagina, EstadoVacio, Insignia, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { accionSugerida, diasVencido, INFO_TRAMO, resumenAntiguedad, tramoAntiguedad, TRAMOS, type Tramo } from "@/lib/erp/decisiones/cobranza";
import { formatoPct, formatoPesos } from "@/lib/erp/dinero";
import { obtenerContextoErp } from "@/lib/erp/servidor/contexto";
import { formatoFecha } from "@/lib/formularios";

import { PestanasVentas, textoParam, type ParamsBusqueda } from "../_erp/comunes";

const TONO_TRAMO: Record<Tramo, "exito" | "info" | "aviso" | "peligro"> = { CORRIENTE: "exito", D1_30: "info", D31_60: "aviso", D61_90: "peligro", MAS_90: "peligro" };

export default async function Cobranza({ searchParams }: { searchParams: ParamsBusqueda }) {
  const [sp, ctx] = await Promise.all([searchParams, obtenerContextoErp()]);
  const tramoParam = textoParam(sp.tramo);
  const filtro = (TRAMOS as readonly string[]).includes(tramoParam) ? (tramoParam as Tramo) : null;
  const hoy = new Date();
  const cuentas = await db.cuentaPorCobrar.findMany({
    where: { empresaId: ctx.empresa.id, estado: { in: ["PENDIENTE", "PARCIAL"] } },
    include: {
      cliente: { select: { razonSocial: true, estado: true } },
      gestiones: { orderBy: { creadoEn: "desc" }, take: 1 },
    },
    orderBy: { fechaVencimiento: "asc" },
  });
  const r = resumenAntiguedad(cuentas, hoy);
  const vencido = r.total - r.CORRIENTE.saldo;
  const visibles = filtro ? cuentas.filter((c) => tramoAntiguedad(c.fechaVencimiento, hoy) === filtro) : cuentas;

  return (
    <>
      <EncabezadoPagina
        titulo="Cobranza"
        descripcion="Antigüedad de saldos, estrategia de cobranza por tramo y estimación de provisión para cuentas incobrables."
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Ventas" }, { etiqueta: "Cobranza" }]}
      />
      <PestanasVentas actual="/cobranza" />
      <div className="mb-6">
        <RejillaKpi>
          <Kpi titulo="Cartera total" valor={formatoPesos(r.total)} detalle={`${cuentas.length} cuentas abiertas`} />
          <Kpi titulo="Cartera vencida" valor={formatoPesos(vencido)} detalle={formatoPct(r.total > 0 ? vencido / r.total : null)} semaforo={r.total === 0 || vencido / r.total <= 0.15 ? "verde" : vencido / r.total <= 0.25 ? "amarillo" : "rojo"} marco="Meta ≤ 15 %" />
          <Kpi titulo="Más de 90 días" valor={formatoPesos(r.MAS_90.saldo)} detalle={`${r.MAS_90.cuentas} cuentas`} semaforo={r.MAS_90.saldo === 0 ? "verde" : "rojo"} />
          <Kpi titulo="Provisión estimada" valor={formatoPesos(r.provision)} detalle="Según % por tramo" marco="COBIT APO12" />
        </RejillaKpi>
      </div>

      <Tarjeta titulo="Antigüedad de saldos y estrategia" className="mb-6">
        <Tabla>
          <thead>
            <tr>
              <Th>Tramo</Th>
              <Th className="text-right">Saldo</Th>
              <Th className="text-right">Cuentas</Th>
              <Th className="text-right">Provisión</Th>
              <Th>Estrategia de cobranza</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {TRAMOS.map((t) => (
              <tr key={t} className={cx(filtro === t && "bg-primario-suave")}>
                <Td>
                  <Link href={filtro === t ? "/cobranza" : `/cobranza?tramo=${t}`} className="hover:underline">
                    <Insignia tono={TONO_TRAMO[t]}>{INFO_TRAMO[t].etiqueta}</Insignia>
                  </Link>
                </Td>
                <Td className="text-right tabular-nums">{formatoPesos(r[t].saldo)}</Td>
                <Td className="text-right">{r[t].cuentas}</Td>
                <Td className="text-right tabular-nums">{INFO_TRAMO[t].provisionBp / 100} %</Td>
                <Td className="text-sm">{INFO_TRAMO[t].estrategia}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      </Tarjeta>

      {visibles.length === 0 ? (
        <EstadoVacio titulo="Sin cuentas por cobrar abiertas" />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Folio</Th>
              <Th>Cliente</Th>
              <Th>Vence</Th>
              <Th className="text-right">Saldo</Th>
              <Th>Última gestión</Th>
              <Th>Siguiente acción sugerida</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {visibles.map((c) => {
              const dias = diasVencido(c.fechaVencimiento, hoy);
              const ultima = c.gestiones[0];
              const promesaIncumplida = !!(ultima?.tipo === "PROMESA_PAGO" && ultima.fechaPromesa && ultima.fechaPromesa < hoy);
              return (
                <tr key={c.id}>
                  <Td>
                    <Link href={`/cobranza/${c.id}`} className="font-medium text-primario hover:underline">
                      {c.folio}
                    </Link>
                  </Td>
                  <Td>
                    {c.cliente.razonSocial}
                    {c.cliente.estado === "SUSPENDIDO" && (
                      <span className="ml-1">
                        <Insignia tono="peligro">Suspendido</Insignia>
                      </span>
                    )}
                  </Td>
                  <Td>
                    {formatoFecha(c.fechaVencimiento)}
                    {dias > 0 && <span className="block text-xs text-peligro">{dias} días vencida</span>}
                  </Td>
                  <Td className="text-right tabular-nums">{formatoPesos(c.saldo)}</Td>
                  <Td className="text-xs">{ultima ? `${ultima.tipo.toLowerCase().replace("_", " ")} · ${formatoFecha(ultima.creadoEn)}` : "—"}</Td>
                  <Td className="text-xs">{accionSugerida(dias, promesaIncumplida)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
