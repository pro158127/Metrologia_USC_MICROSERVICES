"use client";
import { useState } from "react";
import { Mail, ArrowLeft, Send, KeyRound, ShieldCheck } from "lucide-react";
import { solicitarCodigoRecuperacion, recuperarContrasena } from "@/app/action_module/recuperar";

interface ResetPasswordProps {
  onBack: () => void;
  emailPredefined: string;
}

export default function ResetPassword({ onBack, emailPredefined }: ResetPasswordProps) {
  const [step, setStep] = useState<"solicitar" | "codigo" | "exito">("solicitar");
  const [codigo, setCodigo] = useState("");
  const [nuevaContrasena, setNuevaContrasena] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSolicitar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await solicitarCodigoRecuperacion(emailPredefined);
    setLoading(false);
    if (res.success) {
      setStep("codigo");
    } else {
      setError(res.error ?? "No se pudo enviar el código.");
    }
  };

  const handleCambiar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (codigo.trim().length !== 6) {
      setError("El código debe tener 6 dígitos.");
      return;
    }
    if (nuevaContrasena.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (nuevaContrasena !== confirmar) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    const res = await recuperarContrasena(emailPredefined, codigo.trim(), nuevaContrasena);
    setLoading(false);
    if (res.success) {
      setStep("exito");
    } else {
      setError(res.error ?? "No se pudo restablecer la contraseña.");
    }
  };

  return (
    <div className="w-full max-w-md rounded-[32px] border border-white/15 bg-white/95 p-8 shadow-[0_35px_80px_-40px_rgba(15,23,42,0.35)] backdrop-blur-xl">
      {step === "solicitar" && (
        <>
          <div className="mb-8">
            <h2 className="text-3xl font-semibold text-slate-950">Restablecer acceso</h2>
            <p className="mt-2 text-sm text-slate-500">
              Enviaremos un código de verificación a tu correo institucional.
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-2xl border border-rose-200/90 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSolicitar} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Correo institucional</label>
              <div className="relative">
                <Mail size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  disabled
                  value={emailPredefined}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-3 py-3 pl-11 text-sm text-slate-500 outline-none cursor-not-allowed"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              <Send size={16} /> {loading ? "Enviando..." : "Enviar código"}
            </button>
          </form>
        </>
      )}

      {step === "codigo" && (
        <>
          <div className="mb-8">
            <h2 className="text-3xl font-semibold text-slate-950">Verificar código</h2>
            <p className="mt-2 text-sm text-slate-500">
              Ingresa el código enviado a {emailPredefined} y define tu nueva contraseña.
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-2xl border border-rose-200/90 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <form onSubmit={handleCambiar} className="space-y-5">
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
              <div className="relative">
                <KeyRound size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={nuevaContrasena}
                  onChange={(e) => setNuevaContrasena(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-3 py-3 pl-11 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Confirmar contraseña</label>
              <div className="relative">
                <KeyRound size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  placeholder="Repite la contraseña"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-3 py-3 pl-11 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {loading ? "Restableciendo..." : "Restablecer contraseña"}
            </button>
          </form>
        </>
      )}

      {step === "exito" && (
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
            <ShieldCheck size={32} className="text-emerald-600" />
          </div>
          <h2 className="text-2xl font-semibold text-slate-950">Contraseña restablecida</h2>
          <p className="mt-2 text-sm text-slate-500">
            Tu cuenta ha sido desbloqueada. Ya puedes iniciar sesión con tu nueva contraseña.
          </p>
          <button
            onClick={onBack}
            className="mt-8 w-full rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            Volver al inicio de sesión
          </button>
        </div>
      )}

      {step !== "exito" && (
        <button
          onClick={onBack}
          className="mt-6 flex w-full items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition"
        >
          <ArrowLeft size={16} /> Volver a iniciar sesión
        </button>
      )}
    </div>
  );
}
