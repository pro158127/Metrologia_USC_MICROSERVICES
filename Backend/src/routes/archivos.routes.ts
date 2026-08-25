import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { generarUrlResponseSchema,generarUrlBodySchema } from './schema.sign_document.js';
// IMPORTANTE: Usa el cliente configurado con tu dominio público, no el interno de Docker
import { s3ClientPublic, BUCKET_NAME } from '../lib/s3Client.js'; 
import { 
  serializerCompiler, 
  validatorCompiler, 

} from 'fastify-type-provider-zod';
// --- SCHEMAS ---


// --- ENDPOINT ---
export default async function archivosRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler)
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/api/v1/archivos/generar-url',
    {
      preHandler: [fastify.authenticate], // Protegemos la ruta
      schema: {
        body: generarUrlBodySchema,
        response: { 200: generarUrlResponseSchema,500:generarUrlResponseSchema },
      },
    },
    async (request, reply) => {
      const { s3Key } = request.body;

      try {
        const command = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: s3Key,
        });

        // Generamos la firma criptográfica válida por 15 minutos (900 segundos)
        const urlFirmada = await getSignedUrl(s3ClientPublic, command, { expiresIn: 900 });

        return reply.code(200).send({ ok: true as const, url:urlFirmada});
      } catch (error) {
        
        return reply.code(500).send({ok:false,error:"no se pudo devlver firma de archivo"});
      }
    }
  );
}