"use client";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { useIdleTimer } from "react-idle-timer";
import {useSession} from "next-auth/react";

export function IdleMonitor() {
  const [showModal, setShowModal] = useState(false);
  const {update} = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const onIdle = () => {
    setShowModal(true);
    // Opcional: Cerrar sesión automáticamente tras 30 segundos si no responde
    setTimeout(() => {
      signOut();
    }, 30000); 
  };

  useIdleTimer({
    onIdle,
    timeout: 1000 * 60 * 25, // 25 minutos
    throttle: 500,
  });

  if (!showModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl animate-in fade-in zoom-in duration-300">
        <h2 className="text-xl font-bold text-gray-800">¿Sigues ahí?</h2>
        <p className="mt-2 text-gray-600">
          Tu sesión está a punto de expirar por inactividad. ¿Deseas continuar?
        </p>
        
        <div className="mt-6 flex gap-3">
                <button
            disabled={isLoading}
            onClick={async () => {
                setIsLoading(true);
                setShowModal(false);
                await update();
                setIsLoading(false);
            }}
            className={`flex-1 rounded-lg px-4 py-2 font-semibold text-white ${
                isLoading ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
            }`}
            >
            {isLoading ? "Renovando..." : "Continuar sesión"}
            </button>
          <button
            onClick={() => signOut()}
            className="flex-1 rounded-lg bg-gray-200 px-4 py-2 font-semibold text-gray-800 hover:bg-gray-300"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}