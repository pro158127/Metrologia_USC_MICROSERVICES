'use client';

import { AlertTriangle } from 'lucide-react';
import type { EstadoPlantillasOperativas } from '@/app/action_module/template';

/**
 * Banner de aviso cuando alguna plantilla operativa (Cotización, Órdenes de
 * Trabajo o Recepción) no tiene su formato y/o mapeo completo.
 */
export function PlantillasIncompletasBanner({
  estado,
}: {
  estado: EstadoPlantillasOperativas | null;
}) {
  if (!estado || estado.todasCompletas) return null;

  const incompletas = estado.detalle.filter((d) => !d.completa);

  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
      <div className="text-xs leading-snug">
        <p className="font-bold">Plantillas de documento incompletas</p>
        <p className="mt-1">
          Para poder crear cotizaciones, recepciones o importar órdenes de trabajo, todas las
          plantillas deben tener su formato (archivo) y su mapeo completo. Ve a{' '}
          <span className="font-semibold">Administración → Plantillas</span>.
        </p>
        <ul className="mt-1 list-inside list-disc text-[11px] text-amber-800">
          {incompletas.map((p) => (
            <li key={p.id}>
              {p.modulo}: {p.faltantes.length > 0 ? p.faltantes.join(', ') : 'incompleta'}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
