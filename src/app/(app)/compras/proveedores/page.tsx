import Link from "next/link";

import { InsigniaEstado } from "@/components/erp/indicadores";
import { EncabezadoPagina, EnlaceBoton, EstadoVacio, Insignia, Tabla, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { formatoPct } from "@/lib/erp/dinero";
import { TONO_CLASE, TONO_PROVEEDOR } from "@/lib/erp/presentacion";
import { evaluarProveedores } from "@/lib/erp/servidor/consultas";
import { obtenerContextoErp } from "@/lib/erp/servidor/contexto";
import { puedeOperar } from "@/lib/erp/permisos";

import { PestanasCompras } from "../../_erp/comunes";

export default async function Proveedores() {
  const ctx = await obtenerContextoErp();
  const [proveedores, evaluaciones] = await Promise.all([
    db.proveedor.findMany({ where: { empresaId: ctx.empresa.id }, orderBy: [{ estado: "asc" }, { razonSocial: "asc" }], include: { _count: { select: { ordenesCompra: true } } } }),
    evaluarProveedores(ctx.empresa.id),
  ]);
  const puede = puedeOperar(ctx.rol, ctx.areas, "COMPRAS");
  return (
    <>
      <EncabezadoPagina
        titulo="Proveedores"
        descripcion="Padrón único de proveedores con evaluación de desempeño ponderada (COBIT APO10) y criticidad (ISO/IEC 27001 A.5.19)."
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Compras" }, { etiqueta: "Proveedores" }]}
        acciones={puede && <EnlaceBoton href="/compras/proveedores/nuevo">+ Nuevo proveedor</EnlaceBoton>}
      />
      <PestanasCompras actual="/compras/proveedores" />
      {proveedores.length === 0 ? (
        <EstadoVacio titulo="Aún no hay proveedores" descripcion="Da de alta a tus proveedores para emitir órdenes de compra." />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Clave</Th>
              <Th>Razón social</Th>
              <Th>Criticidad</Th>
              <Th>Crédito</Th>
              <Th>OC</Th>
              <Th>Evaluación</Th>
              <Th>Calidad / puntualidad</Th>
              <Th>Estado</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {proveedores.map((p) => {
              const e = evaluaciones.get(p.id);
              return (
                <tr key={p.id}>
                  <Td className="font-mono text-xs">{p.clave}</Td>
                  <Td>
                    <Link href={`/compras/proveedores/${p.id}`} className="font-medium text-primario hover:underline">
                      {p.razonSocial}
                    </Link>
                    {p.rfc && <span className="block font-mono text-xs text-texto-suave">{p.rfc}</span>}
                  </Td>
                  <Td>{p.criticidad === "CRITICO" ? <Insignia tono="peligro">Crítico</Insignia> : p.criticidad === "ESTRATEGICO" ? <Insignia tono="info">Estratégico</Insignia> : "Normal"}</Td>
                  <Td>{p.diasCredito} días</Td>
                  <Td>{p._count.ordenesCompra}</Td>
                  <Td>{e ? <Insignia tono={TONO_CLASE[e.clase]}>{`${e.clase} · ${e.puntaje}`}</Insignia> : <span className="text-xs text-texto-suave">Sin historial</span>}</Td>
                  <Td className="text-xs">{e ? `${formatoPct(e.calidad)} / ${formatoPct(e.puntualidad)}` : "—"}</Td>
                  <Td>
                    <InsigniaEstado estado={p.estado} tonos={TONO_PROVEEDOR} etiquetas={{ ACTIVO: "Activo", EN_EVALUACION: "En evaluación", BLOQUEADO: "Bloqueado" }} />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
