import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/lib/auth/session";

import { registroPermitido } from "../acciones";
import { FormularioLogin } from "./formulario";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function PaginaLogin() {
  if (await obtenerSesion()) redirect("/");
  const puedeRegistrarse = await registroPermitido();
  return (
    <div className="mx-auto max-w-md rounded-lg border border-borde bg-superficie p-6 shadow-sm">
      <h1 className="text-xl font-semibold">Iniciar sesión</h1>
      <p className="mt-1 text-sm text-texto-suave">Entra con el correo y contraseña de esta app (no con tu e.firma).</p>
      <FormularioLogin />
      {puedeRegistrarse && (
        <p className="mt-6 text-center text-sm text-texto-suave">
          ¿Primera vez?{" "}
          <Link href="/registro" className="font-medium text-primario hover:underline">
            Crea tu cuenta y tu empresa
          </Link>
        </p>
      )}
    </div>
  );
}
