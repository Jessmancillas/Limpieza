import { FormaAccion } from "@/components/erp/forma-accion";
import { EncabezadoPagina, Tarjeta } from "@/components/ui";

import { guardarCliente } from "../../acciones";
import { CamposCliente } from "../campos";

export default function NuevoCliente() {
  return (
    <>
      <EncabezadoPagina titulo="Nuevo cliente" migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Clientes", href: "/ventas/clientes" }, { etiqueta: "Nuevo" }]} />
      <Tarjeta>
        <FormaAccion accion={guardarCliente.bind(null, null)} textoBoton="Dar de alta">
          <CamposCliente />
        </FormaAccion>
      </Tarjeta>
    </>
  );
}
