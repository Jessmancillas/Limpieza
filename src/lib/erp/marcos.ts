// Catálogo de referencia: objetivos de gobierno y gestión de COBIT 2019 y controles del Anexo A
// de ISO/IEC 27001:2022 que el ERP implementa o soporta. Se copian a ControlGobierno (por
// empresa) la primera vez que se abre Gobierno, para que cada empresa evalúe su nivel.
//
// `soporte` describe CÓMO lo implementa el sistema (evidencia automática para la auditoría).

import type { Marco } from "./constantes";

export type ControlReferencia = {
  marco: Marco;
  clave: string;
  nombre: string;
  dominio: string;
  procesoErp: string;
  soporte: string;
  nivelObjetivo: number;
};

export const OBJETIVOS_COBIT: ControlReferencia[] = [
  { marco: "COBIT", clave: "EDM03", nombre: "Asegurar la optimización del riesgo", dominio: "EDM · Evaluar, dirigir y monitorear", procesoErp: "GOBIERNO", soporte: "Apetito de riesgo definido (p×i ≤ 9) y aceptación de riesgos altos solo por dirección.", nivelObjetivo: 3 },
  { marco: "COBIT", clave: "APO01", nombre: "Marco de gestión de I&T gestionado", dominio: "APO · Alinear, planificar y organizar", procesoErp: "GOBIERNO", soporte: "Políticas de decisión parametrizadas por empresa (umbrales, tolerancias, crédito).", nivelObjetivo: 3 },
  { marco: "COBIT", clave: "APO06", nombre: "Presupuesto y costos gestionados", dominio: "APO · Alinear, planificar y organizar", procesoErp: "FINANZAS", soporte: "Tesorería, costo promedio ponderado, margen bruto y ciclo de conversión de efectivo.", nivelObjetivo: 3 },
  { marco: "COBIT", clave: "APO10", nombre: "Proveedores gestionados", dominio: "APO · Alinear, planificar y organizar", procesoErp: "COMPRAS", soporte: "Padrón de proveedores, criticidad, scorecard ponderado (calidad, puntualidad, cumplimiento, facturación) y bloqueo.", nivelObjetivo: 3 },
  { marco: "COBIT", clave: "APO12", nombre: "Riesgo gestionado", dominio: "APO · Alinear, planificar y organizar", procesoErp: "GOBIERNO", soporte: "Registro de riesgos con matriz 5×5, tratamiento y riesgo residual; scoring de crédito de clientes.", nivelObjetivo: 3 },
  { marco: "COBIT", clave: "APO13", nombre: "Seguridad gestionada", dominio: "APO · Alinear, planificar y organizar", procesoErp: "GOBIERNO", soporte: "Declaración de aplicabilidad ISO/IEC 27001 y seguimiento de controles.", nivelObjetivo: 3 },
  { marco: "COBIT", clave: "BAI06", nombre: "Cambios de TI gestionados", dominio: "BAI · Construir, adquirir e implementar", procesoErp: "TI", soporte: "Tickets de cambio estándar/normal/emergencia con aprobación del CAB.", nivelObjetivo: 3 },
  { marco: "COBIT", clave: "BAI09", nombre: "Activos gestionados", dominio: "BAI · Construir, adquirir e implementar", procesoErp: "ALMACEN", soporte: "Kárdex inmutable por almacén, clasificación ABC y política de conteo cíclico.", nivelObjetivo: 3 },
  { marco: "COBIT", clave: "DSS01", nombre: "Operaciones gestionadas", dominio: "DSS · Entregar, dar servicio y soporte", procesoErp: "ALMACEN", soporte: "Procesos estandarizados de recepción, surtido y entrega con estados controlados.", nivelObjetivo: 3 },
  { marco: "COBIT", clave: "DSS02", nombre: "Peticiones de servicio e incidentes gestionados", dominio: "DSS · Entregar, dar servicio y soporte", procesoErp: "TI", soporte: "Mesa de servicio ITIL con prioridad impacto×urgencia y SLA.", nivelObjetivo: 3 },
  { marco: "COBIT", clave: "DSS03", nombre: "Problemas gestionados", dominio: "DSS · Entregar, dar servicio y soporte", procesoErp: "TI", soporte: "Tickets de problema para causa raíz de incidentes recurrentes.", nivelObjetivo: 2 },
  { marco: "COBIT", clave: "DSS05", nombre: "Servicios de seguridad gestionados", dominio: "DSS · Entregar, dar servicio y soporte", procesoErp: "TI", soporte: "Contraseñas scrypt, sesiones con token hash, cifrado AES-256-GCM, aislamiento por empresa.", nivelObjetivo: 3 },
  { marco: "COBIT", clave: "DSS06", nombre: "Controles de procesos de negocio gestionados", dominio: "DSS · Entregar, dar servicio y soporte", procesoErp: "COMPRAS", soporte: "Matriz de autorización por monto, conciliación a tres vías, segregación de funciones y bitácora.", nivelObjetivo: 4 },
  { marco: "COBIT", clave: "MEA01", nombre: "Monitoreo del desempeño y la conformidad", dominio: "MEA · Monitorear, evaluar y valorar", procesoErp: "GOBIERNO", soporte: "Tablero ejecutivo con KPIs y semáforos (DSO, DPO, fill rate, SLA, riesgos).", nivelObjetivo: 3 },
  { marco: "COBIT", clave: "MEA02", nombre: "Sistema de control interno gestionado", dominio: "MEA · Monitorear, evaluar y valorar", procesoErp: "GOBIERNO", soporte: "Bitácora de auditoría y excepciones (OC fuera de política, CxP liberadas, riesgos aceptados).", nivelObjetivo: 3 },
  { marco: "COBIT", clave: "MEA03", nombre: "Cumplimiento de requerimientos externos gestionado", dominio: "MEA · Monitorear, evaluar y valorar", procesoErp: "GOBIERNO", soporte: "Trámites COFEPRIS/VUCEM y vigencias de registros sanitarios.", nivelObjetivo: 3 },
];

export const CONTROLES_ISO27001: ControlReferencia[] = [
  { marco: "ISO27001", clave: "A.5.1", nombre: "Políticas de seguridad de la información", dominio: "5 · Organizacionales", procesoErp: "GOBIERNO", soporte: "Políticas de decisión y de acceso documentadas en la configuración del ERP.", nivelObjetivo: 3 },
  { marco: "ISO27001", clave: "A.5.2", nombre: "Roles y responsabilidades", dominio: "5 · Organizacionales", procesoErp: "GOBIERNO", soporte: "Roles (administrador, capturista, consulta) y áreas funcionales por usuario.", nivelObjetivo: 3 },
  { marco: "ISO27001", clave: "A.5.3", nombre: "Segregación de funciones", dominio: "5 · Organizacionales", procesoErp: "COMPRAS", soporte: "Quien elabora una OC no la aprueba; quien la aprueba no la recibe; quien registra la recepción no paga.", nivelObjetivo: 4 },
  { marco: "ISO27001", clave: "A.5.9", nombre: "Inventario de información y otros activos", dominio: "5 · Organizacionales", procesoErp: "ALMACEN", soporte: "Registro de activos en el análisis de riesgos e inventario físico en kárdex.", nivelObjetivo: 3 },
  { marco: "ISO27001", clave: "A.5.15", nombre: "Control de acceso", dominio: "5 · Organizacionales", procesoErp: "TI", soporte: "Acceso por rol y área; cada consulta filtra por la empresa activa.", nivelObjetivo: 3 },
  { marco: "ISO27001", clave: "A.5.18", nombre: "Derechos de acceso", dominio: "5 · Organizacionales", procesoErp: "TI", soporte: "Alta, cambio y baja de usuarios solo por administradores, con bitácora.", nivelObjetivo: 3 },
  { marco: "ISO27001", clave: "A.5.19", nombre: "Seguridad de la información en la relación con proveedores", dominio: "5 · Organizacionales", procesoErp: "COMPRAS", soporte: "Criticidad del proveedor y evaluación periódica; bloqueo de proveedores.", nivelObjetivo: 3 },
  { marco: "ISO27001", clave: "A.5.24", nombre: "Planificación y preparación de la gestión de incidentes", dominio: "5 · Organizacionales", procesoErp: "TI", soporte: "Mesa de servicio con prioridades y SLA definidos.", nivelObjetivo: 3 },
  { marco: "ISO27001", clave: "A.5.26", nombre: "Respuesta a incidentes de seguridad", dominio: "5 · Organizacionales", procesoErp: "TI", soporte: "Tickets de incidente con seguimiento hasta el cierre y solución documentada.", nivelObjetivo: 3 },
  { marco: "ISO27001", clave: "A.5.34", nombre: "Privacidad y protección de datos personales", dominio: "5 · Organizacionales", procesoErp: "VENTAS", soporte: "Datos de clientes aislados por empresa; aviso de privacidad (LFPDPPP).", nivelObjetivo: 3 },
  { marco: "ISO27001", clave: "A.8.2", nombre: "Derechos de acceso privilegiado", dominio: "8 · Tecnológicos", procesoErp: "TI", soporte: "Operaciones sensibles (liberar CxP, aceptar riesgos, políticas) restringidas a administradores.", nivelObjetivo: 3 },
  { marco: "ISO27001", clave: "A.8.5", nombre: "Autenticación segura", dominio: "8 · Tecnológicos", procesoErp: "TI", soporte: "Contraseñas con scrypt y sesiones con token aleatorio (solo se guarda su hash).", nivelObjetivo: 3 },
  { marco: "ISO27001", clave: "A.8.13", nombre: "Respaldo de la información", dominio: "8 · Tecnológicos", procesoErp: "TI", soporte: "Volumen /data con base y archivos; respaldar APP_ENCRYPTION_KEY por separado.", nivelObjetivo: 3 },
  { marco: "ISO27001", clave: "A.8.15", nombre: "Registro de eventos (logging)", dominio: "8 · Tecnológicos", procesoErp: "GOBIERNO", soporte: "Bitácora de cada alta, cambio, aprobación, pago y cobro con usuario y fecha.", nivelObjetivo: 4 },
  { marco: "ISO27001", clave: "A.8.24", nombre: "Uso de criptografía", dominio: "8 · Tecnológicos", procesoErp: "TI", soporte: "AES-256-GCM para credenciales; e.firma solo en el navegador.", nivelObjetivo: 3 },
  { marco: "ISO27001", clave: "A.8.32", nombre: "Gestión de cambios", dominio: "8 · Tecnológicos", procesoErp: "TI", soporte: "Tickets de cambio ITIL con aprobación previa (CAB) y registro de implementación.", nivelObjetivo: 3 },
];

export const CONTROLES_REFERENCIA: ControlReferencia[] = [...OBJETIVOS_COBIT, ...CONTROLES_ISO27001];

export const ETIQUETA_NIVEL_CAPACIDAD: Record<number, string> = {
  0: "0 · Incompleto",
  1: "1 · Inicial",
  2: "2 · Gestionado",
  3: "3 · Definido",
  4: "4 · Cuantitativo",
  5: "5 · Optimizado",
};

export function controlReferencia(marco: string, clave: string): ControlReferencia | undefined {
  return CONTROLES_REFERENCIA.find((c) => c.marco === marco && c.clave === clave);
}
