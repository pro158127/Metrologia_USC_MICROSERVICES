'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Worker } = require('node:worker_threads');

const frontendRoot = path.resolve(__dirname, '..', 'Frontend');
const ExcelJS = require(require.resolve('exceljs', { paths: [frontendRoot] }));
const workerPath = path.join(frontendRoot, 'app', 'lib', 'Workers', 'excelParse.worker.js');

function procesarArchivo(absolutePath, documentId) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData: { absolutePath, documentId } });
    let resultadoRecibido = false;

    worker.once('message', (result) => {
      resultadoRecibido = true;
      resolve(result);
    });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (!resultadoRecibido || code !== 0) {
        reject(new Error(`El worker terminó sin resultado (código ${code})`));
      }
    });
  });
}

async function main() {
  const filePath = path.join(os.tmpdir(), `metrologia-worker-${process.pid}.xlsx`);
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Prueba');
    sheet.getCell('A1').value = 'OT-DE-PRUEBA';
    sheet.getCell('B2').value = 27;
    await workbook.xlsx.writeFile(filePath);

    const result = await procesarArchivo(filePath, 'documento-de-prueba');
    assert.equal(result.success, true, 'el worker debe informar éxito');
    assert.equal(result.snapshot.documentId, 'documento-de-prueba');
    assert.equal(result.snapshot.hojas[0].nombre, 'Prueba');
    assert.equal(result.snapshot.hojas[0].datos.A1.valor, 'OT-DE-PRUEBA');
    assert.equal(result.snapshot.hojas[0].datos.B2.valor, 27);

    console.log('Excel worker smoke test: PASS');
  } finally {
    await fs.rm(filePath, { force: true });
  }
}

main().catch((error) => {
  console.error('Excel worker smoke test: FAIL');
  console.error(error);
  process.exitCode = 1;
});
