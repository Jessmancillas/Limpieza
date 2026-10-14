import { FormaAccion } from "@/components/erp/forma-accion";
import { Aviso, Campo, Casilla, EncabezadoPagina, Entrada, Tarjeta } from "@/components/ui";
import { centavosATexto } from "@/lib/erp/dinero";
import { obtenerContextoErp } from "@/lib/erp/servidor/contexto";

import { PestanasGobierno } from "../../_erp/comunes";
import { guardarPoliticas } from "../acciones";

export default async function Politicas() {
  const ctx = await obtenerContextoErp();
  const c = ctx.config;
  const esAdmin = ctx.rol === "ADMIN";
  return (
    <>
      <EncabezadoPagina
        titulo="Políticas de decisión"
        descripcion="Parámetros que gobiernan los modelos de decisión del ERP (COBIT APO01 / EDM03). Cada cambio queda en la bitácora con el valor anterior y el nuevo."
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Gobierno", href: "/gobierno" }, { etiqueta: "Políticas" }]}
      />
      <PestanasGobierno actual="/gobierno/politicas" />
      {!esAdmin && (
        <div className="mb-4">
          <Aviso tono="info">Solo un administrador puede modificar las políticas.</Aviso>
        </div>
      )}
      <Tarjeta>
        <FormaAccion accion={guardarPoliticas} textoBoton="Guardar políticas">
          <fieldset disabled={!esAdmin} className="space-y-5">
            <section>
              <h2 className="mb-2 text-sm font-semibold">Compras: matriz de autorización y conciliación</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <Campo etiqueta="Aprobación automática hasta" htmlFor="montoAutoAprobacion" ayuda="Total con IVA">
                  <Entrada id="montoAutoAprobacion" name="montoAutoAprobacion" inputMode="decimal" defaultValue={centavosATexto(c.montoAutoAprobacion)} />
                </Campo>
                <Campo etiqueta="Un aprobador hasta" htmlFor="montoAprobacionNivel1" ayuda="Más: dirección">
                  <Entrada id="montoAprobacionNivel1" name="montoAprobacionNivel1" inputMode="decimal" defaultValue={centavosATexto(c.montoAprobacionNivel1)} />
                </Campo>
                <Campo etiqueta="Tolerancia de precio %" htmlFor="toleranciaPrecio">
                  <Entrada id="toleranciaPrecio" name="toleranciaPrecio" inputMode="decimal" defaultValue={String(c.toleranciaPrecioBp / 100)} />
                </Campo>
                <Campo etiqueta="Tolerancia de cantidad %" htmlFor="toleranciaCantidad">
                  <Entrada id="toleranciaCantidad" name="toleranciaCantidad" inputMode="decimal" defaultValue={String(c.toleranciaCantidadBp / 100)} />
                </Campo>
              </div>
            </section>
            <section>
              <h2 className="mb-2 text-sm font-semibold">Crédito y cobranza</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Campo etiqueta="Puntaje mínimo para aprobar" htmlFor="puntajeCreditoMinimo">
                  <Entrada id="puntajeCreditoMinimo" name="puntajeCreditoMinimo" type="number" min={0} max={100} defaultValue={c.puntajeCreditoMinimo} />
                </Campo>
                <Campo etiqueta="Puntaje mínimo para revisión" htmlFor="puntajeCreditoRevision" ayuda="Debajo se rechaza">
                  <Entrada id="puntajeCreditoRevision" name="puntajeCreditoRevision" type="number" min={0} max={100} defaultValue={c.puntajeCreditoRevision} />
                </Campo>
                <Campo etiqueta="Días de gracia" htmlFor="diasGraciaCredito">
                  <Entrada id="diasGraciaCredito" name="diasGraciaCredito" type="number" min={0} max={120} defaultValue={c.diasGraciaCredito} />
                </Campo>
              </div>
            </section>
            <section>
              <h2 className="mb-2 text-sm font-semibold">Inventario e impuestos</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Campo etiqueta="Factor z × 100 (nivel de servicio)" htmlFor="factorServicioZ" ayuda="128 ≈ 90 %, 165 ≈ 95 %, 233 ≈ 99 %">
                  <Entrada id="factorServicioZ" name="factorServicioZ" type="number" min={0} max={400} defaultValue={c.factorServicioZ} />
                </Campo>
                <Campo etiqueta="IVA % por defecto" htmlFor="tasaIva">
                  <Entrada id="tasaIva" name="tasaIva" inputMode="decimal" defaultValue={String(c.tasaIvaBp / 100)} />
                </Campo>
              </div>
            </section>
            <section>
              <h2 className="mb-2 text-sm font-semibold">Control interno</h2>
              <Casilla name="segregacionEstricta" defaultChecked={c.segregacionEstricta} etiqueta="Segregación de funciones estricta (bloquear acciones incompatibles en lugar de solo registrarlas como excepción)" />
            </section>
          </fieldset>
        </FormaAccion>
      </Tarjeta>
    </>
  );
}
