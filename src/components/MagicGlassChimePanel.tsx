import React, { useState } from 'react';
import { Check, Copy, Sparkles, Volume2, Vibrate, Layers } from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import { hapticAudio } from '../lib/hapticAudioEngine';
import {
  BUTTON_ILLUMINATION_PRESETS,
  ButtonIlluminationPresetId,
  HapticMaterialType,
} from '../types/studio';
import { TactileButton } from './ui/TactileButton';
import { HapticSlider } from './ui/HapticSlider';

type CoreSensationId = 'glass-chime' | 'metal-detent' | 'tactile-dome' | 'sub-velvet';

const FOUR_CORE_SENSATIONS: Array<{
  id: CoreSensationId;
  title: string;
  subtitle: string;
  material: HapticMaterialType;
  accent: string;
  freqTag: string;
  vibeTag: string;
}> = [
  {
    id: 'glass-chime',
    title: '1. Szkło / Cymbałki',
    subtitle: 'Długa, dźwięczna faza wysokoczęstotliwościowego rezonansu jak kryształowe cymbałki.',
    material: 'shiny-glass',
    accent: '#38bdf8',
    freqTag: '1.1–5.4 kHz · 520 ms',
    vibeTag: 'Mikro-impuls 10 ms',
  },
  {
    id: 'metal-detent',
    title: '2. Metal CNC (Zapadka)',
    subtitle: 'Precyzyjny mechaniczny przeskok frezowanego aluminium z alikwotem 1.41×.',
    material: 'matte-metal',
    accent: '#2dd4bf',
    freqTag: '2.9 kHz + <150 Hz',
    vibeTag: 'Podwójny impuls 12/8 ms',
  },
  {
    id: 'tactile-dome',
    title: '3. Plastik ABS (Kopułka)',
    subtitle: 'Zwarty, błyskawiczny klik kopułki polimerowej do szybkiej nawigacji i przełączników.',
    material: 'abs-plastic',
    accent: '#fbbf24',
    freqTag: '1.7 kHz · 68 ms',
    vibeTag: 'Krótki klik 14 ms',
  },
  {
    id: 'sub-velvet',
    title: '4. Zamsz / Sub-Wibracja',
    subtitle: 'Głęboki, ciepły puls niskiej częstotliwości (<140 Hz) z miękkim tłumieniem i wibracją.',
    material: 'suede',
    accent: '#a78bfa',
    freqTag: '<140 Hz · ciepły bas',
    vibeTag: 'Fala 24/16 ms',
  },
];

const GLASS_XYLOPHONE_NOTES = [
  { note: 'C6', hz: 1046.5, label: 'C6 · Głębsze szkło', color: '#38bdf8' },
  { note: 'D6', hz: 1174.66, label: 'D6 · Kryształ', color: '#60a5fa' },
  { note: 'E6', hz: 1318.51, label: 'E6 · Cymbałki', color: '#818cf8' },
  { note: 'G6', hz: 1567.98, label: 'G6 · Jasny dzwonek', color: '#a78bfa' },
  { note: 'A6', hz: 1760.0, label: 'A6 · Dźwięczny', color: '#c084fc' },
  { note: 'C7', hz: 2093.0, label: 'C7 · Iskra szkła', color: '#f472b6' },
];

const VISUAL_SHAPES = [
  { id: 'crystal-pill' as const, label: 'Pigułka szklana' },
  { id: 'glass-card' as const, label: 'Karta optyczna' },
  { id: 'primary-cta' as const, label: 'Główny CTA' },
  { id: 'neumorphic-icon' as const, label: 'Okrągły przycisk' },
];

const HIGHLIGHT_SWATCHES = ['#38BDF8', '#A855F7', '#34D399', '#F472B6', '#F59E0B', '#60A5FA'];

export const MagicGlassChimePanel: React.FC = () => {
  const { palette, updateHaptic, applyButtonIlluminationPreset, updateEngraving } = useStudio();
  const isDark = palette === 'emerald-clinic';

  const [activeSensation, setActiveSensation] = useState<CoreSensationId>('glass-chime');
  const [baseFreqHz, setBaseFreqHz] = useState<number>(1318.51);
  const [resonanceMs, setResonanceMs] = useState<number>(560);
  const [brilliance, setBrilliance] = useState<number>(84);
  const [strikeHardness, setStrikeHardness] = useState<number>(76);
  const [vibrateMs, setVibrateMs] = useState<number>(12);

  // Unified lightweight visual button designer state
  const [btnLabel, setBtnLabel] = useState<string>('Zatwierdź akcję');
  const [btnVariant, setBtnVariant] = useState<
    'glass-card' | 'crystal-pill' | 'neumorphic-icon' | 'primary-cta'
  >('primary-cta');
  const [btnGlow, setBtnGlow] = useState<string>('#38BDF8');
  const [btnIllum, setBtnIllum] = useState<ButtonIlluminationPresetId>('cursor-spotlight');
  const [copied, setCopied] = useState<boolean>(false);

  const playGlassNote = (hz: number) => {
    setBaseFreqHz(hz);
    setActiveSensation('glass-chime');
    hapticAudio.triggerGlassChime({
      baseFreqHz: hz,
      resonanceMs,
      brilliance,
      strikeHardness,
      vibrateMs,
      gain: 0.42,
    });
  };

  const selectCoreSensation = (item: (typeof FOUR_CORE_SENSATIONS)[number]) => {
    setActiveSensation(item.id);
    updateHaptic({ material: item.material });
    hapticAudio.triggerFourCoreSensation(item.id, {
      baseFreqHz,
      resonanceMs,
      brilliance,
      gain: 0.44,
    });
  };

  const triggerDesignedButton = () => {
    if (activeSensation === 'glass-chime') {
      hapticAudio.triggerGlassChime({
        baseFreqHz,
        resonanceMs,
        brilliance,
        strikeHardness,
        vibrateMs,
        gain: 0.42,
      });
    } else {
      hapticAudio.triggerFourCoreSensation(activeSensation, {
        baseFreqHz,
        resonanceMs,
        brilliance,
        gain: 0.46,
      });
    }
  };

  const handleCopyConfig = async () => {
    const payload = JSON.stringify(
      {
        module: 'Magic Sounds',
        sensationType: activeSensation,
        glassChime: { baseFreqHz, resonanceMs, brilliance, strikeHardness, vibrateMs },
        visualButton: { label: btnLabel, variant: btnVariant, illumination: btnIllum, glowColor: btnGlow },
      },
      null,
      2
    );
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard restriction
    }
  };

  const cardSurface = isDark
    ? 'bg-[#0b221d]/80 border-emerald-400/20 text-emerald-50'
    : 'bg-white/80 border-white/90 text-slate-900';

  return (
    <div className="space-y-6">
      {/* 1. Four Core Audio-Tactile-Vibrational Sensation Types */}
      <section className={`rounded-2xl border p-5 sm:p-6 shadow-sm ${cardSurface}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-sky-500">
              <Vibrate className="w-3.5 h-3.5" /> Magic Sounds · 4 Główne Typy Doznań
            </div>
            <h2 className="text-xl font-bold mt-0.5">
              Cztery profile dźwiękowo-dotykowo-wibracyjne
            </h2>
          </div>
          <span className="text-xs px-3 py-1 rounded-full bg-sky-500/15 text-sky-400 font-semibold">
            Kliknij kartę, aby odsłuchać i poczuć wibrację
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {FOUR_CORE_SENSATIONS.map((item) => {
            const selected = activeSensation === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectCoreSensation(item)}
                style={{
                  borderColor: selected ? item.accent : undefined,
                  boxShadow: selected ? `0 0 0 2px ${item.accent}44, 0 8px 22px ${item.accent}22` : undefined,
                }}
                className={`text-left p-4 rounded-xl border-2 transition-all cursor-pointer ${
                  isDark
                    ? 'bg-emerald-950/60 border-emerald-400/20 hover:border-emerald-300/50'
                    : 'bg-slate-50/90 border-slate-200 hover:border-slate-400'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm sm:text-base">{item.title}</span>
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: item.accent }}
                  />
                </div>
                <p className="text-xs opacity-80 mt-1.5 leading-relaxed">{item.subtitle}</p>
                <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px] font-semibold">
                  <span className="px-2 py-0.5 rounded-full bg-black/10 dark:bg-white/10">
                    {item.freqTag}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-black/10 dark:bg-white/10">
                    {item.vibeTag}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Dedicated Glass / Cymbałki High-Frequency Resonance Studio */}
      <section className={`rounded-2xl border p-5 sm:p-6 shadow-sm ${cardSurface}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-indigo-400">
              <Sparkles className="w-3.5 h-3.5" /> Panel Szkło / Cymbałki
            </div>
            <h2 className="text-xl font-bold mt-0.5">
              Synteza dźwięcznego szkła — długa faza wysokiego rezonansu
            </h2>
          </div>
          <button
            type="button"
            onClick={() => playGlassNote(baseFreqHz)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-sky-500 to-indigo-600 shadow-md cursor-pointer hover:brightness-110"
          >
            <Volume2 className="w-4 h-4" /> Uderz w szkło ({Math.round(baseFreqHz)} Hz · {resonanceMs} ms)
          </button>
        </div>

        {/* Playable 6-bar Glass Xylophone */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-5">
          {GLASS_XYLOPHONE_NOTES.map((bar) => {
            const isCurrent = Math.abs(baseFreqHz - bar.hz) < 10;
            return (
              <button
                key={bar.note}
                type="button"
                onClick={() => playGlassNote(bar.hz)}
                style={{
                  borderColor: bar.color,
                  boxShadow: isCurrent ? `0 0 0 2px ${bar.color}55, 0 8px 18px ${bar.color}33` : undefined,
                }}
                className={`p-3 rounded-xl border-2 text-left cursor-pointer transition-transform active:scale-95 ${
                  isDark ? 'bg-slate-900/70 hover:bg-slate-800/80' : 'bg-white hover:bg-sky-50/80'
                }`}
              >
                <div className="text-base font-extrabold" style={{ color: bar.color }}>
                  {bar.note}
                </div>
                <div className="text-[11px] opacity-75 mt-0.5">{Math.round(bar.hz)} Hz</div>
              </button>
            );
          })}
        </div>

        {/* Fine-tuning Resonance Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <HapticSlider
            label="Długość fazy wysokiego rezonansu (ogon cymbałek)"
            value={resonanceMs}
            min={140}
            max={950}
            step={10}
            unit="ms"
            onChange={(v) => setResonanceMs(v)}
          />
          <HapticSlider
            label="Częstotliwość podstawowa szkła"
            value={Math.round(baseFreqHz)}
            min={660}
            max={2400}
            step={10}
            unit="Hz"
            onChange={(v) => setBaseFreqHz(v)}
          />
          <HapticSlider
            label="Dźwięczność / Alikwoty szkła (shimmer)"
            value={brilliance}
            min={10}
            max={100}
            step={2}
            unit="%"
            onChange={(v) => setBrilliance(v)}
          />
          <HapticSlider
            label="Twardość uderzenia (pałeczka)"
            value={strikeHardness}
            min={10}
            max={100}
            step={2}
            unit="%"
            onChange={(v) => setStrikeHardness(v)}
          />
          <HapticSlider
            label="Impuls wibracji haptycznej"
            value={vibrateMs}
            min={0}
            max={40}
            step={2}
            unit="ms"
            onChange={(v) => setVibrateMs(v)}
          />
        </div>
      </section>

      {/* 3. Unified Lightweight Visual Button & Highlight Designer */}
      <section className={`rounded-2xl border p-5 sm:p-6 shadow-sm ${cardSurface}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-400">
              <Layers className="w-3.5 h-3.5" /> Zunifikowany Kreator Przycisków Wizualnych
            </div>
            <h2 className="text-xl font-bold mt-0.5">
              Wygląd, forma podświetlenia i dźwięk w jednym lekkim panelu
            </h2>
          </div>
          <button
            type="button"
            onClick={handleCopyConfig}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-current/20 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Skopiowano preset JSON' : 'Kopiuj preset przycisku'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          {/* Live Interactive Preview Stage */}
          <div
            className={`lg:col-span-5 rounded-2xl border p-8 flex flex-col items-center justify-center gap-4 min-h-[210px] ${
              isDark
                ? 'bg-gradient-to-br from-slate-950 via-[#081c18] to-slate-900 border-emerald-400/20'
                : 'bg-gradient-to-br from-slate-100 via-white to-indigo-50 border-slate-200'
            }`}
          >
            <TactileButton
              variant={btnVariant}
              illuminationPresetOverride={btnIllum}
              glowColorOverride={btnGlow}
              materialOverride={
                FOUR_CORE_SENSATIONS.find((s) => s.id === activeSensation)?.material ?? 'shiny-glass'
              }
              onClick={triggerDesignedButton}
              className={btnVariant === 'neumorphic-icon' ? 'w-16 h-16 flex items-center justify-center' : 'px-7 py-3.5 text-sm font-bold'}
            >
              {btnVariant === 'neumorphic-icon' ? '✦' : btnLabel}
            </TactileButton>
            <div className="text-[11px] opacity-70 text-center">
              Najedź kursorem (podświetlenie) i kliknij (dźwięk: <strong>{activeSensation}</strong>)
            </div>
          </div>

          {/* Lightweight Visual Controls */}
          <div className="lg:col-span-7 space-y-3.5">
            <div>
              <label className="block text-xs font-semibold opacity-75 mb-1">Etykieta przycisku</label>
              <input
                type="text"
                value={btnLabel}
                onChange={(e) => setBtnLabel(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl border text-sm ${
                  isDark
                    ? 'bg-slate-950/70 border-emerald-400/25 text-white'
                    : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>

            <div>
              <div className="text-xs font-semibold opacity-75 mb-1.5">Forma przycisku</div>
              <div className="flex flex-wrap gap-2">
                {VISUAL_SHAPES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setBtnVariant(s.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                      btnVariant === s.id
                        ? 'bg-sky-500 text-white border-sky-400'
                        : 'border-current/20 opacity-80 hover:opacity-100'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold opacity-75 mb-1.5">Forma podświetlenia</div>
              <div className="flex flex-wrap gap-1.5">
                {BUTTON_ILLUMINATION_PRESETS.slice(0, 6).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setBtnIllum(preset.id);
                      applyButtonIlluminationPreset(preset.id);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                      btnIllum === preset.id
                        ? 'bg-indigo-600 text-white border-indigo-400'
                        : 'border-current/20 opacity-80 hover:opacity-100'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold opacity-75 mb-1.5">Kolor poświaty optycznej</div>
              <div className="flex items-center gap-2">
                {HIGHLIGHT_SWATCHES.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => {
                      setBtnGlow(hex);
                      updateEngraving({ glowColor: hex });
                    }}
                    style={{
                      backgroundColor: hex,
                      boxShadow: btnGlow === hex ? `0 0 0 3px ${hex}66` : undefined,
                    }}
                    className="w-7 h-7 rounded-full border-2 border-white/80 cursor-pointer"
                    title={hex}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
