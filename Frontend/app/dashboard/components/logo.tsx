import React, { useState, MouseEvent } from 'react';

// 1. Definimos la interfaz para estructurar los datos de la burbuja
interface Bubble {
  id: number;
  x: number;
  y: number;
  size: number;
}

export default function UscLabLogo() {
  // 2. Aplicamos la interfaz al estado de useState
  const [bubbles, setBubbles] = useState<Bubble[]>([]);

  // 3. Tipamos el evento como un MouseEvent que proviene de un Div
  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (bubbles.length > 15) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newBubble: Bubble = {
      id: Date.now() + Math.random(),
      x,
      y,
      size: Math.random() * 15 + 8, 
    };

    setBubbles((prev) => [...prev, newBubble]);

    setTimeout(() => {
      setBubbles((prev) => prev.filter((b) => b.id !== newBubble.id));
    }, 1500);
  };

  return (
    <div
      className="relative inline-flex flex-col items-end justify-center px-8 py-6 cursor-crosshair select-none group"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setBubbles([])}
    >
      {/* Capa Interactiva de Burbujas */}
      <div className="absolute inset-0 overflow-visible pointer-events-none z-10">
        {bubbles.map((bubble) => (
          <span
            key={bubble.id}
            className="absolute rounded-full border border-indigo-400/60 bg-blue-500/10 shadow-[0_0_12px_rgba(99,102,241,0.4)] backdrop-blur-sm animate-bubble-float"
            style={{
              left: bubble.x - bubble.size / 2, 
              top: bubble.y - bubble.size / 2,
              width: `${bubble.size}px`,
              height: `${bubble.size}px`,
            }}
          />
        ))}
        
        {/* Burbujas estáticas de adorno */}
        <span className="absolute top-4 left-6 w-3 h-3 rounded-full border border-indigo-500/50 bg-blue-500/20 animate-pulse" />
        <span className="absolute top-2 left-10 w-5 h-5 rounded-full border border-blue-400/40 bg-cyan-400/10 animate-bounce" style={{ animationDuration: '3s' }} />
      </div>

      {/* Tipografía del Logo */}
      <div className="relative z-20 flex flex-col items-end transition-transform duration-300 ease-out group-hover:scale-105">
        <h1 className="text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-blue-400 via-indigo-600 to-purple-900 drop-shadow-md">
          USC
        </h1>
        <span className="text-lg font-extrabold tracking-[0.35em] text-indigo-400 -mt-2 pr-1">
          LAB
        </span>
      </div>

      {/* Estilos CSS nativos para la animación de flotación */}
      <style>{`
        @keyframes bubble-float {
          0% {
            transform: translateY(0) scale(0.8);
            opacity: 1;
          }
          50% {
            opacity: 0.8;
          }
          100% {
            transform: translateY(-80px) scale(1.5);
            opacity: 0;
          }
        }
        .animate-bubble-float {
          animation: bubble-float 1.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
}