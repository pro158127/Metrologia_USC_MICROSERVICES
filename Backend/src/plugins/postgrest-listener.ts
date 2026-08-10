import { FastifyInstance } from 'fastify';
import { Client, ClientConfig } from 'pg';
import fp from 'fastify-plugin';

async function postgresListenerPluginHandler(fastify: FastifyInstance) {
  const dbEnv = process.env.DB_ENV;
  const connectionString = "postgresql://postgres:password123@postgres_db:5432/metrologia_db"
  if (!connectionString) {
    console.error('❌ Error: DATABASE_URL no está definida en las variables de entorno.');
    return;
  }

  const useSSL = dbEnv === 'aws' || dbEnv === 'production';
  const clientConfig: ClientConfig = {
    connectionString,
    keepAlive: true,
    connectionTimeoutMillis: 5000,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
  };
if(clientConfig){
  console.log("conexion establcida con exito sql",clientConfig)
}
  let pgClient: Client;
  let isDisconnecting = false;

  const connectAndListen = async () => {
    pgClient = new Client(clientConfig);

    pgClient.on('notification', (msg) => {
      if (msg.channel === 'cambio_tablas' && msg.payload) {
        try {
          console.log("📥 NOTIFICACIÓN RECIBIDA DE POSTGRESQL:", msg.payload);
          const evento = JSON.parse(msg.payload);
          const { tabla, operacion, data } = evento;

          if (!fastify.io) {
            console.warn('⚠️ Instancia de Socket.io no disponible en Fastify.');
            return;
          }

          if (tabla === 'notificaciones') {
            const targetUserId = data?.ID_USUARIO_FK ?? data?.idUsuario ?? data?.id_usuario;

            if (targetUserId) {
              const targetRoom = `user_room_${targetUserId}`;
              const roomSockets = fastify.io.sockets.adapter.rooms.get(targetRoom);
              const usuarioEstaConectado = roomSockets && roomSockets.size > 0;

              if (usuarioEstaConectado) {
                fastify.io.to(targetRoom).emit('cambio_realtime', { tabla, operacion, data });
                fastify.io.except(targetRoom).emit('cambio_realtime', {
                  tabla,
                  operacion: 'DELETE',
                  data: { id: data?.id ?? data?.ID_NOTIFICACION },
                });
              } else {
                fastify.io.emit('cambio_realtime', {
                  tabla,
                  operacion: 'DELETE',
                  data: { id: data?.id ?? data?.ID_NOTIFICACION },
                });
              }
            }
          } else {
            // Emisión global para las demás tablas
            fastify.io.emit('cambio_realtime', { tabla, operacion, data });
            console.log(`📡 Emisión global enviada vía Socket.io para la tabla: ${tabla}`);
          }
        } catch (err) {
          console.error('❌ Error parseando payload de Postgres:', err);
        }
      }
    });

    pgClient.on('error', (err) => {
      console.error('❌ Error en el cliente de PostgreSQL:', err.message);
      if (!isDisconnecting) {
        console.log('🔄 Reintentando conexión con PostgreSQL LISTEN en 5 segundos...');
        setTimeout(connectAndListen, 5000);
      }
    });

    try {
      await pgClient.connect();
      await pgClient.query('LISTEN cambio_tablas');
      console.log(`🔈 PostgreSQL (${(dbEnv ?? 'unknown').toUpperCase()}) escuchando "cambio_tablas" con éxito.`);
    } catch (err: any) {
      console.error('❌ Error al conectar el Listener de PostgreSQL:', err.message);
      if (!isDisconnecting) {
        setTimeout(connectAndListen, 5000);
      }
    }
  };

  // Inicializar listener
  await connectAndListen();

  // Limpieza limpia al apagar el servidor Fastify
  fastify.addHook('onClose', async () => {
    isDisconnecting = true;
    if (pgClient) {
      await pgClient.end();
      console.log('🔌 Listener de PostgreSQL desconectado correctamente.');
    }
  });
}

export const postgresListenerPlugin = fp(postgresListenerPluginHandler);