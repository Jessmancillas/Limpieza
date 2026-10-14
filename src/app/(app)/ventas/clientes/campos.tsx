import { AreaTexto, Campo, Entrada } from "@/components/ui";
import { centavosATexto } from "@/lib/erp/dinero";

export type ValoresCliente = {
  clave?: string;
  razonSocial?: string;
  rfc?: string | null;
  contacto?: string | null;
  correoElectronico?: string | null;
  telefono?: string | null;
  diasCredito?: number;
  limiteCredito?: number;
  notas?: string | null;
};

export function CamposCliente({ v = {} }: { v?: ValoresCliente }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Campo etiqueta="Clave" htmlFor="clave" requerido>
        <Entrada id="clave" name="clave" defaultValue={v.clave} required maxLength={30} />
      </Campo>
      <Campo etiqueta="Razón social" htmlFor="razonSocial" requerido>
        <Entrada id="razonSocial" name="razonSocial" defaultValue={v.razonSocial} required maxLength={200} />
      </Campo>
      <Campo etiqueta="RFC" htmlFor="rfc">
        <Entrada id="rfc" name="rfc" defaultValue={v.rfc ?? ""} maxLength={13} />
      </Campo>
      <Campo etiqueta="Contacto" htmlFor="contacto">
        <Entrada id="contacto" name="contacto" defaultValue={v.contacto ?? ""} />
      </Campo>
      <Campo etiqueta="Correo" htmlFor="correoElectronico">
        <Entrada id="correoElectronico" name="correoElectronico" type="email" defaultValue={v.correoElectronico ?? ""} />
      </Campo>
      <Campo etiqueta="Teléfono" htmlFor="telefono">
        <Entrada id="telefono" name="telefono" defaultValue={v.telefono ?? ""} />
      </Campo>
      <Campo etiqueta="Días de crédito" htmlFor="diasCredito" requerido>
        <Entrada id="diasCredito" name="diasCredito" type="number" min={0} max={365} defaultValue={v.diasCredito ?? 0} required />
      </Campo>
      <Campo etiqueta="Límite de crédito" htmlFor="limiteCredito" requerido ayuda="0 = solo contado. Otorgar o aumentar crédito requiere el área Aprobador.">
        <Entrada id="limiteCredito" name="limiteCredito" inputMode="decimal" defaultValue={centavosATexto(v.limiteCredito ?? 0)} required />
      </Campo>
      <Campo etiqueta="Notas" htmlFor="notas" className="sm:col-span-2">
        <AreaTexto id="notas" name="notas" defaultValue={v.notas ?? ""} />
      </Campo>
    </div>
  );
}
