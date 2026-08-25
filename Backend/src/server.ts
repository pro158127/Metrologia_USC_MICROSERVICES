import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import auth from './plugins/auth.js';
import fastifyJwt from '@fastify/jwt';
// Importación de plugins
import { socketPlugin } from './plugins/socket.js';
import { postgresListenerPlugin } from './plugins/postgrest-listener.js';
import prismaPlugin from './plugins/prisma.js';
import auditRoutes from './routes/audit.routes.js';
import  excelFileRoutes  from './routes/excel-univer-parser.routes.js';
import  documentosRoutes  from './routes/documentos.routes.js';
import clientesRoutes from './routes/clientes.routes.js';
import notificacionesRoutes from './routes/notificaciones.routes.js';
import authRoutes from './routes/audit.routes.js';
import usuariosRoutes from './routes/usuarios.routes.js';
import cotizacionesRoutes from './routes/cotizaciones.routes.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import tarifasRoutes from './routes/tarifas.routes.js';
import sellosRoutes from './routes/sellos.routes.js';
import parametrosSistemaRoutes from './routes/parametros_sistema.routes.js';
import facturasRoutes from './routes/facturas.routes.js';
import certificadosRoutes from './routes/certificados.routes.js';
import certificateGeneratorRoutes from './routes/certificate-generator.routes.js';
import reportesRoutes from './routes/recepciones.routes.js';
import plantillasRoutes from './routes/plantillas.routes.js';
import plantillasGeneracionRoutes from './routes/plantillas-generacion.routes.js';
import ordenesRoutes from './routes/ordenes.routes.js';
import recepcionesRoutes from './routes/recepciones.routes.js';
import consecutivosRoutes from './routes/consecutivos.routes.js';
import fastifyMultipart from '@fastify/multipart';
import pdfRoutes from './routes/pdfRoutes.routes.js';
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
  await fastify.register(errorHandlerPlugin);

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
  await fastify.register(certificateGeneratorRoutes);
  await fastify.register(reportesRoutes);
  await fastify.register(plantillasRoutes);
  await fastify.register(plantillasGeneracionRoutes);
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