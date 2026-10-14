/**
 * Datos de demostración (FICTICIOS). Útiles para conocer la app y para las pruebas e2e.
 * Usuario: demo@ejemplo.mx · Contraseña: Demo-Permisos-2026
 */
import { randomBytes, scryptSync } from "node:crypto";

import type { PrismaClient } from "../src/generated/prisma/client";

import { sembrarDemoErp } from "./seed-demo-erp";

export const DEMO = {
  email: "demo@ejemplo.mx",
  password: "Demo-Permisos-2026",
  rfc: "DME200101AB1",
};

function hashPasswordSync(password: string): string {
  const salt = randomBytes(16);
  const params = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
  const hash = scryptSync(password, salt, 64, params);
  return ["scrypt", params.N, params.r, params.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function sembrarDemo(db: PrismaClient) {
  if (await db.usuario.findUnique({ where: { email: DEMO.email } })) {
    console.log("  Demo ya existe; se omite.");
    return;
  }

  const usuario = await db.usuario.create({
    data: { email: DEMO.email, nombre: "Usuario Demo", passwordHash: hashPasswordSync(DEMO.password) },
  });

  const empresa = await db.empresa.create({
    data: {
      rfc: DEMO.rfc,
      tipoPersona: "MORAL",
      razonSocial: "DISPOSITIVOS MEDICOS DEMO SA DE CV",
      correoElectronico: "permisos@ejemplo.mx",
      telefono: "5555555555",
      calle: "AV. EJEMPLO",
      numeroExterior: "100",
      codigoPostal: "06600",
      colonia: "JUAREZ",
      localidad: "CIUDAD DE MEXICO",
      municipio: "CUAUHTEMOC",
      entidadFederativa: "CIUDAD DE MEXICO",
      pais: "MEX",
    },
  });

  await db.membresia.create({ data: { usuarioId: usuario.id, empresaId: empresa.id, rol: "ADMIN" } });
  await db.configuracionVucem.create({
    data: { empresaId: empresa.id, ambiente: "SIMULADOR", correoDigitalizacion: "permisos@ejemplo.mx" },
  });

  const establecimiento = await db.establecimiento.create({
    data: {
      empresaId: empresa.id,
      denominacionRazonSocial: "DISPOSITIVOS MEDICOS DEMO SA DE CV - ALMACEN",
      rfcResponsableSanitario: "PEPJ800101AB1",
      correoElectronico: "responsable@ejemplo.mx",
      telefono: "5555555556",
      calle: "CALLE BODEGA",
      numeroExterior: "12",
      codigoPostal: "54060",
      entidadFederativa: "MEXICO",
      municipio: "TLALNEPANTLA DE BAZ",
      colonia: "INDUSTRIAL",
      localidad: "TLALNEPANTLA",
      noLicenciaSanitaria: "",
      tieneAvisoFuncionamiento: true,
      scian: { create: [{ clave: "435313", descripcion: "Comercio al por mayor de mobiliario, equipo e instrumental médico y de laboratorio" }] },
    },
  });

  const fabricante = await db.tercero.create({
    data: {
      empresaId: empresa.id,
      tipo: "FABRICANTE",
      tipoPersona: "MORAL",
      nacionalidad: "EXTRANJERO",
      denominacionRazonSocial: "MEDICAL DEVICES EXAMPLE INC",
      correoElectronico: "export@example.com",
      pais: "USA",
      entidadFederativa: "CA",
      codigoPostal: "94105",
      calle: "MARKET ST",
      numeroExterior: "500",
      telefono: "4155550100",
    },
  });

  await db.tercero.create({
    data: {
      empresaId: empresa.id,
      tipo: "PROVEEDOR",
      tipoPersona: "MORAL",
      nacionalidad: "EXTRANJERO",
      denominacionRazonSocial: "MEDICAL DISTRIBUTION EXAMPLE LLC",
      correoElectronico: "sales@example.com",
      pais: "USA",
      entidadFederativa: "TX",
      codigoPostal: "78701",
      calle: "CONGRESS AVE",
      numeroExterior: "200",
    },
  });

  await db.tercero.create({
    data: {
      empresaId: empresa.id,
      tipo: "DESTINATARIO",
      tipoPersona: "MORAL",
      nacionalidad: "NACIONAL",
      denominacionRazonSocial: "DISPOSITIVOS MEDICOS DEMO SA DE CV",
      rfc: DEMO.rfc,
      correoElectronico: "permisos@ejemplo.mx",
      pais: "MEX",
      entidadFederativa: "MEXICO",
      municipio: "TLALNEPANTLA DE BAZ",
      colonia: "INDUSTRIAL",
      localidad: "TLALNEPANTLA",
      codigoPostal: "54060",
      calle: "CALLE BODEGA",
      numeroExterior: "12",
      telefono: "5555555556",
    },
  });

  await db.producto.create({
    data: {
      empresaId: empresa.id,
      denominacionEspecifica: "JERINGA DESECHABLE ESTERIL 5 ML",
      denominacionDistintiva: "MARCA DEMO",
      denominacionComunCientifica: "JERINGA HIPODERMICA",
      fraccionArancelaria: "90183101",
      descripcionFraccion: "Jeringas, incluso con agujas (de plástico)",
      desUMC: "PIEZA",
      umc: "6",
      umt: "6",
      presentacionTipoEnvase: "CAJA CON 100 PIEZAS",
      numRegistroSanitario: "1234C2020 SSA",
      vigenciaRegistroSanitario: new Date("2030-06-30T12:00:00.000Z"),
      cvePaisOrigen: "USA",
      fabricanteId: fabricante.id,
    },
  });

  await sembrarDemoErp(db, empresa.id, usuario.id);

  console.log(`  Demo creado: ${DEMO.email} / ${DEMO.password} (establecimiento ${establecimiento.id})`);
}
