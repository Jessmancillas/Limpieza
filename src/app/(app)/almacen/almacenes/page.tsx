import { FormaAccion } from "@/components/erp/forma-accion";
import { Campo, EncabezadoPagina, Entrada, EstadoVacio, Insignia, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { db } from "@/lib/db";
import { formatoPesos } from "@/lib/erp/dinero";
import { puedeOperar } from "@/lib/erp/permisos";
import { obtenerContextoErp } from "@/lib/erp/servidor/contexto";

import { PestanasAlmacen } from "../../_erp/comunes";
import { cambiarActivoAlmacen, guardarAlmacen } from "../acciones";

export default async function Almacenes() {
  const ctx = await obtenerContextoErp();
  const almacenes = await db.almacen.findMany({ where: { empresaId: ctx.empresa.id }, include: { existencias: true }, orderBy: { clave: "asc" } });
  const puede = puedeOperar(ctx.rol, ctx.areas, "ALMACEN");
  return (
    <>
      <EncabezadoPagina titulo="Almacenes" migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Almacén" }, { etiqueta: "Almacenes" }]} />
      <PestanasAlmacen actual="/almacen/almacenes" />
      {puede && (
        <Tarjeta titulo="Nuevo almacén" className="mb-6">
          <FormaAccion accion={guardarAlmacen} textoBoton="Crear almacén" reiniciar>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Campo etiqueta="Clave" htmlFor="clave" requerido>
                <Entrada id="clave" name="clave" required maxLength={30} />
              </Campo>
              <Campo etiqueta="Nombre" htmlFor="nombre" requerido>
                <Entrada id="nombre" name="nombre" required />
              </Campo>
              <Campo etiqueta="Ubicación" htmlFor="ubicacion">
                <Entrada id="ubicacion" name="ubicacion" />
              </Campo>
            </div>
          </FormaAccion>
        </Tarjeta>
      )}
      {almacenes.length === 0 ? (
        <EstadoVacio titulo="Aún no hay almacenes" />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Clave</Th>
              <Th>Nombre</Th>
              <Th>Ubicación</Th>
              <Th className="text-right">Artículos</Th>
              <Th className="text-right">Valor</Th>
              <Th>Estado</Th>
              {puede && <Th />}
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {almacenes.map((a) => (
              <tr key={a.id}>
                <Td className="font-mono text-xs">{a.clave}</Td>
                <Td>{a.nombre}</Td>
                <Td>{a.ubicacion ?? "—"}</Td>
                <Td className="text-right">{a.existencias.filter((e) => e.cantidad > 0).length}</Td>
                <Td className="text-right tabular-nums">{formatoPesos(a.existencias.reduce((s, e) => s + Math.round(Math.max(0, e.cantidad) * e.costoPromedio), 0))}</Td>
                <Td>{a.activo ? <Insignia tono="exito">Activo</Insignia> : <Insignia>Inactivo</Insignia>}</Td>
                {puede && (
                  <Td className="text-right">
                    <FormaAccion accion={cambiarActivoAlmacen.bind(null, a.id)} textoBoton={a.activo ? "Desactivar" : "Reactivar"} variante="fantasma" tamano="sm" />
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
