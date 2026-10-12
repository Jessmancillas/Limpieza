import type { Metadata } from "next";
import Link from "next/link";

import { requerirUsuario } from "@/lib/auth/contexto";
import { db } from "@/lib/db";

import { FormularioNuevaEmpresa } from "./formulario";

export const metadata: Metadata = { title: "Nueva empresa" };

export default async function PaginaNuevaEmpresa() {
  const sesion = await requerirUsuario();
  const tieneEmpresas = (await db.membresia.count({ where: { usuarioId: sesion.usuarioId } })) > 0;
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      {tieneEmpresas && (
        <Link href="/" className="text-sm text-primario hover:underline">
          ← Volver
        </Link>
      )}
      <div className="mt-4 rounded-lg border border-borde bg-superficie p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Agregar empresa importadora</h1>
        <p className="mt-1 text-sm text-texto-suave">
          Cada empresa (RFC) tiene sus propios establecimientos, productos, documentos y solicitudes. Quedarás como
          administrador.
        </p>
        <FormularioNuevaEmpresa />
      </div>
    </main>
  );
}
