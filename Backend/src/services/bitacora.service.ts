import { Prisma } from '@prisma/client';

type PrismaClientLike = {
  audit_logs: {
    create: (args: { data: Prisma.audit_logsUncheckedCreateInput }) => Promise<unknown>;
  };
};

export interface BitacoraInput {
  action: string;
  tableName: string;
  recordId: string | number;
  userId: number;
  ip?: string;
  details?: Prisma.InputJsonValue;
}

/**
 * Registra un evento en la bitácora de auditoría (`audit_logs`).
 * Acepta indistintamente un `PrismaClient` o un `Prisma.TransactionClient`,
 * de modo que puede invocarse dentro o fuera de una transacción.
 */
export async function registrarBitacora(
  client: PrismaClientLike,
  input: BitacoraInput
): Promise<void> {
  const { action, tableName, recordId, userId, ip, details } = input;

  try {
    await client.audit_logs.create({
      data: {
        action,
        tableName,
        recordId: String(recordId),
        USER_ID: userId,
        ip: ip ?? '0.0.0.0',
        details: details ?? {},
      },
    });
  } catch (error) {
    // La bitácora no debe romper el flujo principal de negocio.
    console.error('[bitacora] Error registrando auditoría:', error);
  }
}
