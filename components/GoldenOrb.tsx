
import React, { useState, useEffect, useRef } from 'react';

interface GoldenOrbProps {
  status: 'IDLE' | 'LOADING' | 'PLAYING' | 'RECORDING' | 'ERROR';
  onClick: () => void;
  progress?: number;
  analyser: AnalyserNode | null;
}

const GoldenOrb: React.FC<GoldenOrbProps> = ({ status, onClick, progress = 0, analyser }) => {
  const [amplitude, setAmplitude] = useState(0);
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
      requestRef.current = requestAnimationFrame(updateAmplitude);
    };

    requestRef.current = requestAnimationFrame(updateAmplitude);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [analyser, isActive]);

  const scale = 1 + amplitude * 1.5;
  const glowIntensity = 10 + amplitude * 120;
  const pulseScale = 1 + amplitude * 2.5;

  return (
    <div className="relative flex items-center justify-center p-12 select-none ar-float">
      
      {/* AR Pulse Rings (Emanating ripples) */}
      <div 
        className={`absolute w-44 h-44 rounded-full border-2 border-yellow-500/20 pointer-events-none transition-all duration-500 ${isActive ? 'animate-[ping_2s_infinite] opacity-40' : 'opacity-0'}`}
        style={{ transform: `scale(${pulseScale * 1.2})` }}
      ></div>
      <div 
        className={`absolute w-44 h-44 rounded-full border border-cyan-400/10 pointer-events-none transition-all duration-700 ${isActive ? 'animate-[ping_3s_infinite] opacity-30' : 'opacity-0'}`}
        style={{ transform: `scale(${pulseScale * 1.5})`, animationDelay: '0.5s' }}
      ></div>

      {/* AR Field Rings */}
      <div 
        className={`absolute w-[340px] h-[340px] rounded-full border border-yellow-600/5 transition-opacity duration-1000 ${isActive ? 'opacity-30' : 'opacity-10'}`}
        style={{ 
          transform: `scale(${1 + amplitude * 0.2}) rotate(${Date.now() / 5000}deg)`,
        }}
      ></div>
      
      <div 
        className={`absolute w-[300px] h-[300px] rounded-full border border-cyan-500/10 transition-opacity duration-1000 ${isActive ? 'opacity-40' : 'opacity-5'}`}
        style={{ 
          transform: `scale(${1 + amplitude * 0.4}) rotate(-${Date.now() / 3000}deg)`,
        }}
      ></div>

      {/* Progress Ring */}
      <svg className="absolute w-[220px] h-[220px] -rotate-90 pointer-events-none z-10">
        <circle cx="110" cy="110" r="105" fill="transparent" stroke="rgba(212, 175, 55, 0.05)" strokeWidth="1" />
        <circle
          cx="110"
          cy="110"
          r="105"
          fill="transparent"
          stroke={status === 'RECORDING' ? '#ef4444' : '#FCF6BA'}
          strokeWidth="3"
          strokeDasharray={2 * Math.PI * 105}
          strokeDashoffset={2 * Math.PI * 105 * (1 - progress)}
          className="transition-all duration-300"
          style={{ filter: `drop-shadow(0 0 ${4 + amplitude * 20}px ${status === 'RECORDING' ? '#ef4444' : '#D4AF37'})` }}
        />
      </svg>

      {/* Main Interactive Orb */}
      <button
        onClick={onClick}
        className={`relative w-44 h-44 rounded-full cursor-pointer overflow-hidden transform transition-all duration-200 shadow-2xl z-20 
          ${status === 'RECORDING' ? 'ring-2 ring-red-500/50' : 'hover:scale-105 active:scale-90'}`}
        style={{
          transform: `scale(${scale})`,
          background: 'radial-gradient(circle at 35% 35%, #FFFCE0 0%, #FCF6BA 15%, #D4AF37 40%, #8B6508 70%, #050505 100%)',
          boxShadow: status === 'PLAYING' 
            ? `0 0 ${glowIntensity}px rgba(212, 175, 55, 0.8), inset 0 0 40px rgba(255, 255, 255, 0.3)`
            : status === 'RECORDING'
            ? `0 0 ${glowIntensity}px rgba(255, 50, 50, 0.6), inset 0 0 40px rgba(255, 0, 0, 0.1)`
            : `0 0 30px rgba(212, 175, 55, 0.3), inset 0 0 20px rgba(255, 255, 255, 0.1)`,
        }}
      >
        <div className={`absolute inset-0 opacity-30 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.6)_50%,transparent_75%)] bg-[length:250%_250%] ${isActive ? 'animate-[shimmer_3s_infinite]' : 'animate-[shimmer_10s_infinite]'}`}></div>
        
        <div className="absolute inset-0 flex flex-col items-center justify-center text-black drop-shadow-sm pointer-events-none select-none">
          <div className="font-cinzel font-bold text-[10px] tracking-[0.3em] mb-1">
            {status === 'IDLE' && 'INICIAR'}
            {status === 'LOADING' && 'FORJANDO'}
            {status === 'PLAYING' && 'EMITIENDO'}
            {status === 'RECORDING' && 'CAPTANDO'}
            {status === 'ERROR' && 'FALLO'}
          </div>
          <div className={`w-8 h-[1.5px] bg-black/30 mb-1 transition-all duration-300 ${isActive ? 'w-12 opacity-100' : 'w-8 opacity-40'}`}></div>
          <div className="text-[7px] font-bold opacity-50 tracking-[0.1em]">SPECTRAL CORE</div>
        </div>
      </button>

      <div 
        className={`absolute -bottom-16 w-32 h-6 bg-yellow-600/10 blur-2xl rounded-full transition-all duration-300 ${isActive ? 'opacity-40' : 'opacity-10'}`}
        style={{ transform: `scale(${scale * 1.5})` }}
      ></div>
    </div>
  );
};

export default GoldenOrb;
