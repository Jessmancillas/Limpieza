import { FormaAccion } from "@/components/erp/forma-accion";
import { Kpi, RejillaKpi } from "@/components/erp/indicadores";
import { Aviso, Casilla, EncabezadoPagina, Insignia, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { ETIQUETA_ROL, type Rol } from "@/lib/constantes";
import { AREAS, ETIQUETA_AREA, ETIQUETA_AREA_CORTA } from "@/lib/erp/constantes";
import { prioridadesMejora, semaforo } from "@/lib/erp/decisiones/gobierno";
import { formatoNumero, formatoPct } from "@/lib/erp/dinero";
import { ETIQUETA_NIVEL_CAPACIDAD } from "@/lib/erp/marcos";
import { areasDeMembresia, REGLAS_SEGREGACION } from "@/lib/erp/permisos";
import { obtenerContextoErp } from "@/lib/erp/servidor/contexto";
import { cargarTableroEjecutivo } from "@/lib/erp/servidor/tablero";

import { PestanasGobierno } from "../_erp/comunes";
import { guardarAreasMiembro, sembrarControles } from "./acciones";

/** Matriz RACI de los procesos principales (R responsable, A aprueba, C consultado, I informado). */
const RACI: Array<{ proceso: string; filas: Partial<Record<string, string>> }> = [
  { proceso: "Elaborar orden de compra", filas: { COMPRAS: "R", APROBADOR: "I", ALMACEN: "I", FINANZAS: "I" } },
  { proceso: "Autorizar OC (por monto)", filas: { APROBADOR: "A", COMPRAS: "C", FINANZAS: "C" } },
  { proceso: "Recibir mercancía", filas: { ALMACEN: "R", COMPRAS: "I", FINANZAS: "I" } },
  { proceso: "Conciliar y pagar a proveedor", filas: { FINANZAS: "R", APROBADOR: "A", COMPRAS: "C" } },
  { proceso: "Pedido de venta y crédito", filas: { VENTAS: "R", APROBADOR: "A", COBRANZA: "C" } },
  { proceso: "Surtido y entrega", filas: { ALMACEN: "R", VENTAS: "I", COBRANZA: "I" } },
  { proceso: "Cobranza y suspensión de crédito", filas: { COBRANZA: "R", VENTAS: "C", FINANZAS: "I" } },
  { proceso: "Riesgos, controles y cambios", filas: { GOBIERNO: "R", APROBADOR: "A", FINANZAS: "C" } },
];

export default async function Gobierno() {
  const ctx = await obtenerContextoErp();
  const [t, controles, miembros] = await Promise.all([
    cargarTableroEjecutivo(ctx.empresa.id, ctx.config.factorServicioZ),
    db.controlGobierno.findMany({ where: { empresaId: ctx.empresa.id } }),
    db.membresia.findMany({ where: { empresaId: ctx.empresa.id }, include: { usuario: { select: { nombre: true, email: true, activo: true } } }, orderBy: { creadoEn: "asc" } }),
  ]);
  const g = t.gobierno;
  const mejoras = prioridadesMejora(controles, 6);
  const esAdmin = ctx.rol === "ADMIN";

  return (
    <>
      <EncabezadoPagina
        titulo="Gobierno de TI y control interno"
        descripcion="COBIT 2019 para el gobierno y la medición, ITIL 4 para la gestión de servicios e ISO/IEC 27001:2022 para la seguridad de la información."
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Gobierno" }]}
      />
      <PestanasGobierno actual="/gobierno" />
      <div className="space-y-6">
        {controles.length === 0 && (
          <Aviso tono="info" titulo="Carga los marcos de referencia">
            <p className="mb-2">Agrega los objetivos de COBIT 2019 y los controles del Anexo A de ISO/IEC 27001 que soporta el ERP para autoevaluar su nivel.</p>
            <FormaAccion accion={sembrarControles} textoBoton="Cargar controles de referencia" tamano="sm" />
          </Aviso>
        )}
        <RejillaKpi>
          <Kpi titulo="Madurez COBIT" valor={g.madurezCobit === null ? "—" : `${formatoNumero(Math.round(g.madurezCobit * 10) / 10)} / 5`} detalle={`${g.brechas} controles con brecha`} semaforo={semaforo(g.madurezCobit, 3, "mayor")} marco="COBIT MEA01 · meta 3" />
          <Kpi titulo="Cumplimiento ISO 27001" valor={formatoPct(g.cumplimientoIso)} detalle="Controles aplicables en nivel objetivo" semaforo={semaforo(g.cumplimientoIso, 0.8, "mayor")} marco="Meta ≥ 80 %" />
          <Kpi titulo="Riesgos sobre el apetito" valor={t.alertas.riesgosSobreApetito} detalle="Abiertos con p × i > 9 sin tratar" semaforo={t.alertas.riesgosSobreApetito === 0 ? "verde" : "rojo"} marco="ISO 27001 6.1.2" />
          <Kpi titulo="SLA de servicio" valor={formatoPct(t.servicio.cumplimientoSla)} detalle={`${t.servicio.abiertos} tickets abiertos · ${t.alertas.slaVencidos} vencidos`} semaforo={semaforo(t.servicio.cumplimientoSla, 0.9, "mayor")} marco="ITIL · meta 90 %" />
        </RejillaKpi>

        <Tarjeta titulo="Arquitectura empresarial" descripcion="Capas del sistema centralizado (detalle en docs/arquitectura-empresarial.md).">
          <div className="grid gap-3 text-sm lg:grid-cols-4">
            {[
              { capa: "Negocio", items: ["Procure-to-pay: proveedores → OC → recepción → CxP → pago", "Order-to-cash: pedido → crédito → entrega → CxC → cobro", "Inventario: kárdex, ABC, reabastecimiento", "Finanzas: tesorería y ciclo de efectivo"] },
              { capa: "Decisión", items: ["Matriz de autorización por monto", "Conciliación a tres vías", "EOQ / punto de reorden / ABC", "Scoring de crédito y de proveedores", "Priorización de pagos y cobranza por tramo"] },
              { capa: "Datos", items: ["Datos maestros únicos por empresa (artículos, proveedores, clientes, almacenes)", "Documentos con folio y trazabilidad", "Bitácora inmutable de eventos"] },
              { capa: "Gobierno y seguridad", items: ["COBIT: objetivos y KPIs", "ITIL: incidentes, problemas, cambios", "ISO 27001: SoA, riesgos, segregación de funciones, control de acceso"] },
            ].map((c) => (
              <div key={c.capa} className="rounded-md border border-borde p-3">
                <p className="mb-2 font-semibold text-primario">{c.capa}</p>
                <ul className="list-inside list-disc space-y-1 text-texto-suave">
                  {c.items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Tarjeta>

        {mejoras.length > 0 && (
          <Tarjeta titulo="Hoja de ruta de mejora" descripcion="Controles con mayor brecha entre el nivel actual y el objetivo.">
            <Tabla>
              <thead>
                <tr>
                  <Th>Marco</Th>
                  <Th>Control</Th>
                  <Th>Actual</Th>
                  <Th>Objetivo</Th>
                  <Th>Brecha</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {mejoras.map((c) => (
                  <tr key={c.id}>
                    <Td>{c.marco === "COBIT" ? "COBIT" : "ISO 27001"}</Td>
                    <Td>
                      <span className="font-mono text-xs">{c.clave}</span> {c.nombre}
                    </Td>
                    <Td>{ETIQUETA_NIVEL_CAPACIDAD[c.nivelActual]}</Td>
                    <Td>{ETIQUETA_NIVEL_CAPACIDAD[c.nivelObjetivo]}</Td>
                    <Td>
                      <Insignia tono="aviso">{c.nivelObjetivo - c.nivelActual}</Insignia>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </Tarjeta>
        )}

        <Tarjeta
          titulo="Segregación de funciones (ISO/IEC 27001 A.5.3)"
          descripcion={ctx.config.segregacionEstricta ? "Política estricta: las acciones incompatibles se bloquean." : "Política flexible: las acciones incompatibles se permiten y se registran como excepción."}
        >
          <ul className="mb-4 list-inside list-disc text-sm text-texto-suave">
            {REGLAS_SEGREGACION.map((r) => (
              <li key={r.id}>{r.descripcion}</li>
            ))}
          </ul>
          <Tabla>
            <thead>
              <tr>
                <Th>Proceso (RACI)</Th>
                {AREAS.map((a) => (
                  <Th key={a} className="text-center">
                    {ETIQUETA_AREA_CORTA[a]}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {RACI.map((r) => (
                <tr key={r.proceso}>
                  <Td>{r.proceso}</Td>
                  {AREAS.map((a) => (
                    <Td key={a} className="text-center font-mono">
                      {r.filas[a] ?? ""}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Tabla>
        </Tarjeta>

        <Tarjeta titulo="Áreas funcionales por usuario" descripcion="Los administradores tienen todas; «solo consulta» no opera. Sin asignación explícita, un capturista tiene las áreas operativas (sin Aprobador ni Gobierno).">
          <div className="space-y-4">
            {miembros.map((m) => {
              const areas = areasDeMembresia(m.areas);
              return (
                <div key={m.id} className="rounded-md border border-borde p-3">
                  <p className="text-sm font-medium">
                    {m.usuario.nombre} <span className="text-texto-suave">· {m.usuario.email} · {ETIQUETA_ROL[m.rol as Rol] ?? m.rol}</span>
                    {!m.usuario.activo && (
                      <span className="ml-1">
                        <Insignia>Inactivo</Insignia>
                      </span>
                    )}
                  </p>
                  {esAdmin && m.rol === "CAPTURISTA" ? (
                    <FormaAccion accion={guardarAreasMiembro.bind(null, m.id)} textoBoton="Guardar áreas" tamano="sm" variante="secundario" className="mt-2">
                      <div className="flex flex-wrap gap-4">
                        {AREAS.map((a) => (
                          <Casilla key={a} name="areas" value={a} defaultChecked={areas.includes(a)} etiqueta={ETIQUETA_AREA[a]} />
                        ))}
                      </div>
                    </FormaAccion>
                  ) : (
                    <p className="mt-1 text-xs text-texto-suave">
                      {m.rol === "ADMIN" ? "Todas las áreas (administrador)." : m.rol === "CONSULTA" ? "Solo consulta." : areas.map((a) => ETIQUETA_AREA[a]).join(", ") || "Sin áreas"}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </Tarjeta>
      </div>
    </>
  );
}
