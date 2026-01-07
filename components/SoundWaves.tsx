
import React, { useRef, useEffect } from 'react';

interface SoundWavesProps {
  analyser: AnalyserNode | null;
  isActive: boolean;
  thickness: number;
  speed: number;
  primaryColor: string; // Gold shade
  secondaryColor: string; // Cyan shade
}

const SoundWaves: React.FC<SoundWavesProps> = ({ 
  analyser, 
  isActive, 
  thickness, 
  speed, 
  primaryColor, 
  secondaryColor 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offsetRef = useRef(0);

  useEffect(() => {
    if (!canvasRef.current || !analyser) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let animationId: number;

    const render = () => {
      animationId = requestAnimationFrame(render);
      analyser.getByteTimeDomainData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Update animation offset based on speed prop
      offsetRef.current += 0.05 * speed;

      // Draw Gold (Primary) Wave
      drawWave(ctx, dataArray, canvas.width, canvas.height, primaryColor, thickness, offsetRef.current);
      // Draw Cyan (Secondary) Wave
      drawWave(ctx, dataArray, canvas.width, canvas.height, secondaryColor, thickness * 0.75, -offsetRef.current + Math.PI);
    };

    const drawWave = (
      context: CanvasRenderingContext2D, 
      data: Uint8Array, 
      width: number, 
      height: number, 
      color: string, 
      lineWidth: number,
      phaseOffset: number
    ) => {
      context.beginPath();
      context.lineWidth = lineWidth;
      context.strokeStyle = color;
      context.shadowBlur = isActive ? 15 : 5;
      context.shadowColor = color;

      const sliceWidth = width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = data[i] / 128.0;
        // Combine audio data with a sine wave for "ambient" movement when not speaking/playing
        const ambientSine = Math.sin(i * 0.05 + phaseOffset) * (isActive ? 10 : 5);
        const y = (v * height) / 2 + ambientSine;

        if (i === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }

        x += sliceWidth;
      }

      context.lineTo(width, height / 2);
      context.stroke();
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [analyser, isActive, thickness, speed, primaryColor, secondaryColor]);

  return (
    <canvas 
      ref={canvasRef} 
      width={600} 
      height={150} 
      className={`w-full max-w-md h-32 pointer-events-none transition-opacity duration-1000 ${isActive ? 'opacity-100' : 'opacity-30'}`}
    />
  );
};

export default SoundWaves;
