// app/api/excel/snapshot/route.ts
import { NextResponse } from "next/server";
import { Worker } from "worker_threads";
import { realpath } from "node:fs/promises";
import path from "path";
import { auth } from "@/app/Login/types/auth";
import { cacheService } from "@/app/lib/cache/chacheService";

/**
 * Envoltorio asíncrono para ejecutar el Worker Thread sin congelar el Event Loop
 */
function ejecutarWorkerExcel(absolutePath: string, documentId: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(process.cwd(), "app", "lib", "Workers", "excelParse.worker.mjs");

    const worker = new Worker(workerPath, {
      workerData: { absolutePath, documentId },
    });

    worker.on("message", (msg: unknown) => {
      const resultado = msg as { success?: boolean; snapshot?: unknown; error?: string };
      if (resultado.success) {
        resolve(resultado.snapshot);
      } else {
        reject(new Error(resultado.error || "Error desconocido procesando el Excel"));
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
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Debes iniciar sesión" }, { status: 401 });
    }

    let permisos: unknown = session.user.permissions;
    if (typeof permisos === "string") {
      try {
        permisos = JSON.parse(permisos);
      } catch {
        permisos = null;
      }
    }
    const puedeConfigurarPlantillas =
      (permisos as { permisos?: Record<string, Record<string, boolean>> } | null)
        ?.permisos?.administracion?.configurar_plantillas_documentos === true;
    if (!puedeConfigurarPlantillas) {
      return NextResponse.json({ error: "No tienes permiso para importar plantillas" }, { status: 403 });
    }

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
    if (typeof relativeFilePath !== "string" || !relativeFilePath.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json(
        { error: "La ruta debe apuntar a un archivo Excel .xlsx" },
        { status: 400 }
      );
    }

    const projectRoot = await realpath(process.cwd());
    let absolutePath = path.resolve(projectRoot, relativeFilePath);
    if (!absolutePath.startsWith(`${projectRoot}${path.sep}`)) {
      return NextResponse.json(
        { error: "La ruta del archivo no puede salir del directorio del proyecto" },
        { status: 400 }
      );
    }
    absolutePath = await realpath(absolutePath);
    if (!absolutePath.startsWith(`${projectRoot}${path.sep}`)) {
      return NextResponse.json(
        { error: "La ruta real del archivo no puede salir del directorio del proyecto" },
        { status: 400 }
      );
    }
    const nuevoSnapshot = await ejecutarWorkerExcel(absolutePath, documentId);

    // 3. GUARDAR EN CACHÉ PARA FUTURAS PETICIONES
    await cacheService.set(cacheKey, nuevoSnapshot);

    return NextResponse.json({
      source: "WORKER_MISS_PARSED",
      latency: "Calculada en hilo secundario",
      snapshot: nuevoSnapshot,
    });

  } catch (error: unknown) {
    console.error("[API_EXCEL_SNAPSHOT_ERROR]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno del servidor" },
      { status: 500 }
    );
  }
}
