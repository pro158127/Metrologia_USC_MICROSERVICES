// services/password.service.ts
// Utilidades centralizadas de contraseñas: hash/verify (Argon2id) y
// generación de contraseñas temporales seguras (CSPRNG nativo).
import argon2 from 'argon2';
import { randomInt, randomBytes } from 'node:crypto';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 1,
};

/** Hashea una contraseña en texto plano con Argon2id. */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

/**
 * Verifica una contraseña contra un hash. Argon2 lee los parámetros
 * (tipo, memoria, tiempo, paralelismo) del propio hash almacenado.
 */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}

// Conjuntos sin caracteres ambiguos (0/O, 1/I/l) para facilitar la lectura.
const MAY = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MIN = 'abcdefghijkmnpqrstuvwxyz';
const DIG = '23456789';
const SYM = '!@#$%&*';

/**
 * Genera una contraseña temporal robusta usando `crypto` (CSPRNG):
 * - Garantiza al menos un carácter de cada clase (mayúscula, minúscula,
 *   dígito y símbolo).
 * - Mezcla con Fisher-Yates usando `randomInt` criptográfico.
 */
export function generarContrasenaTemporalSegura(longitud = 12): string {
  const grupos = [MAY, MIN, DIG, SYM];
  const chars: string[] = grupos.map((g) => g[randomInt(g.length)]);

  const todos = MAY + MIN + DIG + SYM;
  const bytes = randomBytes(longitud);
  for (let i = chars.length; i < longitud; i++) {
    chars.push(todos[bytes[i % bytes.length] % todos.length]);
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}
