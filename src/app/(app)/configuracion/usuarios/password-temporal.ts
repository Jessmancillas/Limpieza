import { randomInt } from "node:crypto";

// Sin caracteres que se confunden al dictarlos o copiarlos a mano (0/O, 1/l/I).
const MINUSCULAS = "abcdefghijkmnopqrstuvwxyz";
const MAYUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITOS = "23456789";
const SIMBOLOS = "-_.!@#%";
const TODOS = MINUSCULAS + MAYUSCULAS + DIGITOS + SIMBOLOS;

/**
 * Contraseña temporal aleatoria (CSPRNG) con al menos una minúscula, una mayúscula, un dígito y
 * un símbolo. Se muestra una sola vez al administrador y solo se guarda su hash.
 */
export function generarPasswordTemporal(longitud = 16): string {
  if (longitud < 8) throw new Error("La contraseña temporal debe tener al menos 8 caracteres.");
  const elegir = (alfabeto: string) => alfabeto[randomInt(alfabeto.length)];
  const caracteres = [elegir(MINUSCULAS), elegir(MAYUSCULAS), elegir(DIGITOS), elegir(SIMBOLOS)];
  while (caracteres.length < longitud) caracteres.push(elegir(TODOS));
  // Fisher-Yates para que los obligatorios no queden siempre al inicio.
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }
  return caracteres.join("");
}
