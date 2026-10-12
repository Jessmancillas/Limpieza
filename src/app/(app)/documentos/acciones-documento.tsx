"use client";

import { useActionState, useState } from "react";

import { MensajeFormulario } from "@/components/ui";
import { BotonEnviar } from "@/components/ui/boton-enviar";
import { ESTADO_INICIAL } from "@/lib/formularios";
import { ACCEPT_SUBIDA, formatoBytes, MAX_BYTES_SUBIDA, MAX_MB_SUBIDA } from "@/lib/pdf/limites";

import type { AccionFormulario } from "../establecimientos/_compartido/use-formulario";

/** Re-convertir, reemplazar el archivo y eliminar un documento. */
export function AccionesDocumento({
  nombre,
  tieneEDocument,
  bloqueadoPorSolicitudes,
  enSolicitudes,
  accionReconvertir,
  accionReemplazar,
  accionEliminar,
}: {
  nombre: string;
  /** Ya se digitalizó o se está digitalizando (cambiar el PDF invalida ese eDocument). */
  tieneEDocument: boolean;
  /** Mensaje si el archivo no se puede cambiar (ya se presentó en una solicitud). */
  bloqueadoPorSolicitudes: string | null;
  /** Número de solicitudes donde se usa (si hay alguna no se puede eliminar). */
  enSolicitudes: number;
  accionReconvertir: AccionFormulario;
  accionReemplazar: AccionFormulario;
  accionEliminar: AccionFormulario;
}) {
  const [estadoReconvertir, reconvertir] = useActionState(accionReconvertir, ESTADO_INICIAL);
  const [estadoReemplazar, reemplazar] = useActionState(accionReemplazar, ESTADO_INICIAL);
  const [estadoEliminar, eliminar] = useActionState(accionEliminar, ESTADO_INICIAL);
  const [problemaArchivo, setProblemaArchivo] = useState<string | null>(null);
  const avisoEDoc = tieneEDocument ? " El eDocument actual se descartará y habrá que volver a digitalizarlo." : "";

  return (
    <div className="space-y-6">
      <section className="space-y-2" aria-labelledby="titulo-reconvertir">
        <h3 id="titulo-reconvertir" className="text-sm font-semibold">
          Volver a convertir
        </h3>
        <p className="text-xs text-texto-suave">Genera otra vez el PDF para VUCEM a partir del original con los límites vigentes del trámite.</p>
        <MensajeFormulario estado={estadoReconvertir} />
        <form
          action={reconvertir}
          onSubmit={(e) => {
            if (tieneEDocument && !window.confirm(`¿Volver a convertir «${nombre}»? Si el PDF cambia,${avisoEDoc.toLowerCase()}`)) {
              e.preventDefault();
            }
          }}
        >
          <BotonEnviar variante="secundario" tamano="sm" textoEnviando="Convirtiendo…" disabled={Boolean(bloqueadoPorSolicitudes)}>
            Re-convertir
          </BotonEnviar>
        </form>
      </section>

      <section className="space-y-2" aria-labelledby="titulo-reemplazar">
        <h3 id="titulo-reemplazar" className="text-sm font-semibold">
          Reemplazar archivo
        </h3>
        <p className="text-xs text-texto-suave">
          Sube otro archivo para este mismo documento (por ejemplo, un escaneo más legible). Máximo {MAX_MB_SUBIDA} MB.
        </p>
        <MensajeFormulario estado={estadoReemplazar} />
        <form
          action={reemplazar}
          className="space-y-2"
          onSubmit={(e) => {
            if (!window.confirm(`¿Reemplazar el archivo de «${nombre}»?${avisoEDoc}`)) e.preventDefault();
          }}
        >
          <label htmlFor="archivo-reemplazo" className="sr-only">
            Archivo nuevo
          </label>
          <input
            id="archivo-reemplazo"
            name="archivo"
            type="file"
            accept={ACCEPT_SUBIDA}
            required
            disabled={Boolean(bloqueadoPorSolicitudes)}
            aria-invalid={problemaArchivo ? true : undefined}
            aria-describedby={problemaArchivo ? "archivo-reemplazo-error" : undefined}
            className="block w-full text-sm text-texto file:mr-3 file:rounded-md file:border file:border-borde file:bg-superficie file:px-3 file:py-1.5 file:text-sm hover:file:bg-fondo"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              const problema = f && f.size > MAX_BYTES_SUBIDA ? `El archivo pesa ${formatoBytes(f.size)}; el máximo es ${MAX_MB_SUBIDA} MB.` : null;
              e.currentTarget.setCustomValidity(problema ?? "");
              setProblemaArchivo(problema);
            }}
          />
          {problemaArchivo && (
            <p id="archivo-reemplazo-error" className="text-xs text-peligro" role="alert">
              {problemaArchivo}
            </p>
          )}
          <BotonEnviar variante="secundario" tamano="sm" textoEnviando="Subiendo y convirtiendo…" disabled={Boolean(bloqueadoPorSolicitudes)}>
            Reemplazar
          </BotonEnviar>
        </form>
      </section>

      {bloqueadoPorSolicitudes && <p className="text-xs text-aviso">{bloqueadoPorSolicitudes}</p>}

      <section className="space-y-2" aria-labelledby="titulo-eliminar">
        <h3 id="titulo-eliminar" className="text-sm font-semibold">
          Eliminar
        </h3>
        <MensajeFormulario estado={estadoEliminar} />
        {enSolicitudes > 0 ? (
          <p className="text-xs text-texto-suave">
            Se usa en {enSolicitudes} solicitud{enSolicitudes === 1 ? "" : "es"}: quítalo de ella{enSolicitudes === 1 ? "" : "s"} para
            poder eliminarlo.
          </p>
        ) : (
          <form
            action={eliminar}
            onSubmit={(e) => {
              if (!window.confirm(`¿Eliminar «${nombre}» y sus archivos? Esta acción no se puede deshacer.`)) e.preventDefault();
            }}
          >
            <BotonEnviar variante="peligro" tamano="sm" textoEnviando="Eliminando…">
              Eliminar documento
            </BotonEnviar>
          </form>
        )}
      </section>
    </div>
  );
}
