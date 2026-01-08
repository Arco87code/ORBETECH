
import React, { useRef, useEffect } from 'react';

interface SoundWavesProps {
  analyser: AnalyserNode | null;
  isActive: boolean;
  thickness: number;
  speed: number;
  primaryColor: string;
  secondaryColor: string;
}

const SoundWaves: React.FC<SoundWavesProps> = ({ 
  analyser, 
  isActive, 
  thickness, 
  speed, 
  primaryColor = "#00E5FF", 
  secondaryColor = "#E0F7FA" 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.scale(dpr, dpr);

    let animationId: number;
    const bufferLength = analyser ? analyser.frequencyBinCount : 128;
    const dataArray = new Uint8Array(bufferLength);
    let phase = 0;

    const draw = () => {
      animationId = requestAnimationFrame(draw);
      if (analyser) analyser.getByteTimeDomainData(dataArray);

      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      phase += 0.08 * speed;

      const drawWave = (color: string, op: number, shift: number, weight: number, amplitude: number) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.globalAlpha = isActive ? op : op * 0.15;
        ctx.lineWidth = weight;
        
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        const sliceWidth = w / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = analyser ? (dataArray[i] / 128.0) : 1;
          const y = (v * h) / 2 + Math.sin(i * 0.1 + phase + shift) * (isActive ? amplitude : 2);

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          x += sliceWidth;
        }
        ctx.stroke();
      };

      // Colores de onda en Cian como se solicitó
      drawWave(secondaryColor, 0.3, 0, thickness, 8);
      drawWave(primaryColor, 0.7, Math.PI, thickness * 1.5, 18);
    };

    draw();
    return () => cancelAnimationFrame(animationId);
  }, [analyser, isActive, thickness, speed, primaryColor, secondaryColor]);

  return <canvas ref={canvasRef} className="w-full h-full block" />;
};

export default SoundWaves;
