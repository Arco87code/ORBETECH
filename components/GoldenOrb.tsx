
import React, { useState, useEffect, useRef } from 'react';

interface GoldenOrbProps {
  status: 'IDLE' | 'LOADING' | 'PLAYING' | 'RECORDING' | 'ERROR';
  onClick: () => void;
  progress?: number;
  analyser: AnalyserNode | null;
}

const GoldenOrb: React.FC<GoldenOrbProps> = ({ status, onClick, progress = 0, analyser }) => {
  const [amplitude, setAmplitude] = useState(0);
  const [rotation, setRotation] = useState(0);
  const requestRef = useRef<number>(null);
  const isActive = status === 'PLAYING' || status === 'LOADING' || status === 'RECORDING';

  useEffect(() => {
    if (!analyser || !isActive) {
      setAmplitude(0);
      return;
    }
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const updateAmplitude = () => {
      analyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        const val = (dataArray[i] - 128) / 128;
        sum += val * val;
      }
      const rms = Math.sqrt(sum / bufferLength);
      setAmplitude(prev => prev * 0.7 + rms * 0.3);
      setRotation(prev => prev + (1 + rms * 20));
      requestRef.current = requestAnimationFrame(updateAmplitude);
    };
    requestRef.current = requestAnimationFrame(updateAmplitude);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [analyser, isActive]);

  const scale = 1 + amplitude * 1.2;
  const glowSize = 60 + amplitude * 300;
  const ringScale = 1 + amplitude * 3;

  return (
    <div className="relative flex items-center justify-center p-16 select-none perspective-1000">
      
      {/* ANILLOS AR PROFESIONALES */}
      {isActive && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {/* Anillo de Datos Periférico */}
          <div 
            className="absolute w-72 h-72 rounded-full border border-dashed border-[#D4AF37]/20"
            style={{ transform: `rotate(${rotation * 0.2}deg) scale(${1 + amplitude * 0.5})` }}
          ></div>
          
          {/* Anillo de Resonancia Dorado */}
          <div 
            className="absolute w-56 h-56 rounded-full border-[3px] border-[#D4AF37]/30 shadow-[0_0_20px_rgba(212,175,55,0.2)]"
            style={{ transform: `scale(${ringScale})`, opacity: 0.2 + amplitude }}
          ></div>
          
          {/* Núcleo de Energía Cian AR */}
          <div 
            className="absolute w-64 h-64 rounded-full border border-[#00E5FF]/10"
            style={{ 
              transform: `rotate(${-rotation * 0.5}deg) scale(${1.2 + amplitude})`,
              boxShadow: `inset 0 0 40px rgba(0, 229, 255, ${0.1 + amplitude})`
            }}
          ></div>
        </div>
      )}

      {/* CÍRCULO DE PROGRESO CINEMÁTICO */}
      <svg className={`absolute w-[280px] h-[280px] -rotate-90 pointer-events-none z-10 transition-transform duration-500 ${status === 'LOADING' ? 'animate-spin' : ''}`}>
        <circle cx="140" cy="140" r="130" fill="transparent" stroke="rgba(212, 175, 55, 0.03)" strokeWidth="0.5" />
        <circle
          cx="140" cy="140" r="130"
          fill="transparent"
          stroke={status === 'LOADING' ? '#00E5FF' : '#D4AF37'}
          strokeWidth={status === 'LOADING' ? '6' : '4'}
          strokeDasharray={2 * Math.PI * 130}
          strokeDashoffset={status === 'LOADING' ? (2 * Math.PI * 130) * 0.7 : 2 * Math.PI * 130 * (1 - progress)}
          strokeLinecap="butt"
          className="transition-all duration-300"
        />
        {/* Marcadores de Grado */}
        {[...Array(12)].map((_, i) => (
          <rect key={i} x="139" y="8" width="2" height="10" fill="#D4AF37" opacity="0.2" transform={`rotate(${i * 30}, 140, 140)`} />
        ))}
      </svg>

      {/* EL ORBE MAESTRO (CONSTRUCCIÓN MULTICAPA) */}
      <button
        onClick={onClick}
        className={`relative w-44 h-44 rounded-full cursor-pointer flex items-center justify-center overflow-hidden transition-all duration-300 z-20 shadow-2xl
          ${status === 'LOADING' ? 'scale-90' : 'active:scale-95'}`}
        style={{
          transform: `scale(${scale})`,
          background: 'radial-gradient(circle at 35% 35%, #FFFFFF 0%, #FDFCF0 15%, #D4AF37 80%, #996515 100%)',
          boxShadow: `
            0 0 ${glowSize}px rgba(212, 175, 55, 0.5),
            inset 0 0 20px rgba(255, 255, 255, 0.8),
            0 0 ${glowSize / 3}px rgba(0, 229, 255, ${isActive ? 0.4 : 0})
          `,
        }}
      >
        {/* Efecto de Cristal Rotatorio */}
        <div 
          className="absolute inset-0 opacity-30 bg-[conic-gradient(from_0deg,transparent,rgba(255,255,255,0.8),transparent)]"
          style={{ transform: `rotate(${rotation}deg)` }}
        ></div>
        
        {/* Núcleo de Datos Cian */}
        <div 
          className="absolute w-8 h-8 rounded-full bg-[#00E5FF] blur-xl animate-pulse transition-opacity"
          style={{ opacity: isActive ? 0.8 : 0 }}
        ></div>

        <div className="relative flex flex-col items-center justify-center text-[#4B3B0B] pointer-events-none drop-shadow-md">
          <span className="font-black text-[11px] tracking-[0.4em] uppercase mb-1">
            {status === 'IDLE' && 'NEURAL'}
            {status === 'LOADING' && 'SYNC'}
            {status === 'PLAYING' && 'STUDIO'}
            {status === 'ERROR' && 'VOID'}
          </span>
          <div className="flex space-x-1">
             <div className={`w-1 h-4 transition-all ${isActive ? 'bg-[#00E5FF] h-6' : 'bg-[#4B3B0B]/20'} rounded-full`}></div>
             <div className={`w-1 h-4 transition-all ${isActive ? 'bg-[#00E5FF] h-8 delay-75' : 'bg-[#4B3B0B]/20'} rounded-full`}></div>
             <div className={`w-1 h-4 transition-all ${isActive ? 'bg-[#00E5FF] h-6 delay-150' : 'bg-[#4B3B0B]/20'} rounded-full`}></div>
          </div>
        </div>
      </button>

      {/* Aura de Suelo (Sombra AR) */}
      <div className={`absolute -bottom-12 w-48 h-12 bg-[#D4AF37]/10 blur-[40px] rounded-full transition-all duration-500 ${isActive ? 'scale-150 opacity-100' : 'opacity-20'}`}></div>
    </div>
  );
};

export default GoldenOrb;
