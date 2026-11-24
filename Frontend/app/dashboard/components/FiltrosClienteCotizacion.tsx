"use client";

import { useMemo, useState } from "react";

type ReferenciaComercial = {
  idCliente?: number | null;
  nombreCliente?: string | null;
  idCotizacion?: number | null;
  codigoCotizacion?: string | null;
};

type Opcion = { valor: string; etiqueta: string };

export function useFiltrosClienteCotizacion<T>(
  registros: readonly T[],
  obtenerReferencia: (registro: T) => ReferenciaComercial,
) {
  const [cliente, setCliente] = useState("");
  const [cotizacion, setCotizacion] = useState("");
  const filas = useMemo(() => registros.map((registro) => {
    const ref = obtenerReferencia(registro);
    const nombre = ref.nombreCliente?.trim() ?? "";
    const codigo = ref.codigoCotizacion?.trim() ?? "";
    return {
      registro, nombre, codigo,
      cliente: ref.idCliente != null ? `id:${ref.idCliente}` : nombre ? `nombre:${nombre.toLocaleLowerCase("es-CO")}` : "",
      cotizacion: codigo ? (ref.idCotizacion != null ? `id:${ref.idCotizacion}` : `codigo:${codigo}`) : "",
    };
  }), [registros, obtenerReferencia]);

  const clientes = useMemo(() => {
    const opciones = new Map<string, Opcion>();
    for (const fila of filas) {
      if (fila.cliente && fila.nombre) opciones.set(fila.cliente, { valor: fila.cliente, etiqueta: fila.nombre });
    }
    return [...opciones.values()].sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es-CO"));
  }, [filas]);

  const clienteActivo = clientes.some(({ valor }) => valor === cliente) ? cliente : "";
  const porCliente = useMemo(() => filas.filter((fila) => !clienteActivo || fila.cliente === clienteActivo), [filas, clienteActivo]);
  const cotizaciones = useMemo(() => {
    const opciones = new Map<string, Opcion>();
    for (const fila of porCliente) {
      if (fila.cotizacion) opciones.set(fila.cotizacion, { valor: fila.cotizacion, etiqueta: fila.codigo });
    }
    return [...opciones.values()].sort((a, b) => b.etiqueta.localeCompare(a.etiqueta, "es-CO", { numeric: true }));
  }, [porCliente]);

  const cotizacionActiva = cotizaciones.some(({ valor }) => valor === cotizacion) ? cotizacion : "";
  const filtrados = useMemo(() => porCliente
    .filter((fila) => !cotizacionActiva || fila.cotizacion === cotizacionActiva)
    .map(({ registro }) => registro), [porCliente, cotizacionActiva]);

  return {
    filtrados,
    controles: {
      cliente: clienteActivo,
      cotizacion: cotizacionActiva,
      clientes,
      cotizaciones,
      onClienteChange: (valor: string) => {
        setCliente(valor);
        if (valor && !filas.some((fila) => fila.cliente === valor && fila.cotizacion === cotizacion)) {
          setCotizacion("");
        }
      },
      onCotizacionChange: setCotizacion,
    },
  };
}

type Props = {
  cliente: string;
  cotizacion: string;
  clientes: Opcion[];
  cotizaciones: Opcion[];
  onClienteChange: (valor: string) => void;
  onCotizacionChange: (valor: string) => void;
};

export function FiltrosClienteCotizacion({ cliente, cotizacion, clientes, cotizaciones, onClienteChange, onCotizacionChange }: Props) {
  const claseSelector = "max-w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 sm:max-w-60";

  return (
    <div className="flex min-w-0 flex-wrap items-end gap-3">
      <label className="flex min-w-0 flex-col gap-1 text-[11px] font-semibold text-slate-600">
        Cliente
        <select className={claseSelector} value={cliente} onChange={(e) => onClienteChange(e.target.value)}>
          <option value="">Todos los clientes</option>
          {clientes.map(({ valor, etiqueta }) => <option key={valor} value={valor}>{etiqueta}</option>)}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-[11px] font-semibold text-slate-600">
        Número de cotización
        <select className={claseSelector} value={cotizacion} onChange={(e) => onCotizacionChange(e.target.value)}>
          <option value="">{cotizaciones.length ? "Todas las cotizaciones" : "Sin cotizaciones vinculadas"}</option>
          {cotizaciones.map(({ valor, etiqueta }) => <option key={valor} value={valor}>{etiqueta}</option>)}
        </select>
      </label>
    </div>
  );
}
