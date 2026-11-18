import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const director = await prisma.roles.findUnique({
    where: { ID_ROL_INCREMENT: 2 },
  });

  if (!director || director.NOMBRE_ROL !== 'Director Técnico') {
    throw new Error('No se encontró el rol Director Técnico con ID 2.');
  }

  const permisosActuales = director.PERMISOS_JSON as {
    [key: string]: unknown;
    permisos?: Record<string, unknown>;
  };
  const dominios = permisosActuales.permisos ?? {};
  const revision = (dominios.revision ?? {}) as Record<string, unknown>;

  await prisma.roles.update({
    where: { ID_ROL_INCREMENT: director.ID_ROL_INCREMENT },
    data: {
      PERMISOS_JSON: {
        ...permisosActuales,
        permisos: {
          ...dominios,
          revision: {
            ...revision,
            revisar_aprobar_no_acreditados: true,
          },
        },
      },
    },
  });

  console.log('Permiso de revisión de certificados no acreditados activado para Director Técnico.');
}

main()
  .catch((error) => {
    console.error('No se pudo actualizar el permiso del Director Técnico:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
