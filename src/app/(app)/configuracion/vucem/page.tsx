import type { Metadata } from "next";

import { Aviso, Datos, EncabezadoPagina, Insignia, Tarjeta } from "@/components/ui";
import { obtenerContexto } from "@/lib/auth/contexto";
import { db } from "@/lib/db";
import { configuracionEfectiva } from "@/lib/vucem/configuracion";
import { tieneCredencial } from "@/lib/vucem/credenciales";
import { URL_DIGITALIZACION_PRODUCCION } from "@/lib/vucem/digitalizacion";
import { simuladorHabilitado } from "@/lib/vucem/simulador";
import { NAMESPACE_260211_MANUAL } from "@/lib/vucem/solicitud-260211";
import { AYUDA_AMBIENTE, urlSimulador } from "@/lib/vucem/urls";

import { FormularioBorrarCredencial, FormularioConfiguracion, FormularioCredencial } from "./formularios";

export const metadata: Metadata = { title: "Conexión VUCEM" };

const formatoFechaHora = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Mexico_City",
});

const TONO_AMBIENTE = { SIMULADOR: "info", PRUEBAS: "aviso", PRODUCCION: "peligro" } as const;
const ETIQUETA_AMBIENTE = { SIMULADOR: "Simulador", PRUEBAS: "Pruebas", PRODUCCION: "Producción" } as const;

export default async function PaginaConexionVucem() {
  const ctx = await obtenerContexto();
  const esAdmin = ctx.rol === "ADMIN";
  const [registro, empresa, credencial] = await Promise.all([
    db.configuracionVucem.findUnique({ where: { empresaId: ctx.empresa.id } }),
    db.empresa.findUniqueOrThrow({ where: { id: ctx.empresa.id }, select: { rfc: true, correoElectronico: true } }),
    tieneCredencial(ctx.empresa.id),
  ]);
  const config = configuracionEfectiva(registro, empresa.correoElectronico);
  const simuladorApagado = config.ambiente === "SIMULADOR" && !simuladorHabilitado();

  const valoresIniciales: Record<string, string> = {
    ambiente: config.ambiente,
    urlSolicitud: registro?.urlSolicitud ?? "",
    operacionSolicitud: registro?.operacionSolicitud ?? "",
    namespaceSolicitud: registro?.namespaceSolicitud ?? "",
    soapActionSolicitud: registro?.soapActionSolicitud ?? "",
    urlDigitalizacion: registro?.urlDigitalizacion ?? "",
    correoDigitalizacion: registro?.correoDigitalizacion ?? "",
  };

  return (
    <>
      <EncabezadoPagina
        titulo="Conexión con VUCEM"
        descripcion="Ambiente, servicios web y contraseña de servicios web con los que se digitalizan los anexos (eDocument) y se envía la solicitud 260211."
        migas={[{ etiqueta: "Inicio", href: "/" }, { etiqueta: "Configuración" }, { etiqueta: "Conexión VUCEM" }]}
        acciones={<Insignia tono={TONO_AMBIENTE[config.ambiente]}>Ambiente: {ETIQUETA_AMBIENTE[config.ambiente]}</Insignia>}
      />

      <div className="space-y-6">
        <Aviso tono="aviso" titulo="Datos que debes pedir a VUCEM">
          El Manual WS 260211 no publica la URL ni el WSDL; pídelos a la Mesa de Ayuda de VUCEM o descárgalos del portal (Manuales →
          COFEPRIS → Web Service trámites COFEPRIS). Con el WSDL se confirman la URL, la operación, el namespace y el SOAPAction.
        </Aviso>

        {simuladorApagado && (
          <Aviso tono="peligro" titulo="El simulador está deshabilitado">
            En producción el simulador solo funciona con la variable de entorno VUCEM_SIMULADOR=true. Cambia a Pruebas o Producción, o
            habilítalo.
          </Aviso>
        )}

        <Tarjeta titulo="Ambiente y servicios" descripcion={AYUDA_AMBIENTE[config.ambiente]}>
          {esAdmin ? (
            <FormularioConfiguracion
              valoresIniciales={valoresIniciales}
              ayudaAmbiente={AYUDA_AMBIENTE}
              urlsSimulador={{ solicitud: urlSimulador("solicitud"), digitalizacion: urlSimulador("digitalizacion") }}
              urlDigitalizacionOficial={URL_DIGITALIZACION_PRODUCCION}
              namespaceManual={NAMESPACE_260211_MANUAL}
              ambienteGuardado={config.ambiente}
            />
          ) : (
            <div className="space-y-4">
              <Datos
                filas={[
                  ["Ambiente", ETIQUETA_AMBIENTE[config.ambiente]],
                  ["URL del WS 260211", config.urlSolicitud ? <code className="text-xs break-all">{config.urlSolicitud}</code> : "No configurada"],
                  ["Operación", config.operacionSolicitud ?? "No configurada"],
                  ["SOAPAction", config.soapActionSolicitud ?? "—"],
                  ["Namespace", <code key="ns" className="text-xs break-all">{config.namespaceSolicitud}</code>],
                  [
                    "URL de digitalización",
                    config.urlDigitalizacion ? <code className="text-xs break-all">{config.urlDigitalizacion}</code> : "No configurada",
                  ],
                  ["Correo para digitalización", config.correoDigitalizacion],
                ]}
              />
              <p className="text-xs text-texto-suave">Solo un administrador puede cambiar la conexión con VUCEM.</p>
            </div>
          )}
          {config.actualizadoEn && (
            <p className="mt-4 text-xs text-texto-suave">Última modificación: {formatoFechaHora.format(config.actualizadoEn)}</p>
          )}
        </Tarjeta>

        <Tarjeta
          titulo="Contraseña de servicios web"
          descripcion="Va en el encabezado de seguridad (UsernameToken) de cada petición, junto con el RFC como usuario."
        >
          <div className="space-y-4">
            <p className="text-sm">
              Estado:{" "}
              {credencial ? (
                <>
                  <Insignia tono="exito">Guardada</Insignia>{" "}
                  <span className="text-texto-suave">
                    el {formatoFechaHora.format(credencial.actualizadoEn)}
                    {credencial.actualizadoPor ? ` por ${credencial.actualizadoPor}` : ""} · usuario {credencial.usuarioWs}
                  </span>
                </>
              ) : (
                <Insignia tono={config.ambiente === "SIMULADOR" ? "neutro" : "peligro"}>No configurada</Insignia>
              )}
            </p>
            <div className="space-y-2 text-sm text-texto-suave">
              <p>
                Es distinta de la contraseña de tu e.firma y de la del portal. Se genera en el portal de VUCEM entrando con la e.firma del
                solicitante (opción para generar la contraseña de servicios web / web services); VUCEM la muestra una sola vez, así que
                cópiala completa y pégala aquí.
              </p>
              <p>Se guarda cifrada y solo se descifra en el servidor al enviar. Nadie puede volver a verla desde esta app.</p>
            </div>
            {esAdmin ? (
              <div className="space-y-4">
                <FormularioCredencial usuarioSugerido={credencial?.usuarioWs ?? empresa.rfc} hayCredencial={Boolean(credencial)} />
                {credencial && <FormularioBorrarCredencial />}
              </div>
            ) : (
              <p className="text-xs text-texto-suave">Solo un administrador puede capturar o reemplazar la contraseña.</p>
            )}
          </div>
        </Tarjeta>

        <Tarjeta titulo="e.firma (FIEL)">
          <p className="text-sm text-texto-suave">
            La e.firma (.cer, .key y su contraseña) NO se guarda en esta app. Cada vez que se digitaliza un anexo o se envía una solicitud,
            se carga en el navegador y se firma ahí mismo; al servidor solo llegan el certificado público y la firma.
          </p>
        </Tarjeta>
      </div>
    </>
  );
}
