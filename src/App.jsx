/* eslint-disable no-control-regex */
import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, RotateCcw, Volume2, Settings, Trash2, List, Mic, Globe, 
  CheckCircle, Save, Upload, Table, SkipBack, SkipForward, X, 
  Wand2, Download, Loader2, FolderOpen, Database, Shuffle, Repeat, Repeat1, FileText,
  ToggleLeft, ToggleRight, AlertCircle, PanelLeftClose, PanelLeftOpen, Lock, Unlock,
  Hash, Music, Bot, AlertTriangle, Terminal, XCircle, ChevronDown, Layers, Smartphone,
  Monitor, Cpu, CheckSquare, Square, ChevronRight, MoreHorizontal, ArrowRightToLine,
  Languages, Eye, EyeOff, Brain, BookOpen
} from 'lucide-react';

// --- SYSTEM ENVIRONMENT VAR ---
// Di Cloud (Vercel), ini akan diisi oleh Environment Variable. 
// Di Local/Browser Editor, ini kosong, jadi akan fallback ke Input User.
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || ""; 

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
  let name = voice.name;
  name = name.replace(/^Microsoft /i, '').replace(/^Google /i, '').replace(/^Android /i, '');
  name = name.replace(/ - English \(.+\)/i, '').replace(/ English \(.+\)/i, '');
  name = name.replace(/ - Indonesian \(.+\)/i, '').replace(/ Indonesian \(.+\)/i, '');
  let region = "??";
  if (voice.lang.includes("US")) region = "US";
  else if (voice.lang.includes("GB") || voice.lang.includes("UK")) region = "UK";
  else if (voice.lang.includes("ID") || voice.lang.toLowerCase().includes("indones")) region = "ID";
  else if (voice.lang.includes("AU")) region = "AU";
  else if (voice.lang.includes("IN")) region = "IN";
  return `${name} [${region}]`;
};

// --- HELPER: Highlight Word in Text ---
const HighlightedText = ({ text, highlight, className = "" }) => {
  if (!highlight || !text) return <span className={className}>{text}</span>;
  
  // Escape regex special characters from highlight word
  const safeHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Split text based on highlight word (case insensitive)
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

// --- MAIN COMPONENT ---
const App = () => {
  // --- STATE ---
  const [mode, setMode] = useState('table'); 
  
  // Data
  const [tableContent, setTableContent] = useState("");
  const [textContent, setTextContent] = useState("");
  const [playlist, setPlaylist] = useState([]);
  
  // Saved Indices for State Persistence
  const [savedIndices, setSavedIndices] = useState({ table: -1, text: -1 });

  // Decks
  const [savedDecks, setSavedDecks] = useState({});
  const [selectedDeckId, setSelectedDeckId] = useState(""); 
  const [currentDeckName, setCurrentDeckName] = useState("Untitled Sheet");

  // Playback Settings
  const [voices, setVoices] = useState([]); // English Voices
  const [indonesianVoices, setIndonesianVoices] = useState([]); // ID Voices
  
  const [selectedVoice, setSelectedVoice] = useState(null); // Selected English
  const [selectedIndonesianVoice, setSelectedIndonesianVoice] = useState(null); // Selected ID
  
  const [rate, setRate] = useState(1);
  const [pitch] = useState(1);
  
  // Parts to Play
  const [playWord, setPlayWord] = useState(true);
  const [playSentence, setPlaySentence] = useState(true);
  const [playMeaning, setPlayMeaning] = useState(false); // Default OFF
  
  const [preferLocalAudio, setPreferLocalAudio] = useState(true);
  
  // Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [speakingPart, setSpeakingPart] = useState(null); 
  const [playbackMode, setPlaybackMode] = useState('once'); 
  const [independentPlayingId, setIndependentPlayingId] = useState(null); 

  // UI State
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [lockedStates, setLockedStates] = useState({ table: false, text: false });
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); 
  const [showLogs, setShowLogs] = useState(false); 
  
  // V4.7 UI States
  const [mobileTab, setMobileTab] = useState('player'); 
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [batchConfig, setBatchConfig] = useState({ start: 1, end: 10, doWord: true, doSentence: true });
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);
  const [batchStatusText, setBatchStatusText] = useState(""); 
  const [isBatchStopping, setIsBatchStopping] = useState(false); 

  // V4.19 Memory Mode State
  const [isMemoryMode, setIsMemoryMode] = useState(false);
  const [revealedCells, setRevealedCells] = useState({}); // { 'rowId-type': timeoutId }
  const [memorySettings, setMemorySettings] = useState({ word: true, sentence: true, meaning: true }); 

  const isLocked = lockedStates[mode];

  // AI & Logs
  const [userApiKey, setUserApiKey] = useState("");
  const [aiVoiceName, setAiVoiceName] = useState("Kore");
  const [aiLoadingId, setAiLoadingId] = useState(null);
  const [systemLogs, setSystemLogs] = useState([]); 

  // Local Audio Maps
  const [localAudioMapTable, setLocalAudioMapTable] = useState({}); 
  const [localAudioMapText, setLocalAudioMapText] = useState({});
  const [audioStatusTable, setAudioStatusTable] = useState('idle');
  const [audioStatusText, setAudioStatusText] = useState('idle');

  // SYSTEM BUSY LOCK (New v4.13)
  const isSystemBusy = isBatchDownloading || aiLoadingId !== null;

  // Refs
  const stopSignalRef = useRef(false);
  const batchStopSignalRef = useRef(false); 
  const currentAudioObjRef = useRef(null); 
  const playbackModeRef = useRef(playbackMode); 
  const synth = window.speechSynthesis;
  const folderInputRef = useRef(null);
  const csvInputRef = useRef(null);
  const logContainerRef = useRef(null);
  const debugButtonRef = useRef(null);
  const debugPanelRef = useRef(null);
  const batchPanelRef = useRef(null);
  const batchButtonRef = useRef(null);
  const textareaRef = useRef(null); 

  const aiVoices = [
    { id: "Kore", label: "Kore (F)", gender: "Female" },
    { id: "Zephyr", label: "Zephyr (F)", gender: "Female" },
    { id: "Puck", label: "Puck (M)", gender: "Male" },
    { id: "Fenrir", label: "Fenrir (M)", gender: "Male" },
    { id: "Charon", label: "Charon (M)", gender: "Male" }
  ];

  // --- INITIALIZATION ---
  
  // 1. AUTO RESIZE LISTENER
  useEffect(() => {
      const handleResize = () => {
          const width = window.innerWidth;
          if (width >= 768) {
              setIsSidebarOpen(true);
          } else {
              setIsSidebarOpen(false);
          }
      };
      handleResize();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    playbackModeRef.current = playbackMode;
  }, [playbackMode]);

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

    addLog("System", "Ready. ProLingo v4.24 Initialized.");

    return () => forceStopAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
      if (currentIndex >= 0) {
          setTimeout(() => {
              const el = document.getElementById(`row-${currentIndex}`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 100);
      }
  }, [currentIndex, mode]);

  useEffect(() => {
    if (logContainerRef.current) {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [systemLogs, showLogs, mobileTab]);

  useEffect(() => {
    const loadVoices = () => {
      const allVoices = synth.getVoices();
      
      let engVoices = allVoices.filter(v => v.lang.includes('en'));
      engVoices.sort((a, b) => {
          const aUK = a.lang.includes('GB') || a.lang.includes('UK');
          const bUK = b.lang.includes('GB') || b.lang.includes('UK');
          if (aUK && !bUK) return -1;
          if (!aUK && bUK) return 1;
          return 0;
      });
      setVoices(engVoices);
      const defaultEng = engVoices.find(v => v.lang.includes('GB') && (v.name.includes('Female') || v.name.includes('Google'))) || engVoices[0];
      if (defaultEng) setSelectedVoice(defaultEng);

      let idVoices = allVoices.filter(v => v.lang.includes('ID') || v.lang.includes('id') || v.lang.toLowerCase().includes('indones'));
      setIndonesianVoices(idVoices);
      const defaultId = idVoices.find(v => v.name.includes('Google') || v.name.includes('Indonesia')) || idVoices[0];
      if (defaultId) setSelectedIndonesianVoice(defaultId);
    };
    
    loadVoices();
    if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = loadVoices;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addLog = (type, message) => {
      const timestamp = new Date().toLocaleTimeString();
      setSystemLogs(prev => [...prev, { time: timestamp, type, message }]);
  };

  // --- SMART PARSING LOGIC (PRIORITY 4) ---
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

          // SMART COLUMN MAPPING
          let word = "", sentence = "", meaning = "", partOfSpeech = "", meaningWord = "";
          
          // DETECT FORMAT:
          // Format 1 (Standard): NO | WORD | SENTENCE | MEANING (SENTENCE)
          // Format 2 (Master):   NO | WORD | POS | MEANING (WORD) | SENTENCE | MEANING (SENTENCE)
          
          if (cols.length >= 6) {
              // MASTER FORMAT
              word = cols[1] || "";
              partOfSpeech = cols[2] || "";
              meaningWord = cols[3] || "";
              sentence = cols[4] || "";
              meaning = cols[5] || "";
          } else {
              // STANDARD FORMAT (Fallback for 4 columns)
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

  // --- HELPERS ---
  const resetFullState = () => {
    setLocalAudioMapTable({});
    setLocalAudioMapText({});
    setAudioStatusTable('idle');
    setAudioStatusText('idle');
    setCurrentIndex(-1); 
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

  // --- MEMORY MODE LOGIC ---
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
         playTTS(text, selectedIndonesianVoice).then(resolve);
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
        
        audio.onended = () => { currentAudioObjRef.current = null; resolve(); };
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
      const targetVoice = overrideVoice || selectedVoice;
      
      if (stopSignalRef.current || !targetVoice) { resolve(); return; }
      
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = targetVoice;
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve(); 
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
    if (independentPlayingId === uiId) {
        forceStopAll();
        return;
    }

    safePlayTransition(async () => {
      setIndependentPlayingId(uiId);
      
      let textToPlay = item.text;
      if (part === 'word') textToPlay = item.word;
      else if (part === 'sentence') textToPlay = item.sentence;
      else if (part === 'meaning') textToPlay = item.meaning;

      setCurrentIndex(item.id); 
      setSpeakingPart(part); 
      
      await playSource(textToPlay, item, part);
      
      setIndependentPlayingId(null);
      setSpeakingPart(null); 
    });
  };

  const handleGlobalPlay = () => {
    if (isPlaying) {
      forceStopAll();
    } else {
      const start = currentIndex >= 0 ? currentIndex : 0;
      startGlobalPlayback(start);
    }
  };

  const startGlobalPlayback = (startIndex) => {
    safePlayTransition(async () => {
      setIsPlaying(true);
      let index = startIndex;
      
      addLog("Info", `Global Play from #${playlist[index]?.displayId || 0}`);

      while (index >= 0 && index < playlist.length && !stopSignalRef.current) {
        setCurrentIndex(index);
        const item = playlist[index];

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
        else if (liveMode === 'random') index = Math.floor(Math.random() * playlist.length);
        else if (liveMode === 'loop_one') { 
          // Do nothing, keep same index
        }
        else { index++; }
      }
      setIsPlaying(false);
      setSpeakingPart(null);
      addLog("Info", "Global Playback Finished.");
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

    setIsPlaying(false);
    setSpeakingPart(null);
    setIndependentPlayingId(null);
  };

  const handleSmartNav = (direction) => {
    safePlayTransition(async () => {
      let nextIndex = 0;
      if (direction === 'next') nextIndex = currentIndex + 1 < playlist.length ? currentIndex + 1 : 0;
      else nextIndex = currentIndex - 1 >= 0 ? currentIndex - 1 : 0;
      setCurrentIndex(nextIndex);
      startGlobalPlayback(nextIndex);
    });
  };

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

      const currentIdx = currentIndex;
      setSavedIndices(prev => ({
          ...prev,
          [mode]: currentIdx
      }));

      setMode(targetMode);

      const targetIndex = savedIndices[targetMode];
      setCurrentIndex(targetIndex);
      
      addLog("System", `Switched to ${targetMode}. Restored index: ${targetIndex}`);
  };

  // --- DATA MANAGEMENT ---
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
          setMode('table'); 
          resetFullState(); 
          
          addLog("Success", `Deck "${deckName}" loaded. State reset.`);
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

  // --- AI GENERATION ---
  const generateAIAudio = async (item, part = 'full') => {
    const uniqueLoadingId = `${item.id}-${part}`;
    setAiLoadingId(uniqueLoadingId);
    
    let textToSpeak = "";
    let filename = "";
    
    if (mode === 'table') {
        const safeWord = sanitizeFilename(item.word);
        if (part === 'word') {
            textToSpeak = item.word;
            filename = `${item.displayId}_${safeWord}_word.wav`;
        } else {
            textToSpeak = item.sentence;
            filename = `${item.displayId}_${safeWord}_sentence.wav`;
        }
    } else {
        textToSpeak = item.text;
        filename = `${item.displayId}_text.wav`;
    }

    addLog("Info", `Generating #${item.displayId}...`);
    
    // FIX POINT 1: Use userApiKey if apiKey is empty (Local dev fallback)
    const keyToUse = apiKey || userApiKey; 

    try {
      if (!keyToUse) throw new Error("API Key Missing! Masukkan key di menu Tools.");

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${keyToUse}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: textToSpeak }] }],
          generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: aiVoiceName } } } }
        })
      });

      if (!response.ok) throw new Error(`API Error ${response.status}`);

      const data = await response.json();
      if (data.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
        const base64Audio = data.candidates[0].content.parts[0].inlineData.data;
        const url = URL.createObjectURL(new Blob([encodeWAV(base64ToInt16Array(base64Audio))], { type: 'audio/wav' }));
        
        if (mode === 'table') setLocalAudioMapTable(prev => ({ ...prev, [`${item.displayId}_${part}`]: url }));
        else setLocalAudioMapText(prev => ({ ...prev, [`${item.displayId}`]: url }));

        triggerBrowserDownload(url, filename);
        addLog("Success", `Saved: ${filename}`);
      } else {
        addLog("Warn", `Gagal (Safety/Refusal): ${textToSpeak.substring(0,20)}...`);
        alert(`Gagal: AI menolak teks ini (Safety/Model Issue).\nCoba ganti kata atau gunakan Voice lain.`);
        return; 
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

  // BATCH
  const runBatchDownload = async () => {
    // STOPPING LOGIC
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

    // FIX POINT 1: Use userApiKey fallback here too
    const keyToUse = apiKey || userApiKey; 

    if (!keyToUse) {
        alert("API Key Kosong! Masukkan key di menu Tools.");
        return;
    }

    const targets = playlist.filter(p => p.displayId >= startIdx && p.displayId <= endIdx);
    
    if (targets.length === 0) {
        alert("Tidak ada item dalam range tersebut.");
        return;
    }

    setIsBatchDownloading(true);
    addLog("Info", `Starting BATCH DL (${targets.length} items)...`);

    for (const item of targets) {
        if (batchStopSignalRef.current) {
            addLog("Batch", "Batch Stopped by User.");
            break;
        }
        
        if (mode === 'table') {
            if (batchConfig.doWord) { 
                setBatchStatusText(`${item.displayId} Word`); 
                await generateAndDownloadSingle(item, 'word', keyToUse); 
                await new Promise(r => setTimeout(r, 1000)); 
            }
            if (batchStopSignalRef.current) break; 
            if (batchConfig.doSentence) { 
                setBatchStatusText(`${item.displayId} Sent`); 
                await generateAndDownloadSingle(item, 'sentence', keyToUse); 
                await new Promise(r => setTimeout(r, 1000)); 
            }
        } else {
             setBatchStatusText(`${item.displayId} Full`); 
             await generateAndDownloadSingle(item, 'full', keyToUse); 
             await new Promise(r => setTimeout(r, 1000));
        }
    }

    setIsBatchDownloading(false);
    setBatchStatusText(""); 
    setIsBatchStopping(false);

    if (batchStopSignalRef.current) {
         // Optionally alert stopped
    } else {
         addLog("Success", "Batch Download Completed.");
         alert("Batch Download Selesai.");
    }
    batchStopSignalRef.current = false;
  };

  const generateAndDownloadSingle = async (item, part, validKey) => {
    let textToSpeak = "";
    let filename = "";

    if (mode === 'table') {
        const safeWord = sanitizeFilename(item.word);
        if (part === 'word') { textToSpeak = item.word; filename = `${item.displayId}_${safeWord}_word.wav`; } 
        else { textToSpeak = item.sentence; filename = `${item.displayId}_${safeWord}_sentence.wav`; }
    } else {
        textToSpeak = item.text; filename = `${item.displayId}_text.wav`;
    }

    addLog("Batch", `Proc #${item.displayId} (${part})...`);

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${validKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
            contents: [{ parts: [{ text: textToSpeak }] }],
            generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: aiVoiceName } } } }
            })
        });

        if (!response.ok) throw new Error(`API ${response.status}`);

        const data = await response.json();
        if (data.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
            const base64Audio = data.candidates[0].content.parts[0].inlineData.data;
            const blob = new Blob([encodeWAV(base64ToInt16Array(base64Audio))], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);
            triggerBrowserDownload(url, filename);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } else {
            addLog("Warn", `Batch #${item.displayId}: Skipped (Safety/Refusal)`);
            return;
        }
    } catch (e) {
        if (e.message.includes('401') || e.message.includes('403')) {
             addLog("Warn", `Batch #${item.displayId}: Error 401 (Voice '${aiVoiceName}' issue)`);
        } else {
             addLog("Error", `Batch #${item.displayId}: ${e.message}`);
        }
    }
  };

  // --- FILES ---
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
      
      addLog("Info", `CSV Imported: ${fileName}. State reset.`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleFolderSelect = (e) => {
    const files = e.target.files;
    if (!files) return;
    let count = 0;
    if (mode === 'table') {
        const newMap = { ...localAudioMapTable };
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
                   if (type) { newMap[`${id}_${type}`] = URL.createObjectURL(file); count++; }
                }
            }
        }
        setLocalAudioMapTable(newMap);
        setAudioStatusTable(count > 0 ? 'success' : 'empty');
        alert(`[Table] Loaded ${count} files.`);
    } else {
        const newMap = { ...localAudioMapText };
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
        alert(`[Text] Loaded ${count} files.`);
    }
  };

  // Status Helpers
  const currentAudioStatus = mode === 'table' ? audioStatusTable : audioStatusText;
  const currentMapCount = mode === 'table' ? Object.keys(localAudioMapTable).length : Object.keys(localAudioMapText).length;

  const renderStatusBadge = () => {
      if (currentAudioStatus === 'idle' && currentMapCount === 0) return <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded">Belum Load</span>;
      if (currentMapCount > 0) return <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold flex items-center gap-1"><CheckCircle className="w-3 h-3"/> {currentMapCount} File Aktif</span>;
      return <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded font-bold flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> 0 File</span>;
  };

  // --- RENDER HELPERS ---
  const renderBatchPopup = () => (
     <div 
        ref={batchPanelRef} 
        className="absolute top-full right-0 mt-2 w-64 bg-white border border-slate-200 shadow-2xl rounded-xl z-[100] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
     >
        <div className="bg-slate-800 text-white p-2 text-xs font-bold flex justify-between">
            <span>Batch Download ({mode})</span>
            <button onClick={() => setIsBatchOpen(false)}><X className="w-3 h-3"/></button>
        </div>
        <div className="p-3 space-y-3">
             {mode === 'table' ? (
                 <div className="flex gap-2 text-xs">
                     <div className="flex items-center gap-1">
                         <button disabled={isBatchDownloading} onClick={() => setBatchConfig(p=>({...p, doWord: !p.doWord}))} className={`${batchConfig.doWord ? 'text-indigo-600' : 'text-slate-400'} ${isBatchDownloading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                             {batchConfig.doWord ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>}
                         </button>
                         <span>Words</span>
                     </div>
                     <div className="flex items-center gap-1">
                         <button disabled={isBatchDownloading} onClick={() => setBatchConfig(p=>({...p, doSentence: !p.doSentence}))} className={`${batchConfig.doSentence ? 'text-indigo-600' : 'text-slate-400'} ${isBatchDownloading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                             {batchConfig.doSentence ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>}
                         </button>
                         <span>Sentences</span>
                     </div>
                 </div>
             ) : (
                 <div className="text-xs text-slate-400 italic">Batch download for full text.</div>
             )}
             
             <div className="flex gap-2 items-center text-xs">
                 <span className="text-slate-500">Range:</span>
                 <input 
                    type="number" 
                    className="w-12 border rounded p-1" 
                    value={batchConfig.start} 
                    onChange={e=>setBatchConfig(p=>({...p, start:e.target.value}))}
                    onBlur={() => handleBatchRangeBlur('start')} 
                    disabled={isBatchDownloading}
                 />
                 <span>-</span>
                 <input 
                    type="number" 
                    className="w-12 border rounded p-1" 
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
        </div>
     </div>
  );

  // --- UI COMPONENTS ---
  const DownloadCloudIcon = ({className}) => <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path><path d="M12 12v9"></path><path d="m8 17 4 4 4-4"></path></svg>;

  const renderPlaylist = () => (
      <div className="space-y-3 pb-32">
             {playlist.length === 0 && (
               <div className="text-center text-slate-400 mt-20">
                 <Table className="w-16 h-16 mx-auto mb-4 opacity-20"/>
                 <p>Belum ada data di mode {mode}.</p>
               </div>
             )}

             {playlist.map((item, idx) => {
               if (mode === 'table' && item.isStructured) {
                   const localWordUrl = localAudioMapTable[`${item.displayId}_word`];
                   const localSentUrl = localAudioMapTable[`${item.displayId}_sentence`];
                   const isWordUsingLocal = localWordUrl && preferLocalAudio;

                   const wordFilename = `${item.displayId}_${sanitizeFilename(item.word)}_word.wav`;
                   const sentFilename = `${item.displayId}_${sanitizeFilename(item.word)}_sentence.wav`;
                   
                   const isActive = (currentIndex === idx) && (isPlaying || independentPlayingId !== null);
                   const isWordActive = isActive && speakingPart === 'word';
                   const isSentActive = isActive && speakingPart === 'sentence';
                   const isMeaningActive = isActive && speakingPart === 'meaning';

                   // --- MEMORY MODE LOGIC ---
                   const rowId = `row-${idx}`;
                   const wordRevealed = revealedCells[`${rowId}-word`];
                   const sentRevealed = revealedCells[`${rowId}-sent`];
                   const meaningRevealed = revealedCells[`${rowId}-meaning`];

                   const blurClass = "filter blur-sm bg-slate-100 select-none cursor-pointer transition-all duration-300";
                   const revealedClass = "filter-none bg-yellow-50 cursor-pointer transition-all duration-300";

                   const isWordHidden = isMemoryMode && memorySettings.word;
                   const isSentHidden = isMemoryMode && memorySettings.sentence;
                   const isMeaningHidden = isMemoryMode && memorySettings.meaning;

                   return (
                     <div key={idx} id={rowId} onClick={() => startGlobalPlayback(idx)} className={`rounded-xl border p-3 md:p-4 transition-all hover:shadow-md cursor-pointer ${isActive ? 'bg-blue-600 border-blue-700 shadow-md ring-1 ring-blue-500' : 'bg-white border-slate-200'}`}>
                       <div className="flex flex-col md:flex-row justify-between items-start gap-2 md:gap-4">
                         <div className="flex-1 w-full">
                            {/* WORD ROW */}
                            <div className="flex items-center gap-3 mb-2 h-8"> 
                              <div className="w-8 flex flex-col items-center"><span className={`text-xs font-mono font-bold ${isActive ? 'text-blue-200' : 'text-slate-400'}`}>#{item.displayId}</span></div>
                              <button onClick={(e) => { e.stopPropagation(); handleIndependentPlay(item, 'word', `row-${idx}-word`); }} className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full border transition-colors ${independentPlayingId === `row-${idx}-word` ? 'bg-red-50 text-red-500' : (isActive ? 'bg-blue-500 border-blue-400 text-white hover:bg-blue-400' : 'bg-slate-50 text-slate-500 hover:text-indigo-600')}`}>
                                 {independentPlayingId === `row-${idx}-word` ? <X className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                              </button>
                              
                              {/* WORD CONTENT */}
                              <div 
                                className={`flex-1 flex items-center gap-2 ${isWordHidden ? (wordRevealed ? revealedClass : blurClass) : ''}`}
                                onClick={(e) => isWordHidden && toggleCellReveal(e, `${rowId}-word`)}
                              >
                                  <h3 className={`text-lg leading-none ${isWordActive ? 'font-bold text-white' : (isActive ? 'text-blue-100 font-normal' : 'text-slate-800 font-normal')}`}>
                                      {item.word}
                                  </h3>
                                  
                                  {/* DISPLAY POS IF AVAILABLE */}
                                  {item.partOfSpeech && (
                                      <span className={`text-[10px] italic border px-1 rounded ${isActive ? 'text-blue-200 border-blue-400' : 'text-slate-400 border-slate-200'}`}>
                                          {item.partOfSpeech}
                                      </span>
                                  )}

                                  {/* DISPLAY MEANING WORD IF AVAILABLE */}
                                  {item.meaningWord && (
                                      <span className={`text-[10px] border px-1 rounded ${isActive ? 'text-blue-200 border-blue-400' : 'text-slate-500 border-slate-200 bg-slate-50'}`}>
                                          {item.meaningWord}
                                      </span>
                                  )}
                              </div>

                              {isWordUsingLocal ? <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold flex items-center gap-1"><Hash className="w-3 h-3" /> OK</span> : <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${isActive ? 'bg-blue-700 text-blue-200' : 'bg-slate-100 text-slate-400'}`}>TTS</span>}
                            </div>
                            
                            {/* SENTENCE ROW */}
                            <div className="flex gap-3 items-start pl-11">
                               <button onClick={(e) => { e.stopPropagation(); handleIndependentPlay(item, 'sentence', `row-${idx}-sent`); }} className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full border transition-colors mt-0.5 ${independentPlayingId === `row-${idx}-sent` ? 'bg-red-50 text-red-500' : (isActive ? 'bg-blue-500 border-blue-400 text-white hover:bg-blue-400' : 'bg-slate-50 text-slate-500 hover:text-indigo-600')}`}>
                                 {independentPlayingId === `row-${idx}-sent` ? <X className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                              </button>
                              <div className="flex-1">
                                {/* SENTENCE CONTENT */}
                                <div 
                                    className={`${isSentHidden ? (sentRevealed ? revealedClass : blurClass) : ''}`}
                                    onClick={(e) => isSentHidden && toggleCellReveal(e, `${rowId}-sent`)}
                                >
                                    <p className={`text-sm leading-relaxed ${isSentActive ? 'font-bold text-white' : (isActive ? 'text-blue-50 font-medium' : 'text-slate-600')}`}>
                                        "<HighlightedText text={item.sentence} highlight={item.word} />"
                                    </p>
                                </div>
                                
                                {/* MEANING ROW */}
                                {item.meaning && (
                                    <div className="flex items-center gap-2 mt-1">
                                         <button onClick={(e) => { e.stopPropagation(); handleIndependentPlay(item, 'meaning', `row-${idx}-meaning`); }} className={`flex-shrink-0 w-4 h-4 flex items-center justify-center rounded-full border transition-colors ${independentPlayingId === `row-${idx}-meaning` ? 'bg-red-50 text-red-500' : (isActive ? 'bg-blue-500/50 text-white hover:bg-blue-400' : 'bg-slate-100 text-slate-400 hover:text-indigo-600')}`}>
                                             {independentPlayingId === `row-${idx}-meaning` ? <X className="w-2 h-2 fill-current" /> : <Play className="w-2 h-2 fill-current" />}
                                         </button>
                                         <div 
                                            className={`flex-1 flex items-center gap-1 ${isMeaningHidden ? (meaningRevealed ? revealedClass : blurClass) : ''}`}
                                            onClick={(e) => isMeaningHidden && toggleCellReveal(e, `${rowId}-meaning`)}
                                         >
                                             <Globe className={`w-3 h-3 ${isActive ? 'text-blue-200' : 'text-slate-400'}`}/> 
                                             <p className={`text-xs italic transition-colors ${isMeaningActive ? 'font-bold text-white bg-blue-500/20 px-1 rounded' : (isActive ? 'text-blue-200' : 'text-slate-400')}`}>
                                                {/* AUTO BOLD INDONESIAN TRANSLATION (Uses MeaningWord if available) */}
                                                <HighlightedText 
                                                    text={item.meaning} 
                                                    highlight={item.meaningWord || item.word} // Fallback to Eng word (unlikely to match but safe) 
                                                />
                                             </p>
                                         </div>
                                    </div>
                                )}
                              </div>
                            </div>
                         </div>
                         
                         {/* ACTIONS */}
                         <div className={`flex md:flex-col gap-2 md:ml-4 w-full md:w-auto justify-end md:justify-start mt-2 md:mt-0 border-t md:border-t-0 pt-2 md:pt-0 ${isActive ? 'border-blue-500' : 'border-slate-100'}`}>
                            {/* WORD ACTION */}
                            <div className="flex gap-1 items-center justify-end w-full md:w-auto">
                                <span className={`text-[10px] font-bold md:hidden mr-2 ${isActive ? 'text-blue-300' : 'text-slate-300'}`}>Word</span>
                                {localWordUrl ? (
                                    <a href={localWordUrl} download={wordFilename} onClick={(e) => e.stopPropagation()} className={`w-[80px] h-[30px] bg-green-50 hover:bg-green-100 text-green-600 rounded border border-green-200 flex items-center justify-center gap-1 ${isSystemBusy ? 'opacity-50 pointer-events-none cursor-not-allowed' : ''}`} title="Download Word"><Download className="w-3 h-3" /> <span className="text-[10px] font-bold">Download</span></a>
                                ) : (
                                    <button disabled={isSystemBusy} onClick={(e) => { e.stopPropagation(); generateAIAudio(item, 'word'); }} className={`w-[80px] h-[30px] flex items-center justify-center gap-1 rounded border bg-slate-50 text-indigo-600 hover:bg-indigo-50 border-indigo-100 shadow-sm ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`} title="Generate Word AI">
                                        {aiLoadingId === `${item.id}-word` ? <Loader2 className="w-3 h-3 animate-spin"/> : <Wand2 className="w-3 h-3"/>} <span className="text-[10px] font-bold">Word</span>
                                    </button>
                                )}
                            </div>
                            {/* SENTENCE ACTION */}
                            <div className="flex gap-1 items-center justify-end w-full md:w-auto">
                                <span className={`text-[10px] font-bold md:hidden mr-2 ${isActive ? 'text-blue-300' : 'text-slate-300'}`}>Sent</span>
                                {localSentUrl ? (
                                    <a href={localSentUrl} download={sentFilename} onClick={(e) => e.stopPropagation()} className={`w-[80px] h-[30px] bg-green-50 hover:bg-green-100 text-green-600 rounded border border-green-200 flex items-center justify-center gap-1 ${isSystemBusy ? 'opacity-50 pointer-events-none cursor-not-allowed' : ''}`} title="Download Sentence"><Download className="w-3 h-3" /> <span className="text-[10px] font-bold">Download</span></a>
                                ) : (
                                    <button disabled={isSystemBusy} onClick={(e) => { e.stopPropagation(); generateAIAudio(item, 'sentence'); }} className={`w-[80px] h-[30px] flex items-center justify-center gap-1 rounded border bg-slate-50 text-purple-600 hover:bg-purple-50 border-purple-100 shadow-sm ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`} title="Generate Sentence AI">
                                        {aiLoadingId === `${item.id}-sentence` ? <Loader2 className="w-3 h-3 animate-spin"/> : <Wand2 className="w-3 h-3"/>} <span className="text-[10px] font-bold">Sent</span>
                                    </button>
                                )}
                            </div>
                         </div>
                       </div>
                     </div>
                   );
               } 
               else {
                   const localTextUrl = localAudioMapText[`${item.displayId}`];
                   const textFilename = `${item.displayId}_text.wav`;
                   
                   const isActive = (currentIndex === idx) && (isPlaying || independentPlayingId !== null);
                   const isTextActive = isActive && speakingPart === 'full';

                   return (
                      <div key={idx} id={`row-${idx}`} onClick={() => startGlobalPlayback(idx)} className={`rounded p-3 transition-all hover:shadow-sm flex items-start gap-3 cursor-pointer ${isActive ? 'bg-blue-600 border border-blue-700' : 'bg-white border border-slate-200'}`}>
                        <div className="flex flex-col items-center gap-2 mt-0.5">
                            <span className={`text-xs font-mono w-6 text-center ${isActive ? 'text-blue-200' : 'text-slate-400'}`}>#{item.displayId}</span>
                            {localTextUrl && preferLocalAudio ? <Hash className="w-3 h-3 text-green-500"/> : <FileText className={`w-3 h-3 ${isActive ? 'text-blue-300' : 'text-slate-300'}`} />}
                        </div>
                        <p className={`text-sm flex-1 leading-relaxed ${isTextActive ? 'font-bold text-white' : (isActive ? 'text-white' : 'text-slate-700')}`}>{item.text}</p>
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                             {localTextUrl ? (
                                 <a href={localTextUrl} download={textFilename} className={`flex items-center gap-1 px-2 py-1 bg-green-50 text-green-600 rounded text-xs font-bold border border-green-200 ${isSystemBusy ? 'opacity-50 pointer-events-none cursor-not-allowed' : ''}`}><Download className="w-3 h-3" /> DL</a>
                             ) : (
                                 <button disabled={isSystemBusy} onClick={() => generateAIAudio(item, 'full')} className={`flex items-center gap-1 px-2 py-1 rounded border bg-slate-50 text-indigo-600 hover:bg-indigo-50 text-xs font-bold ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}>
                                     {aiLoadingId === `${item.id}-full` ? <Loader2 className="w-3 h-3 animate-spin"/> : <Wand2 className="w-3 h-3"/>} AI Gen
                                 </button>
                             )}
                        </div>
                     </div>
                   );
               }
             })}
          </div>
  );

  const renderMobileTools = () => (
      <div className="p-4 space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
             <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><Settings className="w-4 h-4"/> Tools & API</h3>
             <input 
              type="password" 
              placeholder={apiKey ? "System Key Active" : "Gemini API Key"} 
              className={`text-xs border border-slate-300 rounded px-3 py-2 w-full mb-3 ${apiKey ? 'bg-green-50 border-green-200 text-green-700' : ''}`}
              value={apiKey ? "" : userApiKey} 
              disabled={!!apiKey}
              onChange={e => {setUserApiKey(e.target.value); localStorage.setItem('gemini_api_key', e.target.value)}} 
             />
             <button disabled={isSystemBusy} onClick={() => folderInputRef.current.click()} className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-bold transition border ${currentMapCount > 0 ? 'bg-green-600 text-white border-green-700' : 'bg-slate-800 text-white border-slate-900'} ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`}>
               <FolderOpen className="w-3.5 h-3.5" /> Load Audio Folder
             </button>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
             <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><Layers className="w-4 h-4 text-purple-600"/> Batch Download</h3>
             <div className="space-y-3">
                 <div className="flex gap-4">
                     <button disabled={isBatchDownloading} onClick={() => setBatchConfig(p=>({...p, doWord: !p.doWord}))} className={`flex items-center gap-2 text-xs font-medium ${batchConfig.doWord ? 'text-indigo-600' : 'text-slate-400'} ${isBatchDownloading ? 'opacity-50' : ''}`}>
                         {batchConfig.doWord ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>} Word
                     </button>
                     <button disabled={isBatchDownloading} onClick={() => setBatchConfig(p=>({...p, doSentence: !p.doSentence}))} className={`flex items-center gap-2 text-xs font-medium ${batchConfig.doSentence ? 'text-indigo-600' : 'text-slate-400'} ${isBatchDownloading ? 'opacity-50' : ''}`}>
                         {batchConfig.doSentence ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>} Sentence
                     </button>
                 </div>
                 <div className="flex items-center gap-2 text-xs">
                     <span>Range:</span>
                     <input disabled={isBatchDownloading} type="number" className="w-16 border rounded p-1" value={batchConfig.start} onChange={e=>setBatchConfig(p=>({...p, start:e.target.value}))} />
                     <span>to</span>
                     <input disabled={isBatchDownloading} type="number" className="w-16 border rounded p-1" value={batchConfig.end} onChange={e=>setBatchConfig(p=>({...p, end:e.target.value}))} />
                 </div>
                 <button 
                    onClick={runBatchDownload} 
                    disabled={isSystemBusy && !isBatchDownloading} // Disable jika manual gen sedang jalan
                    className={`w-full py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 ${(isSystemBusy && !isBatchDownloading) ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : (isBatchDownloading ? 'bg-slate-100 text-slate-400' : 'bg-purple-600 text-white hover:bg-purple-700')}`}
                 >
                     {isBatchDownloading ? <Loader2 className="w-3 h-3 animate-spin"/> : <DownloadCloudIcon className="w-3 h-3"/>}
                     {isBatchDownloading ? "Downloading..." : "Start Batch Download"}
                 </button>
             </div>
          </div>
          
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
             <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><Database className="w-4 h-4"/> Decks</h3>
             <select 
                disabled={isSystemBusy}
                className={`w-full text-xs p-2 border rounded mb-2 bg-slate-50 ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
                onChange={handleLoadDeck} 
                value={selectedDeckId}
            >
                <option value="" disabled>Load Saved...</option>
                {Object.keys(savedDecks).map(name => <option key={name} value={name}>{name}</option>)}
            </select>
             <div className="flex gap-2">
                 <input disabled={isSystemBusy} className={`flex-1 border rounded px-2 text-xs ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`} placeholder="Deck Name" value={currentDeckName} onChange={(e) => setCurrentDeckName(e.target.value)} />
                 <button disabled={isSystemBusy} onClick={handleSaveDeck} className={`p-2 bg-green-100 text-green-600 rounded ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`}><Save className="w-4 h-4"/></button>
                 {selectedDeckId && <button disabled={isSystemBusy} onClick={handleDeleteDeckInit} className={`p-2 bg-red-100 text-red-600 rounded ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`}><Trash2 className="w-4 h-4"/></button>}
             </div>
          </div>
      </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col h-screen overflow-hidden">
      
      {/* 1. HEADER */}
      {/* FIX Z-INDEX & OVERFLOW (Issue #2: Body covering popups) */}
      <div className="bg-white border-b border-slate-200 p-3 shadow-sm z-50 flex gap-4 justify-between items-center h-16 flex-shrink-0 relative">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600">
            {isSidebarOpen ? <PanelLeftClose className="w-5 h-5"/> : <PanelLeftOpen className="w-5 h-5"/>}
          </button>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <div className="bg-indigo-600 text-white p-2 rounded-lg"><Mic className="w-5 h-5" /></div>
            <div><h1 className="font-bold text-slate-800 leading-tight">ProLingo v4.24</h1></div>
          </div>
        </div>
        
        {/* CENTER DECK MANAGER - VISIBLE ON MD+ (TABLET/PC) */}
        {/* Sync dengan Bottom Tab Bar: Jika ini muncul (md:flex), bottom bar hilang (md:hidden) */}
        <div className="hidden md:flex flex-1 justify-center min-w-0 px-2">
             <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200 flex-shrink min-w-0 max-w-full overflow-hidden">
              <Database className="w-4 h-4 text-slate-500 ml-1 flex-shrink-0" />
              <div className="flex items-center flex-shrink min-w-0">
                <select 
                    disabled={isSystemBusy}
                    className={`bg-transparent text-sm font-semibold text-slate-700 outline-none w-16 lg:w-28 cursor-pointer flex-shrink min-w-0 ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}
                    onChange={handleLoadDeck} 
                    value={selectedDeckId}
                >
                    <option value="" disabled>Load Saved...</option>
                    {Object.keys(savedDecks).map(name => <option key={name} value={name}>{name}</option>)}
                </select>
                {selectedDeckId && (
                    <button disabled={isSystemBusy} onClick={handleDeleteDeckInit} className={`p-1 hover:bg-red-100 text-slate-400 hover:text-red-500 rounded transition flex-shrink-0 ${isSystemBusy ? 'cursor-not-allowed opacity-50 pointer-events-none' : ''}`} title="Hapus Deck Ini">
                        <Trash2 className="w-3.5 h-3.5"/>
                    </button>
                )}
              </div>
              
              <div className="h-4 w-[1px] bg-slate-300 mx-1 flex-shrink-0"></div>
              <input disabled={isSystemBusy} className="bg-transparent text-sm w-16 lg:w-24 outline-none disabled:opacity-50 flex-shrink min-w-0" placeholder="Sheet Name" value={currentDeckName} onChange={(e) => setCurrentDeckName(e.target.value)} />
              <button disabled={isSystemBusy} onClick={handleSaveDeck} className={`p-1 hover:bg-white text-green-600 rounded flex-shrink-0 ${isSystemBusy ? 'cursor-not-allowed opacity-50 pointer-events-none' : ''}`} title="Simpan Deck"><Save className="w-4 h-4"/></button>
            </div>
        </div>

        {/* RIGHT SIDE TOOLS - VISIBLE ON MD+ (TABLET/PC) */}
        <div className="hidden md:flex items-center gap-2 flex-shrink-0 ml-auto">
            {/* FLOATING BATCH BUTTON (PC) */}
            <div className="relative">
             <button 
                ref={batchButtonRef}
                disabled={isSystemBusy && !isBatchDownloading} 
                onClick={() => setIsBatchOpen(!isBatchOpen)} 
                className={`p-2 rounded-md border transition-colors flex items-center gap-2 ${isBatchOpen ? 'bg-slate-800 text-purple-400 border-slate-700' : 'bg-slate-100 text-slate-500 border-slate-200'} ${(isSystemBusy && !isBatchDownloading) ? 'cursor-not-allowed opacity-50' : ''}`}
                title="Batch Download"
             >
                <Layers className="w-3.5 h-3.5"/> 
                {/* Space Saving: Text only visible on Large screens, hidden on Tablet/Compact Desktop */}
                <span className="text-xs font-bold whitespace-nowrap hidden xl:inline">
                    {isBatchDownloading && batchStatusText ? `Batching...` : "Batch DL"}
                </span>
             </button>
             {isBatchOpen && renderBatchPopup()}
           </div>

           {/* FLOATING DEBUG LOGS UI (PC) */}
           <div className="relative">
             <button 
                ref={debugButtonRef}
                onClick={() => setShowLogs(!showLogs)} 
                className={`p-2 rounded-md border transition-colors ${showLogs ? 'bg-slate-800 text-green-400 border-slate-700' : 'bg-slate-100 text-slate-500 border-slate-200'}`}
                title="Debug Logs"
             >
                <Terminal className="w-3.5 h-3.5"/>
             </button>
             
             {showLogs && (
                <div 
                  ref={debugPanelRef} 
                  className="absolute top-10 right-0 w-80 bg-slate-900 border border-slate-700 shadow-2xl rounded-xl z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
                  style={{ maxHeight: '300px' }}
                >
                  <div className="flex items-center justify-between p-2 bg-slate-800 border-b border-slate-700">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                       <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div> System Logs
                    </span>
                    <button onClick={() => setShowLogs(false)} className="text-slate-500 hover:text-white"><X className="w-3 h-3"/></button>
                  </div>
                  <div ref={logContainerRef} className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-[10px]">
                      {systemLogs.length === 0 && <p className="text-slate-600 italic">No logs available...</p>}
                      {systemLogs.map((log, i) => (
                          <div key={i} className="leading-tight border-b border-slate-800 pb-1 last:border-0">
                              <span className="text-slate-500 mr-2">[{log.time}]</span> 
                              <span className={`font-bold ${log.type === 'Error' ? 'text-red-400' : log.type === 'Warn' ? 'text-yellow-400' : 'text-blue-400'}`}>
                                {log.type}:
                              </span> 
                              <span className="text-slate-300 ml-1">{log.message}</span>
                          </div>
                      ))}
                  </div>
                </div>
             )}
           </div>

           <input 
              type="password" 
              placeholder={apiKey ? "Active" : "API Key"} 
              className={`text-xs border border-slate-300 rounded px-2 py-1 w-20 hidden xl:block ${apiKey ? 'bg-green-50 border-green-200 text-green-700' : ''}`}
              value={apiKey ? "" : userApiKey} 
              disabled={!!apiKey}
              onChange={e => {setUserApiKey(e.target.value); localStorage.setItem('gemini_api_key', e.target.value)}} 
           />
           <button disabled={isSystemBusy} onClick={() => folderInputRef.current.click()} className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition border whitespace-nowrap ${isSystemBusy ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''} ${currentMapCount > 0 ? 'bg-green-600 text-white border-green-700' : 'bg-slate-800 text-white border-slate-900'}`}>
             <FolderOpen className="w-3.5 h-3.5" /> 
             {/* Space Saving: Text only visible on X-Large screens */}
             <span className="hidden xl:inline">Load Audio</span>
           </button>
           <input type="file" ref={folderInputRef} webkitdirectory="" directory="" multiple className="hidden" onChange={handleFolderSelect} />
        </div>

        {/* MOBILE/TABLET HEADER GEAR - Visible only on Mobile (<MD) */}
        <div className="md:hidden ml-auto">
             <button onClick={() => setMobileTab('tools')} className={`p-2 rounded-lg ${mobileTab === 'tools' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500'}`}>
                 <Settings className="w-5 h-5"/>
             </button>
        </div>
      </div>

      {/* 2. MOBILE TAB BAR - SYNC: Only visible below MD (768px) */}
      <div className="md:hidden bg-white border-b border-slate-200 flex text-xs font-bold text-slate-500 z-10 relative">
          <button onClick={() => setMobileTab('terminal')} className={`flex-1 py-3 border-b-2 flex items-center justify-center gap-2 ${mobileTab === 'terminal' ? 'border-indigo-500 text-indigo-600' : 'border-transparent'}`}>
              <Terminal className="w-4 h-4"/> Logs
          </button>
          <button onClick={() => setMobileTab('player')} className={`flex-1 py-3 border-b-2 flex items-center justify-center gap-2 ${mobileTab === 'player' ? 'border-indigo-500 text-indigo-600' : 'border-transparent'}`}>
              <Play className="w-4 h-4"/> Player
          </button>
          <button onClick={() => setMobileTab('tools')} className={`flex-1 py-3 border-b-2 flex items-center justify-center gap-2 ${mobileTab === 'tools' ? 'border-indigo-500 text-indigo-600' : 'border-transparent'}`}>
              <Settings className="w-4 h-4"/> Tools
          </button>
      </div>

      <div className="flex-1 flex overflow-hidden relative z-0">
        
        {/* SIDEBAR (FIXED POSITIONING LOGIC 2.0) */}
        <div 
          className={`
            border-r border-slate-200 flex flex-col shadow-lg transition-all duration-300 ease-in-out bg-white z-40
            h-full overflow-hidden 
            
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
            
            ${/* Mobile Logic: Absolute (Overlay), left-0, width fixed */ ''}
            absolute md:relative top-0 left-0
            
            ${/* Width Logic: Mobile always w-72 (hidden via translate), PC w-72 or w-0 */ ''}
            w-72 
            ${!isSidebarOpen ? 'md:w-0 md:border-none' : 'md:w-72'}
          `}
        >
          {/* PERBAIKAN POIN 2: Wrapper utama sekarang scrollable (overflow-y-auto) */}
          <div className="flex flex-col h-full overflow-y-auto w-72">
            {/* Bagian kontrol atas tidak lagi scroll sendiri, melainkan ikut flow utama */}
            <div className="p-4 border-b border-slate-100 space-y-4 flex-shrink-0">
              <div className="grid grid-cols-2 bg-slate-100 p-1 rounded-lg">
                {/* POINT 4: LOCK ENV SWITCH */}
                <button disabled={isSystemBusy} onClick={() => handleModeSwitch('table')} className={`text-xs font-bold py-1.5 rounded ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''} ${mode === 'table' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Table</button>
                <button disabled={isSystemBusy} onClick={() => handleModeSwitch('text')} className={`text-xs font-bold py-1.5 rounded ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''} ${mode === 'text' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Text</button>
              </div>

              {/* Status Audio Box */}
              <div className={`p-3 rounded-lg border ${currentMapCount > 0 ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-100'}`}>
                <div className="flex justify-between items-center mb-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Audio Source ({mode})</p>
                  {renderStatusBadge()}
                </div>
                {/* POINT 4: LOCK AUDIO TOGGLE */}
                <button 
                    onClick={() => currentMapCount > 0 && setPreferLocalAudio(!preferLocalAudio)}
                    disabled={currentMapCount === 0 || isSystemBusy}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs font-bold transition-all ${currentMapCount === 0 || isSystemBusy ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white hover:shadow-sm'}`}
                >
                  <span className={preferLocalAudio ? "text-indigo-700" : "text-slate-500"}>
                    {preferLocalAudio ? "Source: Local/Generated" : "Source: Browser TTS"}
                  </span>
                  {preferLocalAudio ? <ToggleRight className="w-5 h-5 text-indigo-600"/> : <ToggleLeft className="w-5 h-5 text-slate-400"/>}
                </button>
              </div>

              {/* AI Voice */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><Bot className="w-3 h-3"/> AI Voice (Generator)</p>
                <select className="w-full text-xs p-2 border rounded bg-indigo-50 border-indigo-100 text-indigo-800 font-medium" onChange={e => setAiVoiceName(e.target.value)} value={aiVoiceName}>
                  {aiVoices.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              </div>

              {/* TTS Voice */}
              <div className="space-y-2 border-t border-slate-100 pt-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase">English Voice (TTS)</p>
                <select className="w-full text-xs p-2 border rounded text-slate-600" onChange={e => setSelectedVoice(voices.find(v => v.name === e.target.value))} value={selectedVoice?.name || ''}>
                  {voices.map(v => <option key={v.name} value={v.name}>{formatVoiceLabel(v)}</option>)}
                </select>
                
                {/* UPDATE: Indonesian Voice disembunyikan di text mode */}
                {mode === 'table' && (
                  <div className="mt-2">
                       <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Indonesian Voice (Meaning)</p>
                       {indonesianVoices.length > 0 ? (
                           <select className="w-full text-xs p-2 border rounded text-slate-600 bg-slate-50" onChange={e => setSelectedIndonesianVoice(indonesianVoices.find(v => v.name === e.target.value))} value={selectedIndonesianVoice?.name || ''}>
                             {indonesianVoices.map(v => <option key={v.name} value={v.name}>{formatVoiceLabel(v)}</option>)}
                           </select>
                       ) : (
                           <div className="text-[10px] text-red-400 italic border p-1 rounded bg-red-50">Browser Anda tidak mendukung suara Indonesia.</div>
                       )}
                  </div>
                )}

                <div className="flex items-center gap-2 bg-slate-50 p-2 rounded border border-slate-100 mt-2">
                    <span className="text-xs font-bold text-slate-500 w-8 text-center">{rate}x</span>
                    <input 
                        type="range" 
                        min="0.5" 
                        max="2" 
                        step="0.1" 
                        value={rate} 
                        onChange={e => setRate(e.target.value)} 
                        className="flex-1 h-1 bg-slate-200 rounded-lg cursor-pointer accent-indigo-600" 
                    />
                </div>
              </div>

              {/* UPDATE: GLOBAL PLAY PARTS DIHIDE DI TEXT MODE */}
              {mode === 'table' && (
                  <div className="space-y-2 border-t border-slate-100 pt-2">
                     <p className="text-[10px] font-bold text-slate-400 uppercase">Global Play Parts</p>
                     <div className="flex flex-col gap-2">
                        <div className="flex gap-4">
                             <button onClick={() => setPlayWord(!playWord)} className={`flex items-center gap-2 text-xs font-bold ${playWord ? 'text-indigo-600' : 'text-slate-400'}`}>
                                 {playWord ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>} Word
                             </button>
                             <button onClick={() => setPlaySentence(!playSentence)} className={`flex items-center gap-2 text-xs font-bold ${playSentence ? 'text-indigo-600' : 'text-slate-400'}`}>
                                 {playSentence ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>} Sentence
                             </button>
                        </div>
                        {/* MEANING CHECKBOX */}
                        <button onClick={() => setPlayMeaning(!playMeaning)} className={`flex items-center gap-2 text-xs font-bold ${playMeaning ? 'text-indigo-600' : 'text-slate-400'}`}>
                             {playMeaning ? <CheckSquare className="w-4 h-4"/> : <Square className="w-4 h-4"/>} Meaning (Indonesian)
                        </button>
                        
                        {/* PRIORITY 2: MEMORY MODE TOGGLE */}
                        <div className="mt-2 border-t border-dashed border-slate-200 pt-2">
                            <button onClick={() => setIsMemoryMode(!isMemoryMode)} className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs font-bold transition-all ${isMemoryMode ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' : 'bg-slate-50 text-slate-500 border border-slate-100 hover:bg-white'}`}>
                                 <span className="flex items-center gap-2"><Brain className="w-4 h-4"/> Memory Mode</span>
                                 {isMemoryMode ? <ToggleRight className="w-5 h-5 text-yellow-600"/> : <ToggleLeft className="w-5 h-5 text-slate-400"/>}
                            </button>
                            
                            {/* PRIORITY 3.5: MEMORY MODE SETTINGS (CHECKBOXES) */}
                            {isMemoryMode && (
                                <div className="mt-2 pl-3 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="checkbox" 
                                            id="hide-word"
                                            checked={memorySettings.word} 
                                            onChange={(e) => setMemorySettings(prev => ({ ...prev, word: e.target.checked }))}
                                            className="w-3.5 h-3.5 accent-yellow-600 cursor-pointer"
                                        />
                                        <label htmlFor="hide-word" className="text-[10px] text-slate-600 font-medium cursor-pointer select-none">Hide Word</label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="checkbox" 
                                            id="hide-sentence"
                                            checked={memorySettings.sentence} 
                                            onChange={(e) => setMemorySettings(prev => ({ ...prev, sentence: e.target.checked }))}
                                            className="w-3.5 h-3.5 accent-yellow-600 cursor-pointer"
                                        />
                                        <label htmlFor="hide-sentence" className="text-[10px] text-slate-600 font-medium cursor-pointer select-none">Hide Sentence</label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="checkbox" 
                                            id="hide-meaning"
                                            checked={memorySettings.meaning} 
                                            onChange={(e) => setMemorySettings(prev => ({ ...prev, meaning: e.target.checked }))}
                                            className="w-3.5 h-3.5 accent-yellow-600 cursor-pointer"
                                        />
                                        <label htmlFor="hide-meaning" className="text-[10px] text-slate-600 font-medium cursor-pointer select-none">Hide Meaning</label>
                                    </div>
                                    <p className="text-[9px] text-yellow-600 mt-1 italic leading-tight pt-1 border-t border-yellow-100">
                                        Klik teks untuk intip (4 detik).
                                    </p>
                                </div>
                            )}
                        </div>
                     </div>
                  </div>
              )}

              {/* Actions */}
              <div className="grid grid-cols-2 gap-2">
                {mode === 'table' ? (
                  <>
                    {/* POINT 4: LOCK IMPORT CSV */}
                    <button disabled={isSystemBusy} onClick={() => csvInputRef.current.click()} className={`flex items-center justify-center gap-1 border border-slate-200 p-2 rounded hover:bg-slate-50 text-xs ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}><Upload className="w-3 h-3"/> Import CSV</button>
                    <input type="file" ref={csvInputRef} accept=".csv" className="hidden" onChange={handleCSVUpload} />
                  </>
                ) : (
                  <div className="text-xs text-slate-400 flex items-center justify-center border border-dashed rounded bg-slate-50">Text Mode</div>
                )}
                {/* POINT 4: LOCK CLEAR VIEW */}
                <button disabled={isSystemBusy} onClick={() => setIsClearDialogOpen(true)} className={`flex items-center justify-center gap-1 border border-red-100 text-red-500 p-2 rounded hover:bg-red-50 text-xs ${isSystemBusy ? 'cursor-not-allowed opacity-50' : ''}`}><Trash2 className="w-3 h-3"/> Clear View</button>
              </div>
            </div>
            
            {/* PERBAIKAN POIN 2: Textarea diberikan min-h-[300px] agar selalu terlihat luas */}
            <div className="flex-1 p-2 relative flex flex-col min-h-[300px] bg-white">
              {/* FIX 2: Correct onChange handler */}
              <textarea 
                ref={textareaRef} // Point 1: Ref for focus back
                disabled={isSystemBusy}
                readOnly={isLocked}
                className={`w-full flex-1 text-xs font-mono p-2 border rounded resize-none focus:outline-indigo-500 transition-colors shadow-inner ${isLocked || isSystemBusy ? 'bg-slate-100 text-slate-500' : 'bg-white text-slate-800'}`} 
                placeholder={mode === 'table' ? "Paste Excel/CSV..." : "Paste text..."}
                value={mode === 'table' ? tableContent : textContent} 
                onChange={(e) => handleInputContentChange(e.target.value)} 
              />
              
              <div className="flex justify-end items-center mt-2 px-1 flex-shrink-0 gap-2">
                 {/* POINT 1: INSERT TAB BUTTON */}
                 <button 
                    disabled={isLocked || isSystemBusy}
                    onClick={handleInsertTab}
                    className={`text-[10px] flex items-center gap-1 px-2 py-1 rounded border transition ${isLocked || isSystemBusy ? 'opacity-50 cursor-not-allowed bg-slate-50 text-slate-400' : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'}`}
                    title="Insert Tab Character (Separator)"
                 >
                    <ArrowRightToLine className="w-3 h-3" /> Add Tab
                 </button>

                 {/* POINT 1: Lock Lock Button during Batch */}
                 <button disabled={isSystemBusy} onClick={() => setLockedStates(prev => ({ ...prev, [mode]: !prev[mode] }))} className={`text-[10px] flex items-center gap-1 px-2 py-1 rounded ${isSystemBusy ? 'opacity-50 cursor-not-allowed text-slate-400' : (isLocked ? 'text-amber-600 bg-amber-50' : 'text-slate-400 hover:bg-slate-100')}`}>
                  {isLocked ? <><Lock className="w-3 h-3"/> Locked</> : <><Unlock className="w-3 h-3"/> Unlocked</>}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* MAIN BODY AREA */}
        <div className="flex-1 bg-slate-50 overflow-y-auto transition-all relative">
            
            {/* MOBILE LOGS VIEW - Sync MD Hidden */}
            <div className={`absolute inset-0 bg-slate-900 p-4 overflow-auto z-30 ${mobileTab === 'terminal' ? 'block md:hidden' : 'hidden'}`}>
                {systemLogs.map((log, i) => (
                    <div key={i} className="leading-tight border-b border-slate-800 pb-1 mb-1 font-mono text-[10px]">
                        <span className="text-slate-500 mr-2">[{log.time}]</span> 
                        <span className={`font-bold ${log.type === 'Error' ? 'text-red-400' : log.type === 'Warn' ? 'text-yellow-400' : 'text-blue-400'}`}>{log.type}:</span> 
                        <span className="text-slate-300 ml-1">{log.message}</span>
                    </div>
                ))}
            </div>

            {/* MOBILE TOOLS VIEW - Sync MD Hidden */}
            <div className={`absolute inset-0 bg-slate-50 z-30 overflow-y-auto ${mobileTab === 'tools' ? 'block md:hidden' : 'hidden'}`}>
                {renderMobileTools()}
            </div>

            {/* PLAYER VIEW - Always show on MD+, or if tab selected on Mobile */}
            <div className={`h-full overflow-y-auto p-4 ${mobileTab === 'player' ? 'block' : 'hidden'} md:block`}>
                 <div className="max-w-4xl mx-auto">
                    {renderPlaylist()}
                 </div>
            </div>

        </div>
      </div>

      {/* BOTTOM BAR - FIXED LAYOUT (Issue #1) */}
      <div className="bg-white border-t border-slate-200 p-2 md:p-4 shadow-2xl z-50">
        <div className="max-w-4xl mx-auto">
           {/* MOBILE GRID LAYOUT - Hidden on MD+ */}
           <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 md:hidden">
               
               {/* Left: Truncated Title */}
               <div className="flex flex-col min-w-0 pr-2">
                 <p className="text-[10px] font-bold text-slate-400 tracking-wider">NOW PLAYING</p>
                 <p className="text-sm font-semibold truncate text-slate-800">
                   {currentIndex >= 0 
                     ? `${currentIndex + 1}. ${playlist[currentIndex]?.word || 'Unknown'}` 
                     : "Ready"}
                 </p>
               </div>

               {/* Center: Controls */}
               <div className="flex items-center gap-2">
                  <button onClick={() => handleSmartNav('prev')} className="p-2 text-slate-500 hover:text-indigo-600 bg-slate-100 rounded-full active:scale-95"><SkipBack className="w-5 h-5 fill-current"/></button>
                  <button 
                    onClick={handleGlobalPlay} 
                    className={`p-3 rounded-full shadow-lg transform transition active:scale-95 flex items-center justify-center ${
                      isPlaying 
                      ? 'bg-red-50 text-red-500 border-2 border-red-100' 
                      : 'bg-indigo-600 text-white'
                    }`}
                  >
                    {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
                  </button>
                  <button onClick={() => handleSmartNav('next')} className="p-2 text-slate-500 hover:text-indigo-600 bg-slate-100 rounded-full active:scale-95"><SkipForward className="w-5 h-5 fill-current"/></button>
               </div>

               {/* Right: Mode Cycler (Compact) */}
               <div className="flex justify-end">
                  <button 
                     onClick={cyclePlaybackMode}
                     className="flex flex-col items-center justify-center gap-1 min-w-[50px] p-1 rounded hover:bg-slate-50"
                  >
                      {playbackMode === 'once' && <span className="text-xs font-mono border border-slate-500 rounded px-1 text-slate-600">1</span>}
                      {playbackMode === 'sequence' && <List className="w-5 h-5 text-indigo-600"/>}
                      {playbackMode === 'repeat_2x' && <span className="text-xs font-bold text-purple-600">2x</span>}
                      {playbackMode === 'loop_one' && <Repeat1 className="w-5 h-5 text-orange-500"/>}
                      {playbackMode === 'random' && <Shuffle className="w-5 h-5 text-blue-500"/>}
                      <span className="text-[9px] text-slate-400 font-bold uppercase truncate max-w-full">
                          {playbackMode === 'once' ? 'Once' : playbackMode === 'sequence' ? 'Next' : playbackMode === 'repeat_2x' ? '2x' : playbackMode === 'loop_one' ? 'Loop' : 'Rand'}
                      </span>
                  </button>
               </div>
           </div>

           {/* DESKTOP FLEX LAYOUT - Visible on MD+ */}
           <div className="hidden md:flex items-center justify-between gap-4">
               {/* Left Info */}
               <div className="w-64 flex flex-col">
                 <div className="flex items-center gap-2 mb-1">
                   <span className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`}></span>
                   <p className="text-[10px] font-bold text-slate-400 tracking-wider">GLOBAL PLAYER</p>
                 </div>
                 <p className="text-sm font-semibold truncate text-slate-800">
                   {currentIndex >= 0 
                     ? `${currentIndex + 1}. ${playlist[currentIndex]?.word || (playlist[currentIndex]?.text ? playlist[currentIndex].text.substring(0, 15)+'...' : 'Item')} (${currentIndex + 1}/${playlist.length})` 
                     : "Ready"}
                 </p>
               </div>

               {/* Center Controls */}
               <div className="flex items-center gap-4">
                    <button onClick={() => handleSmartNav('prev')} className="p-3 text-slate-500 hover:text-indigo-600 bg-slate-100 rounded-full transition active:scale-95"><SkipBack className="w-6 h-6 fill-current"/></button>
                    <button 
                      onClick={handleGlobalPlay} 
                      className={`p-4 rounded-full shadow-lg transform transition active:scale-95 flex items-center justify-center ${
                        isPlaying 
                        ? 'bg-red-50 text-red-500 border-2 border-red-100 hover:bg-red-100' 
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      }`}
                    >
                      {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
                    </button>
                    <button onClick={() => handleSmartNav('next')} className="p-3 text-slate-500 hover:text-indigo-600 bg-slate-100 rounded-full transition active:scale-95"><SkipForward className="w-6 h-6 fill-current"/></button>
               </div>

               {/* Right Settings */}
               <div className="w-64 flex flex-col items-end gap-1">
                 <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                    <select 
                      className="bg-transparent text-xs font-bold text-slate-600 outline-none p-1 cursor-pointer"
                      value={playbackMode}
                      onChange={(e) => setPlaybackMode(e.target.value)}
                    >
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
      
      {/* DIALOGS */}
      {isClearDialogOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-slate-800 text-center mb-4">Bersihkan Tampilan?</h3>
            <div className="flex gap-3 w-full">
                <button onClick={() => setIsClearDialogOpen(false)} className="flex-1 py-2 rounded border">Batal</button>
                <button onClick={() => { if(mode === 'table') {setTableContent(''); setLocalAudioMapTable({}); setAudioStatusTable('idle');} else {setTextContent(''); setLocalAudioMapText({}); setAudioStatusText('idle');} setLockedStates(p => ({...p, [mode]: false})); setIsClearDialogOpen(false); resetFullState(); }} className="flex-1 py-2 rounded bg-indigo-600 text-white">Ya</button>
            </div>
          </div>
        </div>
      )}

      {isDeleteDialogOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-slate-800 text-center mb-4">Hapus Deck?</h3>
            <div className="flex gap-3 w-full">
                <button onClick={() => setIsDeleteDialogOpen(false)} className="flex-1 py-2 rounded border">Batal</button>
                <button onClick={confirmDeleteDeck} className="flex-1 py-2 rounded bg-red-500 text-white">Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;