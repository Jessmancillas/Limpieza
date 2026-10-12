import Link from "next/link";

import { Navegacion, type ElementoNav } from "@/components/layout/navegacion";
import { obtenerContexto } from "@/lib/auth/contexto";
import { ETIQUETA_ROL } from "@/lib/constantes";
import { nombreEmpresa } from "@/lib/validacion/empresa";

import { cambiarEmpresa, salir } from "./acciones-sesion";

const NAV: ElementoNav[] = [
  { href: "/", etiqueta: "Inicio" },
  { href: "/solicitudes", etiqueta: "Solicitudes", grupo: "Trámite 260211" },
  { href: "/documentos", etiqueta: "Documentos", grupo: "Trámite 260211" },
  { href: "/productos", etiqueta: "Productos", grupo: "Catálogos" },
  { href: "/terceros", etiqueta: "Terceros", grupo: "Catálogos" },
  { href: "/establecimientos", etiqueta: "Establecimientos", grupo: "Catálogos" },
  { href: "/catalogos-vucem", etiqueta: "Catálogos VUCEM", grupo: "Catálogos" },
  { href: "/configuracion/empresa", etiqueta: "Empresa", grupo: "Configuración" },
  { href: "/configuracion/vucem", etiqueta: "Conexión VUCEM", grupo: "Configuración" },
  { href: "/configuracion/usuarios", etiqueta: "Usuarios", grupo: "Configuración" },
  { href: "/configuracion/bitacora", etiqueta: "Bitácora", grupo: "Configuración" },
];

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const ctx = await obtenerContexto();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="no-imprimir border-b border-borde bg-superficie lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-r lg:border-b-0">
        <div className="px-4 py-4">
          <Link href="/" className="block">
            <span className="text-sm font-semibold uppercase tracking-widest text-primario">Permisos COFEPRIS</span>
            <span className="block text-xs text-texto-suave">VUCEM 260211 · Dispositivos médicos</span>
          </Link>
        </div>
        <div className="px-3 pb-4">
          <Navegacion elementos={NAV} />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="no-imprimir flex flex-wrap items-center justify-between gap-3 border-b border-borde bg-superficie px-4 py-2 sm:px-6">
          <form action={cambiarEmpresa} className="flex items-center gap-2">
            <label htmlFor="empresaId" className="text-xs text-texto-suave">
              Empresa
            </label>
            <select
              id="empresaId"
              name="empresaId"
              defaultValue={ctx.empresa.id}
              className="max-w-[16rem] rounded-md border border-borde bg-superficie px-2 py-1 text-sm"
            >
              {ctx.membresias.map((m) => (
                <option key={m.empresaId} value={m.empresaId}>
                  {nombreEmpresa(m.empresa)} ({m.empresa.rfc})
                </option>
              ))}
            </select>
            {ctx.membresias.length > 1 && (
              <button type="submit" className="rounded-md border border-borde px-2 py-1 text-xs hover:bg-fondo">
                Cambiar
              </button>
            )}
            <Link href="/empresas/nueva" className="text-xs text-primario hover:underline">
              + Empresa
            </Link>
          </form>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-texto-suave">
              {ctx.usuario.nombre} · {ETIQUETA_ROL[ctx.rol]}
            </span>
            <form action={salir}>
              <button type="submit" className="rounded-md px-2 py-1 text-xs text-texto-suave hover:bg-fondo hover:text-texto">
                Cerrar sesión
              </button>
            </form>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
