"use client";

import { useActionState, useId } from "react";

import { SelectorCatalogo } from "@/components/formularios/selector-catalogo";
import { Entrada } from "@/components/ui";
import { BotonEnviar } from "@/components/ui/boton-enviar";
import type { OpcionCatalogo } from "@/lib/catalogos";
import { ESTADO_INICIAL } from "@/lib/formularios";

import { guardarTipoDocumentoVucem } from "./acciones";

/** Elegir el idTipoDocumento (CAT_TIPO_DOCUMENTO) de un anexo desde la tabla de digitalización. */
export function FormularioTipoDocumento({
  solicitudId,
  documentoId,
  nombreDocumento,
  opciones,
}: {
  solicitudId: string;
  documentoId: string;
  nombreDocumento: string;
  opciones: OpcionCatalogo[];
}) {
  const [estado, accion] = useActionState(guardarTipoDocumentoVucem, ESTADO_INICIAL);
  const id = useId();
  const errores = estado.errores?.idTipoDocumentoVucem;
  return (
    <form action={accion} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="solicitudId" value={solicitudId} />
      <input type="hidden" name="documentoId" value={documentoId} />
      <label htmlFor={id} className="sr-only">
        Tipo de documento VUCEM de {nombreDocumento}
      </label>
      {opciones.length > 0 ? (
        <SelectorCatalogo
          id={id}
          name="idTipoDocumentoVucem"
          opciones={opciones}
          valor={estado.valores?.idTipoDocumentoVucem}
          className="min-w-48 flex-1"
          aria-invalid={errores ? true : undefined}
          required
        />
      ) : (
        <Entrada
          id={id}
          name="idTipoDocumentoVucem"
          placeholder="idTipoDocumento"
          defaultValue={estado.valores?.idTipoDocumentoVucem}
          maxLength={20}
          className="w-36"
          aria-invalid={errores ? true : undefined}
          required
        />
      )}
      <BotonEnviar tamano="sm" variante="secundario">
        Guardar
      </BotonEnviar>
      {(errores ?? (estado.mensaje ? [estado.mensaje] : [])).map((e) => (
        <p key={e} className={`w-full text-xs ${estado.ok ? "text-exito" : "text-peligro"}`} role={estado.ok ? "status" : "alert"}>
          {e}
        </p>
      ))}
    </form>
  );
}
