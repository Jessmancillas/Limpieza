import Link from "next/link";

import { Kpi, RejillaKpi } from "@/components/erp/indicadores";
import { EncabezadoPagina, EnlaceBoton, EstadoVacio, Insignia, Tabla, Td, Th } from "@/components/ui";
import { POLITICA_ABC } from "@/lib/erp/decisiones/inventario";
import { formatoNumero, formatoPesos } from "@/lib/erp/dinero";
import { puedeOperar } from "@/lib/erp/permisos";
import { TONO_CLASE } from "@/lib/erp/presentacion";
import { analizarInventario } from "@/lib/erp/servidor/consultas";
import { obtenerContextoErp } from "@/lib/erp/servidor/contexto";

import { PestanasAlmacen } from "../../_erp/comunes";

export default async function Inventario() {
  const ctx = await obtenerContextoErp();
  const analisis = await analizarInventario(ctx.empresa.id, ctx.config.factorServicioZ);
  const valor = analisis.reduce((s, a) => s + a.valorInventario, 0);
  const bajoRop = analisis.filter((a) => a.activo && a.sugerida > 0).length;
  const sinExistencia = analisis.filter((a) => a.activo && a.existencia <= 0).length;
  const porClase = (c: string) => analisis.filter((a) => a.clase === c).length;
  const puede = puedeOperar(ctx.rol, ctx.areas, "ALMACEN");

  return (
    <>
      <EncabezadoPagina
        titulo="Inventario"
        descripcion="Existencias consolidadas, valuación a costo promedio ponderado y clasificación ABC (COBIT BAI09)."
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Almacén" }, { etiqueta: "Inventario" }]}
        acciones={puede && <EnlaceBoton href="/almacen/articulos/nuevo">+ Nuevo artículo</EnlaceBoton>}
      />
      <PestanasAlmacen actual="/almacen/articulos" />
      <div className="mb-6">
        <RejillaKpi>
          <Kpi titulo="Valor del inventario" valor={formatoPesos(valor)} detalle="Costo promedio ponderado" />
          <Kpi titulo="Artículos" valor={analisis.length} detalle={`A: ${porClase("A")} · B: ${porClase("B")} · C: ${porClase("C")}`} />
          <Kpi titulo="Bajo punto de reorden" valor={bajoRop} detalle="Ver Reabastecimiento" semaforo={bajoRop === 0 ? "verde" : "amarillo"} />
          <Kpi titulo="Sin existencia" valor={sinExistencia} semaforo={sinExistencia === 0 ? "verde" : "rojo"} />
        </RejillaKpi>
      </div>
      {analisis.length === 0 ? (
        <EstadoVacio titulo="Aún no hay artículos" descripcion="Da de alta los artículos (SKU) que compras y vendes." />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>ABC</Th>
              <Th>SKU</Th>
              <Th>Artículo</Th>
              <Th className="text-right">Existencia</Th>
              <Th className="text-right">ROP</Th>
              <Th className="text-right">Costo prom.</Th>
              <Th className="text-right">Valor</Th>
              <Th>Situación</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {analisis.map((a) => (
              <tr key={a.id} className={a.activo ? undefined : "text-texto-suave"}>
                <Td>
                  <span title={POLITICA_ABC[a.clase]}>
                    <Insignia tono={TONO_CLASE[a.clase]}>{a.clase}</Insignia>
                  </span>
                </Td>
                <Td className="font-mono text-xs">{a.sku}</Td>
                <Td>
                  <Link href={`/almacen/articulos/${a.id}`} className="font-medium text-primario hover:underline">
                    {a.nombre}
                  </Link>
                </Td>
                <Td className="text-right tabular-nums">
                  {formatoNumero(a.existencia)} {a.unidad}
                </Td>
                <Td className="text-right tabular-nums">{formatoNumero(Math.ceil(a.politica.puntoReorden))}</Td>
                <Td className="text-right tabular-nums">{formatoPesos(a.costoUnitario)}</Td>
                <Td className="text-right tabular-nums">{formatoPesos(a.valorInventario)}</Td>
                <Td>
                  {!a.activo ? (
                    <Insignia>Inactivo</Insignia>
                  ) : a.existencia <= 0 ? (
                    <Insignia tono="peligro">Agotado</Insignia>
                  ) : a.sugerida > 0 ? (
                    <Insignia tono="aviso">Reordenar {formatoNumero(a.sugerida)}</Insignia>
                  ) : (
                    <Insignia tono="exito">OK</Insignia>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
