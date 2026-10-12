"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react";

import { ESTADO_INICIAL, type EstadoFormulario } from "@/lib/formularios";

export type AccionFormulario = (previo: EstadoFormulario, formData: FormData) => Promise<EstadoFormulario>;

/**
 * useActionState sin el reinicio automático de formularios de React 19: si el servidor regresa
 * errores se conserva lo capturado (listas dinámicas y campos que se muestran/ocultan).
 * Uso: <form action={despachar} onSubmit={alEnviar}>. El `action` permite enviar sin JavaScript
 * y que <BotonEnviar> (useFormStatus) muestre el estado de envío.
 */
export function useFormularioAccion(accion: AccionFormulario) {
  const [estado, despachar, pendiente] = useActionState(accion, ESTADO_INICIAL);
  const refMensaje = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (estado !== ESTADO_INICIAL && estado.mensaje) {
      refMensaje.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [estado]);

  const alEnviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const datos = new FormData(e.currentTarget, submitter);
    startTransition(() => despachar(datos));
  };

  return { estado, despachar, alEnviar, pendiente, refMensaje };
}
