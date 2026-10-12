/**
 * Carga inicial de datos.
 *
 *   npm run db:seed            → catálogos, días inhábiles y definición del trámite 260211
 *   npm run db:seed -- --demo  → además, un usuario/empresa de demostración con datos ficticios
 *
 * Los catálogos se leen de prisma/datos/catalogos/*.json con el formato:
 *   { "catalogo": "CAT_PAIS", "fuente": "SEMILLA", "porConfirmar": false,
 *     "registros": [{ "clave": "MEX", "descripcion": "México", "padreClave": null }] }
 */
import "dotenv/config";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { PrismaClient } from "../src/generated/prisma/client";
import { DEFINICION_260211_INICIAL } from "../src/lib/tramite/definicion";

const db = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./prisma/dev.db" }),
});

const DIR_DATOS = path.join(__dirname, "datos");

type ArchivoCatalogo = {
  catalogo: string;
  fuente?: string;
  porConfirmar?: boolean;
  registros: Array<{ clave: string; descripcion: string; padreClave?: string | null; porConfirmar?: boolean }>;
};

async function cargarCatalogos() {
  const dir = path.join(DIR_DATOS, "catalogos");
  let archivos: string[] = [];
  try {
    archivos = (await readdir(dir)).filter((a) => a.endsWith(".json")).sort();
  } catch {
    console.warn("No hay carpeta de catálogos:", dir);
    return;
  }
  for (const archivo of archivos) {
    const datos = JSON.parse(await readFile(path.join(dir, archivo), "utf8")) as ArchivoCatalogo;
    for (const r of datos.registros) {
      await db.catalogoVucem.upsert({
        where: { catalogo_clave: { catalogo: datos.catalogo, clave: r.clave } },
        create: {
          catalogo: datos.catalogo,
          clave: r.clave,
          descripcion: r.descripcion,
          padreClave: r.padreClave ?? null,
          fuente: datos.fuente ?? "SEMILLA",
          porConfirmar: r.porConfirmar ?? datos.porConfirmar ?? false,
        },
        // No sobrescribir registros importados o editados por el usuario.
        update: {},
      });
    }
    console.log(`  ${datos.catalogo}: ${datos.registros.length} registros (${archivo})`);
  }
}

async function cargarDiasInhabiles() {
  try {
    const dias = JSON.parse(await readFile(path.join(DIR_DATOS, "dias-inhabiles.json"), "utf8")) as Array<{
      fecha: string;
      descripcion: string;
    }>;
    for (const d of dias) {
      const fecha = new Date(`${d.fecha}T12:00:00.000Z`);
      await db.diaInhabil.upsert({ where: { fecha }, create: { fecha, descripcion: d.descripcion }, update: {} });
    }
    console.log(`  Días inhábiles: ${dias.length}`);
  } catch {
    console.warn("Sin archivo prisma/datos/dias-inhabiles.json");
  }
}

async function cargarTramite() {
  const vigenteDesde = new Date("2019-04-17T00:00:00.000Z");
  await db.tramiteVersion.upsert({
    where: { claveVucem_vigenteDesde: { claveVucem: "260211", vigenteDesde } },
    create: {
      claveVucem: "260211",
      homoclave: "COFEPRIS-01-014-A",
      nombre:
        "Permiso sanitario de importación de dispositivos médicos que cuenten con registro sanitario y/o importación de fuentes de radiación",
      plataforma: "VUCEM_CLASICA",
      vigenteDesde,
      definicion: JSON.stringify(DEFINICION_260211_INICIAL),
    },
    update: {},
  });
  console.log("  Trámite 260211 listo");
}

async function main() {
  console.log("Sembrando datos…");
  await cargarCatalogos();
  await cargarDiasInhabiles();
  await cargarTramite();
  if (process.argv.includes("--demo") || process.env.SEED_DEMO === "true") {
    const { sembrarDemo } = await import("./seed-demo");
    await sembrarDemo(db);
  }
  console.log("Listo.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
