
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
      
      {/* HUD: INSTALLATION ACTIVATOR (HIGH VISIBILITY FLOATING) */}
      <div className="fixed top-4 left-4 right-4 z-[100] max-w-md mx-auto pointer-events-none">
        <div className="pointer-events-auto">
          <button 
            onClick={installApp}
            className="w-full relative group flex items-center justify-between px-6 py-4 bg-black/80 backdrop-blur-2xl border-2 border-yellow-500/50 rounded-2xl shadow-[0_0_40px_rgba(212,175,55,0.3)] active:scale-95 transition-all overflow-hidden"
          >
            {/* Animated Laser Scan Line */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="w-1 h-full bg-yellow-400/50 blur-md absolute top-0 left-0 animate-[shimmer_3s_infinite]"></div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <div className="absolute inset-0 bg-yellow-500 blur-md animate-pulse opacity-50"></div>
                <div className="relative p-2.5 bg-yellow-500 rounded-xl text-black shadow-2xl">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </div>
              </div>
              <div className="text-left">
                <p className="text-[14px] font-black gold-gradient tracking-[0.25em] uppercase">ACTIVAR TERMINAL</p>
                <p className="text-[8px] text-cyan-500/80 font-mono tracking-widest uppercase">Protocolo Dorado SU v.12</p>
              </div>
            </div>
            
            <div className="flex flex-col items-end">
              <div className="flex items-center space-x-1.5">
                <div className="w-2 h-2 bg-yellow-500 rounded-full animate-ping"></div>
                <span className="text-[10px] text-yellow-500 font-black tracking-tighter italic">ONLINE</span>
              </div>
              <span className="text-[7px] text-yellow-900 font-bold uppercase mt-0.5">Spectral Link</span>
            </div>
          </button>

          {showInstallGuide && (
            <div className="mt-3 p-5 bg-yellow-950/20 border border-yellow-500/40 rounded-[2rem] backdrop-blur-3xl animate-fade-in shadow-[0_20px_50px_rgba(0,0,0,1)] border-t-yellow-400/60">
              <div className="flex justify-between items-center mb-3">
                 <h4 className="text-[11px] font-black text-yellow-500 uppercase tracking-[0.3em]">MANUAL DE DESPLIEGUE</h4>
                 <button onClick={() => setShowInstallGuide(false)} className="w-6 h-6 flex items-center justify-center rounded-full bg-yellow-900/40 text-yellow-500 font-bold">×</button>
              </div>
              <div className="space-y-3 text-[10px] text-yellow-100/90 leading-relaxed font-mono">
                <div className="flex space-x-3 items-start">
                  <span className="text-cyan-400 font-bold">[01]</span>
                  <p>Toca el icono <span className="text-yellow-400">"Compartir"</span> o <span className="text-yellow-400">"Opciones"</span> en tu Honor 400.</p>
                </div>
                <div className="flex space-x-3 items-start">
                  <span className="text-cyan-400 font-bold">[02]</span>
                  <p>Busca la directiva <span className="text-yellow-400">"Añadir a pantalla de inicio"</span>.</p>
                </div>
                <div className="flex space-x-3 items-start">
                  <span className="text-cyan-400 font-bold">[03]</span>
                  <p>Confirma para activar la <span className="text-yellow-400">Interfaz de Seda</span> espectral.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BACKGROUND DECORATIVE ELEMENTS */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-5%] right-[-5%] w-[60%] h-[60%] bg-yellow-600/5 blur-[120px] rounded-full animate-pulse"></div>
        <div className="absolute bottom-[-5%] left-[-5%] w-[60%] h-[60%] bg-cyan-600/5 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '2.5s' }}></div>
      </div>

      {/* HEADER (Spacer for HUD) */}
      <header className="w-full text-center pt-24 pb-4 z-10">
        <h1 className="text-5xl font-cinzel font-bold shimmer-text tracking-[0.3em] uppercase drop-shadow-2xl">ARCOTECH</h1>
        <p className="text-[10px] tracking-[0.5em] text-yellow-700/60 font-bold uppercase mt-1">Universal Voice Engine</p>
      </header>

      {/* MAIN CONSOLE */}
      <main className="flex-1 w-full max-w-md flex flex-col items-center justify-center space-y-4 z-10 px-2">
        
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
                <span className="text-5xl font-mono font-bold text-yellow-500 drop-shadow-[0_0_20px_#D4AF37]">{recordingSeconds.toFixed(1)}s</span>
                <span className="text-[9px] font-black text-red-500 tracking-[0.8em] uppercase animate-pulse">CAPTANDO</span>
              </div>
            )}
            {status === AppStatus.LOADING && (
              <div className="animate-pulse flex flex-col items-center mt-6">
                <span className="text-[11px] font-cinzel font-bold text-cyan-400 tracking-[0.5em] uppercase">MATRIZ_DORADO_CALIBRANDO</span>
                <div className="h-[1px] w-40 bg-cyan-500/40 mt-1"></div>
              </div>
            )}
          </div>

          <div className="relative -mt-8 scale-110">
            <GoldenOrb status={status} onClick={toggleAction} progress={metadata.progress} analyser={analyser} />
          </div>
        </div>

        {/* TACTICAL CONTROLS */}
        <div className="w-full space-y-4 bg-yellow-900/5 border border-yellow-900/30 p-6 rounded-[2.5rem] backdrop-blur-xl shadow-2xl">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-black text-yellow-700 tracking-[0.4em] uppercase">CONTROL ESPECTRAL</span>
            <div className="flex space-x-2.5">
              {WAVE_COLORS.map((c, i) => (
                <button 
                  key={i} 
                  onClick={() => setColorIndex(i)}
                  className={`w-5 h-5 rounded-full border border-white/10 transition-all ${colorIndex === i ? 'scale-125 ring-2 ring-yellow-500 shadow-[0_0_10px_rgba(212,175,55,0.5)]' : 'opacity-30'}`}
                  style={{ background: `linear-gradient(135deg, ${c.primary}, ${c.secondary})` }}
                />
              ))}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[8px] text-yellow-900 font-black uppercase tracking-widest flex justify-between">
                <span>Grosor</span>
                <span className="text-yellow-600">{waveThickness}</span>
              </label>
              <input type="range" min="1" max="10" step="0.5" value={waveThickness} onChange={(e) => setWaveThickness(parseFloat(e.target.value))} className="w-full h-1 bg-yellow-900/20 accent-yellow-500 rounded-full cursor-pointer appearance-none" />
            </div>
            <div className="space-y-2">
              <label className="text-[8px] text-yellow-900 font-black uppercase tracking-widest flex justify-between">
                <span>Flujo</span>
                <span className="text-cyan-600">{waveSpeed}x</span>
              </label>
              <input type="range" min="0.1" max="5" step="0.1" value={waveSpeed} onChange={(e) => setWaveSpeed(parseFloat(e.target.value))} className="w-full h-1 bg-cyan-900/20 accent-cyan-500 rounded-full cursor-pointer appearance-none" />
            </div>
          </div>
        </div>

        {/* TEXT TERMINAL */}
        <div className="w-full relative group">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Introduce texto para el Loro..."
            className="w-full h-36 bg-black/60 border-2 border-yellow-900/20 p-6 pt-12 text-yellow-100 placeholder:text-yellow-900/20 focus:outline-none focus:border-yellow-500/40 rounded-[2.5rem] text-lg resize-none shadow-2xl transition-all"
          />
          <button 
            onClick={() => { navigator.clipboard.writeText(text); setCopyFeedback(true); setTimeout(() => setCopyFeedback(false), 2000); }} 
            className="absolute top-5 right-5 p-2.5 bg-black/80 rounded-xl text-yellow-600 border border-yellow-900/30 active:scale-90 transition-all shadow-lg"
          >
            {copyFeedback ? <span className="text-[10px] font-bold text-green-500">LISTO</span> : <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>}
          </button>
          <button
            onClick={() => status === AppStatus.RECORDING ? stopRecording() : startRecording()}
            className={`absolute right-5 bottom-5 p-5 rounded-full transition-all active:scale-95 shadow-2xl ${status === AppStatus.RECORDING ? 'bg-red-600 shadow-[0_0_30px_red] text-white' : 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 hover:bg-yellow-500/20'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
          </button>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="w-full flex items-center justify-between py-8 mt-4 border-t border-yellow-900/10 z-10 px-6">
        <button onClick={() => { setText(""); stopPlayback(); }} className="text-yellow-700 text-[10px] tracking-[0.4em] font-black uppercase active:text-yellow-400">Purificar</button>
        <button onClick={toggleAction} className="w-20 h-20 rounded-full border-2 border-yellow-500/30 bg-yellow-500/5 text-yellow-500 flex items-center justify-center shadow-[0_0_50px_rgba(212,175,55,0.2)] active:scale-90 transition-all hover:bg-yellow-500/10">
          {status === AppStatus.PLAYING ? <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg> : <svg xmlns="http://www.w3.org/2000/svg" className="h-11 w-11 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
        </button>
        <div className="text-right">
          <p className="text-[8px] font-mono text-yellow-600/40 tracking-widest uppercase">ARCOTECH_DORADO_SU</p>
          <p className="text-[7px] text-cyan-900 font-black uppercase">Honor 400 Optimizer</p>
        </div>
      </footer>

      {error && <div className="fixed top-32 px-10 py-4 bg-red-950/95 border-2 border-red-500/50 text-red-200 text-[11px] font-black rounded-full animate-bounce z-[110] shadow-[0_0_40px_rgba(255,0,0,0.5)] uppercase tracking-widest">{error}</div>}
    </div>
  );
};

export default App;
