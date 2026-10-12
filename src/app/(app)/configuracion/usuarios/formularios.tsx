"use client";

import { useActionState } from "react";

import { Aviso, Campo, Entrada, MensajeFormulario, Selector } from "@/components/ui";
import { BotonEnviar } from "@/components/ui/boton-enviar";
import { BotonCopiar } from "@/components/ui/copiar";
import { ETIQUETA_ROL, ROLES, type Rol } from "@/lib/constantes";
import { ESTADO_INICIAL } from "@/lib/formularios";

import { agregarMiembro, cambiarMiPassword, cambiarRol, quitarMiembro, type EstadoAltaMiembro } from "./acciones";

const ESTADO_ALTA: EstadoAltaMiembro = { ok: false };

export function FormularioAgregarMiembro() {
  const [estado, accion] = useActionState(agregarMiembro, ESTADO_ALTA);
  const errores = estado.errores ?? {};
  const v = estado.valores ?? {};
  return (
    <form action={accion} className="space-y-4">
      {estado.passwordTemporal ? (
        <Aviso tono="exito" titulo={estado.mensaje}>
          <p>
            Contraseña temporal para <strong>{estado.correoNuevo}</strong>. Cópiala y entrégala por un medio seguro:{" "}
            <strong>no se volverá a mostrar</strong>. Pide al usuario que la cambie al entrar (en esta misma página).
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded border border-borde bg-superficie px-2 py-1 font-mono text-base tracking-wider select-all">
              {estado.passwordTemporal}
            </code>
            <BotonCopiar valor={estado.passwordTemporal} etiqueta="Copiar contraseña" />
          </p>
        </Aviso>
      ) : (
        <MensajeFormulario estado={estado} />
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Campo etiqueta="Correo electrónico" htmlFor="miembro-email" requerido errores={errores.email}>
          <Entrada id="miembro-email" name="email" type="email" defaultValue={v.email} autoComplete="off" required maxLength={320} />
        </Campo>
        <Campo
          etiqueta="Nombre"
          htmlFor="miembro-nombre"
          errores={errores.nombre}
          ayuda="Solo si aún no tiene cuenta."
        >
          <Entrada id="miembro-nombre" name="nombre" defaultValue={v.nombre} autoComplete="off" maxLength={120} />
        </Campo>
        <Campo etiqueta="Rol" htmlFor="miembro-rol" requerido errores={errores.rol}>
          <Selector id="miembro-rol" name="rol" defaultValue={v.rol ?? "CAPTURISTA"}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ETIQUETA_ROL[r]}
              </option>
            ))}
          </Selector>
        </Campo>
      </div>
      <BotonEnviar textoEnviando="Agregando…">Agregar a la empresa</BotonEnviar>
    </form>
  );
}

/** Cambio de rol y baja de un miembro (solo administradores). */
export function AccionesMiembro({
  membresiaId,
  rol,
  nombre,
  esUsuarioActual,
}: {
  membresiaId: string;
  rol: Rol;
  nombre: string;
  esUsuarioActual: boolean;
}) {
  const [estadoRol, accionRol] = useActionState(cambiarRol, ESTADO_INICIAL);
  const [estadoQuitar, accionQuitar] = useActionState(quitarMiembro, ESTADO_INICIAL);
  const idSelector = `rol-${membresiaId}`;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <form action={accionRol} className="flex items-center gap-2">
          <input type="hidden" name="membresiaId" value={membresiaId} />
          <label htmlFor={idSelector} className="sr-only">
            Rol de {nombre}
          </label>
          <Selector id={idSelector} name="rol" defaultValue={rol} className="w-auto py-1">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ETIQUETA_ROL[r]}
              </option>
            ))}
          </Selector>
          <BotonEnviar variante="secundario" tamano="sm" textoEnviando="…" aria-label={`Guardar rol de ${nombre}`}>
            Guardar
          </BotonEnviar>
        </form>
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-md px-2 py-1 text-sm text-peligro hover:bg-peligro-suave">
            {esUsuarioActual ? "Salir de la empresa" : "Quitar"}
          </summary>
          <form
            action={accionQuitar}
            className="mt-2 space-y-2 rounded-md border border-borde bg-superficie p-3 text-sm shadow-sm sm:absolute sm:right-0 sm:z-10 sm:w-72"
          >
            <input type="hidden" name="membresiaId" value={membresiaId} />
            <p>
              {esUsuarioActual
                ? "Perderás el acceso a esta empresa. ¿Continuar?"
                : `¿Quitar a ${nombre} de la empresa? Su cuenta seguirá existiendo, pero ya no verá los datos de esta empresa.`}
            </p>
            <BotonEnviar variante="peligro" tamano="sm" textoEnviando="Quitando…">
              Sí, quitar
            </BotonEnviar>
          </form>
        </details>
      </div>
      <MensajeCorto estado={estadoRol} />
      <MensajeCorto estado={estadoQuitar} />
    </div>
  );
}

function MensajeCorto({ estado }: { estado: { ok: boolean; mensaje?: string } }) {
  if (!estado.mensaje) return null;
  return (
    <p role={estado.ok ? "status" : "alert"} className={estado.ok ? "text-xs text-exito" : "text-xs text-peligro"}>
      {estado.mensaje}
    </p>
  );
}

export function FormularioCambiarPassword() {
  const [estado, accion] = useActionState(cambiarMiPassword, ESTADO_INICIAL);
  const errores = estado.errores ?? {};
  return (
    <form action={accion} className="space-y-4">
      <MensajeFormulario estado={estado} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Campo etiqueta="Contraseña actual" htmlFor="password-actual" requerido errores={errores.actual}>
          <Entrada id="password-actual" name="actual" type="password" autoComplete="current-password" required />
        </Campo>
        <Campo etiqueta="Nueva contraseña" htmlFor="password-nueva" requerido errores={errores.nueva} ayuda="Mínimo 10 caracteres.">
          <Entrada id="password-nueva" name="nueva" type="password" autoComplete="new-password" minLength={10} required />
        </Campo>
        <Campo etiqueta="Confirma la nueva contraseña" htmlFor="password-confirmacion" requerido errores={errores.confirmacion}>
          <Entrada id="password-confirmacion" name="confirmacion" type="password" autoComplete="new-password" required />
        </Campo>
      </div>
      <BotonEnviar textoEnviando="Actualizando…">Cambiar contraseña</BotonEnviar>
    </form>
  );
}
