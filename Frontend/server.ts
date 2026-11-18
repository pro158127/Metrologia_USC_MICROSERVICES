import { createServer } from 'http';
import { parse } from 'url';
import crypto from 'crypto';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { Client } from 'pg';

// Verifica un JWT HS256 firmado con AUTH_SECRET (compatible con @fastify/jwt
// y con el token generado en app/lib/auth-token.ts). Devuelve el subject o null.
function verificarTokenSocket(token: string): string | null {
  try {
    const [headerB64, payloadB64, signature] = token.split('.');
    if (!headerB64 || !payloadB64 || !signature) return null;
    const secret = process.env.AUTH_SECRET;
    if (!secret) return null;

    const signingInput = `${headerB64}.${payloadB64}`;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(signingInput)
      .digest('base64url');
    const recibida = Buffer.from(signature);
    const esperada = Buffer.from(expected);
    if (recibida.length !== esperada.length || !crypto.timingSafeEqual(recibida, esperada)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (typeof payload.exp === 'number' && Date.now() / 1000 > payload.exp) return null;
    return String(payload.sub);
  } catch {
    return null;
  }
}

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
  // Autenticación por JWT en el handshake (auth.token). El userId se deriva del
  // token y nunca se confía del query del cliente.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('No autenticado: falta token.'));
    const userId = verificarTokenSocket(token);
    if (!userId) return next(new Error('Token inválido o expirado.'));
    (socket as any).data = { userId };
    next();
  });

  io.on('connection', (socket) => {
    const userId = (socket as any).data?.userId as string | undefined;
    const salaDestino = `user_room_${userId}`;
    if (userId && userId !== 'undefined' && userId !== 'null') {
      socket.join(salaDestino);
      console.log(`👤 Socket [${socket.id}] autenticado, unido a la sala: ${salaDestino}`);
    }

    // Se conserva por compatibilidad; la sala siempre sale del token.
    socket.on('unirse_sala_usuario', () => {
      if (userId && userId !== 'undefined' && userId !== 'null') socket.join(salaDestino);
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Cliente desconectado (Socket ID: ${socket.id})`);
    });
  });

  // 3. CONEXIÓN A POSTGRESQL (LISTEN/NOTIFY)
  //    ⚠️ SOLO EN DESARROLLO. En producción el backend (postgrest-listener.ts) es
  //    la única fuente de LISTEN/NOTIFY; este listener duplicado se desactiva para
  //    evitar doble procesamiento y doble carga de conexiones a Postgres.
  if (dev) {
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
          const { tabla, operacion, data, seq, truncado } = evento;

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
                data,
                seq,
                truncado
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
              data,
              seq,
              truncado
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
  }

  // 4. INICIALIZAR SERVIDOR
  const port = Number(process.env.PORT) || 3000;
  const host = '0.0.0.0';

  server.listen(port, host, () => {
    console.log(`> Servidor Enterprise listo en http://${host}:${port}`);
  });
});