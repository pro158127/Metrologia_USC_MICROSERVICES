type Resultado = { error?: string };
type RespaldoPostgres = Resultado & { key?: string };

export async function ejecutarRespaldoProgramado(
  respaldarPostgres: () => Promise<RespaldoPostgres>,
  respaldarMinio: () => Promise<Resultado>,
  aplicarRetencion: () => Promise<Resultado>,
) {
  const [db, minio] = await Promise.allSettled([respaldarPostgres(), respaldarMinio()]);
  const falloPostgres = db.status === 'rejected' || !!db.value.error || !db.value.key;
  const falloMinio = minio.status === 'rejected' || !!minio.value.error;
  if (falloPostgres || falloMinio) {
    const fallos = [falloPostgres && 'PostgreSQL', falloMinio && 'MinIO'].filter(Boolean);
    throw new Error(`Falló el respaldo de ${fallos.join(' y ')}. Se omitió la retención.`);
  }

  const retencion = await aplicarRetencion();
  if (retencion.error) throw new Error('El respaldo se guardó, pero falló la retención.');
  return { db: db.value, minio: minio.value, retencion };
}
