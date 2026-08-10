// app/api/excel/snapshot/route.ts
import { NextResponse } from "next/server";
import { Worker } from "worker_threads";
import path from "path";
import { cacheService } from "@/app/lib/cache/chacheService";

/**
 * Envoltorio asíncrono para ejecutar el Worker Thread sin congelar el Event Loop
 */
function ejecutarWorkerExcel(absolutePath: string, documentId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(process.cwd(), "lib", "workers", "excelParser.worker.js");

    const worker = new Worker(workerPath, {
      workerData: { absolutePath, documentId },
    });

    worker.on("message", (msg) => {
      if (msg.success) {
        resolve(msg.snapshot);
      } else {
        reject(new Error(msg.error || "Error desconocido procesando el Excel"));
      }
      worker.terminate();
    });

    worker.on("error", (err) => {
      reject(err);
      worker.terminate();
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`El Worker finalizó abruptamente con código de salida: ${code}`));
      }
    });
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { documentId, relativeFilePath } = body;

    if (!documentId || !relativeFilePath) {
      return NextResponse.json(
        { error: "Faltan parámetros requeridos: documentId y relativeFilePath" },
        { status: 400 }
      );
    }

    const cacheKey = `excel:snapshot:${documentId}`;

    // 1. EVALUAR CACHÉ (Estrategia Zero-Cost)
    const snapshotCached = await cacheService.get(cacheKey);

    if (snapshotCached) {
      return NextResponse.json({
        source: "CACHE_HIT",
        latency: "< 5ms",
        snapshot: snapshotCached,
      });
    }

    // 2. CACHE MISS: EJECUTAR WORKER EN HILO SECUNDARIO
    const absolutePath = path.join(process.cwd(), relativeFilePath);
    const nuevoSnapshot = await ejecutarWorkerExcel(absolutePath, documentId);

    // 3. GUARDAR EN CACHÉ PARA FUTURAS PETICIONES
    await cacheService.set(cacheKey, nuevoSnapshot);

    return NextResponse.json({
      source: "WORKER_MISS_PARSED",
      latency: "Calculada en hilo secundario",
      snapshot: nuevoSnapshot,
    });

  } catch (error: any) {
    console.error("[API_EXCEL_SNAPSHOT_ERROR]", error);
    return NextResponse.json(
      { error: error.message || "Error interno del servidor" },
      { status: 500 }
    );
  }
}