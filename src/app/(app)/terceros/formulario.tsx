"use client";

import { useState } from "react";

import { Campo, EnlaceBoton, Entrada, MensajeFormulario, Selector } from "@/components/ui";
import { BotonEnviar } from "@/components/ui/boton-enviar";
import type { OpcionCatalogo } from "@/lib/catalogos";
import { ETIQUETA_TIPO_TERCERO, TIPOS_TERCERO } from "@/lib/constantes";
import { LIMITES_TERCERO as L } from "@/lib/validacion/tercero";

import { CampoCatalogo } from "../establecimientos/_compartido/campo-catalogo";
import { useFormularioAccion, type AccionFormulario } from "../establecimientos/_compartido/use-formulario";

export type ValoresTercero = {
  tipo: string;
  tipoPersona: string;
  nacionalidad: string;
  nombre: string | null;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  denominacionRazonSocial: string | null;
  rfc: string | null;
  curp: string | null;
  correoElectronico: string | null;
  pais: string;
  entidadFederativa: string | null;
  municipio: string | null;
  colonia: string | null;
  localidad: string | null;
  codigoPostal: string | null;
  calle: string;
  numeroExterior: string | null;
  numeroInterior: string | null;
  lada: string | null;
  telefono: string | null;
};

/**
 * Alta/edición de terceros. Muestra u oculta campos según el tipo de tercero, el tipo de persona
 * y la nacionalidad, siguiendo las reglas del Manual WS 260211 (ver src/lib/validacion/tercero.ts).
 */
export function FormularioTercero({
  accion,
  inicial,
  opcionesPais,
  opcionesEntidad,
  volver,
  textoBoton = "Guardar",
  cancelarHref = "/terceros",
}: {
  accion: AccionFormulario;
  inicial: ValoresTercero;
  opcionesPais: OpcionCatalogo[];
  opcionesEntidad: OpcionCatalogo[];
  volver?: string | null;
  textoBoton?: string;
  cancelarHref?: string;
}) {
  const { estado, despachar, alEnviar, refMensaje } = useFormularioAccion(accion);
  const errores = estado.errores ?? {};
  const [tipo, setTipo] = useState(inicial.tipo);
  const [tipoPersona, setTipoPersona] = useState(inicial.tipoPersona);
  const [nacionalidad, setNacionalidad] = useState(inicial.nacionalidad);

  const esDestinatario = tipo === "DESTINATARIO";
  const esNacional = nacionalidad === "NACIONAL";
  const esFisica = tipoPersona === "FISICA";
  const domicilioDetallado = esNacional || esDestinatario;
  // Lo enviado tiene prioridad (sirve si el formulario se envió sin JavaScript y hubo errores).
  const v = (k: keyof ValoresTercero) => estado.valores?.[k] ?? inicial[k] ?? "";
  const invalido = (k: string) => (errores[k] ? true : undefined);
  // Al cambiar de nacionalidad, la entidad cambia de catálogo a texto libre (y viceversa).
  const entidadInicial = nacionalidad === inicial.nacionalidad ? inicial.entidadFederativa : "";
  const maxEntidad = esDestinatario ? L.entidadFederativaDestinatario : L.entidadFederativa;

  return (
    <form action={despachar} onSubmit={alEnviar} className="space-y-8">
      <div ref={refMensaje}>
        <MensajeFormulario estado={estado} />
      </div>
      {volver && <input type="hidden" name="volver" value={volver} />}

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Tipo de tercero</legend>
        <Campo etiqueta="Tipo" htmlFor="tipo" requerido errores={errores.tipo}>
          <Selector id="tipo" name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-invalid={invalido("tipo")}>
            {TIPOS_TERCERO.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO_TERCERO[t]}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Tipo de persona" htmlFor="tipoPersona" requerido errores={errores.tipoPersona}>
          <Selector
            id="tipoPersona"
            name="tipoPersona"
            value={tipoPersona}
            onChange={(e) => setTipoPersona(e.target.value)}
            aria-invalid={invalido("tipoPersona")}
          >
            <option value="MORAL">Persona moral</option>
            <option value="FISICA">Persona física</option>
          </Selector>
        </Campo>
        <Campo etiqueta="Nacionalidad" htmlFor="nacionalidad" requerido errores={errores.nacionalidad}>
          <Selector
            id="nacionalidad"
            name="nacionalidad"
            value={nacionalidad}
            onChange={(e) => setNacionalidad(e.target.value)}
            aria-invalid={invalido("nacionalidad")}
          >
            <option value="NACIONAL">Nacional (México)</option>
            <option value="EXTRANJERO">Extranjero</option>
          </Selector>
        </Campo>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Datos de la persona</legend>
        {esFisica && (
          <>
            <Campo etiqueta="Nombre(s)" htmlFor="nombre" requerido errores={errores.nombre}>
              <Entrada id="nombre" name="nombre" defaultValue={v("nombre")} maxLength={L.nombre} required aria-invalid={invalido("nombre")} />
            </Campo>
            <Campo etiqueta="Apellido paterno" htmlFor="apellidoPaterno" requerido errores={errores.apellidoPaterno}>
              <Entrada
                id="apellidoPaterno"
                name="apellidoPaterno"
                defaultValue={v("apellidoPaterno")}
                maxLength={L.apellidoPaterno}
                required
                aria-invalid={invalido("apellidoPaterno")}
              />
            </Campo>
            <Campo etiqueta="Apellido materno" htmlFor="apellidoMaterno" errores={errores.apellidoMaterno}>
              <Entrada
                id="apellidoMaterno"
                name="apellidoMaterno"
                defaultValue={v("apellidoMaterno")}
                maxLength={L.apellidoMaterno}
                aria-invalid={invalido("apellidoMaterno")}
              />
            </Campo>
          </>
        )}
        {(!esFisica || esDestinatario) && (
          <Campo
            etiqueta="Denominación o razón social"
            htmlFor="denominacionRazonSocial"
            requerido
            errores={errores.denominacionRazonSocial}
            className="sm:col-span-3"
            ayuda={
              esDestinatario
                ? `VUCEM la pide siempre para el destinatario (máximo ${L.denominacionDestinatario} caracteres). Si es persona física, escribe su nombre completo.`
                : undefined
            }
          >
            <Entrada
              id="denominacionRazonSocial"
              name="denominacionRazonSocial"
              defaultValue={v("denominacionRazonSocial")}
              maxLength={esDestinatario ? L.denominacionDestinatario : L.denominacionRazonSocial}
              required
              aria-invalid={invalido("denominacionRazonSocial")}
            />
          </Campo>
        )}
        <Campo
          etiqueta="RFC"
          htmlFor="rfc"
          requerido={esNacional || esDestinatario}
          errores={errores.rfc}
          ayuda={esNacional || esDestinatario ? undefined : "Opcional para extranjeros."}
        >
          <Entrada
            id="rfc"
            name="rfc"
            defaultValue={v("rfc")}
            maxLength={13}
            autoComplete="off"
            className="font-mono uppercase"
            required={esNacional || esDestinatario}
            aria-invalid={invalido("rfc")}
          />
        </Campo>
        {esFisica && esNacional && (
          <Campo etiqueta="CURP" htmlFor="curp" errores={errores.curp}>
            <Entrada
              id="curp"
              name="curp"
              defaultValue={v("curp")}
              maxLength={18}
              autoComplete="off"
              className="font-mono uppercase"
              aria-invalid={invalido("curp")}
            />
          </Campo>
        )}
        <Campo
          etiqueta="Correo electrónico"
          htmlFor="correoElectronico"
          requerido={!esDestinatario}
          errores={errores.correoElectronico}
          className={esFisica && esNacional ? undefined : "sm:col-span-2"}
        >
          <Entrada
            id="correoElectronico"
            name="correoElectronico"
            type="email"
            defaultValue={v("correoElectronico")}
            maxLength={L.correoElectronico}
            required={!esDestinatario}
            aria-invalid={invalido("correoElectronico")}
          />
        </Campo>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Domicilio</legend>
        {esNacional ? (
          <Campo etiqueta="País" htmlFor="pais-fijo" errores={errores.pais}>
            <input type="hidden" name="pais" value="MEX" />
            <Entrada id="pais-fijo" value="México (MEX)" readOnly disabled />
          </Campo>
        ) : (
          <Campo etiqueta="País" htmlFor="pais" requerido errores={errores.pais}>
            <CampoCatalogo
              key="pais-extranjero"
              id="pais"
              name="pais"
              opciones={opcionesPais}
              valor={inicial.pais === "MEX" ? "" : inicial.pais}
              nombreCatalogo="Países"
              maxLength={3}
              required
              invalido={invalido("pais")}
            />
          </Campo>
        )}
        {esNacional ? (
          <Campo etiqueta="Entidad federativa" htmlFor="entidadFederativa" requerido errores={errores.entidadFederativa}>
            <CampoCatalogo
              key="entidad-nacional"
              id="entidadFederativa"
              name="entidadFederativa"
              opciones={opcionesEntidad}
              valor={entidadInicial}
              nombreCatalogo="Entidades federativas"
              maxLength={L.entidadFederativaCatalogo}
              required
              invalido={invalido("entidadFederativa")}
            />
          </Campo>
        ) : (
          <Campo
            etiqueta="Estado o provincia"
            htmlFor="entidadFederativa"
            requerido
            errores={errores.entidadFederativa}
            ayuda={`Clave o abreviatura, máximo ${maxEntidad} caracteres (p. ej. CA, TX, ON).`}
          >
            <Entrada
              key="entidad-extranjero"
              id="entidadFederativa"
              name="entidadFederativa"
              defaultValue={entidadInicial ?? ""}
              maxLength={maxEntidad}
              required
              className="uppercase"
              aria-invalid={invalido("entidadFederativa")}
            />
          </Campo>
        )}
        <Campo etiqueta="Código postal" htmlFor="codigoPostal" requerido={domicilioDetallado} errores={errores.codigoPostal}>
          <Entrada
            key={esNacional ? "cp-mx" : "cp-ext"}
            id="codigoPostal"
            name="codigoPostal"
            defaultValue={v("codigoPostal")}
            maxLength={esNacional ? 5 : L.codigoPostal}
            inputMode={esNacional ? "numeric" : undefined}
            pattern={esNacional ? "\\d{5}" : undefined}
            title={esNacional ? "5 dígitos" : undefined}
            required={domicilioDetallado}
            aria-invalid={invalido("codigoPostal")}
          />
        </Campo>
        {domicilioDetallado && (
          <>
            <Campo etiqueta="Municipio o alcaldía" htmlFor="municipio" requerido errores={errores.municipio}>
              <Entrada id="municipio" name="municipio" defaultValue={v("municipio")} maxLength={L.municipio} required aria-invalid={invalido("municipio")} />
            </Campo>
            <Campo etiqueta="Colonia" htmlFor="colonia" requerido errores={errores.colonia}>
              <Entrada id="colonia" name="colonia" defaultValue={v("colonia")} maxLength={L.colonia} required aria-invalid={invalido("colonia")} />
            </Campo>
            <Campo etiqueta="Localidad" htmlFor="localidad" requerido={esDestinatario} errores={errores.localidad}>
              <Entrada
                id="localidad"
                name="localidad"
                defaultValue={v("localidad")}
                maxLength={L.localidad}
                required={esDestinatario}
                aria-invalid={invalido("localidad")}
              />
            </Campo>
          </>
        )}
        <Campo etiqueta="Calle" htmlFor="calle" requerido errores={errores.calle} className="sm:col-span-3">
          <Entrada id="calle" name="calle" defaultValue={v("calle")} maxLength={L.calle} required aria-invalid={invalido("calle")} />
        </Campo>
        <Campo etiqueta="Número exterior" htmlFor="numeroExterior" requerido errores={errores.numeroExterior}>
          <Entrada
            id="numeroExterior"
            name="numeroExterior"
            defaultValue={v("numeroExterior")}
            maxLength={esDestinatario ? L.numeroExteriorDestinatario : L.numeroExterior}
            required
            aria-invalid={invalido("numeroExterior")}
          />
        </Campo>
        <Campo
          etiqueta="Número interior"
          htmlFor="numeroInterior"
          requerido={esDestinatario}
          errores={errores.numeroInterior}
          ayuda={esDestinatario ? "VUCEM lo pide para el destinatario; si no tiene, escribe S/N." : undefined}
        >
          <Entrada
            id="numeroInterior"
            name="numeroInterior"
            defaultValue={v("numeroInterior")}
            maxLength={L.numeroInterior}
            required={esDestinatario}
            aria-invalid={invalido("numeroInterior")}
          />
        </Campo>
        <div className="grid grid-cols-[5rem_1fr] gap-2">
          <Campo etiqueta="Lada" htmlFor="lada" errores={errores.lada}>
            <Entrada id="lada" name="lada" defaultValue={v("lada")} maxLength={L.lada} inputMode="tel" aria-invalid={invalido("lada")} />
          </Campo>
          <Campo etiqueta="Teléfono" htmlFor="telefono" requerido={esDestinatario} errores={errores.telefono}>
            <Entrada
              id="telefono"
              name="telefono"
              type="tel"
              defaultValue={v("telefono")}
              maxLength={L.telefono}
              required={esDestinatario}
              aria-invalid={invalido("telefono")}
            />
          </Campo>
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <BotonEnviar>{textoBoton}</BotonEnviar>
        <EnlaceBoton href={volver ?? cancelarHref} variante="secundario">
          Cancelar
        </EnlaceBoton>
      </div>
    </form>
  );
}
