export type HapticMaterialType =
  | 'shiny-glass'
  | 'frosted-glass'
  | 'matte-metal'
  | 'abs-plastic'
  | 'suede';

export type PaletteMode =
  | 'pearl-flebologia'
  | 'finance-ice'
  | 'emerald-clinic';

export type EngravingSymbol =
  | 'vascular'
  | 'droplet'
  | 'wave'
  | 'spark'
  | 'prism'
  | 'ring'
  | 'compass'
  | 'none';

export type ButtonGroupId = 'group-primary' | 'group-diagnostic' | 'group-audio';

export interface DepthShadowSettings {
  elevation: number; // 4 - 40 px
  blur: number; // 8 - 80 px
  glassBlur: number; // 6 - 36 px
  glassOpacity: number; // 0.35 - 0.92
  borderRadius: number; // 16 - 38 px
  specularRim: number; // 0 - 100 %
}

export interface SynthPatchSettings {
  waveform: OscillatorType;
  baseFrequency: number; // 36 - 158 Hz (< 160 Hz)
  harmonicRatio: number; // 1.0 - 4.0
  filterCutoff: number; // 250 - 8000 Hz
  filterResonance: number; // 0.5 - 14
  attackMs: number; // 2 - 120 ms
  decayMs: number; // 40 - 650 ms
  reverbMix: number; // 0 - 0.85
  subBassLevel: number; // 0 - 0.8
}

export type MinimalistLowClickId =
  | 'sub-carbon-6ms'
  | 'quartz-detent-8ms'
  | 'monolith-thud-12ms'
  | 'ceramic-pip-5ms'
  | 'satin-tick-4ms'
  | 'anodized-relay-9ms'
  | 'vacuum-seal-14ms'
  | 'titanium-whisper-7ms'
  | 'crystal-glass-tap-9ms'
  | 'leica-shutter-snap-6ms'
  | 'velvet-clinic-chime-15ms'
  | 'calacatta-marble-tap-8ms'
  | 'liquid-gold-drop-11ms'
  | 'deep-sub-pulse-16ms'
  | 'hi-fi-steel-detent-5ms';

export interface MinimalistLowClickSpec {
  id: MinimalistLowClickId;
  namePl: string;
  shortLabelPl: string;
  categoryPl: string;
  descriptionPl: string;
  fundamentalHz: number; // strictly < 160 Hz (42 - 112 Hz)
  pitchDropHz: number; // sub-bass settle frequency (26 - 68 Hz)
  durationMs: number; // ultra-short 4 - 14 ms
  waveform: 'sine' | 'triangle';
  microTransientLevel: number; // 0.04 - 0.28 subtle dry contact
  vibratePulseMs: number; // 3 - 10 ms single clean micro-pulse
  recommendedMaterial: HapticMaterialType;
  accentHex: string;
  codeSnippet: string;
}

export interface HapticSettings {
  enabled: boolean;
  material: HapticMaterialType;
  intensity: number; // 0 - 100 %
  durationMs: number; // 8 - 260 ms
  materialHardness: number; // 0 - 100 Shore/Mohs
  reverseClutchForce: number; // 0 - 100 %
  holdRampMultiplier: number; // 1.0 - 3.0x
  /** Default true: progressively increases vibration intensity on longer presses */
  progressiveHoldEnabled?: boolean;
  /** Target peak vibration intensity (0-100%) reached on sustained press */
  holdPeakIntensity?: number;
  /** Ramp time in ms from initial press intensity to peak intensity */
  holdRampDurationMs?: number;
  activePatternId: string;
  minimalistClickVariant?: MinimalistLowClickId | 'none';
}

export interface CustomHapticPattern {
  id: string;
  name: string;
  description: string;
  pulses: number[]; // alternating vibrate/pause ms: [vibrate, pause, vibrate...]
  hardness: number;
  reverseClutch: number;
  isCustom?: boolean;
  dbId?: number;
}

export interface EngravingBacklightSettings {
  symbol: EngravingSymbol;
  glowEnabled: boolean;
  glowColor: string;
  glowIntensity: number; // 0 - 100 %
  etchDepth: number; // 1 - 100 %
}

export type ButtonMotionPresetId =
  | 'magnetic-levitation'
  | 'liquid-glass-spring'
  | 'cnc-micro-detent'
  | 'velvet-cushion'
  | 'rocker-tilt'
  | 'harmonic-hover-lift';

export type ButtonIlluminationPresetId =
  | 'cursor-spotlight'
  | 'conic-border-beam'
  | 'prism-refraction-sweep'
  | 'subsurface-caustic'
  | 'horizon-dual-rim'
  | 'breathing-etched-halo';

export interface ButtonMotionPresetSpec {
  id: ButtonMotionPresetId;
  name: string;
  category: string;
  description: string;
  stiffness: number;
  damping: number;
  mass: number;
  pressScale: number;
  hoverLiftPx: number;
  latencyLabel: string;
  codeSnippet: string;
}

export interface ButtonIlluminationPresetSpec {
  id: ButtonIlluminationPresetId;
  name: string;
  category: string;
  description: string;
  glowSpread: number;
  defaultColor: string;
  opticalTrait: string;
  codeSnippet: string;
}

export interface OrganicAnimationConfig {
  stiffness: number;
  damping: number;
  mass: number;
  pressScale: number;
  rippleDurationMs: number;
  glowSpread: number;
  holdTremorHz: number;
  motionPreset?: ButtonMotionPresetId;
  illuminationPreset?: ButtonIlluminationPresetId;
  aiNote?: string;
}

export interface GroupOverrideConfig {
  material: HapticMaterialType;
  pitchOffsetSemitones: number;
  glowColor: string;
  symbol: EngravingSymbol;
}

export interface RenderPresetItem {
  id: string;
  title: string;
  category: string;
  palette: PaletteMode;
  material: HapticMaterialType;
  depth: DepthShadowSettings;
  prompt: string;
  sourceJson: Record<string, unknown>;
}

export interface SourcePromptItem {
  id: string;
  dbId?: number;
  title: string;
  category: string;
  promptText: string;
  sourceConfigJson: string;
  createdAt: string;
}

export interface RotaryDriverCalibrationConfig {
  detentCount: number; // 12 - 120 detents across full sweep
  majorTickEvery: number; // 5 | 10 | 12 subdivisions
  sweepAngleDeg: number; // 180 - 300 deg (270 deg on reference image)
  lowBodyFreqHz: number; // 36 - 156 Hz (strictly < 160 Hz)
  mouseSnapBlend: number; // 0 - 100 % (classic mouse microswitch 2nd tone blend)
  majorTickAccent: number; // 1.0 - 2.4x boost on major graduation marks
  rotaryHapticStrength: number; // 0 - 100 %
  tickPulseMs: number; // 3 - 36 ms
  endStopResistance: number; // 0 - 100 %
  axialPushForce: number; // 0 - 100 %
  backlashClutch: number; // 0 - 100 %
}

export type CalibrationTargetCharacter =
  | 'reference-cnc'
  | 'studio-master'
  | 'heavy-flywheel'
  | 'silent-night';

export interface DriverCalibrationReport {
  stepAngleDeg: number;
  maxCleanSpeedDegPerSec: number;
  minorImpulseIndex: number;
  majorImpulseIndex: number;
  verifiedSub160Hz: boolean;
  acousticBalanceScore: number;
  recommendation: string;
  calibratedAt: string;
}

export interface SavedDriverCalibrationProfile {
  id: string;
  dbId?: number;
  name: string;
  controllerModel: string;
  config: RotaryDriverCalibrationConfig;
  createdAt: string;
}

export interface StudioMediaItem {
  id: string;
  dbId?: number;
  title: string;
  subtitle: string;
  category: string;
  mediaType: 'image' | 'video';
  aspectRatio: string;
  resolution: string;
  prompt: string;
  src: string;
  audioFreq: number;
}

export const MATERIAL_PROFILES: Record<
  HapticMaterialType,
  {
    label: string;
    englishLabel: string;
    subtitle: string;
    defaultHardness: number;
    defaultReverseClutch: number;
    basePulses: number[];
    filterMultiplier: number;
    transientClick: number;
    roughness3D: number;
    metalness3D: number;
    transmission3D: number;
  }
> = {
  'shiny-glass': {
    label: 'Błyszczące szkło',
    englishLabel: 'Shiny Glass',
    subtitle: 'Kryształowy impuls wysoki, ostre odbicia lustrzane, natychmiastowa odpowiedź',
    defaultHardness: 92,
    defaultReverseClutch: 64,
    basePulses: [12, 16, 22],
    filterMultiplier: 1.65,
    transientClick: 0.9,
    roughness3D: 0.06,
    metalness3D: 0.08,
    transmission3D: 0.92,
  },
  'frosted-glass': {
    label: 'Szkło matowe',
    englishLabel: 'Frosted Glass',
    subtitle: 'Jedwabiste rozproszenie podpowierzchniowe, miękka fala rezonansu',
    defaultHardness: 74,
    defaultReverseClutch: 48,
    basePulses: [18, 22, 28],
    filterMultiplier: 1.15,
    transientClick: 0.58,
    roughness3D: 0.34,
    metalness3D: 0.05,
    transmission3D: 0.72,
  },
  'matte-metal': {
    label: 'Matowy pełny metal',
    englishLabel: 'Matte Metal',
    subtitle: 'Anodowane aluminium z wyczuwalnym zapadkowym sprzęgłem odwrotnym',
    defaultHardness: 96,
    defaultReverseClutch: 86,
    basePulses: [10, 12, 14, 10, 26],
    filterMultiplier: 0.95,
    transientClick: 1.0,
    roughness3D: 0.28,
    metalness3D: 0.92,
    transmission3D: 0.0,
  },
  'abs-plastic': {
    label: 'Tworzywo ABS (Plastik)',
    englishLabel: 'Tactile ABS Plastic',
    subtitle: 'Sprężysty przeskok polimerowej kopułki z krótkim, zwartym rezonansem komory',
    defaultHardness: 68,
    defaultReverseClutch: 56,
    basePulses: [11, 14, 19],
    filterMultiplier: 1.32,
    transientClick: 0.82,
    roughness3D: 0.24,
    metalness3D: 0.04,
    transmission3D: 0.08,
  },
  suede: {
    label: 'Zamsz',
    englishLabel: 'Suede',
    subtitle: 'Ciepłe tłumienie akustyczne, miękki skok i organiczne wygaszanie drgań',
    defaultHardness: 28,
    defaultReverseClutch: 26,
    basePulses: [32, 28, 40],
    filterMultiplier: 0.48,
    transientClick: 0.22,
    roughness3D: 0.88,
    metalness3D: 0.04,
    transmission3D: 0.0,
  },
};

export const BUILTIN_HAPTIC_PATTERNS: CustomHapticPattern[] = [
  {
    id: 'crystal-ripple',
    name: 'Kryształowa Fala (Dalej)',
    description: 'Podwójny impuls szkła optycznego z iryzującym wygaszeniem',
    pulses: [14, 18, 28, 14, 18],
    hardness: 84,
    reverseClutch: 58,
  },
  {
    id: 'mechanical-detent',
    name: 'Zapadka Sprzęgła Metalowego',
    description: 'Precyzyjny klik enkoderowy ze sprężystym odbiciem zwrotnym',
    pulses: [9, 12, 12, 10, 32],
    hardness: 95,
    reverseClutch: 88,
  },
  {
    id: 'velvet-pulse',
    name: 'Aksamitny Puls Zamszu',
    description: 'Głębokie, miękkie drganie niskoczęstotliwościowe bez ostrych krawędzi',
    pulses: [36, 26, 48],
    hardness: 26,
    reverseClutch: 24,
  },
  {
    id: 'harmonic-cascade',
    name: 'Kaskada Aether Studio',
    description: 'Czterostopniowa sekwencja narastająca dla grup przycisków',
    pulses: [12, 14, 18, 14, 26, 16, 42],
    hardness: 72,
    reverseClutch: 62,
  },
];

export const MINIMALIST_LOW_CLICK_VARIANTS: MinimalistLowClickSpec[] = [
  {
    id: 'sub-carbon-6ms',
    namePl: '01. Karbonowy Mikro-Styk',
    shortLabelPl: 'Karbon 58 Hz · 6 ms',
    categoryPl: 'Ultra-krótki styk matowy',
    descriptionPl:
      'Suchy, punktowy impuls włókna węglowego 58 Hz wygaszany w 6 ms do zera bez jakiegokolwiek dzwonienia wysokotonowego.',
    fundamentalHz: 58,
    pitchDropHz: 34,
    durationMs: 6,
    waveform: 'sine',
    microTransientLevel: 0.14,
    vibratePulseMs: 4,
    recommendedMaterial: 'matte-metal',
    accentHex: '#38BDF8',
    codeSnippet: 'hapticAudio.triggerMinimalistLowClick("sub-carbon-6ms") // 58→34 Hz · 6 ms',
  },
  {
    id: 'quartz-detent-8ms',
    namePl: '02. Kwarcowy Detent Optyczny',
    shortLabelPl: 'Kwarc 82 Hz · 8 ms',
    categoryPl: 'Czysty impuls kryształu',
    descriptionPl:
      'Minimalistyczne, krótkie kliknięcie precyzyjnej soczewki kwarcowej 82 Hz z natychmiastowym tłumieniem krawędziowym.',
    fundamentalHz: 82,
    pitchDropHz: 46,
    durationMs: 8,
    waveform: 'sine',
    microTransientLevel: 0.18,
    vibratePulseMs: 5,
    recommendedMaterial: 'shiny-glass',
    accentHex: '#818CF8',
    codeSnippet: 'hapticAudio.triggerMinimalistLowClick("quartz-detent-8ms") // 82→46 Hz · 8 ms',
  },
  {
    id: 'monolith-thud-12ms',
    namePl: '03. Monolityczny Sub-Impuls',
    shortLabelPl: 'Monolit 46 Hz · 12 ms',
    categoryPl: 'Głęboki fundament <50 Hz',
    descriptionPl:
      'Niskoczęstotliwościowe, gęste uderzenie bryły 46 Hz z wyczuwalną masą fizyczną i zerowym szumem mechanicznym.',
    fundamentalHz: 46,
    pitchDropHz: 28,
    durationMs: 12,
    waveform: 'sine',
    microTransientLevel: 0.06,
    vibratePulseMs: 8,
    recommendedMaterial: 'suede',
    accentHex: '#34D399',
    codeSnippet: 'hapticAudio.triggerMinimalistLowClick("monolith-thud-12ms") // 46→28 Hz · 12 ms',
  },
  {
    id: 'ceramic-pip-5ms',
    namePl: '04. Ceramiczna Zapadka Punktowa',
    shortLabelPl: 'Ceramika 96 Hz · 5 ms',
    categoryPl: 'Mikro-przeskok 5 ms',
    descriptionPl:
      'Chirurgicznie krótka zapadka spiekanej ceramiki 96 Hz — idealna do gęstych nawigacji, zakładek i przełączników.',
    fundamentalHz: 96,
    pitchDropHz: 52,
    durationMs: 5,
    waveform: 'triangle',
    microTransientLevel: 0.22,
    vibratePulseMs: 4,
    recommendedMaterial: 'frosted-glass',
    accentHex: '#A78BFA',
    codeSnippet: 'hapticAudio.triggerMinimalistLowClick("ceramic-pip-5ms") // 96→52 Hz · 5 ms',
  },
  {
    id: 'satin-tick-4ms',
    namePl: '05. Satynowy Suchy Mikro-Tik',
    shortLabelPl: 'Satyna 112 Hz · 4 ms',
    categoryPl: 'Najszybszy impuls 4 ms',
    descriptionPl:
      'Ultrakrótki, niemal podprogowy tik 112 Hz (4 ms) do szybkich serii kliknięć, list wyboru i kafelków narzędziowych.',
    fundamentalHz: 112,
    pitchDropHz: 64,
    durationMs: 4,
    waveform: 'triangle',
    microTransientLevel: 0.24,
    vibratePulseMs: 3,
    recommendedMaterial: 'abs-plastic',
    accentHex: '#F59E0B',
    codeSnippet: 'hapticAudio.triggerMinimalistLowClick("satin-tick-4ms") // 112→64 Hz · 4 ms',
  },
  {
    id: 'anodized-relay-9ms',
    namePl: '06. Anodowany Mikro-Przekaźnik',
    shortLabelPl: 'Przekaźnik 68 Hz · 9 ms',
    categoryPl: 'Mechanika studyjna CNC',
    descriptionPl:
      'Zwarty klik miniaturowego przekaźnika w obudowie z anodowanego aluminium (68 Hz, 9 ms) o aksamitnym wygaszeniu.',
    fundamentalHz: 68,
    pitchDropHz: 38,
    durationMs: 9,
    waveform: 'triangle',
    microTransientLevel: 0.19,
    vibratePulseMs: 6,
    recommendedMaterial: 'matte-metal',
    accentHex: '#2DD4BF',
    codeSnippet: 'hapticAudio.triggerMinimalistLowClick("anodized-relay-9ms") // 68→38 Hz · 9 ms',
  },
  {
    id: 'vacuum-seal-14ms',
    namePl: '07. Próżniowe Domknięcie Tafli',
    shortLabelPl: 'Próżnia 42 Hz · 14 ms',
    categoryPl: 'Miękka kompresja sub-basu',
    descriptionPl:
      'Najniższy w kolekcji, ciepły impuls podciśnieniowy 42 Hz (14 ms) przypominający magnetyczne domknięcie etui.',
    fundamentalHz: 42,
    pitchDropHz: 26,
    durationMs: 14,
    waveform: 'sine',
    microTransientLevel: 0.05,
    vibratePulseMs: 9,
    recommendedMaterial: 'frosted-glass',
    accentHex: '#60A5FA',
    codeSnippet: 'hapticAudio.triggerMinimalistLowClick("vacuum-seal-14ms") // 42→26 Hz · 14 ms',
  },
  {
    id: 'titanium-whisper-7ms',
    namePl: '08. Tytanowy Cichy Klik Nocny',
    shortLabelPl: 'Tytan 74 Hz · 7 ms',
    categoryPl: 'Tryb skupienia / Low-SPL',
    descriptionPl:
      'Dyskretny, wyważony akustycznie impuls 74 Hz (7 ms) zaprojektowany do wielogodzinnej pracy bez zmęczenia słuchu.',
    fundamentalHz: 74,
    pitchDropHz: 41,
    durationMs: 7,
    waveform: 'sine',
    microTransientLevel: 0.11,
    vibratePulseMs: 5,
    recommendedMaterial: 'matte-metal',
    accentHex: '#F472B6',
    codeSnippet: 'hapticAudio.triggerMinimalistLowClick("titanium-whisper-7ms") // 74→41 Hz · 7 ms',
  },
  {
    id: 'crystal-glass-tap-9ms',
    namePl: '09. Kryształowy Impuls Szkła (BM Clinic)',
    shortLabelPl: 'Kryształ 108 Hz · 9 ms',
    categoryPl: 'Luksusowe szkło / CTA',
    descriptionPl:
      'Krystalicznie czysty, precyzyjny impuls 108→64 Hz z jasnym mikro-transjentem szkła — idealny do głównych przycisków rezerwacji i kart specjalizacji.',
    fundamentalHz: 108,
    pitchDropHz: 64,
    durationMs: 9,
    waveform: 'sine',
    microTransientLevel: 0.28,
    vibratePulseMs: 6,
    recommendedMaterial: 'shiny-glass',
    accentHex: '#38BDF8',
    codeSnippet: 'hapticAudio.triggerMinimalistLowClick("crystal-glass-tap-9ms") // 108→64 Hz · 9 ms',
  },
  {
    id: 'leica-shutter-snap-6ms',
    namePl: '10. Migawka Mechaniczna Leica (Precision Snap)',
    shortLabelPl: 'Leica 94 Hz · 6 ms',
    categoryPl: 'Precyzja mechaniczna',
    descriptionPl:
      'Zwarty, niezwykle satysfakcjonujący klik mechaniczny 94→42 Hz (6 ms, fala trójkątna) wzorowany na precyzyjnej zapadce aparatu fotograficznego.',
    fundamentalHz: 94,
    pitchDropHz: 42,
    durationMs: 6,
    waveform: 'triangle',
    microTransientLevel: 0.34,
    vibratePulseMs: 7,
    recommendedMaterial: 'matte-metal',
    accentHex: '#F59E0B',
    codeSnippet: 'hapticAudio.triggerMinimalistLowClick("leica-shutter-snap-6ms") // 94→42 Hz · 6 ms',
  },
  {
    id: 'velvet-clinic-chime-15ms',
    namePl: '11. Aksamitny Rezonans Kliniczny (Spokój)',
    shortLabelPl: 'Aksamit 64 Hz · 15 ms',
    categoryPl: 'Komfort pacjenta',
    descriptionPl:
      'Ciepły, kojący impuls 64→46 Hz (15 ms) bez ostrych krawędzi — zaprojektowany specjalnie dla interfejsu pacjenta BM Clinic.',
    fundamentalHz: 64,
    pitchDropHz: 46,
    durationMs: 15,
    waveform: 'sine',
    microTransientLevel: 0.08,
    vibratePulseMs: 8,
    recommendedMaterial: 'suede',
    accentHex: '#A78BFA',
    codeSnippet: 'hapticAudio.triggerMinimalistLowClick("velvet-clinic-chime-15ms") // 64→46 Hz · 15 ms',
  },
  {
    id: 'calacatta-marble-tap-8ms',
    namePl: '12. Marmur Calacatta — Stuknięcie Kamienia',
    shortLabelPl: 'Marmur 82 Hz · 8 ms',
    categoryPl: 'Architektura / Premium',
    descriptionPl:
      'Szlachetny, gęsty dźwięk dotknięcia polerowanego marmuru 82→38 Hz (8 ms) — świetnie współgra z ciemno-złotą stylistyką Sky Lobby.',
    fundamentalHz: 82,
    pitchDropHz: 38,
    durationMs: 8,
    waveform: 'triangle',
    microTransientLevel: 0.22,
    vibratePulseMs: 6,
    recommendedMaterial: 'frosted-glass',
    accentHex: '#D4AF37',
    codeSnippet: 'hapticAudio.triggerMinimalistLowClick("calacatta-marble-tap-8ms") // 82→38 Hz · 8 ms',
  },
  {
    id: 'liquid-gold-drop-11ms',
    namePl: '13. Złota Kropla Rezonansowa (Liquid Gold)',
    shortLabelPl: 'Złoto 96 Hz · 11 ms',
    categoryPl: 'Interakcja premium',
    descriptionPl:
      'Płynny, harmoniczny opad 96→54 Hz (11 ms) dający wrażenie dotknięcia płynnego złota lub kropli wody na tafli szkła.',
    fundamentalHz: 96,
    pitchDropHz: 54,
    durationMs: 11,
    waveform: 'sine',
    microTransientLevel: 0.19,
    vibratePulseMs: 7,
    recommendedMaterial: 'shiny-glass',
    accentHex: '#FBBF24',
    codeSnippet: 'hapticAudio.triggerMinimalistLowClick("liquid-gold-drop-11ms") // 96→54 Hz · 11 ms',
  },
  {
    id: 'deep-sub-pulse-16ms',
    namePl: '14. Głęboki Impuls Sub-Bass 52 Hz (Haptic Thump)',
    shortLabelPl: 'Sub-Bass 52 Hz · 16 ms',
    categoryPl: 'Wrażenie fizyczne / Haptic',
    descriptionPl:
      'Głęboki, wyczuwalny fizycznie impuls niskotonowy 52→28 Hz (16 ms) do potwierdzania ważnych akcji (np. rezerwacja wizyty, zapis).',
    fundamentalHz: 52,
    pitchDropHz: 28,
    durationMs: 16,
    waveform: 'sine',
    microTransientLevel: 0.06,
    vibratePulseMs: 12,
    recommendedMaterial: 'suede',
    accentHex: '#10B981',
    codeSnippet: 'hapticAudio.triggerMinimalistLowClick("deep-sub-pulse-16ms") // 52→28 Hz · 16 ms',
  },
  {
    id: 'hi-fi-steel-detent-5ms',
    namePl: '15. Stalowy Przycisk Hi-Fi Audio (Heavy Click)',
    shortLabelPl: 'Stal Hi-Fi 86 Hz · 5 ms',
    categoryPl: 'High-End Audio / Duży opór',
    descriptionPl:
      'Płaski przycisk ze szczotkowanej stali o krótkim skoku i dużym progu siły nacisku — wyraźny, zwarty klik korpusu 86→36 Hz (5 ms) jak w sprzęcie audio klasy Hi-End.',
    fundamentalHz: 86,
    pitchDropHz: 36,
    durationMs: 5,
    waveform: 'triangle',
    microTransientLevel: 0.38,
    vibratePulseMs: 11,
    recommendedMaterial: 'matte-metal',
    accentHex: '#CBD5E1',
    codeSnippet: 'hapticAudio.triggerMinimalistLowClick("hi-fi-steel-detent-5ms") // 86→36 Hz · 5 ms',
  },
];

export const TOP_5_RENDER_PRESETS: RenderPresetItem[] = [
  {
    id: 'preset-dalej-macro',
    title: '01. Makro Kryształowy Przycisk „Dalej”',
    category: 'Tactile Glass UI',
    palette: 'pearl-flebologia',
    material: 'frosted-glass',
    depth: {
      elevation: 22,
      blur: 48,
      glassBlur: 24,
      glassOpacity: 0.66,
      borderRadius: 32,
      specularRim: 88,
    },
    prompt:
      'Macro close-up UI product render of a translucent frosted crystal pill button engraved with serif typography "Dalej", iridescent cyan-violet-magenta subsurface touch ripple under fingertip, micro-beveled glass recess, studio softbox rim lighting, 8k editorial tactile interface.',
    sourceJson: {
      renderEngine: 'AetherPBR-Glass',
      ior: 1.54,
      subsurfaceDispersion: 0.82,
      shadowElevationPx: 22,
      backdropBlurPx: 24,
      material: 'frosted-glass',
    },
  },
  {
    id: 'preset-flebologia-pearl',
    title: '02. Flebologia Perłowe Szkło & Ryciny',
    category: 'Medical Luxury UI',
    palette: 'pearl-flebologia',
    material: 'frosted-glass',
    depth: {
      elevation: 18,
      blur: 38,
      glassBlur: 20,
      glassOpacity: 0.72,
      borderRadius: 28,
      specularRim: 72,
    },
    prompt:
      'Minimalist medical mobile dashboard in soft periwinkle-pearl palette, translucent frosted white glass cards with delicate etched vascular line-art icons, generous border-radius, subtle lavender ambient shadow, Cormorant Garamond display headline paired with crisp geometric sans.',
    sourceJson: {
      renderEngine: 'AetherPBR-Pearl',
      palette: ['#EEF1FA', '#DCE2F7', '#2D264B'],
      engravingEtch: 0.78,
      backdropBlurPx: 20,
      material: 'frosted-glass',
    },
  },
  {
    id: 'preset-finance-ribbed',
    title: '03. FinanceAI Żłobiona Sfera 3D',
    category: 'Fintech Spatial',
    palette: 'finance-ice',
    material: 'shiny-glass',
    depth: {
      elevation: 26,
      blur: 54,
      glassBlur: 22,
      glassOpacity: 0.76,
      borderRadius: 30,
      specularRim: 94,
    },
    prompt:
      'Clean ice-blue fintech mobile interface featuring a central 3D fluted iridescent glass sphere with floating frosted glass metric badge "$12,752 +7.5%", soft neumorphic white containers, crisp tabular numerals, studio global illumination.',
    sourceJson: {
      renderEngine: 'AetherPBR-Specular',
      palette: ['#F2F6FF', '#DCE8FF', '#4F46E5'],
      flutedRibCount: 24,
      material: 'shiny-glass',
    },
  },
  {
    id: 'preset-emerald-clinic',
    title: '04. Klinika Szmaragdowy Obsydian',
    category: 'Dark Botanical Glass',
    palette: 'emerald-clinic',
    material: 'matte-metal',
    depth: {
      elevation: 28,
      blur: 52,
      glassBlur: 18,
      glassOpacity: 0.62,
      borderRadius: 24,
      specularRim: 64,
    },
    prompt:
      'Deep emerald-obsidian dark mode clinical interface (#071613), frosted botanical glass symptom grid with luminous sage line icons, tactile brushed sage-emerald primary action button, refined high-contrast serif headline.',
    sourceJson: {
      renderEngine: 'AetherPBR-Obsidian',
      palette: ['#071613', '#0F2924', '#74BFA1'],
      anisotropy: 0.8,
      material: 'matte-metal',
    },
  },
  {
    id: 'preset-suede-synth',
    title: '05. Aether Zamsz & Anodowane Pokrętło',
    category: 'Audio Hardware UI',
    palette: 'pearl-flebologia',
    material: 'suede',
    depth: {
      elevation: 14,
      blur: 30,
      glassBlur: 16,
      glassOpacity: 0.82,
      borderRadius: 26,
      specularRim: 42,
    },
    prompt:
      'Tactile modular synthesizer deck combining soft micro-suede acoustic pads with a recessed CNC-machined rotary encoder knob, neumorphic playback transport buttons, subtle warm rim glow, ergonomic studio instrument aesthetic.',
    sourceJson: {
      renderEngine: 'AetherPBR-Acoustic',
      hardnessShore: 28,
      reverseClutch: 0.26,
      material: 'suede',
    },
  },
];

export const INITIAL_MEDIA_LIBRARY: StudioMediaItem[] = [
  {
    id: 'ref-dalej-button',
    title: 'Makro Przycisk „Dalej” — Iryzacja Dotyku',
    subtitle: 'Referencja haptyczna · Rozproszenie podpowierzchniowe',
    category: 'Tactile Glass',
    mediaType: 'image',
    aspectRatio: '16:9',
    resolution: '2K',
    prompt: TOP_5_RENDER_PRESETS[0].prompt,
    src: '/assets/aistudio/utwo_rz_obraz_po_nacis_nie_ciu_przycisku_e69c4394_75a907d5.jpg',
    audioFreq: 528,
  },
  {
    id: 'ref-flebologia',
    title: 'BM Clinic — Flebologia Perłowa Tonacja',
    subtitle: 'Karty matowego szkła · Ryciny naczyniowe',
    category: 'Medical UI',
    mediaType: 'image',
    aspectRatio: '16:9',
    resolution: '2K',
    prompt: TOP_5_RENDER_PRESETS[1].prompt,
    src: '/assets/aistudio/stwo_rz_front_aplikacji_w_tonacji_e7b9c384_2a0b46d0.jpg',
    audioFreq: 440,
  },
  {
    id: 'ref-finance-ai',
    title: 'FinanceAI — Sfera 3D & Kafelki Celów',
    subtitle: 'Neumorfizm perłowy · Widżet metryki $12,752',
    category: 'Spatial Fintech',
    mediaType: 'image',
    aspectRatio: '4:3',
    resolution: '2K',
    prompt: TOP_5_RENDER_PRESETS[2].prompt,
    src: '/assets/aistudio/obraz_41b4bdd8_cde3673e.jpg',
    audioFreq: 587.33,
  },
  {
    id: 'ref-proktologia-dark',
    title: 'BM Clinic — Szmaragdowy Obsydian',
    subtitle: 'Ciemne szkło matowe · Siatka 6 symptomów',
    category: 'Dark Glass UI',
    mediaType: 'image',
    aspectRatio: '9:16',
    resolution: '1K',
    prompt: TOP_5_RENDER_PRESETS[3].prompt,
    src: '/assets/aistudio/1_5aae773b.png',
    audioFreq: 392,
  },
  {
    id: 'ref-metal-rotary-knob',
    title: 'Sterownik Obrotowy CNC — Szczotkowany Metal 270°',
    subtitle: 'Referencja kalibracji zapadek · Skala 120 podziałek',
    category: 'Hardware Driver',
    mediaType: 'image',
    aspectRatio: '1:1',
    resolution: '2K',
    prompt:
      'Macro studio top-down view of a radial brushed stainless steel rotary volume controller knob with chrome bevel ring, dark engraved index mark, and precision 270-degree 120-tick graduation scale on brushed silver surface.',
    src: '/assets/aistudio/real-metal-volume-button-free-vector_f64353d6.jpg',
    audioFreq: 74,
  },
];

export const DEFAULT_ROTARY_DRIVER_CALIBRATION: RotaryDriverCalibrationConfig = {
  detentCount: 120,
  majorTickEvery: 10,
  sweepAngleDeg: 270,
  lowBodyFreqHz: 74,
  mouseSnapBlend: 82,
  majorTickAccent: 1.65,
  rotaryHapticStrength: 84,
  tickPulseMs: 9,
  endStopResistance: 90,
  axialPushForce: 88,
  backlashClutch: 76,
};

export const ROTARY_DRIVER_FACTORY_PROFILES: SavedDriverCalibrationProfile[] = [
  {
    id: 'cal-reference-cnc-120',
    name: '01. Stal Szczotkowana 120-Krokowa (Wzorzec z Obrazu)',
    controllerModel: 'CNC Radial Spun-Metal 270°',
    createdAt: 'Profil fabryczny',
    config: DEFAULT_ROTARY_DRIVER_CALIBRATION,
  },
  {
    id: 'cal-studio-attenuator-60',
    name: '02. Attenuator Masteringowy 60-Zapadkowy',
    controllerModel: 'Stepped Relay Encoder 60T',
    createdAt: 'Profil fabryczny',
    config: {
      detentCount: 60,
      majorTickEvery: 10,
      sweepAngleDeg: 270,
      lowBodyFreqHz: 86,
      mouseSnapBlend: 92,
      majorTickAccent: 1.85,
      rotaryHapticStrength: 88,
      tickPulseMs: 11,
      endStopResistance: 95,
      axialPushForce: 92,
      backlashClutch: 84,
    },
  },
  {
    id: 'cal-heavy-flywheel-24',
    name: '03. Ciężkie Koło Zamachowe Hi-Fi (24 Kulkowe)',
    controllerModel: 'Weighted Ball-Detent 24T',
    createdAt: 'Profil fabryczny',
    config: {
      detentCount: 24,
      majorTickEvery: 6,
      sweepAngleDeg: 270,
      lowBodyFreqHz: 56,
      mouseSnapBlend: 74,
      majorTickAccent: 2.05,
      rotaryHapticStrength: 94,
      tickPulseMs: 18,
      endStopResistance: 100,
      axialPushForce: 95,
      backlashClutch: 90,
    },
  },
  {
    id: 'cal-fluid-damped-96',
    name: '04. Tłumik Olejowy Cichy (96 Mikro-Kroków)',
    controllerModel: 'Fluid-Damped Micro-Encoder 96T',
    createdAt: 'Profil fabryczny',
    config: {
      detentCount: 96,
      majorTickEvery: 12,
      sweepAngleDeg: 270,
      lowBodyFreqHz: 48,
      mouseSnapBlend: 44,
      majorTickAccent: 1.35,
      rotaryHapticStrength: 54,
      tickPulseMs: 6,
      endStopResistance: 68,
      axialPushForce: 70,
      backlashClutch: 52,
    },
  },
];

export const BUTTON_MOTION_PRESETS: ButtonMotionPresetSpec[] = [
  {
    id: 'magnetic-levitation',
    name: 'Lewitacja Magnetyczna 3D',
    category: 'Śledzenie wektora kursora',
    description:
      'Subtelne przyciąganie płaszczyzny przycisku w osiach X/Y za wskaźnikiem z natychmiastowym osiowym dociśnięciem pod palcem.',
    stiffness: 440,
    damping: 26,
    mass: 0.82,
    pressScale: 0.964,
    hoverLiftPx: 2.5,
    latencyLabel: '110 ms',
    codeSnippet:
      'transition={{ type: "spring", stiffness: 440, damping: 26, mass: 0.82 }} // translate3d(magX, magY, 0) + scale(0.964)',
  },
  {
    id: 'liquid-glass-spring',
    name: 'Płynna Sprężyna Szkła Optycznego',
    category: 'Elastyczna kompresja',
    description:
      'Organiczne, jedwabiste ugięcie tafli szkła z płynnym wygaszeniem pędu bez przeregulowania i drgań wtórnych.',
    stiffness: 390,
    damping: 23,
    mass: 0.88,
    pressScale: 0.954,
    hoverLiftPx: 2,
    latencyLabel: '145 ms',
    codeSnippet:
      'transition={{ type: "spring", stiffness: 390, damping: 23, mass: 0.88 }} // whileTap={{ scale: 0.954 }}',
  },
  {
    id: 'cnc-micro-detent',
    name: 'Mikro-Zapadka CNC Studio',
    category: 'Skok mechaniczny',
    description:
      'Krótki, chirurgicznie precyzyjny skok przełącznika aparatury pomiarowej z twardym progiem przełamania oporu.',
    stiffness: 680,
    damping: 38,
    mass: 0.65,
    pressScale: 0.978,
    hoverLiftPx: 1,
    latencyLabel: '75 ms',
    codeSnippet:
      'transition={{ type: "spring", stiffness: 680, damping: 38, mass: 0.65 }} // whileTap={{ scale: 0.978, y: 1.5 }}',
  },
  {
    id: 'velvet-cushion',
    name: 'Poduszka Zamszowa Soft-Damp',
    category: 'Tłumienie akustyczne',
    description:
      'Głębsze, aksamitnie wytłumione zagłębienie powierzchni z miękkim powrotem o podwyższonej bezwładności.',
    stiffness: 265,
    damping: 28,
    mass: 1.08,
    pressScale: 0.942,
    hoverLiftPx: 1.5,
    latencyLabel: '180 ms',
    codeSnippet:
      'transition={{ type: "spring", stiffness: 265, damping: 28, mass: 1.08 }} // whileTap={{ scale: 0.942 }}',
  },
  {
    id: 'rocker-tilt',
    name: 'Kołyskowy Przechył Krawędziowy',
    category: 'Oś perspektywiczna 3D',
    description:
      'Nachyla płaszczyznę klawisza zgodnie z punktem nacisku lewo/prawo i góra/dół, odwzorowując zawieszenie przegubowe.',
    stiffness: 510,
    damping: 30,
    mass: 0.78,
    pressScale: 0.968,
    hoverLiftPx: 2,
    latencyLabel: '95 ms',
    codeSnippet:
      'style={{ transformPerspective: 640 }} animate={{ rotateX: tiltX, rotateY: tiltY, scale: 0.968 }}',
  },
  {
    id: 'harmonic-hover-lift',
    name: 'Kaskada Fazowa Aether',
    category: 'Dwustopniowe uniesienie',
    description:
      'Wyraźna lewitacja spoczynkowa przy najechaniu skontrastowana ze sprężystym zakotwiczeniem podczas kliknięcia.',
    stiffness: 475,
    damping: 25,
    mass: 0.8,
    pressScale: 0.958,
    hoverLiftPx: 3.5,
    latencyLabel: '125 ms',
    codeSnippet:
      'whileHover={{ y: -3.5, scale: 1.016 }} animate={{ scale: isPressed ? 0.958 : 1 }}',
  },
];

export const BUTTON_ILLUMINATION_PRESETS: ButtonIlluminationPresetSpec[] = [
  {
    id: 'cursor-spotlight',
    name: 'Reflektor Kursorowy (Radial Spotlight)',
    category: 'Światło śledzące wskaźnik',
    description:
      'Skupiona podpowierzchniowa wiązka fotonów podążająca płynnie za pozycją kursora na matowym szkle lub metalu.',
    glowSpread: 36,
    defaultColor: '#8B7CFF',
    opticalTrait: 'Gradient radialny 180 px',
    codeSnippet:
      'background: radial-gradient(180px circle at var(--spot-x) var(--spot-y), rgba(139,124,255,0.34), transparent 72%)',
  },
  {
    id: 'conic-border-beam',
    name: 'Wiązka Obwodowa (Conic Border Beam)',
    category: 'Światłowód krawędziowy',
    description:
      'Cienka smuga światła obiegająca 1.5-pikselowy obrys krawędzi przycisku w ciągłym ruchu obrotowym GPU.',
    glowSpread: 28,
    defaultColor: '#38BDF8',
    opticalTrait: 'Maskowany stożek 360°',
    codeSnippet:
      'background: conic-gradient(from 0deg, transparent 72%, var(--glow-color) 94%, #ffffff 100%)',
  },
  {
    id: 'prism-refraction-sweep',
    name: 'Przejście Pryzmatyczne (Specular Sweep)',
    category: 'Refrakcja kierunkowa',
    description:
      'Ukośna tafla odbicia lustrzanego prześlizgująca się po fasetowanej powierzchni przy najechaniu i aktywacji.',
    glowSpread: 30,
    defaultColor: '#C084FC',
    opticalTrait: 'Refleks ukośny -22°',
    codeSnippet:
      'background: linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.55) 50%, transparent 75%)',
  },
  {
    id: 'subsurface-caustic',
    name: 'Poświata Podpowierzchniowa (Subsurface)',
    category: 'Rozproszenie objętościowe',
    description:
      'Głęboka chmura świetlna pod warstwą mrożonego kryształu, której intensywność rośnie wraz z siłą nacisku.',
    glowSpread: 46,
    defaultColor: '#34D399',
    opticalTrait: 'Rozproszenie 46 px',
    codeSnippet:
      'box-shadow: inset 0 -10px 28px rgba(52,211,153,0.28), 0 8px 32px rgba(52,211,153,0.22)',
  },
  {
    id: 'horizon-dual-rim',
    name: 'Podwójna Krawędź Horyzontalna',
    category: 'Odbicie Fresnela góra/dół',
    description:
      'Ostra górna linia połysku zwierciadlanego skontrastowana z ciepłą dolną łuną podświetlającą grawer.',
    glowSpread: 32,
    defaultColor: '#60A5FA',
    opticalTrait: 'Górny Fresnel + dolna łuna',
    codeSnippet:
      'border-top: 1.5px solid rgba(255,255,255,0.85); box-shadow: inset 0 -2px 12px var(--glow-color)',
  },
  {
    id: 'breathing-etched-halo',
    name: 'Oddech Ryciny Laserowej',
    category: 'Modulacja spoczynkowa',
    description:
      'Spokojna, sinusoidalna pulsacja jasności wewnętrznego żłobienia i otoczki bez rozpraszających rozbłysków.',
    glowSpread: 40,
    defaultColor: '#F472B6',
    opticalTrait: 'Cykl sinusoidalny 3.2 s',
    codeSnippet:
      'animation: aetherEtchBreathe 3.2s ease-in-out infinite; /* compositor opacity + scale */',
  },
];

// ============================================================================
// Screen-to-Screen Transition Animations Library & App Screen Map Architecture
// ============================================================================

export type ScreenTransitionPresetId =
  | 'spatial-glass-push'
  | 'shared-axis-z-portal'
  | 'frosted-sheet-detent'
  | 'prism-3d-hinge'
  | 'velvet-dissolve'
  | 'cnc-shutter-snap'
  | 'cascade-split-deck'
  | 'iris-aperture-reveal';

export type ScreenTransitionMotionFrame = {
  opacity: number;
  x?: number;
  y?: number;
  scale?: number;
  rotateX?: number;
  rotateY?: number;
};

export interface ScreenTransitionSpec {
  id: ScreenTransitionPresetId;
  name: string;
  category: string;
  description: string;
  durationMs: number;
  physicsSummary: string;
  enterInitial: ScreenTransitionMotionFrame;
  enterAnimate: ScreenTransitionMotionFrame;
  exitTarget: ScreenTransitionMotionFrame;
  spring: {
    stiffness: number;
    damping: number;
    mass: number;
  };
  codeSnippet: string;
}

export type ScreenRoleType = 'entry' | 'core' | 'detail' | 'settings' | 'modal';
export type ScreenDesignStatus = 'ready' | 'designing' | 'review';

export type StudioLiveTabId =
  | 'start'
  | 'dashboard'
  | 'screens'
  | 'ui-library'
  | 'synth'
  | 'haptics'
  | 'prompts'
  | 'gemini';

export type PrototypeDropZone = 'header' | 'main' | 'footer';

export type TactileWidgetCategory =
  | 'buttons'
  | 'minimal-clicks'
  | 'sliders'
  | 'levers'
  | 'touch-rotary';

export interface PrototypeScreenWidget {
  instanceId: string;
  catalogId: string;
  componentName: string;
  label: string;
  category: TactileWidgetCategory;
  zone: PrototypeDropZone;
  spanCols: 1 | 2;
  isButtonLike: boolean;
}

export interface DesignedScreenNode {
  id: string;
  title: string;
  route: string;
  role: ScreenRoleType;
  status: ScreenDesignStatus;
  summary: string;
  components: string[];
  prototypeWidgets?: PrototypeScreenWidget[];
  hapticMaterial: HapticMaterialType;
  preferredTransition: ScreenTransitionPresetId;
  studioTabLink?: StudioLiveTabId;
  githubSourcePath?: string;
  x: number;
  y: number;
}

export interface ScreenMapEdge {
  id: string;
  fromScreenId: string;
  toScreenId: string;
  triggerLabel: string;
  transitionId: ScreenTransitionPresetId;
}

export interface GitHubRepoAnalysisMeta {
  repoFullName: string;
  repoUrl: string;
  description: string;
  language: string;
  stars: number;
  defaultBranch: string;
  detectedPackages: string[];
  detectedModules: string[];
  architectureSummary: string;
  generatedByModel: string;
}

export interface AppScreenMapProject {
  id: string;
  dbId?: number;
  name: string;
  description: string;
  sourceRepo: string;
  defaultTransition: ScreenTransitionPresetId;
  nodes: DesignedScreenNode[];
  edges: ScreenMapEdge[];
  githubMeta?: GitHubRepoAnalysisMeta;
  createdAt: string;
}

export const SCREEN_TRANSITION_PRESETS: ScreenTransitionSpec[] = [
  {
    id: 'spatial-glass-push',
    name: '01. Przesunięcie Przestrzenne Szkła',
    category: 'Oś pozioma X + paralaksa',
    description:
      'Płynny wjazd nowej tafli szkła z prawej krawędzi z delikatnym osadzeniem skali i cofnięciem ekranu poprzedniego w głąb.',
    durationMs: 220,
    physicsSummary: 'Spring 390 / 31 · ΔX 44 px',
    enterInitial: { opacity: 0, x: 44, scale: 0.985 },
    enterAnimate: { opacity: 1, x: 0, scale: 1 },
    exitTarget: { opacity: 0, x: -28, scale: 0.972 },
    spring: { stiffness: 390, damping: 31, mass: 0.84 },
    codeSnippet:
      'initial={{ opacity: 0, x: 44, scale: 0.985 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -28, scale: 0.972 }}',
  },
  {
    id: 'shared-axis-z-portal',
    name: '02. Portal Głębi Osi Z',
    category: 'Zoom optyczny Z-space',
    description:
      'Przejście współosiowe w głąb soczewki: ekran docelowy wyłania się ze skali 0.92 do pełnej ostrości 1.0 bez bocznego dryfu.',
    durationMs: 210,
    physicsSummary: 'Spring 420 / 32 · Scale 0.92 → 1.00',
    enterInitial: { opacity: 0, scale: 0.92, y: 8 },
    enterAnimate: { opacity: 1, scale: 1, y: 0 },
    exitTarget: { opacity: 0, scale: 1.045, y: -6 },
    spring: { stiffness: 420, damping: 32, mass: 0.8 },
    codeSnippet:
      'initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.045 }}',
  },
  {
    id: 'frosted-sheet-detent',
    name: '03. Arkusz Matowego Szkła z Zapadką',
    category: 'Oś pionowa Y (Bottom Detent)',
    description:
      'Wysunięcie karty szczegółów lub modalu od dołu z wyczuwalnym progiem wyhamowania sprzęgła bez odbicia wtórnego.',
    durationMs: 240,
    physicsSummary: 'Spring 450 / 35 · ΔY 52 px',
    enterInitial: { opacity: 0, y: 52, scale: 0.982 },
    enterAnimate: { opacity: 1, y: 0, scale: 1 },
    exitTarget: { opacity: 0, y: 34, scale: 0.985 },
    spring: { stiffness: 450, damping: 35, mass: 0.86 },
    codeSnippet:
      'initial={{ opacity: 0, y: 52, scale: 0.982 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 34 }}',
  },
  {
    id: 'prism-3d-hinge',
    name: '04. Zawias Pryzmatyczny 3D',
    category: 'Perspektywa obrotowa Y',
    description:
      'Subtelny obrót płaszczyzny ekranu o 14° w przestrzeni 3D jak fasetowanej płytki optycznej na zawiasie magnetycznym.',
    durationMs: 260,
    physicsSummary: 'Spring 360 / 29 · RotateY -14° → 0°',
    enterInitial: { opacity: 0, rotateY: -14, x: 26, scale: 0.975 },
    enterAnimate: { opacity: 1, rotateY: 0, x: 0, scale: 1 },
    exitTarget: { opacity: 0, rotateY: 11, x: -22, scale: 0.975 },
    spring: { stiffness: 360, damping: 29, mass: 0.9 },
    codeSnippet:
      'style={{ transformPerspective: 1200 }} initial={{ opacity: 0, rotateY: -14, x: 26 }} animate={{ opacity: 1, rotateY: 0, x: 0 }}',
  },
  {
    id: 'velvet-dissolve',
    name: '05. Aksamitne Przenikanie Redakcyjne',
    category: 'Crossfade nisko-opóźnieniowy',
    description:
      'Spokojne, bezszwowe przenikanie przezroczystości z mikro-uniesieniem 10 px, idealne dla częstego przełączania zakładek.',
    durationMs: 175,
    physicsSummary: 'Spring 480 / 38 · ΔY 10 px',
    enterInitial: { opacity: 0, y: 10 },
    enterAnimate: { opacity: 1, y: 0 },
    exitTarget: { opacity: 0, y: -8 },
    spring: { stiffness: 480, damping: 38, mass: 0.72 },
    codeSnippet:
      'initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}',
  },
  {
    id: 'cnc-shutter-snap',
    name: '06. Migawka Mechaniczna CNC',
    category: 'Skok aparatury pomiarowej',
    description:
      'Ultraszybka, chirurgiczna podmiana ekranu o wysokiej sztywności bez jakiegokolwiek przeregulowania (140 ms).',
    durationMs: 140,
    physicsSummary: 'Spring 680 / 44 · Zero overshoot',
    enterInitial: { opacity: 0, x: 20, scale: 0.992 },
    enterAnimate: { opacity: 1, x: 0, scale: 1 },
    exitTarget: { opacity: 0, x: -16, scale: 0.992 },
    spring: { stiffness: 680, damping: 44, mass: 0.62 },
    codeSnippet:
      'transition={{ type: "spring", stiffness: 680, damping: 44, mass: 0.62 }} initial={{ opacity: 0, x: 20 }}',
  },
  {
    id: 'cascade-split-deck',
    name: '07. Kaskada Kart Warstwowych',
    category: 'Talia przestrzenna',
    description:
      'Ekran nadrzędny unosi się lekko ku górze, a nowy ekran wysuwa się z talii warstwowej z wyczuwalną bezwładnością.',
    durationMs: 230,
    physicsSummary: 'Spring 395 / 30 · Deck stack',
    enterInitial: { opacity: 0, y: -28, scale: 0.96 },
    enterAnimate: { opacity: 1, y: 0, scale: 1 },
    exitTarget: { opacity: 0, y: 24, scale: 0.955 },
    spring: { stiffness: 395, damping: 30, mass: 0.84 },
    codeSnippet:
      'initial={{ opacity: 0, y: -28, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.955 }}',
  },
  {
    id: 'iris-aperture-reveal',
    name: '08. Przysłona Soczewkowa',
    category: 'Ekspansja centralna',
    description:
      'Koncentryczne otwarcie widoku ze środka kadru z lekkim nachyleniem osi X, dedykowane widokom 3D i multimediom.',
    durationMs: 215,
    physicsSummary: 'Spring 430 / 31 · Scale 0.88 → 1.00',
    enterInitial: { opacity: 0, scale: 0.88, rotateX: 6 },
    enterAnimate: { opacity: 1, scale: 1, rotateX: 0 },
    exitTarget: { opacity: 0, scale: 0.93, rotateX: -4 },
    spring: { stiffness: 430, damping: 31, mass: 0.78 },
    codeSnippet:
      'style={{ transformPerspective: 1100 }} initial={{ opacity: 0, scale: 0.88, rotateX: 6 }} animate={{ opacity: 1, scale: 1, rotateX: 0 }}',
  },
];

export const DEFAULT_AETHER_SCREEN_MAP: AppScreenMapProject = {
  id: 'aether-studio-master-map',
  name: 'Aether Tactile Studio — Architektura Ekranów',
  description:
    'Kompletna mapa wszystkich projektowanych ekranów studia haptyczno-akustycznego z przypisanymi animacjami przejść i materiałami dotykowymi.',
  sourceRepo: 'studio-default',
  defaultTransition: 'spatial-glass-push',
  createdAt: 'Projekt bazowy',
  nodes: [
    {
      id: 'scr-dashboard',
      title: 'Pulpit Główny & Wizualizacja 3D',
      route: '/pulpit',
      role: 'entry',
      status: 'ready',
      summary:
        'Centralny ekran startowy ze sferą haptyczną Three.js PBR, kafelkami diagnostycznymi, przyciskiem „Dalej” oraz odtwarzaczem ambient.',
      components: [
        'HapticSphereIndicator3D',
        'ThreeMetricScene',
        'RotaryDriverCalibrationService',
        'AudioPlayerCard',
      ],
      hapticMaterial: 'frosted-glass',
      preferredTransition: 'spatial-glass-push',
      studioTabLink: 'dashboard',
      x: 60,
      y: 170,
    },
    {
      id: 'scr-screens-architect',
      title: 'Architekt Ekranów i Animacji Przejść',
      route: '/mapa-ekranow',
      role: 'core',
      status: 'ready',
      summary:
        'Centrum podglądu wszystkich projektowanych ekranów, biblioteki przejść, planera węzłów DAG oraz importu architektury z GitHub.',
      components: [
        'ScreenTransitionsLibrary',
        'AllDesignedScreensGallery',
        'ScreenMapPlanner',
        'GitHubMapDesigner',
      ],
      hapticMaterial: 'shiny-glass',
      preferredTransition: 'shared-axis-z-portal',
      studioTabLink: 'screens',
      x: 410,
      y: 45,
    },
    {
      id: 'scr-ui-library',
      title: 'Biblioteka Komponentów i Przełączników',
      route: '/biblioteka-ui',
      role: 'core',
      status: 'ready',
      summary:
        'Katalog 6 fizyk przycisków, 6 podświetleń optycznych oraz 12 przełączników suwakowych, dźwigniowych i pojemnościowych.',
      components: [
        'ButtonAnimationsLibrary',
        'SwitchVariantsLibrary',
        'TactileButton',
      ],
      hapticMaterial: 'shiny-glass',
      preferredTransition: 'spatial-glass-push',
      studioTabLink: 'ui-library',
      x: 410,
      y: 225,
    },
    {
      id: 'scr-cnc-calibration',
      title: 'Stół Kalibracji Sterownika CNC 270°',
      route: '/kalibracja-sterownika',
      role: 'settings',
      status: 'ready',
      summary:
        'Replikator metalowego pokrętła 120-zapadkowego ze strojeniem tonu <160 Hz, kliku mikroprzełącznika myszy i 3-fazową auto-kalibracją.',
      components: [
        'RotaryDriverCalibrationService',
        'GraduationArc270SVG',
        'CalibrationTelemetry',
      ],
      hapticMaterial: 'matte-metal',
      preferredTransition: 'cnc-shutter-snap',
      studioTabLink: 'haptics',
      x: 410,
      y: 405,
    },
    {
      id: 'scr-haptics-panel',
      title: 'Ustawienia Globalne Haptyki i Rycin',
      route: '/haptyka',
      role: 'settings',
      status: 'ready',
      summary:
        'Zarządzanie profilami materiałowymi (szkło, metal, zamsz), importerem sekwencji JSON oraz podświetleniem grawerunków.',
      components: [
        'HapticSettingsPanel',
        'PatternJsonImporter',
        'EngravingBacklightPicker',
      ],
      hapticMaterial: 'frosted-glass',
      preferredTransition: 'frosted-sheet-detent',
      studioTabLink: 'haptics',
      x: 770,
      y: 315,
    },
    {
      id: 'scr-synth-panel',
      title: 'Syntezator Akustyczny Aether',
      route: '/syntezator',
      role: 'detail',
      status: 'ready',
      summary:
        'Projektowanie obwiedni ADSR, filtra dolnoprzepustowego, sub-basu <160 Hz oraz optymalizacja fizyki sprężyny z udziałem Gemini.',
      components: [
        'AetherSynthPanel',
        'WaveformSelector',
        'PresetCloudVault',
      ],
      hapticMaterial: 'suede',
      preferredTransition: 'velvet-dissolve',
      studioTabLink: 'synth',
      x: 770,
      y: 135,
    },
    {
      id: 'scr-gemini-studio',
      title: 'Kreator Sorsów i Multimediów Gemini',
      route: '/kreator-studio',
      role: 'modal',
      status: 'designing',
      summary:
        'Generowanie rozbudowanych tokenów sorsa JSON, renderów 1K–4K, animacji wideo Omni oraz most głosowy Live Audio.',
      components: [
        'SourcePromptStudio',
        'GeminiMultimediaStudio',
        'LiveVoiceBridge',
      ],
      hapticMaterial: 'shiny-glass',
      preferredTransition: 'iris-aperture-reveal',
      studioTabLink: 'prompts',
      x: 1110,
      y: 225,
    },
  ],
  edges: [
    {
      id: 'edge-1',
      fromScreenId: 'scr-dashboard',
      toScreenId: 'scr-screens-architect',
      triggerLabel: 'Otwórz Mapę Ekranów',
      transitionId: 'shared-axis-z-portal',
    },
    {
      id: 'edge-2',
      fromScreenId: 'scr-dashboard',
      toScreenId: 'scr-ui-library',
      triggerLabel: 'Przeglądaj komponenty',
      transitionId: 'spatial-glass-push',
    },
    {
      id: 'edge-3',
      fromScreenId: 'scr-dashboard',
      toScreenId: 'scr-cnc-calibration',
      triggerLabel: 'Kalibruj pokrętło 270°',
      transitionId: 'cnc-shutter-snap',
    },
    {
      id: 'edge-4',
      fromScreenId: 'scr-ui-library',
      toScreenId: 'scr-synth-panel',
      triggerLabel: 'Dostrój profil dźwięku',
      transitionId: 'velvet-dissolve',
    },
    {
      id: 'edge-5',
      fromScreenId: 'scr-cnc-calibration',
      toScreenId: 'scr-haptics-panel',
      triggerLabel: 'Zapisz wzorzec globalny',
      transitionId: 'frosted-sheet-detent',
    },
    {
      id: 'edge-6',
      fromScreenId: 'scr-screens-architect',
      toScreenId: 'scr-gemini-studio',
      triggerLabel: 'Generuj zasoby ekranu',
      transitionId: 'iris-aperture-reveal',
    },
    {
      id: 'edge-7',
      fromScreenId: 'scr-synth-panel',
      toScreenId: 'scr-gemini-studio',
      triggerLabel: 'Eksportuj sors UI',
      transitionId: 'prism-3d-hinge',
    },
  ],
};

// ============================================================================
// Firestore Studio Version History Snapshots
// ============================================================================

export interface StudioSnapshotSummary {
  palette: PaletteMode;
  material: HapticMaterialType;
  baseFreqHz: number;
  screenCount: number;
  edgeCount: number;
}

export interface StudioSnapshotScreenMapState {
  id: string;
  name: string;
  description: string;
  sourceRepo: string;
  defaultTransition: ScreenTransitionPresetId;
  nodes: DesignedScreenNode[];
  edges: ScreenMapEdge[];
  githubMeta?: GitHubRepoAnalysisMeta;
}

export interface StudioSnapshotState {
  palette: PaletteMode;
  activeScreenTransition: ScreenTransitionPresetId;
  selectedGroups: ButtonGroupId[];
  depth: DepthShadowSettings;
  synth: SynthPatchSettings;
  haptic: HapticSettings;
  engraving: EngravingBacklightSettings;
  animation: OrganicAnimationConfig;
  groupConfigs: Record<ButtonGroupId, GroupOverrideConfig>;
  driverCalibration: RotaryDriverCalibrationConfig;
  screenMap: StudioSnapshotScreenMapState;
}

export interface StudioSnapshotRecord {
  id: string;
  ownerId: string;
  label: string;
  note: string;
  versionTag: string;
  isPinned: boolean;
  summary: StudioSnapshotSummary;
  state: StudioSnapshotState;
  createdAtMs: number;
  updatedAtMs: number;
  createdAtFormatted: string;
}

// ============================================================================
// File Upload -> AI Screen Plan & Website / Web App Build Matrix Service
// ============================================================================

export type FileBuildTargetType =
  | 'website-and-webapp'
  | 'website-only'
  | 'webapp-only';

export interface WebsiteMatrixRow {
  id: string;
  sectionName: string;
  routeOrAnchor: string;
  gridLayout: string;
  keyComponents: string[];
  visualAndTactileSpec: string;
  conversionGoal: string;
  buildPrompt: string;
}

export interface WebAppMatrixRow {
  id: string;
  moduleName: string;
  route: string;
  userRole: string;
  stateAndDataFlow: string;
  uiComponents: string[];
  transitionAndHaptics: string;
  acceptanceCriteria: string;
}

export interface DesignSystemMatrixSummary {
  recommendedPalette: string;
  typographyPairing: string;
  layoutArchitecture: string;
  primaryHapticMaterial: HapticMaterialType;
  stackRecommendation: string;
}

export interface UploadedFileBuildPlan {
  id: string;
  fileName: string;
  fileMimeType: string;
  fileSizeKb: number;
  targetType: FileBuildTargetType;
  projectTitle: string;
  executiveSummary: string;
  generatedByModel: string;
  createdAt: string;
  linkedScreenMapId: string;
  designTokens: DesignSystemMatrixSummary;
  websiteMatrix: WebsiteMatrixRow[];
  webAppMatrix: WebAppMatrixRow[];
  masterBuildPrompt: string;
}

export interface FileUploadPlanRequestPayload {
  fileName: string;
  mimeType: string;
  fileSize: number;
  base64Data?: string;
  textContent?: string;
  projectGoal?: string;
  targetType?: FileBuildTargetType;
}

// ============================================================================
// Creative Workbench: Live Frontend Model Preview, Master Prompt & GitHub Export
// ============================================================================

export type CreativeWorkbenchLayoutMode =
  | 'split-studio'
  | 'preview-only'
  | 'composer-only'
  | 'canvas-full';

export type PromptGraphicRole =
  | 'uklad-ekranu'
  | 'styl-materialu'
  | 'szkic-komponentu'
  | 'zasob-graficzny';

export interface PromptReferenceGraphic {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  role: PromptGraphicRole;
  addedAt: string;
}

export type GeneratedElementControlKind =
  | 'primary-cta'
  | 'secondary-btn'
  | 'slider'
  | 'toggle'
  | 'metric-tile';

export interface GeneratedElementInteractiveControl {
  id: string;
  kind: GeneratedElementControlKind;
  label: string;
  valueText?: string;
}

export interface GeneratedCompleteElement {
  id: string;
  name: string;
  fileName: string;
  targetScreenId: string;
  targetZone: PrototypeDropZone;
  categoryLabel: string;
  summary: string;
  headline: string;
  subheadline: string;
  accentHex: string;
  referenceThumbUrl?: string;
  controls: GeneratedElementInteractiveControl[];
  reactTailwindCode: string;
  compiledPromptUsed: string;
  createdAt: string;
}

export interface GeneratedRepoFileEntry {
  path: string;
  content: string;
  encoding?: 'utf-8' | 'base64';
}

export interface GitHubRepoExportResult {
  repoFullName: string;
  repoHtmlUrl: string;
  branch: string;
  commitSha: string;
  filesCount: number;
  createdNewRepo: boolean;
  appliedTopics?: string[];
}

// ============================================================================
// External Application Plugins & GitHub Repository Description Package
// ============================================================================

export type ExternalPluginIntegrationKind =
  | 'embed-sdk'
  | 'postmessage-bridge'
  | 'webhook-rest'
  | 'design-ide-manifest'
  | 'engine-3d-osc';

export type ExternalPluginDataScope =
  | 'design-tokens'
  | 'haptics-audio'
  | 'screen-map'
  | 'generated-tsx';

export interface ExternalAppPlugin {
  id: string;
  slug: string;
  targetAppName: string;
  pluginTitle: string;
  description: string;
  integrationKind: ExternalPluginIntegrationKind;
  enabled: boolean;
  isCustom: boolean;
  endpointOrUri: string;
  scopes: ExternalPluginDataScope[];
  customHeadersJson?: string;
  version: string;
  createdAt: string;
}

export interface GitHubRepoProfileMetadata {
  shortAboutDescription: string;
  topics: string[];
  homepageUrl: string;
  licenseId: 'Apache-2.0' | 'MIT';
  releaseTag: string;
  readmeSubtitle: string;
}

// ============================================================================
// Start Page: Local Disk Storage, Working Frontend Image & Synchronized Shades
// ============================================================================

export type ElementShadeId =
  | 'cobalt'
  | 'emerald'
  | 'amber'
  | 'violet'
  | 'rose'
  | 'cyan';

export interface FrontendImageRegion {
  id: string;
  label: string;
  zone: PrototypeDropZone;
  /** Percentage coordinates (0-100) on the uploaded frontend reference image */
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  shadeId: ElementShadeId;
  linkedElementId?: string;
}

export interface WorkingFrontendImageState {
  id: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  originalSizeKb?: number;
  compressedSizeKb?: number;
  uploadedAt: string;
  notes?: string;
  regions: FrontendImageRegion[];
}

export type LocalDiskAccessMode =
  | 'unconfigured'
  | 'fs-handle-readwrite'
  | 'directory-linked-download';

export interface LocalDiskWorkspaceConfig {
  directoryName: string;
  subFolderName: string;
  accessMode: LocalDiskAccessMode;
  autoSaveOnChange: boolean;
  saveImagesAndTsx: boolean;
  lastSavedAt: string | null;
  savedFilesCount: number;
  statusNote?: string;
}

export interface ActiveModifiedElementState {
  id: string;
  kind: 'widget' | 'generated' | 'zone' | 'region';
  label: string;
  zone: PrototypeDropZone;
  screenId?: string;
  shadeId: ElementShadeId;
  sourceSurface: string;
  updatedAtMs: number;
}


