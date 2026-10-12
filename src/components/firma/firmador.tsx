"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";

import { Aviso, Boton, Campo, Entrada, Insignia } from "@/components/ui";
import {
  ErrorFirma,
  descifrarLlave,
  estadoVigencia,
  firmarCadena,
  leerCertificado,
  verificarParLlaveCertificado,
  type CertificadoLeido,
} from "@/lib/firma/firmar";

/** Datos públicos del certificado (lo que se puede mandar al servidor). */
export type CertificadoPublico = {
  certificadoBase64: string;
  rfc: string;
  numeroSerie: string;
  nombre: string;
  vigenteHasta: string;
};

export type ResultadoFirma = {
  certificadoBase64: string;
  rfc: string;
  numeroSerie: string;
  /** Una firma (base64) por cadena, en el mismo orden. */
  firmas: string[];
};

const formatoFecha = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * Firma cadenas originales con la e.firma (FIEL) EN EL NAVEGADOR. El .key y su contraseña
 * nunca salen de aquí: solo se entregan el certificado público y las firmas.
 *
 * Flujo en dos pasos opcional: al cargar el .cer se llama `onCertificado` (p. ej. para pedir al
 * servidor las cadenas, que incluyen el RFC del firmante) y el padre actualiza `cadenas`.
 */
export function Firmador({
  cadenas,
  rfcEsperado,
  onFirmado,
  onCertificado,
  textoBoton = "Firmar",
  textoProcesando = "Firmando…",
  deshabilitado = false,
  mensajeSinCadenas = "No hay nada que firmar.",
  cargandoCadenas = false,
}: {
  cadenas: string[];
  rfcEsperado?: string | null;
  onFirmado: (resultado: ResultadoFirma) => void | Promise<void>;
  onCertificado?: (certificado: CertificadoPublico | null) => void;
  textoBoton?: string;
  textoProcesando?: string;
  deshabilitado?: boolean;
  mensajeSinCadenas?: string;
  cargandoCadenas?: boolean;
}) {
  const id = useId();
  const refKey = useRef<HTMLInputElement>(null);
  const [certificado, setCertificado] = useState<CertificadoLeido | null>(null);
  const [archivoKey, setArchivoKey] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  const vigencia = certificado ? estadoVigencia(certificado) : null;
  const rfcDistinto = Boolean(certificado?.rfc && rfcEsperado && certificado.rfc !== rfcEsperado.toUpperCase());
  const listo =
    !!certificado?.rfc && vigencia === "VIGENTE" && !!archivoKey && password.length > 0 && cadenas.length > 0 && !deshabilitado && !procesando;

  async function alCargarCer(e: ChangeEvent<HTMLInputElement>) {
    setError(null);
    const archivo = e.target.files?.[0];
    if (!archivo) {
      setCertificado(null);
      onCertificado?.(null);
      return;
    }
    try {
      const leido = leerCertificado(new Uint8Array(await archivo.arrayBuffer()));
      if (!leido.rfc) throw new ErrorFirma("El certificado no trae RFC. Usa el archivo .cer de tu e.firma (no el de sellos digitales).");
      setCertificado(leido);
      const estado = estadoVigencia(leido);
      if (estado !== "VIGENTE") {
        setError(
          estado === "VENCIDO"
            ? `El certificado venció el ${formatoFecha.format(leido.vigenteHasta)}. Renueva tu e.firma en el SAT.`
            : `El certificado será válido a partir del ${formatoFecha.format(leido.vigenteDesde)}.`,
        );
        onCertificado?.(null);
        return;
      }
      onCertificado?.({
        certificadoBase64: leido.certificadoBase64,
        rfc: leido.rfc,
        numeroSerie: leido.numeroSerie,
        nombre: leido.nombre,
        vigenteHasta: leido.vigenteHasta.toISOString(),
      });
    } catch (err) {
      setCertificado(null);
      onCertificado?.(null);
      setError(err instanceof ErrorFirma ? err.message : "No se pudo leer el certificado.");
    }
  }

  function limpiarLlave() {
    setPassword("");
    setArchivoKey(null);
    if (refKey.current) refKey.current.value = "";
  }

  async function firmar() {
    if (!certificado?.rfc || !archivoKey) return;
    setError(null);
    setProcesando(true);
    // Deja pintar el estado "Firmando…" antes del cálculo (RSA en JavaScript).
    await new Promise((r) => setTimeout(r, 30));
    let resultado: ResultadoFirma | null = null;
    let bytes: Uint8Array | null = null;
    try {
      bytes = new Uint8Array(await archivoKey.arrayBuffer());
      let llave: ReturnType<typeof descifrarLlave> | null = descifrarLlave(bytes, password);
      if (!verificarParLlaveCertificado(llave, certificado)) {
        llave = null;
        throw new ErrorFirma("La llave privada (.key) no corresponde al certificado (.cer). Revisa que ambos sean de la misma e.firma.");
      }
      const firmas = cadenas.map((cadena) => firmarCadena(llave as NonNullable<typeof llave>, cadena));
      llave = null;
      resultado = { certificadoBase64: certificado.certificadoBase64, rfc: certificado.rfc, numeroSerie: certificado.numeroSerie, firmas };
    } catch (err) {
      setError(err instanceof ErrorFirma ? err.message : "No se pudo firmar con la e.firma.");
    } finally {
      bytes?.fill(0);
      bytes = null;
      limpiarLlave();
    }
    try {
      if (resultado) await onFirmado(resultado);
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="rounded-md bg-primario-suave px-3 py-2 text-sm text-primario">
        Tu e.firma se usa solo en este navegador; el archivo .key y su contraseña nunca se envían al servidor.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Campo etiqueta="Certificado (.cer)" htmlFor={`${id}-cer`} requerido>
          <Entrada id={`${id}-cer`} type="file" accept=".cer,.crt,.pem" onChange={alCargarCer} disabled={procesando} />
        </Campo>
        <Campo etiqueta="Llave privada (.key)" htmlFor={`${id}-key`} requerido>
          <Entrada
            ref={refKey}
            id={`${id}-key`}
            type="file"
            accept=".key,.pem"
            onChange={(e) => setArchivoKey(e.target.files?.[0] ?? null)}
            disabled={procesando || !certificado}
          />
        </Campo>
        <Campo etiqueta="Contraseña de la llave privada" htmlFor={`${id}-pwd`} requerido>
          <Entrada
            id={`${id}-pwd`}
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && listo) {
                e.preventDefault();
                void firmar();
              }
            }}
            disabled={procesando || !certificado}
          />
        </Campo>
      </div>

      {certificado && (
        <div className="rounded-md border border-borde px-3 py-2 text-sm" aria-live="polite">
          <p className="font-medium">{certificado.nombre || "Certificado sin nombre"}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-texto-suave">
            <span>
              RFC: <strong className="text-texto">{certificado.rfc ?? "—"}</strong>
            </span>
            <span>Serie: {certificado.numeroSerie}</span>
            <span>
              Vigencia: {formatoFecha.format(certificado.vigenteDesde)} – {formatoFecha.format(certificado.vigenteHasta)}
            </span>
            {vigencia === "VIGENTE" ? <Insignia tono="exito">Vigente</Insignia> : <Insignia tono="peligro">No vigente</Insignia>}
          </p>
        </div>
      )}

      {rfcDistinto && (
        <Aviso tono="aviso" titulo="El RFC del certificado no es el del solicitante">
          El certificado es de {certificado?.rfc} y la solicitud es de {rfcEsperado}. Puedes continuar si firmas como representante
          legal autorizado en VUCEM.
        </Aviso>
      )}

      {error && <Aviso tono="peligro">{error}</Aviso>}

      {cadenas.length > 0 ? (
        <details className="rounded-md border border-borde px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">
            Ver {cadenas.length === 1 ? "la cadena original que se firmará" : `las ${cadenas.length} cadenas originales que se firmarán`}
          </summary>
          <div className="mt-2 space-y-2">
            {cadenas.map((cadena, i) => (
              <pre key={i} className="max-h-60 overflow-auto rounded bg-fondo p-2 font-mono text-xs break-all whitespace-pre-wrap">
                {cadena}
              </pre>
            ))}
          </div>
        </details>
      ) : (
        <p className="text-sm text-texto-suave">{cargandoCadenas ? "Preparando lo que se va a firmar…" : certificado ? mensajeSinCadenas : null}</p>
      )}

      <Boton onClick={() => void firmar()} disabled={!listo} aria-busy={procesando}>
        {procesando ? textoProcesando : textoBoton}
      </Boton>
    </div>
  );
}
