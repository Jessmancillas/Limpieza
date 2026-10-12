"use client";

import { useActionState } from "react";

import { Campo, Entrada, MensajeFormulario } from "@/components/ui";
import { BotonEnviar } from "@/components/ui/boton-enviar";
import { ESTADO_INICIAL } from "@/lib/formularios";

import { iniciarSesion } from "../acciones";

export function FormularioLogin() {
  const [estado, accion] = useActionState(iniciarSesion, ESTADO_INICIAL);
  return (
    <form action={accion} className="mt-6 space-y-4">
      <MensajeFormulario estado={estado} />
      <Campo etiqueta="Correo electrónico" htmlFor="email" errores={estado.errores?.email}>
        <Entrada id="email" name="email" type="email" autoComplete="email" defaultValue={estado.valores?.email} required />
      </Campo>
      <Campo etiqueta="Contraseña" htmlFor="password" errores={estado.errores?.password}>
        <Entrada id="password" name="password" type="password" autoComplete="current-password" required />
      </Campo>
      <BotonEnviar className="w-full" textoEnviando="Entrando…">
        Entrar
      </BotonEnviar>
    </form>
  );
}
