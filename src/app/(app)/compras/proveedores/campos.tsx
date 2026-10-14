import { Campo, Entrada, Selector, AreaTexto } from "@/components/ui";
import { CRITICIDADES } from "@/lib/erp/constantes";

export type ValoresProveedor = {
  clave?: string;
  razonSocial?: string;
  rfc?: string | null;
  contacto?: string | null;
  correoElectronico?: string | null;
  telefono?: string | null;
  diasCredito?: number;
  criticidad?: string;
  notas?: string | null;
};

const ETIQUETA_CRITICIDAD: Record<string, string> = {
  CRITICO: "Crítico (sin él se detiene la operación)",
  ESTRATEGICO: "Estratégico",
  NORMAL: "Normal",
};

export function CamposProveedor({ v = {} }: { v?: ValoresProveedor }) {
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
      <Campo etiqueta="Días de crédito" htmlFor="diasCredito" requerido ayuda="Plazo de pago que otorga el proveedor.">
        <Entrada id="diasCredito" name="diasCredito" type="number" min={0} max={365} defaultValue={v.diasCredito ?? 30} required />
      </Campo>
      <Campo etiqueta="Criticidad" htmlFor="criticidad" ayuda="Prioriza pagos y la gestión de riesgos de terceros (ISO 27001 A.5.19).">
        <Selector id="criticidad" name="criticidad" defaultValue={v.criticidad ?? "NORMAL"}>
          {CRITICIDADES.map((c) => (
            <option key={c} value={c}>
              {ETIQUETA_CRITICIDAD[c]}
            </option>
          ))}
        </Selector>
      </Campo>
      <Campo etiqueta="Notas" htmlFor="notas" className="sm:col-span-2">
        <AreaTexto id="notas" name="notas" defaultValue={v.notas ?? ""} />
      </Campo>
    </div>
  );
}
