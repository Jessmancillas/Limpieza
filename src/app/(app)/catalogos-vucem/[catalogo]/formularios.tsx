"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Campo, Casilla, Entrada, MensajeFormulario, Selector, AreaTexto, Tabla, Td, Th } from "@/components/ui";
import { BotonEnviar } from "@/components/ui/boton-enviar";
import { ESTADO_INICIAL } from "@/lib/formularios";

import { crearRegistroCatalogo, editarRegistroCatalogo, importarCatalogoCsv, type EstadoImportacion } from "../acciones";

export function FormularioAltaClave({ catalogo }: { catalogo: string }) {
  const [estado, accion] = useActionState(crearRegistroCatalogo.bind(null, catalogo), ESTADO_INICIAL);
  const errores = estado.errores ?? {};
  const v = estado.valores ?? {};
  return (
    <form action={accion} className="space-y-4">
      <MensajeFormulario estado={estado} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Campo etiqueta="Clave" htmlFor="alta-clave" requerido errores={errores.clave}>
          <Entrada id="alta-clave" name="clave" defaultValue={v.clave} maxLength={60} autoComplete="off" required className="font-mono" />
        </Campo>
        <Campo etiqueta="Descripción" htmlFor="alta-descripcion" requerido errores={errores.descripcion} className="sm:col-span-2">
          <Entrada id="alta-descripcion" name="descripcion" defaultValue={v.descripcion} maxLength={500} required />
        </Campo>
        <Campo
          etiqueta="Clave padre"
          htmlFor="alta-padre"
          errores={errores.padreClave}
          ayuda="Solo para catálogos jerárquicos (p. ej. subclasificación → clasificación)."
        >
          <Entrada id="alta-padre" name="padreClave" defaultValue={v.padreClave} maxLength={60} autoComplete="off" className="font-mono" />
        </Campo>
        <div className="flex items-end sm:col-span-2">
          <Casilla
            name="porConfirmar"
            defaultChecked={v.porConfirmar === undefined ? true : v.porConfirmar === "on"}
            etiqueta="Por confirmar (aún no se verifica contra el catálogo oficial de VUCEM)"
          />
        </div>
      </div>
      <BotonEnviar>Agregar clave</BotonEnviar>
    </form>
  );
}

export type RegistroEditable = {
  id: string;
  clave: string;
  descripcion: string;
  padreClave: string | null;
  activo: boolean;
  porConfirmar: boolean;
};

export function FormularioEdicionClave({
  catalogo,
  registro,
  hrefCerrar,
}: {
  catalogo: string;
  registro: RegistroEditable;
  hrefCerrar: string;
}) {
  const [estado, accion] = useActionState(editarRegistroCatalogo.bind(null, catalogo, registro.id), ESTADO_INICIAL);
  const errores = estado.errores ?? {};
  const v = estado.valores;
  return (
    <form action={accion} className="space-y-4">
      <MensajeFormulario estado={estado} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Campo etiqueta="Clave" htmlFor="editar-clave" ayuda="La clave no se puede cambiar; si es incorrecta, desactívala y agrega otra.">
          <Entrada id="editar-clave" value={registro.clave} readOnly disabled className="font-mono" />
        </Campo>
        <Campo etiqueta="Descripción" htmlFor="editar-descripcion" requerido errores={errores.descripcion} className="sm:col-span-2">
          <Entrada
            id="editar-descripcion"
            name="descripcion"
            defaultValue={v?.descripcion ?? registro.descripcion}
            maxLength={500}
            required
          />
        </Campo>
        <Campo etiqueta="Clave padre" htmlFor="editar-padre" errores={errores.padreClave}>
          <Entrada
            id="editar-padre"
            name="padreClave"
            defaultValue={v?.padreClave ?? registro.padreClave ?? ""}
            maxLength={60}
            autoComplete="off"
            className="font-mono"
          />
        </Campo>
        <div className="flex flex-col justify-end gap-2 sm:col-span-2">
          <Casilla name="activo" defaultChecked={v ? v.activo === "on" : registro.activo} etiqueta="Activa (aparece en los formularios)" />
          <Casilla name="porConfirmar" defaultChecked={v ? v.porConfirmar === "on" : registro.porConfirmar} etiqueta="Por confirmar" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <BotonEnviar>Guardar cambios</BotonEnviar>
        <Link href={hrefCerrar} className="text-sm text-primario hover:underline">
          Cerrar
        </Link>
      </div>
    </form>
  );
}

const ESTADO_IMPORTACION: EstadoImportacion = { ok: false };

export function FormularioImportacion({ catalogo }: { catalogo: string }) {
  const [estado, accion] = useActionState(importarCatalogoCsv.bind(null, catalogo), ESTADO_IMPORTACION);
  // Controlados para que no se pierdan al reiniciarse el formulario tras enviar.
  const [texto, setTexto] = useState("");
  const [separador, setSeparador] = useState("auto");
  const resumen = estado.resumen;

  return (
    <form action={accion} className="space-y-4">
      <MensajeFormulario estado={estado} />
      {resumen && (
        <div className="space-y-3 rounded-md border border-borde bg-fondo px-4 py-3 text-sm" aria-live="polite">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-texto-suave">Nuevas</dt>
              <dd className="text-lg font-semibold">{resumen.insertados}</dd>
            </div>
            <div>
              <dt className="text-xs text-texto-suave">Actualizadas</dt>
              <dd className="text-lg font-semibold">{resumen.actualizados}</dd>
            </div>
            <div>
              <dt className="text-xs text-texto-suave">Desactivadas</dt>
              <dd className="text-lg font-semibold">{resumen.desactivados}</dd>
            </div>
            <div>
              <dt className="text-xs text-texto-suave">Con error</dt>
              <dd className={resumen.totalErrores > 0 ? "text-lg font-semibold text-peligro" : "text-lg font-semibold"}>
                {resumen.totalErrores}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-texto-suave">
            Separador: {resumen.separador}. {resumen.conEncabezado ? "Se omitió la primera fila (encabezado)." : "Sin encabezado."}
          </p>
          {resumen.errores.length > 0 && (
            <div className="space-y-2">
              <p className="font-medium">
                Renglones con error
                {resumen.totalErrores > resumen.errores.length && ` (se muestran ${resumen.errores.length} de ${resumen.totalErrores})`}
              </p>
              <Tabla>
                <thead>
                  <tr>
                    <Th className="w-24">Renglón</Th>
                    <Th>Problema</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {resumen.errores.map((e, i) => (
                    <tr key={`${e.renglon}-${i}`}>
                      <Td className="font-mono">{e.renglon}</Td>
                      <Td>{e.mensaje}</Td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Archivo CSV"
          htmlFor="importar-archivo"
          ayuda="UTF-8, máximo 5 MB. Si eliges un archivo, se ignora el texto pegado."
        >
          <Entrada id="importar-archivo" name="archivo" type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" />
        </Campo>
        <Campo etiqueta="Separador" htmlFor="importar-separador">
          <Selector id="importar-separador" name="separador" value={separador} onChange={(e) => setSeparador(e.target.value)}>
            <option value="auto">Detectar automáticamente</option>
            <option value="coma">Coma ( , )</option>
            <option value="puntoycoma">Punto y coma ( ; )</option>
            <option value="tabulador">Tabulador (copiado de Excel)</option>
          </Selector>
        </Campo>
        <Campo
          etiqueta="O pega el contenido"
          htmlFor="importar-texto"
          className="sm:col-span-2"
          ayuda="Una clave por renglón: clave, descripción y, opcionalmente, clave padre. La primera fila puede ser encabezado."
        >
          <AreaTexto
            id="importar-texto"
            name="texto"
            rows={6}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={"clave,descripcion,padreClave\n470,Aeropuerto Internacional de la Ciudad de México,"}
            className="font-mono text-xs"
            spellCheck={false}
          />
        </Campo>
      </div>
      <Casilla
        name="desactivarAusentes"
        etiqueta="Desactivar las claves que no vengan en el archivo (úsalo al cargar el catálogo oficial completo; no se aplica si hay renglones con error)"
      />
      <p className="text-xs text-texto-suave">
        Las claves importadas quedan como confirmadas (fuente «Importado»). Las existentes se actualizan y se reactivan.
      </p>
      <BotonEnviar textoEnviando="Importando…">Importar</BotonEnviar>
    </form>
  );
}
