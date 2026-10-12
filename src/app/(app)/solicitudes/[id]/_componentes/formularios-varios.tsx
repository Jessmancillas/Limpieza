"use client";

import { useState } from "react";

import { Campo, Casilla, Entrada, MensajeFormulario, Selector } from "@/components/ui";
import { BotonEnviar } from "@/components/ui/boton-enviar";
import type { OpcionCatalogo } from "@/lib/catalogos";

import { CampoCatalogo } from "../../../establecimientos/_compartido/campo-catalogo";
import { useAccion, type AccionFormulario } from "../../_componentes/usar-accion";

/** Agregar un tercero existente con un rol (fabricante, destinatario…). */
export function FormAgregarTercero({
  accion,
  rol,
  etiqueta,
  opciones,
  preseleccion,
}: {
  accion: AccionFormulario;
  rol: string;
  etiqueta: string;
  opciones: Array<{ id: string; nombre: string; detalle: string }>;
  preseleccion?: string;
}) {
  const { estado, despachar, alEnviar, refForm, refMensaje, err, inv } = useAccion(accion, { reiniciar: true });
  const id = `at-${rol}`;
  return (
    <form ref={refForm} action={despachar} onSubmit={alEnviar} className="space-y-2">
      <input type="hidden" name="rol" value={rol} />
      <div ref={refMensaje}>
        <MensajeFormulario estado={estado} />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Campo etiqueta={`Agregar ${etiqueta.toLowerCase()}`} htmlFor={id} errores={err("terceroId")} className="min-w-0 flex-1 sm:min-w-72">
          <Selector id={id} name="terceroId" required defaultValue={preseleccion ?? ""} aria-invalid={inv("terceroId")}>
            <option value="">Selecciona…</option>
            {opciones.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
                {o.detalle ? ` · ${o.detalle}` : ""}
              </option>
            ))}
          </Selector>
        </Campo>
        <BotonEnviar variante="secundario" textoEnviando="Agregando…">
          Agregar
        </BotonEnviar>
      </div>
    </form>
  );
}

export function FormRepresentante({
  accion,
  inicial,
  soloLectura,
}: {
  accion: AccionFormulario;
  inicial: { rlRfc: string | null; rlNombre: string | null; rlApellidoPaterno: string | null; rlApellidoMaterno: string | null };
  soloLectura: boolean;
}) {
  const { estado, despachar, alEnviar, refMensaje, err, inv } = useAccion(accion);
  const [rfc, setRfc] = useState(inicial.rlRfc ?? "");
  const fisica = rfc.trim().length === 13;
  return (
    <form action={despachar} onSubmit={alEnviar} className="space-y-4">
      <div ref={refMensaje}>
        <MensajeFormulario estado={estado} />
      </div>
      <fieldset disabled={soloLectura} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo etiqueta="RFC del representante legal" htmlFor="rl-rfc" requerido errores={err("rlRfc")} className="sm:col-span-2" ayuda="12 caracteres (moral) o 13 (física).">
          <Entrada
            id="rl-rfc"
            name="rlRfc"
            defaultValue={inicial.rlRfc ?? ""}
            maxLength={13}
            required
            autoComplete="off"
            className="uppercase sm:max-w-60"
            onChange={(e) => setRfc(e.target.value)}
            aria-invalid={inv("rlRfc")}
          />
        </Campo>
        <Campo etiqueta="Nombre" htmlFor="rl-nombre" requerido={fisica} errores={err("rlNombre")}>
          <Entrada id="rl-nombre" name="rlNombre" defaultValue={inicial.rlNombre ?? ""} maxLength={200} required={fisica} aria-invalid={inv("rlNombre")} />
        </Campo>
        <Campo etiqueta="Apellido paterno" htmlFor="rl-paterno" requerido={fisica} errores={err("rlApellidoPaterno")}>
          <Entrada
            id="rl-paterno"
            name="rlApellidoPaterno"
            defaultValue={inicial.rlApellidoPaterno ?? ""}
            maxLength={200}
            required={fisica}
            aria-invalid={inv("rlApellidoPaterno")}
          />
        </Campo>
        <Campo etiqueta="Apellido materno" htmlFor="rl-materno" errores={err("rlApellidoMaterno")}>
          <Entrada id="rl-materno" name="rlApellidoMaterno" defaultValue={inicial.rlApellidoMaterno ?? ""} maxLength={200} aria-invalid={inv("rlApellidoMaterno")} />
        </Campo>
      </fieldset>
      {!soloLectura && <BotonEnviar>Guardar representante</BotonEnviar>}
    </form>
  );
}

export function FormPago({
  accion,
  inicial,
  opcionesBanco,
  soloLectura,
}: {
  accion: AccionFormulario;
  inicial: {
    pagoOmitido: boolean;
    claveReferencia: string | null;
    cadenaDependencia: string | null;
    cveBanco: string | null;
    llavePago: string | null;
    /** aaaa-mm-dd */
    fechaPago: string;
    importePago: string | null;
  };
  opcionesBanco: OpcionCatalogo[];
  soloLectura: boolean;
}) {
  const { estado, despachar, alEnviar, refMensaje, err, inv } = useAccion(accion);
  const [omitido, setOmitido] = useState(inicial.pagoOmitido);
  const texto = (campo: "claveReferencia" | "cadenaDependencia" | "llavePago" | "importePago", etiqueta: string, max: number, ayuda?: string) => (
    <Campo etiqueta={etiqueta} htmlFor={`pg-${campo}`} requerido errores={err(campo)} ayuda={ayuda}>
      <Entrada
        id={`pg-${campo}`}
        name={campo}
        defaultValue={inicial[campo] ?? ""}
        maxLength={max}
        required
        autoComplete="off"
        inputMode={campo === "importePago" ? "decimal" : undefined}
        aria-invalid={inv(campo)}
      />
    </Campo>
  );
  return (
    <form action={despachar} onSubmit={alEnviar} className="space-y-4">
      <div ref={refMensaje}>
        <MensajeFormulario estado={estado} />
      </div>
      <fieldset disabled={soloLectura} className="space-y-4">
        <Casilla
          name="pagoOmitido"
          checked={omitido}
          onChange={(e) => setOmitido(e.target.checked)}
          etiqueta="Esta solicitud no requiere pago de derechos"
        />
        {omitido ? (
          <div className="space-y-1">
            <Casilla
              name="confirmarOmision"
              defaultChecked={inicial.pagoOmitido}
              required
              etiqueta="Confirmo que verifiqué que el trámite está exento o que el pago no se captura en la solicitud."
            />
            {err("confirmarOmision")?.map((m) => (
              <p key={m} role="alert" className="text-xs text-peligro">
                {m}
              </p>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {texto("claveReferencia", "Clave de referencia", 9, "Hasta 9 caracteres (hoja de ayuda e5cinco).")}
            {texto("cadenaDependencia", "Cadena de la dependencia", 14, "Hasta 14 caracteres.")}
            <Campo etiqueta="Banco" htmlFor="pg-cveBanco" requerido errores={err("cveBanco")}>
              <CampoCatalogo
                id="pg-cveBanco"
                name="cveBanco"
                opciones={opcionesBanco}
                valor={inicial.cveBanco}
                nombreCatalogo="Bancos"
                maxLength={20}
                required
                invalido={!!err("cveBanco")}
              />
            </Campo>
            {texto("llavePago", "Llave de pago", 30, "Hasta 30 caracteres (aparece en el comprobante del banco).")}
            <Campo etiqueta="Fecha de pago" htmlFor="pg-fechaPago" requerido errores={err("fechaPago")}>
              <Entrada id="pg-fechaPago" name="fechaPago" type="date" defaultValue={inicial.fechaPago} required aria-invalid={inv("fechaPago")} />
            </Campo>
            {texto("importePago", "Importe pagado (pesos)", 17, "Hasta 13 enteros y 2 decimales, p. ej. 3117.00")}
          </div>
        )}
      </fieldset>
      {!soloLectura && <BotonEnviar>Guardar pago de derechos</BotonEnviar>}
    </form>
  );
}

/** Texto de la declaración bajo protesta (referencia; el portal muestra el texto oficial). */
export const TEXTO_DECLARACION =
  "Manifiesto, bajo protesta de decir verdad, que los datos asentados en esta solicitud son ciertos y que los documentos anexos son copia fiel de sus originales.";

export function FormManifiestos({
  accion,
  inicial,
  soloLectura,
}: {
  accion: AccionFormulario;
  inicial: { cveDeclaracion: boolean; informacionConfidencial: boolean };
  soloLectura: boolean;
}) {
  const { estado, despachar, alEnviar, refMensaje, err } = useAccion(accion);
  return (
    <form action={despachar} onSubmit={alEnviar} className="space-y-4">
      <div ref={refMensaje}>
        <MensajeFormulario estado={estado} />
      </div>
      <fieldset disabled={soloLectura} className="space-y-4">
        <div className="space-y-1">
          <Casilla name="cveDeclaracion" defaultChecked={inicial.cveDeclaracion} etiqueta={TEXTO_DECLARACION} />
          <p className="pl-6 text-xs text-texto-suave">Obligatoria para presentar (campo cveDeclaracion). El portal muestra el texto oficial.</p>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">¿Está de acuerdo en hacer públicos los datos o anexos?</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="publicos" value="SI" defaultChecked={!inicial.informacionConfidencial} className="size-4 accent-[var(--primario)]" />
            Sí
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="publicos" value="NO" defaultChecked={inicial.informacionConfidencial} className="size-4 accent-[var(--primario)]" />
            No (la solicitud contiene información confidencial)
          </label>
          {err("publicos")?.map((m) => (
            <p key={m} role="alert" className="text-xs text-peligro">
              {m}
            </p>
          ))}
        </fieldset>
      </fieldset>
      {!soloLectura && <BotonEnviar>Guardar manifiestos</BotonEnviar>}
    </form>
  );
}

/** Ligar un documento existente de la empresa a un requisito. */
export function FormLigarDocumento({
  accion,
  requisito,
  opciones,
  preseleccion,
}: {
  accion: AccionFormulario;
  requisito: string;
  opciones: Array<{ id: string; etiqueta: string }>;
  preseleccion?: string;
}) {
  const { estado, despachar, alEnviar, refForm, refMensaje, err, inv } = useAccion(accion, { reiniciar: true });
  const id = `ld-${requisito}`;
  return (
    <form ref={refForm} action={despachar} onSubmit={alEnviar} className="space-y-2">
      <input type="hidden" name="requisito" value={requisito} />
      <div ref={refMensaje}>
        <MensajeFormulario estado={estado} />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Campo etiqueta="Ligar documento existente" htmlFor={id} errores={err("documentoId")} className="min-w-0 flex-1 sm:min-w-72">
          <Selector id={id} name="documentoId" required defaultValue={preseleccion ?? ""} aria-invalid={inv("documentoId")}>
            <option value="">Selecciona…</option>
            {opciones.map((o) => (
              <option key={o.id} value={o.id}>
                {o.etiqueta}
              </option>
            ))}
          </Selector>
        </Campo>
        <BotonEnviar variante="secundario" textoEnviando="Ligando…">
          Ligar
        </BotonEnviar>
      </div>
    </form>
  );
}
