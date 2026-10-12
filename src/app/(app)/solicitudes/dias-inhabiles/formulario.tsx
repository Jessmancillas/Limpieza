"use client";

import { Campo, Entrada, MensajeFormulario } from "@/components/ui";
import { BotonEnviar } from "@/components/ui/boton-enviar";

import { useAccion, type AccionFormulario } from "../_componentes/usar-accion";

export function FormDiaInhabil({ accion }: { accion: AccionFormulario }) {
  const { estado, despachar, alEnviar, refForm, refMensaje, err, inv } = useAccion(accion, { reiniciar: true });
  return (
    <form ref={refForm} action={despachar} onSubmit={alEnviar} className="space-y-3">
      <div ref={refMensaje}>
        <MensajeFormulario estado={estado} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Campo etiqueta="Fecha" htmlFor="di-fecha" requerido errores={err("fecha")}>
          <Entrada id="di-fecha" name="fecha" type="date" required aria-invalid={inv("fecha")} />
        </Campo>
        <Campo etiqueta="Descripción" htmlFor="di-desc" requerido errores={err("descripcion")} className="min-w-0 flex-1 sm:min-w-72">
          <Entrada
            id="di-desc"
            name="descripcion"
            maxLength={200}
            required
            placeholder="Vacaciones COFEPRIS (DOF dd/mm/aaaa)"
            aria-invalid={inv("descripcion")}
          />
        </Campo>
        <BotonEnviar textoEnviando="Agregando…">Agregar día</BotonEnviar>
      </div>
    </form>
  );
}
