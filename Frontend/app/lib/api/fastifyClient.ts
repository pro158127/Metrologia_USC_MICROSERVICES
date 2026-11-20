import { generarTokenBackend } from '@/app/lib/auth-token';

// Usa variable de entorno con fallback para compatibilidad en Docker / Local
export const BASE_URL = process.env.BACKEND_INTERNAL_URL || 'http://metrologia_backend:3001';

export interface FastifyRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

interface SessionLike {
  user?: {
    id?: string | number;
    id_user?: string | number;
    email?: string | null;
    name?: string | null;
    role?: string;
    permissions?: { permisos?: Record<string, unknown> } | null;
    sessionVersion?: number;
  } | null;
}

export class FastifyHttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function fastifyRequest<T = unknown>(
  session: SessionLike | null,
  path: string,
  opts: FastifyRequestOptions = {}
): Promise<T> {
  if (!session?.user) {
    throw new FastifyHttpError(401, 'No autenticado');
  }

  const id = session.user.id_user ?? session.user.id ?? '';
  const token = await generarTokenBackend({
    sub: String(id),
    sessionVersion: session.user.sessionVersion ?? 0,
    email: session.user.email ?? '',
    name: session.user.name ?? '',
    role: session.user.role ?? '',
    user: {
      id: String(id),
      email: session.user.email ?? '',
      nombreCompleto: session.user.name ?? '',
      permissions: { permisos: session.user.permissions?.permisos ?? {} },
    },
  });

  // 1. Construir headers base
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  // 2. SOLUCIÓN AL HTTP 400: Asignar Content-Type SOLO si se envía un body JSON
  const isFormData = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  if (opts.body !== undefined && !isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    ...(opts.body !== undefined
      ? { body: isFormData ? (opts.body as FormData) : JSON.stringify(opts.body) }
      : {}),
  });

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new FastifyHttpError(
      res.ok ? 502 : res.status,
      `La API devolvió una respuesta inválida (HTTP ${res.status}).`,
    );
  }

  if (!res.ok) {
    const error = (data as { error?: unknown } | null)?.error;
    throw new FastifyHttpError(res.status, typeof error === 'string' ? error : `HTTP ${res.status}`);
  }

  return data as T;
}
