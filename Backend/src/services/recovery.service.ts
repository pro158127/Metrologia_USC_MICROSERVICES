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
export async function guardarCodigo(ns: string, id: string, codigo: string): Promise<number> {
  const expiraEn = Date.now() + CODIGO_TTL_SEG * 1000;
  const redis = getRedisConnection();
  const resultados = await redis.multi()
    .set(claveCodigo(ns, id), hashCodigo(codigo), 'EX', CODIGO_TTL_SEG)
    .del(claveIntentos(ns, id))
    .exec();
  for (const [error] of resultados ?? []) {
    if (error) throw error;
  }
  return expiraEn;
}

export async function codigoSigueVigente(ns: string, id: string, codigo: string): Promise<boolean> {
  const almacenado = await getRedisConnection().get(claveCodigo(ns, id));
  return almacenado === hashCodigo(codigo);
}

export async function cancelarCodigoNoEncolado(ns: string, id: string, codigo: string): Promise<void> {
  await getRedisConnection().eval(`
    if redis.call('GET', KEYS[1]) == ARGV[1] then
      return redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
    end
    return 0
  `, 3, claveCodigo(ns, id), claveIntentos(ns, id), claveThrottle(ns, id), hashCodigo(codigo));
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

  const hashRecibido = Buffer.from(hashCodigo(codigo));
  const hashEsperado = Buffer.from(almacenado);
  const valido =
    hashRecibido.length === hashEsperado.length &&
    timingSafeEqual(hashRecibido, hashEsperado);

  // La comparación en Node se conserva. Redis aplica el resultado solo
  // si el hash leído sigue vigente y serializa consumo y contador.
  return await redis.eval(`
    if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 'expirado' end
    local intentos = tonumber(redis.call('GET', KEYS[2]) or '0')
    if intentos >= tonumber(ARGV[3]) then
      redis.call('DEL', KEYS[1], KEYS[2])
      return 'agotado'
    end
    if ARGV[2] == '1' then
      redis.call('DEL', KEYS[1], KEYS[2])
      return 'ok'
    end
    local ttl = redis.call('PTTL', KEYS[1])
    redis.call('INCR', KEYS[2])
    redis.call('PEXPIRE', KEYS[2], math.max(ttl, 1))
    return 'invalido'
  `, 2, claveCodigo(ns, id), claveIntentos(ns, id), almacenado, valido ? '1' : '0', MAX_INTENTOS_CODIGO) as ResultadoVerificacion;
}
