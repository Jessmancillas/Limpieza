import { Aviso, EncabezadoPagina, EnlaceBoton, EstadoVacio, Tarjeta } from "@/components/ui";
import { obtenerContexto } from "@/lib/auth/contexto";
import { db } from "@/lib/db";

import { crearSolicitud } from "../acciones";
import { tramiteVigente } from "../_lib/servidor";
import { FormularioNuevaSolicitud, type OpcionEstablecimiento } from "./formulario";

export default async function NuevaSolicitud({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [sp, ctx] = await Promise.all([searchParams, obtenerContexto()]);
  const empresaId = ctx.empresa.id;
  const [establecimientos, tramite] = await Promise.all([
    db.establecimiento.findMany({
      where: { empresaId, activo: true },
      orderBy: { denominacionRazonSocial: "asc" },
      include: { scian: { select: { clave: true }, orderBy: { clave: "asc" } } },
    }),
    tramiteVigente(),
  ]);
  const seleccionado = Array.isArray(sp.establecimientoId) ? sp.establecimientoId[0] : sp.establecimientoId;
  const opciones: OpcionEstablecimiento[] = establecimientos.map((e) => ({
    id: e.id,
    denominacion: e.denominacionRazonSocial,
    domicilio: [e.calle, e.numeroExterior, e.colonia, `C.P. ${e.codigoPostal}`, e.municipio, e.entidadFederativa].filter(Boolean).join(", "),
    licencia: e.noLicenciaSanitaria
      ? `Licencia sanitaria ${e.noLicenciaSanitaria}`
      : e.tieneAvisoFuncionamiento
        ? "Con aviso de funcionamiento"
        : "Sin licencia sanitaria ni aviso de funcionamiento",
    scian: e.scian.map((s) => s.clave).join(", "),
  }));

  return (
    <>
      <EncabezadoPagina
        titulo="Nueva solicitud"
        descripcion="Elige el establecimiento. Después agregas las mercancías, los terceros, el pago y los anexos; la app valida todo antes de presentar."
        migas={[{ etiqueta: "Solicitudes", href: "/solicitudes" }, { etiqueta: "Nueva" }]}
      />
      {ctx.rol === "CONSULTA" ? (
        <Aviso tono="aviso">Tu rol es de solo consulta: no puedes crear solicitudes.</Aviso>
      ) : !tramite ? (
        <Aviso tono="peligro" titulo="Falta la definición del trámite 260211">
          Pide al administrador que ejecute la carga inicial de datos (<code>npm run db:seed</code>).
        </Aviso>
      ) : opciones.length === 0 ? (
        <EstadoVacio
          titulo="Primero da de alta un establecimiento"
          descripcion="La solicitud necesita el domicilio donde se almacenarán los dispositivos, con su SCIAN y su licencia sanitaria o aviso de funcionamiento."
          accion={<EnlaceBoton href="/establecimientos/nuevo">Dar de alta establecimiento</EnlaceBoton>}
        />
      ) : (
        <Tarjeta>
          <FormularioNuevaSolicitud accion={crearSolicitud} establecimientos={opciones} seleccionado={seleccionado} />
          <p className="mt-4 text-xs text-texto-suave">
            Al crear el borrador se ligan automáticamente los documentos vigentes del establecimiento (licencia o aviso, aviso de
            responsable) y, si solo tienes un destinatario, también ese destinatario.
          </p>
        </Tarjeta>
      )}
    </>
  );
}
