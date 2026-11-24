import assert from 'node:assert/strict';
import test from 'node:test';
import type { Prisma } from '@prisma/client';
import { completarGeneracionDocumental, prepararCorreoDocumental } from '../src/services/correo-documental.service.js';
import { abrirContenidoCorreo, protegerContenidoCorreo } from '../src/services/contenido-correo.service.js';

const job = { id_job: 'job', tipo: 2 as const, id_registro: 11, id_cotizacion: 7, action: 'ot_update' as const, tipo_entry: 'prod' as const };
const contexto = { emailDestino: 'cliente@example.invalid', numeroOT: 'OT-26-0001A' };
const archivos = { excel: 'ot/archivo.xlsx', url_pdf: 'ot/archivo.pdf' };

test('la actualización de una OT tiene un correo con su Excel vigente', () => {
  const correo = prepararCorreoDocumental(job, null, contexto, archivos);
  assert.equal(correo?.template_type, 'actualizacion_ordenes');
  assert.equal(correo?.id_cotizacion, 7);
  assert.deepEqual(correo?.minio_links, ['ot/archivo.xlsx']);
  assert.equal(prepararCorreoDocumental({ ...job, tipo_entry: 'test' }, null, contexto, archivos), null);
});

test('una generación ya completada no crea otro correo', async () => {
  let completado = false;
  const envios: Array<{ ID_JOB: string; TIPO: string }> = [];
  const tx = {
    quote: { updateMany: async () => {
      const count = completado ? 0 : 1;
      completado = true;
      return { count };
    } },
    correo_envios: { create: async ({ data }: { data: { ID_JOB: string; TIPO: string } }) => envios.push(data) },
  } as unknown as Prisma.TransactionClient;
  await completarGeneracionDocumental(tx, job, null, contexto, archivos);
  await completarGeneracionDocumental(tx, job, null, contexto, archivos);
  assert.equal(envios.length, 1);
  assert.match(envios[0].ID_JOB, /^correo-/);
});

test('el contenido secreto se cifra, se recupera y rechaza una clave distinta', (t) => {
  const anterior = process.env.AUTH_SECRET;
  t.after(() => {
    if (anterior === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = anterior;
  });
  process.env.AUTH_SECRET = 'test-secreto-desechable';
  const protegido = protegerContenidoCorreo('codigo', '893102', { expira_en: 123 });
  assert.equal(JSON.stringify(protegido).includes('893102'), false);
  assert.equal(abrirContenidoCorreo(protegido).codigo, '893102');
  process.env.AUTH_SECRET = 'test-otra-clave';
  assert.throws(() => abrirContenidoCorreo(protegido));
});
