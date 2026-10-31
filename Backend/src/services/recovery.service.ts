// services/recovery.service.ts
// Utilidades de código de verificación (OTP) por correo.
// El código se guarda hasheado en Redis con TTL, bajo un namespace que
// permite reutilizarlo en distintos flujos (recuperación de acceso y
// cambio de contraseña) sin colisionar las claves.
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { getRedisConnection } from '../lib/queue/queue.js';

const CODIGO_TTL_SEG = 15 * 60; // 15 minutos de validez
const MAX_INTENTOS_CODIGO = 5;
const THROTTLE_SEG = 60; // mínimo 60s entre solicitudes por entidad

function claveCodigo(ns: string, id: string): string {
  return `${ns}:codigo:${id}`;
}
function claveIntentos(ns: string, id: string): string {
  return `${ns}:intentos:${id}`;
}
function claveThrottle(ns: string, id: string): string {
  return `${ns}:throttle:${id}`;
}

function hashCodigo(codigo: string): string {
  return createHash('sha256').update(codigo).digest('hex');
}

/** Genera un código numérico de 6 dígitos usando CSPRNG. */
export function generarCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** True si se permite enviar un nuevo código (throttle por entidad). */
export async function permitirSolicitud(ns: string, id: string): Promise<boolean> {
  const redis = getRedisConnection();
  const resultado = await redis.set(claveThrottle(ns, id), '1', 'EX', THROTTLE_SEG, 'NX');
  return resultado === 'OK';
}

/** Guarda el hash del código y resetea el contador de intentos. */
export async function guardarCodigo(ns: string, id: string, codigo: string): Promise<void> {
  const redis = getRedisConnection();
  await redis.set(claveCodigo(ns, id), hashCodigo(codigo), 'EX', CODIGO_TTL_SEG);
  await redis.del(claveIntentos(ns, id));
}

export type ResultadoVerificacion = 'ok' | 'invalido' | 'expirado' | 'agotado';

/**
 * Verifica el código ingresado (comparación en tiempo constante).
 * Consume el código si es correcto y bloquea tras superar el máximo de intentos.
 */
export async function verificarCodigo(ns: string, id: string, codigo: string): Promise<ResultadoVerificacion> {
  const redis = getRedisConnection();
  const almacenado = await redis.get(claveCodigo(ns, id));
  if (!almacenado) return 'expirado';

  const intentos = Number((await redis.get(claveIntentos(ns, id))) ?? '0');
  if (intentos >= MAX_INTENTOS_CODIGO) {
    await redis.del(claveCodigo(ns, id));
    return 'agotado';
  }

  const hashRecibido = Buffer.from(hashCodigo(codigo));
  const hashEsperado = Buffer.from(almacenado);
  const valido =
    hashRecibido.length === hashEsperado.length &&
    timingSafeEqual(hashRecibido, hashEsperado);

  if (!valido) {
    await redis.incr(claveIntentos(ns, id));
    await redis.expire(claveIntentos(ns, id), CODIGO_TTL_SEG);
    return 'invalido';
  }

  await redis.del(claveCodigo(ns, id));
  await redis.del(claveIntentos(ns, id));
  return 'ok';
}
