"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { X, Mail, KeyRound, ShieldCheck, UserRound, BadgeCheck } from "lucide-react";
import { obtenerPerfil, solicitarCodigoCambio, confirmarCambio } from "@/app/action_module/perfil";

interface PerfilProps {
  onClose: () => void;
}

export default function Perfil({ onClose }: PerfilProps) {
  const [step, setStep] = useState<"vista" | "codigo" | "exito">("vista");
  const [perfil, setPerfil] = useState<{ nombre: string; correo: string; rol: string } | null>(null);
  const [codigo, setCodigo] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let activo = true;
    obtenerPerfil().then((res) => {
      if (activo && res.success && res.data) setPerfil(res.data);
    });
    return () => {
      activo = false;
    };
  }, []);

  const handleSolicitar = async () => {
    setError("");
    setLoading(true);
    const res = await solicitarCodigoCambio();
    setLoading(false);
    if (res.success) {
      setStep("codigo");
    } else {
      setError(res.error ?? "No se pudo enviar el código.");
    }
  };

  const handleConfirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (codigo.trim().length !== 6) {
      setError("El código debe tener 6 dígitos.");
      return;
    }
    if (nueva.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (nueva !== confirmar) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    const res = await confirmarCambio(codigo.trim(), nueva);
    setLoading(false);

    if (res.success) {
      setStep("exito");
      setTimeout(() => signOut({ callbackUrl: "/Login" }), 1400);
    } else {
      setError(res.error ?? "No se pudo cambiar la contraseña.");
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-[28px] border border-white/15 bg-white/95 p-8 shadow-[0_35px_80px_-40px_rgba(15,23,42,0.35)] backdrop-blur-xl">
        <div className="flex items-start justify-between">
          <h2 className="text-2xl font-semibold text-slate-950">Mi Perfil</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
            title="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        {step === "vista" && (
          <div className="mt-6 space-y-5">
            <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-950 text-white">
                <UserRound size={24} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{perfil?.nombre ?? "Cargando..."}</p>
                <p className="truncate text-xs text-slate-500">{perfil?.rol ?? ""}</p>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3 text-slate-700">
                <Mail size={16} className="text-slate-400" />
                <span className="truncate">{perfil?.correo ?? "—"}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-700">
                <BadgeCheck size={16} className="text-slate-400" />
                <span>{perfil?.rol ?? "—"}</span>
              </div>
            </div>

            {error && (
              <div className="rounded-2xl border border-rose-200/90 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleSolicitar}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              <KeyRound size={16} /> {loading ? "Enviando código..." : "Cambiar contraseña"}
            </button>
          </div>
        )}

        {step === "codigo" && (
          <form onSubmit={handleConfirmar} className="mt-6 space-y-5">
            <p className="text-sm text-slate-500">
              Enviamos un código de verificación a tu correo. Ingresa el código y tu nueva contraseña.
            </p>

            {error && (
              <div className="rounded-2xl border border-rose-200/90 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Código de 6 dígitos</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-3 py-3 text-center text-lg tracking-[0.5em] text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Nueva contraseña</label>
              <input
                type="password"
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Confirmar contraseña</label>
              <input
                type="password"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                placeholder="Repite la contraseña"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {loading ? "Cambiando..." : "Confirmar cambio"}
            </button>
          </form>
        )}

        {step === "exito" && (
          <div className="mt-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
              <ShieldCheck size={32} className="text-emerald-600" />
            </div>
            <h3 className="text-xl font-semibold text-slate-950">Contraseña cambiada</h3>
            <p className="mt-2 text-sm text-slate-500">Cerrando sesión para que inicies de nuevo con tu nueva contraseña...</p>
          </div>
        )}
      </div>
    </div>
  );
}
