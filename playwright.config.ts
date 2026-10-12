import { defineConfig, devices } from "@playwright/test";

// Pruebas de punta a punta contra un build de producción con base de datos y almacenamiento
// propios (no tocan prisma/dev.db). El envío a VUCEM usa el simulador interno.
const PUERTO = 3200;
const URL = `http://localhost:${PUERTO}`;

const entorno = {
  DATABASE_URL: "file:./prisma/e2e.db",
  STORAGE_DIR: "./storage-e2e",
  APP_URL: URL,
  APP_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
  VUCEM_SIMULADOR: "true",
  PERMITIR_REGISTRO: "true",
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  globalSetup: "./e2e/preparar.ts",
  webServer: {
    command: `npx next start -p ${PUERTO}`,
    url: `${URL}/login`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: entorno,
  },
});

export { entorno as ENTORNO_E2E };
