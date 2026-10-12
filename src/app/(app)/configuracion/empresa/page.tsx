import type { Metadata } from "next";

import { Aviso, Datos, EncabezadoPagina, Tarjeta } from "@/components/ui";
import { obtenerContexto } from "@/lib/auth/contexto";
import { db } from "@/lib/db";
import { formatoFecha } from "@/lib/formularios";
import { nombreEmpresa } from "@/lib/validacion/empresa";

import { FormularioEmpresa } from "./formulario";

export const metadata: Metadata = { title: "Empresa" };

const CAMPOS = [
  "rfc",
  "tipoPersona",
  "razonSocial",
  "nombre",
  "apellidoPaterno",
  "apellidoMaterno",
  "curp",
  "actividadProductiva",
  "correoElectronico",
  "telefono",
  "calle",
  "numeroExterior",
  "numeroInterior",
  "codigoPostal",
  "colonia",
  "localidad",
  "municipio",
  "entidadFederativa",
  "pais",
] as const;

export default async function PaginaEmpresa() {
  const ctx = await obtenerContexto();
  // Se relee para no depender del objeto memorizado del contexto.
  const empresa = await db.empresa.findUniqueOrThrow({ where: { id: ctx.empresa.id } });
  const presentadas = await db.solicitud.count({ where: { empresaId: empresa.id, folioVucem: { not: null } } });
  const esAdmin = ctx.rol === "ADMIN";

  const valores = Object.fromEntries(CAMPOS.map((c) => [c, empresa[c] ?? ""])) as Record<string, string>;
  const domicilio = [
    [empresa.calle, empresa.numeroExterior, empresa.numeroInterior && `int. ${empresa.numeroInterior}`].filter(Boolean).join(" "),
    empresa.colonia,
    empresa.localidad,
    empresa.municipio,
    empresa.entidadFederativa,
    empresa.codigoPostal && `C.P. ${empresa.codigoPostal}`,
    empresa.pais,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <EncabezadoPagina
        titulo="Datos de la empresa"
        descripcion="Datos del solicitante tal como están registrados en VUCEM. Se usan en cada solicitud y en la cadena original que se firma con la e.firma."
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Configuración" }, { etiqueta: "Empresa" }]}
      />

      <div className="space-y-6">
        {esAdmin ? (
          <>
            {presentadas > 0 && (
              <Aviso tono="aviso" titulo="El RFC ya no se puede cambiar">
                Esta empresa tiene {presentadas} solicitud(es) presentada(s) ante VUCEM con el RFC {empresa.rfc}. Si el
                RFC cambió, da de alta una empresa nueva.
              </Aviso>
            )}
            <Tarjeta>
              <FormularioEmpresa valoresIniciales={valores} />
            </Tarjeta>
            <p className="text-xs text-texto-suave">
              Alta: {formatoFecha(empresa.creadoEn)} · Última modificación: {formatoFecha(empresa.actualizadoEn)}
            </p>
          </>
        ) : (
          <>
            <Aviso tono="info">Solo un administrador de la empresa puede modificar estos datos.</Aviso>
            <Tarjeta titulo={nombreEmpresa(empresa)}>
              <Datos
                filas={[
                  ["RFC", empresa.rfc],
                  ["Tipo de persona", empresa.tipoPersona === "MORAL" ? "Moral" : "Física"],
                  ...(empresa.tipoPersona === "FISICA"
                    ? ([
                        ["CURP", empresa.curp],
                        ["Actividad productiva", empresa.actividadProductiva],
                      ] as Array<[string, string | null]>)
                    : []),
                  ["Correo electrónico", empresa.correoElectronico],
                  ["Teléfono", empresa.telefono],
                  ["Domicilio fiscal", domicilio || null],
                ]}
              />
            </Tarjeta>
          </>
        )}
      </div>
    </>
  );
}
