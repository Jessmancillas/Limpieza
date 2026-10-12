import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import type { EstadoFormulario } from "@/lib/formularios";

// Componentes de interfaz básicos (servidor o cliente). Para botones con estado de
// envío usa <BotonEnviar> de "./boton-enviar".

export function cx(...clases: Array<string | false | null | undefined>) {
  return clases.filter(Boolean).join(" ");
}

type Variante = "primario" | "secundario" | "peligro" | "fantasma";
type Tamano = "sm" | "md";

export function clasesBoton(variante: Variante = "primario", tamano: Tamano = "md") {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario",
    "disabled:cursor-not-allowed disabled:opacity-60",
    tamano === "sm" ? "px-2.5 py-1.5 text-sm" : "px-4 py-2 text-sm",
    variante === "primario" && "bg-primario text-white hover:bg-primario-hover dark:text-[#0f1419]",
    variante === "secundario" && "border border-borde bg-superficie text-texto hover:bg-fondo",
    variante === "peligro" && "bg-peligro text-white hover:opacity-90",
    variante === "fantasma" && "text-primario hover:bg-primario-suave",
  );
}

export function Boton({
  variante,
  tamano,
  className,
  ...props
}: ComponentProps<"button"> & { variante?: Variante; tamano?: Tamano }) {
  return <button type="button" className={cx(clasesBoton(variante, tamano), className)} {...props} />;
}

export function EnlaceBoton({
  variante,
  tamano,
  className,
  ...props
}: ComponentProps<typeof Link> & { variante?: Variante; tamano?: Tamano }) {
  return <Link className={cx(clasesBoton(variante, tamano), className)} {...props} />;
}

const clasesControl =
  "block w-full rounded-md border border-borde bg-superficie px-3 py-2 text-sm text-texto " +
  "placeholder:text-texto-suave/70 focus:border-primario focus:outline-none focus:ring-2 focus:ring-primario/30 " +
  "disabled:bg-fondo disabled:text-texto-suave aria-[invalid=true]:border-peligro";

export function Entrada({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(clasesControl, className)} {...props} />;
}

export function AreaTexto({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(clasesControl, "min-h-20", className)} {...props} />;
}

export function Selector({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cx(clasesControl, "pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Casilla({ etiqueta, className, ...props }: ComponentProps<"input"> & { etiqueta: ReactNode }) {
  return (
    <label className={cx("flex items-start gap-2 text-sm", className)}>
      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primario)]" {...props} />
      <span>{etiqueta}</span>
    </label>
  );
}

/** Contenedor de campo con etiqueta, ayuda y errores. */
export function Campo({
  etiqueta,
  htmlFor,
  requerido,
  ayuda,
  errores,
  className,
  children,
}: {
  etiqueta: ReactNode;
  htmlFor?: string;
  requerido?: boolean;
  ayuda?: ReactNode;
  errores?: string[];
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("space-y-1", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-texto">
        {etiqueta}
        {requerido && <span className="ml-0.5 text-peligro">*</span>}
      </label>
      {children}
      {ayuda && <p className="text-xs text-texto-suave">{ayuda}</p>}
      {errores?.map((e) => (
        <p key={e} className="text-xs text-peligro" role="alert">
          {e}
        </p>
      ))}
    </div>
  );
}

export function Tarjeta({
  titulo,
  descripcion,
  acciones,
  className,
  children,
}: {
  titulo?: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section className={cx("rounded-lg border border-borde bg-superficie shadow-sm", className)}>
      {(titulo || acciones) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-borde px-5 py-4">
          <div>
            {titulo && <h2 className="text-base font-semibold">{titulo}</h2>}
            {descripcion && <p className="mt-0.5 text-sm text-texto-suave">{descripcion}</p>}
          </div>
          {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function EncabezadoPagina({
  titulo,
  descripcion,
  acciones,
  migas,
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  migas?: Array<{ etiqueta: string; href?: string }>;
}) {
  return (
    <div className="mb-6 space-y-2">
      {migas && migas.length > 0 && (
        <nav aria-label="Ruta" className="text-xs text-texto-suave">
          {migas.map((m, i) => (
            <span key={`${m.etiqueta}-${i}`}>
              {i > 0 && <span className="mx-1">/</span>}
              {m.href ? (
                <Link href={m.href} className="hover:text-primario hover:underline">
                  {m.etiqueta}
                </Link>
              ) : (
                m.etiqueta
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
          {descripcion && <p className="mt-1 max-w-3xl text-sm text-texto-suave">{descripcion}</p>}
        </div>
        {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
      </div>
    </div>
  );
}

type Tono = "neutro" | "primario" | "exito" | "aviso" | "peligro" | "info";

const clasesTono: Record<Tono, string> = {
  neutro: "bg-fondo text-texto-suave border-borde",
  primario: "bg-primario-suave text-primario border-transparent",
  exito: "bg-exito-suave text-exito border-transparent",
  aviso: "bg-aviso-suave text-aviso border-transparent",
  peligro: "bg-peligro-suave text-peligro border-transparent",
  info: "bg-info-suave text-info border-transparent",
};

export function Insignia({ tono = "neutro", children }: { tono?: Tono; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        clasesTono[tono],
      )}
    >
      {children}
    </span>
  );
}

export function Aviso({
  tono = "info",
  titulo,
  children,
}: {
  tono?: Exclude<Tono, "neutro" | "primario">;
  titulo?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div role={tono === "peligro" ? "alert" : "status"} className={cx("rounded-md border px-4 py-3 text-sm", clasesTono[tono])}>
      {titulo && <p className="font-semibold">{titulo}</p>}
      {children && <div className={cx(titulo ? "mt-1" : null, "text-texto")}>{children}</div>}
    </div>
  );
}

/** Muestra el mensaje global de una server action. */
export function MensajeFormulario({ estado }: { estado: EstadoFormulario }) {
  if (!estado.mensaje) return null;
  return <Aviso tono={estado.ok ? "exito" : "peligro"}>{estado.mensaje}</Aviso>;
}

export function EstadoVacio({
  titulo,
  descripcion,
  accion,
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-borde bg-superficie px-6 py-10 text-center">
      <p className="font-medium">{titulo}</p>
      {descripcion && <p className="mx-auto mt-1 max-w-md text-sm text-texto-suave">{descripcion}</p>}
      {accion && <div className="mt-4 flex justify-center">{accion}</div>}
    </div>
  );
}

export function Tabla({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-borde bg-superficie">
      <table className="min-w-full divide-y divide-borde text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th scope="col" className={cx("bg-fondo px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-texto-suave", className)}>
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx("px-3 py-2 align-top", className)}>{children}</td>;
}

/** Lista de definición (etiqueta: valor) para vistas de detalle. */
export function Datos({ filas }: { filas: Array<[ReactNode, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {filas.map(([etiqueta, valor], i) => (
        <div key={i}>
          <dt className="text-xs font-medium uppercase tracking-wide text-texto-suave">{etiqueta}</dt>
          <dd className="mt-0.5 text-sm break-words">{valor ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
