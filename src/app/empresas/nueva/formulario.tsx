"use client";

import { useActionState } from "react";

import { CamposEmpresa } from "@/components/formularios/campos-empresa";
import { MensajeFormulario } from "@/components/ui";
import { BotonEnviar } from "@/components/ui/boton-enviar";
import { ESTADO_INICIAL } from "@/lib/formularios";

import { crearEmpresa } from "./acciones";

export function FormularioNuevaEmpresa() {
  const [estado, accion] = useActionState(crearEmpresa, ESTADO_INICIAL);
  return (
    <form action={accion} className="mt-6 space-y-6">
      <MensajeFormulario estado={estado} />
      <CamposEmpresa valores={estado.valores} errores={estado.errores} />
      <BotonEnviar>Crear empresa</BotonEnviar>
    </form>
  );
}
