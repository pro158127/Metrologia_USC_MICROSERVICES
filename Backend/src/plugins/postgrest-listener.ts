import { FastifyInstance } from 'fastify';
import { Client, ClientConfig } from 'pg';
import fp from 'fastify-plugin';

async function postgresListenerPluginHandler(fastify: FastifyInstance) {
  const dbEnv = process.env.DB_ENV;
  const connectionString =
    process.env.DATABASE_URL_LOCAL ||
    process.env.DATABASE_URL_AWS ||
    'postgresql://postgres:password123@postgres_db:5432/metrologia_db';

  const useSSL = dbEnv === 'aws' || dbEnv === 'production';
  const clientConfig: ClientConfig = {
    connectionString,
    keepAlive: true,
    connectionTimeoutMillis: 5000,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
  };

  let pgClient: Client | null = null;
  let isDisconnecting = false;
  let reconnectTimer: NodeJS.Timeout | null = null;

  const scheduleReconnect = () => {
    if (isDisconnecting || reconnectTimer) return;
    if (pgClient) {
      const client = pgClient;
      pgClient = null;
      // Se conservan los listeners (el guard `reconnectTimer` evita dobles
      // reintentos) para no arriesgar un 'error' sin handler tras el end().
      client.end().catch(() => {});
    }
    console.log('🔄 Reintentando conexión con PostgreSQL LISTEN en 5 segundos...');
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectAndListen();
    }, 5000);
  };

  const connectAndListen = async () => {
    const client = new Client(clientConfig);
    pgClient = client;

    client.on('notification', (msg) => {
      if (msg.channel === 'cambio_tablas' && msg.payload) {
        try {
          const evento = JSON.parse(msg.payload);
          const { tabla, operacion, data, seq, truncado } = evento;

          if (!fastify.io) {
            return;
          }

          if (tabla === 'notificaciones') {
            const targetUserId = data?.ID_USUARIO_FK ?? data?.idUsuario ?? data?.id_usuario;

            if (targetUserId) {
              const targetRoom = `user_room_${targetUserId}`;
              const roomSockets = fastify.io.sockets.adapter.rooms.get(targetRoom);
              const usuarioEstaConectado = roomSockets && roomSockets.size > 0;

              if (usuarioEstaConectado) {
                fastify.io.to(targetRoom).emit('cambio_realtime', { tabla, operacion, data, seq, truncado });
                fastify.io.except(targetRoom).emit('cambio_realtime', {
                  tabla,
                  operacion: 'DELETE',
                  data: { id: data?.id ?? data?.ID_NOTIFICACION },
                  seq,
                  truncado,
                });
              } else {
                fastify.io.emit('cambio_realtime', {
                  tabla,
                  operacion: 'DELETE',
                  data: { id: data?.id ?? data?.ID_NOTIFICACION },
                  seq,
                  truncado,
                });
              }
            }
          } else {
            // Emisión global para las demás tablas
            fastify.io.emit('cambio_realtime', { tabla, operacion, data, seq, truncado });
          }
        } catch (err) {
          console.error('❌ Error parseando payload de Postgres:', err);
        }
      }
    });

    client.on('error', (err) => {
      console.error('❌ Error en el cliente de PostgreSQL:', err.message);
      scheduleReconnect();
    });

    try {
      await client.connect();
      await client.query('LISTEN cambio_tablas');
      console.log(`🔈 PostgreSQL (${(dbEnv ?? 'unknown').toUpperCase()}) escuchando "cambio_tablas" con éxito.`);
    } catch (err: any) {
      console.error('❌ Error al conectar el Listener de PostgreSQL:', err.message);
      scheduleReconnect();
    }
  };

  // Inicializar listener
  await connectAndListen();

  // Limpieza limpia al apagar el servidor Fastify
  fastify.addHook('onClose', async () => {
    isDisconnecting = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (pgClient) {
      await pgClient.end();
      console.log('🔌 Listener de PostgreSQL desconectado correctamente.');
    }
  });
}

export const postgresListenerPlugin = fp(postgresListenerPluginHandler);
