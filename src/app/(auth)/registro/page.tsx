import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { Aviso } from "@/components/ui";

import { registroPermitido } from "../acciones";
import { FormularioRegistro } from "./formulario";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function PaginaRegistro() {
  await connection();
  if (!(await registroPermitido())) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <Aviso tono="aviso" titulo="El registro está cerrado">
          Pide a un administrador de tu empresa que te dé acceso desde Configuración → Usuarios.
        </Aviso>
        <p className="text-center text-sm">
          <Link href="/login" className="text-primario hover:underline">
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-borde bg-superficie p-6 shadow-sm">
      <h1 className="text-xl font-semibold">Crea tu cuenta</h1>
      <p className="mt-1 text-sm text-texto-suave">
        Darás de alta tu usuario y la empresa importadora (solicitante). Después podrás agregar más empresas y usuarios.
      </p>
      <FormularioRegistro />
    </div>
  );
}
