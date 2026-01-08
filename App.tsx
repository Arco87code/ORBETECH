
import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import SoundWaves from './components/SoundWaves';
import GoldenOrb from './components/GoldenOrb';
import { generateSpeech, decodeAudioData } from './services/geminiService';
import { AppStatus } from './types';

const VOICES = ['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir'];
const GITHUB_URL = "https://github.com/Arco87code/ORBETECH.git";

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [text, setText] = useState<string>("");
  const [voice, setVoice] = useState<string>('Kore');
  const [latency, setLatency] = useState<number>(0);
  
  // Audio Controls
  const [bass, setBass] = useState<number>(0);
  const [mid, setMid] = useState<number>(0);
  const [treble, setTreble] = useState<number>(0);
  const [masterVolume, setMasterVolume] = useState<number>(1);
  
  // Wave Color Controls
  const [wavePrimary, setWavePrimary] = useState<string>('#00E5FF');
  const [waveSecondary, setWaveSecondary] = useState<string>('#E0F7FA');
  
  // Visualizations
  const [vuLevel, setVuLevel] = useState<number>(0);
  const [bassVis, setBassVis] = useState<number>(0);
  const [midVis, setMidVis] = useState<number>(0);
  const [trebleVis, setTrebleVis] = useState<number>(0);
  
  const [progress, setProgress] = useState<number>(0);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [hasKey, setHasKey] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bassRef = useRef<BiquadFilterNode | null>(null);
  const midRef = useRef<BiquadFilterNode | null>(null);
  const trebleRef = useRef<BiquadFilterNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const durationRef = useRef<number>(0);

  useEffect(() => {
    const checkKey = async () => {
      const aistudio = (window as any).aistudio;
      if (aistudio?.hasSelectedApiKey) setHasKey(await aistudio.hasSelectedApiKey());
    };
    checkKey();
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    });
  }, []);

  const initAudioEngine = () => {
    if (!audioCtxRef.current) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      const createFilter = (type: BiquadFilterType, freq: number) => {
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.gain.value = 0;
        return f;
      };

      const b = createFilter('lowshelf', 250);
      const m = createFilter('peaking', 1000);
      const t = createFilter('highshelf', 4000);
      const g = ctx.createGain();
      g.gain.value = masterVolume;

      b.connect(m);
      m.connect(t);
      t.connect(g);
      g.connect(analyser);
      analyser.connect(ctx.destination);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      bassRef.current = b;
      midRef.current = m;
      trebleRef.current = t;
      gainRef.current = g;
    }
  };

  useEffect(() => {
    if (bassRef.current) bassRef.current.gain.value = bass;
    if (midRef.current) midRef.current.gain.value = mid;
    if (trebleRef.current) trebleRef.current.gain.value = treble;
    if (gainRef.current) gainRef.current.gain.value = masterVolume;
  }, [bass, mid, treble, masterVolume]);

  useEffect(() => {
    let frame: number;
    const update = () => {
      if (analyserRef.current && (status === AppStatus.PLAYING)) {
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        
        const average = data.reduce((a, b) => a + b) / data.length;
        setVuLevel(average / 1.5);

        const bVal = data.slice(0, 5).reduce((a,b) => a+b, 0) / 5;
        const mVal = data.slice(10, 31).reduce((a,b) => a+b, 0) / 21;
        const tVal = data.slice(40, 101).reduce((a,b) => a+b, 0) / 61;

        setBassVis(bVal / 2);
        setMidVis(mVal / 2);
        setTrebleVis(tVal / 2);

        const elapsed = audioCtxRef.current!.currentTime - startTimeRef.current;
        setProgress(Math.min(elapsed / durationRef.current, 1));
      } else {
        setVuLevel(v => v * 0.9);
        setBassVis(v => v * 0.9);
        setMidVis(v => v * 0.9);
        setTrebleVis(v => v * 0.9);
      }
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [status]);

  const handleInstall = async () => {
    if (!installPrompt) {
      alert("Para instalar: Menú > Añadir a pantalla de inicio.");
      return;
    }
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstallPrompt(null);
  };

  const handleDownloadZip = async () => {
    const zip = new JSZip();
    const files = [
      'index.html', 
      'App.tsx', 
      'index.tsx', 
      'services/geminiService.ts', 
      'components/SoundWaves.tsx', 
      'components/GoldenOrb.tsx', 
      'types.ts', 
      'manifest.json',
      'metadata.json',
      'sw.js'
    ];
    try {
      setStatus(AppStatus.LOADING);
      for (const file of files) {
        const response = await fetch(`./${file}`);
        if (response.ok) {
          const content = await response.text();
          zip.file(file, content);
        }
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ARCOTECH_FULL_STATION_SOURCE.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setStatus(AppStatus.IDLE);
    } catch (e) { 
      alert("Error al exportar sistema."); 
      setStatus(AppStatus.ERROR);
    }
  };

  const handleSynthesis = async () => {
    if (status === AppStatus.PLAYING) {
      if (sourceRef.current) try { sourceRef.current.stop(); } catch(e){}
      setStatus(AppStatus.IDLE);
      return;
    }
    if (!text.trim()) return;
    initAudioEngine();
    setStatus(AppStatus.LOADING);
    try {
      const { audioData, latency: l } = await generateSpeech(text, voice);
      setLatency(l);
      const audioBuffer = await decodeAudioData(audioData, audioCtxRef.current!);
      durationRef.current = audioBuffer.duration;
      const source = audioCtxRef.current!.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(bassRef.current!);
      source.onended = () => { setStatus(AppStatus.IDLE); setProgress(0); };
      startTimeRef.current = audioCtxRef.current!.currentTime;
      source.start();
      sourceRef.current = source;
      setStatus(AppStatus.PLAYING);
    } catch (err) { setStatus(AppStatus.ERROR); }
  };

  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden"
         style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}>
      
      {/* HEADER DE PRECISIÓN */}
      <header className="px-8 py-6 flex items-center justify-between gold-glass border-b border-[#D4AF37]/20">
        <div className="flex items-center space-x-4">
          <div className="relative">
             <div className="absolute inset-0 bg-[#D4AF37] blur-md opacity-30"></div>
             <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="relative">
                <rect x="2" y="2" width="20" height="20" rx="6" fill="#D4AF37" />
                <path d="M7 12H17M12 7V17" stroke="white" strokeWidth="3" strokeLinecap="round"/>
             </svg>
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tighter text-[#4B3B0B]">ARCOTECH</h1>
            <div className="text-[7px] font-bold text-[#D4AF37] tracking-[0.5em] uppercase">Master Studio V1</div>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex flex-col items-end">
            <span className="mono text-[8px] text-[#D4AF37] font-bold">{latency.toFixed(1)}ms</span>
            <div className={`px-3 py-1 rounded-sm text-[7px] font-black border transition-colors ${hasKey ? 'border-[#00E5FF]/40 text-[#00E5FF] bg-[#00E5FF]/5' : 'border-red-100 text-red-400'}`}>
              {hasKey ? 'ENCRYPTED' : 'KEY_MISSING'}
            </div>
          </div>
          <a 
            href={GITHUB_URL} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="p-2 border border-[#D4AF37]/20 rounded-lg text-[#D4AF37] hover:bg-[#D4AF37]/5 active:scale-90 transition-all"
            title="Ver Repositorio ORBETECH"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.041-1.416-4.041-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
          </a>
        </div>
      </header>

      {/* ÁREA DE RESONANCIA DINÁMICA */}
      <div className="h-14 bg-white/50 backdrop-blur-md relative border-b border-[#D4AF37]/5">
        <SoundWaves 
          analyser={analyserRef.current} 
          isActive={status === AppStatus.PLAYING} 
          thickness={1.5} 
          speed={1.5} 
          primaryColor={wavePrimary} 
          secondaryColor={waveSecondary} 
        />
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(90deg,white,transparent_10%,transparent_90%,white)]"></div>
      </div>

      <main className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        
        {/* INTERFAZ DEL ORBE AR */}
        <div className="flex justify-center py-4 relative group">
          <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none scale-150 transition-transform duration-1000 group-hover:scale-110">
             <div className="w-full h-full max-w-sm">
                <SoundWaves 
                  analyser={analyserRef.current} 
                  isActive={status === AppStatus.PLAYING} 
                  thickness={0.5} 
                  speed={0.5} 
                  primaryColor={wavePrimary} 
                  secondaryColor="transparent" 
                />
             </div>
          </div>
          <GoldenOrb status={status} onClick={handleSynthesis} progress={progress} analyser={analyserRef.current} />
        </div>

        {/* SELECTOR DE VOZ PROFESIONAL */}
        <div className="flex space-x-2 overflow-x-auto no-scrollbar py-2">
          {VOICES.map(v => (
            <button 
              key={v} 
              onClick={() => setVoice(v)} 
              className={`px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all shadow-sm
                ${voice === v ? 'bg-[#D4AF37] text-white border-[#D4AF37] shadow-[#D4AF37]/30 scale-105' : 'bg-white text-[#D4AF37]/40 border-[#D4AF37]/10'}`}
            >
              {v}
            </button>
          ))}
        </div>

        {/* CONSOLA DE TEXTO */}
        <div className="relative">
          <textarea 
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Introduce parámetros de síntesis..."
            className="w-full h-32 p-8 bg-white/80 border border-[#D4AF37]/15 rounded-[3rem] text-lg text-[#4B3B0B] focus:outline-none focus:border-[#D4AF37] transition-all shadow-inner placeholder:text-[#D4AF37]/20"
          />
          <div className="absolute bottom-6 right-8 text-[9px] font-bold text-[#D4AF37]/40 uppercase tracking-tighter">Neural Input Node</div>
        </div>

        {/* DSP RACK UNIT */}
        <div className="p-8 gold-glass rounded-[3rem] space-y-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <svg width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" stroke="#D4AF37" strokeWidth="1" fill="none" strokeDasharray="4 4" /></svg>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between items-end"><span className="text-[10px] font-black uppercase text-[#4B3B0B] tracking-widest">Master Amplitude</span><span className="mono text-[11px] text-[#D4AF37] font-bold">{(masterVolume * 100).toFixed(0)}%</span></div>
              <input type="range" min="0" max="2" step="0.01" value={masterVolume} onChange={(e) => setMasterVolume(parseFloat(e.target.value))} className="w-full" />
            </div>

            <div className="grid grid-cols-1 gap-6">
              {[
                { label: 'Sub-Bass', val: bass, vis: bassVis, set: setBass, freq: '60Hz' },
                { label: 'Mid-Definition', val: mid, vis: midVis, set: setMid, freq: '1.2kHz' },
                { label: 'Air-Treble', val: treble, vis: trebleVis, set: setTreble, freq: '12kHz' }
              ].map(band => (
                <div key={band.label} className="space-y-3">
                  <div className="flex justify-between items-center text-[9px] font-black text-[#D4AF37]/80 uppercase tracking-tighter">
                    <span className="w-24">{band.label}</span>
                    <div className="flex-1 mx-4 h-[2px] bg-[#D4AF37]/10 relative">
                       <div className="absolute top-1/2 -translate-y-1/2 h-3 w-1 bg-[#D4AF37] transition-all duration-75" style={{ left: `${Math.min(band.vis, 100)}%`, boxShadow: '0 0 10px #D4AF37' }}></div>
                    </div>
                    <span className="mono text-[#4B3B0B] w-12 text-right">{band.val > 0 ? `+${band.val}` : band.val}dB</span>
                  </div>
                  <input type="range" min="-12" max="12" value={band.val} onChange={(e) => band.set(parseInt(e.target.value))} className="w-full" />
                </div>
              ))}
            </div>

            {/* CONTROL DE CALIBRACIÓN VISUAL */}
            <div className="pt-6 border-t border-[#D4AF37]/10">
              <div className="text-[10px] font-black uppercase text-[#D4AF37]/60 tracking-widest mb-4">Visual Resonance Calibration</div>
              <div className="flex space-x-8 items-center justify-center sm:justify-start">
                <div className="flex flex-col items-center space-y-2">
                  <label className="text-[8px] font-bold text-[#4B3B0B] uppercase tracking-widest">Primary</label>
                  <div className="relative group">
                    <input 
                      type="color" 
                      value={wavePrimary} 
                      onChange={(e) => setWavePrimary(e.target.value)}
                      className="w-12 h-12 rounded-full border-2 border-[#D4AF37]/20 bg-transparent cursor-pointer overflow-hidden p-0 transition-transform active:scale-90"
                    />
                    <div className="absolute inset-0 rounded-full pointer-events-none border border-white/40"></div>
                  </div>
                </div>
                <div className="flex flex-col items-center space-y-2">
                  <label className="text-[8px] font-bold text-[#4B3B0B] uppercase tracking-widest">Secondary</label>
                  <div className="relative group">
                    <input 
                      type="color" 
                      value={waveSecondary} 
                      onChange={(e) => setWaveSecondary(e.target.value)}
                      className="w-12 h-12 rounded-full border-2 border-[#D4AF37]/20 bg-transparent cursor-pointer overflow-hidden p-0 transition-transform active:scale-90"
                    />
                    <div className="absolute inset-0 rounded-full pointer-events-none border border-white/40"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ACCIONES DE SISTEMA */}
        <div className="space-y-4 pb-8">
          <div className="text-[10px] font-black uppercase text-[#D4AF37] tracking-[0.3em] px-4">System Operations</div>
          
          <button 
            onClick={handleDownloadZip} 
            className="w-full flex items-center justify-center space-x-4 py-6 bg-gradient-to-r from-[#D4AF37] to-[#996515] text-white rounded-[2.5rem] shadow-2xl active:scale-[0.98] transition-all relative group overflow-hidden"
          >
            <div className="absolute inset-0 bg-white opacity-0 group-active:opacity-10 transition-opacity"></div>
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" className="drop-shadow-sm">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            <span className="text-[11px] font-black uppercase tracking-[0.4em]">Download Master Source (ZIP)</span>
          </button>

          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={handleInstall} 
              className="py-5 bg-white border border-[#D4AF37]/30 text-[#D4AF37] rounded-[2rem] text-[9px] font-black uppercase tracking-[0.2em] active:scale-95 transition-all shadow-lg shadow-[#D4AF37]/5"
            >
              Deploy to OS
            </button>
            <a 
              href={GITHUB_URL} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex items-center justify-center space-x-2 py-5 bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#4B3B0B] rounded-[2rem] text-[9px] font-black uppercase tracking-[0.2em] active:scale-95 transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.041-1.416-4.041-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              <span>ORBETECH Repo</span>
            </a>
          </div>
        </div>
      </main>

      {/* VÚMETRO DE SALIDA MASTER */}
      <footer className="px-8 py-6 bg-white border-t border-[#D4AF37]/10">
        <div className="flex justify-between text-[8px] font-black text-[#D4AF37] uppercase mb-2">
           <span>Signal Output</span>
           <span>Studio Level Peak</span>
        </div>
        <div className="flex space-x-1 h-3">
          {[...Array(50)].map((_, i) => (
            <div 
              key={i} 
              className={`flex-1 rounded-sm transition-all duration-75 ${i < (vuLevel / 2) ? (i > 42 ? 'bg-red-500 shadow-[0_0_8px_red]' : 'bg-[#D4AF37] shadow-[0_0_8px_#D4AF37]') : 'bg-[#D4AF37]/10'}`}
            ></div>
          ))}
        </div>
      </footer>
    </div>
  );
};

export default App;
