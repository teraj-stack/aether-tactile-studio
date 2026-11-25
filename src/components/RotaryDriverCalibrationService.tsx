import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Minus,
  Plus,
  RotateCcw,
  Save,
  Sliders,
  Trash2,
  Zap,
} from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import { hapticAudio } from '../lib/hapticAudioEngine';
import {
  CalibrationTargetCharacter,
  DEFAULT_ROTARY_DRIVER_CALIBRATION,
} from '../types/studio';
import { HapticSlider } from './ui/HapticSlider';

const REFERENCE_IMAGE_SRC =
  '/assets/aistudio/real-metal-volume-button-free-vector_f64353d6.jpg';

const TARGET_CHARACTER_OPTIONS: Array<{
  id: CalibrationTargetCharacter;
  label: string;
  sub: string;
}> = [
  {
    id: 'reference-cnc',
    label: 'Wzorzec z Obrazu (120T CNC)',
    sub: '270° · co 10 główna · 74 Hz',
  },
  {
    id: 'studio-master',
    label: 'Attenuator Studio (60T)',
    sub: 'Wyrazisty skok przekaźnikowy',
  },
  {
    id: 'heavy-flywheel',
    label: 'Koło Zamachowe (24T)',
    sub: 'Głęboka kulkowa zapadka 56 Hz',
  },
  {
    id: 'silent-night',
    label: 'Tłumik Olejowy (96T)',
    sub: 'Cichy mikro-klik nocny 48 Hz',
  },
];

export const RotaryDriverCalibrationService: React.FC = () => {
  const {
    palette,
    depth,
    driverCalibration,
    updateDriverCalibration,
    calibrationReport,
    savedCalibrations,
    saveDriverCalibrationProfile,
    loadDriverCalibrationProfile,
    removeDriverCalibrationProfile,
    runDriverCalibrationService,
    pulseInteraction,
  } = useStudio();

  // Default 11 o'clock position (~41.7% of 270 deg = -22.5 deg) matching the reference photo
  const [rotorNorm, setRotorNorm] = useState(0.4167);
  const [angularVelocityDeg, setAngularVelocityDeg] = useState(0);
  const [axialPressed, setAxialPressed] = useState(false);
  const [lastEventLabel, setLastEventLabel] = useState(
    'Gotowy · Pozycja referencyjna -22.5° (kreska 50/120)'
  );
  const [targetCharacter, setTargetCharacter] =
    useState<CalibrationTargetCharacter>('reference-cnc');
  const [calibratingPhase, setCalibratingPhase] = useState<string | null>(null);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [copiedJson, setCopiedJson] = useState(false);
  const [refImgError, setRefImgError] = useState(false);
  const [zoomReference, setZoomReference] = useState(false);
  const [knobVisualMode, setKnobVisualMode] = useState<'3d-knurled' | 'flat-2d'>('3d-knurled');

  const dialRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const lastBucketRef = useRef(
    Math.round(0.4167 * DEFAULT_ROTARY_DRIVER_CALIBRATION.detentCount)
  );
  const lastNormRef = useRef(0.4167);
  const lastMoveTimeRef = useRef<number>(0);
  const boundaryLatchRef = useRef<'min' | 'max' | null>(null);
  const sweepTimerRef = useRef<number | null>(null);
  const driverCalRef = useRef(driverCalibration);

  useEffect(() => {
    driverCalRef.current = driverCalibration;
  }, [driverCalibration]);

  useEffect(() => {
    return () => {
      if (sweepTimerRef.current !== null) {
        window.clearInterval(sweepTimerRef.current);
      }
    };
  }, []);

  const isDark = palette === 'emerald-clinic';
  const halfSweep = driverCalibration.sweepAngleDeg / 2;
  const currentAngleDeg = -halfSweep + rotorNorm * driverCalibration.sweepAngleDeg;
  const activeTickIndex = Math.round(rotorNorm * driverCalibration.detentCount);
  const isOnMajorTick =
    activeTickIndex % Math.max(1, driverCalibration.majorTickEvery) === 0;
  const stepAngleDeg = Number(
    (driverCalibration.sweepAngleDeg / Math.max(1, driverCalibration.detentCount)).toFixed(2)
  );

  // Compute instantaneous <160 Hz body frequency for telemetry readout
  const liveLowToneHz = Math.min(
    155,
    Math.max(
      34,
      Math.round(
        Math.min(156, driverCalibration.lowBodyFreqHz) *
          (0.9 + rotorNorm * 0.16) *
          (isOnMajorTick ? 1.05 : 0.98)
      )
    )
  );

  const cardSurfaceStyle: React.CSSProperties = {
    borderRadius: `${depth.borderRadius}px`,
    backdropFilter: `blur(${depth.glassBlur}px)`,
    backgroundColor: isDark
      ? `rgba(11, 34, 29, ${depth.glassOpacity})`
      : `rgba(255, 255, 255, ${depth.glassOpacity})`,
    boxShadow: isDark
      ? `0 ${depth.elevation}px ${depth.blur}px rgba(0,0,0,0.46)`
      : `0 ${depth.elevation}px ${depth.blur}px rgba(88, 76, 148, 0.13)`,
  };

  const applyRotorNormalized = (
    nextNormRaw: number,
    sourceLabel = 'Obrót manualny'
  ) => {
    const clamped = Math.max(0, Math.min(1, nextNormRaw));
    const now = performance.now();
    const dtSec =
      lastMoveTimeRef.current > 0
        ? Math.max(0.008, (now - lastMoveTimeRef.current) / 1000)
        : 0.04;
    const deltaDeg =
      Math.abs(clamped - lastNormRef.current) * driverCalRef.current.sweepAngleDeg;
    const speedDegPerSec = Math.min(999, Math.round(deltaDeg / dtSec));
    const velocityNorm = Math.min(1, speedDegPerSec / 420);

    lastMoveTimeRef.current = now;
    lastNormRef.current = clamped;
    setRotorNorm(clamped);
    setAngularVelocityDeg(speedDegPerSec);

    const cal = driverCalRef.current;

    // Check physical end-stops (-halfSweep / +halfSweep)
    if (clamped <= 0.001 && boundaryLatchRef.current !== 'min') {
      boundaryLatchRef.current = 'min';
      lastBucketRef.current = 0;
      hapticAudio.triggerCalibratedRotaryEndStop(cal, 'min');
      pulseInteraction(0.9);
      setLastEventLabel(`Odbojnik krańcowy MIN (-${halfSweep.toFixed(0)}°) · 46 Hz`);
      return;
    }
    if (clamped >= 0.999 && boundaryLatchRef.current !== 'max') {
      boundaryLatchRef.current = 'max';
      lastBucketRef.current = cal.detentCount;
      hapticAudio.triggerCalibratedRotaryEndStop(cal, 'max');
      pulseInteraction(0.9);
      setLastEventLabel(`Odbojnik krańcowy MAX (+${halfSweep.toFixed(0)}°) · 62 Hz`);
      return;
    }
    if (clamped > 0.015 && clamped < 0.985) {
      boundaryLatchRef.current = null;
    }

    const nextBucket = Math.round(clamped * cal.detentCount);
    if (nextBucket !== lastBucketRef.current) {
      const crossedCount = Math.min(4, Math.abs(nextBucket - lastBucketRef.current));
      lastBucketRef.current = nextBucket;
      const major = nextBucket % Math.max(1, cal.majorTickEvery) === 0;
      hapticAudio.triggerCalibratedRotaryDetent(cal, clamped, major, velocityNorm);
      pulseInteraction(major ? 0.55 : 0.25 * crossedCount);
      const degVal = (-cal.sweepAngleDeg / 2 + clamped * cal.sweepAngleDeg).toFixed(1);
      setLastEventLabel(
        `${sourceLabel} · Kreska ${nextBucket}/${cal.detentCount} (${degVal}°) · ${
          major ? 'GŁÓWNA ZAPADKA' : 'Mikro-zapadka'
        }`
      );
    }
  };

  const updateFromPointer = (clientX: number, clientY: number) => {
    if (!dialRef.current) return;
    const rect = dialRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const rad = Math.atan2(clientY - cy, clientX - cx);
    // 0 deg at 12 o'clock, negative left (-180..0), positive right (0..+180)
    let degFromTop = (rad * 180) / Math.PI + 90;
    if (degFromTop > 180) degFromTop -= 360;

    const maxHalf = driverCalRef.current.sweepAngleDeg / 2;
    // Dead-zone at bottom (between +maxHalf and -maxHalf): latch to nearest stop instead of wrapping abruptly
    let clampedDeg = degFromTop;
    if (degFromTop > maxHalf) {
      clampedDeg = maxHalf;
    } else if (degFromTop < -maxHalf) {
      clampedDeg = -maxHalf;
    }

    const norm = (clampedDeg + maxHalf) / driverCalRef.current.sweepAngleDeg;
    applyRotorNormalized(norm, 'Obrót tarczy');
  };

  const stepByTicks = (deltaTicks: number) => {
    const stepNorm = deltaTicks / Math.max(1, driverCalibration.detentCount);
    applyRotorNormalized(rotorNorm + stepNorm, deltaTicks > 0 ? 'Krok +' : 'Krok −');
  };

  const handleAxialDown = () => {
    setAxialPressed(true);
    hapticAudio.triggerCalibratedRotaryAxialPush(driverCalibration, 'press');
    pulseInteraction(1.0);
    setLastEventLabel(
      `Klik osiowy trzpienia (PRESS) · ${driverCalibration.lowBodyFreqHz} Hz + mikroprzełącznik myszy`
    );
  };

  const handleAxialUp = () => {
    if (!axialPressed) return;
    setAxialPressed(false);
    hapticAudio.triggerCalibratedRotaryAxialPush(driverCalibration, 'release');
    setLastEventLabel(
      `Powrót sprzęgła trzpienia (RELEASE) · Sprzęgło ${driverCalibration.backlashClutch}%`
    );
  };

  const handleRunAutoCalibration = async () => {
    if (sweepTimerRef.current !== null) {
      window.clearInterval(sweepTimerRef.current);
      sweepTimerRef.current = null;
    }

    setCalibratingPhase('Faza 1/3 · Pomiar odbojnika MIN i rezonansu trzpienia (<160 Hz)...');
    setCalibrationProgress(10);

    await runDriverCalibrationService(targetCharacter);

    // 18-step deterministic mechanical sweep: MIN -> Full 270° scale -> MAX -> Reference 11 o'clock + Axial Push
    const waypoints = [
      0.0, 0.08, 0.167, 0.25, 0.333, 0.417, 0.5, 0.583, 0.667, 0.75, 0.833, 0.917,
      1.0, 0.833, 0.667, 0.5, 0.4167,
    ];
    let idx = 0;

    sweepTimerRef.current = window.setInterval(() => {
      if (idx < waypoints.length) {
        const wp = waypoints[idx];
        if (idx === 4) {
          setCalibratingPhase(
            'Faza 2/3 · Kalibracja podziałki drobnej i akcentów głównych kresek...'
          );
        } else if (idx === 12) {
          setCalibratingPhase(
            'Faza 3/3 · Weryfikacja odbojnika MAX (+135°) i osiowego kliku myszy...'
          );
        }
        setCalibrationProgress(Math.round(((idx + 1) / (waypoints.length + 1)) * 100));
        applyRotorNormalized(wp, 'Auto-kalibracja');
        idx += 1;
      } else {
        if (sweepTimerRef.current !== null) {
          window.clearInterval(sweepTimerRef.current);
          sweepTimerRef.current = null;
        }
        hapticAudio.triggerCalibratedRotaryAxialPush(driverCalRef.current, 'press');
        pulseInteraction(1.15);
        setCalibrationProgress(100);
        setCalibratingPhase(null);
        setLastEventLabel(
          `Kalibracja zakończona · Skala ${driverCalRef.current.detentCount} kroków (${(
            driverCalRef.current.sweepAngleDeg / driverCalRef.current.detentCount
          ).toFixed(2)}°/krok)`
        );
      }
    }, 105);
  };

  const handleCopyJson = async () => {
    const payload = JSON.stringify(
      {
        controllerModel: 'CNC Radial Spun-Metal 270° (Reference Vector)',
        acousticInvariants: {
          primaryBodyToneSub160Hz: driverCalibration.lowBodyFreqHz,
          secondarySwitchLayer: 'classic-desktop-left-mouse-microswitch',
          expandingClickRings: false,
        },
        calibration: driverCalibration,
        diagnostics: calibrationReport,
      },
      null,
      2
    );
    try {
      await navigator.clipboard.writeText(payload);
      setCopiedJson(true);
      window.setTimeout(() => setCopiedJson(false), 1800);
    } catch {
      // Ignore clipboard permission issues
    }
  };

  const handleDownloadJson = () => {
    const payload = JSON.stringify(
      {
        controllerModel: 'CNC Radial Spun-Metal 270°',
        calibration: driverCalibration,
        diagnostics: calibrationReport,
      },
      null,
      2
    );
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kalibracja-sterownika-${driverCalibration.detentCount}t.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Precompute SVG graduation ticks matching the attached controller image
  const graduationTicks = useMemo(() => {
    const count = Math.max(12, Math.min(120, driverCalibration.detentCount));
    const majorEvery = Math.max(2, driverCalibration.majorTickEvery);
    const sweep = driverCalibration.sweepAngleDeg;
    const startDeg = -sweep / 2;
    const items: Array<{
      index: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      isMajor: boolean;
    }> = [];

    for (let i = 0; i <= count; i++) {
      const deg = startDeg + (i / count) * sweep;
      const rad = ((deg - 90) * Math.PI) / 180;
      const isMajor = i % majorEvery === 0;
      const rInner = isMajor ? 127 : 131;
      const rOuter = isMajor ? 156 : 149;
      items.push({
        index: i,
        x1: 170 + Math.cos(rad) * rInner,
        y1: 170 + Math.sin(rad) * rInner,
        x2: 170 + Math.cos(rad) * rOuter,
        y2: 170 + Math.sin(rad) * rOuter,
        isMajor,
      });
    }
    return items;
  }, [
    driverCalibration.detentCount,
    driverCalibration.majorTickEvery,
    driverCalibration.sweepAngleDeg,
  ]);

  return (
    <section
      style={cardSurfaceStyle}
      className="p-6 sm:p-8 border border-white/80 dark:border-emerald-400/20 space-y-7"
    >
      {/* Top Header & Service Actions */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="text-xs text-slate-500 dark:text-emerald-300/80 flex flex-wrap items-center gap-1.5">
            <span>Usługa Kalibracji Sterownika CNC</span>
            <span aria-hidden="true">·</span>
            <span>Skala 270° ({driverCalibration.detentCount} zapadek)</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Ton 1: {driverCalibration.lowBodyFreqHz} Hz (&lt;160 Hz) + Ton 2: Lewy Przycisk Myszy
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-emerald-50 mt-1">
            Stół Kalibracyjny Dźwięków Kliknięć i Haptyki Pokrętła Metalowego
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-emerald-100/75 mt-1">
            Dedykowany moduł kalibracji dla załączonego sterownika ze szczotkowanej stali nierdzewnej:
            dstraja gęstość podziałki, akcent głównych kresek, rezonans niskiego tonu poniżej 160 Hz,
            transjent mikroprzełącznika myszy, odbojniki krańcowe oraz klik osiowy trzpienia.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopyJson}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white/80 dark:bg-emerald-950/75 border border-slate-200/80 dark:border-emerald-400/25 text-xs font-medium text-slate-700 dark:text-emerald-100 inline-flex items-center gap-1.5 cursor-pointer hover:bg-white transition-colors whitespace-nowrap"
          >
            {copiedJson ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedJson ? 'Skopiowano profil' : 'Kopiuj JSON'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadJson}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white/80 dark:bg-emerald-950/75 border border-slate-200/80 dark:border-emerald-400/25 text-xs font-medium text-slate-700 dark:text-emerald-100 inline-flex items-center gap-1.5 cursor-pointer hover:bg-white transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Eksportuj .json</span>
          </button>

          <button
            type="button"
            onClick={() => {
              loadDriverCalibrationProfile({
                id: 'reset-ref',
                name: 'Wzorzec z Obrazu',
                controllerModel: 'CNC Radial Spun-Metal 270°',
                createdAt: 'Teraz',
                config: DEFAULT_ROTARY_DRIVER_CALIBRATION,
              });
              applyRotorNormalized(0.4167, 'Reset wzorca');
            }}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white/80 dark:bg-emerald-950/75 border border-slate-200/80 dark:border-emerald-400/25 text-xs font-medium text-slate-700 dark:text-emerald-100 inline-flex items-center gap-1.5 cursor-pointer hover:bg-white transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Przywróć 120T</span>
          </button>
        </div>
      </div>

      {/* Main 12-Column Calibration Bench: Left (Reference + Live Spun-Metal Dial) | Right (Sliders + Auto-Calibration Service) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 6 Columns: Interactive 1:1 Spun-Metal Rotary Dial + Reference Controller Card */}
        <div className="lg:col-span-6 space-y-5">
          {/* Interactive Machined Dial Stage */}
          <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-b from-slate-100/95 via-slate-200/80 to-slate-100/95 dark:from-emerald-950/85 dark:via-slate-900/90 dark:to-emerald-950/85 border border-white/90 dark:border-emerald-400/20 shadow-inner space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium text-slate-700 dark:text-emerald-100">
                Interaktywny replikator sterownika CNC (przeciągnij, użyj kółka myszy lub kroków)
              </span>
              <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-emerald-200">
                {currentAngleDeg >= 0 ? `+${currentAngleDeg.toFixed(1)}` : currentAngleDeg.toFixed(1)}° ·{' '}
                {Math.round(rotorNorm * 100)}%
              </span>
            </div>

            {/* 1:1 Spun-Metal Dial Replica */}
            <div className="relative flex items-center justify-center py-1">
              <div
                ref={dialRef}
                role="slider"
                tabIndex={0}
                aria-label="Kalibrowane pokrętło sterownika ze szczotkowanego metalu"
                aria-valuemin={0}
                aria-valuemax={driverCalibration.detentCount}
                aria-valuenow={activeTickIndex}
                onPointerDown={(e) => {
                  draggingRef.current = true;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  updateFromPointer(e.clientX, e.clientY);
                }}
                onPointerMove={(e) => {
                  if (!draggingRef.current) return;
                  updateFromPointer(e.clientX, e.clientY);
                }}
                onPointerUp={(e) => {
                  if (!draggingRef.current) return;
                  draggingRef.current = false;
                  e.currentTarget.releasePointerCapture(e.pointerId);
                  setAngularVelocityDeg(0);
                  hapticAudio.triggerCalibratedRotaryAxialPush(
                    driverCalibration,
                    'release'
                  );
                }}
                onWheel={(e) => {
                  e.preventDefault();
                  stepByTicks(e.deltaY < 0 ? 1 : -1);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    stepByTicks(1);
                  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    stepByTicks(-1);
                  } else if (e.key === 'PageUp') {
                    e.preventDefault();
                    stepByTicks(driverCalibration.majorTickEvery);
                  } else if (e.key === 'PageDown') {
                    e.preventDefault();
                    stepByTicks(-driverCalibration.majorTickEvery);
                  } else if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    handleAxialDown();
                    window.setTimeout(() => {
                      setAxialPressed(false);
                    }, 120);
                  }
                }}
                className="relative w-[290px] h-[290px] sm:w-[336px] sm:h-[336px] flex items-center justify-center select-none touch-none cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-2xl"
              >
                {/* Precision 270° Graduation Scale SVG */}
                <svg
                  viewBox="0 0 340 340"
                  className="pointer-events-none absolute inset-0 w-full h-full"
                >
                  {graduationTicks.map((t) => {
                    const isPassed = t.index <= activeTickIndex;
                    const isCurrent = t.index === activeTickIndex;
                    const strokeColor = isCurrent
                      ? isDark
                        ? '#6ee7b7'
                        : '#4f46e5'
                      : t.isMajor
                        ? isDark
                          ? isPassed
                            ? '#d1fae5'
                            : 'rgba(209,250,229,0.58)'
                          : isPassed
                            ? '#0f172a'
                            : 'rgba(15,23,42,0.72)'
                        : isDark
                          ? isPassed
                            ? 'rgba(110,231,183,0.65)'
                            : 'rgba(167,243,208,0.24)'
                          : isPassed
                            ? 'rgba(51,65,85,0.75)'
                            : 'rgba(71,85,105,0.42)';

                    return (
                      <line
                        key={t.index}
                        x1={t.x1}
                        y1={t.y1}
                        x2={t.x2}
                        y2={t.y2}
                        stroke={strokeColor}
                        strokeWidth={isCurrent ? 2.5 : t.isMajor ? 1.85 : 0.95}
                        strokeLinecap="round"
                      />
                    );
                  })}
                </svg>

                {/* Recessed Outer Shadow Moat & Polished Chrome Bevel Collar OR True 3D Knurled CNC Knob */}
                {knobVisualMode === '3d-knurled' ? (
                  <div className="relative w-[224px] h-[224px] sm:w-[252px] sm:h-[252px] flex items-center justify-center">
                    {/* Deep contact shadow beneath 3D machined cylinder */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-3 w-[206px] sm:w-[232px] h-[72px] rounded-full blur-xl opacity-70"
                      style={{
                        background: 'radial-gradient(ellipse at center, rgba(2,6,23,0.92) 0%, rgba(2,6,23,0.4) 55%, transparent 80%)',
                      }}
                    />

                    {/* 3D Cylindrical Diamond-Knurled Side Wall */}
                    <div
                      style={{
                        transform: `translateY(${axialPressed ? 4 : 0}px) scale(${axialPressed ? 0.985 : 1})`,
                      }}
                      className="relative w-[206px] sm:w-[232px] h-[168px] sm:h-[186px] transition-transform duration-75"
                    >
                      {/* Lower cylindrical body with diamond knurling that shifts horizontally with rotation */}
                      <div
                        className="absolute inset-x-0 bottom-0 h-[120px] sm:h-[132px] rounded-b-[116px] overflow-hidden border-b-2 border-slate-500/80"
                        style={{
                          backgroundColor: '#7c838f',
                          backgroundImage: `
                            linear-gradient(90deg, rgba(15,23,42,0.72) 0%, rgba(255,255,255,0.22) 18%, rgba(255,255,255,0.42) 38%, rgba(15,23,42,0.12) 55%, rgba(255,255,255,0.26) 76%, rgba(15,23,42,0.78) 100%),
                            repeating-linear-gradient(45deg, rgba(255,255,255,0.52) 0px, rgba(255,255,255,0.52) 2.5px, rgba(15,23,42,0.68) 2.5px, rgba(15,23,42,0.68) 6px),
                            repeating-linear-gradient(-45deg, rgba(255,255,255,0.44) 0px, rgba(255,255,255,0.44) 2.5px, rgba(15,23,42,0.58) 2.5px, rgba(15,23,42,0.58) 6px)
                          `,
                          backgroundPosition: `0 0, ${Math.round(currentAngleDeg * 1.4)}px 0, ${Math.round(currentAngleDeg * 1.4)}px 0`,
                          boxShadow: 'inset 0 -10px 18px rgba(0,0,0,0.65), 0 18px 28px rgba(0,0,0,0.55)',
                        }}
                      />

                      {/* Chamfered Chrome Bevel Ring + Elliptical 3D Top Spun-Aluminum Face */}
                      <div
                        className="absolute inset-x-0 top-0 h-[126px] sm:h-[140px] rounded-[50%] p-[4px] flex items-center justify-center"
                        style={{
                          background:
                            'linear-gradient(180deg, #f8fafc 0%, #cbd5e1 35%, #64748b 78%, #e2e8f0 100%)',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.95)',
                        }}
                      >
                        <div
                          className="relative w-full h-full rounded-[50%] overflow-hidden flex items-center justify-center"
                          style={{
                            backgroundImage: `
                              repeating-radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.14) 0px, rgba(15,23,42,0.09) 1.3px, rgba(255,255,255,0.07) 2.6px),
                              conic-gradient(from ${Math.round(currentAngleDeg + 22)}deg at 50% 50%,
                                #9aa2b0 0deg,
                                #f8fafc 32deg,
                                #747c8a 76deg,
                                #dbe2ec 118deg,
                                #5b6370 162deg,
                                #ffffff 204deg,
                                #7c8594 248deg,
                                #e2e8f0 292deg,
                                #636b78 332deg,
                                #9aa2b0 360deg
                              )
                            `,
                            boxShadow: 'inset 0 2px 5px rgba(255,255,255,0.85), inset 0 -3px 8px rgba(15,23,42,0.38)',
                          }}
                        >
                          {/* Rotating 3D Perspective Index Notch */}
                          <div
                            style={{
                              transform: `rotate(${currentAngleDeg}deg)`,
                            }}
                            className="w-full h-full flex flex-col items-center justify-start pt-2.5 transition-transform duration-75"
                          >
                            <span
                              className="w-[4px] h-5 rounded-sm bg-slate-900 border border-white/50"
                              style={{
                                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.9), 0 0 2px rgba(255,255,255,0.7)',
                              }}
                            />
                          </div>
                          <span className="pointer-events-none absolute w-2.5 h-2 rounded-full bg-slate-400/50 border border-white/50" />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className="w-[206px] h-[206px] sm:w-[236px] sm:h-[236px] rounded-full flex items-center justify-center p-2.5"
                    style={{
                      background:
                        'linear-gradient(145deg, #d5d9e0 0%, #aeb4bf 46%, #7d8490 100%)',
                      boxShadow: isDark
                        ? '0 16px 32px rgba(0,0,0,0.65), inset 0 2px 3px rgba(255,255,255,0.55)'
                        : '0 16px 30px rgba(30,41,59,0.24), -6px -6px 18px rgba(255,255,255,0.9), inset 0 2px 3px rgba(255,255,255,0.85)',
                    }}
                  >
                    {/* Specular Chrome Inner Rim + Dark Recessed Gap */}
                    <div
                      className="w-full h-full rounded-full p-[7px] flex items-center justify-center"
                      style={{
                        background:
                          'linear-gradient(180deg, #ffffff 0%, #9ca3af 38%, #1f2937 78%, #4b5563 100%)',
                        boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.65)',
                      }}
                    >
                      {/* Rotating Radial Spun-Metal Stainless Rotor */}
                      <div
                        style={{
                          transform: `rotate(${currentAngleDeg}deg) scale(${
                            axialPressed ? 0.976 : 1
                          })`,
                          backgroundImage: `
                            repeating-radial-gradient(circle at 50% 50%, rgba(255,255,255,0.09) 0px, rgba(15,23,42,0.08) 1.2px, rgba(255,255,255,0.06) 2.4px),
                            conic-gradient(from 18deg at 50% 50%,
                              #8b929e 0deg,
                              #eef2f8 34deg,
                              #6f7785 74deg,
                              #cfd6e2 112deg,
                              #525967 154deg,
                              #f8fafc 198deg,
                              #767e8c 242deg,
                              #d5dce6 286deg,
                              #5b6270 326deg,
                              #8b929e 360deg
                            )
                          `,
                          boxShadow:
                            'inset 0 1px 2px rgba(255,255,255,0.85), inset 0 -2px 6px rgba(15,23,42,0.45), 0 4px 10px rgba(0,0,0,0.45)',
                        }}
                        className="relative w-full h-full rounded-full border border-slate-300/80 flex flex-col items-center justify-start pt-3 transition-transform duration-75"
                      >
                        {/* Milled Dark Radial Index Mark (matching photo notch) */}
                        <span
                          className="w-[3.5px] h-6 rounded-sm bg-slate-900 border border-white/35"
                          style={{
                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.9), 0 0 1px rgba(255,255,255,0.5)',
                          }}
                        />

                        {/* Subtle Center Lathe Hub */}
                        <span className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-slate-400/40 border border-white/40" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Knob 3D / 2D Visual Variant Switcher */}
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setKnobVisualMode('3d-knurled')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                  knobVisualMode === '3d-knurled'
                    ? 'bg-slate-900 text-white border-slate-700 dark:bg-emerald-400 dark:text-emerald-950'
                    : 'bg-white/70 dark:bg-emerald-950/60 border-slate-300/80 dark:border-emerald-400/25 text-slate-700 dark:text-emerald-200'
                }`}
              >
                🔩 Pokrętło 3D Radełkowane CNC
              </button>
              <button
                type="button"
                onClick={() => setKnobVisualMode('flat-2d')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                  knobVisualMode === 'flat-2d'
                    ? 'bg-slate-900 text-white border-slate-700 dark:bg-emerald-400 dark:text-emerald-950'
                    : 'bg-white/70 dark:bg-emerald-950/60 border-slate-300/80 dark:border-emerald-400/25 text-slate-700 dark:text-emerald-200'
                }`}
              >
                ◎ Klasyczna tarcza 2D
              </button>
            </div>

            {/* Precision Micro-Step & Axial Push Controls (Hitboxes >= 44px) */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <button
                type="button"
                onClick={() => stepByTicks(-driverCalibration.majorTickEvery)}
                className="min-h-[44px] px-2.5 py-2 rounded-xl bg-white/85 dark:bg-emerald-950/75 border border-slate-200/90 dark:border-emerald-400/25 text-xs font-mono tabular-nums font-semibold text-slate-800 dark:text-emerald-100 inline-flex items-center justify-center gap-1 cursor-pointer hover:bg-white transition-colors"
              >
                <Minus className="w-3.5 h-3.5" />
                <span>{driverCalibration.majorTickEvery} kr.</span>
              </button>

              <button
                type="button"
                onClick={() => stepByTicks(-1)}
                className="min-h-[44px] px-2.5 py-2 rounded-xl bg-white/85 dark:bg-emerald-950/75 border border-slate-200/90 dark:border-emerald-400/25 text-xs font-mono tabular-nums font-semibold text-slate-800 dark:text-emerald-100 inline-flex items-center justify-center gap-1 cursor-pointer hover:bg-white transition-colors"
              >
                <Minus className="w-3.5 h-3.5" />
                <span>1 krok</span>
              </button>

              <button
                type="button"
                onPointerDown={handleAxialDown}
                onPointerUp={handleAxialUp}
                onPointerLeave={handleAxialUp}
                className="col-span-2 sm:col-span-1 min-h-[44px] px-3 py-2 rounded-xl bg-slate-900 dark:bg-emerald-400 text-white dark:text-emerald-950 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer hover:opacity-95 transition-opacity whitespace-nowrap"
              >
                <span>Klik osiowy</span>
              </button>

              <button
                type="button"
                onClick={() => stepByTicks(1)}
                className="min-h-[44px] px-2.5 py-2 rounded-xl bg-white/85 dark:bg-emerald-950/75 border border-slate-200/90 dark:border-emerald-400/25 text-xs font-mono tabular-nums font-semibold text-slate-800 dark:text-emerald-100 inline-flex items-center justify-center gap-1 cursor-pointer hover:bg-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>1 krok</span>
              </button>

              <button
                type="button"
                onClick={() => stepByTicks(driverCalibration.majorTickEvery)}
                className="min-h-[44px] px-2.5 py-2 rounded-xl bg-white/85 dark:bg-emerald-950/75 border border-slate-200/90 dark:border-emerald-400/25 text-xs font-mono tabular-nums font-semibold text-slate-800 dark:text-emerald-100 inline-flex items-center justify-center gap-1 cursor-pointer hover:bg-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{driverCalibration.majorTickEvery} kr.</span>
              </button>
            </div>

            {/* Live Tabular Telemetry Readout */}
            <div className="pt-3 border-t border-slate-300/60 dark:border-emerald-400/15 space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
                <div>
                  <div className="text-[11px] font-sans text-slate-500 dark:text-emerald-300/75">
                    Aktywna zapadka
                  </div>
                  <div className="font-semibold text-slate-900 dark:text-emerald-50">
                    {activeTickIndex} / {driverCalibration.detentCount}
                    {isOnMajorTick ? ' (Gł.)' : ''}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-sans text-slate-500 dark:text-emerald-300/75">
                    Krok kątowy Δθ
                  </div>
                  <div className="font-semibold text-slate-900 dark:text-emerald-50">
                    {stepAngleDeg}° / impuls
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-sans text-slate-500 dark:text-emerald-300/75">
                    Ton korpusu (&lt;160 Hz)
                  </div>
                  <div className="font-semibold text-slate-900 dark:text-emerald-50">
                    {liveLowToneHz} Hz
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-sans text-slate-500 dark:text-emerald-300/75">
                    Prędkość kątowa
                  </div>
                  <div className="font-semibold text-slate-900 dark:text-emerald-50">
                    {angularVelocityDeg} °/s
                  </div>
                </div>
              </div>

              <div className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-emerald-200/85 truncate">
                Ostatni impuls: {lastEventLabel}
              </div>
            </div>
          </div>

          {/* Reference Image Inspection Card (Silent on Click — Zero Audio Tone) */}
          <div className="p-4 rounded-2xl bg-white/65 dark:bg-emerald-950/55 border border-white/85 dark:border-emerald-400/20 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                {refImgError ? (
                  <div className="w-20 h-20 rounded-xl bg-slate-200 dark:bg-emerald-900/60 flex items-center justify-center text-[11px] font-mono text-slate-600 dark:text-emerald-200 shrink-0">
                    CNC 270°
                  </div>
                ) : (
                  <img
                    src={REFERENCE_IMAGE_SRC}
                    alt="Załączony wzorzec metalowego sterownika głośności ze skalą 120 podziałek"
                    referrerPolicy="no-referrer"
                    onError={() => setRefImgError(true)}
                    onClick={() => setZoomReference((z) => !z)}
                    className="w-20 h-20 rounded-xl object-cover border border-slate-200/80 dark:border-emerald-400/25 shrink-0 cursor-pointer"
                  />
                )}

                <div className="min-w-0">
                  <div className="text-[11px] text-slate-500 dark:text-emerald-300/80 flex items-center gap-1.5">
                    <span>Załączony Wzorzec Sprzętowy</span>
                    <span aria-hidden="true">·</span>
                    <span>Podgląd bezdźwiękowy</span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-emerald-50 truncate mt-0.5">
                    Szczotkowany Metal Obrotowy 270° · 120 Kresek
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-emerald-100/75 mt-0.5">
                    Wykryta geometria: łuk 270° (-135° do +135°), 120 precyzyjnych nacięć,
                    pogrubiony znacznik główny co 10 kroków, frezowany indeks na tarczy.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setZoomReference((z) => !z)}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-white/80 dark:bg-emerald-900/60 border border-slate-200/80 dark:border-emerald-400/25 text-xs font-medium text-slate-700 dark:text-emerald-100 cursor-pointer shrink-0 whitespace-nowrap"
              >
                {zoomReference ? 'Zwiń wzorzec' : 'Powiększ wzorzec'}
              </button>
            </div>

            {zoomReference && !refImgError && (
              <div className="pt-2 border-t border-slate-200/70 dark:border-emerald-400/15">
                <img
                  src={REFERENCE_IMAGE_SRC}
                  alt="Pełny widok załączonego metalowego pokrętła głośności"
                  referrerPolicy="no-referrer"
                  className="w-full max-h-72 object-contain rounded-xl bg-slate-100 dark:bg-slate-900/80 p-2"
                />
              </div>
            )}
          </div>
        </div>

        {/* Right 6 Columns: Automated Calibration Service + 8 Precision Click/Haptic Sliders + Saved Profiles */}
        <div className="lg:col-span-6 space-y-6">
          {/* Automated Calibration Service Box */}
          <div className="p-5 rounded-2xl bg-white/70 dark:bg-emerald-950/60 border border-white/85 dark:border-emerald-400/20 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs text-slate-500 dark:text-emerald-300/80 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Automatyczna Usługa Diagnostyczno-Kalibracyjna</span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-emerald-50 mt-0.5">
                  Wybierz charakterystykę docelową i przeprowadź przelot 270°
                </h3>
              </div>

              {calibrationReport && (
                <span className="text-xs font-mono tabular-nums font-semibold text-indigo-700 dark:text-emerald-300">
                  Równowaga akustyczna: {calibrationReport.acousticBalanceScore}%
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {TARGET_CHARACTER_OPTIONS.map((opt) => {
                const selected = targetCharacter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTargetCharacter(opt.id)}
                    className={`min-h-[48px] p-3 rounded-xl text-left border transition-colors cursor-pointer ${
                      selected
                        ? isDark
                          ? 'bg-emerald-900/80 border-emerald-300/70 text-emerald-50'
                          : 'bg-white border-indigo-500 text-slate-900 shadow-sm'
                        : 'bg-white/50 dark:bg-emerald-950/40 border-slate-200/80 dark:border-emerald-400/15 text-slate-700 dark:text-emerald-100/80 hover:bg-white/80'
                    }`}
                  >
                    <div className="text-xs font-semibold">{opt.label}</div>
                    <div className="text-[11px] text-slate-500 dark:text-emerald-300/75 mt-0.5">
                      {opt.sub}
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={calibratingPhase !== null}
              onClick={handleRunAutoCalibration}
              className="w-full min-h-[46px] py-3 px-5 rounded-xl bg-indigo-600 dark:bg-emerald-400 text-white dark:text-emerald-950 text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer hover:opacity-95 disabled:opacity-65 transition-opacity"
            >
              <Zap className="w-4 h-4" />
              <span>
                {calibratingPhase
                  ? calibratingPhase
                  : 'Uruchom usługę auto-kalibracji dźwięku kliknięć i haptyki (270°)'}
              </span>
            </button>

            {calibratingPhase && (
              <div className="h-2 rounded-lg bg-slate-200/80 dark:bg-emerald-950 overflow-hidden">
                <div
                  className="h-full bg-indigo-600 dark:bg-emerald-400 transition-all duration-100"
                  style={{ width: `${calibrationProgress}%` }}
                />
              </div>
            )}

            {calibrationReport && (
              <div className="pt-3 border-t border-slate-200/70 dark:border-emerald-400/15 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono tabular-nums">
                  <div>
                    <span className="text-slate-500 dark:text-emerald-300/75 block font-sans text-[11px]">
                      Maks. prędkość czysta
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-emerald-50">
                      {calibrationReport.maxCleanSpeedDegPerSec} °/s
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-emerald-300/75 block font-sans text-[11px]">
                      Impuls drobny / główny
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-emerald-50">
                      {calibrationReport.minorImpulseIndex} / {calibrationReport.majorImpulseIndex}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-emerald-300/75 block font-sans text-[11px]">
                      Limit pasma 1. tonu
                    </span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                      {calibrationReport.verifiedSub160Hz ? 'ZWERYFIKOWANO <160 Hz' : 'SKORYGOWANO'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-emerald-300/75 block font-sans text-[11px]">
                      Czas pomiaru
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-emerald-50">
                      {calibrationReport.calibratedAt}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-slate-600 dark:text-emerald-100/85 leading-relaxed">
                  {calibrationReport.recommendation}
                </p>
              </div>
            )}
          </div>

          {/* 8 Real-Time Click & Haptic Calibration Sliders */}
          <div className="p-5 rounded-2xl bg-white/65 dark:bg-emerald-950/55 border border-white/85 dark:border-emerald-400/20 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-emerald-50">
                Parametry Kalibracji Akustyczno-Haptycznej Sterownika
              </span>

              <div className="flex items-center gap-1 text-xs">
                <span className="text-slate-500 dark:text-emerald-300/80 mr-1">
                  Główna kreska co:
                </span>
                {[5, 6, 10, 12].map((stepDiv) => (
                  <button
                    key={stepDiv}
                    type="button"
                    onClick={() => {
                      const next = { ...driverCalibration, majorTickEvery: stepDiv };
                      updateDriverCalibration({ majorTickEvery: stepDiv });
                      hapticAudio.triggerCalibratedRotaryDetent(next, rotorNorm, true, 0.25);
                    }}
                    className={`min-h-[36px] px-2.5 py-1 rounded-lg font-mono tabular-nums font-medium cursor-pointer transition-colors ${
                      driverCalibration.majorTickEvery === stepDiv
                        ? isDark
                          ? 'bg-emerald-400 text-emerald-950'
                          : 'bg-slate-900 text-white'
                        : 'bg-white/75 dark:bg-emerald-900/50 text-slate-700 dark:text-emerald-100'
                    }`}
                  >
                    {stepDiv}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              <HapticSlider
                label="Liczba zapadek skali (Detents)"
                value={driverCalibration.detentCount}
                min={12}
                max={120}
                step={4}
                unit=" kr."
                onChange={(v) => updateDriverCalibration({ detentCount: v })}
              />

              <HapticSlider
                label="Akcent głównych kresek (Major Tick)"
                value={driverCalibration.majorTickAccent}
                min={1.0}
                max={2.4}
                step={0.05}
                unit="×"
                onChange={(v) => updateDriverCalibration({ majorTickAccent: v })}
              />

              <HapticSlider
                label="Niski ton korpusu (<160 Hz)"
                value={driverCalibration.lowBodyFreqHz}
                min={36}
                max={156}
                step={1}
                unit=" Hz"
                onChange={(v) => updateDriverCalibration({ lowBodyFreqHz: v })}
              />

              <HapticSlider
                label="Domieszka kliku lewego przycisku myszy"
                value={driverCalibration.mouseSnapBlend}
                min={0}
                max={100}
                step={1}
                unit="%"
                onChange={(v) => updateDriverCalibration({ mouseSnapBlend: v })}
              />

              <HapticSlider
                label="Siła haptyki obrotowej (Torque)"
                value={driverCalibration.rotaryHapticStrength}
                min={10}
                max={100}
                step={1}
                unit="%"
                onChange={(v) => updateDriverCalibration({ rotaryHapticStrength: v })}
              />

              <HapticSlider
                label="Czas impulsu pojedynczej zapadki"
                value={driverCalibration.tickPulseMs}
                min={3}
                max={36}
                step={1}
                unit=" ms"
                onChange={(v) => updateDriverCalibration({ tickPulseMs: v })}
              />

              <HapticSlider
                label="Opór odbojników krańcowych (-135°/+135°)"
                value={driverCalibration.endStopResistance}
                min={10}
                max={100}
                step={1}
                unit="%"
                onChange={(v) => updateDriverCalibration({ endStopResistance: v })}
              />

              <HapticSlider
                label="Klik osiowy trzpienia i sprzęgło"
                value={driverCalibration.axialPushForce}
                min={10}
                max={100}
                step={1}
                unit="%"
                onChange={(v) =>
                  updateDriverCalibration({
                    axialPushForce: v,
                    backlashClutch: Math.max(15, Math.round(v * 0.86)),
                  })
                }
              />
            </div>
          </div>

          {/* Factory & Cloud-Synced Calibration Profiles */}
          <div className="p-5 rounded-2xl bg-white/65 dark:bg-emerald-950/55 border border-white/85 dark:border-emerald-400/20 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-emerald-50">
                Profile Kalibracji Sterownika ({savedCalibrations.length})
              </span>
              <span className="text-[11px] text-slate-500 dark:text-emerald-300/75">
                Synchronizacja: Pokrętło Odtwarzacza + Cloud SQL
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1">
              {savedCalibrations.map((prof) => {
                const isCustom = !prof.id.startsWith('cal-');
                const isCurrent =
                  prof.config.detentCount === driverCalibration.detentCount &&
                  prof.config.lowBodyFreqHz === driverCalibration.lowBodyFreqHz &&
                  prof.config.mouseSnapBlend === driverCalibration.mouseSnapBlend;

                return (
                  <div
                    key={prof.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-2 transition-colors ${
                      isCurrent
                        ? isDark
                          ? 'bg-emerald-900/75 border-emerald-300/60'
                          : 'bg-white border-indigo-500 shadow-sm'
                        : 'bg-white/50 dark:bg-emerald-950/40 border-slate-200/70 dark:border-emerald-400/15'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => loadDriverCalibrationProfile(prof)}
                      className="text-left min-w-0 flex-1 cursor-pointer"
                    >
                      <div className="text-xs font-semibold text-slate-900 dark:text-emerald-50 truncate">
                        {prof.name}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-emerald-300/75 truncate mt-0.5">
                        {prof.config.detentCount}T · {prof.config.lowBodyFreqHz} Hz · Mysz{' '}
                        {prof.config.mouseSnapBlend}%
                      </div>
                    </button>

                    {isCustom && (
                      <button
                        type="button"
                        aria-label={`Usuń profil ${prof.name}`}
                        onClick={() => removeDriverCalibrationProfile(prof.id)}
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await saveDriverCalibrationProfile(
                  profileNameInput,
                  `CNC Spun-Metal ${driverCalibration.detentCount}T`
                );
                setProfileNameInput('');
              }}
              className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1"
            >
              <input
                type="text"
                value={profileNameInput}
                onChange={(e) => setProfileNameInput(e.target.value)}
                placeholder="Nazwa własnej kalibracji sterownika..."
                className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl text-xs bg-white/85 dark:bg-emerald-950/75 border border-slate-200/90 dark:border-emerald-400/25 text-slate-900 dark:text-emerald-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-emerald-400 text-white dark:text-emerald-950 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer hover:opacity-95 whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Zapisz profil</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
};
