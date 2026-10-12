"use client";

import { useState } from "react";

import { Aviso, Campo, Casilla, EnlaceBoton, Entrada, MensajeFormulario } from "@/components/ui";
import { BotonEnviar } from "@/components/ui/boton-enviar";
import type { OpcionCatalogo } from "@/lib/catalogos";
import { LIMITES_ESTABLECIMIENTO as L } from "@/lib/validacion/establecimiento";

import { CampoCatalogo } from "./_compartido/campo-catalogo";
import { useFormularioAccion, type AccionFormulario } from "./_compartido/use-formulario";
import { ListaScian } from "./lista-scian";

export type ValoresEstablecimiento = {
  denominacionRazonSocial: string;
  rfcResponsableSanitario: string;
  correoElectronico: string;
  telefono: string;
  calle: string;
  numeroExterior: string | null;
  codigoPostal: string;
  entidadFederativa: string;
  municipio: string;
  colonia: string | null;
  localidad: string | null;
  noLicenciaSanitaria: string | null;
  tieneAvisoFuncionamiento: boolean;
  scian: Array<{ clave: string; descripcion: string | null }>;
};

export function FormularioEstablecimiento({
  accion,
  inicial,
  opcionesEntidad,
  opcionesScian,
  textoBoton = "Guardar",
  cancelarHref = "/establecimientos",
}: {
  accion: AccionFormulario;
  inicial: ValoresEstablecimiento;
  opcionesEntidad: OpcionCatalogo[];
  opcionesScian: OpcionCatalogo[];
  textoBoton?: string;
  cancelarHref?: string;
}) {
  const { estado, despachar, alEnviar, refMensaje } = useFormularioAccion(accion);
  const errores = estado.errores ?? {};
  const [licencia, setLicencia] = useState(inicial.noLicenciaSanitaria ?? "");
  const [aviso, setAviso] = useState(inicial.tieneAvisoFuncionamiento);
  // Lo enviado tiene prioridad (sirve si el formulario se envió sin JavaScript y hubo errores).
  const v = (k: keyof ValoresEstablecimiento) => {
    const valor = estado.valores?.[k] ?? inicial[k];
    return typeof valor === "string" ? valor : "";
  };
  const invalido = (k: string) => (errores[k] ? true : undefined);

  return (
    <form action={despachar} onSubmit={alEnviar} className="space-y-8">
      <div ref={refMensaje}>
        <MensajeFormulario estado={estado} />
      </div>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Datos del establecimiento</legend>
        <Campo
          etiqueta="Denominación o razón social"
          htmlFor="denominacionRazonSocial"
          requerido
          errores={errores.denominacionRazonSocial}
          className="sm:col-span-2"
          ayuda="Como aparece en la licencia sanitaria o en el aviso de funcionamiento."
        >
          <Entrada
            id="denominacionRazonSocial"
            name="denominacionRazonSocial"
            defaultValue={v("denominacionRazonSocial")}
            maxLength={L.denominacionRazonSocial}
            required
            aria-invalid={invalido("denominacionRazonSocial")}
          />
        </Campo>
        <Campo
          etiqueta="RFC del responsable sanitario"
          htmlFor="rfcResponsableSanitario"
          requerido
          errores={errores.rfcResponsableSanitario}
        >
          <Entrada
            id="rfcResponsableSanitario"
            name="rfcResponsableSanitario"
            defaultValue={v("rfcResponsableSanitario")}
            maxLength={13}
            autoComplete="off"
            className="font-mono uppercase"
            required
            aria-invalid={invalido("rfcResponsableSanitario")}
          />
        </Campo>
        <Campo
          etiqueta="Correo electrónico del responsable sanitario"
          htmlFor="correoElectronico"
          requerido
          errores={errores.correoElectronico}
        >
          <Entrada
            id="correoElectronico"
            name="correoElectronico"
            type="email"
            defaultValue={v("correoElectronico")}
            maxLength={L.correoElectronico}
            required
            aria-invalid={invalido("correoElectronico")}
          />
        </Campo>
        <Campo etiqueta="Teléfono del establecimiento" htmlFor="telefono" requerido errores={errores.telefono}>
          <Entrada
            id="telefono"
            name="telefono"
            type="tel"
            defaultValue={v("telefono")}
            maxLength={L.telefono}
            required
            aria-invalid={invalido("telefono")}
          />
        </Campo>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Domicilio del establecimiento</legend>
        <Campo etiqueta="Calle" htmlFor="calle" requerido errores={errores.calle} className="sm:col-span-2">
          <Entrada id="calle" name="calle" defaultValue={v("calle")} maxLength={L.calle} required aria-invalid={invalido("calle")} />
        </Campo>
        <Campo etiqueta="Número exterior" htmlFor="numeroExterior" errores={errores.numeroExterior}>
          <Entrada
            id="numeroExterior"
            name="numeroExterior"
            defaultValue={v("numeroExterior")}
            maxLength={L.numeroExterior}
            aria-invalid={invalido("numeroExterior")}
          />
        </Campo>
        <Campo etiqueta="Código postal" htmlFor="codigoPostal" requerido errores={errores.codigoPostal}>
          <Entrada
            id="codigoPostal"
            name="codigoPostal"
            defaultValue={v("codigoPostal")}
            maxLength={5}
            inputMode="numeric"
            pattern="\d{5}"
            title="5 dígitos"
            required
            aria-invalid={invalido("codigoPostal")}
          />
        </Campo>
        <Campo etiqueta="Entidad federativa" htmlFor="entidadFederativa" requerido errores={errores.entidadFederativa}>
          <CampoCatalogo
            id="entidadFederativa"
            name="entidadFederativa"
            opciones={opcionesEntidad}
            valor={inicial.entidadFederativa}
            nombreCatalogo="Entidades federativas"
            maxLength={L.entidadFederativa}
            required
            invalido={invalido("entidadFederativa")}
          />
        </Campo>
        <Campo etiqueta="Municipio o alcaldía" htmlFor="municipio" requerido errores={errores.municipio}>
          <Entrada
            id="municipio"
            name="municipio"
            defaultValue={v("municipio")}
            maxLength={L.municipio}
            required
            aria-invalid={invalido("municipio")}
          />
        </Campo>
        <Campo etiqueta="Colonia" htmlFor="colonia" errores={errores.colonia}>
          <Entrada id="colonia" name="colonia" defaultValue={v("colonia")} maxLength={L.colonia} aria-invalid={invalido("colonia")} />
        </Campo>
        <Campo etiqueta="Localidad" htmlFor="localidad" errores={errores.localidad}>
          <Entrada
            id="localidad"
            name="localidad"
            defaultValue={v("localidad")}
            maxLength={L.localidad}
            aria-invalid={invalido("localidad")}
          />
        </Campo>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-semibold">Licencia sanitaria o aviso de funcionamiento</legend>
        <p className="text-xs text-texto-suave">
          En VUCEM son excluyentes: captura el número de licencia sanitaria <strong>o</strong> marca que el establecimiento tiene
          aviso de funcionamiento.
        </p>
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
          <Campo etiqueta="Número de licencia sanitaria" htmlFor="noLicenciaSanitaria" errores={errores.noLicenciaSanitaria}>
            <Entrada
              id="noLicenciaSanitaria"
              name="noLicenciaSanitaria"
              value={licencia}
              onChange={(e) => setLicencia(e.target.value)}
              maxLength={L.noLicenciaSanitaria}
              autoComplete="off"
              aria-invalid={invalido("noLicenciaSanitaria") ?? (licencia.trim() !== "" && aviso ? true : undefined)}
            />
          </Campo>
          <Casilla
            name="tieneAvisoFuncionamiento"
            checked={aviso}
            onChange={(e) => setAviso(e.target.checked)}
            etiqueta="Tiene aviso de funcionamiento"
            className="pb-2"
          />
        </div>
        {licencia.trim() !== "" && aviso && (
          <Aviso tono="peligro">Elige solo una opción: licencia sanitaria o aviso de funcionamiento.</Aviso>
        )}
        {licencia.trim() === "" && !aviso && (
          <Aviso tono="aviso" titulo="Falta la licencia sanitaria o el aviso de funcionamiento">
            Puedes guardar así, pero COFEPRIS pide uno de los dos para el permiso de importación.
          </Aviso>
        )}
      </fieldset>

      <ListaScian inicial={inicial.scian} opciones={opcionesScian} errores={errores} />

      <div className="flex flex-wrap gap-3">
        <BotonEnviar>{textoBoton}</BotonEnviar>
        <EnlaceBoton href={cancelarHref} variante="secundario">
          Cancelar
        </EnlaceBoton>
      </div>
    </form>
  );
}
