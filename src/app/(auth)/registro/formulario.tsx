"use client";

import { useActionState } from "react";

import { CamposEmpresa } from "@/components/formularios/campos-empresa";
import { Campo, Entrada, MensajeFormulario } from "@/components/ui";
import { BotonEnviar } from "@/components/ui/boton-enviar";
import { ESTADO_INICIAL } from "@/lib/formularios";

import { registrarse } from "../acciones";

export function FormularioRegistro() {
  const [estado, accion] = useActionState(registrarse, ESTADO_INICIAL);
  const errores = estado.errores ?? {};
  return (
    <form action={accion} className="mt-6 space-y-6">
      <MensajeFormulario estado={estado} />
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Tu usuario</legend>
        <Campo etiqueta="Tu nombre" htmlFor="nombreUsuario" requerido errores={errores.nombreUsuario}>
          <Entrada id="nombreUsuario" name="nombreUsuario" defaultValue={estado.valores?.nombreUsuario} autoComplete="name" />
        </Campo>
        <Campo etiqueta="Correo electrónico" htmlFor="email" requerido errores={errores.email}>
          <Entrada id="email" name="email" type="email" defaultValue={estado.valores?.email} autoComplete="email" />
        </Campo>
        <Campo etiqueta="Contraseña" htmlFor="password" requerido errores={errores.password} ayuda="Mínimo 10 caracteres.">
          <Entrada id="password" name="password" type="password" autoComplete="new-password" />
        </Campo>
      </fieldset>
      <CamposEmpresa valores={estado.valores} errores={errores} />
      <BotonEnviar textoEnviando="Creando cuenta…">Crear cuenta</BotonEnviar>
    </form>
  );
}
