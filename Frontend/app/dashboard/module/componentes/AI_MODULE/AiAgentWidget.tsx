import React, { useState, useRef, useEffect } from "react";
import { Bot, X, Send, Sparkles, Move, Loader2, User } from "lucide-react";
import type { Message, AiAgentWidgetProps } from "@/tipos/ai";

/**
 * AiAgentWidget
 * Componente flotante arrastrable (Drag & Drop) que interactúa como un agente de IA.
 */
export const AiAgentWidget = ({ activeContext }: AiAgentWidgetProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [inputMessage, setInputMessage] = useState("");

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "init-1",
      sender: "ai",
      text: "Hola 👋, soy tu Agente Metrológico. ¿En qué puedo ayudarte con tus cotizaciones o cálculos hoy?",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  // Posicionamiento dinámico para Drag & Drop
  const [position, setPosition] = useState({ x: 24, y: 24 });
  const isDragging = useRef(false);
  const dragRef = useRef({ startX: 0, startY: 0, initialX: 24, initialY: 24 });
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al recibir o enviar un mensaje
  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isGenerating, isOpen]);

  // Manejo de Arrastre mediante Pointer Events (Soporta Mouse y Touch)
  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = false;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: position.x,
      initialY: position.y,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = dragRef.current.startX - moveEvent.clientX;
      const deltaY = dragRef.current.startY - moveEvent.clientY;

      // Si el movimiento supera los 4px, se considera arrastre y no click
      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
        isDragging.current = true;
      }

      setPosition({
        x: Math.max(10, Math.min(window.innerWidth - 80, dragRef.current.initialX + deltaX)),
        y: Math.max(10, Math.min(window.innerHeight - 80, dragRef.current.initialY + deltaY)),
      });
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const toggleChat = () => {
    if (!isDragging.current) {
      setIsOpen((prev) => !prev);
    }
  };

  // Envió e interacción con la IA
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isGenerating) return;

    const userText = inputMessage.trim();
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: userText,
      timestamp: now,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage("");
    setIsGenerating(true);

    // Simulación de respuesta del agente (Sustituir por tu llamada fetch a Fastify/OpenAI/LangChain)
    setTimeout(() => {
      const responseContext = activeContext?.codigo
        ? `[Cotización ${activeContext.codigo}] `
        : "";

      const aiMsg: Message = {
        id: `ai-${Date.now()}`,
        sender: "ai",
        text: `${responseContext}Procesé tu consulta "${userText}". Si necesitas validar tarifas del catálogo 2026 o aplicar normas de calibración, me indicas.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, aiMsg]);
      setIsGenerating(false);
    }, 1000);
  };

  return (
    <div
      className="fixed z-50 flex flex-col items-end pointer-events-none select-none"
      style={{ right: `${position.x}px`, bottom: `${position.y}px` }}
    >
      {/* Ventana de Chat */}
      {isOpen && (
        <div className="pointer-events-auto mb-3 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col transition-all transform origin-bottom-right animate-in fade-in slide-in-from-bottom-5 duration-200 max-h-[520px] h-[480px]">
          {/* Header */}
          <div className="bg-[#5680F9] p-3.5 text-white flex justify-between items-center shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-white/20 rounded-full backdrop-blur-md">
                <Bot size={18} className="text-white" />
              </div>
              <div>
                <h3 className="text-xs font-bold leading-tight flex items-center gap-1">
                  Agente Metrológico AI <Sparkles size={12} className="text-amber-300 fill-amber-300" />
                </h3>
                <span className="text-[10px] text-blue-100 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                  {activeContext?.codigo ? `Cotización: ${activeContext.codigo}` : "Agente Activo"}
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-white/10 rounded-lg transition text-white/80 hover:text-white cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Historial de Mensajes */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/60">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 ${msg.sender === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
              >
                {msg.sender === "ai" && (
                  <div className="w-6 h-6 rounded-full bg-[#5680F9]/10 border border-[#5680F9]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot size={13} className="text-[#5680F9]" />
                  </div>
                )}

                <div className={`max-w-[80%] flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}>
                  <div
                    className={`p-3 rounded-2xl text-xs leading-relaxed shadow-sm ${
                      msg.sender === "user"
                        ? "bg-[#5680F9] text-white rounded-tr-none"
                        : "bg-white text-slate-700 border border-slate-100 rounded-tl-none"
                    }`}
                  >
                    {msg.text}
                  </div>
                  <span className="text-[9px] text-slate-400 mt-1 px-1">{msg.timestamp}</span>
                </div>

                {msg.sender === "user" && (
                  <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User size={13} className="text-slate-600" />
                  </div>
                )}
              </div>
            ))}

            {/* Indicator de estado "pensando" */}
            {isGenerating && (
              <div className="flex gap-2 justify-start items-center text-slate-400 animate-fade-in">
                <div className="w-6 h-6 rounded-full bg-[#5680F9]/10 border border-[#5680F9]/20 flex items-center justify-center">
                  <Bot size={13} className="text-[#5680F9]" />
                </div>
                <div className="bg-white p-3 rounded-2xl rounded-tl-none border border-slate-100 flex items-center gap-2 text-xs">
                  <Loader2 size={14} className="animate-spin text-[#5680F9]" />
                  <span>Procesando...</span>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input de texto */}
          <form onSubmit={handleSendMessage} className="p-2.5 bg-white border-t border-slate-100 flex gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Escribe un mensaje al agente..."
              disabled={isGenerating}
              className="flex-1 bg-slate-100 text-xs px-3 py-2.5 rounded-xl border-none outline-none focus:ring-2 focus:ring-[#5680F9]/20 text-slate-800 placeholder:text-slate-400 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || isGenerating}
              className="p-2.5 bg-[#5680F9] text-white rounded-xl hover:bg-blue-600 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}

      {/* Botón Flotante Draggable */}
      <div
        onPointerDown={handlePointerDown}
        onClick={toggleChat}
        className="pointer-events-auto group relative cursor-grab active:cursor-grabbing flex items-center justify-center"
      >
        <div className="absolute -top-1 -right-1 bg-slate-800 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
          <Move size={10} />
        </div>
        <button
          type="button"
          className="w-14 h-14 bg-[#5680F9] hover:bg-blue-600 text-white rounded-full shadow-xl flex items-center justify-center transition-all duration-300 transform active:scale-95 group-hover:scale-105 border-2 border-white cursor-pointer"
        >
          {isOpen ? <X size={24} /> : <Bot size={26} className="animate-bounce" />}
        </button>
      </div>
    </div>
  );
};