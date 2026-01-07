
import React, { useState, useRef, useEffect } from 'react';
import GoldenOrb from './components/GoldenOrb';
import SoundWaves from './components/SoundWaves';
import { generateSpeech, decodeAudioData, transcribeAudio } from './services/geminiService';
import { AppStatus, AudioMetadata } from './types';

const VOICES = [
  { id: 'Kore', name: 'Kore (Cálido)', description: 'Voz masculina equilibrada' },
  { id: 'Puck', name: 'Puck (Energético)', description: 'Voz juvenil y rápida' },
  { id: 'Charon', name: 'Charon (Solemne)', description: 'Profundo y autoritario' },
  { id: 'Fenrir', name: 'Fenrir (Aspero)', description: 'Textura rugosa y seria' },
  { id: 'Zephyr', name: 'Zephyr (Suave)', description: 'Voz aérea y calmada' },
];

const WAVE_COLORS = [
  { primary: '#D4AF37', secondary: '#00FFFF', label: 'ORO/CIAN' },
  { primary: '#FFD700', secondary: '#FF8C00', label: 'FUEGO' },
  { primary: '#B8860B', secondary: '#ADFF2F', label: 'TIERRA' },
  { primary: '#FFFFFF', secondary: '#D4AF37', label: 'DIVINO' },
];

const App: React.FC = () => {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [text, setText] = useState<string>("");
  const [selectedVoice, setSelectedVoice] = useState(VOICES[0].id);
  const [metadata, setMetadata] = useState<AudioMetadata>({
    duration: 0,
    loadingTime: 0,
    isPlaying: false,
    progress: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [eta, setEta] = useState<number | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  // Wave Customization States
  const [waveThickness, setWaveThickness] = useState(3);
  const [waveSpeed, setWaveSpeed] = useState(1.5);
  const [colorIndex, setColorIndex] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recordingIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    const checkDevice = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
      const isMobileDevice = mobileRegex.test(userAgent.toLowerCase()) || window.innerWidth < 1024;
      setIsMobile(isMobileDevice);
    };
    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    if (status === AppStatus.RECORDING) {
      setRecordingSeconds(0);
      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingSeconds(prev => prev + 0.1);
      }, 100);
    } else {
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    }
    return () => { if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current); };
  }, [status]);

  const installApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setDeferredPrompt(null);
    } else {
      setShowInstallGuide(!showInstallGuide);
    }
  };

  const initAudio = () => {
    if (!audioCtxRef.current) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const node = ctx.createAnalyser();
      node.fftSize = 2048;
      node.smoothingTimeConstant = 0.8;
      audioCtxRef.current = ctx;
      analyserRef.current = node;
      setAnalyser(node);
    }
  };

  const stopPlayback = () => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch (e) {}
      sourceRef.current = null;
    }
    setStatus(AppStatus.IDLE);
    setMetadata(prev => ({ ...prev, isPlaying: false, progress: 0 }));
  };

  const handleTextToSpeech = async () => {
    if (!text.trim()) return;
    initAudio();
    stopPlayback();
    setStatus(AppStatus.LOADING);
    setError(null);
    const estimatedSeconds = 1.0 + (text.length / 200);
    setEta(estimatedSeconds);
    const startLoadTime = performance.now();
    try {
      const { audioData } = await generateSpeech(text, selectedVoice);
      const audioBuffer = await decodeAudioData(audioData, audioCtxRef.current!);
      const duration = audioBuffer.duration;
      const loadingTime = (performance.now() - startLoadTime) / 1000;
      setMetadata({ duration, loadingTime, isPlaying: true, progress: 0 });
      const source = audioCtxRef.current!.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(analyserRef.current!);
      analyserRef.current!.connect(audioCtxRef.current!.destination);
      source.onended = () => {
        setStatus(AppStatus.IDLE);
        setMetadata(prev => ({ ...prev, isPlaying: false, progress: 1 }));
      };
      startTimeRef.current = audioCtxRef.current!.currentTime;
      source.start();
      sourceRef.current = source;
      setStatus(AppStatus.PLAYING);
    } catch (err: any) {
      setError("Fallo Espectral.");
      setStatus(AppStatus.ERROR);
    } finally {
      setEta(null);
    }
  };

  const startRecording = async () => {
    initAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const micSource = audioCtxRef.current!.createMediaStreamSource(stream);
      micSource.connect(analyserRef.current!);
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => audioChunksRef.current.push(event.data);
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          setStatus(AppStatus.LOADING);
          setEta(2.0);
          try {
            const result = await transcribeAudio(base64Audio);
            setText(result);
            setStatus(AppStatus.IDLE);
          } catch (err) {
            setError("Error de Dictado.");
            setStatus(AppStatus.ERROR);
          } finally {
            setEta(null);
          }
        };
        if (micStreamRef.current) {
          micStreamRef.current.getTracks().forEach(track => track.stop());
          micStreamRef.current = null;
        }
      };
      mediaRecorder.start();
      setStatus(AppStatus.RECORDING);
    } catch (err) {
      setError("Micro bloqueado.");
      setStatus(AppStatus.ERROR);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const toggleAction = () => {
    if (status === AppStatus.PLAYING) stopPlayback();
    else if (status === AppStatus.RECORDING) stopRecording();
    else handleTextToSpeech();
  };

  useEffect(() => {
    let frame: number;
    const updateProgress = () => {
      if (status === AppStatus.PLAYING && audioCtxRef.current) {
        const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
        const progress = Math.min(elapsed / metadata.duration, 1);
        setMetadata(prev => ({ ...prev, progress }));
      }
      frame = requestAnimationFrame(updateProgress);
    };
    frame = requestAnimationFrame(updateProgress);
    return () => cancelAnimationFrame(frame);
  }, [status, metadata.duration]);

  if (isMobile === null) return <div className="min-h-screen bg-black" />;

  if (isMobile === false) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-10 text-center space-y-8 overflow-hidden relative">
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #D4AF37 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>
        <div className="w-32 h-32 rounded-full border border-yellow-500/30 flex items-center justify-center animate-pulse shadow-[0_0_50px_rgba(212,175,55,0.2)]">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
           </svg>
        </div>
        <h2 className="text-3xl font-cinzel font-bold shimmer-text tracking-widest uppercase text-yellow-500">MÓVIL REQUERIDO</h2>
        <p className="text-[10px] text-yellow-600/80 font-mono tracking-[0.2em] uppercase max-w-xs leading-relaxed">Hardware de escritorio bloqueado. Use su smartphone Honor 400 para calibración espectral.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-between p-4 relative bg-black selection:bg-yellow-500 selection:text-black overflow-hidden">
      
      {/* PERSISTENT INSTALLATION BAR (HIGH VISIBILITY) */}
      <div className="w-full max-w-md mx-auto mb-2 z-50">
        <button 
          onClick={installApp}
          className="w-full group relative flex items-center justify-between px-6 py-4 bg-gradient-to-r from-yellow-600/20 via-yellow-500/10 to-yellow-600/20 border border-yellow-500/40 rounded-2xl shadow-[0_0_30px_rgba(212,175,55,0.2)] active:scale-95 transition-all overflow-hidden"
        >
          {/* Animated Background Shimmer */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-400/10 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite]"></div>
          
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-yellow-500 rounded-lg text-black shadow-[0_0_10px_rgba(212,175,55,0.5)]">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-[12px] font-black text-yellow-500 tracking-[0.2em] uppercase">INSTALAR TERMINAL</p>
              <p className="text-[8px] text-yellow-600/60 font-mono tracking-tighter">PROTOCOLO DORADO SU OPERATIVO</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-1">
            <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-ping"></div>
            <span className="text-[10px] text-yellow-500 font-bold">READY</span>
          </div>
        </button>

        {showInstallGuide && (
          <div className="mt-3 p-4 bg-black/80 border border-cyan-500/30 rounded-2xl backdrop-blur-xl animate-fade-in shadow-2xl">
            <div className="flex justify-between items-start mb-2">
               <h4 className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">Guía de Instalación Manual</h4>
               <button onClick={() => setShowInstallGuide(false)} className="text-cyan-900 hover:text-cyan-400">×</button>
            </div>
            <div className="space-y-2 text-[9px] text-yellow-100/80 leading-relaxed font-mono">
              <p>1. Pulsa el icono de <span className="text-yellow-500 font-bold">[Compartir]</span> o los <span className="text-yellow-500 font-bold">[3 puntos]</span> de tu navegador.</p>
              <p>2. Busca la opción <span className="text-yellow-500 font-bold">"Añadir a pantalla de inicio"</span> o <span className="text-yellow-500 font-bold">"Instalar Aplicación"</span>.</p>
              <p>3. Confirma la descarga para activar la interfaz de seda en tu Honor 400.</p>
            </div>
          </div>
        )}
      </div>

      {/* BACKGROUND DECORATIVE ELEMENTS */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-5%] right-[-5%] w-[60%] h-[60%] bg-yellow-600/5 blur-[120px] rounded-full animate-pulse"></div>
        <div className="absolute bottom-[-5%] left-[-5%] w-[60%] h-[60%] bg-cyan-600/5 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '2.5s' }}></div>
      </div>

      {/* HEADER */}
      <header className="w-full text-center py-4 z-10">
        <h1 className="text-6xl font-cinzel font-bold shimmer-text tracking-[0.3em] uppercase drop-shadow-lg">ARCOTECH</h1>
        <p className="text-[10px] tracking-[0.5em] text-yellow-700 font-bold uppercase mt-1">DORADO SU V12</p>
      </header>

      {/* MAIN CONSOLE */}
      <main className="flex-1 w-full max-md flex flex-col items-center justify-center space-y-4 z-10">
        
        {/* VISUALIZER & ORB AREA */}
        <div className="relative w-full flex flex-col items-center">
          <SoundWaves 
            analyser={analyser} 
            isActive={status === AppStatus.PLAYING || status === AppStatus.RECORDING} 
            thickness={waveThickness}
            speed={waveSpeed}
            primaryColor={WAVE_COLORS[colorIndex].primary}
            secondaryColor={WAVE_COLORS[colorIndex].secondary}
          />
          
          {/* FEEDBACK LABELS */}
          <div className="absolute top-0 flex flex-col items-center pointer-events-none w-full h-16">
            {status === AppStatus.RECORDING && (
              <div className="animate-fade-in flex flex-col items-center mt-4">
                <span className="text-4xl font-mono font-bold text-yellow-500 drop-shadow-[0_0_15px_#D4AF37]">{recordingSeconds.toFixed(1)}s</span>
                <span className="text-[8px] font-bold text-red-500 tracking-[0.6em] uppercase animate-pulse">Capturando...</span>
              </div>
            )}
            {status === AppStatus.LOADING && (
              <div className="animate-pulse flex flex-col items-center mt-6">
                <span className="text-[10px] font-cinzel font-bold text-cyan-400 tracking-[0.4em] uppercase">PROCESANDO DORADO SU...</span>
                <div className="h-[1px] w-32 bg-cyan-500/40 mt-1"></div>
              </div>
            )}
          </div>

          <div className="relative -mt-10 scale-110">
            <GoldenOrb status={status} onClick={toggleAction} progress={metadata.progress} analyser={analyser} />
          </div>
        </div>

        {/* TACTICAL CONTROLS */}
        <div className="w-full space-y-3 bg-yellow-900/5 border border-yellow-900/20 p-5 rounded-[2.5rem] backdrop-blur-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[8px] font-bold text-yellow-700 tracking-[0.3em] uppercase">PROTOCOLO DE ONDAS</span>
            <div className="flex space-x-2">
              {WAVE_COLORS.map((c, i) => (
                <button 
                  key={i} 
                  onClick={() => setColorIndex(i)}
                  className={`w-4 h-4 rounded-full border border-white/10 transition-transform ${colorIndex === i ? 'scale-125 ring-2 ring-yellow-500' : 'opacity-40'}`}
                  style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.secondary})` }}
                />
              ))}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[7px] text-yellow-900 font-bold uppercase tracking-widest">Grosor: {waveThickness}</label>
              <input type="range" min="1" max="10" step="0.5" value={waveThickness} onChange={(e) => setWaveThickness(parseFloat(e.target.value))} className="w-full h-1 bg-yellow-900/20 accent-yellow-500 rounded-full cursor-pointer" />
            </div>
            <div className="space-y-1">
              <label className="text-[7px] text-yellow-900 font-bold uppercase tracking-widest">Flujo: {waveSpeed}x</label>
              <input type="range" min="0.1" max="5" step="0.1" value={waveSpeed} onChange={(e) => setWaveSpeed(parseFloat(e.target.value))} className="w-full h-1 bg-cyan-900/20 accent-cyan-500 rounded-full cursor-pointer" />
            </div>
          </div>
        </div>

        {/* TEXT TERMINAL */}
        <div className="w-full relative group">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Introduce texto para el Loro..."
            className="w-full h-32 bg-black/80 border border-yellow-900/30 p-6 pt-12 text-yellow-100 placeholder:text-yellow-900/10 focus:outline-none focus:border-cyan-500/40 rounded-[2rem] text-md resize-none shadow-inner"
          />
          <button 
            onClick={() => { navigator.clipboard.writeText(text); setCopyFeedback(true); setTimeout(() => setCopyFeedback(false), 2000); }} 
            className="absolute top-4 right-4 p-2 bg-black/60 rounded-lg text-yellow-600 border border-yellow-900/30 active:scale-90 transition-all"
          >
            {copyFeedback ? 'OK' : <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>}
          </button>
          <button
            onClick={() => status === AppStatus.RECORDING ? stopRecording() : startRecording()}
            className={`absolute right-4 bottom-4 p-4 rounded-full transition-all active:scale-95 ${status === AppStatus.RECORDING ? 'bg-red-600 shadow-[0_0_20px_red]' : 'bg-yellow-600/10 text-yellow-600 hover:bg-yellow-600/20'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
          </button>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="w-full flex items-center justify-between py-6 mt-4 border-t border-yellow-900/10 z-10 px-4">
        <button onClick={() => { setText(""); stopPlayback(); }} className="text-yellow-700 text-[9px] tracking-[0.4em] font-bold uppercase active:text-yellow-400">Purificar</button>
        <button onClick={toggleAction} className="w-16 h-16 rounded-full border border-yellow-500/30 bg-yellow-500/5 text-yellow-500 flex items-center justify-center shadow-2xl active:scale-90 transition-all hover:bg-yellow-500/10">
          {status === AppStatus.PLAYING ? <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg> : <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
        </button>
        <div className="text-right">
          <p className="text-[7px] font-mono text-yellow-600/40 tracking-widest">ARCOTECH_DORADO_SU</p>
          <p className="text-[6px] text-cyan-900 font-bold uppercase">Matriz: Loro Spectral</p>
        </div>
      </footer>

      {error && <div className="fixed top-24 px-8 py-3 bg-red-950/90 border border-red-500/50 text-red-200 text-[10px] font-bold rounded-full animate-bounce z-50 shadow-2xl">{error}</div>}
    </div>
  );
};

export default App;
