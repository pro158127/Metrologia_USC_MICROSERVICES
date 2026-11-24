"use client";

import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useIdleTimer } from "react-idle-timer";

const INACTIVIDAD_MS = 30 * 60 * 1000;
const AVISO_MS = 60 * 1000;
const RENOVACION_MS = 5 * 60 * 1000;

export function IdleMonitor() {
  const { data } = useSession();
  const pathname = usePathname();

  if (!data?.user || !pathname.startsWith("/dashboard")) return null;
  return <SesionActiva />;
}

async function renovarSesion(signal: AbortSignal): Promise<boolean> {
  // Auth.js vuelve a emitir la cookie JWT al consultar una sesión vigente.
  const respuesta = await fetch("/api/auth/session", { cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
  if (respuesta.status === 401) return false;
  if (!respuesta.ok) throw new Error("No se pudo renovar la sesión.");
  const sesion = await respuesta.json() as { user?: unknown } | null;
  return Boolean(sesion?.user);
}

function SesionActiva() {
  const [aviso, setAviso] = useState(false);
  const [renovando, setRenovando] = useState(false);
  const [error, setError] = useState(false);
  const ultimaRenovacion = useRef(0);
  const enCurso = useRef(false);
  const saliendo = useRef(false);
  const pregunta = useRef(false);
  const peticion = useRef<AbortController | null>(null);

  useEffect(() => () => peticion.current?.abort(), []);

  const renovar = () => {
    const controller = new AbortController();
    peticion.current = controller;
    return renovarSesion(controller.signal);
  };

  const cerrar = () => {
    if (saliendo.current) return;
    saliendo.current = true;
    peticion.current?.abort();
    setAviso(false);
    void signOut({ redirectTo: "/Login" });
  };

  const { activate, pause, resume } = useIdleTimer({
    timeout: INACTIVIDAD_MS,
    promptBeforeIdle: AVISO_MS,
    stopOnIdle: true,
    crossTab: true,
    syncTimers: 1000,
    eventsThrottle: 500,
    onPrompt: () => {
      pregunta.current = true;
      setAviso(true);
    },
    onIdle: cerrar,
    onActive: () => {
      pregunta.current = false;
      setAviso(false);
    },
    onAction: () => {
      if (pregunta.current || saliendo.current || enCurso.current ||
          Date.now() - ultimaRenovacion.current < RENOVACION_MS) return;
      ultimaRenovacion.current = Date.now();
      enCurso.current = true;
      void renovar().then((sesion) => {
        if (!sesion) cerrar();
      }).catch(() => {
        ultimaRenovacion.current = Date.now() - RENOVACION_MS + 10_000;
      }).finally(() => { enCurso.current = false; });
    },
  });

  const continuar = async () => {
    if (enCurso.current || saliendo.current) return;
    enCurso.current = true;
    pause();
    setRenovando(true);
    setError(false);
    try {
      const sesion = await renovar();
      if (saliendo.current) return;
      if (!sesion) {
        cerrar();
        return;
      }
      ultimaRenovacion.current = Date.now();
      pregunta.current = false;
      activate();
      setAviso(false);
    } catch {
      if (!saliendo.current) {
        resume();
        setError(true);
      }
    } finally {
      enCurso.current = false;
      setRenovando(false);
    }
  };

  if (!aviso) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="aviso-inactividad" className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="aviso-inactividad" className="text-xl font-bold text-gray-800">¿Sigues ahí?</h2>
        <p className="mt-2 text-gray-600">Tu sesión está a punto de expirar por inactividad.</p>
        {error && <p role="alert" className="mt-2 text-sm text-rose-700">No se pudo renovar la sesión. Intenta de nuevo.</p>}
        <div className="mt-6 flex gap-3">
          <button type="button" disabled={renovando} onClick={continuar} className="flex-1 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-60">
            {renovando ? "Renovando…" : "Continuar sesión"}
          </button>
          <button type="button" onClick={cerrar} className="flex-1 rounded-lg bg-gray-200 px-4 py-2 font-semibold text-gray-800">
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
