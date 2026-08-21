import { generarTokenBackend } from '@/app/lib/auth-token';

// Usa variable de entorno con fallback para compatibilidad en Docker / Local
export const BASE_URL =  'http://metrologia_backend:3001';

export interface FastifyRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

interface SessionLike {
  user?: {
    id?: string | number;
    id_user?: string | number;
    email?: string | null;
    permissions?: { permisos?: Record<string, unknown> } | null;
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
    email: session.user.email ?? '',
    user: {
      id: String(id),
      email: session.user.email ?? '',
      permissions: { permisos: session.user.permissions?.permisos ?? {} },
    },
  });

  // 1. Construir headers base
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  // 2. SOLUCIÓN AL HTTP 400: Asignar Content-Type SOLO si se envía un body
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });

  const data = (await res.json().catch(() => ({}))) as { error?: string };

  if (!res.ok) {
    throw new FastifyHttpError(res.status, data.error ?? `HTTP ${res.status}`);
  }

  return data as T;
}