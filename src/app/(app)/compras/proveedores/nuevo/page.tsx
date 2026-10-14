import { FormaAccion } from "@/components/erp/forma-accion";
import { EncabezadoPagina, Tarjeta } from "@/components/ui";

import { guardarProveedor } from "../../acciones";
import { CamposProveedor } from "../campos";

export default function NuevoProveedor() {
  return (
    <>
      <EncabezadoPagina
        titulo="Nuevo proveedor"
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Proveedores", href: "/compras/proveedores" }, { etiqueta: "Nuevo" }]}
      />
      <Tarjeta>
        <FormaAccion accion={guardarProveedor.bind(null, null)} textoBoton="Dar de alta">
          <CamposProveedor />
        </FormaAccion>
      </Tarjeta>
    </>
  );
}
