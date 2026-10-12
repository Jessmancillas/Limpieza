"use client";

import { useActionState } from "react";

import { CamposEmpresa } from "@/components/formularios/campos-empresa";
import { MensajeFormulario } from "@/components/ui";
import { BotonEnviar } from "@/components/ui/boton-enviar";
import { ESTADO_INICIAL } from "@/lib/formularios";

import { actualizarEmpresa } from "./acciones";

export function FormularioEmpresa({ valoresIniciales }: { valoresIniciales: Record<string, string> }) {
  const [estado, accion] = useActionState(actualizarEmpresa, ESTADO_INICIAL);
  return (
    <form action={accion} className="space-y-6">
      <MensajeFormulario estado={estado} />
      <CamposEmpresa valores={estado.valores ?? valoresIniciales} errores={estado.errores} />
      <BotonEnviar>Guardar cambios</BotonEnviar>
    </form>
  );
}
