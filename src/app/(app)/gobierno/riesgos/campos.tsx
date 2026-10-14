import { Campo, Entrada, Selector } from "@/components/ui";
import { ESTADOS_RIESGO, TRATAMIENTOS_RIESGO } from "@/lib/erp/constantes";

type Valores = {
  activo?: string;
  amenaza?: string;
  vulnerabilidad?: string;
  probabilidad?: number;
  impacto?: number;
  tratamiento?: string;
  controles?: string | null;
  responsable?: string | null;
  probabilidadResidual?: number | null;
  impactoResidual?: number | null;
  estado?: string;
};

const ESCALA = [1, 2, 3, 4, 5];

export function CamposRiesgo({ v = {}, sufijo = "" }: { v?: Valores; sufijo?: string }) {
  const id = (c: string) => `${c}${sufijo}`;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Campo etiqueta="Activo de información" htmlFor={id("activo")} requerido>
        <Entrada id={id("activo")} name="activo" defaultValue={v.activo} required placeholder="Base de datos de clientes" />
      </Campo>
      <Campo etiqueta="Amenaza" htmlFor={id("amenaza")} requerido>
        <Entrada id={id("amenaza")} name="amenaza" defaultValue={v.amenaza} required />
      </Campo>
      <Campo etiqueta="Vulnerabilidad" htmlFor={id("vulnerabilidad")} requerido>
        <Entrada id={id("vulnerabilidad")} name="vulnerabilidad" defaultValue={v.vulnerabilidad} required />
      </Campo>
      <Campo etiqueta="Probabilidad (1-5)" htmlFor={id("probabilidad")}>
        <Selector id={id("probabilidad")} name="probabilidad" defaultValue={v.probabilidad ?? 3}>
          {ESCALA.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Selector>
      </Campo>
      <Campo etiqueta="Impacto (1-5)" htmlFor={id("impacto")}>
        <Selector id={id("impacto")} name="impacto" defaultValue={v.impacto ?? 3}>
          {ESCALA.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Selector>
      </Campo>
      <Campo etiqueta="Tratamiento" htmlFor={id("tratamiento")} ayuda="Aceptar sobre el apetito (p×i > 9) solo un administrador.">
        <Selector id={id("tratamiento")} name="tratamiento" defaultValue={v.tratamiento ?? "MITIGAR"}>
          {TRATAMIENTOS_RIESGO.map((t) => (
            <option key={t} value={t}>
              {t.toLowerCase()}
            </option>
          ))}
        </Selector>
      </Campo>
      <Campo etiqueta="Controles (Anexo A)" htmlFor={id("controles")}>
        <Entrada id={id("controles")} name="controles" defaultValue={v.controles ?? ""} placeholder="A.8.13, A.5.15" />
      </Campo>
      <Campo etiqueta="Dueño del riesgo" htmlFor={id("responsable")}>
        <Entrada id={id("responsable")} name="responsable" defaultValue={v.responsable ?? ""} />
      </Campo>
      <Campo etiqueta="Estado" htmlFor={id("estado")}>
        <Selector id={id("estado")} name="estado" defaultValue={v.estado ?? "ABIERTO"}>
          {ESTADOS_RIESGO.map((e) => (
            <option key={e} value={e}>
              {e.toLowerCase().replace("_", " ")}
            </option>
          ))}
        </Selector>
      </Campo>
      <Campo etiqueta="Probabilidad residual" htmlFor={id("probabilidadResidual")}>
        <Selector id={id("probabilidadResidual")} name="probabilidadResidual" defaultValue={v.probabilidadResidual ?? ""}>
          <option value="">—</option>
          {ESCALA.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Selector>
      </Campo>
      <Campo etiqueta="Impacto residual" htmlFor={id("impactoResidual")}>
        <Selector id={id("impactoResidual")} name="impactoResidual" defaultValue={v.impactoResidual ?? ""}>
          <option value="">—</option>
          {ESCALA.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Selector>
      </Campo>
    </div>
  );
}
