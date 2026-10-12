"use client";

import { cx, MensajeFormulario } from "@/components/ui";
import { BotonEnviar } from "@/components/ui/boton-enviar";

import { useAccion, type AccionFormulario } from "../_componentes/usar-accion";

export type OpcionEstablecimiento = {
  id: string;
  denominacion: string;
  domicilio: string;
  licencia: string;
  scian: string;
};

export function FormularioNuevaSolicitud({
  accion,
  establecimientos,
  seleccionado,
}: {
  accion: AccionFormulario;
  establecimientos: OpcionEstablecimiento[];
  seleccionado?: string;
}) {
  const { estado, despachar, alEnviar, refMensaje, err } = useAccion(accion);
  const errores = err("establecimientoId");
  return (
    <form action={despachar} onSubmit={alEnviar} className="space-y-4">
      <div ref={refMensaje}>
        <MensajeFormulario estado={estado} />
      </div>
      <fieldset aria-describedby={errores ? "establecimiento-error" : undefined}>
        <legend className="mb-2 text-sm font-medium">
          Establecimiento donde se almacenarán los dispositivos <span className="text-peligro">*</span>
        </legend>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {establecimientos.map((e, i) => (
            <label
              key={e.id}
              className={cx(
                "flex cursor-pointer gap-3 rounded-lg border border-borde bg-superficie p-4 text-sm",
                "has-[:checked]:border-primario has-[:checked]:bg-primario-suave",
              )}
            >
              <input
                type="radio"
                name="establecimientoId"
                value={e.id}
                defaultChecked={seleccionado ? seleccionado === e.id : i === 0}
                required
                className="mt-1 size-4 accent-[var(--primario)]"
              />
              <span className="min-w-0">
                <span className="block font-medium">{e.denominacion}</span>
                <span className="block text-texto-suave">{e.domicilio}</span>
                <span className="block text-xs text-texto-suave">{e.licencia}</span>
                {e.scian && <span className="block text-xs text-texto-suave">SCIAN {e.scian}</span>}
              </span>
            </label>
          ))}
        </div>
        {errores?.map((m) => (
          <p key={m} id="establecimiento-error" role="alert" className="mt-1 text-xs text-peligro">
            {m}
          </p>
        ))}
      </fieldset>
      <BotonEnviar textoEnviando="Creando…">Crear borrador</BotonEnviar>
    </form>
  );
}
