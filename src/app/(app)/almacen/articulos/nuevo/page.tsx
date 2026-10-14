import { FormaAccion } from "@/components/erp/forma-accion";
import { EncabezadoPagina, Tarjeta } from "@/components/ui";
import { db } from "@/lib/db";
import { obtenerContextoErp } from "@/lib/erp/servidor/contexto";

import { guardarArticulo } from "../../acciones";
import { CamposArticulo } from "../campos";

export default async function NuevoArticulo() {
  const ctx = await obtenerContextoErp();
  const proveedores = await db.proveedor.findMany({ where: { empresaId: ctx.empresa.id }, orderBy: { razonSocial: "asc" }, select: { id: true, clave: true, razonSocial: true } });
  return (
    <>
      <EncabezadoPagina titulo="Nuevo artículo" migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Inventario", href: "/almacen/articulos" }, { etiqueta: "Nuevo" }]} />
      <Tarjeta>
        <FormaAccion accion={guardarArticulo.bind(null, null)} textoBoton="Dar de alta">
          <CamposArticulo proveedores={proveedores} v={{ tasaIvaBp: ctx.config.tasaIvaBp }} />
        </FormaAccion>
      </Tarjeta>
    </>
  );
}
