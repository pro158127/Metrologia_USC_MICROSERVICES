import type { Worker } from 'bullmq';

export function cerrarWorkersAlDetener(
  workers: ReadonlyArray<Pick<Worker, 'name' | 'close'>>,
  detenerDespacho?: () => void,
): void {
  let cerrando = false;
  const cerrar = async () => {
    if (cerrando) return;
    cerrando = true;
    detenerDespacho?.();
    const resultados = await Promise.allSettled(workers.map((worker) => worker.close()));
    let codigoSalida = 0;
    resultados.forEach((resultado, index) => {
      if (resultado.status === 'rejected') {
        codigoSalida = 1;
        console.error(`[workers] Falló el cierre de ${workers[index].name}:`, resultado.reason);
      }
    });
    process.exit(codigoSalida);
  };

  process.once('SIGTERM', () => { void cerrar(); });
  process.once('SIGINT', () => { void cerrar(); });
}
