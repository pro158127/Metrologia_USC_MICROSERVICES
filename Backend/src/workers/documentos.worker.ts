import 'dotenv/config';

console.log('=======================================================');
console.log('📄 [WORKER DOCUMENTOS] Iniciando gestor I/O ligero...');
console.log('=======================================================');

// 1. Despierta al encargado de los Snapshots (Excel -> Univer)
import '../workers/snapshot.worker.js'

// 2. Despierta al encargado de sellar PDFs
import './pdfStampingWorker.js';
import { iniciarSnapshotWorker } from '../workers/snapshot.worker.js';


iniciarSnapshotWorker()
console.log("iniciado worker  de snap ")

console.log('✅ [WORKER DOCUMENTOS] Todas las colas ligeras están escuchando...');