import type { Metadata } from "next";

import { EncabezadoPagina, Insignia, Tabla, Tarjeta, Td, Th } from "@/components/ui";
import { obtenerContexto } from "@/lib/auth/contexto";
import { ETIQUETA_ROL, ROLES, type Rol } from "@/lib/constantes";
import { db } from "@/lib/db";
import { formatoFecha } from "@/lib/formularios";
import { nombreEmpresa } from "@/lib/validacion/empresa";

import { AccionesMiembro, FormularioAgregarMiembro, FormularioCambiarPassword } from "./formularios";

export const metadata: Metadata = { title: "Usuarios" };

function comoRol(valor: string): Rol {
  return (ROLES as readonly string[]).includes(valor) ? (valor as Rol) : "CONSULTA";
}

export default async function PaginaUsuarios() {
  const ctx = await obtenerContexto();
  const esAdmin = ctx.rol === "ADMIN";
  const miembros = await db.membresia.findMany({
    where: { empresaId: ctx.empresa.id },
    include: { usuario: { select: { id: true, nombre: true, email: true, activo: true } } },
    orderBy: { creadoEn: "asc" },
  });

  return (
    <>
      <EncabezadoPagina
        titulo="Usuarios"
        descripcion={`Personas con acceso a ${nombreEmpresa(ctx.empresa)} (${ctx.empresa.rfc}).`}
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Configuración" }, { etiqueta: "Usuarios" }]}
      />

      <div className="space-y-6">
        <Tabla>
          <thead>
            <tr>
              <Th>Nombre</Th>
              <Th>Correo</Th>
              <Th>Rol</Th>
              <Th className="hidden md:table-cell">Alta</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {miembros.map((m) => {
              const esUsuarioActual = m.usuarioId === ctx.usuario.id;
              const rol = comoRol(m.rol);
              return (
                <tr key={m.id}>
                  <Td>
                    <span className="font-medium">{m.usuario.nombre}</span>
                    {esUsuarioActual && <span className="ml-1 text-texto-suave">(tú)</span>}
                    {!m.usuario.activo && (
                      <span className="ml-2">
                        <Insignia tono="peligro">Cuenta desactivada</Insignia>
                      </span>
                    )}
                  </Td>
                  <Td className="break-all">{m.usuario.email}</Td>
                  <Td>
                    {esAdmin ? (
                      <AccionesMiembro
                        membresiaId={m.id}
                        rol={rol}
                        nombre={m.usuario.nombre}
                        esUsuarioActual={esUsuarioActual}
                      />
                    ) : (
                      <Insignia tono={rol === "ADMIN" ? "primario" : "neutro"}>{ETIQUETA_ROL[rol]}</Insignia>
                    )}
                  </Td>
                  <Td className="hidden whitespace-nowrap md:table-cell">{formatoFecha(m.creadoEn)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>

        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-md border border-borde bg-superficie px-4 py-3">
            <dt className="font-medium">{ETIQUETA_ROL.ADMIN}</dt>
            <dd className="text-texto-suave">Todo, incluidos usuarios, datos de la empresa, conexión VUCEM y catálogos.</dd>
          </div>
          <div className="rounded-md border border-borde bg-superficie px-4 py-3">
            <dt className="font-medium">{ETIQUETA_ROL.CAPTURISTA}</dt>
            <dd className="text-texto-suave">Captura y edita productos, terceros, documentos y solicitudes.</dd>
          </div>
          <div className="rounded-md border border-borde bg-superficie px-4 py-3">
            <dt className="font-medium">{ETIQUETA_ROL.CONSULTA}</dt>
            <dd className="text-texto-suave">Solo puede ver la información; no modifica nada.</dd>
          </div>
        </dl>

        {esAdmin && (
          <Tarjeta
            titulo="Agregar miembro"
            descripcion="Si el correo ya tiene cuenta, solo se le da acceso a esta empresa. Si no, se crea la cuenta con una contraseña temporal."
          >
            <FormularioAgregarMiembro />
          </Tarjeta>
        )}

        <Tarjeta titulo="Cambiar mi contraseña" descripcion={`Cuenta: ${ctx.usuario.email}`}>
          <FormularioCambiarPassword />
        </Tarjeta>
      </div>
    </>
  );
}
