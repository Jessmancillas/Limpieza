"use client";

import { Campo, MensajeFormulario, Selector } from "@/components/ui";
import { BotonEnviar } from "@/components/ui/boton-enviar";
import type { OpcionCatalogo } from "@/lib/catalogos";

import { CampoCatalogo } from "../../../establecimientos/_compartido/campo-catalogo";
import { useAccion, type AccionFormulario } from "../../_componentes/usar-accion";

export function FormDatosGenerales({
  accion,
  inicial,
  establecimientos,
  opcionesRegimen,
  opcionesAduana,
  soloLectura,
}: {
  accion: AccionFormulario;
  inicial: { establecimientoId: string | null; cveRegimen: string | null; cveAduana: string | null };
  establecimientos: Array<{ id: string; nombre: string; activo: boolean }>;
  opcionesRegimen: OpcionCatalogo[];
  opcionesAduana: OpcionCatalogo[];
  soloLectura: boolean;
}) {
  const { estado, despachar, alEnviar, refMensaje, err, inv } = useAccion(accion);
  return (
    <form action={despachar} onSubmit={alEnviar} className="space-y-4">
      <div ref={refMensaje}>
        <MensajeFormulario estado={estado} />
      </div>
      <fieldset disabled={soloLectura} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Establecimiento"
          htmlFor="dg-establecimientoId"
          requerido
          errores={err("establecimientoId")}
          className="sm:col-span-2"
          ayuda="Si lo cambias, se desligan los documentos del establecimiento anterior y se ligan los del nuevo."
        >
          <Selector
            id="dg-establecimientoId"
            name="establecimientoId"
            defaultValue={inicial.establecimientoId ?? ""}
            required
            aria-invalid={inv("establecimientoId")}
          >
            <option value="">Selecciona…</option>
            {establecimientos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
                {e.activo ? "" : " (inactivo)"}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Régimen" htmlFor="dg-cveRegimen" requerido errores={err("cveRegimen")} ayuda="Clave de 2 caracteres (CAT_REGIMEN).">
          <CampoCatalogo
            id="dg-cveRegimen"
            name="cveRegimen"
            opciones={opcionesRegimen}
            valor={inicial.cveRegimen}
            nombreCatalogo="Regímenes"
            maxLength={2}
            invalido={!!err("cveRegimen")}
          />
        </Campo>
        <Campo etiqueta="Aduana de entrada" htmlFor="dg-cveAduana" requerido errores={err("cveAduana")} ayuda="Clave de 3 caracteres (CAT_ADUANA).">
          <CampoCatalogo
            id="dg-cveAduana"
            name="cveAduana"
            opciones={opcionesAduana}
            valor={inicial.cveAduana}
            nombreCatalogo="Aduanas"
            maxLength={3}
            invalido={!!err("cveAduana")}
          />
        </Campo>
      </fieldset>
      {!soloLectura && <BotonEnviar>Guardar datos generales</BotonEnviar>}
    </form>
  );
}
