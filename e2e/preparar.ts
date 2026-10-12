import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

import { ENTORNO_E2E } from "../playwright.config";

/** Base de datos y almacenamiento limpios para cada corrida e2e, con datos de demostración. */
export default function preparar() {
  rmSync("prisma/e2e.db", { force: true });
  rmSync("storage-e2e", { recursive: true, force: true });
  const env = { ...process.env, ...ENTORNO_E2E };
  execSync("npx prisma migrate deploy", { stdio: "inherit", env });
  execSync("npx tsx prisma/seed.ts --demo", { stdio: "inherit", env });
}
