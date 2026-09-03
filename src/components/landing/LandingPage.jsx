import React from 'react';
import { APP_VERSION_LABEL } from '../../constants/appMetadata';
import { 
  Mic, Database, Server, CloudLightning, Brain, ArrowRight, Sun, Laptop, Moon 
} from 'lucide-react';

export const LandingPage = ({ onStart, theme, setTheme }) => {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center transition-colors duration-500">
      <div className="max-w-3xl w-full flex flex-col items-center animate-in fade-in zoom-in-95 duration-300">
        <div className="w-24 h-24 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-xl shadow-indigo-500/30 mb-8 rotate-3 hover:rotate-6 transition-transform">
          <Mic className="w-12 h-12 text-white" />
        </div>
        <h1 className="text-4xl md:text-6xl font-black text-slate-800 dark:text-white mb-4 tracking-tight">
          ProLingo <span className="text-indigo-500">{APP_VERSION_LABEL}</span>
        </h1>
        <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 mb-10 max-w-xl leading-relaxed">
          Professional Pronunciation & Memory Training Platform.
          <br/><span className="text-sm opacity-70">Structured Data • Manual Builder • Playback Refactor</span>
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-12 w-full max-w-2xl">
          {[
            { icon: Database, text: "Custom Decks", color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-900/20" },
            { icon: Server, text: "Edge TTS Node", color: "text-teal-500", bg: "bg-teal-50 dark:bg-teal-900/20" },
            { icon: CloudLightning, text: "Gemini AI", color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-900/20" },
            { icon: Brain, text: "Memory Drill", color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-900/20" }
          ].map((feat, idx) => (
            <div key={idx} className={`${feat.bg} p-3 rounded-xl flex items-center justify-center gap-2 border border-transparent dark:border-white/5`}>
              <feat.icon className={`w-4 h-4 ${feat.color}`} />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{feat.text}</span>
            </div>
          ))}
        </div>
        <button 
          onClick={onStart}
          className="group relative px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-lg shadow-lg hover:shadow-indigo-500/50 transition-all w-full md:w-auto flex items-center justify-center gap-3 overflow-hidden"
        >
          <span className="relative z-10 flex items-center gap-2">Mulai Latihan <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform"/></span>
          <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
        </button>
        <div className="mt-16 p-1.5 bg-white dark:bg-slate-900 rounded-full border border-slate-200 dark:border-slate-800 flex items-center shadow-sm relative">
          <div className={`absolute top-1.5 bottom-1.5 w-8 rounded-full bg-indigo-100 dark:bg-slate-800 transition-all duration-300 ease-out ${
            theme === 'light' ? 'left-1.5' : theme === 'system' ? 'left-[calc(50%-16px)]' : 'left-[calc(100%-38px)]'
          }`}></div>
          
          <button onClick={() => setTheme('light')} className={`relative z-10 p-2 rounded-full transition-all ${theme === 'light' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
            <Sun className="w-4 h-4" />
          </button>
          <button onClick={() => setTheme('system')} className={`relative z-10 p-2 rounded-full transition-all ${theme === 'system' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
            <Laptop className="w-4 h-4" />
          </button>
          <button onClick={() => setTheme('dark')} className={`relative z-10 p-2 rounded-full transition-all ${theme === 'dark' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
            <Moon className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-2">
          {theme === 'system' ? 'Mengikuti tema perangkat' : theme === 'dark' ? 'Mode Gelap Aktif' : 'Mode Terang Aktif'}
        </p>
      </div>
    </div>
  );
};

export default LandingPage;
