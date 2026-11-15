import { FastifyRequest } from 'fastify';
import { AppError } from './errors.js';

export function hasPermission(
  request: FastifyRequest,
  modulo: string,
  accion: string,
): boolean {
  const permisos = request.user?.user?.permissions?.permisos as
    | Record<string, Record<string, boolean> | undefined>
    | undefined;
  return permisos?.[modulo]?.[accion] === true;
}

export function assertPermission(
  request: FastifyRequest,
  modulo: string,
  accion: string,
): void {
  if (!hasPermission(request, modulo, accion)) {
    throw new AppError(403, `Sin permiso para ${accion} en ${modulo}.`);
  }
}

export function assertAnyPermission(
  request: FastifyRequest,
  permisos: Array<[string, string]>,
): void {
  if (!permisos.some(([modulo, accion]) => hasPermission(request, modulo, accion))) {
    throw new AppError(403, 'Sin permisos para realizar esta acción.');
  }
}
