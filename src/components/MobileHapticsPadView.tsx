import React, { useState } from 'react';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Smartphone,
  Sparkles,
  Vibrate,
  Volume2,
} from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import { BM_CLINIC_REGION_HAPTICS } from '../lib/bmClinicProktologiaScreen';
import { hapticAudio } from '../lib/hapticAudioEngine';
import {
  HapticMaterialType,
  MATERIAL_PROFILES,
  MINIMALIST_LOW_CLICK_VARIANTS,
  MinimalistLowClickId,
} from '../types/studio';
import { TactileButton } from './ui/TactileButton';

interface MobileHapticsPadViewProps {
  onExitToStudio: () => void;
}

export const MobileHapticsPadView: React.FC<MobileHapticsPadViewProps> = ({
  onExitToStudio,
}) => {
  const {
    palette,
    haptic,
    updateHaptic,
    synth,
    patterns,
    pulseInteraction,
    workingFrontendImage,
  } = useStudio();
  const isDark = palette === 'emerald-clinic';

  const [mobileTab, setMobileTab] = useState<'screen' | 'pad'>(
    workingFrontendImage ? 'screen' : 'pad'
  );
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [lastFeedback, setLastFeedback] = useState<string>('Dotknij dowolny przycisk poniżej');
  const [iosSwitchOn, setIosSwitchOn] = useState(true);
  const [showHotspots, setShowHotspots] = useState(false);
  const [flashingId, setFlashingId] = useState<string | null>(null);
  const [overrideSound, setOverrideSound] = useState<MinimalistLowClickId | 'auto'>('auto');

  const unlockAndPing = () => {
    setAudioUnlocked(true);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([10, 20, 14]);
      } catch {
        // Ignore on iOS
      }
    }
    hapticAudio.triggerMinimalistLowClick('crystal-glass-tap-9ms', 0.75);
    pulseInteraction(1);
    setLastFeedback('Audio i haptyka aktywne — dotykaj przycisków');
  };

  const triggerProfile = (id: MinimalistLowClickId, label: string, vibMs: number) => {
    setAudioUnlocked(true);
    const gain = Math.max(0.25, haptic.intensity / 100);
    hapticAudio.triggerMinimalistLowClick(id, gain);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(vibMs);
      } catch {
        // Ignore
      }
    }
    pulseInteraction(0.95);
    setLastFeedback(`${label} (${vibMs} ms)`);
  };

  const materials = Object.keys(MATERIAL_PROFILES) as HapticMaterialType[];

  return (
    <div
      className={`min-h-screen px-4 py-4 pb-14 transition-colors ${
        isDark
          ? 'bg-gradient-to-b from-[#061512] via-[#0B231E] to-[#071915] text-emerald-50'
          : 'bg-gradient-to-b from-[#EFEFFA] via-[#E5E9FA] to-[#F3EEFB] text-slate-900'
      }`}
    >
      <div className="max-w-md mx-auto space-y-4">
        {/* Top Mobile Bar */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-emerald-300">
              <Smartphone className="w-3.5 h-3.5" />
              <span>Aether Mobile Test</span>
            </div>
            <h1 className="text-base font-bold leading-tight">
              Haptyka i Interakcje na Żywo
            </h1>
          </div>
          <button
            type="button"
            onClick={onExitToStudio}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 border cursor-pointer ${
              isDark
                ? 'bg-emerald-950/70 border-emerald-400/25 text-emerald-100'
                : 'bg-white/85 border-slate-200 text-slate-800'
            }`}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Studio</span>
          </button>
        </div>

        {/* Mode Switcher: Live BM Clinic Screen vs 14 Sounds Pad */}
        {workingFrontendImage && (
          <div
            className={`grid grid-cols-2 gap-1.5 p-1 rounded-2xl border ${
              isDark
                ? 'bg-emerald-950/70 border-emerald-400/20'
                : 'bg-white/75 border-white shadow-sm'
            }`}
          >
            <button
              type="button"
              onClick={() => setMobileTab('screen')}
              className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                mobileTab === 'screen'
                  ? isDark
                    ? 'bg-emerald-400 text-emerald-950 shadow'
                    : 'bg-slate-900 text-white shadow'
                  : 'opacity-70'
              }`}
            >
              Ekran BM Clinic ({workingFrontendImage.regions.length} stref)
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('pad')}
              className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                mobileTab === 'pad'
                  ? isDark
                    ? 'bg-emerald-400 text-emerald-950 shadow'
                    : 'bg-slate-900 text-white shadow'
                  : 'opacity-70'
              }`}
            >
              Pad 14 dźwięków
            </button>
          </div>
        )}

        {/* One-Tap Audio & Haptics Unlock */}
        {!audioUnlocked && (
          <button
            type="button"
            onClick={unlockAndPing}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 dark:from-emerald-500 dark:to-teal-500 text-white dark:text-emerald-950 font-bold text-xs shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-transform cursor-pointer"
          >
            <Volume2 className="w-4 h-4" />
            <span>Dotknij raz, aby aktywować dźwięk i wibracje</span>
          </button>
        )}

        {/* Live Telemetry Pill */}
        <div
          className={`px-3.5 py-2.5 rounded-2xl border flex items-center justify-between gap-2 text-xs ${
            isDark
              ? 'bg-emerald-950/65 border-emerald-400/20 text-emerald-100'
              : 'bg-white/80 border-white text-slate-700 shadow-sm'
          }`}
        >
          <span className="inline-flex items-center gap-2 font-medium truncate">
            <Vibrate className="w-4 h-4 text-indigo-500 dark:text-emerald-400 shrink-0" />
            <span className="truncate">{lastFeedback}</span>
          </span>
          <span className="font-mono text-[11px] opacity-75 shrink-0">
            {haptic.intensity}%
          </span>
        </div>

        {/* TAB 1: Interactive BM Clinic Uploaded Screen with Mapped Button Zones */}
        {mobileTab === 'screen' && workingFrontendImage && (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold opacity-75">
                Klikaj bezpośrednio przyciski na ekranie:
              </span>
              <button
                type="button"
                onClick={() => setShowHotspots((v) => !v)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium inline-flex items-center gap-1 border cursor-pointer ${
                  isDark
                    ? 'bg-emerald-950/70 border-emerald-400/25 text-emerald-100'
                    : 'bg-white/85 border-slate-200 text-slate-700'
                }`}
              >
                {showHotspots ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span>{showHotspots ? 'Ukryj ramki' : 'Pokaż strefy'}</span>
              </button>
            </div>

            {/* Interactive Portrait Phone Screen */}
            <div className="relative rounded-3xl overflow-hidden shadow-2xl border border-cyan-400/30 bg-[#041418]">
              <img
                src={workingFrontendImage.dataUrl}
                alt={workingFrontendImage.fileName}
                className="w-full h-auto block select-none pointer-events-none"
              />
              <div className="absolute inset-0">
                {workingFrontendImage.regions.map((reg) => {
                  const cfg = BM_CLINIC_REGION_HAPTICS[reg.id];
                  const isFlashing = flashingId === reg.id;
                  return (
                    <button
                      key={reg.id}
                      type="button"
                      aria-label={reg.label}
                      onPointerDown={() => {
                        setFlashingId(reg.id);
                        window.setTimeout(() => {
                          setFlashingId((prev) => (prev === reg.id ? null : prev));
                        }, 210);
                        const soundId: MinimalistLowClickId =
                          overrideSound !== 'auto'
                            ? overrideSound
                            : cfg?.soundId || 'crystal-glass-tap-9ms';
                        const vibMs = cfg?.vibrateMs ?? 8;
                        triggerProfile(soundId, reg.label, vibMs);
                      }}
                      style={{
                        left: `${reg.xPct}%`,
                        top: `${reg.yPct}%`,
                        width: `${reg.wPct}%`,
                        height: `${reg.hPct}%`,
                        backgroundColor: isFlashing
                          ? 'rgba(56, 224, 240, 0.34)'
                          : showHotspots
                            ? 'rgba(56, 224, 240, 0.12)'
                            : 'transparent',
                        borderColor: isFlashing
                          ? 'rgba(125, 249, 255, 0.95)'
                          : showHotspots
                            ? 'rgba(56, 224, 240, 0.6)'
                            : 'transparent',
                        boxShadow: isFlashing
                          ? '0 0 24px rgba(56, 224, 240, 0.8), inset 0 0 16px rgba(255,255,255,0.45)'
                          : undefined,
                      }}
                      className="absolute rounded-2xl border transition-all duration-100 active:scale-[0.96] cursor-pointer"
                    />
                  );
                })}
              </div>
            </div>

            {/* Quick Sound Override Strip for Testing Any Sound on the BM Clinic Buttons */}
            <div
              className={`p-3.5 rounded-2xl border space-y-2 ${
                isDark
                  ? 'bg-emerald-950/55 border-emerald-400/20'
                  : 'bg-white/80 border-white shadow-sm'
              }`}
            >
              <label className="block text-[11px] font-semibold">
                Profil dźwiękowy na przyciskach ekranu:
              </label>
              <select
                value={overrideSound}
                onChange={(e) => {
                  const val = e.target.value as MinimalistLowClickId | 'auto';
                  setOverrideSound(val);
                  if (val !== 'auto') {
                    triggerProfile(val, `Wybrany profil: ${val}`, 8);
                  }
                }}
                className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                  isDark
                    ? 'bg-emerald-950 border-emerald-400/25 text-emerald-50'
                    : 'bg-white border-slate-200 text-slate-900'
                }`}
              >
                <option value="auto">
                  Automatyczny (dopasowany do roli każdego przycisku BM Clinic)
                </option>
                {MINIMALIST_LOW_CLICK_VARIANTS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.namePl} ({v.shortLabelPl})
                  </option>
                ))}
              </select>
            </div>
          </section>
        )}

        {/* TAB 2: Full 14 Sound Profiles & Materials Pad */}
        {mobileTab === 'pad' && (
          <>
            {/* Intensity Slider */}
            <div
              className={`p-4 rounded-2xl border space-y-2 ${
                isDark
                  ? 'bg-emerald-950/55 border-emerald-400/20'
                  : 'bg-white/75 border-white shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-semibold">
                <span>Siła impulsu i głośność stuknięcia</span>
                <span className="font-mono">{haptic.intensity}%</span>
              </div>
              <input
                type="range"
                min={15}
                max={100}
                value={haptic.intensity}
                onChange={(e) => updateHaptic({ enabled: true, intensity: Number(e.target.value) })}
                className="w-full accent-indigo-600 dark:accent-emerald-400"
              />
            </div>

            {/* Interactive Tactile Buttons Playground */}
            <section className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider opacity-75 inline-flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Przyciski interaktywne (kliknij lub przytrzymaj)</span>
              </h2>

              <div className="grid grid-cols-1 gap-3">
                <TactileButton
                  variant="primary-cta"
                  className="w-full py-4 px-5 text-base"
                  subtitle="Główny przycisk CTA · przytrzymaj, by poczuć rampę"
                  onClick={() => {
                    setAudioUnlocked(true);
                    setLastFeedback('CTA Primary — wciśnięcie + sprzęgło powrotne');
                  }}
                >
                  Umów konsultację (Primary CTA)
                </TactileButton>

                <div className="grid grid-cols-2 gap-3">
                  {materials.map((mat) => {
                    const profile = MATERIAL_PROFILES[mat];
                    return (
                      <TactileButton
                        key={mat}
                        variant="glass-card"
                        materialOverride={mat}
                        selected={haptic.material === mat}
                        className="w-full py-3.5 px-4 text-sm"
                        subtitle={profile.englishLabel}
                        onClick={() => {
                          setAudioUnlocked(true);
                          updateHaptic({ enabled: true, material: mat });
                          hapticAudio.triggerPress(synth, { ...haptic, material: mat }, patterns, {
                            material: mat,
                          });
                          setLastFeedback(`Materiał: ${profile.label}`);
                        }}
                      >
                        {profile.label}
                      </TactileButton>
                    );
                  })}

                  <label
                    className={`rounded-2xl p-3.5 border flex items-center justify-between gap-2 cursor-pointer select-none ${
                      isDark
                        ? 'bg-emerald-950/60 border-emerald-400/20'
                        : 'bg-white/75 border-white shadow-sm'
                    }`}
                  >
                    <span className="flex flex-col">
                      <span className="text-xs font-semibold">Natywny iOS Switch</span>
                      <span className="text-[10px] opacity-65">Taptic Engine iOS 17.4+</span>
                    </span>
                    <input
                      type="checkbox"
                      // @ts-expect-error Safari iOS 17.4+ native haptic switch attribute
                      switch=""
                      checked={iosSwitchOn}
                      onChange={(e) => {
                        setIosSwitchOn(e.target.checked);
                        triggerProfile('leica-shutter-snap-6ms', 'Przełącznik iOS Switch', 6);
                      }}
                      className="w-11 h-6 accent-indigo-600 dark:accent-emerald-400 cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            </section>

            {/* All 14 Minimalist Sound Profiles */}
            <section className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider opacity-75">
                Wszystkie 14 sygnatur dźwiękowych (&lt;160 Hz)
              </h2>
              <div className="grid grid-cols-1 gap-2.5">
                {MINIMALIST_LOW_CLICK_VARIANTS.map((spec) => {
                  const isSelected = haptic.minimalistClickVariant === spec.id;
                  return (
                    <button
                      key={spec.id}
                      type="button"
                      onPointerDown={() => triggerProfile(spec.id, spec.namePl, spec.vibratePulseMs)}
                      onClick={() => updateHaptic({ enabled: true, minimalistClickVariant: spec.id })}
                      className={`w-full p-3.5 rounded-2xl border text-left transition-all active:scale-[0.98] cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? isDark
                            ? 'bg-emerald-400/15 border-emerald-400 shadow-md'
                            : 'bg-white border-indigo-500 shadow-md ring-1 ring-indigo-500/30'
                          : isDark
                            ? 'bg-emerald-950/55 border-emerald-400/15'
                            : 'bg-white/75 border-white shadow-sm'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{spec.namePl}</div>
                        <div className="text-[11px] opacity-70 truncate mt-0.5">
                          {spec.shortLabelPl} · {spec.categoryPl}
                        </div>
                      </div>
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: spec.accentHex }}
                      />
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};
