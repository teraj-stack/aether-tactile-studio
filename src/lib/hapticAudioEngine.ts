import {
  CustomHapticPattern,
  HapticMaterialType,
  HapticSettings,
  MATERIAL_PROFILES,
  MINIMALIST_LOW_CLICK_VARIANTS,
  MinimalistLowClickId,
  MinimalistLowClickSpec,
  RotaryDriverCalibrationConfig,
  SynthPatchSettings,
} from '../types/studio';

export interface RealtimeAudioHapticTelemetry {
  rms: number;
  bass: number;
  mid: number;
  treble: number;
  pressImpulse: number;
  clutchImpulse: number;
  patternGate: number; // 0..1 instantaneous ON/OFF state of active haptic pulse sequence
  activePulseIndex: number; // -1 when idle, 0..N-1 during pattern playback
  bins: Float32Array; // length 32, normalized 0..1
}

export interface MaterialAcousticSignature {
  shortCategoryPl: string;
  familyPl: 'Szkło' | 'Metal' | 'Plastik' | 'Zamsz';
  surfaceFormantHz: number;
  secondaryFormantHz: number;
  formantQ: number;
  harmonicCharacterPl: string;
  decayCharacterMs: number;
  traceHexLight: string;
  traceHexDark: string;
}

export const MATERIAL_ACOUSTIC_SIGNATURES: Record<
  HapticMaterialType,
  MaterialAcousticSignature
> = {
  'shiny-glass': {
    shortCategoryPl: 'Szkło optyczne',
    familyPl: 'Szkło',
    surfaceFormantHz: 4180,
    secondaryFormantHz: 6240,
    formantQ: 8.2,
    harmonicCharacterPl: 'Wysoki kryształowy rezonans Fresnela + ton korpusu <160 Hz',
    decayCharacterMs: 92,
    traceHexLight: '#0284c7',
    traceHexDark: '#38bdf8',
  },
  'frosted-glass': {
    shortCategoryPl: 'Szkło matowe',
    familyPl: 'Szkło',
    surfaceFormantHz: 2640,
    secondaryFormantHz: 3920,
    formantQ: 4.5,
    harmonicCharacterPl: 'Jedwabisty rozproszony dzwonek szkła + ton korpusu <160 Hz',
    decayCharacterMs: 118,
    traceHexLight: '#4f46e5',
    traceHexDark: '#34d399',
  },
  'matte-metal': {
    shortCategoryPl: 'Metal CNC',
    familyPl: 'Metal',
    surfaceFormantHz: 2890,
    secondaryFormantHz: 4085,
    formantQ: 9.6,
    harmonicCharacterPl: 'Nieharmoniczny alikwot płyty aluminiowej (1.41×) + zapadka <160 Hz',
    decayCharacterMs: 138,
    traceHexLight: '#0f766e',
    traceHexDark: '#2dd4bf',
  },
  'abs-plastic': {
    shortCategoryPl: 'Plastik ABS',
    familyPl: 'Plastik',
    surfaceFormantHz: 1680,
    secondaryFormantHz: 2940,
    formantQ: 3.2,
    harmonicCharacterPl: 'Zwarty przeskok kopułki polimerowej ABS + komora <160 Hz',
    decayCharacterMs: 68,
    traceHexLight: '#d97706',
    traceHexDark: '#fbbf24',
  },
  suede: {
    shortCategoryPl: 'Zamsz akustyczny',
    familyPl: 'Zamsz',
    surfaceFormantHz: 520,
    secondaryFormantHz: 860,
    formantQ: 1.4,
    harmonicCharacterPl: 'Silne tłumienie transjentów wysokich, gładka fala <160 Hz',
    decayCharacterMs: 165,
    traceHexLight: '#7c3aed',
    traceHexDark: '#a78bfa',
  },
};

export interface HapticOscilloscopeReadout {
  sampleRate: number;
  isAudioActive: boolean;
  peakAmplitude: number; // 0..1
  rmsAmplitude: number; // 0..1
  amplitudeDb: number; // -60..0 dBFS
  measuredFundamentalHz: number; // real zero-crossing / spectral fundamental Hz
  spectralCentroidHz: number; // dominant high/mid transient peak Hz
  configuredSub160Hz: number; // <160 Hz body carrier
  surfaceFormantHz: number; // material acoustic resonance Hz
  pressImpulse: number;
  clutchImpulse: number;
  patternGate: number;
  activePulseIndex: number;
  activeMaterial: HapticMaterialType;
}

class HapticAudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private timeDomainData: Float32Array<ArrayBuffer> | null = null;
  private reverbNode: ConvolverNode | null = null;
  private mouseClickBuffer: AudioBuffer | null = null;
  private mouseReleaseBuffer: AudioBuffer | null = null;
  private holdIntervalId: number | null = null;
  private holdOsc: OscillatorNode | null = null;
  private holdGain: GainNode | null = null;
  private pressImpulse = 0;
  private clutchImpulse = 0;
  private lastSampleMs = 0;
  private vibrateStartMs = 0;
  private vibratePulses: number[] = [];
  private lastTriggeredMaterial: HapticMaterialType = 'frosted-glass';
  private lastConfiguredBodyHz = 86;

  // Continuous oscilloscope carrier wave nodes (optional lab inspection mode)
  private carrierNodes: {
    bodyOsc: OscillatorNode;
    overtoneOsc: OscillatorNode;
    lfoOsc: OscillatorNode;
    masterGain: GainNode;
    overtoneGain: GainNode;
    filter: BiquadFilterNode;
  } | null = null;

  // Ambient player state
  private ambientNodes: {
    oscs: OscillatorNode[];
    masterGain: GainNode;
    filter: BiquadFilterNode;
  } | null = null;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048; // 2048 time-domain samples (~42.6ms @ 48kHz), 1024 FFT bins
      this.analyser.smoothingTimeConstant = 0.72;
      this.analyser.connect(this.ctx.destination);
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
      this.timeDomainData = new Float32Array(this.analyser.fftSize);
      this.reverbNode = this.createImpulseReverb(this.ctx, 1.4, 2.6);
      this.mouseClickBuffer = this.createClassicMouseBuffer(this.ctx, 'press');
      this.mouseReleaseBuffer = this.createClassicMouseBuffer(this.ctx, 'release');
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private getOutputNode(ctx: AudioContext): AudioNode {
    return this.analyser ?? ctx.destination;
  }

  /**
   * Synthesizes an authentic physical microswitch waveform matching the left button
   * of a classic desktop computer mouse (sharp copper leaf-spring snap + 1.1ms micro-bounce).
   */
  private createClassicMouseBuffer(
    ctx: AudioContext,
    mode: 'press' | 'release'
  ): AudioBuffer {
    const rate = ctx.sampleRate;
    const durationSec = mode === 'press' ? 0.011 : 0.008;
    const length = Math.max(32, Math.floor(rate * durationSec));
    const buffer = ctx.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);

    // Deterministic pseudo-random generator so every left-click feels consistent like hardware
    let seed = mode === 'press' ? 0x9e3779b9 : 0x517cc1b7;
    const nextRand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return (seed / 0xffffffff) * 2 - 1;
    };

    for (let i = 0; i < length; i++) {
      const t = i / rate;
      // Initial metal contact strike (first 0.45ms)
      const contactStrike =
        t < 0.00045
          ? Math.sin((t / 0.00045) * Math.PI * 2.0) * Math.exp(-t / 0.00022) * 1.15
          : 0;
      // Secondary microswitch leaf bounce (~1.1ms on press, ~0.85ms on release)
      const bounceCenter = mode === 'press' ? 0.0011 : 0.00085;
      const dtBounce = t - bounceCenter;
      const leafBounce =
        dtBounce >= 0
          ? Math.sin(dtBounce * 21000) * Math.exp(-dtBounce / 0.00038) * 0.52
          : 0;
      // Short broadband ABS plastic shell snap
      const noiseBurst =
        nextRand() * Math.exp(-t / (mode === 'press' ? 0.00095 : 0.00075)) * 0.72;

      data[i] = Math.max(-1, Math.min(1, contactStrike + leafBounce + noiseBurst));
    }

    return buffer;
  }

  private playClassicLeftMouseClick(
    ctx: AudioContext,
    outNode: AudioNode,
    now: number,
    gainScale: number,
    mode: 'press' | 'release'
  ): void {
    const buf = mode === 'press' ? this.mouseClickBuffer : this.mouseReleaseBuffer;
    if (!buf) return;

    const src = ctx.createBufferSource();
    src.buffer = buf;

    // Formant 1: Microswitch copper snap (~3450 Hz on press, ~2550 Hz on release)
    const snapBand = ctx.createBiquadFilter();
    snapBand.type = 'bandpass';
    snapBand.frequency.setValueAtTime(mode === 'press' ? 3450 : 2550, now);
    snapBand.Q.setValueAtTime(2.35, now);

    const snapGain = ctx.createGain();
    snapGain.gain.setValueAtTime((mode === 'press' ? 0.58 : 0.34) * gainScale, now);

    // Formant 2: Classic ABS mouse shell cavity (~1680 Hz on press, ~1340 Hz on release)
    const shellBand = ctx.createBiquadFilter();
    shellBand.type = 'bandpass';
    shellBand.frequency.setValueAtTime(mode === 'press' ? 1680 : 1340, now);
    shellBand.Q.setValueAtTime(1.75, now);

    const shellGain = ctx.createGain();
    shellGain.gain.setValueAtTime((mode === 'press' ? 0.44 : 0.26) * gainScale, now);

    src.connect(snapBand);
    snapBand.connect(snapGain);
    snapGain.connect(outNode);

    src.connect(shellBand);
    shellBand.connect(shellGain);
    shellGain.connect(outNode);

    src.start(now);
  }

  private createImpulseReverb(ctx: AudioContext, duration: number, decay: number): ConvolverNode {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * duration);
    const impulse = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;
    return convolver;
  }

  public triggerVibrate(pulses: number[]): void {
    const clean = pulses.map((v) => Math.max(1, Math.round(v)));
    if (clean.length > 0) {
      this.vibrateStartMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.vibratePulses = clean;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(clean);
      } catch {
        // Ignore on unsupported browsers
      }
    }
  }

  public computeEffectivePulses(
    haptic: HapticSettings,
    patterns: CustomHapticPattern[],
    overrideMaterial?: HapticMaterialType,
    intensityScale = 1
  ): number[] {
    if (!haptic.enabled || haptic.intensity <= 0) return [];
    const mat = overrideMaterial || haptic.material;
    const profile = MATERIAL_PROFILES[mat];
    const activePattern = patterns.find((p) => p.id === haptic.activePatternId);
    const rawPulses = activePattern ? activePattern.pulses : profile.basePulses;

    const durationFactor = Math.max(0.25, haptic.durationMs / 45);
    const intensityFactor = Math.max(0.15, (haptic.intensity / 100) * intensityScale);
    const hardnessSnap = 0.7 + (haptic.materialHardness / 100) * 0.6;

    return rawPulses.map((ms, idx) => {
      if (idx % 2 === 0) {
        // Active vibration segment
        return Math.min(350, Math.max(4, Math.round(ms * durationFactor * intensityFactor / hardnessSnap * 1.15)));
      }
      // Pause segment
      return Math.max(6, Math.round(ms * (1.2 - intensityFactor * 0.3)));
    });
  }

  public triggerMinimalistLowClick(
    variantId: MinimalistLowClickId,
    intensityScale = 1
  ): void {
    const spec: MinimalistLowClickSpec =
      MINIMALIST_LOW_CLICK_VARIANTS.find((v) => v.id === variantId) ||
      MINIMALIST_LOW_CLICK_VARIANTS[0];

    const gainNorm = Math.max(0.08, Math.min(1.35, intensityScale));
    this.lastTriggeredMaterial = spec.recommendedMaterial;
    this.lastConfiguredBodyHz = spec.fundamentalHz;

    const pulseMs = Math.max(2, Math.round(spec.vibratePulseMs * gainNorm));
    this.triggerVibrate([pulseMs]);
    this.pressImpulse = Math.min(
      1.45,
      Math.max(this.pressImpulse, 0.38 + 0.58 * gainNorm)
    );

    const ctx = this.ensureContext();
    if (!ctx) return;

    const outNode = this.getOutputNode(ctx);
    const now = ctx.currentTime;
    const durSec = Math.max(0.004, Math.min(0.02, spec.durationMs / 1000));
    // Add tiny zero-crossing release tail so ultra-short 4-14ms pulses never produce digital DC pop
    const totalEnvSec = durSec + 0.006;

    const startHz = Math.max(36, Math.min(154, spec.fundamentalHz));
    const endHz = Math.max(24, Math.min(120, spec.pitchDropHz));

    const bodyOsc = ctx.createOscillator();
    bodyOsc.type = spec.waveform;
    bodyOsc.frequency.setValueAtTime(startHz, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(endHz, now + totalEnvSec);

    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(Math.max(24, startHz * 0.5), now);

    // Strict <160 Hz acoustic low-pass barrier for pure minimalist low-end character
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(152, now);
    lp.Q.setValueAtTime(0.85, now);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.24 * gainNorm, now);

    const envGain = ctx.createGain();
    const peakAmp = Math.min(0.46, 0.34 * gainNorm);
    envGain.gain.setValueAtTime(0.0001, now);
    envGain.gain.linearRampToValueAtTime(peakAmp, now + 0.0009);
    envGain.gain.exponentialRampToValueAtTime(0.0001, now + totalEnvSec);

    bodyOsc.connect(lp);
    subOsc.connect(subGain);
    subGain.connect(lp);
    lp.connect(envGain);
    envGain.connect(outNode);

    bodyOsc.start(now);
    subOsc.start(now);
    bodyOsc.stop(now + totalEnvSec + 0.004);
    subOsc.stop(now + totalEnvSec + 0.004);

    // Ultra-short damped mechanical contact (< 900 Hz) without high-frequency harshness
    if (spec.microTransientLevel > 0.02) {
      const clickOsc = ctx.createOscillator();
      clickOsc.type = 'triangle';
      clickOsc.frequency.setValueAtTime(Math.min(780, startHz * 6.2), now);
      clickOsc.frequency.exponentialRampToValueAtTime(140, now + 0.0028);

      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(spec.microTransientLevel * 0.28 * gainNorm, now);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.0032);

      clickOsc.connect(clickGain);
      clickGain.connect(outNode);
      clickOsc.start(now);
      clickOsc.stop(now + 0.0045);
    }
  }

  public triggerPress(
    synth: SynthPatchSettings,
    haptic: HapticSettings,
    patterns: CustomHapticPattern[],
    options?: {
      material?: HapticMaterialType;
      pitchSemitones?: number;
      intensityScale?: number;
    }
  ): void {
    if (
      haptic.enabled &&
      haptic.minimalistClickVariant &&
      haptic.minimalistClickVariant !== 'none'
    ) {
      const scale =
        Math.max(0.1, haptic.intensity / 100) * (options?.intensityScale ?? 1);
      this.triggerMinimalistLowClick(haptic.minimalistClickVariant, scale);
      return;
    }

    const mat = options?.material || haptic.material;
    const profile = MATERIAL_PROFILES[mat];
    const sig = MATERIAL_ACOUSTIC_SIGNATURES[mat];
    this.lastTriggeredMaterial = mat;

    const pulses = this.computeEffectivePulses(
      haptic,
      patterns,
      mat,
      options?.intensityScale ?? 1
    );
    if (pulses.length > 0) {
      this.triggerVibrate(pulses);
    }

    const intensityNorm = Math.max(0.05, (haptic.intensity / 100) * (options?.intensityScale ?? 1));
    if (haptic.enabled) {
      this.pressImpulse = Math.min(1.6, Math.max(this.pressImpulse, 0.45 + intensityNorm * 0.95));
    }

    const ctx = this.ensureContext();
    if (!ctx) return;

    const outNode = this.getOutputNode(ctx);
    const now = ctx.currentTime;
    const semitoneRatio = Math.pow(2, (options?.pitchSemitones ?? 0) / 24);
    const hardnessNorm = haptic.materialHardness / 100;

    // TONE 1: Very low tactile tone strictly below 160 Hz (34 Hz – 155 Hz)
    const baseLowHz =
      synth.baseFrequency >= 160
        ? 86
        : Math.max(34, Math.min(156, synth.baseFrequency));
    const freq = Math.min(
      155,
      Math.max(32, baseLowHz * semitoneRatio * (0.88 + hardnessNorm * 0.1))
    );
    this.lastConfiguredBodyHz = Math.round(freq * 10) / 10;

    const attack = Math.max(0.002, Math.min(0.035, synth.attackMs / 1000));
    const decay = Math.max(
      0.04,
      Math.min(0.28, (synth.decayMs / 1000) * (0.55 + (haptic.durationMs / 160) * 0.45))
    );

    const osc1 = ctx.createOscillator();
    osc1.type = synth.waveform;
    osc1.frequency.setValueAtTime(freq, now);
    osc1.frequency.exponentialRampToValueAtTime(
      Math.max(28, freq * 0.68),
      now + decay
    );

    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(Math.max(28, freq * 0.55), now);

    // Keep low-tone harmonics strictly warm and below 160 Hz fundamental character
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const lowToneCutoff = Math.min(
      158,
      Math.max(65, 90 + (synth.filterCutoff / 8000) * 66 * profile.filterMultiplier * 0.7)
    );
    filter.frequency.setValueAtTime(lowToneCutoff, now);
    filter.Q.setValueAtTime(Math.min(4.5, synth.filterResonance * 0.45), now);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime((0.18 + synth.subBassLevel * 0.32) * intensityNorm, now);

    const envGain = ctx.createGain();
    const peakGain = Math.min(0.42, 0.28 * intensityNorm);
    envGain.gain.setValueAtTime(0.0001, now);
    envGain.gain.linearRampToValueAtTime(peakGain, now + attack);
    envGain.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);

    osc1.connect(filter);
    subOsc.connect(subGain);
    subGain.connect(filter);
    filter.connect(envGain);

    const dryGain = ctx.createGain();
    dryGain.gain.setValueAtTime(1 - synth.reverbMix * 0.35, now);
    envGain.connect(dryGain);
    dryGain.connect(outNode);

    if (this.reverbNode && synth.reverbMix > 0.04) {
      const wetGain = ctx.createGain();
      wetGain.gain.setValueAtTime(synth.reverbMix * 0.25, now);
      envGain.connect(this.reverbNode);
      this.reverbNode.connect(wetGain);
      wetGain.connect(outNode);
    }

    osc1.start(now);
    subOsc.start(now);

    const stopAt = now + attack + decay + 0.04;
    osc1.stop(stopAt);
    subOsc.stop(stopAt);

    // TONE 2: Material-specific Surface Acoustic Resonator (distinguishes Glass, Metal, Plastic, Suede)
    this.playMaterialSurfaceResonator(ctx, outNode, now, mat, intensityNorm, hardnessNorm, sig);

    // TONE 3: Authentic classic computer mouse left-button click (scaled by material transientClick)
    const mouseSnapScale =
      mat === 'suede'
        ? 0.22
        : mat === 'abs-plastic'
          ? 1.08
          : mat === 'matte-metal'
            ? 0.92
            : 0.72;
    this.playClassicLeftMouseClick(
      ctx,
      outNode,
      now,
      Math.min(1.3, (0.45 + intensityNorm * 0.65) * mouseSnapScale),
      'press'
    );
  }

  private playMaterialSurfaceResonator(
    ctx: AudioContext,
    outNode: AudioNode,
    now: number,
    mat: HapticMaterialType,
    intensityNorm: number,
    hardnessNorm: number,
    sig: MaterialAcousticSignature
  ): void {
    const f1 = sig.surfaceFormantHz * (0.92 + hardnessNorm * 0.16);
    const f2 = sig.secondaryFormantHz * (0.92 + hardnessNorm * 0.16);

    if (mat === 'shiny-glass' || mat === 'frosted-glass') {
      // Crystalline high-Q dual bell harmonic ping
      const glassDecay = mat === 'shiny-glass' ? 0.036 : 0.046;
      const mode1 = ctx.createOscillator();
      const mode2 = ctx.createOscillator();
      mode1.type = 'sine';
      mode2.type = 'sine';
      mode1.frequency.setValueAtTime(f1, now);
      mode2.frequency.setValueAtTime(f2, now);

      const g1 = ctx.createGain();
      const g2 = ctx.createGain();
      const amp = (mat === 'shiny-glass' ? 0.14 : 0.095) * intensityNorm;
      g1.gain.setValueAtTime(amp, now);
      g1.gain.exponentialRampToValueAtTime(0.0001, now + glassDecay);
      g2.gain.setValueAtTime(amp * 0.48, now);
      g2.gain.exponentialRampToValueAtTime(0.0001, now + glassDecay * 0.72);

      mode1.connect(g1);
      mode2.connect(g2);
      g1.connect(outNode);
      g2.connect(outNode);
      mode1.start(now);
      mode2.start(now);
      mode1.stop(now + glassDecay + 0.006);
      mode2.stop(now + glassDecay + 0.006);
    } else if (mat === 'matte-metal') {
      // Anodized CNC aluminum inharmonic plate modes (1 : 1.414 : 2.18)
      const metalDecay = 0.052;
      const m1 = ctx.createOscillator();
      const m2 = ctx.createOscillator();
      m1.type = 'triangle';
      m2.type = 'sine';
      m1.frequency.setValueAtTime(f1, now);
      m2.frequency.setValueAtTime(f2, now);

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(f1, now);
      bp.Q.setValueAtTime(sig.formantQ, now);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.16 * intensityNorm, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + metalDecay);

      m1.connect(bp);
      m2.connect(bp);
      bp.connect(g);
      g.connect(outNode);
      m1.start(now);
      m2.start(now);
      m1.stop(now + metalDecay + 0.008);
      m2.stop(now + metalDecay + 0.008);
    } else if (mat === 'abs-plastic') {
      // Hollow ABS polymer keycap snap: fast pitch-drop pop (1680 Hz -> 640 Hz in 16 ms)
      const plasticDecay = 0.022;
      const popOsc = ctx.createOscillator();
      popOsc.type = 'triangle';
      popOsc.frequency.setValueAtTime(f1, now);
      popOsc.frequency.exponentialRampToValueAtTime(620, now + plasticDecay);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.19 * intensityNorm, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + plasticDecay);

      popOsc.connect(g);
      g.connect(outNode);
      popOsc.start(now);
      popOsc.stop(now + plasticDecay + 0.005);
    } else {
      // Suede: warm damped acoustic cushion (<520 Hz soft thud)
      const suedeDecay = 0.058;
      const cushionOsc = ctx.createOscillator();
      cushionOsc.type = 'sine';
      cushionOsc.frequency.setValueAtTime(Math.min(380, f1 * 0.65), now);
      cushionOsc.frequency.exponentialRampToValueAtTime(95, now + suedeDecay);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.11 * intensityNorm, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + suedeDecay);

      cushionOsc.connect(g);
      g.connect(outNode);
      cushionOsc.start(now);
      cushionOsc.stop(now + suedeDecay + 0.006);
    }
  }

  public triggerReleaseReverseClutch(haptic: HapticSettings, _overrideMaterial?: HapticMaterialType): void {
    if (!haptic.enabled || haptic.reverseClutchForce <= 4 || haptic.intensity <= 0) return;
    const clutchNorm = haptic.reverseClutchForce / 100;
    const intensityNorm = haptic.intensity / 100;

    const pulseMs = Math.max(4, Math.round(14 * clutchNorm * intensityNorm));
    this.triggerVibrate([pulseMs]);
    this.clutchImpulse = Math.min(1.5, Math.max(this.clutchImpulse, clutchNorm * (0.45 + intensityNorm * 0.75)));

    const ctx = this.ensureContext();
    if (!ctx) return;
    const outNode = this.getOutputNode(ctx);
    const now = ctx.currentTime;

    // Subtle <160Hz mechanical cushion + classic mouse button leaf-spring release click
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const lowDetentHz = Math.min(135, 54 + (haptic.materialHardness / 100) * 68);
    osc.frequency.setValueAtTime(lowDetentHz, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.026);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.09 * clutchNorm * intensityNorm, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);

    osc.connect(gain);
    gain.connect(outNode);
    osc.start(now);
    osc.stop(now + 0.035);

    this.playClassicLeftMouseClick(
      ctx,
      outNode,
      now,
      clutchNorm * (0.35 + intensityNorm * 0.55),
      'release'
    );
  }

  public triggerSliderTick(
    haptic: HapticSettings,
    normalizedValue: number // 0..1
  ): void {
    if (!haptic.enabled || haptic.intensity <= 0) return;
    const intensityNorm = haptic.intensity / 100;
    const clutchNorm = Math.max(0.2, haptic.reverseClutchForce / 100);
    const hardnessNorm = haptic.materialHardness / 100;

    const tickMs = Math.max(3, Math.round((6 + (haptic.durationMs / 260) * 14) * intensityNorm));
    this.triggerVibrate([tickMs]);
    this.pressImpulse = Math.min(1.2, Math.max(this.pressImpulse, 0.22 * intensityNorm));

    const ctx = this.ensureContext();
    if (!ctx) return;
    const outNode = this.getOutputNode(ctx);
    const now = ctx.currentTime;

    // Strictly < 160 Hz low detent thump + quiet mouse-wheel micro-snap
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const freq = Math.min(148, Math.max(44, 52 + normalizedValue * 76 + hardnessNorm * 18));
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.02);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.075 * intensityNorm * clutchNorm, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.022);

    osc.connect(gain);
    gain.connect(outNode);
    osc.start(now);
    osc.stop(now + 0.026);

    this.playClassicLeftMouseClick(
      ctx,
      outNode,
      now,
      0.24 * intensityNorm * clutchNorm,
      'release'
    );
  }

  /**
   * Dedicated calibrated rotary controller detent synthesizer for the machined spun-metal volume dial.
   * Preserves <160 Hz primary body thump + classic computer left-mouse microswitch snap.
   */
  public triggerCalibratedRotaryDetent(
    cal: RotaryDriverCalibrationConfig,
    normalizedPos: number, // 0..1
    isMajorTick: boolean,
    velocityNorm = 0.35 // 0..1 angular speed factor
  ): void {
    const strengthNorm = Math.max(0, Math.min(1, cal.rotaryHapticStrength / 100));
    if (strengthNorm <= 0.01) return;

    const accent = isMajorTick ? cal.majorTickAccent : 1.0;
    const speedTrim = 1 - Math.min(0.45, velocityNorm * 0.45);
    const minorMs = Math.max(3, Math.round(cal.tickPulseMs * strengthNorm * speedTrim));

    if (isMajorTick) {
      const majorMs = Math.min(48, Math.max(5, Math.round(minorMs * accent)));
      const reboundMs = Math.max(3, Math.round(minorMs * 0.55));
      this.triggerVibrate([majorMs, 6, reboundMs]);
    } else {
      this.triggerVibrate([minorMs]);
    }

    this.pressImpulse = Math.min(
      1.5,
      Math.max(this.pressImpulse, (isMajorTick ? 0.46 : 0.24) * strengthNorm)
    );

    const ctx = this.ensureContext();
    if (!ctx) return;
    const outNode = this.getOutputNode(ctx);
    const now = ctx.currentTime;

    // Tone 1: Boosted machined metal shaft body punch strictly < 160 Hz (34..156 Hz)
    const clampedBaseHz = Math.max(36, Math.min(156, cal.lowBodyFreqHz));
    const detentHz = Math.min(
      156,
      Math.max(
        36,
        clampedBaseHz * (0.92 + normalizedPos * 0.16) * (isMajorTick ? 1.08 : 1.0)
      )
    );
    const decaySec = isMajorTick ? 0.042 : 0.026;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(Math.min(160, detentHz * 1.28), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, detentHz * 0.54), now + decaySec);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(160, now);

    const gain = ctx.createGain();
    const bodyPeak = Math.min(0.62, 0.28 * strengthNorm * accent);
    gain.gain.setValueAtTime(bodyPeak, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decaySec + 0.005);

    osc.connect(lp);
    lp.connect(gain);
    gain.connect(outNode);
    osc.start(now);
    osc.stop(now + decaySec + 0.01);

    // Tone 1b: Crisp CNC detent metallic tick transient for immediate tactile feel on touchpads/screens
    const tickOsc = ctx.createOscillator();
    tickOsc.type = 'sine';
    tickOsc.frequency.setValueAtTime(isMajorTick ? 2850 : 2350, now);
    tickOsc.frequency.exponentialRampToValueAtTime(1180, now + 0.008);
    const tickGain = ctx.createGain();
    tickGain.gain.setValueAtTime(Math.min(0.38, (isMajorTick ? 0.24 : 0.15) * strengthNorm * accent), now);
    tickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.009);
    tickOsc.connect(tickGain);
    tickGain.connect(outNode);
    tickOsc.start(now);
    tickOsc.stop(now + 0.012);

    // Tone 2: Boosted calibrated classic mouse microswitch snap
    const snapNorm = Math.max(0, Math.min(1, cal.mouseSnapBlend / 100));
    if (snapNorm > 0.02) {
      this.playClassicLeftMouseClick(
        ctx,
        outNode,
        now,
        Math.min(1.55, snapNorm * strengthNorm * (isMajorTick ? 0.92 * accent : 0.62)),
        isMajorTick ? 'press' : 'release'
      );
    }
  }

  /**
   * Calibrated physical end-stop impact when rotary dial hits 0% (-135°) or 100% (+135°).
   */
  public triggerCalibratedRotaryEndStop(
    cal: RotaryDriverCalibrationConfig,
    boundary: 'min' | 'max'
  ): void {
    const stopNorm = Math.max(0, Math.min(1, cal.endStopResistance / 100));
    if (stopNorm <= 0.02) return;

    const p1 = Math.max(6, Math.round(16 * stopNorm));
    const p2 = Math.max(8, Math.round(24 * stopNorm));
    this.triggerVibrate([p1, 8, p2]);
    this.clutchImpulse = Math.min(1.6, Math.max(this.clutchImpulse, 0.85 * stopNorm));

    const ctx = this.ensureContext();
    if (!ctx) return;
    const outNode = this.getOutputNode(ctx);
    const now = ctx.currentTime;

    // Deep damped end-stop thud strictly < 160 Hz
    const stopHz = boundary === 'min' ? 46 : 62;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(stopHz, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.055);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.24 * stopNorm, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

    osc.connect(gain);
    gain.connect(outNode);
    osc.start(now);
    osc.stop(now + 0.065);

    this.playClassicLeftMouseClick(
      ctx,
      outNode,
      now,
      0.52 * stopNorm * (cal.mouseSnapBlend / 100),
      'press'
    );
  }

  /**
   * Calibrated central shaft push-switch click on the machined rotary knob.
   */
  public triggerCalibratedRotaryAxialPush(
    cal: RotaryDriverCalibrationConfig,
    mode: 'press' | 'release'
  ): void {
    const forceNorm =
      mode === 'press'
        ? Math.max(0.05, cal.axialPushForce / 100)
        : Math.max(0.05, cal.backlashClutch / 100);

    if (mode === 'press') {
      const pMs = Math.max(6, Math.round(18 * forceNorm));
      this.triggerVibrate([pMs, 10, Math.round(pMs * 1.25)]);
      this.pressImpulse = Math.min(1.6, Math.max(this.pressImpulse, 0.95 * forceNorm));
    } else {
      const rMs = Math.max(4, Math.round(12 * forceNorm));
      this.triggerVibrate([rMs]);
      this.clutchImpulse = Math.min(1.4, Math.max(this.clutchImpulse, 0.65 * forceNorm));
    }

    const ctx = this.ensureContext();
    if (!ctx) return;
    const outNode = this.getOutputNode(ctx);
    const now = ctx.currentTime;

    const baseHz = Math.min(
      154,
      Math.max(36, cal.lowBodyFreqHz * (mode === 'press' ? 0.94 : 0.78))
    );
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseHz, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + (mode === 'press' ? 0.055 : 0.032));

    const gain = ctx.createGain();
    gain.gain.setValueAtTime((mode === 'press' ? 0.28 : 0.14) * forceNorm, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (mode === 'press' ? 0.06 : 0.036));

    osc.connect(gain);
    gain.connect(outNode);
    osc.start(now);
    osc.stop(now + 0.068);

    this.playClassicLeftMouseClick(
      ctx,
      outNode,
      now,
      Math.min(1.2, forceNorm * (0.45 + (cal.mouseSnapBlend / 100) * 0.65)),
      mode
    );
  }

  public startHoldRamp(
    synth: SynthPatchSettings,
    haptic: HapticSettings,
    onLevelUpdate?: (level: number) => void,
    overrideMaterial?: HapticMaterialType
  ): void {
    this.stopHoldRamp();
    if (!haptic.enabled || haptic.intensity <= 0) return;

    const ctx = this.ensureContext();
    const startTs = performance.now();
    const mat = overrideMaterial || haptic.material;
    const profile = MATERIAL_PROFILES[mat];
    const progressiveEnabled = haptic.progressiveHoldEnabled !== false;
    const rampDurationSec = Math.max(
      0.35,
      Math.min(4.0, (haptic.holdRampDurationMs ?? 1400) / 1000)
    );
    const baseIntensityNorm = Math.max(0.05, Math.min(1, haptic.intensity / 100));
    const computedPeakPct =
      haptic.holdPeakIntensity ??
      Math.min(100, Math.round(haptic.intensity * haptic.holdRampMultiplier));
    const peakIntensityNorm = progressiveEnabled
      ? Math.max(baseIntensityNorm, Math.min(1, computedPeakPct / 100))
      : baseIntensityNorm;

    const baseLowHz =
      synth.baseFrequency >= 160
        ? 86
        : Math.max(34, Math.min(156, synth.baseFrequency));

    if (ctx) {
      const outNode = this.getOutputNode(ctx);
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(Math.max(32, baseLowHz * 0.65), now);
      gain.gain.setValueAtTime(0.001, now);
      osc.connect(gain);
      gain.connect(outNode);
      osc.start(now);
      this.holdOsc = osc;
      this.holdGain = gain;
    }

    this.holdIntervalId = window.setInterval(() => {
      const elapsedSec = (performance.now() - startTs) / 1000;
      const progress = progressiveEnabled
        ? Math.min(1, elapsedSec / rampDurationSec)
        : 0;
      // Smooth cubic ease-out escalation curve for progressive hold intensity
      const easedProgress = 1 - Math.pow(1 - progress, 2.2);
      const effectiveIntensityNorm = Math.min(
        1,
        baseIntensityNorm +
          (peakIntensityNorm - baseIntensityNorm) *
            easedProgress *
            Math.min(1.35, haptic.holdRampMultiplier / 1.45)
      );
      const normalizedLevel = progressiveEnabled
        ? Math.min(1, 0.18 + easedProgress * 0.82)
        : Math.min(1, baseIntensityNorm * 0.55);

      onLevelUpdate?.(normalizedLevel);

      const pulse = Math.round(
        Math.min(
          115,
          (8 + normalizedLevel * 54) * effectiveIntensityNorm
        )
      );
      if (pulse > 3) {
        this.triggerVibrate([pulse]);
      }
      this.pressImpulse = Math.min(
        1.5,
        Math.max(this.pressImpulse, 0.28 + effectiveIntensityNorm * 0.72)
      );

      if (this.ctx && this.holdOsc && this.holdGain) {
        const now = this.ctx.currentTime;
        const targetFreq = Math.min(
          154,
          Math.max(
            36,
            baseLowHz *
              (0.65 +
                normalizedLevel * 0.45 * Math.min(1.2, profile.filterMultiplier))
          )
        );
        this.holdOsc.frequency.setTargetAtTime(targetFreq, now, 0.055);
        this.holdGain.gain.setTargetAtTime(
          0.095 * effectiveIntensityNorm,
          now,
          0.055
        );
      }
    }, 105);
  }

  public stopHoldRamp(): void {
    if (this.holdIntervalId !== null) {
      window.clearInterval(this.holdIntervalId);
      this.holdIntervalId = null;
    }
    if (this.ctx && this.holdGain && this.holdOsc) {
      const now = this.ctx.currentTime;
      try {
        this.holdGain.gain.setTargetAtTime(0.0001, now, 0.03);
        this.holdOsc.stop(now + 0.08);
      } catch {
        // Ignore already stopped
      }
    }
    this.holdOsc = null;
    this.holdGain = null;
  }

  public startAmbientTrack(rootFreq = 220, volume = 0.5): void {
    this.stopAmbientTrack();
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.linearRampToValueAtTime(Math.max(0.01, volume * 0.16), now + 0.6);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1100, now);

    const ratios = [1, 1.25, 1.5, 1.875];
    const oscs = ratios.map((ratio, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(rootFreq * ratio, now);
      osc.detune.setValueAtTime((i - 1.5) * 6, now);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.22 / (i + 1), now);
      osc.connect(g);
      g.connect(filter);
      osc.start(now);
      return osc;
    });

    const outNode = this.getOutputNode(ctx);
    filter.connect(masterGain);
    masterGain.connect(outNode);
    if (this.reverbNode) {
      masterGain.connect(this.reverbNode);
      this.reverbNode.connect(outNode);
    }

    this.ambientNodes = { oscs, masterGain, filter };
  }

  public setAmbientVolume(volume: number): void {
    if (!this.ctx || !this.ambientNodes) return;
    const now = this.ctx.currentTime;
    this.ambientNodes.masterGain.gain.setTargetAtTime(
      Math.max(0.0001, volume * 0.18),
      now,
      0.05
    );
    this.ambientNodes.filter.frequency.setTargetAtTime(
      450 + volume * 2200,
      now,
      0.08
    );
  }

  public stopAmbientTrack(): void {
    if (!this.ctx || !this.ambientNodes) return;
    const now = this.ctx.currentTime;
    const { oscs, masterGain } = this.ambientNodes;
    try {
      masterGain.gain.setTargetAtTime(0.0001, now, 0.08);
      oscs.forEach((osc) => osc.stop(now + 0.25));
    } catch {
      // Ignore
    }
    this.ambientNodes = null;
  }

  /**
   * Zero-GC real-time audio & haptic impulse sampler for Three.js tick loops.
   * Uses wall-clock delta so multiple 3D viewports can sample safely in the same frame.
   */
  public sampleRealtimeTelemetry(dt: number, out: RealtimeAudioHapticTelemetry): void {
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const wallDt =
      this.lastSampleMs > 0
        ? Math.min(0.1, Math.max(0, (nowMs - this.lastSampleMs) / 1000))
        : dt;
    this.lastSampleMs = nowMs;

    if (wallDt > 0.0005) {
      const decayFast = Math.exp(-7.5 * wallDt);
      const decayClutch = Math.exp(-9.0 * wallDt);
      this.pressImpulse = this.pressImpulse > 0.002 ? this.pressImpulse * decayFast : 0;
      this.clutchImpulse = this.clutchImpulse > 0.002 ? this.clutchImpulse * decayClutch : 0;
    }

    // Evaluate instantaneous haptic pulse schedule [vibrate, pause, vibrate, ...]
    let gate = 0;
    let segIdx = -1;
    if (this.vibratePulses.length > 0 && this.vibrateStartMs > 0) {
      const elapsedMs = nowMs - this.vibrateStartMs;
      let acc = 0;
      for (let i = 0; i < this.vibratePulses.length; i++) {
        const segDur = this.vibratePulses[i];
        if (elapsedMs >= acc && elapsedMs < acc + segDur) {
          segIdx = i;
          gate = i % 2 === 0 ? 1 : 0;
          break;
        }
        acc += segDur;
      }
      if (segIdx === -1 && elapsedMs >= acc) {
        this.vibratePulses = [];
      }
    }

    out.pressImpulse = this.pressImpulse;
    out.clutchImpulse = this.clutchImpulse;
    out.patternGate = gate;
    out.activePulseIndex = segIdx;

    const fallbackDecay = Math.exp(-7.5 * Math.max(0.001, dt));
    if (!this.ctx || this.ctx.state !== 'running' || !this.analyser || !this.freqData) {
      out.rms *= fallbackDecay;
      out.bass *= fallbackDecay;
      out.mid *= fallbackDecay;
      out.treble *= fallbackDecay;
      for (let i = 0; i < 32; i++) {
        out.bins[i] *= fallbackDecay;
      }
      return;
    }

    this.analyser.getByteFrequencyData(this.freqData);
    let bassSum = 0;
    let midSum = 0;
    let trebleSum = 0;
    let sqSum = 0;
    const activeBins = Math.min(384, this.freqData.length); // ~0..9 kHz at 48kHz / 2048 FFT

    for (let i = 0; i < activeBins; i++) {
      const norm = this.freqData[i] / 255;
      sqSum += norm * norm;
      if (i < 8) bassSum += norm;
      else if (i < 96) midSum += norm;
      else trebleSum += norm;
    }

    for (let b = 0; b < 32; b++) {
      const baseIdx = b * 8;
      let chunk = 0;
      for (let k = 0; k < 8; k++) {
        chunk += this.freqData[baseIdx + k] || 0;
      }
      out.bins[b] = chunk / (8 * 255);
    }

    out.rms = Math.min(1, Math.sqrt(sqSum / activeBins) * 2.4);
    out.bass = Math.min(1, (bassSum / 8) * 1.65);
    out.mid = Math.min(1, (midSum / 88) * 2.1);
    out.treble = Math.min(1, (trebleSum / Math.max(1, activeBins - 96)) * 2.6);
  }

  /**
   * Starts or updates a continuous, quiet laboratory carrier wave shaped by the selected
   * haptic material (Glass, Metal, Plastic, Suede) so users can inspect steady-state
   * frequency & harmonic structure on the Haptic Oscilloscope.
   */
  public setContinuousMaterialCarrier(
    active: boolean,
    synth: SynthPatchSettings,
    haptic: HapticSettings
  ): void {
    if (!active || !haptic.enabled) {
      this.stopContinuousMaterialCarrier();
      return;
    }

    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const sig = MATERIAL_ACOUSTIC_SIGNATURES[haptic.material];
    const hardnessNorm = haptic.materialHardness / 100;
    const intensityNorm = Math.max(0.08, haptic.intensity / 100);
    const bodyHz = Math.min(
      155,
      Math.max(36, (synth.baseFrequency >= 160 ? 86 : synth.baseFrequency) * (0.9 + hardnessNorm * 0.1))
    );
    this.lastTriggeredMaterial = haptic.material;
    this.lastConfiguredBodyHz = Math.round(bodyHz * 10) / 10;

    // Distinct overtone ratio per material so the oscilloscope waveform geometry visibly transforms
    const overtoneFreq =
      haptic.material === 'shiny-glass'
        ? bodyHz * 6.0
        : haptic.material === 'frosted-glass'
          ? bodyHz * 4.0
          : haptic.material === 'matte-metal'
            ? bodyHz * 5.656 // inharmonic 4*sqrt(2) metallic partial
            : haptic.material === 'abs-plastic'
              ? bodyHz * 3.0 // odd-harmonic polymer snap symmetry
              : bodyHz * 1.5; // soft suede warmth

    const overtoneLevel =
      haptic.material === 'shiny-glass'
        ? 0.048
        : haptic.material === 'frosted-glass'
          ? 0.032
          : haptic.material === 'matte-metal'
            ? 0.056
            : haptic.material === 'abs-plastic'
              ? 0.044
              : 0.012;

    if (!this.carrierNodes) {
      const outNode = this.getOutputNode(ctx);
      const bodyOsc = ctx.createOscillator();
      const overtoneOsc = ctx.createOscillator();
      const lfoOsc = ctx.createOscillator();
      const overtoneGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const masterGain = ctx.createGain();

      bodyOsc.type = synth.waveform;
      overtoneOsc.type =
        haptic.material === 'matte-metal'
          ? 'triangle'
          : haptic.material === 'abs-plastic'
            ? 'square'
            : 'sine';
      lfoOsc.type = 'sine';
      lfoOsc.frequency.setValueAtTime(3.2, now);

      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(0.015, now);
      lfoOsc.connect(lfoGain);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(6400, sig.surfaceFormantHz * 1.25), now);
      filter.Q.setValueAtTime(Math.min(6, sig.formantQ * 0.5), now);

      bodyOsc.frequency.setValueAtTime(bodyHz, now);
      overtoneOsc.frequency.setValueAtTime(overtoneFreq, now);
      overtoneGain.gain.setValueAtTime(overtoneLevel * intensityNorm, now);
      masterGain.gain.setValueAtTime(0.0001, now);
      masterGain.gain.linearRampToValueAtTime(0.14 * intensityNorm, now + 0.08);
      lfoGain.connect(masterGain.gain);

      bodyOsc.connect(filter);
      overtoneOsc.connect(overtoneGain);
      overtoneGain.connect(filter);
      filter.connect(masterGain);
      masterGain.connect(outNode);

      bodyOsc.start(now);
      overtoneOsc.start(now);
      lfoOsc.start(now);

      this.carrierNodes = {
        bodyOsc,
        overtoneOsc,
        lfoOsc,
        masterGain,
        overtoneGain,
        filter,
      };
    } else {
      this.carrierNodes.bodyOsc.type = synth.waveform;
      this.carrierNodes.overtoneOsc.type =
        haptic.material === 'matte-metal'
          ? 'triangle'
          : haptic.material === 'abs-plastic'
            ? 'square'
            : 'sine';
      this.carrierNodes.bodyOsc.frequency.setTargetAtTime(bodyHz, now, 0.03);
      this.carrierNodes.overtoneOsc.frequency.setTargetAtTime(overtoneFreq, now, 0.03);
      this.carrierNodes.overtoneGain.gain.setTargetAtTime(
        overtoneLevel * intensityNorm,
        now,
        0.04
      );
      this.carrierNodes.filter.frequency.setTargetAtTime(
        Math.min(6400, sig.surfaceFormantHz * 1.25),
        now,
        0.04
      );
      this.carrierNodes.masterGain.gain.setTargetAtTime(
        0.14 * intensityNorm,
        now,
        0.04
      );
    }
  }

  public stopContinuousMaterialCarrier(): void {
    if (!this.ctx || !this.carrierNodes) return;
    const now = this.ctx.currentTime;
    const nodes = this.carrierNodes;
    this.carrierNodes = null;
    try {
      nodes.masterGain.gain.setTargetAtTime(0.0001, now, 0.025);
      nodes.bodyOsc.stop(now + 0.09);
      nodes.overtoneOsc.stop(now + 0.09);
      nodes.lfoOsc.stop(now + 0.09);
    } catch {
      // Ignore already stopped oscillators
    }
  }

  /**
   * Captures a rising-edge triggered time-domain waveform window (`outSamples`, e.g. 512..1024 samples)
   * directly from the live Web Audio AnalyserNode along with real amplitude and frequency telemetry.
   */
  public sampleOscilloscopeFrame(
    outSamples: Float32Array,
    fallbackMaterial: HapticMaterialType,
    fallbackSub160Hz: number
  ): HapticOscilloscopeReadout {
    const activeMaterial = this.lastTriggeredMaterial || fallbackMaterial;
    const sig = MATERIAL_ACOUSTIC_SIGNATURES[activeMaterial];
    const configuredSub160Hz =
      this.lastConfiguredBodyHz > 0
        ? this.lastConfiguredBodyHz
        : Math.min(156, Math.max(36, fallbackSub160Hz));

    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let gate = 0;
    let segIdx = -1;
    if (this.vibratePulses.length > 0 && this.vibrateStartMs > 0) {
      const elapsedMs = nowMs - this.vibrateStartMs;
      let acc = 0;
      for (let i = 0; i < this.vibratePulses.length; i++) {
        const segDur = this.vibratePulses[i];
        if (elapsedMs >= acc && elapsedMs < acc + segDur) {
          segIdx = i;
          gate = i % 2 === 0 ? 1 : 0;
          break;
        }
        acc += segDur;
      }
    }

    if (
      !this.ctx ||
      this.ctx.state !== 'running' ||
      !this.analyser ||
      !this.timeDomainData ||
      !this.freqData
    ) {
      outSamples.fill(0);
      return {
        sampleRate: 48000,
        isAudioActive: false,
        peakAmplitude: 0,
        rmsAmplitude: 0,
        amplitudeDb: -60,
        measuredFundamentalHz: configuredSub160Hz,
        spectralCentroidHz: sig.surfaceFormantHz,
        configuredSub160Hz,
        surfaceFormantHz: sig.surfaceFormantHz,
        pressImpulse: this.pressImpulse,
        clutchImpulse: this.clutchImpulse,
        patternGate: gate,
        activePulseIndex: segIdx,
        activeMaterial,
      };
    }

    this.analyser.getFloatTimeDomainData(this.timeDomainData);
    this.analyser.getByteFrequencyData(this.freqData);

    const raw = this.timeDomainData;
    const sampleRate = this.ctx.sampleRate || 48000;
    let peak = 0;
    let sqSum = 0;
    for (let i = 0; i < raw.length; i++) {
      const v = raw[i];
      const absV = Math.abs(v);
      if (absV > peak) peak = absV;
      sqSum += v * v;
    }
    const rms = Math.sqrt(sqSum / raw.length);
    const isSignalPresent = peak > 0.0025;

    // Rising-edge trigger lock (search first half of buffer so full window fits)
    let triggerOffset = 0;
    const maxSearch = Math.max(1, raw.length - outSamples.length - 1);
    if (isSignalPresent) {
      for (let i = 4; i < maxSearch; i++) {
        if (raw[i - 1] <= 0 && raw[i] > 0 && raw[i] - raw[i - 1] > 0.0015) {
          triggerOffset = i;
          break;
        }
      }
    }

    for (let i = 0; i < outSamples.length; i++) {
      outSamples[i] = raw[triggerOffset + i] || 0;
    }

    // Estimate real zero-crossing frequency when signal is present
    let measuredFundamentalHz = configuredSub160Hz;
    if (isSignalPresent) {
      const crossings: number[] = [];
      for (let i = 1; i < raw.length; i++) {
        if (raw[i - 1] <= 0 && raw[i] > 0 && Math.abs(raw[i] - raw[i - 1]) > 0.001) {
          // Fractional sample interpolation for sub-Hz precision
          const frac = -raw[i - 1] / (raw[i] - raw[i - 1]);
          crossings.push(i - 1 + frac);
        }
      }
      if (crossings.length >= 2) {
        const avgSamplesPerCycle =
          (crossings[crossings.length - 1] - crossings[0]) / (crossings.length - 1);
        if (avgSamplesPerCycle > 4) {
          const estHz = sampleRate / avgSamplesPerCycle;
          if (estHz >= 24 && estHz <= 8000) {
            measuredFundamentalHz = Math.round(estHz * 10) / 10;
          }
        }
      }
    }

    // Spectral dominant peak above 220 Hz for transient formant readout
    let maxHighBin = 0;
    let maxHighVal = 0;
    const binHz = sampleRate / this.analyser.fftSize;
    const startHighBin = Math.max(2, Math.floor(240 / binHz));
    const endHighBin = Math.min(this.freqData.length - 1, Math.ceil(7500 / binHz));
    for (let b = startHighBin; b <= endHighBin; b++) {
      if (this.freqData[b] > maxHighVal) {
        maxHighVal = this.freqData[b];
        maxHighBin = b;
      }
    }
    const spectralCentroidHz =
      maxHighVal > 18 ? Math.round(maxHighBin * binHz) : sig.surfaceFormantHz;

    const amplitudeDb =
      rms > 0.00005 ? Math.max(-60, Math.min(0, 20 * Math.log10(rms))) : -60;

    return {
      sampleRate,
      isAudioActive: isSignalPresent,
      peakAmplitude: Math.min(1, peak),
      rmsAmplitude: Math.min(1, rms),
      amplitudeDb: Math.round(amplitudeDb * 10) / 10,
      measuredFundamentalHz,
      spectralCentroidHz,
      configuredSub160Hz,
      surfaceFormantHz: sig.surfaceFormantHz,
      pressImpulse: this.pressImpulse,
      clutchImpulse: this.clutchImpulse,
      patternGate: gate,
      activePulseIndex: segIdx,
      activeMaterial,
    };
  }
  /**
   * Dedicated Crystalline Glass / Cymbałki (Glockenspiel) modal synthesizer:
   * Long high-frequency resonant phase with harmonic bar partials (1 : 2.756 : 5.404)
   * + crisp glass strike transient + optional synchronized haptic vibration.
   */
  public triggerGlassChime(options?: {
    baseFreqHz?: number; // e.g. 1046.5 (C6) .. 2093 (C7)
    resonanceMs?: number; // 140..950 ms (long crystalline tail)
    brilliance?: number; // 0..100 high-frequency overtone shimmer
    strikeHardness?: number; // 0..100 mallet attack crispness
    vibrateMs?: number; // 0..45 ms haptic pulse
    gain?: number; // 0.05..1.0
  }): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const baseFreq = Math.max(440, Math.min(3600, options?.baseFreqHz ?? 1318.5)); // E6 default
    const decaySec = Math.max(0.12, Math.min(1.1, (options?.resonanceMs ?? 480) / 1000));
    const brilliance = Math.max(0, Math.min(1, (options?.brilliance ?? 78) / 100));
    const hardness = Math.max(0, Math.min(1, (options?.strikeHardness ?? 72) / 100));
    const masterAmp = Math.max(0.05, Math.min(0.85, options?.gain ?? 0.36));

    const out = this.masterGain ?? ctx.destination;
    this.lastTriggeredMaterial = 'shiny-glass';
    this.pressImpulse = 1;

    // High-Q optical glass / glockenspiel bar modal partials
    const partials: Array<{ ratio: number; amp: number; decayMult: number; detuneCents?: number }> = [
      { ratio: 1.0, amp: 1.0, decayMult: 1.0 },
      { ratio: 1.0, amp: 0.34 * brilliance, decayMult: 0.96, detuneCents: 6.5 }, // crystalline shimmer beat
      { ratio: 2.756, amp: 0.42 * (0.4 + brilliance * 0.6), decayMult: 0.68 },
      { ratio: 5.404, amp: 0.18 * brilliance, decayMult: 0.44 },
    ];

    partials.forEach((p) => {
      const freq = baseFreq * p.ratio;
      if (freq > 14500) return;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      if (p.detuneCents) osc.detune.setValueAtTime(p.detuneCents, now);

      const g = ctx.createGain();
      const peak = masterAmp * p.amp * 0.42;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(peak, now + 0.002 + (1 - hardness) * 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, now + decaySec * p.decayMult);

      osc.connect(g);
      g.connect(out);
      osc.start(now);
      osc.stop(now + decaySec * p.decayMult + 0.02);
    });

    // Crisp glass mallet strike transient
    const strikeOsc = ctx.createOscillator();
    strikeOsc.type = 'triangle';
    strikeOsc.frequency.setValueAtTime(Math.min(7200, baseFreq * 3.2), now);
    strikeOsc.frequency.exponentialRampToValueAtTime(baseFreq * 1.4, now + 0.014);
    const strikeGain = ctx.createGain();
    strikeGain.gain.setValueAtTime(masterAmp * (0.12 + hardness * 0.22), now);
    strikeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.016);
    strikeOsc.connect(strikeGain);
    strikeGain.connect(out);
    strikeOsc.start(now);
    strikeOsc.stop(now + 0.02);

    const vib = Math.round(options?.vibrateMs ?? 12);
    if (vib > 0 && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(vib);
      } catch {
        // Ignore browser vibration restrictions
      }
    }
  }

  /**
   * 4 Core Audio-Tactile-Vibrational Sensation Profiles for Magic Sounds
   */
  public triggerFourCoreSensation(
    profile: 'glass-chime' | 'metal-detent' | 'tactile-dome' | 'sub-velvet',
    options?: { baseFreqHz?: number; resonanceMs?: number; brilliance?: number; gain?: number }
  ): void {
    if (profile === 'glass-chime') {
      this.triggerGlassChime({
        baseFreqHz: options?.baseFreqHz ?? 1318.5,
        resonanceMs: options?.resonanceMs ?? 520,
        brilliance: options?.brilliance ?? 82,
        strikeHardness: 76,
        vibrateMs: 10,
        gain: options?.gain ?? 0.38,
      });
      return;
    }
    if (profile === 'metal-detent') {
      this.triggerMinimalistLowClick('titanium-micro-detent-11ms', options?.gain ?? 0.65);
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try { navigator.vibrate([12, 18, 8]); } catch {}
      }
      return;
    }
    if (profile === 'tactile-dome') {
      this.triggerMinimalistLowClick('polymer-dome-snap-7ms', options?.gain ?? 0.62);
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try { navigator.vibrate(14); } catch {}
      }
      return;
    }
    // sub-velvet: deep damped <140 Hz warmth + smooth vibration
    this.triggerMinimalistLowClick('velvet-sub-pulse-14ms', options?.gain ?? 0.68);
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate([24, 14, 16]); } catch {}
    }
  }
}

export const hapticAudio = new HapticAudioEngine();

export function exportMinimalistLowClickAsset(
  variantId: MinimalistLowClickId,
  format: 'wav' | 'json'
): { fileName: string; durationMs: number; fundamentalHz: number } {
  const spec =
    MINIMALIST_LOW_CLICK_VARIANTS.find((v) => v.id === variantId) ||
    MINIMALIST_LOW_CLICK_VARIANTS[0];

  if (format === 'json') {
    const payload = {
      schema: 'aether.minimalist-low-click.v1',
      id: spec.id,
      namePl: spec.namePl,
      categoryPl: spec.categoryPl,
      verifiedSub160Hz: spec.fundamentalHz < 160,
      fundamentalHz: spec.fundamentalHz,
      pitchDropHz: spec.pitchDropHz,
      durationMs: spec.durationMs,
      waveform: spec.waveform,
      microTransientLevel: spec.microTransientLevel,
      vibratePulseMs: spec.vibratePulseMs,
      recommendedMaterial: spec.recommendedMaterial,
      exportedAt: new Date().toISOString(),
    };
    const jsonBlob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const fileName = `aether-minimal-click-${spec.id}.json`;
    const url = URL.createObjectURL(jsonBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 2500);
    return {
      fileName,
      durationMs: spec.durationMs,
      fundamentalHz: spec.fundamentalHz,
    };
  }

  // Synthesize crisp 48 kHz 16-bit mono WAV buffer with generous 36 ms window around the 4–14 ms pulse
  const sampleRate = 48000;
  const totalWindowSec = 0.04;
  const numSamples = Math.floor(sampleRate * totalWindowSec);
  const pcmFloat = new Float32Array(numSamples);

  const durSec = Math.max(0.004, spec.durationMs / 1000) + 0.006;
  let phaseBody = 0;
  let phaseSub = 0;
  let phaseTransient = 0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    if (t <= durSec) {
      const progress = Math.min(1, t / durSec);
      const instHz =
        spec.fundamentalHz * Math.pow(spec.pitchDropHz / spec.fundamentalHz, progress);
      phaseBody += (2 * Math.PI * instHz) / sampleRate;
      phaseSub += (2 * Math.PI * (instHz * 0.5)) / sampleRate;

      const bodySample =
        spec.waveform === 'triangle'
          ? (2 / Math.PI) * Math.asin(Math.sin(phaseBody))
          : Math.sin(phaseBody);
      const subSample = Math.sin(phaseSub) * 0.34;

      const attackEnv = Math.min(1, t / 0.0009);
      const decayEnv = Math.exp((-4.6 * t) / durSec);
      let sample = (bodySample * 0.72 + subSample) * attackEnv * decayEnv;

      if (t < 0.0032 && spec.microTransientLevel > 0.02) {
        const clickHz = Math.min(760, spec.fundamentalHz * 6.0) * Math.exp(-t / 0.0018);
        phaseTransient += (2 * Math.PI * clickHz) / sampleRate;
        sample +=
          Math.sin(phaseTransient) *
          spec.microTransientLevel *
          0.32 *
          Math.exp(-t / 0.0011);
      }

      pcmFloat[i] = Math.max(-0.98, Math.min(0.98, sample));
    } else {
      pcmFloat[i] = 0;
    }
  }

  const wavByteLen = 44 + numSamples * 2;
  const wavBuffer = new ArrayBuffer(wavByteLen);
  const view = new DataView(wavBuffer);
  const writeAscii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, pcmFloat[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
  const fileName = `aether-minimal-click-${spec.id}-${spec.fundamentalHz}Hz-${spec.durationMs}ms.wav`;
  const url = URL.createObjectURL(wavBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 2500);

  return {
    fileName,
    durationMs: spec.durationMs,
    fundamentalHz: spec.fundamentalHz,
  };
}
