import assert from 'node:assert/strict';
import test from 'node:test';
import type { Prisma, PrismaClient } from '@prisma/client';
import { generarConsecutivo } from '../src/services/consecutivo.service.js';
import {
  diasVigenciaCotizacion, fechaVencimientoCotizacion, inicioVigenciaCotizacion,
} from '../src/services/vigencia-cotizacion.service.js';

test('una revisión conserva el consecutivo, incluso después de 9999 altas', async () => {
  const tx = {} as Prisma.TransactionClient;
  assert.equal(await generarConsecutivo(tx, 'OT', 'OT-26-10000A'), 'OT-26-10000B');
  await assert.rejects(generarConsecutivo(tx, 'OT', 'OT-26-10000Z'), /versión Z/);
  await assert.rejects(generarConsecutivo(tx, 'REC', 'OT-26-10000A'), /consecutivo REC válido/);
});

test('una alta reserva el bloqueo anual antes de leer el máximo numérico', async () => {
  const consultas: string[] = [];
  const tx = {
    $queryRaw: async (sql: TemplateStringsArray) => {
      consultas.push(sql.join('?'));
      return consultas.length === 1 ? [{ reservado: 1 }] : [{ ultimo: 9999n }];
    },
  } as unknown as Prisma.TransactionClient;
  assert.match(await generarConsecutivo(tx, 'REC'), /^REC-\d{2}-10000A$/);
  assert.match(consultas[0], /pg_advisory_xact_lock/);
  assert.match(consultas[1], /MAX\(substring\("CODIGO_RECEPCION"/);
});

test('la vigencia usa el último envío y los días parametrizados', async () => {
  const reenvio = new Date('2026-11-15T15:30:00Z');
  const db = {
    parametros_sistema: { findUnique: async () => ({ CODIGO_SCRIPT: '10' }) },
    historial_estado_cotizacion: {
      findFirst: async (query: { orderBy: unknown; where: { ESTADO_NUEVO: string } }) => {
        assert.deepEqual(query.orderBy, { CREATED_AT: 'desc' });
        assert.equal(query.where.ESTADO_NUEVO, 'ENVIADA');
        return { CREATED_AT: reenvio };
      },
    },
  } as unknown as PrismaClient;
  const inicio = await inicioVigenciaCotizacion(db, {
    ID_COTIZACION: 12, ESTADO: 'ENVIADA', CREATED_AT: new Date('2026-11-03'), UPDATED_AT: new Date('2026-11-16'),
  });
  assert.equal(fechaVencimientoCotizacion(inicio, await diasVigenciaCotizacion(db)).toISOString(), '2026-11-25T15:30:00.000Z');
});

test('la solicitud pendiente fija código, estado y plantilla en la transacción', async () => {
  const { registrarGeneracionPendiente } = await import('../src/services/generacion-pendiente.service.js');
  const mapeo = {
    templateId: 1, templateType: 'COTIZACIONES', version: '2', fileRef: 'plantillas/cot.xlsx',
    mappings: { scalars: [], tables: [] },
  };
  const tx = {
    version_plantillas: { findMany: async () => [{
      ID_VERSION_PLANTILLA: 8, MAPPING_CONFIG: mapeo,
      INPUT_SCHEMA: { fields: { scalars: [], tables: [] } },
      documentos: { RUTA_URL: 'plantillas/cot.xlsx' },
    }] },
    cotizaciones: { findUniqueOrThrow: async () => ({ CODIGO_COTIZACION: 'COT-26-0001C', ESTADO: 'ENVIADA' }) },
    quote: { create: async ({ data }: { data: unknown }) => data },
  } as unknown as Prisma.TransactionClient;
  assert.deepEqual(await registrarGeneracionPendiente(tx, 'actualizar', {
    tipo: 1, tipo_entry: 'prod', id_registro: 7, codigo_actual: 'COT-26-0001B',
  }), {
    status: 'PENDING',
    data: {
      generacion: { nombre: 'actualizar', payload: {
        tipo: 1, tipo_entry: 'prod', id_registro: 7, codigo_actual: 'COT-26-0001C',
        estadoCotizacion: 'ENVIADA', idVersionPlantilla: 8,
        rutaPlantilla: 'plantillas/cot.xlsx', mapeoPlantilla: mapeo,
      } },
    },
  });
});
