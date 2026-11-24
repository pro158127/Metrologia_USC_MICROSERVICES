import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ejecutarRespaldoProgramado } from '../src/services/respaldo-programado.service.js';

test('el respaldo parcial falla y conserva las copias anteriores hasta que un reintento tenga éxito', async () => {
  let copiasMinio = 0;
  let limpiezas = 0;
  const ejecutar = () => ejecutarRespaldoProgramado(
    async () => ({ key: 'backups/respaldo.sql.gz' }),
    async () => {
      copiasMinio += 1;
      if (copiasMinio === 1) throw new Error('Almacenamiento no disponible');
      return {};
    },
    async () => { limpiezas += 1; return {}; },
  );
  await assert.rejects(ejecutar(), /Falló el respaldo de MinIO/);
  assert.equal(limpiezas, 0);
  assert.equal((await ejecutar()).db.key, 'backups/respaldo.sql.gz');
  assert.equal(limpiezas, 1);
});

test('el fallo de retención se informa a la cola después de guardar ambas copias', async () => {
  await assert.rejects(ejecutarRespaldoProgramado(
    async () => ({ key: 'backups/respaldo.sql.gz' }),
    async () => ({}),
    async () => ({ error: 'MinIO no disponible' }),
  ), /falló la retención/);
});
