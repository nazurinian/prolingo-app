/* eslint-disable no-control-regex */
// eslint-disable-next-line no-unused-vars
import React, { useState, useEffect, useRef, memo, useMemo, useCallback, useLayoutEffect } from 'react';
import { 
  Play, Pause, RotateCcw, Volume2, Settings, Trash2, List, Mic, Globe, 
  CheckCircle, Save, Upload, Table, SkipBack, SkipForward, X, 
  Wand2, Download, Loader2, FolderOpen, Database, Shuffle, Repeat, Repeat1, FileText,
  ToggleLeft, ToggleRight, AlertCircle, PanelLeftClose, PanelLeftOpen, Lock, Unlock,
  Hash, Music, Bot, AlertTriangle, Terminal, XCircle, ChevronDown, Layers, Smartphone,
  Monitor, Cpu, CheckSquare, Square, ChevronRight, MoreHorizontal, ArrowRightToLine,
  Languages, Eye, EyeOff, Brain, BookOpen, Plus, Send, ListPlus, MinusCircle, Eraser,
  ChevronsUp, MoreVertical, LayoutTemplate, Moon, Sun, Laptop, ArrowRight, Server, CloudLightning
} from 'lucide-react';

// --- SYSTEM ENVIRONMENT VAR ---
const apiKey = ""; 

// --- VIRTUALIZATION CONSTANTS ---
const DEFAULT_ROW_HEIGHT_PC = 160; 
const DEFAULT_ROW_HEIGHT_MOBILE = 205; 
const OVERSCAN = 20;

// --- UTILITIES ---
const writeString = (view, offset, string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

const encodeWAV = (samples, sampleRate = 24000) => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);
  const length = samples.length;
  for (let i = 0; i < length; i++) {
    view.setInt16(44 + i * 2, samples[i], true);
  }
  return view;
};

const base64ToInt16Array = (base64) => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Int16Array(len / 2);
  for (let i = 0; i < len; i += 2) {
    bytes[i / 2] = (binaryString.charCodeAt(i + 1) << 8) | binaryString.charCodeAt(i);
  }
  return bytes;
};

const sanitizeFilename = (name) => {
  if (!name) return 'audio';
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
};

const triggerBrowserDownload = (url, filename) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

const formatVoiceLabel = (voice) => {
  let name = voice.name || voice.label || "";
  name = name.replace(/^Microsoft /i, '').replace(/^Google /i, '').replace(/^Android /i, '');
  name = name.replace(/Online \(Natural\) - /i, '');
  name = name.replace(/ - English \(.+\)/i, '').replace(/ English \(.+\)/i, '');
  name = name.replace(/ - Indonesian \(.+\)/i, '').replace(/ Indonesian \(.+\)/i, '');
  return name; 
};

// --- HELPER: Highlight Word in Text ---
const HighlightedText = ({ text, highlight, className = "" }) => {
  if (!highlight || !text) return <span className={className}>{text}</span>;
  
  const safeHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  const parts = text.split(new RegExp(`(${safeHighlight})`, 'gi'));
  return (
    <span className={className}>
      {parts.map((part, i) => 
        part.toLowerCase() === highlight.toLowerCase() ? (
          <strong key={i} className="font-extrabold text-current underline decoration-dotted decoration-2 underline-offset-2">{part}</strong>
        ) : (
          part
        )
      )}
    </span>
  );
};

// --- DATA: EDGE TTS VOICES (COMPREHENSIVE v5.5 LIST) ---
const initialEdgeVoices = [
    // --- UK (GB) ---
    { id: "en-GB-SoniaNeural", label: "Sonia (UK)", lang: "en-GB" },
    { id: "en-GB-RyanNeural", label: "Ryan (UK)", lang: "en-GB" },
    { id: "en-GB-LibbyNeural", label: "Libby (UK)", lang: "en-GB" },
    { id: "en-GB-MaisieNeural", label: "Maisie (UK - Child)", lang: "en-GB" },
    { id: "en-GB-ThomasNeural", label: "Thomas (UK)", lang: "en-GB" },
    { id: "en-GB-AlfiesNeural", label: "Alfie (UK)", lang: "en-GB" },

    // --- US ---
    { id: "en-US-AriaNeural", label: "Aria (US)", lang: "en-US" },
    { id: "en-US-GuyNeural", label: "Guy (US)", lang: "en-US" },
    { id: "en-US-JennyNeural", label: "Jenny (US)", lang: "en-US" },
    { id: "en-US-ChristopherNeural", label: "Christopher (US)", lang: "en-US" },
    { id: "en-US-EricNeural", label: "Eric (US)", lang: "en-US" },
    { id: "en-US-MichelleNeural", label: "Michelle (US)", lang: "en-US" },
    { id: "en-US-AnaNeural", label: "Ana (US - Child)", lang: "en-US" },
    { id: "en-US-SteffanNeural", label: "Steffan (US)", lang: "en-US" },
    { id: "en-US-RogerNeural", label: "Roger (US)", lang: "en-US" },

    // --- AU (Australia) ---
    { id: "en-AU-NatashaNeural", label: "Natasha (AU)", lang: "en-AU" },
    { id: "en-AU-WilliamNeural", label: "William (AU)", lang: "en-AU" },
    { id: "en-AU-AnnetteNeural", label: "Annette (AU)", lang: "en-AU" },
    { id: "en-AU-CarlyNeural", label: "Carly (AU)", lang: "en-AU" },
    { id: "en-AU-DarrenNeural", label: "Darren (AU)", lang: "en-AU" },
    { id: "en-AU-DuncanNeural", label: "Duncan (AU)", lang: "en-AU" },
    { id: "en-AU-ElsieNeural", label: "Elsie (AU)", lang: "en-AU" },
    { id: "en-AU-FreyaNeural", label: "Freya (AU)", lang: "en-AU" },
    { id: "en-AU-JoanneNeural", label: "Joanne (AU)", lang: "en-AU" },
    { id: "en-AU-KenNeural", label: "Ken (AU)", lang: "en-AU" },
    { id: "en-AU-KimNeural", label: "Kim (AU)", lang: "en-AU" },
    { id: "en-AU-NeilNeural", label: "Neil (AU)", lang: "en-AU" },
    { id: "en-AU-TimNeural", label: "Tim (AU)", lang: "en-AU" },
    { id: "en-AU-TinaNeural", label: "Tina (AU)", lang: "en-AU" },

    // --- SG (Singapore) ---
    { id: "en-SG-LunaNeural", label: "Luna (SG)", lang: "en-SG" },
    { id: "en-SG-WayneNeural", label: "Wayne (SG)", lang: "en-SG" },

    // --- OTHER ENGLISH ---
    { id: "en-CA-ClaraNeural", label: "Clara (Canada)", lang: "en-CA" },
    { id: "en-CA-LiamNeural", label: "Liam (Canada)", lang: "en-CA" },
    { id: "en-HK-SamNeural", label: "Sam (Hong Kong)", lang: "en-HK" },
    { id: "en-HK-YanNeural", label: "Yan (Hong Kong)", lang: "en-HK" },
    { id: "en-IE-ConnorNeural", label: "Connor (Ireland)", lang: "en-IE" },
    { id: "en-IE-EmilyNeural", label: "Emily (Ireland)", lang: "en-IE" },
    { id: "en-IN-NeerjaNeural", label: "Neerja (India)", lang: "en-IN" },
    { id: "en-IN-PrabhatNeural", label: "Prabhat (India)", lang: "en-IN" },
    { id: "en-KE-AsiliaNeural", label: "Asilia (Kenya)", lang: "en-KE" },
    { id: "en-KE-ChilembaNeural", label: "Chilemba (Kenya)", lang: "en-KE" },
    { id: "en-NG-AbeoNeural", label: "Abeo (Nigeria)", lang: "en-NG" },
    { id: "en-NG-EzinneNeural", label: "Ezinne (Nigeria)", lang: "en-NG" },
    { id: "en-NZ-MitchellNeural", label: "Mitchell (New Zealand)", lang: "en-NZ" },
    { id: "en-NZ-MollyNeural", label: "Molly (New Zealand)", lang: "en-NZ" },
    { id: "en-PH-JamesNeural", label: "James (Philippines)", lang: "en-PH" },
    { id: "en-PH-RosaNeural", label: "Rosa (Philippines)", lang: "en-PH" },
    { id: "en-TZ-ElimuNeural", label: "Elimu (Tanzania)", lang: "en-TZ" },
    { id: "en-TZ-ImaniNeural", label: "Imani (Tanzania)", lang: "en-TZ" },
    { id: "en-ZA-LeahNeural", label: "Leah (South Africa)", lang: "en-ZA" },
    { id: "en-ZA-LukeNeural", label: "Luke (South Africa)", lang: "en-ZA" },

    // --- INDONESIAN REGION (ID, JV, SU) ---
    { id: "id-ID-GadisNeural", label: "Gadis (Indonesia)", lang: "id-ID" },
    { id: "id-ID-ArdiNeural", label: "Ardi (Indonesia)", lang: "id-ID" },
    { id: "jv-ID-DimasNeural", label: "Dimas (Javanese)", lang: "jv-ID" },
    { id: "jv-ID-SitiNeural", label: "Siti (Javanese)", lang: "jv-ID" },
    { id: "su-ID-JajangNeural", label: "Jajang (Sundanese)", lang: "su-ID" },
    { id: "su-ID-JajangNeural", label: "Jajang (Sundanese)", lang: "su-ID" }
];

const groupVoicesByRegion = (voiceList, context = 'general') => {
    const groups = {
        "UK (United Kingdom)": [],
        "US (United States)": [],
        "AU (Australia)": [],
        "SG (Singapore)": [],
        "Other English": [],
        "Indonesia & Regional (ID/JV/SU)": [] 
    };

    voiceList.forEach(v => {
        const lang = (v.lang || "").replace('_', '-'); 
        const isEnglish = lang.startsWith("en");
        const isIndoRegion = lang.includes("ID") || lang === 'id' || lang === 'jv' || lang === 'su' || lang.includes("indones");

        if (context === 'main') {
            if (!isEnglish) return; 
        } else if (context === 'meaning') {
            if (isIndoRegion) {
                groups["Indonesia & Regional (ID/JV/SU)"].push(v);
                return;
            }
            return; 
        } else {
            if (isIndoRegion) {
                groups["Indonesia & Regional (ID/JV/SU)"].push(v);
                return; 
            }
        }
        
        if (isEnglish) {
            if (lang.includes("GB") || lang.includes("UK")) groups["UK (United Kingdom)"].push(v);
            else if (lang.includes("US")) groups["US (United States)"].push(v);
            else if (lang.includes("AU")) groups["AU (Australia)"].push(v);
            else if (lang.includes("SG")) groups["SG (Singapore)"].push(v);
            else groups["Other English"].push(v);
        }
    });

    return groups;
};

const GroupedVoiceSelect = ({ voices, selectedValue, onChange, className, context = 'general' }) => {
    const grouped = groupVoicesByRegion(voices, context);
    const hasOptions = Object.values(grouped).some(g => g.length > 0);

    if (!hasOptions) {
        return (
             <div className={`${className} opacity-50 text-slate-500 italic flex items-center px-2`}>
                No voices available
             </div>
        );
    }
    
    return (
        <select 
            className={className} 
            onChange={onChange} 
            value={selectedValue}
        >
            {Object.keys(grouped).map(groupName => (
                grouped[groupName].length > 0 && (
                    <optgroup key={groupName} label={groupName}>
                        {grouped[groupName].map(v => (
                            <option key={v.id || v.name} value={v.id || v.name}>
                                {v.label || formatVoiceLabel(v)}
                            </option>
                        ))}
                    </optgroup>
                )
            ))}
        </select>
    );
};

// --- COMPONENT: LANDING PAGE ---
const LandingPage = ({ onStart, theme, setTheme }) => {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center transition-colors duration-500">
            <div className="max-w-3xl w-full flex flex-col items-center animate-in fade-in zoom-in-95 duration-700">
                <div className="w-24 h-24 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-xl shadow-indigo-500/30 mb-8 rotate-3 hover:rotate-6 transition-transform">
                    <Mic className="w-12 h-12 text-white" />
                </div>
                <h1 className="text-4xl md:text-6xl font-black text-slate-800 dark:text-white mb-4 tracking-tight">
                    ProLingo <span className="text-indigo-500">v5.6</span>
                </h1>
                <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 mb-10 max-w-xl leading-relaxed">
                    Professional Pronunciation & Memory Training Platform.
                    <br/><span className="text-sm opacity-70">Hybrid Engine • Edge TTS Enhanced • Priority Sorting</span>
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

// --- OPTIMIZED ROW COMPONENT (TABLE) ---
const MemoizedRow = memo(({ 
    item, 
    isActive, 
    isSystemBusy, 
    toggleStudyItem, 
    isInQueue, 
    handleIndependentPlay, 
    handleRowClick, 
    independentPlayingId, 
    speakingPart, 
    isMemoryMode, 
    memorySettings, 
    revealedCells, 
    toggleCellReveal, 
    localWordUrl,     
    localSentUrl, 
    localMeaningUrl,    
    preferLocalAudio, 
    generateAIAudio, 
    aiLoadingId,
    rowId,
    idx,
    style,
    activeMenuId,      
    onMenuToggle,
    generatorEngine       
}) => {
    
    const isMenuOpen = activeMenuId === rowId;
    const isWordUsingLocal = localWordUrl && preferLocalAudio;
    
    const isWordActive = isActive && speakingPart === 'word';
    const isSentActive = isActive && speakingPart === 'sentence';
    const isMeaningActive = isActive && speakingPart === 'meaning';

    const blurClass = "filter blur-sm bg-slate-100 dark:bg-slate-800 select-none cursor-pointer transition-all duration-300";
    const revealedClass = "filter-none bg-yellow-50 dark:bg-yellow-900/30 cursor-pointer transition-all duration-300";

    const isWordHidden = isMemoryMode && memorySettings.word;
    const isSentHidden = isMemoryMode && memorySettings.sentence;
    const isMeaningHidden = isMemoryMode && memorySettings.meaning;
    
    const wordRevealed = revealedCells[`${rowId}-word`];
    const sentRevealed = revealedCells[`${rowId}-sent`];
    const meaningRevealed = revealedCells[`${rowId}-meaning`];

    const GenIcon = generatorEngine === 'edge' ? Server : Wand2;
    const genColorClass = generatorEngine === 'edge' 
        ? 'text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/40' 
        : 'text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50';

    return (
        <div style={style} className="absolute left-0 right-0 px-2 py-2 z-0">
            <div 
                id={rowId} 
                onClick={(e) => { 
                    e.stopPropagation(); 
                    handleRowClick(item, idx); 
                }} 
                className={`h-full rounded-xl border p-3 flex flex-col justify-between transition-all hover:shadow-md cursor-pointer relative ${isActive ? 'bg-blue-600 border-blue-700 dark:border-blue-500 shadow-md ring-1 ring-blue-500' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}
            >
                {/* --- MOBILE OVERFLOW MENU TRIGGER --- */}
                <div className="md:hidden absolute top-2 right-2 z-20">
                    <button 
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            onMenuToggle(rowId); 
                        }}
                        className={`p-1.5 rounded-full transition-colors ${isActive ? 'text-white hover:bg-blue-500' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                    >
                        <MoreVertical className="w-5 h-5" />
                    </button>

                    {/* --- MOBILE MENU DROPDOWN (Adjusted Size) --- */}
                    {isMenuOpen && (
                        <div className="absolute top-8 right-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl rounded-lg p-1 flex flex-col gap-1 w-32 z-30 animate-in fade-in zoom-in-95 duration-150 origin-top-right">
                             <button
                                onClick={(e) => { e.stopPropagation(); toggleStudyItem(item.id); onMenuToggle(null); }}
                                className={`w-full px-2 py-1.5 flex items-center gap-2 rounded text-[10px] font-bold border transition-all ${isInQueue
                                        ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800'
                                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-100 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                                    }`}
                            >
                                {isInQueue ? <CheckCircle className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                                {isInQueue ? "Added" : "Queue"}
                            </button>
                            <div className="h-[1px] bg-slate-100 dark:bg-slate-700 w-full my-0.5"></div>
                             
                             {localWordUrl ? (
                                    <button disabled className="w-full px-2 py-1.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded border border-green-200 dark:border-green-800 flex items-center gap-2 cursor-not-allowed"><CheckCircle className="w-3 h-3" /> <span className="text-[10px] font-bold">Word OK</span></button>
                                ) : (
                                    <button disabled={isSystemBusy} onClick={(e) => { e.stopPropagation(); generateAIAudio(item, 'word'); onMenuToggle(null); }} className={`w-full px-2 py-1.5 flex items-center gap-2 rounded border shadow-sm ${genColorClass} ${isSystemBusy ? 'opacity-50' : ''}`}>
                                        {aiLoadingId === `${item.id}-word` ? <Loader2 className="w-3 h-3 animate-spin" /> : <GenIcon className="w-3 h-3" />} <span className="text-[10px] font-bold">Word</span>
                                    </button>
                                )}
                             
                             {localSentUrl ? (
                                    <button disabled className="w-full px-2 py-1.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded border border-green-200 dark:border-green-800 flex items-center gap-2 cursor-not-allowed"><CheckCircle className="w-3 h-3" /> <span className="text-[10px] font-bold">Sent OK</span></button>
                                ) : (
                                    <button disabled={isSystemBusy} onClick={(e) => { e.stopPropagation(); generateAIAudio(item, 'sentence'); onMenuToggle(null); }} className={`w-full px-2 py-1.5 flex items-center gap-2 rounded border shadow-sm ${genColorClass} ${isSystemBusy ? 'opacity-50' : ''}`}>
                                        {aiLoadingId === `${item.id}-sentence` ? <Loader2 className="w-3 h-3 animate-spin" /> : <GenIcon className="w-3 h-3" />} <span className="text-[10px] font-bold">Sent</span>
                                    </button>
                                )}
                             
                             {generatorEngine === 'edge' && (
                                <>
                                 {localMeaningUrl ? (
                                        <button disabled className="w-full px-2 py-1.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded border border-green-200 dark:border-green-800 flex items-center gap-2 cursor-not-allowed"><CheckCircle className="w-3 h-3" /> <span className="text-[10px] font-bold">Mean OK</span></button>
                                    ) : (
                                        <button disabled={isSystemBusy} onClick={(e) => { e.stopPropagation(); generateAIAudio(item, 'meaning'); onMenuToggle(null); }} className={`w-full px-2 py-1.5 flex items-center gap-2 rounded border shadow-sm text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800 ${isSystemBusy ? 'opacity-50' : ''}`}>
                                            {aiLoadingId === `${item.id}-meaning` ? <Loader2 className="w-3 h-3 animate-spin" /> : <GenIcon className="w-3 h-3" />} <span className="text-[10px] font-bold">Mean</span>
                                        </button>
                                    )}
                                </>
                             )}
                        </div>
                    )}
                </div>

                <div className="flex flex-col md:flex-row justify-between items-start gap-2 h-full">
                    {/* --- MAIN CONTENT AREA --- */}
                    <div className="flex-1 w-full min-w-0 overflow-hidden flex flex-col gap-1 h-full">
                        <div className="flex items-start md:items-center gap-3 flex-shrink-0 mb-1 pr-8 md:pr-0">
                            <div className="w-8 flex flex-col items-center mt-1 md:mt-0"><span className={`text-xs font-mono font-bold ${isActive ? 'text-blue-200' : 'text-slate-400 dark:text-slate-500'}`}>#{item.displayId}</span></div>
                            <button onClick={(e) => { e.stopPropagation(); handleIndependentPlay(item, 'word', `${rowId}-word`); }} className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full border transition-colors mt-0.5 md:mt-0 ${independentPlayingId === `${rowId}-word` ? 'bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400' : (isActive ? 'bg-blue-500 border-blue-400 text-white hover:bg-blue-400' : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600')}`}>
                                {independentPlayingId === `${rowId}-word` ? <X className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                            </button>
                            <div
                                className={`flex-1 flex flex-col md:flex-row md:items-center gap-1 md:gap-2 min-w-0 ${isWordHidden ? (wordRevealed ? revealedClass : blurClass) : ''}`}
                                onClick={(e) => isWordHidden && toggleCellReveal(e, `${rowId}-word`)}
                            >
                                <h3 className={`text-lg leading-snug line-clamp-2 md:line-clamp-1 ${isWordActive ? 'font-bold text-white' : (isActive ? 'text-blue-100 font-normal' : 'text-slate-800 dark:text-slate-100 font-normal')}`}>
                                    {item.word}
                                </h3>
                                <div className="flex items-center gap-1 min-w-0 overflow-hidden max-w-full">
                                    {item.partOfSpeech && (
                                        <span className={`text-[10px] italic border px-1 rounded flex-shrink-0 ${isActive ? 'text-blue-200 border-blue-400' : 'text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-600'}`}>
                                            {item.partOfSpeech}
                                        </span>
                                    )}
                                    {item.meaningWord && (
                                        <div className={`text-[10px] border px-1 rounded overflow-x-auto whitespace-nowrap no-scrollbar min-w-0 ${isActive ? 'text-blue-200 border-blue-400 bg-blue-500' : 'text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800'}`}>
                                            {item.meaningWord}
                                        </div>
                                    )}
                                </div>
                            </div>
                            {isWordUsingLocal ? <span className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded font-bold flex items-center gap-1 flex-shrink-0 hidden md:flex"><Hash className="w-3 h-3" /> OK</span> : <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 hidden md:flex ${isActive ? 'bg-blue-700 text-blue-200' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500'}`}>TTS</span>}
                        </div>

                        <div className="flex flex-col gap-2 pl-0 md:pl-11 flex-1 overflow-y-auto pr-1 custom-scrollbar">
                            <div className="flex gap-2 items-start">
                                <button onClick={(e) => { e.stopPropagation(); handleIndependentPlay(item, 'sentence', `${rowId}-sent`); }} className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full border transition-colors mt-0.5 ${independentPlayingId === `${rowId}-sent` ? 'bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400' : (isActive ? 'bg-blue-500 border-blue-400 text-white hover:bg-blue-400' : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600')}`}>
                                    {independentPlayingId === `${rowId}-sent` ? <X className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                                </button>
                                <div className="flex-1">
                                    <div
                                        className={`${isSentHidden ? (sentRevealed ? revealedClass : blurClass) : ''}`}
                                        onClick={(e) => isSentHidden && toggleCellReveal(e, `${rowId}-sent`)}
                                    >
                                        <p className={`text-sm leading-relaxed line-clamp-4 md:line-clamp-2 ${isSentActive ? 'font-bold text-white' : (isActive ? 'text-blue-50 font-medium' : 'text-slate-600 dark:text-slate-300')}`}>
                                            "<HighlightedText text={item.sentence} highlight={item.word} />"
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {item.meaning && (
                                <div className={`flex gap-2 items-start transition-all ${isActive ? '' : ''} md:ml-6`}>
                                    <div className="w-6 flex justify-center flex-shrink-0 mt-0.5"> 
                                        <button onClick={(e) => { e.stopPropagation(); handleIndependentPlay(item, 'meaning', `${rowId}-meaning`); }} className={`w-4 h-4 flex items-center justify-center rounded-full border transition-colors ${independentPlayingId === `${rowId}-meaning` ? 'bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400' : (isActive ? 'bg-blue-500/50 text-white hover:bg-blue-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 hover:text-indigo-600')}`}>
                                            {independentPlayingId === `${rowId}-meaning` ? <X className="w-2 h-2 fill-current" /> : <Play className="w-2 h-2 fill-current" />}
                                        </button>
                                    </div>
                                    <div className="flex-1">
                                         <div
                                            className={`${isMeaningHidden ? (meaningRevealed ? revealedClass : blurClass) : ''}`}
                                            onClick={(e) => isMeaningHidden && toggleCellReveal(e, `${rowId}-meaning`)}
                                        >
                                            <p className={`text-xs italic transition-colors line-clamp-3 md:line-clamp-2 ${isMeaningActive ? 'font-bold text-white bg-blue-500/20 px-1 rounded' : (isActive ? 'text-blue-200' : 'text-slate-400 dark:text-slate-500')}`}>
                                                <HighlightedText text={item.meaning} highlight={item.meaningWord || item.word} />
                                                <Globe className={`w-3 h-3 inline-block ml-1 opacity-50 ${isActive ? 'text-blue-200' : 'text-slate-400 dark:text-slate-500'}`} />
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* --- ACTIONS AREA (Desktop Only) --- */}
                    <div className={`hidden md:flex md:flex-col md:ml-2 justify-center items-end w-auto gap-1 flex-shrink-0 md:border-l md:pl-2 ${isActive ? 'border-blue-500' : 'border-slate-100 dark:border-slate-700'}`}>
                        <div className="flex-none md:mb-1">
                            <button
                                onClick={(e) => { e.stopPropagation(); toggleStudyItem(item.id); }}
                                className={`md:w-[55px] md:h-[22px] flex items-center justify-center gap-1 rounded border text-[9px] font-bold transition-all ${isInQueue
                                        ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 border-green-300 dark:border-green-800 hover:bg-red-50 hover:text-red-600'
                                        : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-green-50 hover:text-green-600 hover:border-green-200'
                                    }`}
                            >
                                {isInQueue ? <CheckCircle className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                                <span>{isInQueue ? "Added" : "Add"}</span>
                            </button>
                        </div>
                        <div className="flex flex-col gap-1 items-end justify-end">
                            <div className="flex-none">
                                {localWordUrl ? (
                                    <button disabled className={`w-[55px] h-[22px] bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded border border-green-200 dark:border-green-800 flex items-center justify-center gap-1 cursor-not-allowed`}><CheckCircle className="w-3 h-3" /> <span className="text-[9px] font-bold">Word</span></button>
                                ) : (
                                    <button disabled={isSystemBusy} onClick={(e) => { e.stopPropagation(); generateAIAudio(item, 'word'); }} className={`w-[55px] h-[22px] flex items-center justify-center gap-1 rounded border shadow-sm ${genColorClass} ${isSystemBusy ? 'opacity-50' : ''}`}>
                                        {aiLoadingId === `${item.id}-word` ? <Loader2 className="w-3 h-3 animate-spin" /> : <GenIcon className="w-3 h-3" />} <span className="text-[9px] font-bold">Word</span>
                                    </button>
                                )}
                            </div>
                            <div className="flex-none">
                                {localSentUrl ? (
                                    <button disabled className={`w-[55px] h-[22px] bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded border border-green-200 dark:border-green-800 flex items-center justify-center gap-1 cursor-not-allowed`}><CheckCircle className="w-3 h-3" /> <span className="text-[9px] font-bold">Sent</span></button>
                                ) : (
                                    <button disabled={isSystemBusy} onClick={(e) => { e.stopPropagation(); generateAIAudio(item, 'sentence'); }} className={`w-[55px] h-[22px] flex items-center justify-center gap-1 rounded border shadow-sm ${genColorClass} ${isSystemBusy ? 'opacity-50' : ''}`}>
                                        {aiLoadingId === `${item.id}-sentence` ? <Loader2 className="w-3 h-3 animate-spin" /> : <GenIcon className="w-3 h-3" />} <span className="text-[9px] font-bold">Sent</span>
                                    </button>
                                )}
                            </div>
                            {/* Manual Meaning Download Button (Edge Only) */}
                            {generatorEngine === 'edge' && (
                                <div className="flex-none">
                                    {localMeaningUrl ? (
                                        <button disabled className={`w-[55px] h-[22px] bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded border border-green-200 dark:border-green-800 flex items-center justify-center gap-1 cursor-not-allowed`}><CheckCircle className="w-3 h-3" /> <span className="text-[9px] font-bold">Mean</span></button>
                                    ) : (
                                        <button disabled={isSystemBusy} onClick={(e) => { e.stopPropagation(); generateAIAudio(item, 'meaning'); }} className={`w-[55px] h-[22px] flex items-center justify-center gap-1 rounded border shadow-sm text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800 ${isSystemBusy ? 'opacity-50' : ''}`}>
                                            {aiLoadingId === `${item.id}-meaning` ? <Loader2 className="w-3 h-3 animate-spin" /> : <GenIcon className="w-3 h-3" />} <span className="text-[9px] font-bold">Mean</span>
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}, (prev, next) => {
    return (
        prev.item === next.item &&
        prev.isActive === next.isActive &&
        prev.isSystemBusy === next.isSystemBusy &&
        prev.isInQueue === next.isInQueue &&
        prev.independentPlayingId === next.independentPlayingId &&
        prev.speakingPart === next.speakingPart &&
        prev.isMemoryMode === next.isMemoryMode &&
        prev.memorySettings === next.memorySettings &&
        prev.revealedCells[`${prev.rowId}-word`] === next.revealedCells[`${next.rowId}-word`] &&
        prev.revealedCells[`${prev.rowId}-sent`] === next.revealedCells[`${next.rowId}-sent`] &&
        prev.revealedCells[`${prev.rowId}-meaning`] === next.revealedCells[`${next.rowId}-meaning`] &&
        prev.preferLocalAudio === next.preferLocalAudio &&
        prev.localWordUrl === next.localWordUrl && 
        prev.localSentUrl === next.localSentUrl && 
        prev.localMeaningUrl === next.localMeaningUrl && 
        prev.aiLoadingId === next.aiLoadingId &&
        prev.style.top === next.style.top &&
        prev.activeMenuId === next.activeMenuId &&
        prev.generatorEngine === next.generatorEngine
    );
});


// --- OPTIMIZED ROW COMPONENT (TEXT MODE) - NEW COMPONENT FIX ---
const MemoizedTextRow = memo(({ 
    item, 
    style, 
    isActive, 
    isTextActive, 
    handleManualRowClick, 
    handleDeleteTextItem, 
    localTextUrl, 
    textFilename, 
    isSystemBusy, 
    generateAIAudio, 
    aiLoadingId,
    preferLocalAudio,
    generatorEngine
}) => {
    
    // Dynamic Icon & Style
    const GenIcon = generatorEngine === 'edge' ? Server : Wand2;
    const genColorClass = generatorEngine === 'edge' 
        ? 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-900/40' 
        : 'text-indigo-600 dark:text-indigo-400 bg-slate-50 dark:bg-slate-800 border-indigo-100 dark:border-indigo-900 hover:bg-indigo-50 dark:hover:bg-indigo-900/30';

    return (
        <div 
            style={style} 
            className="absolute left-0 right-0 w-full px-2 py-1"
        >
            <div 
                id={`row-${item.id}`} 
                onClick={(e) => { 
                    e.stopPropagation(); 
                    handleManualRowClick(item, item.virtualIdx); 
                }} 
                className={`h-full rounded-lg px-3 py-2 transition-all hover:shadow-sm flex items-start gap-3 cursor-pointer overflow-hidden ${isActive ? 'bg-blue-600 border border-blue-700 dark:border-blue-500' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700'}`}
            >
                <div className="flex flex-col items-center gap-1 mt-0.5 flex-shrink-0">
                    <span className={`text-xs font-mono w-6 text-center ${isActive ? 'text-blue-200' : 'text-slate-400 dark:text-slate-500'}`}>#{item.displayId}</span>
                    {localTextUrl && preferLocalAudio ? <Hash className="w-3 h-3 text-green-500"/> : <FileText className={`w-3 h-3 ${isActive ? 'text-blue-300' : 'text-slate-300 dark:text-slate-600'}`} />}
                </div>
                <p className={`text-sm flex-1 leading-relaxed whitespace-pre-line overflow-hidden text-ellipsis line-clamp-3 md:line-clamp-2 ${isTextActive ? 'font-bold text-white' : (isActive ? 'text-white' : 'text-slate-700 dark:text-slate-300')}`}>{item.text}</p>
                <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteTextItem(item.virtualIdx); }} className={`p-1.5 rounded-md border transition-colors mr-1 ${isActive ? 'bg-blue-500 text-blue-200 border-blue-400 hover:bg-red-500 hover:text-white' : 'bg-slate-50 dark:bg-slate-700 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-600 hover:bg-red-50 hover:text-red-500 hover:border-red-200'}`}><Trash2 className="w-3.5 h-3.5"/></button>
                    {localTextUrl ? (
                         <button disabled className={`flex items-center gap-1 px-2 py-1 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded text-xs font-bold border border-green-200 dark:border-green-800 cursor-not-allowed`}><CheckCircle className="w-3 h-3" /> OK</button>
                    ) : (
                        <button disabled={isSystemBusy} onClick={() => generateAIAudio(item, 'full')} className={`flex items-center gap-1 px-2 py-1 rounded border text-xs font-bold transition-all ${genColorClass} ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}>
                            {aiLoadingId === `${item.id}-full` ? <Loader2 className="w-3 h-3 animate-spin"/> : <GenIcon className="w-3 h-3"/>} Gen
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}, (prev, next) => {
    return (
        prev.item === next.item &&
        prev.style.top === next.style.top && 
        prev.isActive === next.isActive &&
        prev.isTextActive === next.isTextActive &&
        prev.isSystemBusy === next.isSystemBusy &&
        prev.localTextUrl === next.localTextUrl &&
        prev.aiLoadingId === next.aiLoadingId &&
        prev.preferLocalAudio === next.preferLocalAudio &&
        prev.generatorEngine === next.generatorEngine
    );
});


// --- MAIN COMPONENT ---
const MainApp = ({ goHome, theme, setTheme }) => {
  const [mode, setMode] = useState('table'); 
  const [tableViewMode, setTableViewMode] = useState('master'); 
  const [studyQueue, setStudyQueue] = useState([]); 
  const [rangeInput, setRangeInput] = useState("");

  const [tableContent, setTableContent] = useState("");
  const [textContent, setTextContent] = useState("");
  const [playlist, setPlaylist] = useState([]); 
  const [newTextItem, setNewTextItem] = useState("");
  
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [savedIndices, setSavedIndices] = useState({ table: -1, text: -1 });
  
  // -- NEW: SCROLL POSITION PERSISTENCE --
  const viewScrollPosRef = useRef({ master: 0, study: 0, text: 0 });
  // -- NEW: Pending Scroll Restoration Ref --
  const pendingScrollRestoration = useRef(null);

  const [masterIndex, setMasterIndex] = useState(-1);
  const [studyIndex, setStudyIndex] = useState(-1);
  
  const [playingIndex, setPlayingIndex] = useState(-1);
  const [playingContext, setPlayingContext] = useState(null);

  const tableViewModeRef = useRef(tableViewMode);
  const justSwitchedTab = useRef(false);
  const prevCurrentIndex = useRef(currentIndex);

  const [savedDecks, setSavedDecks] = useState({});
  const [selectedDeckId, setSelectedDeckId] = useState(""); 
  const [currentDeckName, setCurrentDeckName] = useState("Untitled Sheet");

  const [voices, setVoices] = useState([]); 
  const [indonesianVoices, setIndonesianVoices] = useState([]); 
  const [selectedVoice, setSelectedVoice] = useState(null); 
  const [selectedIndonesianVoice, setSelectedIndonesianVoice] = useState(null); 
  
  const selectedVoiceRef = useRef(null);
  const selectedIndonesianVoiceRef = useRef(null);

  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1); 
  
  const [playWord, setPlayWord] = useState(true);
  const [playSentence, setPlaySentence] = useState(true);
  const [playMeaning, setPlayMeaning] = useState(false); 
  
  const [preferLocalAudio, setPreferLocalAudio] = useState(true);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [speakingPart, setSpeakingPart] = useState(null); 
  const [playbackMode, setPlaybackMode] = useState('once'); 
  const [independentPlayingId, setIndependentPlayingId] = useState(null); 

  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [lockedStates, setLockedStates] = useState({ table: false, text: true });
  
  // FIX: Initialize sidebar state based on window width to prevent glitch/flash on mobile load
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 768 : true); 
  const [showLogs, setShowLogs] = useState(false); 
  
  const [mobileTab, setMobileTab] = useState('player'); 
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  // NEW: Batch Config includes doMeaning
  const [batchConfig, setBatchConfig] = useState({ start: 1, end: 10, doWord: true, doSentence: true, doMeaning: false });
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);
  const [batchStatusText, setBatchStatusText] = useState(""); 
  const [isBatchStopping, setIsBatchStopping] = useState(false); 

  const [isMemoryMode, setIsMemoryMode] = useState(false);
  const [revealedCells, setRevealedCells] = useState({}); 
  const [memorySettings, setMemorySettings] = useState({ word: true, sentence: true, meaning: true }); 
  
  const [activeMenuId, setActiveMenuId] = useState(null);

  const isLocked = lockedStates[mode];

  const [userApiKey, setUserApiKey] = useState("");
  const [aiVoiceName, setAiVoiceName] = useState("Kore");
  const [aiLoadingId, setAiLoadingId] = useState(null);
  const [systemLogs, setSystemLogs] = useState([]); 

  // --- NEW: GENERATOR ENGINE STATES ---
  const [generatorEngine, setGeneratorEngine] = useState('gemini'); // 'gemini' | 'edge'
  
  // EDGE VOICE STATES (Expanded)
  const [edgeVoices, setEdgeVoices] = useState(initialEdgeVoices); 
  const [edgeVoice, setEdgeVoice] = useState("en-GB-SoniaNeural"); // Default to UK
  const [edgeIndonesianVoice, setEdgeIndonesianVoice] = useState("id-ID-GadisNeural"); // New: Indo Voice for Edge

  const [edgeRate, setEdgeRate] = useState(0); // -50 to +50 (Percent)
  const [edgePitch, setEdgePitch] = useState(0); // -20 to +20 (Hz)

  const [localAudioMapTable, setLocalAudioMapTable] = useState({}); 
  const [localAudioMapText, setLocalAudioMapText] = useState({});
  const [audioStatusTable, setAudioStatusTable] = useState('idle');
  const [audioStatusText, setAudioStatusText] = useState('idle');

  const listContainerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600); 

  const [rowHeights, setRowHeights] = useState({ 
      table: DEFAULT_ROW_HEIGHT_PC, 
      text: 70 
  });

  const [isMobile, setIsMobile] = useState(false);
  const [showAppBar, setShowAppBar] = useState(true);
  const lastScrollY = useRef(0);
  
  // FIX: Ref to track when we are performing a programmatic auto-scroll
  const isAutoScrolling = useRef(false);

  const isSystemBusy = isBatchDownloading || aiLoadingId !== null;

  // FIX: Silent Audio Ref (Anchor) - NEW GENERATION STRATEGY
  const silentAudioRef = useRef(null);
  const silentWavUrlRef = useRef(null);

  // FIX 1: Lock Body Scroll when Sidebar is Open (Prevent background scrolling)
  useEffect(() => {
      if (isMobile && isSidebarOpen) {
          document.body.style.overflow = 'hidden';
      } else {
          document.body.style.overflow = '';
      }
      return () => { document.body.style.overflow = ''; };
  }, [isMobile, isSidebarOpen]);

  // --- FORCE HEADER SHOW WHEN SIDEBAR OPEN (MOBILE) ---
  useEffect(() => {
      if (isMobile) {
          if (isSidebarOpen) {
              setShowAppBar(true);
          } else if (isPlaying) {
              // FIX: When closing sidebar while playing, hide header to restore focus
              // ONLY if we are in player tab
              if(mobileTab === 'player') setShowAppBar(false);
          }
      }
  }, [isSidebarOpen, isMobile, isPlaying, mobileTab]);

  const stopSignalRef = useRef(false);
  const batchStopSignalRef = useRef(false); 
  const currentAudioObjRef = useRef(null); 
  const playbackModeRef = useRef(playbackMode); 
  
  // FIX: REFERENCE FOR CURRENT UTTERANCE TO PREVENT GARBAGE COLLECTION
  const currentUtteranceRef = useRef(null);

  const synth = window.speechSynthesis;
  const folderInputRef = useRef(null);
  const csvInputRef = useRef(null);
  const logContainerRef = useRef(null);
  const debugButtonRef = useRef(null);
  const debugPanelRef = useRef(null);
  const batchPanelRef = useRef(null);
  const batchButtonRef = useRef(null);
  const textareaRef = useRef(null); 
  const newItemTextareaRef = useRef(null); 

  const studyQueueSet = useMemo(() => new Set(studyQueue), [studyQueue]);

  const currentPlayerList = useMemo(() => {
      if (mode === 'text') return playlist;
      if (mode === 'table') {
         if (tableViewMode === 'study') {
             return playlist.filter(item => studyQueueSet.has(item.id));
         }
         return playlist; 
      }
      return playlist; 
  }, [playlist, mode, tableViewMode, studyQueueSet]);

  const activePlaybackList = useMemo(() => {
      if (!playingContext) return [];
      if (playingContext === 'text') return playlist;
      if (playingContext === 'study') return playlist.filter(item => studyQueueSet.has(item.id));
      return playlist; // master
  }, [playingContext, playlist, studyQueueSet]);

  const aiVoices = [
    { id: "Kore", label: "Kore (F)", gender: "Female" },
    { id: "Zephyr", label: "Zephyr (F)", gender: "Female" },
    { id: "Puck", label: "Puck (M)", gender: "Male" },
    { id: "Fenrir", label: "Fenrir (M)", gender: "Male" },
    { id: "Charon", label: "Charon (M)", gender: "Male" }
  ];

  // --- NEW: SYNC BODY BACKGROUND WITH THEME (Fixes Mobile Bounce "White Layer" issue) ---
  useEffect(() => {
      const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      // Colors match bg-slate-50 and bg-slate-900
      document.body.style.backgroundColor = isDark ? '#0f172a' : '#f8fafc';
  }, [theme]);

  // --- INITIALIZE SILENT AUDIO (ROBUST WAV) ---
  useEffect(() => {
      // Create 30 seconds of silence WAV
      const silentWavBlob = new Blob([encodeWAV(new Int16Array(48000 * 30))], { type: 'audio/wav' });
      const url = URL.createObjectURL(silentWavBlob);
      silentWavUrlRef.current = url;

      const audio = new Audio(url);
      audio.loop = true;
      audio.volume = 0.01; // Tiny volume to ensure system treats as active audio
      silentAudioRef.current = audio;
      
      return () => {
          if (silentAudioRef.current) {
              silentAudioRef.current.pause();
              silentAudioRef.current = null;
          }
          if (silentWavUrlRef.current) {
              URL.revokeObjectURL(silentWavUrlRef.current);
          }
      };
  }, []);

  // --- SCROLL AUTO-HIDE LOGIC (UPDATED WITH FLAG & TAB CHECK) ---
  useEffect(() => {
      const handleScroll = () => {
          if (!isMobile) return; 
          
          const currentScrollY = window.scrollY;

          // FIX: If we are in the middle of an auto-scroll, IGNORE scroll events to prevent glitch
          // This is SPECIFIC to the HEADER VISIBILITY LOGIC
          if (isAutoScrolling.current) {
              lastScrollY.current = currentScrollY; // FIX: Keep updating so we don't have a jump
              return;
          }

          // FIX 2: If we are NOT in player tab (e.g. tools/logs), ALWAYS show header
          if (mobileTab !== 'player') {
              setShowAppBar(true);
              lastScrollY.current = currentScrollY; // Keep updating for smooth return
              return;
          }
          
          const diff = currentScrollY - lastScrollY.current;

          // Logic Lebih Strict:
          // Hide jika scroll ke bawah dan bukan di paling atas
          if (diff > 10 && currentScrollY > 50) {
              setShowAppBar(false);
          } 
          // Show HANYA jika scroll ke atas signifikan ATAU di paling atas
          else if (diff < -10 || currentScrollY < 50) {
              setShowAppBar(true);
          }
          // Jika diff kecil (diam/jitter), jangan ubah status header
          
          lastScrollY.current = currentScrollY;
      };
      
      window.addEventListener('scroll', handleScroll);
      return () => window.removeEventListener('scroll', handleScroll);
  }, [isMobile, mobileTab]);

  // --- NEW: USELAYOUTEFFECT FOR INSTANT SCROLL RESTORATION ---
  useLayoutEffect(() => {
      // If we have a pending scroll restoration from handleTabSwitch
      if (pendingScrollRestoration.current !== null) {
          const target = pendingScrollRestoration.current;
          
          // 1. Force isAutoScrolling to true (blocks header hiding)
          isAutoScrolling.current = true;
          
          // 2. Perform the DOM Scroll
          const restoreScroll = () => {
               if (isMobile) {
                  window.scrollTo({ top: target, behavior: 'auto' });
               } else if (listContainerRef.current) {
                  listContainerRef.current.scrollTop = target;
               }
          };

          restoreScroll();

          // FIX: Force a double check for "white screen" issues on mode switch
          // Sometimes Virtual List needs a second tick to realize heights changed
          requestAnimationFrame(() => {
              restoreScroll();
          });
          
          // 3. Clear the pending ref
          pendingScrollRestoration.current = null;
          
          // 4. Reset lock after a short delay (once scroll event storm settles)
          setTimeout(() => {
              isAutoScrolling.current = false;
          }, 150);
      }
  }, [tableViewMode, mode, mobileTab, isMobile]); // Trigger immediately after mode changes trigger a re-render

  useEffect(() => {
      const handleResize = () => {
          const width = window.innerWidth;
          const mobile = width < 768;
          setIsMobile(mobile);
          setIsSidebarOpen(!mobile);

          if (!mobile && listContainerRef.current) {
              setContainerHeight(listContainerRef.current.clientHeight);
          }
          
          if (mobile) {
              setRowHeights({ table: DEFAULT_ROW_HEIGHT_MOBILE, text: 100 });
              setContainerHeight(window.innerHeight); 
          } else {
              setRowHeights({ table: DEFAULT_ROW_HEIGHT_PC, text: 70 });
          }
      };
      
      handleResize();
      window.addEventListener('resize', handleResize);
      setTimeout(() => {
          if (!isMobile && listContainerRef.current) {
              setContainerHeight(listContainerRef.current.clientHeight);
          }
      }, 500);

      const handleGlobalClick = () => setActiveMenuId(null);
      window.addEventListener('click', handleGlobalClick);

      return () => {
          window.removeEventListener('resize', handleResize);
          window.removeEventListener('click', handleGlobalClick);
      };
  }, [isMobile, mobileTab]);
  
  useEffect(() => {
    tableViewModeRef.current = tableViewMode;
  }, [tableViewMode]);

  useEffect(() => {
    playbackModeRef.current = playbackMode;
  }, [playbackMode]);
  
  useEffect(() => {
      selectedVoiceRef.current = selectedVoice;
  }, [selectedVoice]);
  
  useEffect(() => {
      selectedIndonesianVoiceRef.current = selectedIndonesianVoice;
  }, [selectedIndonesianVoice]);

  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) setUserApiKey(savedKey);

    const saved = localStorage.getItem('pronunciation_decks');
    if (saved) {
        setSavedDecks(JSON.parse(saved));
    }

    const demoData = `No\tWord\tSentence\tMeaning\n1\tabandon\tThe captain gave the order to abandon ship.\tKapten memberi perintah untuk meninggalkan kapal\n2\tability\tHe has the ability to learn fast.\tDia memiliki kemampuan untuk belajar dengan cepat`;
    setTableContent(demoData);
    setTextContent("Hello world.\nThis is line number two.\nEach line is treated as an item.");
    
    if (demoData.trim().length > 0) {
      setLockedStates(prev => ({ ...prev, table: true }));
    }

    addLog("System", "Ready. ProLingo v5.6 (Fixed).");

    return () => forceStopAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- VOICE PERSISTENCE (Browser TTS) ---
  useEffect(() => {
    const loadVoices = () => {
      const allVoices = synth.getVoices();
      
      if (allVoices.length === 0) return;

      // Filter and Sort English Voices: UK > US > AU > SG > Others
      let engVoices = allVoices.filter(v => v.lang.startsWith('en'));
      engVoices.sort((a, b) => {
          const getPriority = (lang) => {
              if (lang.includes('GB') || lang.includes('UK')) return 1;
              if (lang.includes('US')) return 2;
              if (lang.includes('AU')) return 3;
              if (lang.includes('SG')) return 4;
              return 5;
          };
          return getPriority(a.lang) - getPriority(b.lang);
      });
      setVoices(engVoices);
      
      // Default English Voice Logic
      const defaultEng = engVoices[0]; // First item (UK preferred)
      if (!selectedVoiceRef.current && defaultEng) setSelectedVoice(defaultEng);

      // Filter and Sort Indonesian Voices
      let idVoices = allVoices.filter(v => v.lang.includes('ID') || v.lang.includes('id') || v.lang.toLowerCase().includes('indones'));
      setIndonesianVoices(idVoices);
      const defaultId = idVoices.find(v => v.name.includes('Google') || v.name.includes('Indonesia')) || idVoices[0];
      
      if (!selectedIndonesianVoiceRef.current && defaultId) setSelectedIndonesianVoice(defaultId);
    };
    
    loadVoices();
    if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = loadVoices;

    const pollInterval = setInterval(() => {
        const voices = synth.getVoices();
        if (voices.length > 0) {
            loadVoices();
            if (voices.length > 5) clearInterval(pollInterval); 
        }
    }, 500);

    const timeoutId = setTimeout(() => clearInterval(pollInterval), 5000);

    return () => {
        clearInterval(pollInterval);
        clearTimeout(timeoutId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
      if (currentIndex >= 0) {
          const scrollAction = () => {
              const activeItem = currentPlayerList.find(p => p.id === currentIndex);
              const isBackgroundPlayback = (isPlaying || independentPlayingId) && (playingContext && playingContext !== (mode === 'table' ? tableViewMode : 'text'));
              const indexChanged = prevCurrentIndex.current !== currentIndex;
              
              const shouldScroll = justSwitchedTab.current || (indexChanged && !isBackgroundPlayback && isPlaying);

              if (activeItem && shouldScroll) {
                  const idx = currentPlayerList.indexOf(activeItem);
                  const rowH = rowHeights[mode];
                  
                  if (isMobile) {
                      isAutoScrolling.current = true;
                      
                      if (!isSidebarOpen && mobileTab === 'player') {
                          setShowAppBar(false); 
                      } else {
                          setShowAppBar(true); 
                      }
                      
                      const targetIdx = Math.max(0, idx - 1);
                      const containerPadding = mode === 'table' ? 160 : 120;
                      const targetScrollY = containerPadding + (targetIdx * rowH);
                      
                      window.scrollTo({
                          top: targetScrollY,
                          behavior: 'smooth'
                      });

                      let lastPos = window.scrollY;
                      let samePosCount = 0;

                      const checkScrollComplete = () => {
                          const currentPos = window.scrollY;
                          if (Math.abs(currentPos - lastPos) < 1) {
                              samePosCount++;
                              if (samePosCount > 3) {
                                  setTimeout(() => {
                                      isAutoScrolling.current = false; 
                                  }, 500);
                                  return; 
                              }
                          } else {
                              samePosCount = 0;
                              lastPos = currentPos;
                          }
                          requestAnimationFrame(checkScrollComplete);
                      };
                      setTimeout(() => requestAnimationFrame(checkScrollComplete), 50);

                  } else {
                      const targetTop = idx * rowH;
                      if (listContainerRef.current) {
                          listContainerRef.current.scrollTo({
                              top: targetTop,
                              behavior: 'smooth'
                          });
                      }
                  }
                  
                  justSwitchedTab.current = false;
                  prevCurrentIndex.current = currentIndex; 
              } else if (!indexChanged) {
                  prevCurrentIndex.current = currentIndex;
              }
          };

          const timer = setTimeout(scrollAction, 100);
          return () => clearTimeout(timer);
      }
  }, [currentIndex, mode, currentPlayerList, isPlaying, playingContext, tableViewMode, independentPlayingId, rowHeights, isMobile, showAppBar, isSidebarOpen, mobileTab]); 

  // --- MODIFIED SCROLL LISTENER FOR MOBILE (BLOCKER ADDED) ---
  useEffect(() => {
      const handleWindowScroll = () => {
          if (isMobile) {
              setScrollTop(window.scrollY);
              setContainerHeight(window.innerHeight); 
          }
      };

      if (isMobile) {
          window.addEventListener('scroll', handleWindowScroll);
          handleWindowScroll(); 
      } else {
          window.removeEventListener('scroll', handleWindowScroll);
      }

      return () => window.removeEventListener('scroll', handleWindowScroll);
  }, [isMobile]);

  useEffect(() => {
    if (logContainerRef.current) {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [systemLogs, showLogs, mobileTab]);

  const addLog = (type, message) => {
      const timestamp = new Date().toLocaleTimeString();
      setSystemLogs(prev => {
          const next = [...prev, { time: timestamp, type, message }];
          // LIMIT UPDATED: 50 -> 20
          if (next.length > 20) return next.slice(next.length - 20); 
          return next;
      });
  };

  useEffect(() => {
    try {
        if (mode === 'text') {
            const safeText = typeof textContent === 'string' ? textContent : String(textContent || "");
            const lines = safeText.split('\n').filter(l => l.trim());
            const newPlaylist = lines.map((text, id) => ({ 
                id, 
                displayId: id + 1,
                text: text.trim(), 
                isStructured: false 
            }));
            setPlaylist(newPlaylist);
            setBatchConfig(prev => ({ ...prev, end: newPlaylist.length }));
            return;
        }

        const safeTable = typeof tableContent === 'string' ? tableContent : String(tableContent || "");
        const lines = safeTable.split(/\r?\n/).filter(line => line.trim() !== '');
        
        let parsed = lines.map((line, index) => {
          let parts = line.split('\t');
          if (parts.length < 2) parts = line.split(';'); 
          if (parts.length < 2) parts = line.split(',');

          const cols = parts.map(p => p.trim().replace(/^"|"$/g, ''));
          
          const lower0 = cols[0]?.toLowerCase();
          if (index === 0 && (lower0 === 'no' || lower0 === 'number' || lower0 === 'id' || lower0 === 'word')) {
            return null;
          }

          let word = "", sentence = "", meaning = "", partOfSpeech = "", meaningWord = "";
          
          if (cols.length >= 6) {
              word = cols[1] || "";
              partOfSpeech = cols[2] || "";
              meaningWord = cols[3] || "";
              sentence = cols[4] || "";
              meaning = cols[5] || "";
          } else {
              if (/^\d+$/.test(cols[0])) {
                 word = cols[1] || "";
                 sentence = cols[2] || "";
                 meaning = cols[3] || "";
              } else {
                 word = cols[0] || "";
                 sentence = cols[1] || "";
                 meaning = cols[2] || "";
              }
          }

          if (!word || !word.trim()) return null;

          return {
            word,
            partOfSpeech, 
            meaningWord,  
            sentence,
            meaning,      
            fullText: `${word}. ${sentence}`
          };
        }).filter(x => x !== null);

        parsed = parsed.map((item, idx) => ({
            ...item,
            id: idx, 
            displayId: idx + 1, 
            isStructured: true
        }));

        setPlaylist(parsed);
        setBatchConfig(prev => ({ ...prev, end: parsed.length }));
    } catch (error) {
        console.error("Error parsing content:", error);
        addLog("Error", "Gagal memproses data. Cek format.");
    }
  }, [tableContent, textContent, mode]); 

  const resetFullState = () => {
    setLocalAudioMapTable({});
    setLocalAudioMapText({});
    setAudioStatusTable('idle');
    setAudioStatusText('idle');
    setCurrentIndex(-1); 
    setMasterIndex(-1);
    setStudyIndex(-1);
    setPlayingIndex(-1);
    setPlayingContext(null);
    setStudyQueue([]); 
    setTableViewMode('master');
    forceStopAll(); 
    addLog("System", "State fully reset.");
  };

  const handleBatchRangeBlur = (field) => {
      let val = parseInt(batchConfig[field]);
      const max = playlist.length || 1;
      
      if (isNaN(val)) val = 1;

      if (field === 'start') {
          if (val < 1) val = 1;
          if (val > max) val = max;
          if (val > parseInt(batchConfig.end)) val = parseInt(batchConfig.end);
      } else if (field === 'end') {
          if (val < 1) val = 1;
          if (val > max) val = max;
          if (val < parseInt(batchConfig.start)) val = parseInt(batchConfig.start);
      }

      setBatchConfig(prev => ({ ...prev, [field]: val }));
  };

  const handleInsertTab = () => {
    if (mode === 'table') {
        setTableContent(prev => prev + "\t");
    } else {
        setTextContent(prev => prev + "\t");
    }
    if(textareaRef.current) {
        textareaRef.current.focus();
    }
  };
  
  const handleAddTextItem = () => {
      if (!newTextItem.trim()) return;
      const newContent = textContent ? textContent + "\n" + newTextItem : newTextItem;
      setTextContent(newContent);
      setNewTextItem("");
      if (newItemTextareaRef.current) {
          newItemTextareaRef.current.style.height = 'auto'; 
      }
      addLog("Action", "Text added.");
  };

  const handleDeleteTextItem = (indexToDelete) => {
      const newLines = playlist
          .filter((_, idx) => idx !== indexToDelete)
          .map(item => item.text);
      
      setTextContent(newLines.join('\n'));
      addLog("Action", `Item #${indexToDelete + 1} deleted.`);
      if (currentIndex === indexToDelete) forceStopAll();
  };

  const toggleStudyItem = (id) => {
      setStudyQueue(prev => {
          if (prev.includes(id)) {
              return prev.filter(x => x !== id);
          } else {
              return [...prev, id];
          }
      });
  };

  const handleRangeAdd = () => {
      if (!rangeInput) return;
      const parts = rangeInput.split(/[,+\s]+/);
      const newIds = new Set();

      parts.forEach(part => {
          if (part.includes('-')) {
              const [start, end] = part.split('-').map(Number);
              if (!isNaN(start) && !isNaN(end)) {
                  const min = Math.min(start, end);
                  const max = Math.max(start, end);
                  for (let i = min; i <= max; i++) {
                      const item = playlist.find(p => p.displayId === i);
                      if (item) newIds.add(item.id);
                  }
              }
          } else {
              const num = parseInt(part);
              if (!isNaN(num)) {
                  const item = playlist.find(p => p.displayId === num);
                  if (item) newIds.add(item.id);
              }
          }
      });

      setStudyQueue(prev => {
          const combined = new Set([...prev, ...newIds]);
          return Array.from(combined);
      });
      setRangeInput("");
      addLog("Study", `Added ${newIds.size} items to Queue.`);
  };

  const clearStudyQueue = () => {
      setStudyQueue([]);
      addLog("Study", "Queue cleared.");
  };

  const toggleCellReveal = (e, cellKey) => {
      if (!isMemoryMode) return;
      e.stopPropagation(); 

      if (revealedCells[cellKey]) {
          clearTimeout(revealedCells[cellKey]);
          setRevealedCells(prev => {
              const next = { ...prev };
              delete next[cellKey];
              return next;
          });
      } else {
          const timerId = setTimeout(() => {
              setRevealedCells(prev => {
                  const next = { ...prev };
                  delete next[cellKey];
                  return next;
              });
          }, 4000); 

          setRevealedCells(prev => ({ ...prev, [cellKey]: timerId }));
      }
  };

  const handleMenuToggle = (rowId) => {
      setActiveMenuId(prev => prev === rowId ? null : rowId);
  };

  // --- AUDIO ENGINE ---
  const getLocalAudioUrl = (item, part) => {
    if (mode === 'table') {
      const key = `${item.displayId}_${part}`; 
      return localAudioMapTable[key];
    } else {
      const key = `${item.displayId}`;
      return localAudioMapText[key];
    }
  };

  const playSource = (text, item, part) => {
    return new Promise((resolve) => {
      if (stopSignalRef.current) { resolve(); return; }

      if (part === 'meaning') {
         // Special handling: if Edge mode, we might want to try playing local audio for meaning too
         if (generatorEngine === 'edge' && preferLocalAudio) {
              const audioUrl = getLocalAudioUrl(item, 'meaning');
              if (audioUrl) {
                  const audio = new Audio(audioUrl);
                  currentAudioObjRef.current = audio;
                  audio.rate = rate;
                  
                  // FIX: DO NOT SET STATE, let Silent Loop handle it
                  // if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
                  
                  audio.onended = () => {
                      currentAudioObjRef.current = null;
                      resolve();
                  };
                  audio.onerror = () => {
                      // Fallback to TTS if file fails
                      playTTS(text, selectedIndonesianVoiceRef.current).then(resolve);
                  };
                  audio.play().catch(() => resolve());
                  return;
              }
         }
         
         playTTS(text, selectedIndonesianVoiceRef.current).then(resolve);
         return;
      }

      let audioUrl = null;
      if (preferLocalAudio) {
        audioUrl = getLocalAudioUrl(item, part);
      }

      if (audioUrl) {
        const audio = new Audio(audioUrl);
        currentAudioObjRef.current = audio;
        audio.rate = rate; 
        
        // FIX: DO NOT SET STATE, let Silent Loop handle it
        // if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";

        audio.onended = () => { 
            currentAudioObjRef.current = null; 
            resolve(); 
        };
        audio.onerror = () => {
          addLog("Warn", `Audio fail #${item.displayId}. Fallback TTS.`);
          playTTS(text).then(resolve);
        };
        
        audio.play().catch(() => resolve()); 
        return;
      }
      playTTS(text).then(resolve);
    });
  };

  const playTTS = (text, overrideVoice = null) => {
    return new Promise((resolve) => {
      const targetVoice = overrideVoice || selectedVoiceRef.current;
      
      if (stopSignalRef.current || !targetVoice) { resolve(); return; }
      
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      
      // FIX: Assign to REF to prevent Garbage Collection during playback
      currentUtteranceRef.current = utterance;
      
      utterance.voice = targetVoice;
      utterance.rate = rate;
      utterance.pitch = pitch;

      // FIX: DO NOT SET STATE, let Silent Loop handle it
      // utterance.onstart = () => {
      //    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
      // };

      utterance.onend = () => {
          // FIX: Removed "none" state setting here to keep widget alive
          currentUtteranceRef.current = null; // Clear ref on end
          resolve();
      };
      utterance.onerror = () => {
          currentUtteranceRef.current = null;
          resolve(); 
      };
      setTimeout(() => synth.speak(utterance), 10);
    });
  };

  const safePlayTransition = async (actionCallback) => {
    forceStopAll();
    await new Promise(r => setTimeout(r, 200));
    stopSignalRef.current = false;
    await actionCallback();
  };

  const handleIndependentPlay = (item, part, uiId) => {
    setActiveMenuId(null);
    if (independentPlayingId === uiId) {
        forceStopAll();
        return;
    }

    safePlayTransition(async () => {
      setIndependentPlayingId(uiId);
      setPlayingContext(mode === 'table' ? tableViewMode : 'text');
      setPlayingIndex(item.id);
      setCurrentIndex(item.id);
      
      let textToPlay = item.text;
      if (part === 'word') textToPlay = item.word;
      else if (part === 'sentence') textToPlay = item.sentence;
      else if (part === 'meaning') textToPlay = item.meaning;

      setSpeakingPart(part); 
      await playSource(textToPlay, item, part);
      setIndependentPlayingId(null);
      setSpeakingPart(null); 
    });
  };

  // --- HELPER FOR SCROLL PERSISTENCE ---
  const getScrollPos = () => isMobile ? window.scrollY : (listContainerRef.current?.scrollTop || 0);
  
  const _setScrollPos = (val) => {
      if (isMobile) window.scrollTo({ top: val, behavior: 'auto' });
      else if (listContainerRef.current) listContainerRef.current.scrollTop = val;
  };

  const handleTabSwitch = (targetTab) => {
      if (targetTab === tableViewMode) return;
      
      // 1. Save current position
      const currentPos = getScrollPos();
      viewScrollPosRef.current[tableViewMode] = currentPos;

      const isSwitchingToPlayingContext = isPlaying && playingContext === targetTab;

      // FIX: Smart Header Visibility on Tab Switch
      if (isMobile) {
          if (isSwitchingToPlayingContext) {
              setShowAppBar(false); 
          } else {
              setShowAppBar(true);
          }
      }

      if (tableViewMode === 'master') setMasterIndex(currentIndex);
      else setStudyIndex(currentIndex);

      // --- LOGIC BARU: INSTANT JUMP JIKA PLAYING (Meniru handleMobileTabSwitch) ---
      let nextPos = 0;
      
      if (isSwitchingToPlayingContext && playingIndex !== -1) {
          // Jika playing & switch ke context yang sama, HITUNG POSISI target
          const _activeItem = playlist.find(p => p.id === playingIndex); // Note: playlist used directly might need filtering context logic if complex
          
          // Filter playlist based on target tab to get correct index
          const targetList = targetTab === 'study' ? playlist.filter(item => studyQueueSet.has(item.id)) : playlist;
          const targetItem = targetList.find(p => p.id === playingIndex);

          if (targetItem) {
              const idx = targetList.indexOf(targetItem);
              const rowH = rowHeights[mode];
              
              // Hitung posisi (Mobile vs Desktop logic)
              if (isMobile) {
                  const containerPadding = mode === 'table' ? 160 : 120;
                  const targetIdx = Math.max(0, idx - 1);
                  nextPos = containerPadding + (targetIdx * rowH);
                  setShowAppBar(false); // Force hide header
              } else {
                  nextPos = idx * rowH;
              }
              
              // Non-aktifkan auto scroll useEffect karena kita sudah manual set
              justSwitchedTab.current = false; 
          } else {
              // Fallback ke posisi tersimpan
              nextPos = viewScrollPosRef.current[targetTab] || 0;
          }
      } else {
          // Jika tidak playing, restore posisi biasa
          nextPos = viewScrollPosRef.current[targetTab] || 0;
          justSwitchedTab.current = false;
      }

      // 3. SET PENDING SCROLL RESTORATION & BLOCK HEADER HIDING
      pendingScrollRestoration.current = nextPos;
      isAutoScrolling.current = true; 

      // 4. UPDATE STATE
      setScrollTop(nextPos); 
      setTableViewMode(targetTab);
      
      if (playingContext === targetTab && playingIndex !== -1) {
          setCurrentIndex(playingIndex);
      } else {
          const restoredIndex = targetTab === 'master' ? masterIndex : studyIndex;
          setCurrentIndex(restoredIndex);
      }
      
      addLog("System", `View Switched to ${targetTab}.`);
  };

  const handleMobileTabSwitch = (targetMobileTab) => {
      if (targetMobileTab === mobileTab) return;

      // If leaving Player tab, save scroll
      if (mobileTab === 'player') {
          if (mode === 'table') viewScrollPosRef.current[tableViewMode] = window.scrollY;
          else viewScrollPosRef.current['text'] = window.scrollY;
      }

      // If entering Player tab, restore scroll
      if (targetMobileTab === 'player') {
          let targetPos = 0;
          
          if (isPlaying && currentIndex !== -1) {
              // LOGIC BARU: Jika playing, hitung posisi item aktif agar INSTANT (tanpa animasi smooth)
              // Copy logic kalkulasi dari renderPlaylist
              const activeItem = currentPlayerList.find(p => p.id === currentIndex);
              if (activeItem) {
                  const idx = currentPlayerList.indexOf(activeItem);
                  const rowH = rowHeights[mode];
                  const containerPadding = mode === 'table' ? 160 : 120;
                  const targetIdx = Math.max(0, idx - 1);
                  targetPos = containerPadding + (targetIdx * rowH);
                  
                  // Hide header explicitly saat kembali ke player yang sedang jalan
                  setShowAppBar(false); 
              } else {
                  // Fallback ke posisi manual jika item tidak ketemu
                  if (mode === 'table') targetPos = viewScrollPosRef.current[tableViewMode];
                  else targetPos = viewScrollPosRef.current['text'];
              }
          } else {
              // Restore Manual Position jika tidak playing
              if (mode === 'table') targetPos = viewScrollPosRef.current[tableViewMode];
              else targetPos = viewScrollPosRef.current['text'];
          }

          // Apply Instant Scroll via pending ref (picked up by useLayoutEffect)
          // Ini mencegah glitch karena dilakukan sebelum paint
          setScrollTop(targetPos);
          pendingScrollRestoration.current = targetPos;
          isAutoScrolling.current = true;
      }

      setMobileTab(targetMobileTab);
  };

  const handleGlobalPlay = () => {
    setActiveMenuId(null);

    if (isPlaying) {
      forceStopAll(); // Stop playing, DO NOT set scroll flag
    } else {
      justSwitchedTab.current = true; // START playing, set scroll flag
      if (playingIndex !== -1 && playingContext) {
          const listToUse = playingContext === 'study' 
             ? playlist.filter(i => studyQueueSet.has(i.id))
             : playlist;
          
          const item = listToUse.find(p => p.id === playingIndex);
          if (item) {
              const resumeIdx = listToUse.indexOf(item);
              startGlobalPlayback(resumeIdx);
              return;
          }
      }
      const activeItem = currentPlayerList.find(p => p.id === currentIndex);
      let startIdx = 0;
      if (activeItem) {
          startIdx = currentPlayerList.indexOf(activeItem);
      }
      startGlobalPlayback(startIdx);
    }
  };

  const handleManualRowClick = (item, idx) => {
      setActiveMenuId(null);
      forceStopAll();
      setIndependentPlayingId(null);
      
      const targetContext = mode === 'table' ? tableViewMode : 'text';
      setCurrentIndex(item.id);
      setPlayingIndex(item.id);
      setPlayingContext(targetContext);

      setTimeout(() => {
          stopSignalRef.current = false;
          startGlobalPlayback(idx, targetContext);
      }, 50);
  };

  const startGlobalPlayback = (startIndex, forcedContext = null) => {
    let sessionMode = forcedContext || playingContext;
    if (!sessionMode || (playingIndex === -1 && !isPlaying)) {
        sessionMode = mode === 'table' ? tableViewMode : 'text';
        setPlayingContext(sessionMode);
    } else if (forcedContext) {
        setPlayingContext(forcedContext);
    }

    const listToPlay = mode === 'table' 
        ? (sessionMode === 'study' ? playlist.filter(i => studyQueueSet.has(i.id)) : playlist) 
        : playlist;

    if (startIndex >= listToPlay.length) startIndex = 0;

    safePlayTransition(async () => {
      setIsPlaying(true);
      let index = startIndex;
      addLog("Info", `Global Play (${sessionMode}) start...`);
      
      // --- FIX: START SILENT ANCHOR (AGGRESSIVE) ---
      if (silentAudioRef.current) {
          silentAudioRef.current.play().catch(e => console.warn("Silent Play Failed", e));
      }
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
      // ---------------------------------

      while (index >= 0 && index < listToPlay.length && !stopSignalRef.current) {
        // --- HEARTBEAT CHECK ---
        if (silentAudioRef.current && silentAudioRef.current.paused) {
             silentAudioRef.current.play().catch(() => {});
        }
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
        // -----------------------

        const item = listToPlay[index];
        setPlayingIndex(item.id); 

        if (sessionMode === 'master') setMasterIndex(item.id);
        else if (sessionMode === 'study') setStudyIndex(item.id);
        else setSavedIndices(prev => ({...prev, text: item.id}));

        if ((mode === 'table' && tableViewModeRef.current === sessionMode) || (mode === 'text' && sessionMode === 'text')) {
             setCurrentIndex(item.id);
        }

        const currentMode = playbackModeRef.current;
        const loops = (currentMode === 'repeat_2x') ? 2 : 1;
        
        for (let l = 0; l < loops; l++) {
          if (stopSignalRef.current) break;
          if (playbackModeRef.current !== currentMode && currentMode === 'repeat_2x' && l > 0) break;

          if (item.isStructured) {
            if (playWord) {
              setSpeakingPart('word');
              await playSource(item.word, item, 'word');
              if (stopSignalRef.current) break;
              await new Promise(r => setTimeout(r, 400)); 
            }
            if (playSentence) {
              setSpeakingPart('sentence');
              await playSource(item.sentence, item, 'sentence');
              if (stopSignalRef.current) break;
            }
            if (playMeaning && item.meaning) {
               setSpeakingPart('meaning');
               await new Promise(r => setTimeout(r, 400)); 
               
               let meaningText = item.meaning;
               if (playSentence) {
                   meaningText = "Artinya: " + item.meaning;
               }
               await playSource(meaningText, item, 'meaning'); 
               if (stopSignalRef.current) break;
            }
          } else {
            setSpeakingPart('full');
            await playSource(item.text, item, 'full');
          }
          if (l < loops - 1) await new Promise(r => setTimeout(r, 500));
        }
        
        if (stopSignalRef.current) break;
        await new Promise(r => setTimeout(r, 800));

        const liveMode = playbackModeRef.current;
        if (liveMode === 'once') break;
        else if (liveMode === 'random') index = Math.floor(Math.random() * listToPlay.length);
        else if (liveMode === 'loop_one') {
          // Do nothing, keep same index
        }
        else { 
            index++; 
            if (index >= listToPlay.length) index = 0;
        }
      }
      setIsPlaying(false);
      setSpeakingPart(null);
      // forceStopAll akan dipanggil manual oleh user atau cleanup, tapi jika loop habis:
      if (!stopSignalRef.current) {
          // Playlist selesai secara alami
          addLog("Info", "Playback Finished.");
          forceStopAll(); // Matikan silent audio juga
      }
    });
  };

  const forceStopAll = () => {
    stopSignalRef.current = true;
    synth.cancel();
    if (currentAudioObjRef.current) {
      currentAudioObjRef.current.pause();
      currentAudioObjRef.current.currentTime = 0;
      const audio = currentAudioObjRef.current;
      audio.onended = null;
      audio.onerror = null;
      currentAudioObjRef.current = null;
    }
    
    // --- FIX: STOP SILENT ANCHOR ---
    if (silentAudioRef.current) {
        silentAudioRef.current.pause();
        silentAudioRef.current.currentTime = 0;
    }
    
    // --- MEDIA SESSION UPDATE: RESET ---
    // Only reset state here (on explicit stop or end of playlist)
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "none";

    setIsPlaying(false);
    setSpeakingPart(null);
    setIndependentPlayingId(null);
  };

  const handleSmartNav = (direction) => {
    setActiveMenuId(null); 
    // FIX: Force scroll to playing index when smart nav is used
    justSwitchedTab.current = true;

    safePlayTransition(async () => {
      let listToUse = currentPlayerList;
      let contextToUse = mode === 'table' ? tableViewMode : 'text';

      if (playingIndex !== -1 && playingContext) {
         contextToUse = playingContext;
         listToUse = playingContext === 'study' 
             ? playlist.filter(i => studyQueueSet.has(i.id))
             : playlist;
      }

      let currentListIndex = -1;
      const refId = (playingIndex !== -1 && playingContext) ? playingIndex : currentIndex;
      
      const activeItem = listToUse.find(p => p.id === refId);
      if (activeItem) {
          currentListIndex = listToUse.indexOf(activeItem);
      }
      
      let nextIndex = 0;
      if (direction === 'next') {
          nextIndex = currentListIndex + 1 < listToUse.length ? currentListIndex + 1 : 0;
      } else {
          nextIndex = currentListIndex - 1 >= 0 ? currentListIndex - 1 : 0;
      }
      
      if (listToUse[nextIndex]) {
          if (contextToUse === (mode === 'table' ? tableViewMode : 'text')) {
             setCurrentIndex(listToUse[nextIndex].id);
          }
          setPlayingContext(contextToUse);
          startGlobalPlayback(nextIndex);
      }
    });
  };
  
    // --- NEW: MEDIA SESSION API INTEGRATION (ANDROID WIDGET) ---// --- MEDIA SESSION API (STABLE, NO WIDGET FLICKER) ---
    const playRef = useRef(handleGlobalPlay);
    const navRef = useRef(handleSmartNav);
    const stopRef = useRef(forceStopAll);

    // Always update ref values to latest functions
    playRef.current = handleGlobalPlay;
    navRef.current = handleSmartNav;
    stopRef.current = forceStopAll;

    useEffect(() => {
        if (!('mediaSession' in navigator)) return;

        // 1. Tentukan Item yang sedang aktif
        const activeItem = currentPlayerList.find(p => p.id === playingIndex);
        if (!activeItem) return;

        // 2. Tentukan Metadata
        let title = activeItem.word || activeItem.text || "Unknown Item";
        let artist = "ProLingo Audio";

        // Jika mode Table
        if (activeItem.isStructured) {
            artist = activeItem.sentence || "Sentence Practice";
        }

        // Jika sedang memutar bagian Meaning
        if (speakingPart === "meaning") {
            title = `Artinya: ${activeItem.meaning}`;
        }

        // 3. Set Metadata sekali per perubahan track / part
        navigator.mediaSession.metadata = new MediaMetadata({
            title,
            artist,
            album: currentDeckName || "ProLingo Deck",
            artwork: [
                { 
                    src: "https://cdn-icons-png.flaticon.com/512/2995/2995101.png",
                    sizes: "512x512",
                    type: "image/png"
                }
            ]
        });

        // 4. Set Action Handlers (STABLE with refs)
        navigator.mediaSession.setActionHandler("play", () => playRef.current());
        navigator.mediaSession.setActionHandler("pause", () => playRef.current());
        navigator.mediaSession.setActionHandler("previoustrack", () => navRef.current("prev"));
        navigator.mediaSession.setActionHandler("nexttrack", () => navRef.current("next"));
        navigator.mediaSession.setActionHandler("stop", () => stopRef.current());

    }, [
        playingIndex,
        speakingPart,
        currentPlayerList,
        currentDeckName
    ]);

  const cyclePlaybackMode = () => {
      const modes = ['once', 'sequence', 'repeat_2x', 'loop_one', 'random'];
      const currentIdx = modes.indexOf(playbackMode);
      const nextIdx = (currentIdx + 1) % modes.length;
      setPlaybackMode(modes[nextIdx]);
  };

  const handleModeSwitch = (targetMode) => {
      if (targetMode === mode) return;
      if (isSystemBusy) return; 

      forceStopAll();
      setPlayingIndex(-1);
      setPlayingContext(null);
      setIndependentPlayingId(null); 

      // SAVE Scroll Position
      if (mode === 'table') viewScrollPosRef.current[tableViewMode] = getScrollPos();
      else viewScrollPosRef.current['text'] = getScrollPos();

      const currentIdx = currentIndex;
      setSavedIndices(prev => ({
          ...prev,
          [mode]: currentIdx
      }));

      // PREPARE RESTORE SCROLL
      let saved = 0;
      if (targetMode === 'table') saved = viewScrollPosRef.current[tableViewMode];
      else saved = viewScrollPosRef.current['text'];
      
      // CRITICAL FIX: Set scrollTop STATE instantly to avoid virtual list flicker
      setScrollTop(saved);
      // Also set ref for physical scroll via useLayoutEffect
      pendingScrollRestoration.current = saved;
      isAutoScrolling.current = true;

      setMode(targetMode);
      const targetIndex = savedIndices[targetMode];
      setCurrentIndex(targetIndex);

      addLog("System", `Switched to ${targetMode}.`);
  };

  const handleInputContentChange = (val) => {
    if (mode === 'table') setTableContent(val);
    else setTextContent(val);
  };

  const handleSaveDeck = () => {
      if(!currentDeckName) return;
      const newDecks = {...savedDecks, [currentDeckName]: tableContent};
      setSavedDecks(newDecks);
      localStorage.setItem('pronunciation_decks', JSON.stringify(newDecks));
      setSelectedDeckId(currentDeckName);
      addLog("Success", `Deck "${currentDeckName}" saved.`);
  };

  const handleLoadDeck = (e) => {
      const deckName = e.target.value;
      if (!deckName) return;
      if (savedDecks[deckName]) {
          setTableContent(savedDecks[deckName]);
          setCurrentDeckName(deckName);
          setSelectedDeckId(deckName);
          setLockedStates(prev => ({ ...prev, table: true }));
          
          forceStopAll();
          setPlayingIndex(-1);
          setPlayingContext(null);

          setMode('table'); 
          setCurrentIndex(-1);
          setMasterIndex(-1);
          setStudyIndex(-1);
          addLog("Success", `Deck "${deckName}" loaded.`);
      }
  };

  const handleDeleteDeckInit = () => {
      if (!selectedDeckId) return;
      setIsDeleteDialogOpen(true);
  };

  const confirmDeleteDeck = () => {
      if (!selectedDeckId) return;
      const newDecks = { ...savedDecks };
      delete newDecks[selectedDeckId];
      setSavedDecks(newDecks);
      localStorage.setItem('pronunciation_decks', JSON.stringify(newDecks));
      setSelectedDeckId("");
      setCurrentDeckName("Untitled Sheet");
      setTableContent("");
      resetFullState();
      setIsDeleteDialogOpen(false);
      addLog("Info", "Deck deleted & state reset.");
  };

  const generateAIAudio = async (item, part = 'full') => {
    const uniqueLoadingId = `${item.id}-${part}`;
    setAiLoadingId(uniqueLoadingId);
    
    let textToSpeak = "";
    
    // FIX: Voice Name in Filename Logic
    // Determine active voice name for file suffix
    const voiceLabel = generatorEngine === 'edge'
        ? (part === 'meaning' ? edgeIndonesianVoice : edgeVoice)
        : aiVoiceName;
    
    const safeVoice = sanitizeFilename(voiceLabel || 'Voice');
    
    let filename = "";
    
    if (mode === 'table') {
        const safeWord = sanitizeFilename(item.word);
        if (part === 'word') {
            textToSpeak = item.word;
            filename = `${item.displayId}_${safeWord}_${safeVoice}_word.wav`;
        } else if (part === 'sentence') {
            textToSpeak = item.sentence;
            filename = `${item.displayId}_${safeWord}_${safeVoice}_sentence.wav`;
        } else if (part === 'meaning') {
            textToSpeak = item.meaning;
            filename = `${item.displayId}_${safeWord}_${safeVoice}_meaning.wav`;
        }
    } else {
        textToSpeak = item.text;
        filename = `${item.displayId}_${safeVoice}_text.wav`;
    }

    addLog("Info", `Gen (${generatorEngine}) #${item.displayId}...`);

    try {
        let blob = null;

        // --- BRANCH LOGIC: EDGE TTS vs GEMINI AI ---
        if (generatorEngine === 'edge') {
             // 1. EDGE TTS (Local Backend)
             const rateStr = edgeRate >= 0 ? `+${edgeRate}%` : `${edgeRate}%`;
             const pitchStr = edgePitch >= 0 ? `+${edgePitch}Hz` : `${edgePitch}Hz`;

             // Determine Voice based on Part
             const activeVoiceId = part === 'meaning' ? edgeIndonesianVoice : edgeVoice;

             const response = await fetch('/api/tts', {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                     text: textToSpeak,
                     voice: activeVoiceId, 
                     rate: rateStr,
                     pitch: pitchStr
                 })
             });

             if (!response.ok) {
                 const errText = await response.text();
                 throw new Error(`Edge API Error: ${errText}`);
             }
             
             blob = await response.blob();
        } 
        else {
            // 2. GEMINI AI (Cloud API) 
            const keyToUse = apiKey || userApiKey; 
            if (!keyToUse) {
                alert("API Key Kosong! Masukkan key di menu Tools.");
                return;
            }

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${keyToUse}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                contents: [{ parts: [{ text: textToSpeak }] }],
                generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: aiVoiceName } } } }
                })
            });

            if (!response.ok) throw new Error(`Gemini API Error ${response.status}`);
            const data = await response.json();
            
            if (data.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
                const base64Audio = data.candidates[0].content.parts[0].inlineData.data;
                blob = new Blob([encodeWAV(base64ToInt16Array(base64Audio))], { type: 'audio/wav' });
            } else {
                addLog("Warn", `Gagal (Safety/Refusal): ${textToSpeak.substring(0,20)}...`);
                alert(`Gagal: AI menolak teks ini (Safety/Model Issue).\nCoba ganti kata atau gunakan Voice lain.`);
                return; 
            }
        }

        // Common Processing (Save & Download)
        if (blob) {
            const url = URL.createObjectURL(blob);
            if (mode === 'table') setLocalAudioMapTable(prev => ({ ...prev, [`${item.displayId}_${part}`]: url }));
            else setLocalAudioMapText(prev => ({ ...prev, [`${item.displayId}`]: url }));

            triggerBrowserDownload(url, filename);
            addLog("Success", `Saved: ${filename}`);
        }

    } catch (e) { 
        if (e.message.includes('401') || e.message.includes('403')) {
            addLog("Error", `Akses Ditolak (${e.message})`);
            alert(`Gagal: Akses Ditolak oleh Server (${e.message}).\n\nDetail: Kemungkinan API Key tidak valid, kuota habis, atau Voice tidak tersedia.\n\nSaran: Cek API Key atau coba ganti Voice lain.`);
        } else {
            console.error(e); // Only log real unknown errors
            addLog("Error", `Gen Failed: ${e.message}`);
            alert(`Gagal: ${e.message}`);
        }
    } 
    finally { setAiLoadingId(null); }
  };

  const runBatchDownload = async () => {
    if (isBatchDownloading) {
        batchStopSignalRef.current = true;
        setIsBatchStopping(true); 
        setBatchStatusText("Stopping...");
        addLog("Batch", "Stopping batch download...");
        return;
    }
    
    batchStopSignalRef.current = false;
    setIsBatchStopping(false);

    const startIdx = parseInt(batchConfig.start);
    const endIdx = parseInt(batchConfig.end);
    
    if (isNaN(startIdx) || isNaN(endIdx) || startIdx < 1 || endIdx > playlist.length || startIdx > endIdx) {
        alert("Range tidak valid.");
        return;
    }

    const targets = playlist.filter(p => p.displayId >= startIdx && p.displayId <= endIdx);
    
    if (targets.length === 0) {
        alert("Tidak ada item dalam range tersebut.");
        return;
    }

    setIsBatchDownloading(true);
    addLog("Info", `Starting BATCH DL (${targets.length} items) via ${generatorEngine.toUpperCase()}...`);

    for (const item of targets) {
        if (batchStopSignalRef.current) {
            addLog("Batch", "Batch Stopped by User.");
            break;
        }
        
        if (mode === 'table') {
            if (batchConfig.doWord) { 
                setBatchStatusText(`${item.displayId} Word`); 
                await generateAIAudio(item, 'word'); // Uses the smart wrapper
                await new Promise(r => setTimeout(r, 1000)); 
            }
            if (batchStopSignalRef.current) break; 
            if (batchConfig.doSentence) { 
                setBatchStatusText(`${item.displayId} Sent`); 
                await generateAIAudio(item, 'sentence'); // Uses the smart wrapper
                await new Promise(r => setTimeout(r, 1000)); 
            }
            if (batchStopSignalRef.current) break;
            
            // New Meaning Logic
            if (batchConfig.doMeaning && generatorEngine === 'edge') { 
                 setBatchStatusText(`${item.displayId} Meaning`); 
                 await generateAIAudio(item, 'meaning'); 
                 await new Promise(r => setTimeout(r, 1000)); 
            }
        } else {
             setBatchStatusText(`${item.displayId} Full`); 
             await generateAIAudio(item, 'full'); // Uses the smart wrapper
             await new Promise(r => setTimeout(r, 1000));
        }
    }

    setIsBatchDownloading(false);
    setBatchStatusText(""); 
    setIsBatchStopping(false);
    batchStopSignalRef.current = false;
  };

  const handleCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target.result;
      const fileName = file.name.replace('.csv', '');
      setTableContent(content);
      handleModeSwitch('table');
      setCurrentDeckName(fileName);
      setLockedStates(prev => ({ ...prev, table: true }));
      const newDecks = { ...savedDecks, [fileName]: content };
      setSavedDecks(newDecks);
      localStorage.setItem('pronunciation_decks', JSON.stringify(newDecks));
      setSelectedDeckId(fileName);
      resetFullState(); 
      addLog("Info", `CSV Imported: ${fileName}.`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleFolderSelect = (e) => {
    const files = e.target.files;
    if (!files) return;
    let count = 0;
    
    if (mode === 'table') {
        Object.values(localAudioMapTable).forEach(url => {
            try { URL.revokeObjectURL(url); } catch (e) {
                console.warn("Failed to revoke URL:", e);
            }
        });
        const newMap = {}; 
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const lowerName = file.name.toLowerCase();
            if (file.type.startsWith('audio/') || file.name.endsWith('.wav')) {
                const idMatch = lowerName.match(/^(\d+)/);
                if (idMatch) {
                   const id = parseInt(idMatch[1]);
                   let type = null;
                   if (lowerName.includes('word') || lowerName.includes('kata')) type = 'word';
                   else if (lowerName.includes('sentence') || lowerName.includes('kalimat')) type = 'sentence';
                   else if (lowerName.includes('meaning') || lowerName.includes('arti')) type = 'meaning';
                   if (type) { newMap[`${id}_${type}`] = URL.createObjectURL(file); count++; }
                }
            }
        }
        setLocalAudioMapTable(newMap);
        setAudioStatusTable(count > 0 ? 'success' : 'empty');
        alert(`[Table] Loaded ${count} files. Old files cleared.`);
    } else {
        Object.values(localAudioMapText).forEach(url => {
            try { URL.revokeObjectURL(url); } catch (e) {
                console.warn("Failed to revoke URL:", e);
            }
        });
        const newMap = {}; 
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const lowerName = file.name.toLowerCase();
            if ((file.type.startsWith('audio/') || file.name.endsWith('.wav')) && lowerName.match(/^(\d+)/)) {
                const id = parseInt(lowerName.match(/^(\d+)/)[1]);
                newMap[`${id}`] = URL.createObjectURL(file);
                count++;
            }
        }
        setLocalAudioMapText(newMap);
        setAudioStatusText(count > 0 ? 'success' : 'empty');
        alert(`[Text] Loaded ${count} files. Old files cleared.`);
    }
  };

  const currentAudioStatus = mode === 'table' ? audioStatusTable : audioStatusText;
  const currentMapCount = mode === 'table' ? Object.keys(localAudioMapTable).length : Object.keys(localAudioMapText).length;

  const renderStatusBadge = () => {
      if (currentAudioStatus === 'idle' && currentMapCount === 0) return <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded">Belum Load</span>;
      if (currentMapCount > 0) return <span className="text-[10px] bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-0.5 rounded font-bold flex items-center gap-1"><CheckCircle className="w-3 h-3"/> {currentMapCount} File Aktif</span>;
      return <span className="text-[10px] bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-300 px-2 py-0.5 rounded font-bold flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> 0 File</span>;
  };

  const handleScroll = (e) => {
     // FIX CRITICAL: Removed "if (isAutoScrolling.current) return;" blocker.
     // This allows state synchronization even if the browser clamps the scroll position.
     const currentScroll = e.currentTarget.scrollTop;
     setScrollTop(currentScroll);
  };

  const renderBatchPopup = () => (
     <div 
        ref={batchPanelRef} 
        className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-xl z-[100] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
     >
        <div className="bg-slate-800 text-white p-2 text-xs font-bold flex justify-between">
            <span>Batch Download ({mode})</span>
            <button onClick={() => setIsBatchOpen(false)}><X className="w-3 h-3"/></button>
        </div>
        <div className="p-3 space-y-3">
             {mode === 'table' ? (
                 <div className="flex flex-col gap-2 text-xs">
                     <div className="flex gap-2">
                         <div className="flex items-center gap-1">
                             <button disabled={isBatchDownloading} onClick={() => setBatchConfig(p=>({...p, doWord: !p.doWord}))} className={`${batchConfig.doWord ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'} ${isBatchDownloading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                 {batchConfig.doWord ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>}
                             </button>
                             <span className="dark:text-slate-300">Words</span>
                         </div>
                         <div className="flex items-center gap-1">
                             <button disabled={isBatchDownloading} onClick={() => setBatchConfig(p=>({...p, doSentence: !p.doSentence}))} className={`${batchConfig.doSentence ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'} ${isBatchDownloading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                 {batchConfig.doSentence ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>}
                             </button>
                             <span className="dark:text-slate-300">Sentences</span>
                         </div>
                     </div>
                     {/* Meaning Checkbox (Edge Only) */}
                     <div className="flex items-center gap-1 border-t border-slate-100 dark:border-slate-700 pt-2">
                          <button disabled={isBatchDownloading || generatorEngine !== 'edge'} onClick={() => setBatchConfig(p=>({...p, doMeaning: !p.doMeaning}))} className={`${batchConfig.doMeaning ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'} ${(isBatchDownloading || generatorEngine !== 'edge') ? 'opacity-50 cursor-not-allowed' : ''}`}>
                             {batchConfig.doMeaning ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>}
                         </button>
                         <span className={`dark:text-slate-300 ${generatorEngine !== 'edge' ? 'line-through opacity-50' : ''}`}>Meaning (Indonesian)</span>
                     </div>
                 </div>
             ) : (
                 <div className="text-xs text-slate-400 italic">Batch download for full text.</div>
             )}
             
             <div className="flex gap-2 items-center text-xs">
                 <span className="text-slate-500">Range:</span>
                 <input 
                    type="number" 
                    className="w-12 border rounded p-1 dark:bg-slate-700 dark:border-slate-600 dark:text-white" 
                    value={batchConfig.start} 
                    onChange={e=>setBatchConfig(p=>({...p, start:e.target.value}))}
                    onBlur={() => handleBatchRangeBlur('start')} 
                    disabled={isBatchDownloading}
                 />
                 <span className="dark:text-slate-400">-</span>
                 <input 
                    type="number" 
                    className="w-12 border rounded p-1 dark:bg-slate-700 dark:border-slate-600 dark:text-white" 
                    value={batchConfig.end} 
                    onChange={e=>setBatchConfig(p=>({...p, end:e.target.value}))} 
                    onBlur={() => handleBatchRangeBlur('end')} 
                    disabled={isBatchDownloading}
                 />
             </div>
             
             <button 
                onClick={runBatchDownload} 
                className={`w-full py-2 rounded text-xs font-bold flex items-center justify-center gap-2 text-white transition-all
                   ${isBatchStopping ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : ''}
                   ${isBatchDownloading && !isBatchStopping ? 'bg-red-500 hover:bg-red-600' : ''}
                   ${!isBatchDownloading && !isBatchStopping ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
                `}
             >
                 {isBatchDownloading ? (
                     <>
                        {isBatchStopping ? <XCircle className="w-3 h-3"/> : <Loader2 className="w-3 h-3 animate-spin"/>}
                        {isBatchStopping ? "Stopping..." : (batchStatusText || "STOP BATCH")}
                     </>
                 ) : (
                     <>
                        <DownloadCloudIcon className="w-3 h-3"/>
                        START BATCH
                     </>
                 )}
             </button>
             <div className="text-[10px] text-center italic text-slate-400 mt-1">Using: {generatorEngine === 'edge' ? 'Edge TTS' : 'Gemini AI'}</div>
        </div>
     </div>
  );

  const DownloadCloudIcon = ({className}) => <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path><path d="M12 12v9"></path><path d="m8 17 4 4 4-4"></path></svg>;

  const renderMobileTools = () => (
      <div className="p-4 space-y-4">
          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
             <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2"><Settings className="w-4 h-4"/> Tools & API</h3>
             <input type="password" placeholder={apiKey ? "System Key Active" : "Gemini API Key"} className={`text-xs border border-slate-300 dark:border-slate-600 rounded px-3 py-2 w-full mb-3 dark:bg-slate-700 dark:text-white ${apiKey ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' : ''}`} value={apiKey ? "" : userApiKey} disabled={!!apiKey} onChange={e => {setUserApiKey(e.target.value); localStorage.setItem('gemini_api_key', e.target.value)}} />
             <button disabled={isSystemBusy} onClick={() => folderInputRef.current.click()} className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-bold transition border ${currentMapCount > 0 ? 'bg-green-600 text-white border-green-700' : 'bg-slate-800 dark:bg-slate-700 text-white border-slate-900 dark:border-slate-600'} ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`}>
               <FolderOpen className="w-3.5 h-3.5" /> Load Audio Folder
             </button>
          </div>

          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
             <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2"><Database className="w-4 h-4"/> Decks</h3>
             <select disabled={isSystemBusy} className={`w-full text-xs p-2 border border-slate-200 dark:border-slate-600 rounded mb-2 bg-slate-50 dark:bg-slate-700 dark:text-white ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`} onChange={handleLoadDeck} value={selectedDeckId}>
                <option value="" disabled>Load Saved...</option>
                {Object.keys(savedDecks).map(name => <option key={name} value={name}>{name}</option>)}
            </select>
             <div className="flex gap-2">
                 <input disabled={isSystemBusy} className={`flex-1 border border-slate-200 dark:border-slate-600 rounded px-2 text-xs dark:bg-slate-700 dark:text-white ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`} placeholder="Deck Name" value={currentDeckName} onChange={(e) => setCurrentDeckName(e.target.value)} />
                 <button disabled={isSystemBusy} onClick={handleSaveDeck} className={`p-2 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`}><Save className="w-4 h-4"/></button>
                 {selectedDeckId && <button disabled={isSystemBusy} onClick={handleDeleteDeckInit} className={`p-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`}><Trash2 className="w-4 h-4"/></button>}
             </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
             <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2"><ListPlus className="w-4 h-4 text-indigo-600 dark:text-indigo-400"/> Add to Queue (Range)</h3>
             <div className="flex gap-2">
                 <input 
                    className="flex-1 text-sm border border-slate-300 dark:border-slate-600 rounded px-3 py-2 focus:outline-indigo-500 dark:bg-slate-700 dark:text-white"
                    placeholder="Ex: 1-10, 15"
                    value={rangeInput}
                    onChange={(e) => setRangeInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRangeAdd()}
                    disabled={isSystemBusy}
                 />
                 <button onClick={handleRangeAdd} disabled={!rangeInput.trim() || isSystemBusy} className={`px-4 py-2 rounded text-xs font-bold ${!rangeInput.trim() || isSystemBusy ? 'bg-slate-100 dark:bg-slate-700 text-slate-400' : 'bg-indigo-600 text-white'}`}>
                     Apply
                 </button>
             </div>
             <p className="text-[10px] text-slate-400 mt-2 italic">Menambahkan item ke Study Queue berdasarkan nomor urut.</p>
          </div>

          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
             <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2"><Layers className="w-4 h-4 text-purple-600 dark:text-purple-400"/> Batch Download</h3>
             <div className="space-y-3">
                 {mode === 'table' ? (
                     <>
                        <div className="flex gap-4">
                            <button disabled={isBatchDownloading} onClick={() => setBatchConfig(p=>({...p, doWord: !p.doWord}))} className={`flex items-center gap-2 text-xs font-medium ${batchConfig.doWord ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'} ${isBatchDownloading ? 'opacity-50' : ''}`}>{batchConfig.doWord ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>} Word</button>
                            <button disabled={isBatchDownloading} onClick={() => setBatchConfig(p=>({...p, doSentence: !p.doSentence}))} className={`flex items-center gap-2 text-xs font-medium ${batchConfig.doSentence ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'} ${isBatchDownloading ? 'opacity-50' : ''}`}>{batchConfig.doSentence ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>} Sentence</button>
                        </div>
                        {/* Mobile Batch Meaning */}
                        <div className="flex items-center gap-2 border-t border-slate-100 dark:border-slate-700 pt-2">
                            <button disabled={isBatchDownloading || generatorEngine !== 'edge'} onClick={() => setBatchConfig(p=>({...p, doMeaning: !p.doMeaning}))} className={`flex items-center gap-2 text-xs font-medium ${batchConfig.doMeaning ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'} ${(isBatchDownloading || generatorEngine !== 'edge') ? 'opacity-50' : ''}`}>
                                {batchConfig.doMeaning ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>} 
                            </button>
                            <span className={`text-xs ${generatorEngine !== 'edge' ? 'line-through opacity-50 dark:text-slate-500' : 'dark:text-slate-300'}`}>Meaning (Indonesian)</span>
                        </div>
                     </>
                 ) : (
                     <div className="text-xs text-slate-400 italic">Batch download for full text.</div>
                 )}

                 <div className="flex items-center gap-2 text-xs">
                     <span className="dark:text-slate-400">Range:</span>
                     <input disabled={isBatchDownloading} type="number" className="w-16 border border-slate-200 dark:border-slate-600 rounded p-1 dark:bg-slate-700 dark:text-white" value={batchConfig.start} onChange={e=>setBatchConfig(p=>({...p, start:e.target.value}))} />
                     <span className="dark:text-slate-400">to</span>
                     <input disabled={isBatchDownloading} type="number" className="w-16 border border-slate-200 dark:border-slate-600 rounded p-1 dark:bg-slate-700 dark:text-white" value={batchConfig.end} onChange={e=>setBatchConfig(p=>({...p, end:e.target.value}))} />
                 </div>
                 <button onClick={runBatchDownload} disabled={isSystemBusy && !isBatchDownloading} className={`w-full py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 ${(isSystemBusy && !isBatchDownloading) ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed' : (isBatchDownloading ? 'bg-slate-100 text-slate-400' : 'bg-purple-600 text-white hover:bg-purple-700')}`}>
                     {isBatchDownloading ? <Loader2 className="w-3 h-3 animate-spin"/> : <DownloadCloudIcon className="w-3 h-3"/>}
                     {isBatchDownloading ? "Downloading..." : "Start Batch Download"}
                 </button>
                 <div className="text-[10px] text-center italic text-slate-400">Using: {generatorEngine === 'edge' ? 'Edge TTS' : 'Gemini AI'}</div>
             </div>
          </div>
      </div>
  );

  const renderPlaylist = () => {
    const rowHeight = rowHeights[mode];
    const totalCount = currentPlayerList.length;
    
    // --- EMPTY STATE HANDLING (CENTERED & NO SCROLL) ---
    if (totalCount === 0) {
        let emptyContent = null;
        if (mode === 'table' && tableViewMode === 'study') {
            emptyContent = (
             <div className="text-center text-slate-400">
                 <ListPlus className="w-16 h-16 mx-auto mb-4 opacity-20"/>
                 <p className="font-medium">Study Queue Kosong</p>
                 <button onClick={() => setTableViewMode('master')} className="mt-4 px-4 py-2 bg-indigo-50 text-indigo-600 rounded text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50">
                     Go to Master Data
                 </button>
             </div>
            );
        } else if (mode === 'table' && tableViewMode === 'master') {
             emptyContent = (
             <div className="text-center text-slate-400">
                 <Table className="w-16 h-16 mx-auto mb-4 opacity-20"/>
                 <p className="font-medium">Belum ada data</p>
                 <p className="text-xs mt-2 opacity-70">Paste data Excel di kolom input sebelah kiri</p>
             </div>
            );
        } else if (mode === 'text') {
             emptyContent = (
             <div className="text-center text-slate-400">
                 <FileText className="w-16 h-16 mx-auto mb-4 opacity-20"/>
                 <p className="font-medium">Text Editor Kosong</p>
                 <p className="text-xs mt-2 opacity-70">Ketik teks di atas atau paste di kolom input kiri</p>
             </div>
            );
        }

        return (
            <div className="w-full h-full flex flex-col items-center p-4 min-h-[50vh]">
                 {/* Text Mode Input - Keep visible at top */}
                 {mode === 'text' && (
                     <div className="w-full mb-8 z-10">
                        <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-indigo-100 dark:border-slate-700 shadow-sm flex gap-2 items-start">
                             <textarea
                                 ref={newItemTextareaRef}
                                 disabled={isSystemBusy}
                                 className={`flex-1 text-sm border border-slate-300 dark:border-slate-600 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none overflow-y-auto min-h-[42px] max-h-[100px] ${isSystemBusy ? 'bg-slate-50 dark:bg-slate-700 cursor-not-allowed' : 'bg-white dark:bg-slate-800 dark:text-white'}`}
                                 placeholder="Ketik atau paste teks baru..."
                                 value={newTextItem}
                                 onChange={(e) => setNewTextItem(e.target.value)}
                                 onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddTextItem(); }}}
                                 rows={1}
                             />
                             <button 
                                 disabled={isSystemBusy || !newTextItem.trim()}
                                 onClick={handleAddTextItem} 
                                 className={`h-10 px-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all flex-shrink-0 ${!newTextItem.trim() || isSystemBusy ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'}`}
                             >
                                 <Send className="w-4 h-4"/> Add
                             </button>
                        </div>
                     </div>
                 )}
                 
                 {/* Desktop Range Input */}
                 {mode === 'table' && tableViewMode === 'master' && !isMobile && (
                     <div className="w-full mb-8 z-10 bg-white dark:bg-slate-800 p-2 rounded-xl border border-indigo-100 dark:border-slate-700 shadow-sm flex gap-2 items-center">
                         <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-xs bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1.5 rounded">
                             <ListPlus className="w-4 h-4"/> Range
                         </div>
                         <input 
                            className="flex-1 text-sm border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 focus:outline-indigo-500 dark:bg-slate-700 dark:text-white"
                            placeholder="Ex: 1-10, 15, 20-25"
                            value={rangeInput}
                            onChange={(e) => setRangeInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleRangeAdd()}
                         />
                         <button onClick={handleRangeAdd} disabled={!rangeInput.trim()} className={`px-3 py-1.5 rounded text-xs font-bold ${!rangeInput.trim() ? 'bg-slate-100 dark:bg-slate-700 text-slate-400' : 'bg-indigo-600 text-white'}`}>
                             Apply
                         </button>
                     </div>
                 )}

                 <div className="flex-1 flex items-center justify-center w-full">
                    {emptyContent}
                 </div>
            </div>
        );
    }

    const totalHeight = totalCount * rowHeight;
    
    // --- FIX MOBILE SCROLL & ADDRESS BAR HIDING ---
    let mobileSpacerHeight = 0;
    if (isMobile) {
        const headerOffset = mode === 'table' ? 160 : 115; 
        const currentContentHeight = totalHeight + headerOffset;
        const minScrollableHeight = window.innerHeight + 150; 
        
        if (currentContentHeight < minScrollableHeight) {
             mobileSpacerHeight = minScrollableHeight - currentContentHeight;
        }
    }

    const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
    const endIndex = Math.min(
        totalCount - 1,
        Math.floor((scrollTop + containerHeight) / rowHeight) + OVERSCAN
    );

    const virtualItems = [];
    for (let i = startIndex; i <= endIndex; i++) {
        virtualItems.push({
            ...currentPlayerList[i],
            virtualIdx: i, 
            offsetTop: i * rowHeight
        });
    }

    return (
      <div 
         ref={listContainerRef} 
         onScroll={handleScroll} 
         // MODIFIED PADDING: pb-20 (Requested by user)
         className={`${isMobile ? 'overflow-visible pb-20' : 'h-full overflow-y-auto pb-0 custom-scrollbar'} relative w-full touch-pan-y`}
      >
        {mode === 'text' && (
             <div className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 pb-2 px-1">
                 <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-indigo-100 dark:border-slate-700 shadow-sm flex gap-2 items-start">
                     <textarea
                         ref={newItemTextareaRef}
                         disabled={isSystemBusy}
                         className={`flex-1 text-sm border border-slate-300 dark:border-slate-600 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none overflow-y-auto min-h-[42px] max-h-[100px] ${isSystemBusy ? 'bg-slate-50 dark:bg-slate-700 cursor-not-allowed' : 'bg-white dark:bg-slate-800 dark:text-white'}`}
                         placeholder="Ketik atau paste teks baru..."
                         value={newTextItem}
                         onChange={(e) => setNewTextItem(e.target.value)}
                         onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddTextItem(); }}}
                         rows={1}
                     />
                     <button 
                         disabled={isSystemBusy || !newTextItem.trim()}
                         onClick={handleAddTextItem} 
                         className={`h-10 px-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all flex-shrink-0 ${!newTextItem.trim() || isSystemBusy ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'}`}
                     >
                         <Send className="w-4 h-4"/> Add
                     </button>
                 </div>
             </div>
        )}

        {/* Desktop Only Range Input */}
        {mode === 'table' && tableViewMode === 'master' && (
             <div className="hidden md:block sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 pb-2 px-1">
                 <div className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-indigo-100 dark:border-slate-700 shadow-sm flex gap-2 items-center">
                     <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-xs bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1.5 rounded">
                         <ListPlus className="w-4 h-4"/> Range
                     </div>
                     <input 
                        className="flex-1 text-sm border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 focus:outline-indigo-500 dark:bg-slate-700 dark:text-white"
                        placeholder="Ex: 1-10, 15, 20-25"
                        value={rangeInput}
                        onChange={(e) => setRangeInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRangeAdd()}
                     />
                     <button onClick={handleRangeAdd} disabled={!rangeInput.trim()} className={`px-3 py-1.5 rounded text-xs font-bold ${!rangeInput.trim() ? 'bg-slate-100 dark:bg-slate-700 text-slate-400' : 'bg-indigo-600 text-white'}`}>
                         Apply
                     </button>
                 </div>
             </div>
        )}

        
        {/* FIX: Container Height = Total Konten + Spacer Mobile. Removed Subtraction logic that cut off last items. */}
        <div style={{ height: totalHeight + mobileSpacerHeight, position: 'relative' }} className="w-full">
            {virtualItems.map((item) => {
               if (mode === 'table' && item.isStructured) {
                   const isActive = (item.id === playingIndex) && (isPlaying || independentPlayingId !== null) && (playingContext === tableViewMode);
                   const rowId = `row-${item.id}`; 
                   const isInQueue = studyQueueSet.has(item.id);
                   const localWordUrl = localAudioMapTable[`${item.displayId}_word`] || null;
                   const localSentUrl = localAudioMapTable[`${item.displayId}_sentence`] || null;
                   const localMeaningUrl = localAudioMapTable[`${item.displayId}_meaning`] || null;

                   return (
                       <MemoizedRow 
                           key={`${mode}-${tableViewMode}-${item.id}`} 
                           item={item}
                           isActive={isActive}
                           isSystemBusy={isSystemBusy}
                           toggleStudyItem={toggleStudyItem}
                           isInQueue={isInQueue}
                           handleIndependentPlay={handleIndependentPlay}
                           handleRowClick={handleManualRowClick} 
                           independentPlayingId={independentPlayingId}
                           speakingPart={speakingPart}
                           isMemoryMode={isMemoryMode}
                           memorySettings={memorySettings}
                           revealedCells={revealedCells}
                           toggleCellReveal={toggleCellReveal}
                           localWordUrl={localWordUrl} 
                           localSentUrl={localSentUrl}
                           localMeaningUrl={localMeaningUrl}
                           preferLocalAudio={preferLocalAudio}
                           generateAIAudio={generateAIAudio}
                           aiLoadingId={aiLoadingId}
                           rowId={rowId}
                           idx={item.virtualIdx}
                           style={{ 
                               height: rowHeight, 
                               top: item.offsetTop 
                           }}
                           activeMenuId={activeMenuId}
                           onMenuToggle={handleMenuToggle}
                           generatorEngine={generatorEngine}
                       />
                   );
               } 
               else {
                   const localTextUrl = localAudioMapText[`${item.displayId}`];
                   const textFilename = `${item.displayId}_text.wav`;
                   
                   const isActive = (item.id === playingIndex) && (isPlaying || independentPlayingId !== null) && (playingContext === 'text');
                   const isTextActive = isActive && speakingPart === 'full';

                   return (
                      <MemoizedTextRow
                        key={item.id}
                        item={item}
                        style={{ height: rowHeight, top: item.offsetTop }} 
                        isActive={isActive}
                        isTextActive={isTextActive}
                        handleManualRowClick={handleManualRowClick}
                        handleDeleteTextItem={handleDeleteTextItem}
                        localTextUrl={localTextUrl}
                        textFilename={textFilename}
                        isSystemBusy={isSystemBusy}
                        generateAIAudio={generateAIAudio}
                        aiLoadingId={aiLoadingId}
                        preferLocalAudio={preferLocalAudio}
                        generatorEngine={generatorEngine}
                      />
                   );
               }
             })}
             
             {/* RENDER MOBILE SPACER IF NEEDED (Allows Address Bar Hiding) */}
             {isMobile && mobileSpacerHeight > 0 && (
                 <div 
                    style={{ 
                        position: 'absolute', 
                        top: totalHeight, 
                        height: mobileSpacerHeight, 
                        width: '100%' 
                    }} 
                    className="flex flex-col items-center justify-start pt-10 text-slate-300 pointer-events-none"
                 >
                    <div className="flex flex-col items-center gap-2 opacity-30">
                        <ChevronsUp className="w-4 h-4 animate-bounce" />
                        <span className="text-[10px] font-medium">Scroll untuk Layar Penuh</span>
                    </div>
                 </div>
             )}
        </div>
      </div>
    );
  };

  return (
    <div className={`bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-sans flex flex-col relative transition-colors ${isMobile ? 'min-h-[100dvh] overflow-x-hidden' : 'h-screen overflow-hidden'}`}>
      
      {/* --- UNIFIED MOBILE HEADER GROUP --- */}
      <div className={`z-50 bg-white dark:bg-slate-800 transition-transform duration-300 shadow-md ${isMobile ? 'fixed top-0 left-0 right-0 w-full' : 'sticky top-0 border-b border-slate-200 dark:border-slate-700'} ${isMobile && !showAppBar ? '-translate-y-full' : 'translate-y-0'}`}>
        
        {/* 1. HEADER UTAMA */}
        <div className={`p-3 flex gap-4 justify-between items-center ${!isMobile ? 'border-none shadow-none' : ''} h-16`}>
            <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300">
                {isSidebarOpen ? <PanelLeftClose className="w-5 h-5"/> : <PanelLeftOpen className="w-5 h-5"/>}
            </button>
            <div className="flex items-center gap-2 whitespace-nowrap cursor-pointer" onClick={goHome} title="Back to Landing Page">
                <div className="bg-indigo-600 text-white p-2 rounded-lg"><Mic className="w-5 h-5" /></div>
                <div><h1 className="font-bold text-slate-800 dark:text-white leading-tight">ProLingo v5.6</h1></div>
            </div>
            </div>
            
            {/* Desktop Header Tools */}
            <div className="hidden md:flex flex-1 justify-center min-w-0 px-2">
                 <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg border border-slate-200 dark:border-slate-600 flex-shrink min-w-0 max-w-full overflow-hidden">
                  <Database className="w-4 h-4 text-slate-500 dark:text-slate-400 ml-1 flex-shrink-0" />
                  <div className="flex items-center flex-shrink min-w-0">
                    <select disabled={isSystemBusy} className={`bg-transparent text-sm font-semibold text-slate-700 dark:text-slate-200 outline-none w-16 lg:w-28 cursor-pointer flex-shrink min-w-0 dark:bg-slate-700 ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`} onChange={handleLoadDeck} value={selectedDeckId}>
                        <option value="" disabled>Load Saved...</option>
                        {Object.keys(savedDecks).map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                    {selectedDeckId && (
                        <button disabled={isSystemBusy} onClick={handleDeleteDeckInit} className={`p-1 hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 rounded transition flex-shrink-0 ${isSystemBusy ? 'cursor-not-allowed opacity-50 pointer-events-none' : ''}`} title="Hapus Deck Ini"><Trash2 className="w-3.5 h-3.5"/></button>
                    )}
                  </div>
                  <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-500 mx-1 flex-shrink-0"></div>
                  <input disabled={isSystemBusy} className="bg-transparent text-sm w-16 lg:w-24 outline-none disabled:opacity-50 flex-shrink min-w-0 dark:text-white" placeholder="Sheet Name" value={currentDeckName} onChange={(e) => setCurrentDeckName(e.target.value)} />
                  <button disabled={isSystemBusy} onClick={handleSaveDeck} className={`p-1 hover:bg-white dark:hover:bg-slate-600 text-green-600 dark:text-green-400 rounded flex-shrink-0 ${isSystemBusy ? 'cursor-not-allowed opacity-50 pointer-events-none' : ''}`} title="Simpan Deck"><Save className="w-4 h-4"/></button>
                </div>
            </div>

            <div className="hidden md:flex items-center gap-2 flex-shrink-0 ml-auto">
                <div className="relative">
                <button ref={batchButtonRef} disabled={isSystemBusy && !isBatchDownloading} onClick={() => setIsBatchOpen(!isBatchOpen)} className={`p-2 rounded-md border transition-colors flex items-center gap-2 ${isBatchOpen ? 'bg-slate-800 text-purple-400 border-slate-700' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600'} ${(isSystemBusy && !isBatchDownloading) ? 'cursor-not-allowed opacity-50' : ''}`} title="Batch Download">
                    <Layers className="w-3.5 h-3.5"/> 
                    <span className="text-xs font-bold whitespace-nowrap hidden xl:inline">{isBatchDownloading && batchStatusText ? `Batching...` : "Batch DL"}</span>
                </button>
                {isBatchOpen && renderBatchPopup()}
            </div>

            <div className="relative">
                <button ref={debugButtonRef} onClick={() => setShowLogs(!showLogs)} className={`p-2 rounded-md border transition-colors ${showLogs ? 'bg-slate-800 text-green-400 border-slate-700' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600'} title="Debug Logs`}>
                    <Terminal className="w-3.5 h-3.5"/>
                </button>
                
                {showLogs && (
                    <div ref={debugPanelRef} className="absolute top-10 right-0 w-80 bg-slate-900 border border-slate-700 shadow-2xl rounded-xl z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200" style={{ maxHeight: '300px' }}>
                    <div className="flex items-center justify-between p-2 bg-slate-800 border-b border-slate-700">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div> System Logs</span>
                        <button onClick={() => setShowLogs(false)} className="text-slate-500 hover:text-white"><X className="w-3 h-3"/></button>
                    </div>
                    <div ref={logContainerRef} className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-[10px]">
                        {systemLogs.length === 0 && <p className="text-slate-600 italic">No logs available...</p>}
                        {systemLogs.map((log, i) => (
                            <div key={i} className="leading-tight border-b border-slate-800 pb-1 last:border-0">
                                <span className="text-slate-500 mr-2">[{log.time}]</span> 
                                <span className={`font-bold ${log.type === 'Error' ? 'text-red-400' : log.type === 'Warn' ? 'text-yellow-400' : 'text-blue-400'}`}>{log.type}:</span> 
                                <span className="text-slate-300 ml-1">{log.message}</span>
                            </div>
                        ))}
                    </div>
                    </div>
                )}
            </div>

            <input type="password" placeholder={apiKey ? "Active" : "API Key"} className={`text-xs border border-slate-300 dark:border-slate-600 rounded px-2 py-1 w-20 hidden xl:block dark:bg-slate-700 dark:text-white ${apiKey ? 'bg-green-50 border-green-200 text-green-700' : ''}`} value={apiKey ? "" : userApiKey} disabled={!!apiKey} onChange={e => {setUserApiKey(e.target.value); localStorage.setItem('gemini_api_key', e.target.value)}} />
            <button disabled={isSystemBusy} onClick={() => folderInputRef.current.click()} className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition border whitespace-nowrap ${isSystemBusy ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''} ${currentMapCount > 0 ? 'bg-green-600 text-white border-green-700' : 'bg-slate-800 dark:bg-slate-700 text-white border-slate-900 dark:border-slate-600'}`}>
                <FolderOpen className="w-3.5 h-3.5" /> <span className="hidden xl:inline">Load Audio</span>
            </button>
            <input type="file" ref={folderInputRef} webkitdirectory="" directory="" multiple className="hidden" onChange={handleFolderSelect} />
            </div>

            <div className="md:hidden ml-auto">
                {/* REMOVED DUPLICATE ERASER BUTTON AS REQUESTED */}
            </div>
        </div>

        {/* 2. MOBILE TAB BAR */}
        <div className="md:hidden bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex text-xs font-bold text-slate-500 z-10 relative">
            <button onClick={() => handleMobileTabSwitch('terminal')} className={`flex-1 py-3 border-b-2 flex items-center justify-center gap-2 ${mobileTab === 'terminal' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent'}`}><Terminal className="w-4 h-4"/> Logs</button>
            <button onClick={() => handleMobileTabSwitch('player')} className={`flex-1 py-3 border-b-2 flex items-center justify-center gap-2 ${mobileTab === 'player' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent'}`}><Play className="w-4 h-4"/> Player</button>
            <button onClick={() => handleMobileTabSwitch('tools')} className={`flex-1 py-3 border-b-2 flex items-center justify-center gap-2 ${mobileTab === 'tools' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent'}`}><Settings className="w-4 h-4"/> Tools</button>
        </div>

        {/* 3. TABLE TABS (Mobile Version) */}
        {isMobile && mode === 'table' && mobileTab === 'player' && (
            // FIX: Added 'relative' here to contain the absolute positioned delete button
             <div className="flex border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex-shrink-0 relative">
                <button onClick={() => handleTabSwitch('master')} className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${tableViewMode === 'master' ? 'border-indigo-600 text-indigo-700 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}><Database className="w-4 h-4"/> MASTER DATA</button>
                <button onClick={() => handleTabSwitch('study')} className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${tableViewMode === 'study' ? 'border-indigo-600 text-indigo-700 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                    <ListPlus className="w-4 h-4"/> STUDY QUEUE
                    {studyQueue.length > 0 && <span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">{studyQueue.length}</span>}
                </button>
                {tableViewMode === 'study' && studyQueue.length > 0 && (
                    // This button is now correctly positioned relative to the tabs container
                    <button onClick={clearStudyQueue} className="absolute right-2 top-2 p-1.5 bg-red-50 dark:bg-red-900/50 text-red-500 dark:text-red-400 rounded hover:bg-red-100 dark:hover:bg-red-900 transition-colors" title="Clear Queue"><Eraser className="w-4 h-4"/></button>
                )}
            </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden relative z-0">
        
        {/* --- BACKDROP FOR MOBILE SIDEBAR --- */}
        {isMobile && isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-[40] backdrop-blur-sm"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* --- SIDEBAR --- */}
        <div className={`
             border-r border-slate-200 dark:border-slate-700 flex flex-col shadow-lg transition-transform duration-300 ease-in-out bg-white dark:bg-slate-800 overflow-hidden
             ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
             ${isMobile 
                ? `fixed inset-y-0 left-0 w-72 z-[45] pb-20 ${mode === 'table' && mobileTab === 'player' ? 'pt-[160px]' : 'pt-[112px]'}` 
                : 'relative w-72 h-full z-40'}
             ${!isSidebarOpen && !isMobile ? 'md:w-0 md:border-none' : ''}
        `}>
          <div className="flex flex-col h-full overflow-y-auto w-72 overscroll-contain"> 
             <div className="p-4 border-b border-slate-100 dark:border-slate-700 space-y-4 flex-shrink-0">
              
              {/* THEME SELECTOR IN SIDEBAR */}
              <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-100 dark:border-slate-600">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Theme</span>
                  <div className="flex gap-1">
                      <button onClick={() => setTheme('light')} className={`p-1.5 rounded transition-all ${theme === 'light' ? 'bg-white dark:bg-slate-600 text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`} title="Light Mode"><Sun className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setTheme('system')} className={`p-1.5 rounded transition-all ${theme === 'system' ? 'bg-white dark:bg-slate-600 text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`} title="System Mode"><Laptop className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setTheme('dark')} className={`p-1.5 rounded transition-all ${theme === 'dark' ? 'bg-white dark:bg-slate-600 text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`} title="Dark Mode"><Moon className="w-3.5 h-3.5" /></button>
                  </div>
              </div>

              <div className="grid grid-cols-2 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
                <button disabled={isSystemBusy} onClick={() => handleModeSwitch('table')} className={`text-xs font-bold py-1.5 rounded ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''} ${mode === 'table' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>Table</button>
                <button disabled={isSystemBusy} onClick={() => handleModeSwitch('text')} className={`text-xs font-bold py-1.5 rounded ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''} ${mode === 'text' ? 'bg-white dark:bg-slate-600 shadow text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>Text</button>
              </div>

              <div className={`p-3 rounded-lg border ${currentMapCount > 0 ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800' : 'bg-slate-50 dark:bg-slate-700 border-slate-100 dark:border-slate-600'}`}>
                <div className="flex justify-between items-center mb-1">
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Audio Source ({mode})</p>
                  {renderStatusBadge()}
                </div>
                <button onClick={() => currentMapCount > 0 && setPreferLocalAudio(!preferLocalAudio)} disabled={currentMapCount === 0 || isSystemBusy} className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs font-bold transition-all ${currentMapCount === 0 || isSystemBusy ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white dark:hover:bg-slate-600 hover:shadow-sm'}`}>
                  <span className={preferLocalAudio ? "text-indigo-700 dark:text-indigo-300" : "text-slate-500 dark:text-slate-400"}>{preferLocalAudio ? "Source: Local/Generated" : "Source: Browser TTS"}</span>
                  {preferLocalAudio ? <ToggleRight className="w-5 h-5 text-indigo-600 dark:text-indigo-400"/> : <ToggleLeft className="w-5 h-5 text-slate-400"/>}
                </button>
              </div>

              {/* --- NEW: GENERATOR ENGINE SWITCHER --- */}
              <div className="space-y-3 bg-slate-50 dark:bg-slate-700 p-3 rounded-lg border border-slate-100 dark:border-slate-600">
                <div className="flex items-center justify-between">
                     <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1">
                         {generatorEngine === 'gemini' ? <CloudLightning className="w-3 h-3 text-purple-500"/> : <Server className="w-3 h-3 text-teal-500"/>}
                         Generator Engine
                     </p>
                     <div className="flex bg-slate-200 dark:bg-slate-800 rounded p-0.5">
                         <button onClick={() => setGeneratorEngine('gemini')} className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${generatorEngine === 'gemini' ? 'bg-white dark:bg-slate-600 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-slate-500'}`}>Gemini</button>
                         <button onClick={() => setGeneratorEngine('edge')} className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${generatorEngine === 'edge' ? 'bg-white dark:bg-slate-600 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-500'}`}>Edge</button>
                     </div>
                </div>

                {generatorEngine === 'gemini' ? (
                    // GEMINI CONTROLS
                    <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
                        <select className="w-full text-xs p-2 border rounded bg-white dark:bg-slate-800 border-purple-100 dark:border-slate-600 text-purple-700 dark:text-purple-300 font-medium" onChange={e => setAiVoiceName(e.target.value)} value={aiVoiceName}>
                            {aiVoices.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                        </select>
                        <p className="text-[9px] text-slate-400 text-right">Requires API Key</p>
                    </div>
                ) : (
                    // EDGE TTS CONTROLS (Grouped)
                    <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
                        <label className="text-[9px] text-slate-500 font-bold block mb-1">Main Voice (English)</label>
                        <GroupedVoiceSelect 
                            voices={edgeVoices} 
                            selectedValue={edgeVoice} 
                            onChange={e => setEdgeVoice(e.target.value)}
                            className="w-full text-xs p-2 border rounded bg-white dark:bg-slate-800 border-teal-100 dark:border-slate-600 text-teal-700 dark:text-teal-300 font-medium"
                            context="main" // HANYA ENGLISH
                        />
                        
                        <label className="text-[9px] text-slate-500 font-bold block mb-1 mt-2">Meaning Voice (Indonesian)</label>
                        <GroupedVoiceSelect 
                            voices={edgeVoices} 
                            selectedValue={edgeIndonesianVoice} 
                            onChange={e => setEdgeIndonesianVoice(e.target.value)}
                            className="w-full text-xs p-2 border rounded bg-white dark:bg-slate-800 border-teal-100 dark:border-slate-600 text-teal-700 dark:text-teal-300 font-medium"
                            context="meaning" // KHUSUS INDO/REGIONAL
                        />

                        <div className="grid grid-cols-2 gap-2 mt-2">
                             <div>
                                 <label className="text-[9px] text-slate-500 font-bold block mb-1">Rate ({edgeRate > 0 ? '+' : ''}{edgeRate}%)</label>
                                 <input type="range" min="-50" max="50" step="10" value={edgeRate} onChange={e => setEdgeRate(parseInt(e.target.value))} className="w-full h-1 bg-slate-300 dark:bg-slate-600 rounded-lg cursor-pointer accent-teal-600" />
                             </div>
                             <div>
                                 <label className="text-[9px] text-slate-500 font-bold block mb-1">Pitch ({edgePitch > 0 ? '+' : ''}{edgePitch}Hz)</label>
                                 <input type="range" min="-20" max="20" step="5" value={edgePitch} onChange={e => setEdgePitch(parseInt(e.target.value))} className="w-full h-1 bg-slate-300 dark:bg-slate-600 rounded-lg cursor-pointer accent-teal-600" />
                             </div>
                        </div>
                        <p className="text-[9px] text-slate-400 text-right">Local Backend (/api/tts)</p>
                    </div>
                )}
              </div>

              <div className="space-y-2 border-t border-slate-100 dark:border-slate-700 pt-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Browser TTS (Playback)</p>
                {/* Browser Voice Grouped Select */}
                <GroupedVoiceSelect 
                    voices={voices}
                    selectedValue={selectedVoice?.name || ''}
                    onChange={e => setSelectedVoice(voices.find(v => v.name === e.target.value))}
                    className="w-full text-xs p-2 border rounded text-slate-600 dark:text-slate-300 dark:bg-slate-700 dark:border-slate-600"
                    context="main"
                />
                
                {mode === 'table' && (
                  <div className="mt-2">
                       <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Indonesian Voice (Meaning)</p>
                       {indonesianVoices.length > 0 ? (
                           <GroupedVoiceSelect
                                voices={indonesianVoices}
                                selectedValue={selectedIndonesianVoice?.name || ''}
                                onChange={e => setSelectedIndonesianVoice(indonesianVoices.find(v => v.name === e.target.value))}
                                className="w-full text-xs p-2 border rounded text-slate-600 dark:text-slate-300 dark:bg-slate-700 dark:border-slate-600"
                                context="meaning"
                           />
                       ) : (
                           <div className="text-[10px] text-red-400 italic border p-1 rounded bg-red-50 dark:bg-red-900/20">Browser Anda tidak mendukung suara Indonesia.</div>
                       )}
                  </div>
                )}

                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700 p-2 rounded border border-slate-100 dark:border-slate-600 mt-2">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 w-8 text-center">{rate}x</span>
                    <input type="range" min="0.5" max="2" step="0.1" value={rate} onChange={e => setRate(e.target.value)} className="flex-1 h-1 bg-slate-200 dark:bg-slate-600 rounded-lg cursor-pointer accent-indigo-600" />
                </div>
              </div>

              {mode === 'table' && (
                  <div className="space-y-2 border-t border-slate-100 dark:border-slate-700 pt-2">
                     <p className="text-[10px] font-bold text-slate-400 uppercase">Global Play Parts</p>
                     <div className="flex flex-col gap-2">
                        <div className="flex gap-4">
                             <button onClick={() => setPlayWord(!playWord)} className={`flex items-center gap-2 text-xs font-bold ${playWord ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>{playWord ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>} Word</button>
                             <button onClick={() => setPlaySentence(!playSentence)} className={`flex items-center gap-2 text-xs font-bold ${playSentence ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>{playSentence ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>} Sentence</button>
                        </div>
                        <button onClick={() => setPlayMeaning(!playMeaning)} className={`flex items-center gap-2 text-xs font-bold ${playMeaning ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>{playMeaning ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>} Meaning (Indonesian)</button>
                        
                        <div className="mt-2 border-t border-dashed border-slate-200 dark:border-slate-700 pt-2">
                            <button onClick={() => setIsMemoryMode(!isMemoryMode)} className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs font-bold transition-all ${isMemoryMode ? 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-500 border border-yellow-200 dark:border-yellow-800' : 'bg-slate-50 dark:bg-slate-700 text-slate-500 border border-slate-100 dark:border-slate-600 hover:bg-white dark:hover:bg-slate-600'}`}>
                                 <span className="flex items-center gap-2"><Brain className="w-4 h-4"/> Memory Mode</span>
                                 {isMemoryMode ? <ToggleRight className="w-5 h-5 text-yellow-600 dark:text-yellow-500"/> : <ToggleLeft className="w-5 h-5 text-slate-400"/>}
                            </button>
                            
                            {isMemoryMode && (
                                <div className="mt-2 pl-3 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <div className="flex items-center gap-2">
                                        <input type="checkbox" id="hide-word" checked={memorySettings.word} onChange={(e) => setMemorySettings(prev => ({ ...prev, word: e.target.checked }))} className="w-3.5 h-3.5 accent-yellow-600 cursor-pointer"/>
                                        <label htmlFor="hide-word" className="text-[10px] text-slate-600 dark:text-slate-400 font-medium cursor-pointer select-none">Hide Word</label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input type="checkbox" id="hide-sentence" checked={memorySettings.sentence} onChange={(e) => setMemorySettings(prev => ({ ...prev, sentence: e.target.checked }))} className="w-3.5 h-3.5 accent-yellow-600 cursor-pointer"/>
                                        <label htmlFor="hide-sentence" className="text-[10px] text-slate-600 dark:text-slate-400 font-medium cursor-pointer select-none">Hide Sentence</label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input type="checkbox" id="hide-meaning" checked={memorySettings.meaning} onChange={(e) => setMemorySettings(prev => ({ ...prev, meaning: e.target.checked }))} className="w-3.5 h-3.5 accent-yellow-600 cursor-pointer"/>
                                        <label htmlFor="hide-meaning" className="text-[10px] text-slate-600 dark:text-slate-400 font-medium cursor-pointer select-none">Hide Meaning</label>
                                    </div>
                                    <p className="text-[9px] text-yellow-600 dark:text-yellow-500 mt-1 italic leading-tight pt-1 border-t border-yellow-100 dark:border-yellow-900/50">Klik teks untuk intip (4 detik).</p>
                                </div>
                            )}
                        </div>
                     </div>
                  </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {mode === 'table' ? (
                  <>
                    <button disabled={isSystemBusy} onClick={() => csvInputRef.current.click()} className={`flex items-center justify-center gap-1 border border-slate-200 dark:border-slate-700 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-xs dark:text-slate-300 ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}><Upload className="w-3 h-3"/> Import CSV</button>
                    <input type="file" ref={csvInputRef} accept=".csv" className="hidden" onChange={handleCSVUpload} />
                    <button disabled={isSystemBusy} onClick={() => setIsClearDialogOpen(true)} className={`flex items-center justify-center gap-1 border border-red-100 dark:border-red-900/50 text-red-500 p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-xs ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}><Trash2 className="w-3 h-3"/> Clear View</button>
                  </>
                ) : (
                   <>
                       <div className="col-span-2 mb-1">
                          <p className="text-[10px] text-slate-400 italic text-center border dark:border-slate-700 p-1 rounded bg-slate-50 dark:bg-slate-800">Gunakan kotak input di atas daftar untuk menambah item.</p>
                       </div>
                       <button disabled={isSystemBusy} onClick={() => setIsClearDialogOpen(true)} className={`col-span-2 flex items-center justify-center gap-1 border border-red-100 dark:border-red-900/50 text-red-500 p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-xs ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}><Trash2 className="w-3 h-3"/> Clear View</button>
                   </>
                )}
              </div>
            </div>
            
            <div className="flex-1 p-2 relative flex flex-col min-h-[300px] bg-white dark:bg-slate-800">
              <textarea ref={textareaRef} disabled={isSystemBusy} readOnly={isLocked} className={`w-full flex-1 text-xs font-mono p-2 border rounded resize-none focus:outline-indigo-500 transition-colors shadow-inner ${isLocked || isSystemBusy ? 'bg-slate-100 dark:bg-slate-900 text-slate-500' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white'} dark:border-slate-600`} placeholder={mode === 'table' ? "Paste Excel/CSV..." : "Paste text..."} value={mode === 'table' ? tableContent : textContent} onChange={(e) => handleInputContentChange(e.target.value)} />
              <div className="flex justify-end items-center mt-2 px-1 flex-shrink-0 gap-2">
                 <button disabled={isLocked || isSystemBusy} onClick={handleInsertTab} className={`text-[10px] flex items-center gap-1 px-2 py-1 rounded border transition ${isLocked || isSystemBusy ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-700 text-slate-400' : 'bg-white dark:bg-slate-600 hover:bg-slate-50 dark:hover:bg-slate-500 text-slate-600 dark:text-white border-slate-200 dark:border-slate-500'}`} title="Insert Tab Character (Separator)">
                    <ArrowRightToLine className="w-3 h-3" /> Add Tab
                 </button>
                 <button disabled={isSystemBusy} onClick={() => setLockedStates(prev => ({ ...prev, [mode]: !prev[mode] }))} className={`text-[10px] flex items-center gap-1 px-2 py-1 rounded ${isSystemBusy ? 'opacity-50 cursor-not-allowed text-slate-400' : (isLocked ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20' : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700')}`}>
                  {isLocked ? <><Lock className="w-3 h-3"/> Locked</> : <><Unlock className="w-3 h-3"/> Unlocked</>}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* MAIN BODY AREA */}
        <div className={`flex-1 bg-slate-50 dark:bg-slate-900 ${isMobile ? '' : 'overflow-hidden relative flex flex-col'}`}>
            
            {/* 4. TABLE TABS (Desktop Version Only) */}
            {!isMobile && mode === 'table' && (
                <div className="flex border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex-shrink-0 sticky top-[43px] md:static z-30">
                    <button onClick={() => handleTabSwitch('master')} className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${tableViewMode === 'master' ? 'border-indigo-600 text-indigo-700 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}><Database className="w-4 h-4"/> MASTER DATA</button>
                    <button onClick={() => handleTabSwitch('study')} className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${tableViewMode === 'study' ? 'border-indigo-600 text-indigo-700 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                        <ListPlus className="w-4 h-4"/> STUDY QUEUE
                        {studyQueue.length > 0 && <span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">{studyQueue.length}</span>}
                    </button>
                    {tableViewMode === 'study' && studyQueue.length > 0 && (
                        <button onClick={clearStudyQueue} className="absolute right-2 top-2 p-1.5 bg-red-50 dark:bg-red-900/50 text-red-500 dark:text-red-400 rounded hover:bg-red-100 dark:hover:bg-red-900 transition-colors" title="Clear Queue"><Eraser className="w-4 h-4"/></button>
                    )}
                </div>
            )}

            <div className={`absolute inset-0 bg-slate-900 p-4 overflow-auto z-30 pt-28 pb-20 ${mobileTab === 'terminal' ? 'block md:hidden' : 'hidden'}`}>
                {systemLogs.map((log, i) => (
                    <div key={i} className="leading-tight border-b border-slate-800 pb-1 mb-1 font-mono text-[10px]">
                        <span className="text-slate-500 mr-2">[{log.time}]</span> 
                        <span className={`font-bold ${log.type === 'Error' ? 'text-red-400' : log.type === 'Warn' ? 'text-yellow-400' : 'text-blue-400'}`}>{log.type}:</span> 
                        <span className="text-slate-300 ml-1">{log.message}</span>
                    </div>
                ))}
            </div>

            <div className={`absolute inset-0 bg-slate-50 dark:bg-slate-900 z-30 overflow-y-auto pt-28 pb-20 ${mobileTab === 'tools' ? 'block md:hidden' : 'hidden'}`}>
                {renderMobileTools()}
            </div>

            <div className={`${mobileTab === 'player' ? 'block' : 'hidden'} md:block ${isMobile ? '' : 'flex-1 overflow-hidden p-0'}`}>
                 {/* 5. SPACER OTOMATIS */}
                 <div className={`max-w-4xl mx-auto px-2 md:px-4 ${isMobile ? 'h-auto' : 'h-full pt-2 md:pt-4'}`}
                      style={{ 
                          // FIX 1: Increased top padding for Table mode (150px -> 160px) to prevent first item being hidden behind header
                          paddingTop: isMobile ? (mode === 'table' ? '160px' : '120px') : '0' 
                      }}
                 >
                    {renderPlaylist()}
                 </div>
            </div>

        </div>
      </div>

      {/* BOTTOM BAR - FIXED BOTTOM */}
      <div className={`bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 p-2 md:p-4 shadow-2xl z-50 flex-shrink-0 ${isMobile ? 'fixed bottom-0 w-full' : ''}`}>
        <div className="max-w-4xl mx-auto">
           <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 md:hidden">
               <div className="flex flex-col min-w-0 pr-2">
                 <p className="text-[10px] font-bold text-slate-400 tracking-wider">NOW PLAYING</p>
                 <p className="text-sm font-semibold truncate text-slate-800 dark:text-slate-200">
                   {playingIndex >= 0 
                     ? (() => {
                         const item = activePlaybackList.find(p => p.id === playingIndex);
                         const seqIdx = activePlaybackList.indexOf(item);
                         if (!item) return "Ready";
                         return `${seqIdx + 1}. ${item.word} (${seqIdx + 1}/${activePlaybackList.length})`;
                       })()
                     : "Ready"}
                 </p>
               </div>
               <div className="flex items-center gap-2">
                  <button onClick={() => handleSmartNav('prev')} className="p-2 text-slate-500 hover:text-indigo-600 bg-slate-100 dark:bg-slate-700 dark:text-slate-300 rounded-full active:scale-95 transition-colors"><SkipBack className="w-5 h-5 fill-current"/></button>
                  <button onClick={handleGlobalPlay} className={`p-3 rounded-full shadow-lg transform transition active:scale-95 flex items-center justify-center ${isPlaying ? 'bg-red-50 dark:bg-red-900 text-red-500 border-2 border-red-100 dark:border-red-800' : 'bg-indigo-600 text-white'}`}>
                    {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
                  </button>
                  <button onClick={() => handleSmartNav('next')} className="p-2 text-slate-500 hover:text-indigo-600 bg-slate-100 dark:bg-slate-700 dark:text-slate-300 rounded-full active:scale-95 transition-colors"><SkipForward className="w-5 h-5 fill-current"/></button>
               </div>
               <div className="flex justify-end gap-2">
                  <button onClick={cyclePlaybackMode} className="flex flex-col items-center justify-center gap-1 min-w-[50px] p-1 rounded hover:bg-slate-50 dark:hover:bg-slate-700">
                      {playbackMode === 'once' && <span className="text-xs font-mono border border-slate-500 rounded px-1 text-slate-600 dark:text-slate-400">1</span>}
                      {playbackMode === 'sequence' && <List className="w-5 h-5 text-indigo-600 dark:text-indigo-400"/>}
                      {playbackMode === 'repeat_2x' && <span className="text-xs font-bold text-purple-600 dark:text-purple-400">2x</span>}
                      {playbackMode === 'loop_one' && <Repeat1 className="w-5 h-5 text-orange-500"/>}
                      {playbackMode === 'random' && <Shuffle className="w-5 h-5 text-blue-500"/>}
                      <span className="text-[9px] text-slate-400 font-bold uppercase truncate max-w-full">{playbackMode === 'once' ? 'Once' : playbackMode === 'sequence' ? 'Next' : playbackMode === 'repeat_2x' ? '2x' : playbackMode === 'loop_one' ? 'Loop' : 'Rand'}</span>
                  </button>
                  
                  {/* NEW SIDEBAR TOGGLE BUTTON - FIXED TOGGLE & PRESS STATE */}
                  <button 
                      onClick={() => {
                          if (isSidebarOpen) {
                              setIsSidebarOpen(false);
                          } else {
                              setShowAppBar(true); 
                              setTimeout(() => setIsSidebarOpen(true), 10);
                          }
                      }} 
                      className={`flex flex-col items-center justify-center gap-1 min-w-[40px] p-1 rounded transition-all active:scale-95 ${isSidebarOpen ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300' : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 active:bg-slate-100'}`}
                  >
                      {isSidebarOpen ? <PanelLeftClose className="w-5 h-5"/> : <PanelLeftOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400"/>}
                      <span className="text-[9px] font-bold uppercase">{isSidebarOpen ? "Close" : "Menu"}</span>
                  </button>
               </div>
           </div>

           <div className="hidden md:flex items-center justify-between gap-4">
               <div className="w-64 flex flex-col">
                 <div className="flex items-center gap-2 mb-1">
                   <span className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'}`}></span>
                   <p className="text-[10px] font-bold text-slate-400 tracking-wider">GLOBAL PLAYER ({playingContext ? playingContext.toUpperCase() : 'IDLE'})</p>
                 </div>
                 <p className="text-sm font-semibold truncate text-slate-800 dark:text-white">
                   {playingIndex >= 0 
                     ? (() => {
                         const item = activePlaybackList.find(p => p.id === playingIndex);
                         const seqIdx = activePlaybackList.indexOf(item);
                         if (!item) return "Ready";
                         return `${seqIdx + 1}. ${item.word || (item.text ? item.text.substring(0, 15)+'...' : 'Item')} (${seqIdx + 1}/${activePlaybackList.length} Items)`;
                       })()
                     : "Ready"}
                 </p>
               </div>

               <div className="flex items-center gap-4">
                    <button onClick={() => handleSmartNav('prev')} className="p-3 text-slate-500 hover:text-indigo-600 bg-slate-100 dark:bg-slate-700 dark:text-slate-300 rounded-full transition active:scale-95"><SkipBack className="w-6 h-6 fill-current"/></button>
                    <button onClick={handleGlobalPlay} className={`p-4 rounded-full shadow-lg transform transition active:scale-95 flex items-center justify-center ${isPlaying ? 'bg-red-50 dark:bg-red-900 text-red-500 border-2 border-red-100 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-800' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                      {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
                    </button>
                    <button onClick={() => handleSmartNav('next')} className="p-3 text-slate-500 hover:text-indigo-600 bg-slate-100 dark:bg-slate-700 dark:text-slate-300 rounded-full transition active:scale-95"><SkipForward className="w-6 h-6 fill-current"/></button>
               </div>

               <div className="w-64 flex flex-col items-end gap-1">
                 <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
                    <select className="bg-transparent text-xs font-bold text-slate-600 dark:text-slate-300 outline-none p-1 cursor-pointer dark:bg-slate-700" value={playbackMode} onChange={(e) => setPlaybackMode(e.target.value)}>
                      <option value="once">Putar Sekali</option>
                      <option value="sequence">Lanjut Otomatis</option>
                      <option value="repeat_2x">Ulangi 2x & Lanjut</option>
                      <option value="loop_one">Loop 1 Item</option>
                      <option value="random">Acak</option>
                    </select>
                    <div className="px-2 text-slate-400">
                      {playbackMode === 'sequence' && <List className="w-4 h-4"/>}
                      {playbackMode === 'once' && <span className="text-xs font-mono border border-slate-400 rounded px-1">1</span>}
                      {playbackMode === 'repeat_2x' && <span className="text-xs font-bold">2x</span>}
                      {playbackMode === 'loop_one' && <Repeat1 className="w-4 h-4"/>}
                      {playbackMode === 'random' && <Shuffle className="w-4 h-4"/>}
                    </div>
                 </div>
               </div>
           </div>
        </div>
      </div>
      {isClearDialogOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white text-center mb-4">Bersihkan Tampilan?</h3>
            <div className="flex gap-3 w-full">
                <button onClick={() => setIsClearDialogOpen(false)} className="flex-1 py-2 rounded border dark:border-slate-600 dark:text-slate-300">Batal</button>
                <button onClick={() => { if(mode === 'table') {setTableContent(''); setLocalAudioMapTable({}); setAudioStatusTable('idle');} else {setTextContent(''); setLocalAudioMapText({}); setAudioStatusText('idle');} setLockedStates(p => ({...p, [mode]: false})); setIsClearDialogOpen(false); resetFullState(); }} className="flex-1 py-2 rounded bg-indigo-600 text-white">Ya</button>
            </div>
          </div>
        </div>
      )}

      {isDeleteDialogOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white text-center mb-4">Hapus Deck?</h3>
            <div className="flex gap-3 w-full">
                <button onClick={() => setIsDeleteDialogOpen(false)} className="flex-1 py-2 rounded border dark:border-slate-600 dark:text-slate-300">Batal</button>
                <button onClick={confirmDeleteDeck} className="flex-1 py-2 rounded bg-red-500 text-white">Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- APP WRAPPER (Theme & View Logic) ---
const App = () => {
    // State Views: 'landing' | 'app'
    const [view, setView] = useState('landing'); 
    
    // Theme State: 'light' | 'dark' | 'system'
    const [theme, setTheme] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('theme') || 'system';
        }
        return 'system';
    });

    // --- REVISED THEME LOGIC: Handles Real-time System Changes ---
    useEffect(() => {
        const root = window.document.documentElement;
        
        // Function to apply the correct class
        const applyTheme = (targetTheme) => {
            root.classList.remove('light', 'dark');
            if (targetTheme === 'system') {
                const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                root.classList.add(systemIsDark ? 'dark' : 'light');
            } else {
                root.classList.add(targetTheme);
            }
        };

        // 1. Apply immediately
        applyTheme(theme);
        
        // 2. Save preference
        localStorage.setItem('theme', theme);

        // 3. Listen for system changes IF theme is 'system'
        if (theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            
            const handleSystemChange = (e) => {
                root.classList.remove('light', 'dark');
                root.classList.add(e.matches ? 'dark' : 'light');
            };

            // Modern event listener
            if (mediaQuery.addEventListener) {
                mediaQuery.addEventListener('change', handleSystemChange);
            } else {
                // Deprecated fallback
                mediaQuery.addListener(handleSystemChange);
            }

            // Cleanup listener
            return () => {
                if (mediaQuery.removeEventListener) {
                    mediaQuery.removeEventListener('change', handleSystemChange);
                } else {
                    mediaQuery.removeListener(handleSystemChange);
                }
            };
        }
    }, [theme]);

    return (
        <div className="antialiased transition-colors duration-300">
            {view === 'landing' ? (
                <LandingPage 
                    onStart={() => setView('app')} 
                    theme={theme}
                    setTheme={setTheme}
                />
            ) : (
                <MainApp goHome={() => setView('landing')} theme={theme} setTheme={setTheme} />
            )}
        </div>
    );
};

export default App;