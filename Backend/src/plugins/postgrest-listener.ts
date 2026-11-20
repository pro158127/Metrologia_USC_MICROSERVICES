import { FastifyInstance } from 'fastify';
import { Client, ClientConfig } from 'pg';
import fp from 'fastify-plugin';

async function postgresListenerPluginHandler(fastify: FastifyInstance) {
  const dbEnv = process.env.DB_ENV;
  // Es la misma variable que declara el datasource de Prisma.
  const connectionString = process.env.DATABASE_URL_LOCAL;
  if (!connectionString) throw new Error('DATABASE_URL_LOCAL es requerida para LISTEN');
  const sslMode = new URL(connectionString).searchParams.get('sslmode');
  const useSSL = !sslMode && (dbEnv === 'aws' || dbEnv === 'production');
  const clientConfig: ClientConfig = {
    connectionString,
    keepAlive: true,
    connectionTimeoutMillis: 5000,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
  };

  let escuchandoAntes = false;
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
          const { tabla, operacion, data } = JSON.parse(msg.payload);
          if (typeof tabla !== 'string') return;

          const cambio = { tabla, operacion };
          if (tabla === 'notificaciones') {
            const usuario = Number(data?.ID_USUARIO_FK ?? data?.idUsuario ?? data?.id_usuario);
            if (Number.isSafeInteger(usuario) && usuario > 0) {
              fastify.io.to(`user_room_${usuario}`).emit('cambio_realtime', cambio);
            } else {
              // Un trigger anterior podía truncar incluso el destinatario.
              fastify.io.emit('cambio_realtime', { tabla });
            }
          } else {
            fastify.io.emit('cambio_realtime', cambio);
          }
        } catch (err) {
          console.error('❌ Error parseando payload de Postgres:', err);
        }
      }
    });

    client.on('error', (err) => {
      console.error('❌ Error en el cliente de PostgreSQL:', err.message);
      if (pgClient === client) scheduleReconnect();
    });
    client.on('end', () => {
      if (pgClient === client) scheduleReconnect();
    });

    try {
      await client.connect();
      await client.query('LISTEN cambio_tablas');
      if (escuchandoAntes) fastify.io.emit('realtime_resync');
      escuchandoAntes = true;
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
