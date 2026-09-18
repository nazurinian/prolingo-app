import React from 'react';
import { Link2, Unlink } from 'lucide-react';
import { GroupedVoiceSelect } from '../common/GroupedVoiceSelect';

export default function PlayerBrowserTtsControls({
  voices,
  selectedVoice,
  setSelectedVoice,
  isSystemBusy,
  mode,
  indonesianVoices,
  selectedIndonesianVoice,
  setSelectedIndonesianVoice,
  showIndonesianVoice = mode === 'table',
  structuredTextModeActive = false,
  rate,
  setRate,
  meaningRate = rate,
  setMeaningRate,
  ratesLinked = true,
  setRatesLinked,
}) {
  const renderRate = ({ label, value, onChange, accent = 'accent-indigo-600' }) => (
    <label className="block rounded-lg border border-slate-100 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 p-2">
      <span className="mb-1 flex items-center justify-between gap-2 text-[9px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-300">
        <span>{label}</span><span className="text-xs normal-case">{Number(value || 1).toFixed(1)}×</span>
      </span>
      <input type="range" min="0.5" max="2" step="0.1" value={value} onChange={onChange} disabled={isSystemBusy} className={`w-full h-1 bg-slate-200 dark:bg-slate-600 rounded-lg cursor-pointer ${accent} disabled:opacity-40`} />
    </label>
  );

  return (
    <div className="space-y-2 border-t border-slate-100 dark:border-slate-700 pt-2" data-player-browser-tts-controls="true">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold text-slate-400 uppercase">Browser TTS (Playback)</p>
        {structuredTextModeActive && <button
          type="button"
          disabled={isSystemBusy}
          onClick={() => setRatesLinked?.(!ratesLinked)}
          className={`min-h-9 px-2 rounded-lg border text-[8px] font-black transition disabled:opacity-40 ${ratesLinked ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'}`}
          title={ratesLinked ? 'EN and ID playback speed are linked' : 'EN and ID playback speed are independent'}
          data-text-player-rate-sync={ratesLinked ? 'on' : 'off'}
        >{ratesLinked ? <Link2 className="w-3 h-3 inline mr-1"/> : <Unlink className="w-3 h-3 inline mr-1"/>}SYNC {ratesLinked ? 'ON' : 'OFF'}</button>}
      </div>

      {structuredTextModeActive && <p className="text-[8px] leading-relaxed text-slate-400">Playback settings only. Edge/MP3 download voices, rate and pitch stay independent in Text Audio.</p>}

      {structuredTextModeActive && <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">English Voice (Text)</p>}
      <GroupedVoiceSelect
        voices={voices}
        selectedValue={selectedVoice?.name || ''}
        onChange={e => setSelectedVoice(voices.find(v => v.name === e.target.value))}
        disabled={isSystemBusy}
        className={`w-full text-xs p-2 border rounded text-slate-600 dark:text-slate-300 dark:bg-slate-700 dark:border-slate-600 ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
        context="main"
      />

      {showIndonesianVoice && (
        <div className="mt-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Indonesian Voice (Meaning)</p>
          {indonesianVoices.length > 0 ? (
            <GroupedVoiceSelect
              voices={indonesianVoices}
              selectedValue={selectedIndonesianVoice?.name || ''}
              onChange={e => setSelectedIndonesianVoice(indonesianVoices.find(v => v.name === e.target.value))}
              disabled={isSystemBusy}
              className={`w-full text-xs p-2 border rounded text-slate-600 dark:text-slate-300 dark:bg-slate-700 dark:border-slate-600 ${isSystemBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
              context="meaning"
            />
          ) : (
            <div className="text-[10px] text-red-400 italic border p-1 rounded bg-red-50 dark:bg-red-900/20">Browser Anda tidak mendukung suara Indonesia.</div>
          )}
        </div>
      )}

      {structuredTextModeActive ? (
        <div className="grid gap-2 pt-1" data-text-player-channel-rates="true">
          {renderRate({ label: 'EN / Text speed', value: rate, onChange: e => setRate(e.target.value) })}
          {renderRate({ label: 'ID / Meaning speed', value: meaningRate, onChange: e => setMeaningRate?.(e.target.value), accent: 'accent-sky-600' })}
        </div>
      ) : renderRate({ label: 'Playback speed', value: rate, onChange: e => setRate(e.target.value) })}
    </div>
  );
}
