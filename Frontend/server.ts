import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { Client } from 'pg';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

declare global {
  var io: SocketIOServer | undefined;
}

app.prepare().then(async () => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // 1. Inicializar Socket.io sobre el servidor HTTP
  const io = new SocketIOServer(server, {
    cors: {
      origin: true, // Acepta peticiones dinámicas de red local (192.168.x.x, localhost)
      credentials: true
    },
    transports: ["websocket", "polling"]
  });

  global.io = io;

  // 2. GESTIÓN DE CONEXIONES Y SALAS PRIVADAS
  io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId as string | undefined;

    const unirseASala = (id: string) => {
      if (id && id !== 'undefined' && id !== 'null') {
        const salaDestino = `user_room_${id}`;
        socket.join(salaDestino);
        console.log(`👤 Socket [${socket.id}] unido a la sala: ${salaDestino}`);
      }
    };

    // Unirse inmediatamente si viene autenticado
    if (userId) unirseASala(userId);

    // Evento explícito por si el token/sesión de NextAuth tarda en cargar en el cliente
    socket.on('unirse_sala_usuario', (id: string) => unirseASala(id));

    socket.on('disconnect', () => {
      console.log(`🔌 Cliente desconectado (Socket ID: ${socket.id})`);
    });
  });

  // 3. CONEXIÓN A POSTGRESQL (LISTEN/NOTIFY)
  const isLocalDb = process.env.DATABASE_URL?.includes('localhost') || process.env.DATABASE_URL?.includes('127.0.0.1');

  const pgClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: isLocalDb ? false : { rejectUnauthorized: false }
  });

  try {
    await pgClient.connect();
    await pgClient.query('LISTEN cambio_tablas');
    console.log('🔈 PostgreSQL escuchando canal "cambio_tablas" en tiempo real');

    pgClient.on('notification', (msg) => {
      if (msg.channel === 'cambio_tablas' && msg.payload) {
        try {
          const evento = JSON.parse(msg.payload);
          const { tabla, operacion, data } = evento;

         const clientesConectados = io.engine.clientsCount;
console.log(`📡 Cambio detectado -> Tabla: "${tabla}" | Operación: ${operacion} | 👥 Clientes socket activos: ${clientesConectados}`);

          // ENRUTAMIENTO DE EVENTOS
          if (tabla === 'notificaciones') {
            // Tolerancia a fallos en mayúsculas/minúsculas de la BD
            const targetUserId = data?.ID_USUARIO_FK ?? data?.idUsuario ?? data?.id_usuario;

            if (targetUserId) {
              const salaDestino = `user_room_${targetUserId}`;

              // Emitir únicamente al usuario dueño de la notificación
              io.to(salaDestino).emit('cambio_realtime', {
                tabla,
                operacion,
                data
              });

              console.log(`🔒 Notificación [${operacion}] enviada a ${salaDestino}`);
            } else {
              console.warn('⚠️ Evento en "notificaciones" omitido: No se encontró ID_USUARIO_FK en el payload:', data);
            }
          } else {
            // Tablas globales (usuarios, tarifas, roles, etc.)
            io.emit('cambio_realtime', {
              tabla,
              operacion,
              data
            });
          }
        } catch (parseErr) {
          console.error('❌ Error al parsear el JSON recibido de Postgres:', parseErr);
        }
      }
    });

    pgClient.on('error', (err) => console.error('❌ Error en el cliente Postgres LISTEN:', err));

  } catch (err) {
    console.error('❌ Error al conectar Postgres Realtime:', err);
  }

  // 4. INICIALIZAR SERVIDOR
  const port = Number(process.env.PORT) || 3000;
  const host = '0.0.0.0';

  server.listen(port, host, () => {
    console.log(`> Servidor Enterprise listo en http://${host}:${port}`);
  });
});