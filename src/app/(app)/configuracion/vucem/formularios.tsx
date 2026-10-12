"use client";

import { useActionState, useState } from "react";

import { useFormularioAccion } from "@/app/(app)/establecimientos/_compartido/use-formulario";
import { Aviso, Campo, Casilla, Entrada, MensajeFormulario, cx } from "@/components/ui";
import { BotonEnviar } from "@/components/ui/boton-enviar";
import { AMBIENTES_VUCEM, type AmbienteVucem } from "@/lib/constantes";
import { ESTADO_INICIAL } from "@/lib/formularios";

import { borrarCredencialVucem, guardarConfiguracionVucem, guardarCredencialVucem } from "./acciones";

const ETIQUETA_AMBIENTE: Record<AmbienteVucem, string> = {
  SIMULADOR: "Simulador",
  PRUEBAS: "Pruebas de VUCEM",
  PRODUCCION: "Producción (VUCEM real)",
};

export function FormularioConfiguracion({
  valoresIniciales,
  ayudaAmbiente,
  urlsSimulador,
  urlDigitalizacionOficial,
  namespaceManual,
  ambienteGuardado,
}: {
  valoresIniciales: Record<string, string>;
  ayudaAmbiente: Record<AmbienteVucem, string>;
  urlsSimulador: { solicitud: string; digitalizacion: string };
  urlDigitalizacionOficial: string;
  namespaceManual: string;
  ambienteGuardado: AmbienteVucem;
}) {
  const { estado, despachar, alEnviar, refMensaje } = useFormularioAccion(guardarConfiguracionVucem);
  const valores = estado.valores ?? valoresIniciales;
  const [ambiente, setAmbiente] = useState<AmbienteVucem>((valores.ambiente as AmbienteVucem) || "SIMULADOR");
  const errores = estado.errores ?? {};
  const v = (k: string) => valores[k] ?? "";
  const simulador = ambiente === "SIMULADOR";

  return (
    <form action={despachar} onSubmit={alEnviar} className="space-y-6">
      <div ref={refMensaje}>
        <MensajeFormulario estado={estado} />
      </div>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold">Ambiente</legend>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {AMBIENTES_VUCEM.map((a) => (
            <label
              key={a}
              className={cx(
                "flex cursor-pointer gap-3 rounded-md border px-3 py-3 text-sm",
                ambiente === a ? "border-primario bg-primario-suave" : "border-borde",
              )}
            >
              <input
                type="radio"
                name="ambiente"
                value={a}
                checked={ambiente === a}
                onChange={() => setAmbiente(a)}
                className="mt-1 accent-[var(--primario)]"
              />
              <span>
                <span className="block font-medium">{ETIQUETA_AMBIENTE[a]}</span>
                <span className="mt-1 block text-xs text-texto-suave">{ayudaAmbiente[a]}</span>
              </span>
            </label>
          ))}
        </div>
        {errores.ambiente?.map((e) => (
          <p key={e} className="text-xs text-peligro" role="alert">
            {e}
          </p>
        ))}
        {ambiente === "PRODUCCION" && ambienteGuardado !== "PRODUCCION" && (
          <Aviso tono="aviso" titulo="Vas a cambiar a PRODUCCIÓN">
            <Casilla
              name="confirmarProduccion"
              etiqueta="Entiendo que lo que se envíe desde ahora queda presentado ante COFEPRIS en VUCEM real."
            />
            {errores.confirmarProduccion?.map((e) => (
              <p key={e} className="mt-1 text-xs text-peligro" role="alert">
                {e}
              </p>
            ))}
          </Aviso>
        )}
        {simulador && (
          <Aviso tono="info" titulo="En modo simulador se usan estas URLs internas">
            <ul className="list-disc space-y-1 pl-5 font-mono text-xs break-all">
              <li>WS 260211: {urlsSimulador.solicitud}</li>
              <li>Digitalización: {urlsSimulador.digitalizacion}</li>
            </ul>
            <p className="mt-2 text-xs">
              Las URLs de abajo se guardan pero no se usan hasta que cambies a Pruebas o Producción. Si no capturas la contraseña de
              servicios web, el simulador acepta la suya (variable VUCEM_SIMULADOR_PASSWORD).
            </p>
          </Aviso>
        )}
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-semibold">Servicio web del trámite 260211</legend>
        <Campo
          etiqueta="URL del WS 260211"
          htmlFor="urlSolicitud"
          errores={errores.urlSolicitud}
          className="sm:col-span-2"
          ayuda="Endpoint https del servicio (viene en el WSDL). Obligatorio para Pruebas y Producción."
        >
          <Entrada id="urlSolicitud" name="urlSolicitud" type="url" defaultValue={v("urlSolicitud")} placeholder="https://…" />
        </Campo>
        <Campo
          etiqueta="Operación"
          htmlFor="operacionSolicitud"
          errores={errores.operacionSolicitud}
          ayuda="Nombre del elemento dentro del Body (el manual lo llama «nombreDelServicio»)."
        >
          <Entrada id="operacionSolicitud" name="operacionSolicitud" defaultValue={v("operacionSolicitud")} maxLength={100} autoComplete="off" />
        </Campo>
        <Campo etiqueta="SOAPAction / wsa:Action" htmlFor="soapActionSolicitud" errores={errores.soapActionSolicitud} ayuda="Si se deja vacío no se envían encabezados WS-Addressing.">
          <Entrada id="soapActionSolicitud" name="soapActionSolicitud" defaultValue={v("soapActionSolicitud")} maxLength={300} autoComplete="off" />
        </Campo>
        <Campo
          etiqueta="Namespace (prefijo ws:)"
          htmlFor="namespaceSolicitud"
          errores={errores.namespaceSolicitud}
          className="sm:col-span-2"
          ayuda={`Si se deja vacío se usa el del manual: ${namespaceManual}`}
        >
          <Entrada id="namespaceSolicitud" name="namespaceSolicitud" defaultValue={v("namespaceSolicitud")} maxLength={300} autoComplete="off" />
        </Campo>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-semibold">Digitalización de documentos (eDocument)</legend>
        <Campo
          etiqueta="URL del servicio de digitalización"
          htmlFor="urlDigitalizacion"
          errores={errores.urlDigitalizacion}
          className="sm:col-span-2"
          ayuda={`Si se deja vacío, en Producción se usa la oficial: ${urlDigitalizacionOficial}`}
        >
          <Entrada id="urlDigitalizacion" name="urlDigitalizacion" type="url" defaultValue={v("urlDigitalizacion")} placeholder="https://…" />
        </Campo>
        <Campo
          etiqueta="Correo para digitalización"
          htmlFor="correoDigitalizacion"
          errores={errores.correoDigitalizacion}
          ayuda="Viaja en la petición y forma parte de la cadena que se firma. Si se deja vacío se usa el correo de la empresa."
        >
          <Entrada id="correoDigitalizacion" name="correoDigitalizacion" type="email" defaultValue={v("correoDigitalizacion")} maxLength={320} />
        </Campo>
      </fieldset>

      <BotonEnviar>Guardar configuración</BotonEnviar>
    </form>
  );
}

export function FormularioCredencial({ usuarioSugerido, hayCredencial }: { usuarioSugerido: string; hayCredencial: boolean }) {
  const [estado, accion] = useActionState(guardarCredencialVucem, ESTADO_INICIAL);
  const [abierto, setAbierto] = useState(!hayCredencial);
  const errores = estado.errores ?? {};

  if (!abierto) {
    return (
      <div className="space-y-3">
        <MensajeFormulario estado={estado} />
        <button type="button" className="text-sm font-medium text-primario hover:underline" onClick={() => setAbierto(true)}>
          Reemplazar contraseña
        </button>
      </div>
    );
  }

  return (
    <form action={accion} className="space-y-4" autoComplete="off">
      <MensajeFormulario estado={estado} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo etiqueta="Usuario (RFC)" htmlFor="usuarioWs" requerido errores={errores.usuarioWs} ayuda="Normalmente el RFC del solicitante.">
          <Entrada
            id="usuarioWs"
            name="usuarioWs"
            defaultValue={estado.valores?.usuarioWs ?? usuarioSugerido}
            maxLength={13}
            className="uppercase"
            autoComplete="off"
            required
          />
        </Campo>
        <Campo
          etiqueta="Contraseña de servicios web"
          htmlFor="password"
          requerido
          errores={errores.password}
          ayuda="Se guarda cifrada y nunca se vuelve a mostrar."
        >
          <Entrada id="password" name="password" type="password" autoComplete="new-password" required />
        </Campo>
      </div>
      <div className="flex flex-wrap gap-2">
        <BotonEnviar>{hayCredencial ? "Reemplazar contraseña" : "Guardar contraseña"}</BotonEnviar>
        {hayCredencial && (
          <button type="button" className="text-sm text-texto-suave hover:underline" onClick={() => setAbierto(false)}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

export function FormularioBorrarCredencial() {
  const [estado, accion] = useActionState(borrarCredencialVucem, ESTADO_INICIAL);
  return (
    <form
      action={accion}
      onSubmit={(e) => {
        if (!window.confirm("¿Borrar la contraseña de servicios web? No podrás enviar a VUCEM hasta capturarla de nuevo.")) e.preventDefault();
      }}
      className="space-y-2"
    >
      <MensajeFormulario estado={estado} />
      <BotonEnviar variante="peligro" tamano="sm" textoEnviando="Borrando…">
        Borrar contraseña
      </BotonEnviar>
    </form>
  );
}
