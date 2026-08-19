import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import auth from './plugins/auth';
import fastifyJwt from '@fastify/jwt';
// Importación de plugins
import { socketPlugin } from './plugins/socket';
import { postgresListenerPlugin } from './plugins/postgrest-listener';
import prismaPlugin from './plugins/prisma';
import auditRoutes from './routes/audit';
import { excelFileRoutes } from './routes/excel-univer-parser';
import { documentosRoutes } from './routes/documentos';
import clientesRoutes from './routes/clientes';
import notificacionesRoutes from './routes/notificaciones';
import authRoutes from './routes/auth';
import usuariosRoutes from './routes/usuarios';
import cotizacionesRoutes from './routes/cotizaciones';
import tarifasRoutes from './routes/tarifas';
import sellosRoutes from './routes/sellos';
import parametrosSistemaRoutes from './routes/parametros_sistema';
import facturasRoutes from './routes/facturas';
import certificadosRoutes from './routes/certificados';
import reportesRoutes from './routes/reportes';
import plantillasRoutes from './routes/plantillas';
import ordenesRoutes from './routes/ordenes';
import recepcionesRoutes from './routes/recepciones';
import consecutivosRoutes from './routes/consecutivos';
import fastifyMultipart from '@fastify/multipart';
import { pdfRoutes } from './routes/pdfRoutes';
async function bootstrap() {
  const fastify = Fastify({ logger: true });

  // 1. Middleware Base
  await fastify.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  });

  await fastify.register(fastifyMultipart, {
    limits: { fileSize: 15 * 1024 * 1024 },
  });

  // 2. Infraestructura & Plugins Globales (¡PRIMERO SOCKETS Y LUEGO POSTGRES!)
  await fastify.register(socketPlugin);
  await fastify.register(postgresListenerPlugin);
  await fastify.register(prismaPlugin);
  await fastify.register(auth);

  // 3. Registro de Rutas
  await fastify.register(auditRoutes);
  await fastify.register(pdfRoutes);
  await fastify.register(excelFileRoutes);
  await fastify.register(documentosRoutes);
  await fastify.register(clientesRoutes);
  await fastify.register(notificacionesRoutes);
  await fastify.register(authRoutes);
  await fastify.register(usuariosRoutes);
  await fastify.register(cotizacionesRoutes);
  await fastify.register(tarifasRoutes);
  await fastify.register(sellosRoutes);
  await fastify.register(parametrosSistemaRoutes);
  await fastify.register(facturasRoutes);
  await fastify.register(certificadosRoutes);
  await fastify.register(reportesRoutes);
  await fastify.register(plantillasRoutes);
  await fastify.register(ordenesRoutes);
  await fastify.register(recepcionesRoutes);
  await fastify.register(consecutivosRoutes);

  // 4. Health Check
  fastify.get('/health', async () => {
    return { status: 'online', timestamp: new Date().toISOString() };
  });

  // 5. Arrancar el servidor
  const port = Number(process.env.PORT) || 3001;
  const host = '0.0.0.0';

  try {
    await fastify.listen({ port, host });
    console.log(`🚀 Servidor Standalone corriendo en http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

bootstrap();