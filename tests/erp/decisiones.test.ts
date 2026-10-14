import { describe, expect, it } from "vitest";

import { accionSugerida, resumenAntiguedad, tramoAntiguedad } from "@/lib/erp/decisiones/cobranza";
import { conciliarTresVias, evaluarProveedor, nivelAprobacionOC, puedeAprobarOC } from "@/lib/erp/decisiones/compras";
import { evaluarCredito, type EntradaCredito } from "@/lib/erp/decisiones/credito";
import { indicadoresFinancieros, priorizarPagos } from "@/lib/erp/decisiones/finanzas";
import { brecha, cumplimiento, madurezPromedio, prioridadesMejora, semaforo } from "@/lib/erp/decisiones/gobierno";
import { cantidadSugerida, clasificarABC, costoPromedioPonderado, loteEconomico, politicaInventario, stockSeguridad } from "@/lib/erp/decisiones/inventario";
import { prioridadItil, requiereAprobacionCambio, slaIncumplido, transicionesPermitidas, vencimientoSla } from "@/lib/erp/decisiones/itil";
import { nivelRiesgo, validarTratamiento, valorRiesgo } from "@/lib/erp/decisiones/riesgos";
import { centavosATexto, pesosACentavos, textoACantidad, totalesDocumento } from "@/lib/erp/dinero";
import { areasATexto, areasDeMembresia, puedeOperar, verificarSegregacion } from "@/lib/erp/permisos";

const fecha = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("dinero", () => {
  it("convierte pesos ↔ centavos sin errores de punto flotante", () => {
    expect(pesosACentavos("1,234.5")).toBe(123450);
    expect(pesosACentavos("$0.07")).toBe(7);
    expect(pesosACentavos("19.99")).toBe(1999);
    expect(pesosACentavos("1.234")).toBeNull();
    expect(pesosACentavos("abc")).toBeNull();
    expect(centavosATexto(123405)).toBe("1234.05");
    expect(textoACantidad("2.5")).toBe(2.5);
    expect(textoACantidad("-1")).toBeNull();
  });

  it("calcula IVA por partida y descuentos", () => {
    const t = totalesDocumento([
      { cantidad: 3, precioUnitario: 10000, tasaIvaBp: 1600 },
      { cantidad: 1, precioUnitario: 5000, tasaIvaBp: 0, descuentoBp: 1000 },
    ]);
    expect(t).toEqual({ subtotal: 34500, iva: 4800, total: 39300 });
  });
});

describe("compras: matriz de autorización y segregación", () => {
  const politica = { montoAutoAprobacion: 500000, montoAprobacionNivel1: 5000000, segregacionEstricta: true };

  it("asigna el nivel por monto", () => {
    expect(nivelAprobacionOC(500000, politica)).toBe(0);
    expect(nivelAprobacionOC(500001, politica)).toBe(1);
    expect(nivelAprobacionOC(5000001, politica)).toBe(2);
  });

  it("exige aprobador o dirección y separa elaborar de aprobar", () => {
    const base = { aprobadorId: "u2", creadorId: "u1", segregacionEstricta: true };
    expect(puedeAprobarOC({ ...base, nivel: 1, rol: "CAPTURISTA", areas: ["COMPRAS"] }).permitido).toBe(false);
    expect(puedeAprobarOC({ ...base, nivel: 1, rol: "CAPTURISTA", areas: ["APROBADOR"] }).permitido).toBe(true);
    expect(puedeAprobarOC({ ...base, nivel: 2, rol: "CAPTURISTA", areas: ["APROBADOR"] }).permitido).toBe(false);
    expect(puedeAprobarOC({ ...base, nivel: 2, rol: "ADMIN", areas: [] }).permitido).toBe(true);
    expect(puedeAprobarOC({ ...base, nivel: 1, rol: "CONSULTA", areas: ["APROBADOR"] }).permitido).toBe(false);
    const propia = puedeAprobarOC({ ...base, creadorId: "u2", nivel: 1, rol: "ADMIN", areas: [] });
    expect(propia.permitido).toBe(false);
    expect(propia.motivo).toMatch(/Segregación/);
    const flexible = puedeAprobarOC({ ...base, creadorId: "u2", nivel: 1, rol: "ADMIN", areas: [], segregacionEstricta: false });
    expect(flexible).toMatchObject({ permitido: true });
    expect(flexible.advertencia).toMatch(/Segregación/);
  });

  it("concilia OC, recepción y factura con tolerancia", () => {
    const partidas = [{ cantidadOrdenada: 10, cantidadRecibidaAcumulada: 10, cantidadRecibida: 10, costoUnitario: 10000, tasaIvaBp: 1600 }];
    const args = { partidas, toleranciaPrecioBp: 200, toleranciaCantidadBp: 0 };
    expect(conciliarTresVias({ ...args, importeFactura: 116000 }).resultado).toBe("OK");
    expect(conciliarTresVias({ ...args, importeFactura: 118000 }).resultado).toBe("OK"); // +1.7 %
    const caro = conciliarTresVias({ ...args, importeFactura: 120000 });
    expect(caro.resultado).toBe("DIFERENCIA_PRECIO");
    expect(caro.diferencia).toBe(4000);
    expect(conciliarTresVias({ ...args, importeFactura: null }).resultado).toBe("SIN_FACTURA");
    const exceso = conciliarTresVias({ ...args, partidas: [{ ...partidas[0], cantidadRecibidaAcumulada: 11 }], importeFactura: 116000 });
    expect(exceso.resultado).toBe("DIFERENCIA_CANTIDAD");
  });

  it("evalúa al proveedor con el scorecard ponderado", () => {
    expect(evaluarProveedor({ recepciones: [], cantidadOrdenada: 0, cantidadRecibida: 0 })).toBeNull();
    const bueno = evaluarProveedor({
      recepciones: [
        { aTiempo: true, cantidadRecibida: 100, cantidadRechazada: 0, conciliacion: "OK" },
        { aTiempo: true, cantidadRecibida: 50, cantidadRechazada: 0, conciliacion: "OK" },
      ],
      cantidadOrdenada: 150,
      cantidadRecibida: 150,
    })!;
    expect(bueno).toMatchObject({ puntaje: 100, clase: "A" });
    const malo = evaluarProveedor({
      recepciones: [
        { aTiempo: false, cantidadRecibida: 50, cantidadRechazada: 50, conciliacion: "DIFERENCIA_PRECIO" },
        { aTiempo: false, cantidadRecibida: 10, cantidadRechazada: 0, conciliacion: "SIN_FACTURA" },
      ],
      cantidadOrdenada: 200,
      cantidadRecibida: 60,
    })!;
    // calidad 0.5455·35 + puntualidad 0 + cumplimiento 0.3·20 + facturación 0 = 25
    expect(malo.puntaje).toBe(25);
    expect(malo.clase).toBe("D");
  });
});

describe("inventario: EOQ, ROP, ABC", () => {
  it("calcula EOQ, stock de seguridad y punto de reorden", () => {
    // D = 1200, S = $500 (50000 c), H = 25 % de $100 = $25 (2500 c) → √(2·1200·50000/2500) = √48000 ≈ 219.09
    expect(loteEconomico(1200, 50000, 2500)).toBeCloseTo(219.089, 2);
    expect(loteEconomico(0, 50000, 2500)).toBeNull();
    expect(stockSeguridad(1.65, 2, 9)).toBeCloseTo(9.9, 5);
    const p = politicaInventario(
      { demandaAnual: 3650, costoOrdenar: 50000, costoMantenerBp: 2500, costoUnitario: 10000, tiempoEntregaDias: 4, desviacionDemandaDiaria: 2, stockMinimo: 0, stockMaximo: 0 },
      1.65,
    );
    expect(p.demandaDiaria).toBe(10);
    expect(p.stockSeguridad).toBeCloseTo(6.6, 5);
    expect(p.puntoReorden).toBeCloseTo(46.6, 5);
    expect(p.eoq).toBeCloseTo(Math.sqrt((2 * 3650 * 50000) / 2500), 5);
  });

  it("el ROP respeta el stock mínimo", () => {
    const p = politicaInventario({ demandaAnual: 0, costoOrdenar: 0, costoMantenerBp: 0, costoUnitario: 0, tiempoEntregaDias: 5, desviacionDemandaDiaria: 0, stockMinimo: 20, stockMaximo: 100 }, 1.65);
    expect(p.puntoReorden).toBe(20);
    expect(p.eoq).toBeNull();
  });

  it("sugiere cantidad solo cuando la posición cae al ROP", () => {
    expect(cantidadSugerida({ existencia: 50, enTransito: 0, puntoReorden: 40, eoq: 100, stockMaximo: 0 })).toBe(0);
    expect(cantidadSugerida({ existencia: 30, enTransito: 0, puntoReorden: 40, eoq: 100.2, stockMaximo: 0 })).toBe(101);
    expect(cantidadSugerida({ existencia: 30, enTransito: 20, puntoReorden: 40, eoq: 100, stockMaximo: 0 })).toBe(0);
    // Sin EOQ: rellena hasta el máximo
    expect(cantidadSugerida({ existencia: 5, enTransito: 0, puntoReorden: 20, eoq: null, stockMaximo: 100 })).toBe(95);
    // EOQ excede el máximo: se recorta
    expect(cantidadSugerida({ existencia: 10, enTransito: 0, puntoReorden: 20, eoq: 500, stockMaximo: 100 })).toBe(90);
    // Nunca deja la posición bajo el ROP
    expect(cantidadSugerida({ existencia: 0, enTransito: 0, puntoReorden: 50, eoq: 10, stockMaximo: 0 })).toBe(50);
  });

  it("clasifica ABC por valor de consumo", () => {
    const abc = clasificarABC([
      { id: "a", valorConsumo: 700 },
      { id: "b", valorConsumo: 150 },
      { id: "c", valorConsumo: 100 },
      { id: "d", valorConsumo: 50 },
      { id: "e", valorConsumo: 0 },
    ]);
    expect(Object.fromEntries(abc)).toEqual({ a: "A", b: "A", c: "B", d: "C", e: "C" });
  });

  it("costo promedio ponderado", () => {
    expect(costoPromedioPonderado(10, 1000, 10, 2000)).toBe(1500);
    expect(costoPromedioPonderado(0, 0, 5, 1234)).toBe(1234);
    expect(costoPromedioPonderado(-2, 1000, 5, 1234)).toBe(1234);
  });
});

describe("crédito", () => {
  const politica = { diasGraciaCredito: 15, puntajeCreditoMinimo: 60, puntajeCreditoRevision: 40 };
  const sano: EntradaCredito = {
    estadoCliente: "ACTIVO",
    limiteCredito: 1_000_000,
    saldoActual: 100_000,
    montoPedido: 100_000,
    maxDiasVencido: 0,
    fraccionVencida: 0,
    atrasoPromedioPago: 0,
    facturasPagadas: 5,
  };

  it("aprueba a un cliente sano", () => {
    expect(evaluarCredito(sano, politica)).toMatchObject({ puntaje: 100, decision: "APROBAR" });
  });

  it("manda a revisión si excede el límite aunque el puntaje sea alto", () => {
    const r = evaluarCredito({ ...sano, montoPedido: 950_000 }, politica);
    expect(r.puntaje).toBe(60);
    expect(r.decision).toBe("REVISAR");
  });

  it("rechaza suspendidos, sin línea o con mal historial", () => {
    expect(evaluarCredito({ ...sano, estadoCliente: "SUSPENDIDO" }, politica).decision).toBe("RECHAZAR");
    expect(evaluarCredito({ ...sano, limiteCredito: 0 }, politica).decision).toBe("RECHAZAR");
    const moroso = evaluarCredito({ ...sano, maxDiasVencido: 45, fraccionVencida: 0.8, atrasoPromedioPago: 20 }, politica);
    // 100 - 20 (atraso) - 32 (vencido) - 25 (gracia) = 23
    expect(moroso).toMatchObject({ puntaje: 23, decision: "RECHAZAR" });
  });
});

describe("cobranza", () => {
  const hoy = fecha("2026-10-14");
  it("asigna tramos de antigüedad", () => {
    expect(tramoAntiguedad(fecha("2026-10-20"), hoy)).toBe("CORRIENTE");
    expect(tramoAntiguedad(fecha("2026-10-14"), hoy)).toBe("CORRIENTE");
    expect(tramoAntiguedad(fecha("2026-10-13"), hoy)).toBe("D1_30");
    expect(tramoAntiguedad(fecha("2026-08-30"), hoy)).toBe("D31_60");
    expect(tramoAntiguedad(fecha("2026-07-20"), hoy)).toBe("D61_90");
    expect(tramoAntiguedad(fecha("2026-01-01"), hoy)).toBe("MAS_90");
  });

  it("resume saldos y provisión", () => {
    const r = resumenAntiguedad(
      [
        { saldo: 10000, fechaVencimiento: fecha("2026-11-01") },
        { saldo: 10000, fechaVencimiento: fecha("2026-10-01") },
        { saldo: 10000, fechaVencimiento: fecha("2026-01-01") },
        { saldo: 0, fechaVencimiento: fecha("2026-01-01") },
      ],
      hoy,
    );
    expect(r.total).toBe(30000);
    expect(r.MAS_90).toEqual({ saldo: 10000, cuentas: 1 });
    expect(r.provision).toBe(300 + 8000);
  });

  it("escala si hay promesa incumplida", () => {
    expect(accionSugerida(5, true)).toMatch(/incumplida/);
    expect(accionSugerida(120, false)).toMatch(/jurídico/);
  });
});

describe("finanzas", () => {
  it("calcula DSO, DPO, DIO y ciclo de conversión", () => {
    const i = indicadoresFinancieros({ ventas: 900000, costoVentas: 600000, compras: 600000, saldoClientes: 300000, saldoProveedores: 200000, valorInventario: 400000, diasPeriodo: 90 });
    expect(i.margenBruto).toBeCloseTo(1 / 3, 5);
    expect(i.dso).toBe(30);
    expect(i.dpo).toBe(30);
    expect(i.dio).toBe(60);
    expect(i.ccc).toBe(60);
    expect(indicadoresFinancieros({ ventas: 0, costoVentas: 0, compras: 0, saldoClientes: 0, saldoProveedores: 0, valorInventario: 0, diasPeriodo: 90 }).ccc).toBeNull();
  });

  it("prioriza pagos vencidos y críticos con efectivo limitado", () => {
    const hoy = fecha("2026-10-14");
    const r = priorizarPagos(
      [
        { id: "lejana", saldo: 50000, fechaVencimiento: fecha("2026-12-30"), criticidadProveedor: "NORMAL" },
        { id: "vencida", saldo: 30000, fechaVencimiento: fecha("2026-10-01"), criticidadProveedor: "NORMAL" },
        { id: "critica", saldo: 40000, fechaVencimiento: fecha("2026-10-20"), criticidadProveedor: "CRITICO" },
      ],
      50000,
      hoy,
    );
    expect(r.map((x) => x.id)).toEqual(["vencida", "critica", "lejana"]);
    expect(r[0]).toMatchObject({ incluido: true, montoSugerido: 30000 });
    expect(r[1]).toMatchObject({ incluido: true, montoSugerido: 20000 });
    expect(r[2]).toMatchObject({ incluido: false, montoSugerido: 0 });
  });
});

describe("ITIL", () => {
  it("prioridad por impacto × urgencia y SLA", () => {
    expect(prioridadItil(1, 1)).toBe(1);
    expect(prioridadItil(1, 3)).toBe(3);
    expect(prioridadItil(3, 3)).toBe(5);
    expect(prioridadItil(9, -1)).toBe(3);
    const creado = new Date("2026-10-14T10:00:00Z");
    expect(vencimientoSla(creado, 1).toISOString()).toBe("2026-10-14T14:00:00.000Z");
  });

  it("controla transiciones y aprobación de cambios", () => {
    expect(requiereAprobacionCambio("ESTANDAR")).toBe(false);
    expect(requiereAprobacionCambio("NORMAL")).toBe(true);
    expect(transicionesPermitidas("CAMBIO", "PENDIENTE_APROBACION")).toEqual(["APROBADO", "RECHAZADO"]);
    expect(transicionesPermitidas("INCIDENTE", "NUEVO")).toContain("EN_PROCESO");
    expect(transicionesPermitidas("INCIDENTE", "CERRADO")).toEqual([]);
  });

  it("detecta incumplimiento de SLA", () => {
    const venceEn = new Date("2026-10-14T12:00:00Z");
    expect(slaIncumplido({ venceEn, resueltoEn: null, estado: "NUEVO" }, new Date("2026-10-14T13:00:00Z"))).toBe(true);
    expect(slaIncumplido({ venceEn, resueltoEn: new Date("2026-10-14T11:00:00Z"), estado: "RESUELTO" }, new Date("2026-10-20T00:00:00Z"))).toBe(false);
  });
});

describe("ISO/IEC 27001: riesgos", () => {
  it("matriz 5×5 y apetito de riesgo", () => {
    expect(valorRiesgo(5, 5)).toBe(25);
    expect(nivelRiesgo(4)).toBe("BAJO");
    expect(nivelRiesgo(9)).toBe("MEDIO");
    expect(nivelRiesgo(12)).toBe("ALTO");
    expect(nivelRiesgo(20)).toBe("CRITICO");
    expect(validarTratamiento(12, "ACEPTAR", false)).toMatch(/administrador/);
    expect(validarTratamiento(12, "ACEPTAR", true)).toBeNull();
    expect(validarTratamiento(6, "ACEPTAR", false)).toBeNull();
  });
});

describe("COBIT: madurez y semáforos", () => {
  const controles = [
    { clave: "APO10", nivelActual: 2, nivelObjetivo: 3, aplicable: true },
    { clave: "DSS06", nivelActual: 1, nivelObjetivo: 4, aplicable: true },
    { clave: "MEA01", nivelActual: 3, nivelObjetivo: 3, aplicable: true },
    { clave: "X", nivelActual: 0, nivelObjetivo: 5, aplicable: false },
  ];
  it("calcula brechas, madurez y cumplimiento", () => {
    expect(brecha(controles[1])).toBe(3);
    expect(madurezPromedio(controles)).toBe(2);
    expect(cumplimiento(controles)).toBeCloseTo(1 / 3, 5);
    expect(prioridadesMejora(controles).map((c) => c.clave)).toEqual(["DSS06", "APO10"]);
  });
  it("semáforo según sentido de la meta", () => {
    expect(semaforo(0.95, 0.9, "mayor")).toBe("verde");
    expect(semaforo(0.85, 0.9, "mayor")).toBe("amarillo");
    expect(semaforo(0.5, 0.9, "mayor")).toBe("rojo");
    expect(semaforo(65, 60, "menor")).toBe("amarillo");
    expect(semaforo(null, 60, "menor")).toBe("gris");
  });
});

describe("permisos y segregación de funciones", () => {
  it("lee las áreas de la membresía", () => {
    expect(areasDeMembresia(null)).toEqual(["COMPRAS", "ALMACEN", "VENTAS", "COBRANZA", "FINANZAS"]);
    expect(areasDeMembresia("FINANZAS,APROBADOR,XYZ")).toEqual(["FINANZAS", "APROBADOR"]);
    expect(areasDeMembresia("")).toEqual([]);
    expect(areasATexto(["APROBADOR", "COMPRAS", "nada"])).toBe("COMPRAS,APROBADOR");
  });
  it("aplica rol y área", () => {
    expect(puedeOperar("ADMIN", [], "FINANZAS")).toBe(true);
    expect(puedeOperar("CONSULTA", ["FINANZAS"], "FINANZAS")).toBe(false);
    expect(puedeOperar("CAPTURISTA", ["COMPRAS"], "FINANZAS")).toBe(false);
  });
  it("bloquea o advierte acciones incompatibles", () => {
    expect(verificarSegregacion("RECIBE_PAGA", "u1", "u2", true)).toEqual({ permitido: true });
    expect(verificarSegregacion("RECIBE_PAGA", "u1", null, true)).toEqual({ permitido: true });
    expect(verificarSegregacion("RECIBE_PAGA", "u1", "u1", true).permitido).toBe(false);
    expect(verificarSegregacion("RECIBE_PAGA", "u1", "u1", false)).toMatchObject({ permitido: true, advertencia: expect.stringMatching(/recepción/) });
  });
});
