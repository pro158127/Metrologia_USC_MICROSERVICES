// app/actions/ordenes.actions.ts
'use server';

import { auth } from '@/app/Login/types/auth';
import { fastifyRequest } from '@/app/lib/api/fastifyClient';
import type {
  OrdenTrabajoModel,
  ClienteModel,
  UsuarioModel,
  RolesModel,
  TarifaModel,
  DocumentoModel,
} from '@/tipos/entidades';

type UsuarioConRolModel = UsuarioModel & { rol: RolesModel };

export interface DatosInicialesOrdenes {
  ordenes: OrdenTrabajoModel[];
  clientes: ClienteModel[];
  usuarios: UsuarioConRolModel[];
  roles: RolesModel[];
  tarifas: TarifaModel[];
  version: DocumentoModel[];
}

export async function obtenerDatosIniciales(): Promise<DatosInicialesOrdenes> {
  try {
    const session = await auth();
    return await fastifyRequest<DatosInicialesOrdenes>(
      session,
      '/api/v1/ordenes/datos-iniciales'
    );
  } catch (error) {
    console.error('Error cargando datos iniciales:', error);
    // Devuelve arreglos vacíos explícitos en lugar de undefined o lanzar throw
    return {
      ordenes: [],
      clientes: [],
      usuarios: [],
      roles: [],
      tarifas: [],
      version: [],
    };
  }
}
