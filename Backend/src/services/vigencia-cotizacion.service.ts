import type { PrismaClient } from '@prisma/client';

type Lectura = Pick<PrismaClient, 'parametros_sistema' | 'historial_estado_cotizacion'>;

export async function diasVigenciaCotizacion(db: Lectura): Promise<number> {
  const parametro = await db.parametros_sistema.findUnique({ where: { CLAVE: 'DIAS_RECHAZAR_COTIZACION' } });
  const valor = Number(parametro?.CODIGO_SCRIPT ?? Number.NaN);
  return Number.isSafeInteger(valor) && valor > 0 ? valor : 15;
}

export async function inicioVigenciaCotizacion(db: Lectura, cotizacion: {
  ID_COTIZACION: number; UPDATED_AT: Date | null; CREATED_AT: Date; ESTADO?: string;
}): Promise<Date> {
  const envio = await db.historial_estado_cotizacion.findFirst({
    where: { ID_COTIZACION_FK: cotizacion.ID_COTIZACION, ESTADO_NUEVO: 'ENVIADA' },
    orderBy: { CREATED_AT: 'desc' },
    select: { CREATED_AT: true },
  });
  return envio?.CREATED_AT ?? (cotizacion.ESTADO === 'ENVIADA' ? cotizacion.UPDATED_AT : null) ?? cotizacion.CREATED_AT;
}

export function fechaVencimientoCotizacion(inicio: Date, dias: number): Date {
  return new Date(inicio.getTime() + dias * 86_400_000);
}
