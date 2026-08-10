"use client";
import { useState } from "react";
import { Mail, ArrowLeft, Send } from "lucide-react";

interface ResetPasswordProps {
  onBack: () => void;
  emailPredefined: string;
}

export default function ResetPassword({ onBack, emailPredefined }: ResetPasswordProps) {
  const [email, setEmail] = useState(emailPredefined);
  const [isSent, setIsSent] = useState(false);

  const handleReset = (e: React.FormEvent) => {
    e.preventDefault();
    // Aquí iría la lógica de envío de correo
    setIsSent(true);
  };

  return (
    <div className="w-full max-w-md rounded-[32px] border border-white/15 bg-white/95 p-8 shadow-[0_35px_80px_-40px_rgba(15,23,42,0.35)] backdrop-blur-xl">
      <div className="mb-8">
        <h2 className="text-3xl font-semibold text-slate-950">Restablecer</h2>
        <p className="mt-2 text-sm text-slate-500">
          {isSent 
            ? "Instrucciones enviadas a tu correo." 
            : "Recibirás un enlace para recuperar tu acceso."}
        </p>
      </div>

      {!isSent ? (
        <form onSubmit={handleReset} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Correo institucional</label>
            <div className="relative">
              <Mail size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                disabled
                value={email}
                className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-3 py-3 pl-11 text-sm text-slate-500 outline-none cursor-not-allowed"
              />
            </div>
          </div>

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Send size={16} /> Enviar enlace de recuperación
          </button>
        </form>
      ) : (
        <button
          onClick={onBack}
          className="w-full rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          Volver al inicio
        </button>
      )}

      <button
        onClick={onBack}
        className="mt-6 flex w-full items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition"
      >
        <ArrowLeft size={16} /> Volver a iniciar sesión
      </button>
    </div>
  );
}