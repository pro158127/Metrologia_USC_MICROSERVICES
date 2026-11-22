import 'dotenv/config';
import { cerrarWorkersAlDetener } from '../lib/queue/worker-shutdown.js';
import { iniciarSnapshotWorker } from './snapshot.worker.js';
import { stampPdfWorker } from './pdfStampingWorker.js';
import { certificatePdfWorker, detenerDespachoSellados } from './certificatePdf.worker.js';
import { reportesWorker } from './reportes.worker.js';

console.log('=======================================================');
console.log('📄 [WORKER DOCUMENTOS] Iniciando gestor I/O ligero...');
console.log('=======================================================');

const snapshotWorker = iniciarSnapshotWorker();
cerrarWorkersAlDetener([snapshotWorker, stampPdfWorker, certificatePdfWorker, reportesWorker], detenerDespachoSellados);

console.log('✅ [WORKER DOCUMENTOS] Todas las colas ligeras están escuchando...');
