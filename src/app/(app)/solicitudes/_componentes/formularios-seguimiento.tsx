"use client";

import { useMemo, useState } from "react";

import { AreaTexto, Campo, Entrada, MensajeFormulario, Selector } from "@/components/ui";
import { BotonEnviar } from "@/components/ui/boton-enviar";
import { sumarDiasHabiles } from "@/lib/solicitudes/dias-habiles";
import { PLAZO_MINIMO_HABITUAL } from "@/lib/solicitudes/esquemas";

import { useAccion, type AccionFormulario } from "./usar-accion";

function fechaCorta(f: Date): string {
  return `${String(f.getUTCDate()).padStart(2, "0")}/${String(f.getUTCMonth() + 1).padStart(2, "0")}/${f.getUTCFullYear()}`;
}

/** Datos de la presentación en el portal VUCEM (folio, fecha y acuse). */
export function FormPresentacion({
  accion,
  inicial,
  textoBoton,
  hayAcuse,
}: {
  accion: AccionFormulario;
  inicial: { numeroTemporal: string; folioVucem: string; fechaPresentacion: string };
  textoBoton: string;
  hayAcuse: boolean;
}) {
  const { estado, despachar, alEnviar, refMensaje, err, inv } = useAccion(accion);
  return (
    <form action={despachar} onSubmit={alEnviar} className="space-y-4">
      <div ref={refMensaje}>
        <MensajeFormulario estado={estado} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Folio VUCEM"
          htmlFor="pr-folio"
          requerido
          errores={err("folioVucem")}
          className="sm:col-span-2"
          ayuda="Número de 25 dígitos que asigna VUCEM al firmar la solicitud (aparece en el acuse)."
        >
          <Entrada
            id="pr-folio"
            name="folioVucem"
            defaultValue={inicial.folioVucem}
            inputMode="numeric"
            pattern="\d{25}"
            maxLength={25}
            required
            autoComplete="off"
            className="font-mono"
            aria-invalid={inv("folioVucem")}
          />
        </Campo>
        <Campo etiqueta="Número temporal (opcional)" htmlFor="pr-temporal" errores={err("numeroTemporal")} ayuda="El que muestra el portal antes de firmar.">
          <Entrada id="pr-temporal" name="numeroTemporal" defaultValue={inicial.numeroTemporal} maxLength={40} autoComplete="off" aria-invalid={inv("numeroTemporal")} />
        </Campo>
        <Campo etiqueta="Fecha de presentación" htmlFor="pr-fecha" requerido errores={err("fechaPresentacion")}>
          <Entrada id="pr-fecha" name="fechaPresentacion" type="date" defaultValue={inicial.fechaPresentacion} required aria-invalid={inv("fechaPresentacion")} />
        </Campo>
        <Campo
          etiqueta="Acuse de recibo (PDF, opcional)"
          htmlFor="pr-acuse"
          errores={err("acuse")}
          className="sm:col-span-2"
          ayuda={hayAcuse ? "Ya hay un acuse guardado; si eliges otro archivo lo reemplaza." : "Máximo 15 MB."}
        >
          <Entrada id="pr-acuse" name="acuse" type="file" accept="application/pdf,.pdf" aria-invalid={inv("acuse")} />
        </Campo>
      </div>
      <BotonEnviar textoEnviando="Guardando…">{textoBoton}</BotonEnviar>
    </form>
  );
}

/** Alta de requerimiento con vista previa de la fecha límite. */
export function FormRequerimiento({
  accion,
  inhabiles,
  hoy,
}: {
  accion: AccionFormulario;
  /** Días inhábiles "aaaa-mm-dd". */
  inhabiles: string[];
  /** Hoy "aaaa-mm-dd" (México). */
  hoy: string;
}) {
  const { estado, despachar, alEnviar, refForm, refMensaje, err, inv } = useAccion(accion, { reiniciar: true });
  const [fecha, setFecha] = useState(hoy);
  const [plazo, setPlazo] = useState("10");
  const fechasInhabiles = useMemo(() => inhabiles.map((d) => new Date(`${d}T12:00:00.000Z`)), [inhabiles]);
  const n = Number(plazo);
  const vista =
    /^\d{4}-\d{2}-\d{2}$/.test(fecha) && Number.isInteger(n) && n >= 1 && n <= 365
      ? fechaCorta(sumarDiasHabiles(new Date(`${fecha}T12:00:00.000Z`), n, fechasInhabiles))
      : null;
  return (
    <form
      ref={refForm}
      action={despachar}
      onSubmit={alEnviar}
      onReset={() => {
        setFecha(hoy);
        setPlazo("10");
      }}
      className="space-y-4"
    >
      <div ref={refMensaje}>
        <MensajeFormulario estado={estado} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo etiqueta="Fecha de notificación" htmlFor="rq-fecha" requerido errores={err("fechaNotificacion")}>
          <Entrada
            id="rq-fecha"
            name="fechaNotificacion"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
            aria-invalid={inv("fechaNotificacion")}
          />
        </Campo>
        <Campo
          etiqueta="Plazo (días hábiles)"
          htmlFor="rq-plazo"
          requerido
          errores={err("plazoDiasHabiles")}
          ayuda="Lo fija la autoridad en el oficio (art. 17-A LFPA: no menor a 5 días hábiles)."
        >
          <Entrada
            id="rq-plazo"
            name="plazoDiasHabiles"
            type="number"
            min={1}
            max={365}
            step={1}
            value={plazo}
            onChange={(e) => setPlazo(e.target.value)}
            required
            aria-invalid={inv("plazoDiasHabiles")}
          />
        </Campo>
        <Campo etiqueta="Qué requiere la autoridad" htmlFor="rq-desc" requerido errores={err("descripcion")} className="sm:col-span-2">
          <AreaTexto id="rq-desc" name="descripcion" maxLength={4000} required aria-invalid={inv("descripcion")} />
        </Campo>
      </div>
      <div aria-live="polite" className="space-y-1 text-sm">
        {vista && (
          <p>
            Fecha límite calculada: <strong>{vista}</strong>
            <span className="block text-xs text-texto-suave">
              No cuentan el día de la notificación, sábados, domingos ni los días inhábiles registrados.
            </span>
          </p>
        )}
        {Number.isInteger(n) && n >= 1 && n < PLAZO_MINIMO_HABITUAL && (
          <p className="text-aviso">El plazo es menor a {PLAZO_MINIMO_HABITUAL} días hábiles: verifica que así lo indique el oficio.</p>
        )}
      </div>
      <BotonEnviar textoEnviando="Registrando…">Registrar requerimiento</BotonEnviar>
    </form>
  );
}

/** Marca un requerimiento como atendido. */
export function FormAtender({ accion, prefijo, hoy }: { accion: AccionFormulario; prefijo: string; hoy: string }) {
  const { estado, despachar, alEnviar, refMensaje, err, inv } = useAccion(accion);
  return (
    <form action={despachar} onSubmit={alEnviar} className="space-y-2">
      <div ref={refMensaje}>
        <MensajeFormulario estado={estado} />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Campo etiqueta="Fecha en que se atendió" htmlFor={`${prefijo}-fecha`} errores={err("fechaAtencion")}>
          <Entrada id={`${prefijo}-fecha`} name="fechaAtencion" type="date" defaultValue={hoy} required aria-invalid={inv("fechaAtencion")} />
        </Campo>
        <Campo etiqueta="Notas (opcional)" htmlFor={`${prefijo}-notas`} errores={err("notas")} className="min-w-0 flex-1 sm:min-w-60">
          <Entrada id={`${prefijo}-notas`} name="notas" maxLength={2000} aria-invalid={inv("notas")} />
        </Campo>
        <BotonEnviar variante="secundario" textoEnviando="Guardando…">
          Marcar atendido
        </BotonEnviar>
      </div>
    </form>
  );
}

export type ValoresResolucion = {
  sentido: string;
  numeroPermiso: string;
  fechaResolucion: string;
  vigenciaHasta: string;
  restricciones: string;
  observaciones: string;
};

/** Registro (o corrección) de la resolución, con resultado por mercancía si es parcial. */
export function FormResolucion({
  accion,
  inicial,
  partidas,
  hayDocumento,
}: {
  accion: AccionFormulario;
  inicial: ValoresResolucion;
  partidas: Array<{ id: string; nombre: string; resultado: string | null }>;
  hayDocumento: boolean;
}) {
  const { estado, despachar, alEnviar, refMensaje, err, inv } = useAccion(accion);
  const [sentido, setSentido] = useState(inicial.sentido);
  return (
    <form action={despachar} onSubmit={alEnviar} className="space-y-4">
      <div ref={refMensaje}>
        <MensajeFormulario estado={estado} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo etiqueta="Sentido" htmlFor="rs-sentido" requerido errores={err("sentido")}>
          <Selector id="rs-sentido" name="sentido" value={sentido} onChange={(e) => setSentido(e.target.value)} required aria-invalid={inv("sentido")}>
            <option value="">Selecciona…</option>
            <option value="ACEPTADA">Aceptada (permiso otorgado)</option>
            <option value="PARCIAL">Parcial (algunas mercancías)</option>
            <option value="RECHAZADA">Rechazada</option>
          </Selector>
        </Campo>
        <Campo etiqueta="Número de permiso u oficio" htmlFor="rs-numero" requerido errores={err("numeroPermiso")}>
          <Entrada id="rs-numero" name="numeroPermiso" defaultValue={inicial.numeroPermiso} maxLength={100} required autoComplete="off" aria-invalid={inv("numeroPermiso")} />
        </Campo>
        <Campo etiqueta="Fecha de la resolución" htmlFor="rs-fecha" requerido errores={err("fechaResolucion")}>
          <Entrada id="rs-fecha" name="fechaResolucion" type="date" defaultValue={inicial.fechaResolucion} required aria-invalid={inv("fechaResolucion")} />
        </Campo>
        <Campo
          etiqueta="Vigencia del permiso (opcional)"
          htmlFor="rs-vigencia"
          errores={err("vigenciaHasta")}
          ayuda="Captúrala tal como la fija COFEPRIS en la resolución; la app no la calcula."
        >
          <Entrada id="rs-vigencia" name="vigenciaHasta" type="date" defaultValue={inicial.vigenciaHasta} aria-invalid={inv("vigenciaHasta")} />
        </Campo>
        <Campo etiqueta="Restricciones" htmlFor="rs-restricciones" errores={err("restricciones")} className="sm:col-span-2">
          <AreaTexto id="rs-restricciones" name="restricciones" defaultValue={inicial.restricciones} maxLength={4000} aria-invalid={inv("restricciones")} />
        </Campo>
        <Campo etiqueta="Observaciones" htmlFor="rs-observaciones" errores={err("observaciones")} className="sm:col-span-2">
          <AreaTexto id="rs-observaciones" name="observaciones" defaultValue={inicial.observaciones} maxLength={4000} aria-invalid={inv("observaciones")} />
        </Campo>
        <Campo
          etiqueta="Resolución en PDF (opcional)"
          htmlFor="rs-documento"
          errores={err("documento")}
          className="sm:col-span-2"
          ayuda={hayDocumento ? "Ya hay un PDF guardado; si eliges otro archivo lo reemplaza." : "Máximo 15 MB."}
        >
          <Entrada id="rs-documento" name="documento" type="file" accept="application/pdf,.pdf" aria-invalid={inv("documento")} />
        </Campo>
      </div>
      {sentido === "PARCIAL" && (
        <fieldset className="space-y-2 rounded-md border border-borde p-3">
          <legend className="px-1 text-sm font-medium">Resultado por mercancía</legend>
          {partidas.map((p, i) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {i + 1}. {p.nombre}
              </span>
              <span className="flex gap-4">
                {(["ACEPTADA", "RECHAZADA"] as const).map((v) => (
                  <label key={v} className="flex items-center gap-1">
                    <input
                      type="radio"
                      name={`resultado_${p.id}`}
                      value={v}
                      defaultChecked={p.resultado === v}
                      required
                      className="size-4 accent-[var(--primario)]"
                    />
                    {v === "ACEPTADA" ? "Aceptada" : "Rechazada"}
                  </label>
                ))}
              </span>
              {err(`resultado_${p.id}`)?.map((m) => (
                <p key={m} role="alert" className="w-full text-xs text-peligro">
                  {m}
                </p>
              ))}
            </div>
          ))}
        </fieldset>
      )}
      <BotonEnviar textoEnviando="Guardando…">Guardar resolución</BotonEnviar>
    </form>
  );
}
