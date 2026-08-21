import React from 'react';
import Image, { StaticImageData } from 'next/image';


interface UscLabLogoProps {
  imageSrc?: string | StaticImageData;
  altText?: string;
}

export default function UscLabLogo({
  imageSrc = "/logo.png", // Asignas la imagen importada por defecto
  altText = "USC LAB Logo"
}: UscLabLogoProps) {
  return (
    <div className="relative inline-flex flex-col items-end justify-center px-8 py-6 select-none group">
      
      {/* Capa de Estelas y Destellos de Luz */}
      <div className="absolute inset-0 overflow-visible pointer-events-none z-10 flex items-center justify-center">
        <div className="absolute w-32 h-32 bg-cyan-500/20 rounded-full blur-xl animate-pulse" />
        <div className="absolute w-48 h-12 bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent blur-md transform -rotate-45 animate-light-ray-1" />
        <div className="absolute w-56 h-8 bg-gradient-to-r from-transparent via-cyan-400/25 to-transparent blur-md transform rotate-12 animate-light-ray-2" />
        <span className="absolute -top-1 left-4 w-12 h-[2px] bg-gradient-to-r from-cyan-400 to-transparent opacity-75 blur-[1px] animate-pulse" />
        <span className="absolute -bottom-1 right-4 w-16 h-[2px] bg-gradient-to-l from-indigo-500 to-transparent opacity-75 blur-[1px] animate-pulse" />
      </div>

      {/* Contenedor del Logo optimizado con next/image */}
    <div className="relative z-20 h-16 w-auto flex flex-col items-end transition-all duration-300 ease-in-out">
 <Image 
  src={imageSrc} 
  alt={altText}
  width={200}  // Ancho base intrínseco en px
  height={64}  // Alto base intrínseco en px
  className="h-16 w-auto object-contain drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]"
  priority
/>
</div>
      <style>{`
        @keyframes lightRayOne {
          0% { transform: rotate(-45deg) scaleX(0.8); opacity: 0.3; }
          50% { transform: rotate(-35deg) scaleX(1.3); opacity: 0.8; }
          100% { transform: rotate(-45deg) scaleX(0.8); opacity: 0.3; }
        }
        @keyframes lightRayTwo {
          0% { transform: rotate(12deg) scaleX(1.1); opacity: 0.4; }
          50% { transform: rotate(25deg) scaleX(0.9); opacity: 0.7; }
          100% { transform: rotate(12deg) scaleX(1.1); opacity: 0.4; }
        }
        .animate-light-ray-1 { animation: lightRayOne 4s ease-in-out infinite; }
        .animate-light-ray-2 { animation: lightRayTwo 6s ease-in-out infinite; }
      `}</style>
    </div>
  );
}