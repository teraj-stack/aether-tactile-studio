import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { BM_CLINIC_PROKTOLOGIA_SCREEN } from '../lib/bmClinicProktologiaScreen';
import { hapticAudio } from '../lib/hapticAudioEngine';
import {
  ActiveModifiedElementState,
  AppScreenMapProject,
  BUILTIN_HAPTIC_PATTERNS,
  BUTTON_ILLUMINATION_PRESETS,
  BUTTON_MOTION_PRESETS,
  ButtonGroupId,
  ButtonIlluminationPresetId,
  ButtonMotionPresetId,
  CalibrationTargetCharacter,
  CreativeWorkbenchLayoutMode,
  CustomHapticPattern,
  DEFAULT_AETHER_SCREEN_MAP,
  DEFAULT_ROTARY_DRIVER_CALIBRATION,
  DepthShadowSettings,
  DriverCalibrationReport,
  ElementShadeId,
  EngravingBacklightSettings,
  ExternalAppPlugin,
  ExternalPluginDataScope,
  ExternalPluginIntegrationKind,
  FileBuildTargetType,
  FileUploadPlanRequestPayload,
  FrontendImageRegion,
  GeneratedCompleteElement,
  GitHubRepoProfileMetadata,
  GroupOverrideConfig,
  HapticMaterialType,
  HapticSettings,
  INITIAL_MEDIA_LIBRARY,
  LocalDiskWorkspaceConfig,
  MATERIAL_PROFILES,
  OrganicAnimationConfig,
  PaletteMode,
  PromptGraphicRole,
  PromptReferenceGraphic,
  PrototypeDropZone,
  ROTARY_DRIVER_FACTORY_PROFILES,
  RenderPresetItem,
  RotaryDriverCalibrationConfig,
  SCREEN_TRANSITION_PRESETS,
  SavedDriverCalibrationProfile,
  ScreenTransitionPresetId,
  SourcePromptItem,
  StudioMediaItem,
  StudioSnapshotRecord,
  StudioSnapshotState,
  SynthPatchSettings,
  TOP_5_RENDER_PRESETS,
  UploadedFileBuildPlan,
  WorkingFrontendImageState,
} from '../types/studio';
import { formatFirestoreQuotaOrErrorMessage } from '../lib/firebase';
import {
  buildSanitizedStudioSnapshotState,
  createStudioSnapshotInFirestore,
  deleteStudioSnapshotFromFirestore,
  normalizeVersionTag,
  subscribeUserStudioSnapshots,
  toggleStudioSnapshotPinInFirestore,
  updateStudioSnapshotMetadataInFirestore,
} from '../lib/studioSnapshots';
import {
  clearStoredActiveStudioSession,
  getStoredActiveStudioSession,
  loadLocalAccountSnapshots,
  loginStudioAiAccount,
  recoverStudioAiAccount,
  registerStudioAiAccount,
  safeLocalGet,
  safeLocalSet,
  saveLocalAccountSnapshots,
  StudioAccountProfile,
  syncStudioAccountWorkspaceToCloud,
} from '../lib/studioAccountAuth';
import {
  downloadWorkspaceJsonArchive,
  generateAndDownloadStandaloneOfflineHtml,
  parseWorkspaceJsonArchive,
  StandaloneStudioStateBundle,
} from '../lib/offlineStandaloneExporter';
import {
  getZeroLimitLocalMode,
  setZeroLimitLocalMode as persistZeroLimitLocalMode,
  studioApiFetch,
} from '../lib/offlineStudioEngines';
import {
  buildComprehensiveGitHubReadme,
  DEFAULT_EXTERNAL_APP_PLUGINS,
  DEFAULT_GITHUB_REPO_PROFILE,
} from '../lib/externalAppPlugins';
import {
  DEFAULT_LOCAL_DISK_CONFIG,
  getActiveLocalDirectoryHandle,
  pickLocalDiskDirectory,
  readImageFileToWorkingState,
  writeWorkspaceFilesToLocalDisk,
} from '../lib/localDiskWorkspace';
import { slugifyExportName } from '../lib/screenMapExport';
import {
  FRONTEND_ELEMENT_SHADE_ORDER,
  hashStringToShadeId,
} from '../lib/frontendElementShades';

const LOCAL_STORAGE_KEY = 'aether_tactile_studio_prefs_v1';

export interface SavedSynthPreset {
  id: string;
  dbId?: number;
  name: string;
  materialType: HapticMaterialType;
  synth: SynthPatchSettings;
  haptic: HapticSettings;
}

export interface PendingImageGeneratorDraft {
  prompt: string;
  aspectRatio: '16:9' | '9:16' | '4:3' | '1:1';
  screenTitle?: string;
}

interface StudioContextValue {
  user: User | null;
  studioAccount: StudioAccountProfile | null;
  activeIdentityLabel: string | null;
  isAuthenticatedAny: boolean;
  isBootAuthLocked: boolean;
  authLoading: boolean;
  authModalOpen: boolean;
  authModalTab: 'auth' | 'offline';
  openAuthModal: (tab?: 'auth' | 'offline') => void;
  closeAuthModal: () => void;
  lastRecoveryCode: string | null;
  clearLastRecoveryCode: () => void;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  registerStudioAccount: (params: {
    displayName: string;
    email: string;
    password: string;
    organization?: string;
    role?: string;
  }) => Promise<{ profile: StudioAccountProfile; recoveryCode: string }>;
  loginStudioAccount: (params: {
    email: string;
    password: string;
  }) => Promise<StudioAccountProfile>;
  recoverStudioAccount: (params: {
    email: string;
    recoveryCode: string;
    newPassword: string;
  }) => Promise<StudioAccountProfile>;
  syncStudioWorkspaceNow: () => Promise<{ synced: boolean; syncedAt: string }>;
  downloadOfflineHtmlApp: (opts: {
    includeAccountsVault: boolean;
    keepSessionSignedIn: boolean;
    requireAuthOnBoot: boolean;
    customFileName?: string;
  }) => Promise<{
    fileName: string;
    sizeBytes: number;
    builtVia: 'server-compiler' | 'local-repack';
  }>;
  exportStudioJsonBackup: () => { fileName: string; sizeBytes: number };
  importStudioJsonBackup: (rawJson: string) => void;

  palette: PaletteMode;
  setPalette: (p: PaletteMode) => void;

  depth: DepthShadowSettings;
  updateDepth: (patch: Partial<DepthShadowSettings>) => void;

  synth: SynthPatchSettings;
  updateSynth: (patch: Partial<SynthPatchSettings>) => void;

  haptic: HapticSettings;
  updateHaptic: (patch: Partial<HapticSettings>) => void;
  selectMaterialProfile: (mat: HapticMaterialType, options?: { silent?: boolean }) => void;

  engraving: EngravingBacklightSettings;
  updateEngraving: (patch: Partial<EngravingBacklightSettings>) => void;

  animation: OrganicAnimationConfig;
  setAnimation: React.Dispatch<React.SetStateAction<OrganicAnimationConfig>>;
  applyButtonMotionPreset: (presetId: ButtonMotionPresetId) => void;
  applyButtonIlluminationPreset: (
    presetId: ButtonIlluminationPresetId,
    syncColor?: boolean
  ) => void;

  selectedGroups: ButtonGroupId[];
  toggleGroupSelection: (groupId: ButtonGroupId) => void;
  unifySelectedGroupsNow: () => void;
  groupConfigs: Record<ButtonGroupId, GroupOverrideConfig>;

  patterns: CustomHapticPattern[];
  importCustomPattern: (
    name: string,
    pulses: number[],
    description?: string
  ) => Promise<void>;
  removeCustomPattern: (id: string) => Promise<void>;

  savedPresets: SavedSynthPreset[];
  saveCurrentPreset: (name: string) => Promise<void>;
  loadSavedPreset: (preset: SavedSynthPreset) => void;
  removeSavedPreset: (id: string) => Promise<void>;

  sourcePrompts: SourcePromptItem[];
  addSourcePrompt: (
    title: string,
    category: string,
    promptText: string,
    sourceConfig: Record<string, unknown>
  ) => Promise<void>;
  removeSourcePrompt: (id: string) => Promise<void>;

  mediaLibrary: StudioMediaItem[];
  addMediaAsset: (item: Omit<StudioMediaItem, 'id'>) => Promise<void>;
  removeMediaAsset: (id: string) => Promise<void>;

  driverCalibration: RotaryDriverCalibrationConfig;
  updateDriverCalibration: (patch: Partial<RotaryDriverCalibrationConfig>) => void;
  calibrationReport: DriverCalibrationReport | null;
  savedCalibrations: SavedDriverCalibrationProfile[];
  saveDriverCalibrationProfile: (
    name: string,
    controllerModel?: string
  ) => Promise<void>;
  loadDriverCalibrationProfile: (profile: SavedDriverCalibrationProfile) => void;
  removeDriverCalibrationProfile: (id: string) => Promise<void>;
  runDriverCalibrationService: (
    targetCharacter: CalibrationTargetCharacter
  ) => Promise<DriverCalibrationReport | null>;

  activeScreenTransition: ScreenTransitionPresetId;
  setActiveScreenTransition: (presetId: ScreenTransitionPresetId) => void;
  activeScreenMap: AppScreenMapProject;
  setActiveScreenMap: React.Dispatch<React.SetStateAction<AppScreenMapProject>>;
  savedScreenMaps: AppScreenMapProject[];
  saveActiveScreenMap: (customName?: string) => Promise<void>;
  loadScreenMapProject: (project: AppScreenMapProject) => void;
  removeScreenMapProject: (id: string) => Promise<void>;
  designScreenMapFromGitHub: (
    repoInput: string,
    appGoal?: string
  ) => Promise<AppScreenMapProject>;

  activeBuildMatrix: UploadedFileBuildPlan | null;
  savedBuildMatrices: UploadedFileBuildPlan[];
  generatePlanAndMatrixFromFile: (
    payload: FileUploadPlanRequestPayload
  ) => Promise<{
    mapProject: AppScreenMapProject;
    buildMatrix: UploadedFileBuildPlan;
  }>;
  generateFullFrontendFromUploadedFile: (
    file: File,
    options?: {
      projectGoal?: string;
      targetType?: FileBuildTargetType;
    }
  ) => Promise<{
    mapProject: AppScreenMapProject;
    buildMatrix: UploadedFileBuildPlan;
    createdElements: GeneratedCompleteElement[];
  }>;
  selectSavedBuildMatrix: (matrix: UploadedFileBuildPlan) => void;
  removeSavedBuildMatrix: (id: string) => void;

  pendingImageGeneratorDraft: PendingImageGeneratorDraft | null;
  setPendingImageGeneratorDraft: React.Dispatch<
    React.SetStateAction<PendingImageGeneratorDraft | null>
  >;

  snapshots: StudioSnapshotRecord[];
  snapshotsLoading: boolean;
  snapshotsError: string | null;
  activeRestoredSnapshotId: string | null;
  currentSnapshotStatePreview: StudioSnapshotState;
  createStudioSnapshot: (params: {
    label: string;
    note?: string;
    versionTag?: string;
    isPinned?: boolean;
  }) => Promise<void>;
  restoreStudioSnapshot: (snapshot: StudioSnapshotRecord) => void;
  togglePinStudioSnapshot: (snapshot: StudioSnapshotRecord) => Promise<void>;
  renameStudioSnapshot: (
    snapshotId: string,
    label: string,
    note: string
  ) => Promise<void>;
  deleteStudioSnapshot: (snapshotId: string) => Promise<void>;

  applyRenderPreset: (preset: RenderPresetItem) => void;

  // Persistent Creative Workbench (Live Frontend Model Preview + Master Prompt + GitHub Export)
  workbenchLayoutMode: CreativeWorkbenchLayoutMode;
  setWorkbenchLayoutMode: (mode: CreativeWorkbenchLayoutMode) => void;
  activePreviewScreenId: string;
  setActivePreviewScreenId: (screenId: string) => void;
  masterPromptDraft: string;
  setMasterPromptDraft: React.Dispatch<React.SetStateAction<string>>;
  attachedPromptGraphics: PromptReferenceGraphic[];
  addAttachedPromptGraphic: (params: {
    name: string;
    mimeType: string;
    dataUrl: string;
    role?: PromptGraphicRole;
  }) => void;
  removeAttachedPromptGraphic: (id: string) => void;
  updateAttachedPromptGraphicRole: (id: string, role: PromptGraphicRole) => void;
  clearAttachedPromptGraphics: () => void;
  generatedElements: GeneratedCompleteElement[];
  generateCompleteUiElement: (params: {
    compiledPrompt: string;
    userBrief: string;
    targetScreenId: string;
    targetZone: PrototypeDropZone;
  }) => Promise<GeneratedCompleteElement>;
  removeGeneratedElement: (id: string) => void;
  moveGeneratedElementTarget: (
    id: string,
    targetScreenId: string,
    targetZone: PrototypeDropZone
  ) => void;
  gitHubExportModalOpen: boolean;
  setGitHubExportModalOpen: (open: boolean) => void;
  localhostModalOpen: boolean;
  setLocalhostModalOpen: (open: boolean) => void;
  zeroLimitLocalMode: boolean;
  setZeroLimitLocalMode: (enabled: boolean) => void;

  // External Application Plugins & GitHub Repo Description Metadata
  externalPlugins: ExternalAppPlugin[];
  toggleExternalPlugin: (id: string) => void;
  addCustomExternalPlugin: (input: {
    targetAppName: string;
    pluginTitle: string;
    description: string;
    integrationKind: ExternalPluginIntegrationKind;
    endpointOrUri: string;
    scopes: ExternalPluginDataScope[];
    customHeadersJson?: string;
  }) => ExternalAppPlugin;
  updateExternalPluginEndpoint: (id: string, endpointOrUri: string) => void;
  removeExternalPlugin: (id: string) => void;
  gitHubRepoProfile: GitHubRepoProfileMetadata;
  updateGitHubRepoProfile: (patch: Partial<GitHubRepoProfileMetadata>) => void;
  regenerateGitHubRepoProfileWithAi: () => Promise<GitHubRepoProfileMetadata>;
  pluginsModalOpen: boolean;
  setPluginsModalOpen: (open: boolean) => void;

  // Start Page: Local Disk Storage, Working Frontend Image & Synchronized Shades
  localDiskConfig: LocalDiskWorkspaceConfig;
  updateLocalDiskConfig: (patch: Partial<LocalDiskWorkspaceConfig>) => void;
  selectLocalDiskDirectory: () => Promise<{
    ok: boolean;
    fallbackRequired?: boolean;
    message: string;
  }>;
  linkLocalDirectoryNameFallback: (folderName: string) => void;
  saveProjectToLocalDiskNow: (
    forceDownloadFallback?: boolean
  ) => Promise<{ ok: boolean; message: string }>;
  workingFrontendImage: WorkingFrontendImageState | null;
  setWorkingFrontendImage: React.Dispatch<
    React.SetStateAction<WorkingFrontendImageState | null>
  >;
  updateFrontendImageRegion: (
    regionId: string,
    patch: Partial<FrontendImageRegion>
  ) => void;
  addFrontendImageRegion: (
    region: Omit<FrontendImageRegion, 'id'>
  ) => FrontendImageRegion;
  removeFrontendImageRegion: (regionId: string) => void;
  composedElementShades: Record<string, ElementShadeId>;
  setElementCustomShade: (elementId: string, shadeId: ElementShadeId) => void;
  activeModifiedElement: ActiveModifiedElementState | null;
  markElementAsActivelyModified: (
    target: Omit<ActiveModifiedElementState, 'updatedAtMs'> | null
  ) => void;

  interactionEnergy: number;
  activeHoldLevel: number;
  setActiveHoldLevel: (lvl: number) => void;
  pulseInteraction: (strength?: number) => void;
}

const DEFAULT_DEPTH: DepthShadowSettings = {
  elevation: 20,
  blur: 42,
  glassBlur: 22,
  glassOpacity: 0.72,
  borderRadius: 28,
  specularRim: 82,
};

const DEFAULT_SYNTH: SynthPatchSettings = {
  waveform: 'sine',
  baseFrequency: 86,
  harmonicRatio: 1.5,
  filterCutoff: 2600,
  filterResonance: 2.4,
  attackMs: 5,
  decayMs: 115,
  reverbMix: 0.14,
  subBassLevel: 0.48,
};

const DEFAULT_HAPTIC: HapticSettings = {
  enabled: true,
  material: 'frosted-glass',
  intensity: 76,
  durationMs: 48,
  materialHardness: 74,
  reverseClutchForce: 54,
  holdRampMultiplier: 1.75,
  progressiveHoldEnabled: true,
  holdPeakIntensity: 96,
  holdRampDurationMs: 1400,
  activePatternId: 'crystal-ripple',
};

const DEFAULT_ENGRAVING: EngravingBacklightSettings = {
  symbol: 'vascular',
  glowEnabled: true,
  glowColor: '#8B7CFF',
  glowIntensity: 78,
  etchDepth: 72,
};

const DEFAULT_ANIMATION: OrganicAnimationConfig = {
  stiffness: 440,
  damping: 26,
  mass: 0.82,
  pressScale: 0.964,
  rippleDurationMs: 560,
  glowSpread: 36,
  holdTremorHz: 18,
  motionPreset: 'magnetic-levitation',
  illuminationPreset: 'cursor-spotlight',
  aiNote:
    'Zbalansowana lewitacja magnetyczna szkła matowego: śledzenie kursora i szybkie osiadanie zgodne z obwiednią 110 ms.',
};

const DEFAULT_GROUPS: Record<ButtonGroupId, GroupOverrideConfig> = {
  'group-primary': {
    material: 'frosted-glass',
    pitchOffsetSemitones: 0,
    glowColor: '#8B7CFF',
    symbol: 'prism',
  },
  'group-diagnostic': {
    material: 'frosted-glass',
    pitchOffsetSemitones: 2,
    glowColor: '#68BBE3',
    symbol: 'vascular',
  },
  'group-audio': {
    material: 'matte-metal',
    pitchOffsetSemitones: -3,
    glowColor: '#74BFA1',
    symbol: 'wave',
  },
};

const DEFAULT_SOURCE_PROMPTS: SourcePromptItem[] = TOP_5_RENDER_PRESETS.map((p) => ({
  id: p.id,
  title: p.title,
  category: p.category,
  promptText: p.prompt,
  sourceConfigJson: JSON.stringify(p.sourceJson, null, 2),
  createdAt: 'Biblioteka bazowa',
}));

const StudioContext = createContext<StudioContextValue | null>(null);

export const StudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [studioAccount, setStudioAccount] = useState<StudioAccountProfile | null>(() =>
    getStoredActiveStudioSession()
  );
  const [requireAuthOnBootRequired] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.__AETHER_INITIAL_STATE__) return false;
    return Boolean(window.__AETHER_INITIAL_STATE__.requireAuthOnBoot);
  });
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authModalTab, setAuthModalTab] = useState<'auth' | 'offline'>('auth');
  const [lastRecoveryCode, setLastRecoveryCode] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);

  const [palette, setPalette] = useState<PaletteMode>('pearl-flebologia');
  const [depth, setDepth] = useState<DepthShadowSettings>(DEFAULT_DEPTH);
  const [synth, setSynth] = useState<SynthPatchSettings>(DEFAULT_SYNTH);
  const [haptic, setHaptic] = useState<HapticSettings>(DEFAULT_HAPTIC);
  const [engraving, setEngraving] = useState<EngravingBacklightSettings>(DEFAULT_ENGRAVING);
  const [animation, setAnimation] = useState<OrganicAnimationConfig>(DEFAULT_ANIMATION);

  const [selectedGroups, setSelectedGroups] = useState<ButtonGroupId[]>([
    'group-primary',
    'group-diagnostic',
  ]);
  const [groupConfigs, setGroupConfigs] =
    useState<Record<ButtonGroupId, GroupOverrideConfig>>(DEFAULT_GROUPS);

  const [customPatterns, setCustomPatterns] = useState<CustomHapticPattern[]>([]);
  const [savedPresets, setSavedPresets] = useState<SavedSynthPreset[]>([
    {
      id: 'default-pearl-bell',
      name: 'Aether Perłowy Rezonans',
      materialType: 'frosted-glass',
      synth: DEFAULT_SYNTH,
      haptic: DEFAULT_HAPTIC,
    },
    {
      id: 'default-metal-encoder',
      name: 'Anodowany Detent Studio',
      materialType: 'matte-metal',
      synth: {
        ...DEFAULT_SYNTH,
        waveform: 'triangle',
        baseFrequency: 74,
        harmonicRatio: 2.0,
        filterCutoff: 3400,
        decayMs: 95,
      },
      haptic: {
        ...DEFAULT_HAPTIC,
        material: 'matte-metal',
        materialHardness: 95,
        reverseClutchForce: 86,
        activePatternId: 'mechanical-detent',
      },
    },
  ]);

  const [sourcePrompts, setSourcePrompts] =
    useState<SourcePromptItem[]>(DEFAULT_SOURCE_PROMPTS);
  const [mediaLibrary, setMediaLibrary] =
    useState<StudioMediaItem[]>(INITIAL_MEDIA_LIBRARY);

  const [driverCalibration, setDriverCalibration] =
    useState<RotaryDriverCalibrationConfig>(DEFAULT_ROTARY_DRIVER_CALIBRATION);
  const [customCalibrations, setCustomCalibrations] = useState<
    SavedDriverCalibrationProfile[]
  >([]);
  const [calibrationReport, setCalibrationReport] =
    useState<DriverCalibrationReport | null>(null);

  const [activeScreenTransition, setActiveScreenTransitionState] =
    useState<ScreenTransitionPresetId>('spatial-glass-push');
  const [activeScreenMap, setActiveScreenMap] =
    useState<AppScreenMapProject>(DEFAULT_AETHER_SCREEN_MAP);
  const [customScreenMaps, setCustomScreenMaps] = useState<AppScreenMapProject[]>([]);

  const [activeBuildMatrix, setActiveBuildMatrix] =
    useState<UploadedFileBuildPlan | null>(null);
  const [savedBuildMatrices, setSavedBuildMatrices] = useState<
    UploadedFileBuildPlan[]
  >([]);
  const [pendingImageGeneratorDraft, setPendingImageGeneratorDraft] =
    useState<PendingImageGeneratorDraft | null>(null);

  const [snapshots, setSnapshots] = useState<StudioSnapshotRecord[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState<boolean>(false);
  const [snapshotsError, setSnapshotsError] = useState<string | null>(null);
  const [activeRestoredSnapshotId, setActiveRestoredSnapshotId] = useState<
    string | null
  >(null);

  const [workbenchLayoutMode, setWorkbenchLayoutMode] =
    useState<CreativeWorkbenchLayoutMode>('split-studio');
  const [activePreviewScreenId, setActivePreviewScreenId] = useState<string>(
    DEFAULT_AETHER_SCREEN_MAP.nodes[0]?.id || 'scr-dashboard'
  );
  const [masterPromptDraft, setMasterPromptDraft] = useState<string>(
    'Zaprojektuj kompletny moduł hero i sterowania z czytelną hierarchią danych, przyciskiem głównej akcji oraz suwakiem regulacji parametrów w czasie rzeczywistym.'
  );
  const [attachedPromptGraphics, setAttachedPromptGraphics] = useState<
    PromptReferenceGraphic[]
  >([]);
  const [generatedElements, setGeneratedElements] = useState<
    GeneratedCompleteElement[]
  >([]);
  const [gitHubExportModalOpen, setGitHubExportModalOpen] =
    useState<boolean>(false);

  const [externalPlugins, setExternalPlugins] = useState<ExternalAppPlugin[]>(
    DEFAULT_EXTERNAL_APP_PLUGINS
  );
  const [gitHubRepoProfile, setGitHubRepoProfile] =
    useState<GitHubRepoProfileMetadata>(DEFAULT_GITHUB_REPO_PROFILE);
  const [pluginsModalOpen, setPluginsModalOpen] = useState<boolean>(false);
  const [localhostModalOpen, setLocalhostModalOpen] = useState<boolean>(false);
  const [zeroLimitLocalMode, setZeroLimitLocalModeState] = useState<boolean>(() =>
    getZeroLimitLocalMode()
  );

  const setZeroLimitLocalMode = useCallback((enabled: boolean) => {
    persistZeroLimitLocalMode(enabled);
    setZeroLimitLocalModeState(enabled);
  }, []);

  const [localDiskConfig, setLocalDiskConfig] =
    useState<LocalDiskWorkspaceConfig>(DEFAULT_LOCAL_DISK_CONFIG);
  const [workingFrontendImage, setWorkingFrontendImage] =
    useState<WorkingFrontendImageState | null>(BM_CLINIC_PROKTOLOGIA_SCREEN);
  const [composedElementShades, setComposedElementShades] = useState<
    Record<string, ElementShadeId>
  >({});
  const [activeModifiedElement, setActiveModifiedElement] =
    useState<ActiveModifiedElementState | null>(null);

  const [interactionEnergy, setInteractionEnergy] = useState(0);
  const [activeHoldLevel, setActiveHoldLevel] = useState(0);

  const applyPreferencesObject = useCallback((parsed: Record<string, unknown>) => {
    if (!parsed || typeof parsed !== 'object') return;
    if (parsed.palette) setPalette(parsed.palette as PaletteMode);
    if (parsed.depth && typeof parsed.depth === 'object') {
      setDepth((prev) => ({ ...prev, ...(parsed.depth as Partial<DepthShadowSettings>) }));
    }
    if (parsed.synth && typeof parsed.synth === 'object') {
      const synthObj = parsed.synth as Partial<SynthPatchSettings>;
      const rawFreq = Number(synthObj.baseFrequency);
      const clampedFreq =
        !Number.isFinite(rawFreq) || rawFreq >= 160
          ? 86
          : Math.max(36, Math.min(158, rawFreq));
      setSynth((prev) => ({ ...prev, ...synthObj, baseFrequency: clampedFreq }));
    }
    if (parsed.haptic && typeof parsed.haptic === 'object') {
      setHaptic((prev) => ({ ...prev, ...(parsed.haptic as Partial<HapticSettings>) }));
    }
    if (parsed.engraving && typeof parsed.engraving === 'object') {
      setEngraving((prev) => ({
        ...prev,
        ...(parsed.engraving as Partial<EngravingBacklightSettings>),
      }));
    }
    if (parsed.animation && typeof parsed.animation === 'object') {
      setAnimation((prev) => ({
        ...prev,
        ...(parsed.animation as Partial<OrganicAnimationConfig>),
      }));
    }
    if (Array.isArray(parsed.selectedGroups)) {
      setSelectedGroups(parsed.selectedGroups as ButtonGroupId[]);
    }
    if (parsed.groupConfigs && typeof parsed.groupConfigs === 'object') {
      setGroupConfigs((prev) => ({
        ...prev,
        ...(parsed.groupConfigs as Record<ButtonGroupId, GroupOverrideConfig>),
      }));
    }
    if (Array.isArray(parsed.customPatterns)) {
      setCustomPatterns(parsed.customPatterns as CustomHapticPattern[]);
    }
    if (Array.isArray(parsed.savedPresets) && parsed.savedPresets.length > 0) {
      setSavedPresets(
        (parsed.savedPresets as SavedSynthPreset[]).map((pr) => ({
          ...pr,
          synth: {
            ...pr.synth,
            baseFrequency:
              pr.synth?.baseFrequency >= 160
                ? 86
                : Math.max(36, Math.min(158, Number(pr.synth?.baseFrequency) || 86)),
          },
        }))
      );
    }
    if (parsed.driverCalibration && typeof parsed.driverCalibration === 'object') {
      const drvObj = parsed.driverCalibration as Partial<RotaryDriverCalibrationConfig>;
      const rawBodyHz = Number(drvObj.lowBodyFreqHz);
      const safeBodyHz =
        !Number.isFinite(rawBodyHz) || rawBodyHz >= 160
          ? 74
          : Math.max(36, Math.min(156, rawBodyHz));
      setDriverCalibration((prev) => ({
        ...prev,
        ...drvObj,
        lowBodyFreqHz: safeBodyHz,
      }));
    }
    if (Array.isArray(parsed.customCalibrations)) {
      setCustomCalibrations(parsed.customCalibrations as SavedDriverCalibrationProfile[]);
    }
    if (typeof parsed.activeScreenTransition === 'string') {
      const exists = SCREEN_TRANSITION_PRESETS.some(
        (t) => t.id === parsed.activeScreenTransition
      );
      if (exists) {
        setActiveScreenTransitionState(
          parsed.activeScreenTransition as ScreenTransitionPresetId
        );
      }
    }
    if (
      parsed.activeScreenMap &&
      typeof parsed.activeScreenMap === 'object' &&
      Array.isArray((parsed.activeScreenMap as AppScreenMapProject).nodes) &&
      (parsed.activeScreenMap as AppScreenMapProject).nodes.length > 0
    ) {
      setActiveScreenMap(parsed.activeScreenMap as AppScreenMapProject);
    }
    if (Array.isArray(parsed.customScreenMaps)) {
      setCustomScreenMaps(parsed.customScreenMaps as AppScreenMapProject[]);
    }
    if (
      parsed.activeBuildMatrix &&
      typeof parsed.activeBuildMatrix === 'object' &&
      Array.isArray((parsed.activeBuildMatrix as UploadedFileBuildPlan).websiteMatrix)
    ) {
      setActiveBuildMatrix(parsed.activeBuildMatrix as UploadedFileBuildPlan);
    }
    if (Array.isArray(parsed.savedBuildMatrices)) {
      setSavedBuildMatrices(parsed.savedBuildMatrices as UploadedFileBuildPlan[]);
    }
    if (Array.isArray(parsed.sourcePrompts) && parsed.sourcePrompts.length > 0) {
      setSourcePrompts(parsed.sourcePrompts as SourcePromptItem[]);
    }
    if (Array.isArray(parsed.customMediaItems) && parsed.customMediaItems.length > 0) {
      setMediaLibrary([
        ...(parsed.customMediaItems as StudioMediaItem[]),
        ...INITIAL_MEDIA_LIBRARY,
      ]);
    }
    if (
      typeof parsed.workbenchLayoutMode === 'string' &&
      ['split-studio', 'preview-only', 'composer-only', 'canvas-full'].includes(
        parsed.workbenchLayoutMode
      )
    ) {
      setWorkbenchLayoutMode(
        parsed.workbenchLayoutMode as CreativeWorkbenchLayoutMode
      );
    }
    if (typeof parsed.activePreviewScreenId === 'string' && parsed.activePreviewScreenId) {
      setActivePreviewScreenId(parsed.activePreviewScreenId);
    }
    if (typeof parsed.masterPromptDraft === 'string') {
      setMasterPromptDraft(parsed.masterPromptDraft);
    }
    if (Array.isArray(parsed.attachedPromptGraphics)) {
      setAttachedPromptGraphics(
        parsed.attachedPromptGraphics as PromptReferenceGraphic[]
      );
    }
    if (Array.isArray(parsed.generatedElements)) {
      setGeneratedElements(
        parsed.generatedElements as GeneratedCompleteElement[]
      );
    }
    if (Array.isArray(parsed.externalPlugins)) {
      const savedList = parsed.externalPlugins as ExternalAppPlugin[];
      const savedById = new Map(savedList.map((p) => [p.id, p]));
      const mergedBuiltins = DEFAULT_EXTERNAL_APP_PLUGINS.map((def) => {
        const match = savedById.get(def.id);
        return match
          ? {
              ...def,
              enabled: Boolean(match.enabled),
              endpointOrUri: match.endpointOrUri || def.endpointOrUri,
            }
          : def;
      });
      const customOnes = savedList.filter((p) => p.isCustom);
      setExternalPlugins([...mergedBuiltins, ...customOnes]);
    }
    if (
      parsed.gitHubRepoProfile &&
      typeof parsed.gitHubRepoProfile === 'object'
    ) {
      setGitHubRepoProfile((prev) => ({
        ...prev,
        ...(parsed.gitHubRepoProfile as Partial<GitHubRepoProfileMetadata>),
      }));
    }
    if (
      parsed.workingFrontendImage &&
      typeof parsed.workingFrontendImage === 'object' &&
      typeof (parsed.workingFrontendImage as WorkingFrontendImageState).dataUrl ===
        'string'
    ) {
      setWorkingFrontendImage(
        parsed.workingFrontendImage as WorkingFrontendImageState
      );
    }
    if (parsed.localDiskConfig && typeof parsed.localDiskConfig === 'object') {
      const rawDisk = parsed.localDiskConfig as Partial<LocalDiskWorkspaceConfig>;
      setLocalDiskConfig((prev) => ({
        ...prev,
        ...rawDisk,
        // After a cold reload, a FileSystemDirectoryHandle requires user gesture re-grant if unlinked
        accessMode:
          rawDisk.accessMode === 'fs-handle-readwrite' &&
          !getActiveLocalDirectoryHandle()
            ? rawDisk.directoryName
              ? 'directory-linked-download'
              : 'unconfigured'
            : rawDisk.accessMode || prev.accessMode,
      }));
    }
    if (
      parsed.composedElementShades &&
      typeof parsed.composedElementShades === 'object'
    ) {
      setComposedElementShades(
        parsed.composedElementShades as Record<string, ElementShadeId>
      );
    }
  }, []);

  // Hydrate studio preferences from embedded standalone bundle and/or browser storage
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.__AETHER_INITIAL_STATE__) {
        const embedded = window.__AETHER_INITIAL_STATE__ as unknown as Partial<StandaloneStudioStateBundle>;
        if (embedded.version === 'aether-offline-v1' && embedded.preferences) {
          applyPreferencesObject(embedded.preferences as unknown as Record<string, unknown>);
        }
      }

      const raw = safeLocalGet(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        applyPreferencesObject(parsed);
      }
    } catch {
      // Ignore malformed storage
    }
  }, [applyPreferencesObject]);

  const buildCurrentPreferencesPayload = useCallback((): StandaloneStudioStateBundle['preferences'] => {
    const baseIds = new Set(INITIAL_MEDIA_LIBRARY.map((m) => m.id));
    return {
      palette,
      depth,
      synth,
      haptic,
      engraving,
      animation,
      selectedGroups,
      groupConfigs,
      driverCalibration,
      activeScreenTransition,
      activeScreenMap,
      customScreenMaps: customScreenMaps.filter((m) => !m.dbId),
      activeBuildMatrix,
      savedBuildMatrices: savedBuildMatrices.slice(0, 15),
      customPatterns: customPatterns.filter((p) => !p.dbId),
      savedPresets: savedPresets.filter((p) => !p.dbId),
      customCalibrations: customCalibrations.filter((c) => !c.dbId),
      sourcePrompts: sourcePrompts.slice(0, 30),
      customMediaItems: mediaLibrary
        .filter((m) => !baseIds.has(m.id) && !m.dbId)
        .slice(0, 12),
      workbenchLayoutMode,
      activePreviewScreenId,
      masterPromptDraft,
      attachedPromptGraphics: attachedPromptGraphics.slice(0, 8),
      generatedElements: generatedElements.slice(0, 24),
      externalPlugins,
      gitHubRepoProfile,
      workingFrontendImage,
      localDiskConfig,
      composedElementShades,
    };
  }, [
    palette,
    depth,
    synth,
    haptic,
    engraving,
    animation,
    selectedGroups,
    groupConfigs,
    driverCalibration,
    activeScreenTransition,
    activeScreenMap,
    customScreenMaps,
    activeBuildMatrix,
    savedBuildMatrices,
    customPatterns,
    savedPresets,
    customCalibrations,
    sourcePrompts,
    mediaLibrary,
    workbenchLayoutMode,
    activePreviewScreenId,
    masterPromptDraft,
    attachedPromptGraphics,
    generatedElements,
    externalPlugins,
    gitHubRepoProfile,
    workingFrontendImage,
    localDiskConfig,
    composedElementShades,
  ]);

  // Persist non-sensitive studio settings to safe local storage
  useEffect(() => {
    try {
      const payload = buildCurrentPreferencesPayload();
      safeLocalSet(LOCAL_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
  }, [buildCurrentPreferencesPayload]);

  // Sync dark class for emerald-clinic mode
  useEffect(() => {
    const root = document.documentElement;
    if (palette === 'emerald-clinic') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [palette]);

  const authFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const currentUser = auth.currentUser;
    let token = tokenRef.current;
    if (currentUser) {
      try {
        token = await currentUser.getIdToken();
      } catch {
        // Offline fallback
      }
    } else if (studioAccount?.serverToken) {
      token = studioAccount.serverToken;
    }
    tokenRef.current = token;

    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return studioApiFetch(url, { ...options, headers });
  }, [studioAccount?.serverToken]);

  // Firebase Auth listener + Cloud sync (with offline/file:// non-blocking guard)
  useEffect(() => {
    const isFileOrStandalone =
      typeof window !== 'undefined' &&
      (window.location.protocol === 'file:' ||
        Boolean(window.__AETHER_STANDALONE_OFFLINE__));

    if (isFileOrStandalone) {
      setAuthLoading(false);
      return;
    }

    const fallbackTimer = window.setTimeout(() => {
      setAuthLoading(false);
    }, 1500);

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      window.clearTimeout(fallbackTimer);
      setUser(firebaseUser);
      setAuthLoading(false);
      if (!firebaseUser) {
        tokenRef.current = null;
        return;
      }

      try {
        const token = await firebaseUser.getIdToken();
        tokenRef.current = token;
        const resp = await studioApiFetch('/api/user/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        if (!resp.ok) return;
        const data = await resp.json();

        if (Array.isArray(data.presets) && data.presets.length > 0) {
          const dbPresets: SavedSynthPreset[] = data.presets.map(
            (row: { id: number; name: string; materialType: HapticMaterialType; configJson: string }) => {
              let cfg = { synth: DEFAULT_SYNTH, haptic: DEFAULT_HAPTIC };
              try {
                cfg = JSON.parse(row.configJson);
              } catch {
                // fallback
              }
              const rawDbFreq = Number(cfg.synth?.baseFrequency);
              const clampedDbFreq =
                !Number.isFinite(rawDbFreq) || rawDbFreq >= 160
                  ? 86
                  : Math.max(36, Math.min(158, rawDbFreq));
              return {
                id: `db-preset-${row.id}`,
                dbId: row.id,
                name: row.name,
                materialType: row.materialType,
                synth: { ...(cfg.synth || DEFAULT_SYNTH), baseFrequency: clampedDbFreq },
                haptic: cfg.haptic || DEFAULT_HAPTIC,
              };
            }
          );
          setSavedPresets((prev) => [
            ...dbPresets,
            ...prev.filter((p) => !p.dbId),
          ]);
        }

        if (Array.isArray(data.haptics) && data.haptics.length > 0) {
          const dbHaptics: CustomHapticPattern[] = data.haptics.map(
            (row: {
              id: number;
              name: string;
              patternJson: string;
              hardness: number;
              reverseClutch: number;
            }) => {
              let pulses = [18, 20, 32];
              try {
                const parsed = JSON.parse(row.patternJson);
                if (Array.isArray(parsed)) pulses = parsed;
                else if (Array.isArray(parsed.pulses)) pulses = parsed.pulses;
              } catch {
                // fallback
              }
              return {
                id: `db-haptic-${row.id}`,
                dbId: row.id,
                name: row.name,
                description: 'Wzorzec zsynchronizowany w chmurze',
                pulses,
                hardness: row.hardness,
                reverseClutch: row.reverseClutch,
                isCustom: true,
              };
            }
          );
          setCustomPatterns((prev) => [
            ...dbHaptics,
            ...prev.filter((p) => !p.dbId),
          ]);
        }

        if (Array.isArray(data.prompts) && data.prompts.length > 0) {
          const dbPrompts: SourcePromptItem[] = data.prompts.map(
            (row: {
              id: number;
              title: string;
              category: string;
              promptText: string;
              sourceConfigJson: string;
              createdAt: string;
            }) => ({
              id: `db-prompt-${row.id}`,
              dbId: row.id,
              title: row.title,
              category: row.category,
              promptText: row.promptText,
              sourceConfigJson: row.sourceConfigJson,
              createdAt: new Date(row.createdAt).toLocaleDateString('pl-PL'),
            })
          );
          setSourcePrompts([
            ...dbPrompts,
            ...DEFAULT_SOURCE_PROMPTS,
          ]);
        }

        if (Array.isArray(data.media) && data.media.length > 0) {
          const dbMedia: StudioMediaItem[] = data.media.map(
            (row: {
              id: number;
              title: string;
              mediaType: 'image' | 'video';
              aspectRatio: string;
              resolution: string;
              prompt: string;
              dataUrl: string;
            }) => ({
              id: `db-media-${row.id}`,
              dbId: row.id,
              title: row.title,
              subtitle: `${row.mediaType === 'video' ? 'Wideo Omni' : 'Render Gemini'} · ${row.aspectRatio} · ${row.resolution}`,
              category: row.mediaType === 'video' ? 'Omni Video' : 'AI Studio Render',
              mediaType: row.mediaType,
              aspectRatio: row.aspectRatio,
              resolution: row.resolution,
              prompt: row.prompt,
              src: row.dataUrl,
              audioFreq: 480,
            })
          );
          setMediaLibrary([...dbMedia, ...INITIAL_MEDIA_LIBRARY]);
        }

        if (Array.isArray(data.calibrations) && data.calibrations.length > 0) {
          const dbCalibrations: SavedDriverCalibrationProfile[] =
            data.calibrations.map(
              (row: {
                id: number;
                name: string;
                controllerModel: string;
                calibrationJson: string;
                createdAt: string;
              }) => {
                let parsedCfg: RotaryDriverCalibrationConfig =
                  DEFAULT_ROTARY_DRIVER_CALIBRATION;
                try {
                  const rawObj = JSON.parse(row.calibrationJson);
                  const rawHz = Number(rawObj?.lowBodyFreqHz);
                  parsedCfg = {
                    ...DEFAULT_ROTARY_DRIVER_CALIBRATION,
                    ...rawObj,
                    lowBodyFreqHz:
                      !Number.isFinite(rawHz) || rawHz >= 160
                        ? 74
                        : Math.max(36, Math.min(156, rawHz)),
                  };
                } catch {
                  // fallback
                }
                return {
                  id: `db-cal-${row.id}`,
                  dbId: row.id,
                  name: row.name,
                  controllerModel: row.controllerModel,
                  config: parsedCfg,
                  createdAt: new Date(row.createdAt).toLocaleDateString('pl-PL'),
                };
              }
            );
          setCustomCalibrations((prev) => [
            ...dbCalibrations,
            ...prev.filter((c) => !c.dbId),
          ]);
        }

        if (Array.isArray(data.screenMaps) && data.screenMaps.length > 0) {
          const dbMaps: AppScreenMapProject[] = data.screenMaps
            .map(
              (row: {
                id: number;
                name: string;
                sourceRepo: string;
                defaultTransition: ScreenTransitionPresetId;
                mapJson: string;
                createdAt: string;
              }) => {
                try {
                  const parsed = JSON.parse(row.mapJson);
                  return {
                    id: `db-map-${row.id}`,
                    dbId: row.id,
                    name: row.name,
                    description: parsed.description || '',
                    sourceRepo: row.sourceRepo,
                    defaultTransition:
                      row.defaultTransition || 'spatial-glass-push',
                    nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
                    edges: Array.isArray(parsed.edges) ? parsed.edges : [],
                    githubMeta: parsed.githubMeta,
                    createdAt: new Date(row.createdAt).toLocaleDateString('pl-PL'),
                  } as AppScreenMapProject;
                } catch {
                  return null;
                }
              }
            )
            .filter((item: AppScreenMapProject | null): item is AppScreenMapProject =>
              Boolean(item && item.nodes.length > 0)
            );
          if (dbMaps.length > 0) {
            setCustomScreenMaps((prev) => [
              ...dbMaps,
              ...prev.filter((m) => !m.dbId),
            ]);
          }
        }
      } catch {
        // Silent fallback to local state
      }
    });
    return () => {
      window.clearTimeout(fallbackTimer);
      unsub();
    };
  }, []);

  // Studio Version History snapshots: Firestore when Firebase user is online on HTTP(S), or Local Studio AI Vault when offline / Studio AI account
  useEffect(() => {
    if (authLoading) return;
    const isOnlineHttp =
      typeof window !== 'undefined' &&
      window.location.protocol.startsWith('http') &&
      !window.__AETHER_STANDALONE_OFFLINE__ &&
      (typeof navigator === 'undefined' || navigator.onLine);

    if (user && isOnlineHttp) {
      setSnapshotsLoading(true);
      setSnapshotsError(null);

      const unsubscribeSnapshots = subscribeUserStudioSnapshots(
        user.uid,
        (records) => {
          setSnapshots(records);
          saveLocalAccountSnapshots(user.uid, records);
          setSnapshotsLoading(false);
          setSnapshotsError(null);
        },
        (friendlyErr) => {
          const cached = loadLocalAccountSnapshots(user.uid);
          if (cached.length > 0) {
            setSnapshots(cached);
          }
          setSnapshotsLoading(false);
          setSnapshotsError(friendlyErr);
        }
      );

      return () => unsubscribeSnapshots();
    }

    const activeOwnerUid = studioAccount?.uid || user?.uid;
    if (activeOwnerUid) {
      const localSnaps = loadLocalAccountSnapshots(activeOwnerUid);
      setSnapshots(localSnaps);
      setSnapshotsLoading(false);
      setSnapshotsError(null);
      return;
    }

    // Also allow embedded snapshots from standalone HTML if unlocked without account
    if (
      typeof window !== 'undefined' &&
      window.__AETHER_INITIAL_STATE__ &&
      Array.isArray(window.__AETHER_INITIAL_STATE__.snapshots)
    ) {
      setSnapshots(
        window.__AETHER_INITIAL_STATE__.snapshots as StudioSnapshotRecord[]
      );
    } else {
      setSnapshots([]);
    }
    setSnapshotsLoading(false);
    setSnapshotsError(null);
  }, [authLoading, user, studioAccount?.uid]);

  const openAuthModal = useCallback((tab: 'auth' | 'offline' = 'auth') => {
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
  }, []);

  const clearLastRecoveryCode = useCallback(() => {
    setLastRecoveryCode(null);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (
      typeof window !== 'undefined' &&
      (window.location.protocol === 'file:' || !navigator.onLine)
    ) {
      throw new Error(
        'Logowanie oknem Google OAuth wymaga trybu online (HTTPS). W pliku Offline zaloguj się lub zarejestruj Konto Studio AI.'
      );
    }
    await signInWithPopup(auth, googleAuthProvider);
  }, []);

  const signOutUser = useCallback(async () => {
    clearStoredActiveStudioSession();
    setStudioAccount(null);
    setLastRecoveryCode(null);
    tokenRef.current = null;
    try {
      if (auth.currentUser) {
        await signOut(auth);
      }
    } catch {
      // Ignore offline Firebase signout error
    }
  }, []);

  const registerStudioAccount = useCallback(
    async (params: {
      displayName: string;
      email: string;
      password: string;
      organization?: string;
      role?: string;
    }) => {
      const res = await registerStudioAiAccount(params);
      setStudioAccount(res.profile);
      setLastRecoveryCode(res.recoveryCode);
      if (res.profile.serverToken) {
        tokenRef.current = res.profile.serverToken;
      }
      const existingSnaps = loadLocalAccountSnapshots(res.profile.uid);
      setSnapshots(existingSnaps);
      return res;
    },
    []
  );

  const loginStudioAccount = useCallback(
    async (params: { email: string; password: string }) => {
      const res = await loginStudioAiAccount(params);
      setStudioAccount(res.profile);
      setLastRecoveryCode(null);
      if (res.profile.serverToken) {
        tokenRef.current = res.profile.serverToken;
      }
      if (res.workspaceBackup && typeof res.workspaceBackup === 'object') {
        applyPreferencesObject(res.workspaceBackup);
      }
      const localSnaps = loadLocalAccountSnapshots(res.profile.uid);
      setSnapshots(localSnaps);
      return res.profile;
    },
    [applyPreferencesObject]
  );

  const recoverStudioAccount = useCallback(
    async (params: {
      email: string;
      recoveryCode: string;
      newPassword: string;
    }) => {
      const profile = await recoverStudioAiAccount(params);
      setStudioAccount(profile);
      if (profile.serverToken) {
        tokenRef.current = profile.serverToken;
      }
      const localSnaps = loadLocalAccountSnapshots(profile.uid);
      setSnapshots(localSnaps);
      return profile;
    },
    []
  );

  const syncStudioWorkspaceNow = useCallback(async () => {
    if (!studioAccount) {
      return { synced: false, syncedAt: new Date().toLocaleTimeString('pl-PL') };
    }
    const payload = buildCurrentPreferencesPayload() as unknown as Record<
      string,
      unknown
    >;
    return syncStudioAccountWorkspaceToCloud(studioAccount, payload);
  }, [studioAccount, buildCurrentPreferencesPayload]);

  const downloadOfflineHtmlApp = useCallback(
    async (opts: {
      includeAccountsVault: boolean;
      keepSessionSignedIn: boolean;
      requireAuthOnBoot: boolean;
      customFileName?: string;
    }) => {
      const prefs = buildCurrentPreferencesPayload();
      return generateAndDownloadStandaloneOfflineHtml({
        preferences: prefs,
        snapshots,
        activeStudioProfile: studioAccount,
        includeAccountsVault: opts.includeAccountsVault,
        keepSessionSignedIn: opts.keepSessionSignedIn,
        requireAuthOnBoot: opts.requireAuthOnBoot,
        customFileName: opts.customFileName,
      });
    },
    [buildCurrentPreferencesPayload, snapshots, studioAccount]
  );

  const exportStudioJsonBackup = useCallback(() => {
    const prefs = buildCurrentPreferencesPayload();
    return downloadWorkspaceJsonArchive({
      preferences: prefs,
      snapshots,
      activeStudioProfile: studioAccount,
    });
  }, [buildCurrentPreferencesPayload, snapshots, studioAccount]);

  const importStudioJsonBackup = useCallback(
    (rawJson: string) => {
      const bundle = parseWorkspaceJsonArchive(rawJson);
      applyPreferencesObject(
        bundle.preferences as unknown as Record<string, unknown>
      );
      if (Array.isArray(bundle.snapshots) && bundle.snapshots.length > 0) {
        setSnapshots(bundle.snapshots);
        const ownerUid = studioAccount?.uid || user?.uid;
        if (ownerUid) {
          saveLocalAccountSnapshots(ownerUid, bundle.snapshots);
        }
      }
    },
    [applyPreferencesObject, studioAccount?.uid, user?.uid]
  );

  const pulseInteraction = useCallback((strength = 1) => {
    setInteractionEnergy((prev) => Math.min(2.5, prev + 0.45 * strength));
  }, []);

  useEffect(() => {
    if (interactionEnergy <= 0.01) return;
    const timer = window.setTimeout(() => {
      setInteractionEnergy((prev) => Math.max(0, prev * 0.82 - 0.02));
    }, 60);
    return () => window.clearTimeout(timer);
  }, [interactionEnergy]);

  const patterns = useMemo(
    () => [...BUILTIN_HAPTIC_PATTERNS, ...customPatterns],
    [customPatterns]
  );

  const updateDepth = useCallback((patch: Partial<DepthShadowSettings>) => {
    setDepth((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateSynth = useCallback((patch: Partial<SynthPatchSettings>) => {
    setSynth((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateHaptic = useCallback((patch: Partial<HapticSettings>) => {
    setHaptic((prev) => ({ ...prev, ...patch }));
    if (patch.materialHardness !== undefined) {
      const hNorm = patch.materialHardness / 100;
      setAnimation((anim) => ({
        ...anim,
        stiffness: Math.round(220 + hNorm * 460),
        damping: Math.round(18 + (1 - hNorm) * 22),
        pressScale: Number((0.945 + hNorm * 0.035).toFixed(3)),
      }));
    }
  }, []);

  const selectMaterialProfile = useCallback(
    (mat: HapticMaterialType, options?: { silent?: boolean }) => {
      const profile = MATERIAL_PROFILES[mat];
      const nextHaptic: HapticSettings = {
        ...haptic,
        material: mat,
        materialHardness: profile.defaultHardness,
        reverseClutchForce: profile.defaultReverseClutch,
      };
      setHaptic(nextHaptic);

      // Update spring physics organically to match material hardness
      const hNorm = profile.defaultHardness / 100;
      setAnimation((anim) => ({
        ...anim,
        stiffness: Math.round(220 + hNorm * 460),
        damping: Math.round(18 + (1 - hNorm) * 22),
        pressScale: Number((0.945 + hNorm * 0.035).toFixed(3)),
      }));

      // Unify selected button groups immediately
      setGroupConfigs((prev) => {
        const updated = { ...prev };
        selectedGroups.forEach((gid) => {
          updated[gid] = { ...updated[gid], material: mat };
        });
        return updated;
      });

      if (!options?.silent) {
        hapticAudio.triggerPress(synth, nextHaptic, patterns, { material: mat });
      }
      pulseInteraction(1.1);
    },
    [haptic, synth, patterns, selectedGroups, pulseInteraction]
  );

  const updateEngraving = useCallback(
    (patch: Partial<EngravingBacklightSettings>) => {
      setEngraving((prev) => ({ ...prev, ...patch }));
      if (patch.glowColor || patch.symbol) {
        setGroupConfigs((groups) => {
          const copy = { ...groups };
          selectedGroups.forEach((gid) => {
            copy[gid] = {
              ...copy[gid],
              glowColor: patch.glowColor ?? copy[gid].glowColor,
              symbol: patch.symbol ?? copy[gid].symbol,
            };
          });
          return copy;
        });
      }
    },
    [selectedGroups]
  );

  const toggleGroupSelection = useCallback((groupId: ButtonGroupId) => {
    setSelectedGroups((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    );
  }, []);

  const unifySelectedGroupsNow = useCallback(() => {
    setGroupConfigs((prev) => {
      const next = { ...prev };
      selectedGroups.forEach((gid) => {
        next[gid] = {
          material: haptic.material,
          pitchOffsetSemitones: 0,
          glowColor: engraving.glowColor,
          symbol: engraving.symbol,
        };
      });
      return next;
    });
    hapticAudio.triggerPress(synth, haptic, patterns);
    pulseInteraction(1.25);
  }, [selectedGroups, haptic, engraving, synth, patterns, pulseInteraction]);

  const importCustomPattern = useCallback(
    async (name: string, pulses: number[], description?: string) => {
      const sanitized = pulses
        .map((n) => Math.max(4, Math.min(500, Math.round(Number(n) || 16))))
        .slice(0, 24);
      if (sanitized.length === 0) return;

      const localId = `custom-${Date.now()}`;
      let dbId: number | undefined;

      if (auth.currentUser || studioAccount) {
        try {
          const resp = await authFetch('/api/studio/haptics', {
            method: 'POST',
            body: JSON.stringify({
              name,
              patternJson: JSON.stringify(sanitized),
              hardness: haptic.materialHardness,
              reverseClutch: haptic.reverseClutchForce,
            }),
          });
          if (resp.ok) {
            const saved = await resp.json();
            dbId = saved.id;
          }
        } catch {
          // Keep local pattern
        }
      }

      const newPattern: CustomHapticPattern = {
        id: dbId ? `db-haptic-${dbId}` : localId,
        dbId,
        name,
        description: description || 'Zaimportowany wzorzec użytkownika',
        pulses: sanitized,
        hardness: haptic.materialHardness,
        reverseClutch: haptic.reverseClutchForce,
        isCustom: true,
      };

      setCustomPatterns((prev) => [newPattern, ...prev]);
      setHaptic((prev) => ({ ...prev, activePatternId: newPattern.id }));
      hapticAudio.triggerVibrate(sanitized);
      pulseInteraction(1.2);
    },
    [authFetch, haptic.materialHardness, haptic.reverseClutchForce, pulseInteraction, studioAccount]
  );

  const removeCustomPattern = useCallback(
    async (id: string) => {
      const target = customPatterns.find((p) => p.id === id);
      setCustomPatterns((prev) => prev.filter((p) => p.id !== id));
      if (haptic.activePatternId === id) {
        setHaptic((prev) => ({ ...prev, activePatternId: 'crystal-ripple' }));
      }
      if (target?.dbId && auth.currentUser) {
        try {
          await authFetch(`/api/studio/haptics/${target.dbId}`, { method: 'DELETE' });
        } catch {
          // Ignore
        }
      }
    },
    [customPatterns, haptic.activePatternId, authFetch]
  );

  const saveCurrentPreset = useCallback(
    async (name: string) => {
      const cleanName = name.trim() || `Preset ${savedPresets.length + 1}`;
      let dbId: number | undefined;

      if (auth.currentUser) {
        try {
          const resp = await authFetch('/api/studio/presets', {
            method: 'POST',
            body: JSON.stringify({
              name: cleanName,
              materialType: haptic.material,
              configJson: JSON.stringify({ synth, haptic }),
            }),
          });
          if (resp.ok) {
            const created = await resp.json();
            dbId = created.id;
          }
        } catch {
          // Keep local
        }
      }

      const newPreset: SavedSynthPreset = {
        id: dbId ? `db-preset-${dbId}` : `local-preset-${Date.now()}`,
        dbId,
        name: cleanName,
        materialType: haptic.material,
        synth: { ...synth },
        haptic: { ...haptic },
      };

      setSavedPresets((prev) => [newPreset, ...prev]);
      hapticAudio.triggerPress(synth, haptic, patterns);
    },
    [savedPresets.length, authFetch, haptic, synth, patterns]
  );

  const loadSavedPreset = useCallback(
    (preset: SavedSynthPreset) => {
      const normalizedSynth = {
        ...preset.synth,
        baseFrequency:
          preset.synth.baseFrequency >= 160
            ? 86
            : Math.max(36, Math.min(158, preset.synth.baseFrequency)),
      };
      setSynth(normalizedSynth);
      setHaptic(preset.haptic);
      hapticAudio.triggerPress(normalizedSynth, preset.haptic, patterns);
      pulseInteraction(1.1);
    },
    [patterns, pulseInteraction]
  );

  const removeSavedPreset = useCallback(
    async (id: string) => {
      const target = savedPresets.find((p) => p.id === id);
      setSavedPresets((prev) => prev.filter((p) => p.id !== id));
      if (target?.dbId && auth.currentUser) {
        try {
          await authFetch(`/api/studio/presets/${target.dbId}`, { method: 'DELETE' });
        } catch {
          // Ignore
        }
      }
    },
    [savedPresets, authFetch]
  );

  const addSourcePrompt = useCallback(
    async (
      title: string,
      category: string,
      promptText: string,
      sourceConfig: Record<string, unknown>
    ) => {
      const configStr = JSON.stringify(sourceConfig, null, 2);
      let dbId: number | undefined;
      if (auth.currentUser) {
        try {
          const resp = await authFetch('/api/studio/prompts', {
            method: 'POST',
            body: JSON.stringify({
              title,
              category,
              promptText,
              sourceConfigJson: configStr,
            }),
          });
          if (resp.ok) {
            const saved = await resp.json();
            dbId = saved.id;
          }
        } catch {
          // Keep local
        }
      }

      const item: SourcePromptItem = {
        id: dbId ? `db-prompt-${dbId}` : `local-prompt-${Date.now()}`,
        dbId,
        title,
        category,
        promptText,
        sourceConfigJson: configStr,
        createdAt: new Date().toLocaleDateString('pl-PL'),
      };
      setSourcePrompts((prev) => [item, ...prev]);
    },
    [authFetch]
  );

  const removeSourcePrompt = useCallback(
    async (id: string) => {
      const target = sourcePrompts.find((p) => p.id === id);
      setSourcePrompts((prev) => prev.filter((p) => p.id !== id));
      if (target?.dbId && auth.currentUser) {
        try {
          await authFetch(`/api/studio/prompts/${target.dbId}`, { method: 'DELETE' });
        } catch {
          // Ignore
        }
      }
    },
    [sourcePrompts, authFetch]
  );

  const addMediaAsset = useCallback(
    async (item: Omit<StudioMediaItem, 'id'>) => {
      let dbId: number | undefined;
      if (auth.currentUser) {
        try {
          const resp = await authFetch('/api/studio/media', {
            method: 'POST',
            body: JSON.stringify({
              title: item.title,
              mediaType: item.mediaType,
              aspectRatio: item.aspectRatio,
              resolution: item.resolution,
              prompt: item.prompt,
              dataUrl: item.src,
            }),
          });
          if (resp.ok) {
            const saved = await resp.json();
            dbId = saved.id;
          }
        } catch {
          // Keep local
        }
      }

      const created: StudioMediaItem = {
        ...item,
        id: dbId ? `db-media-${dbId}` : `local-media-${Date.now()}`,
        dbId,
      };
      setMediaLibrary((prev) => [created, ...prev]);
    },
    [authFetch]
  );

  const removeMediaAsset = useCallback(
    async (id: string) => {
      const target = mediaLibrary.find((m) => m.id === id);
      setMediaLibrary((prev) => prev.filter((m) => m.id !== id));
      if (target?.dbId && auth.currentUser) {
        try {
          await authFetch(`/api/studio/media/${target.dbId}`, { method: 'DELETE' });
        } catch {
          // Ignore
        }
      }
    },
    [mediaLibrary, authFetch]
  );

  const applyRenderPreset = useCallback(
    (preset: RenderPresetItem) => {
      setPalette(preset.palette);
      setDepth(preset.depth);
      selectMaterialProfile(preset.material, { silent: true });
    },
    [selectMaterialProfile]
  );

  const applyButtonMotionPreset = useCallback(
    (presetId: ButtonMotionPresetId) => {
      const spec =
        BUTTON_MOTION_PRESETS.find((p) => p.id === presetId) || BUTTON_MOTION_PRESETS[0];
      setAnimation((prev) => ({
        ...prev,
        motionPreset: spec.id,
        stiffness: spec.stiffness,
        damping: spec.damping,
        mass: spec.mass,
        pressScale: spec.pressScale,
        aiNote: `${spec.name}: ${spec.description}`,
      }));
      hapticAudio.triggerPress(synth, haptic, patterns);
      pulseInteraction(1.05);
    },
    [synth, haptic, patterns, pulseInteraction]
  );

  const applyButtonIlluminationPreset = useCallback(
    (presetId: ButtonIlluminationPresetId, syncColor = false) => {
      const spec =
        BUTTON_ILLUMINATION_PRESETS.find((p) => p.id === presetId) ||
        BUTTON_ILLUMINATION_PRESETS[0];
      setAnimation((prev) => ({
        ...prev,
        illuminationPreset: spec.id,
        glowSpread: spec.glowSpread,
      }));
      setEngraving((prev) => ({
        ...prev,
        glowEnabled: true,
        glowColor: syncColor ? spec.defaultColor : prev.glowColor,
      }));
      hapticAudio.triggerPress(synth, haptic, patterns);
      pulseInteraction(1.05);
    },
    [synth, haptic, patterns, pulseInteraction]
  );

  const savedCalibrations = useMemo(
    () => [...customCalibrations, ...ROTARY_DRIVER_FACTORY_PROFILES],
    [customCalibrations]
  );

  const updateDriverCalibration = useCallback(
    (patch: Partial<RotaryDriverCalibrationConfig>) => {
      setDriverCalibration((prev) => {
        const next = { ...prev, ...patch };
        if (next.lowBodyFreqHz >= 160 || next.lowBodyFreqHz < 34) {
          next.lowBodyFreqHz = Math.max(36, Math.min(156, next.lowBodyFreqHz));
        }
        return next;
      });
    },
    []
  );

  const saveDriverCalibrationProfile = useCallback(
    async (name: string, controllerModel = 'CNC Radial Spun-Metal 270°') => {
      const cleanName =
        name.trim() || `Kalibracja CNC #${customCalibrations.length + 1}`;
      let dbId: number | undefined;

      if (auth.currentUser) {
        try {
          const resp = await authFetch('/api/studio/calibrations', {
            method: 'POST',
            body: JSON.stringify({
              name: cleanName,
              controllerModel,
              calibrationJson: JSON.stringify(driverCalibration),
            }),
          });
          if (resp.ok) {
            const saved = await resp.json();
            dbId = saved.id;
          }
        } catch {
          // Keep local calibration profile
        }
      }

      const created: SavedDriverCalibrationProfile = {
        id: dbId ? `db-cal-${dbId}` : `local-cal-${Date.now()}`,
        dbId,
        name: cleanName,
        controllerModel,
        config: { ...driverCalibration },
        createdAt: new Date().toLocaleDateString('pl-PL'),
      };

      setCustomCalibrations((prev) => [created, ...prev]);
      hapticAudio.triggerCalibratedRotaryAxialPush(driverCalibration, 'press');
      pulseInteraction(1.1);
    },
    [customCalibrations.length, authFetch, driverCalibration, pulseInteraction]
  );

  const loadDriverCalibrationProfile = useCallback(
    (profile: SavedDriverCalibrationProfile) => {
      const safeCfg: RotaryDriverCalibrationConfig = {
        ...profile.config,
        lowBodyFreqHz: Math.max(36, Math.min(156, profile.config.lowBodyFreqHz)),
      };
      setDriverCalibration(safeCfg);
      hapticAudio.triggerCalibratedRotaryDetent(safeCfg, 0.5, true, 0.25);
      pulseInteraction(1.05);
    },
    [pulseInteraction]
  );

  const removeDriverCalibrationProfile = useCallback(
    async (id: string) => {
      const target = customCalibrations.find((c) => c.id === id);
      if (!target) return;
      setCustomCalibrations((prev) => prev.filter((c) => c.id !== id));
      if (target.dbId && auth.currentUser) {
        try {
          await authFetch(`/api/studio/calibrations/${target.dbId}`, {
            method: 'DELETE',
          });
        } catch {
          // Ignore
        }
      }
    },
    [customCalibrations, authFetch]
  );

  const runDriverCalibrationService = useCallback(
    async (
      targetCharacter: CalibrationTargetCharacter
    ): Promise<DriverCalibrationReport | null> => {
      try {
        const resp = await studioApiFetch('/api/driver-calibration/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config: driverCalibration,
            targetCharacter,
          }),
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        if (data.calibratedConfig) {
          setDriverCalibration(data.calibratedConfig);
        }
        if (data.report) {
          setCalibrationReport(data.report);
          return data.report as DriverCalibrationReport;
        }
        return null;
      } catch {
        const stepAngleDeg = Number(
          (driverCalibration.sweepAngleDeg / driverCalibration.detentCount).toFixed(2)
        );
        const fallbackReport: DriverCalibrationReport = {
          stepAngleDeg,
          maxCleanSpeedDegPerSec: Math.round(
            stepAngleDeg / Math.max(0.008, (driverCalibration.tickPulseMs + 6) / 1000)
          ),
          minorImpulseIndex: Number(
            (
              (driverCalibration.rotaryHapticStrength / 100) *
              driverCalibration.tickPulseMs *
              0.12
            ).toFixed(2)
          ),
          majorImpulseIndex: Number(
            (
              (driverCalibration.rotaryHapticStrength / 100) *
              driverCalibration.tickPulseMs *
              0.12 *
              driverCalibration.majorTickAccent
            ).toFixed(2)
          ),
          verifiedSub160Hz: driverCalibration.lowBodyFreqHz < 160,
          acousticBalanceScore: 94,
          recommendation: `Skalibrowano lokalnie podziałkę ${driverCalibration.detentCount} zapadek (${stepAngleDeg}°/krok) z tonem korpusu ${driverCalibration.lowBodyFreqHz} Hz (<160 Hz).`,
          calibratedAt: new Date().toLocaleTimeString('pl-PL'),
        };
        setCalibrationReport(fallbackReport);
        return fallbackReport;
      }
    },
    [driverCalibration]
  );

  const savedScreenMaps = useMemo(
    () => [...customScreenMaps, DEFAULT_AETHER_SCREEN_MAP],
    [customScreenMaps]
  );

  const setActiveScreenTransition = useCallback(
    (presetId: ScreenTransitionPresetId) => {
      setActiveScreenTransitionState(presetId);
      setActiveScreenMap((prev) => ({
        ...prev,
        defaultTransition: presetId,
      }));
      hapticAudio.triggerPress(synth, haptic, patterns);
      pulseInteraction(1.0);
    },
    [synth, haptic, patterns, pulseInteraction]
  );

  const saveActiveScreenMap = useCallback(
    async (customName?: string) => {
      const cleanName =
        (customName ?? activeScreenMap.name).trim() ||
        `Mapa Ekranów #${customScreenMaps.length + 1}`;
      let dbId: number | undefined;

      const mapPayload = {
        description: activeScreenMap.description,
        nodes: activeScreenMap.nodes,
        edges: activeScreenMap.edges,
        githubMeta: activeScreenMap.githubMeta,
      };

      if (auth.currentUser) {
        try {
          const resp = await authFetch('/api/studio/screen-maps', {
            method: 'POST',
            body: JSON.stringify({
              name: cleanName,
              sourceRepo: activeScreenMap.sourceRepo || 'manual',
              defaultTransition: activeScreenMap.defaultTransition,
              mapJson: JSON.stringify(mapPayload),
            }),
          });
          if (resp.ok) {
            const created = await resp.json();
            dbId = created.id;
          }
        } catch {
          // Keep local screen map
        }
      }

      const savedItem: AppScreenMapProject = {
        ...activeScreenMap,
        id: dbId ? `db-map-${dbId}` : `local-map-${Date.now()}`,
        dbId,
        name: cleanName,
        createdAt: new Date().toLocaleDateString('pl-PL'),
      };

      setActiveScreenMap(savedItem);
      setCustomScreenMaps((prev) => [savedItem, ...prev]);
      hapticAudio.triggerPress(synth, haptic, patterns);
      pulseInteraction(1.1);
    },
    [activeScreenMap, customScreenMaps.length, authFetch, synth, haptic, patterns, pulseInteraction]
  );

  const loadScreenMapProject = useCallback(
    (project: AppScreenMapProject) => {
      setActiveScreenMap(project);
      setActiveScreenTransitionState(project.defaultTransition);
      hapticAudio.triggerPress(synth, haptic, patterns);
      pulseInteraction(1.05);
    },
    [synth, haptic, patterns, pulseInteraction]
  );

  const removeScreenMapProject = useCallback(
    async (id: string) => {
      const target = customScreenMaps.find((m) => m.id === id);
      if (!target) return;
      setCustomScreenMaps((prev) => prev.filter((m) => m.id !== id));
      if (activeScreenMap.id === id) {
        setActiveScreenMap(DEFAULT_AETHER_SCREEN_MAP);
      }
      if (target.dbId && auth.currentUser) {
        try {
          await authFetch(`/api/studio/screen-maps/${target.dbId}`, {
            method: 'DELETE',
          });
        } catch {
          // Ignore
        }
      }
    },
    [customScreenMaps, activeScreenMap.id, authFetch]
  );

  const designScreenMapFromGitHub = useCallback(
    async (repoInput: string, appGoal?: string): Promise<AppScreenMapProject> => {
      const resp = await studioApiFetch('/api/screen-map/from-github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoInput, appGoal }),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.mapProject) {
        throw new Error(
          data?.error || 'Nie udało się wygenerować mapy aplikacji z repozytorium GitHub.'
        );
      }
      const generated = data.mapProject as AppScreenMapProject;
      setActiveScreenMap(generated);
      setActiveScreenTransitionState(generated.defaultTransition);
      setCustomScreenMaps((prev) => [generated, ...prev]);
      hapticAudio.triggerPress(synth, haptic, patterns);
      pulseInteraction(1.25);
      return generated;
    },
    [synth, haptic, patterns, pulseInteraction]
  );

  const generatePlanAndMatrixFromFile = useCallback(
    async (
      payload: FileUploadPlanRequestPayload
    ): Promise<{
      mapProject: AppScreenMapProject;
      buildMatrix: UploadedFileBuildPlan;
    }> => {
      const resp = await studioApiFetch('/api/screen-map/from-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.mapProject || !data?.buildMatrix) {
        throw new Error(
          data?.error ||
            'Nie udało się przeanalizować pliku i przygotować planu ekranów oraz matrycy budowy.'
        );
      }

      const generatedMap = data.mapProject as AppScreenMapProject;
      const generatedMatrix = data.buildMatrix as UploadedFileBuildPlan;

      setActiveScreenMap(generatedMap);
      setActiveScreenTransitionState(generatedMap.defaultTransition);
      setCustomScreenMaps((prev) => [generatedMap, ...prev]);

      setActiveBuildMatrix(generatedMatrix);
      setSavedBuildMatrices((prev) => [
        generatedMatrix,
        ...prev.filter((m) => m.id !== generatedMatrix.id).slice(0, 14),
      ]);

      hapticAudio.triggerPress(synth, haptic, patterns);
      pulseInteraction(1.3);

      return { mapProject: generatedMap, buildMatrix: generatedMatrix };
    },
    [synth, haptic, patterns, pulseInteraction]
  );

  const generateFullFrontendFromUploadedFile = useCallback(
    async (
      file: File,
      options?: {
        projectGoal?: string;
        targetType?: FileBuildTargetType;
      }
    ): Promise<{
      mapProject: AppScreenMapProject;
      buildMatrix: UploadedFileBuildPlan;
      createdElements: GeneratedCompleteElement[];
    }> => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const rawMime = (file.type || '').toLowerCase();
      const isImage =
        rawMime.startsWith('image/') ||
        ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext);
      const isPdf = rawMime === 'application/pdf' || ext === 'pdf';

      let mimeType = rawMime || 'text/plain';
      let base64Data: string | undefined;
      let textContent: string | undefined;
      let thumbDataUrl: string | undefined;
      let payloadByteSize = file.size;

      if (isImage) {
        const imgState = await readImageFileToWorkingState(file);
        setWorkingFrontendImage(imgState);
        mimeType = imgState.mimeType;
        thumbDataUrl = imgState.dataUrl;
        base64Data = imgState.dataUrl.includes(',')
          ? imgState.dataUrl.split(',')[1] || ''
          : imgState.dataUrl;
        payloadByteSize = Math.max(
          1024,
          (imgState.compressedSizeKb || Math.round(file.size / 1024)) * 1024
        );
        setAttachedPromptGraphics((prev) => {
          const filtered = prev.filter((g) => g.name !== imgState.fileName);
          const nextEntry: PromptReferenceGraphic = {
            id: `gfx_${Date.now()}`,
            name: imgState.fileName,
            mimeType: imgState.mimeType,
            dataUrl: imgState.dataUrl,
            role: 'uklad-ekranu',
            addedAt: new Date().toLocaleTimeString('pl-PL', {
              hour: '2-digit',
              minute: '2-digit',
            }),
          };
          return [nextEntry, ...filtered].slice(0, 6);
        });
      } else if (isPdf) {
        mimeType = 'application/pdf';
        const pdfDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () =>
            reject(new Error('Nie udało się odczytać dokumentu PDF z dysku.'));
          reader.readAsDataURL(file);
        });
        base64Data = pdfDataUrl.includes(',')
          ? pdfDataUrl.split(',')[1] || ''
          : pdfDataUrl;
      } else {
        if (ext === 'md' || ext === 'markdown') mimeType = 'text/markdown';
        else if (ext === 'json') mimeType = 'application/json';
        else if (ext === 'csv') mimeType = 'text/csv';
        else if (ext === 'html' || ext === 'htm') mimeType = 'text/html';
        else mimeType = 'text/plain';

        textContent = await file.text();
      }

      const { mapProject, buildMatrix } = await generatePlanAndMatrixFromFile({
        fileName: file.name,
        mimeType,
        fileSize: payloadByteSize,
        base64Data,
        textContent,
        projectGoal:
          options?.projectGoal?.trim() ||
          `Kompletny interaktywny frontend na podstawie pliku ${file.name}`,
        targetType: options?.targetType || 'website-and-webapp',
      });

      const entryNode = mapProject.nodes[0];
      const entryScreenId = entryNode?.id || 'scr-dashboard';
      setActivePreviewScreenId(entryScreenId);

      const firstWebRow = buildMatrix.websiteMatrix[0];
      const firstAppRow = buildMatrix.webAppMatrix[0];
      const nowTime = new Date().toLocaleTimeString('pl-PL', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const tsBase = Date.now();

      const headerEl: GeneratedCompleteElement = {
        id: `el_${tsBase}_hdr`,
        name: firstWebRow?.sectionName || `Hero — ${buildMatrix.projectTitle}`,
        fileName: 'FrontendHeroSection.tsx',
        targetScreenId: entryScreenId,
        targetZone: 'header',
        categoryLabel: 'Sekcja Wiodąca (Hero)',
        summary: buildMatrix.executiveSummary,
        headline: buildMatrix.projectTitle,
        subheadline:
          entryNode?.summary ||
          firstWebRow?.conversionGoal ||
          buildMatrix.executiveSummary,
        accentHex: '#4F46E5',
        referenceThumbUrl: thumbDataUrl,
        controls: [
          {
            id: `cta_${tsBase}_1`,
            kind: 'primary-cta',
            label:
              firstWebRow?.keyComponents?.[0] ||
              `Otwórz moduł: ${entryNode?.title || 'Start'}`,
          },
          {
            id: `met_${tsBase}_1`,
            kind: 'metric-tile',
            label: 'Widoki w architekturze',
            valueText: `${mapProject.nodes.length} ekranów`,
          },
          {
            id: `met_${tsBase}_2`,
            kind: 'metric-tile',
            label: 'Sekcje i moduły',
            valueText: `${buildMatrix.websiteMatrix.length + buildMatrix.webAppMatrix.length}`,
          },
        ],
        reactTailwindCode: `import React from 'react';

export default function FrontendHeroSection() {
  return (
    <section className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
      <div className="text-xs text-slate-500 font-mono">${entryNode?.route || '/'}</div>
      <h1 className="text-2xl font-bold tracking-tight">${buildMatrix.projectTitle.replace(/"/g, '')}</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300">${(entryNode?.summary || buildMatrix.executiveSummary).replace(/"/g, '')}</p>
      <button type="button" className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold">
        Rozpocznij pracę
      </button>
    </section>
  );
}`,
        compiledPromptUsed: buildMatrix.masterBuildPrompt,
        createdAt: nowTime,
      };

      const mainEl: GeneratedCompleteElement = {
        id: `el_${tsBase}_main`,
        name: firstAppRow?.moduleName || `Kokpit Operacyjny — ${entryNode?.title || 'Główny'}`,
        fileName: 'FrontendWorkspaceModule.tsx',
        targetScreenId: entryScreenId,
        targetZone: 'main',
        categoryLabel: 'Moduł Interaktywny Aplikacji',
        summary:
          firstAppRow?.stateAndDataFlow ||
          'Główna przestrzeń robocza wygenerowana z wgranego pliku.',
        headline:
          firstAppRow?.moduleName ||
          `Moduł Główny: ${entryNode?.title || buildMatrix.projectTitle}`,
        subheadline:
          firstAppRow?.acceptanceCriteria ||
          firstWebRow?.visualAndTactileSpec ||
          'Sterowanie parametrami w czasie rzeczywistym z synchronizacją odcieni.',
        accentHex: '#0EA5E9',
        controls: [
          {
            id: `sld_${tsBase}_1`,
            kind: 'slider',
            label: firstAppRow?.uiComponents?.[0] || 'Intensywność widoku i filtracji',
          },
          {
            id: `tgl_${tsBase}_1`,
            kind: 'toggle',
            label: firstAppRow?.uiComponents?.[1] || 'Synchronizacja danych na żywo',
          },
          {
            id: `met_${tsBase}_3`,
            kind: 'metric-tile',
            label: 'Rola użytkownika',
            valueText: firstAppRow?.userRole || entryNode?.role || 'Operator',
          },
          {
            id: `cta_${tsBase}_2`,
            kind: 'primary-cta',
            label: `Zatwierdź i przejdź dalej (${mapProject.nodes[1]?.title || 'Kolejny widok'})`,
          },
        ],
        reactTailwindCode: `import React, { useState } from 'react';

export default function FrontendWorkspaceModule() {
  const [level, setLevel] = useState(72);
  const [liveSync, setLiveSync] = useState(true);

  return (
    <section className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
      <h2 className="text-lg font-semibold">${(firstAppRow?.moduleName || entryNode?.title || 'Moduł Główny').replace(/"/g, '')}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 block space-y-1.5 text-xs">
          <div className="flex justify-between"><span>Poziom parametru</span><span className="font-mono">{level}%</span></div>
          <input type="range" min={0} max={100} value={level} onChange={(e) => setLevel(Number(e.target.value))} className="w-full" />
        </label>
        <button type="button" onClick={() => setLiveSync(!liveSync)} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-medium">
          <span>Synchronizacja</span>
          <span className="font-mono">{liveSync ? 'Aktywna' : 'Wstrzymana'}</span>
        </button>
      </div>
    </section>
  );
}`,
        compiledPromptUsed: buildMatrix.masterBuildPrompt,
        createdAt: nowTime,
      };

      const footerEl: GeneratedCompleteElement = {
        id: `el_${tsBase}_ftr`,
        name:
          buildMatrix.websiteMatrix[1]?.sectionName ||
          'Pasek Nawigacji i Szybkiego Eksportu',
        fileName: 'FrontendActionFooter.tsx',
        targetScreenId: entryScreenId,
        targetZone: 'footer',
        categoryLabel: 'Dolna Strefa Konwersji',
        summary: 'Szybkie przejścia między ekranami i akcje podsumowujące.',
        headline:
          buildMatrix.websiteMatrix[1]?.sectionName ||
          'Szybkie Przejścia i Podsumowanie Ścieżki',
        subheadline:
          buildMatrix.websiteMatrix[1]?.conversionGoal ||
          `Gotowe połączenia nawigacyjne dla ${mapProject.edges.length} przepływów w aplikacji.`,
        accentHex: '#10B981',
        controls: [
          {
            id: `tgl_${tsBase}_2`,
            kind: 'toggle',
            label: 'Walidacja formularzy i stanów',
          },
          {
            id: `met_${tsBase}_4`,
            kind: 'metric-tile',
            label: 'Przepływy DAG',
            valueText: `${mapProject.edges.length} połączeń`,
          },
        ],
        reactTailwindCode: `import React from 'react';

export default function FrontendActionFooter() {
  return (
    <footer className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
      <span>Gotowy przepływ wieloekranowy</span>
      <span className="font-mono">${mapProject.nodes.length} widoków · ${mapProject.edges.length} krawędzi</span>
    </footer>
  );
}`,
        compiledPromptUsed: buildMatrix.masterBuildPrompt,
        createdAt: nowTime,
      };

      const createdElements = [headerEl, mainEl, footerEl];

      setGeneratedElements((prev) => [
        ...createdElements,
        ...prev.filter((e) => e.targetScreenId !== entryScreenId),
      ]);

      const shadeHdr = FRONTEND_ELEMENT_SHADE_ORDER[0];
      const shadeMain = FRONTEND_ELEMENT_SHADE_ORDER[1];
      const shadeFtr = FRONTEND_ELEMENT_SHADE_ORDER[2];

      setComposedElementShades((prev) => ({
        ...prev,
        [headerEl.id]: shadeHdr,
        [mainEl.id]: shadeMain,
        [footerEl.id]: shadeFtr,
      }));

      setActiveModifiedElement({
        id: mainEl.id,
        kind: 'generated',
        label: mainEl.name,
        zone: 'main',
        screenId: entryScreenId,
        shadeId: shadeMain,
        sourceSurface: `Wygenerowano kompletny frontend z pliku ${file.name}`,
        updatedAtMs: Date.now(),
      });

      hapticAudio.triggerPress(synth, haptic, patterns, { pitchSemitones: 6 });
      pulseInteraction(1.35);

      return { mapProject, buildMatrix, createdElements };
    },
    [generatePlanAndMatrixFromFile, synth, haptic, patterns, pulseInteraction]
  );

  const selectSavedBuildMatrix = useCallback(
    (matrix: UploadedFileBuildPlan) => {
      setActiveBuildMatrix(matrix);
      const linkedMap = customScreenMaps.find(
        (m) => m.id === matrix.linkedScreenMapId
      );
      if (linkedMap) {
        setActiveScreenMap(linkedMap);
        setActiveScreenTransitionState(linkedMap.defaultTransition);
      }
      hapticAudio.triggerPress(synth, haptic, patterns);
      pulseInteraction(1.05);
    },
    [customScreenMaps, synth, haptic, patterns, pulseInteraction]
  );

  const removeSavedBuildMatrix = useCallback(
    (id: string) => {
      setSavedBuildMatrices((prev) => {
        const remaining = prev.filter((item) => item.id !== id);
        if (activeBuildMatrix?.id === id) {
          setActiveBuildMatrix(remaining[0] || null);
        }
        return remaining;
      });
      hapticAudio.triggerPress(synth, haptic, patterns);
    },
    [activeBuildMatrix?.id, synth, haptic, patterns]
  );

  const currentSnapshotBundle = useMemo(
    () =>
      buildSanitizedStudioSnapshotState({
        palette,
        activeScreenTransition,
        selectedGroups,
        depth,
        synth,
        haptic,
        engraving,
        animation,
        groupConfigs,
        driverCalibration,
        activeScreenMap,
      }),
    [
      palette,
      activeScreenTransition,
      selectedGroups,
      depth,
      synth,
      haptic,
      engraving,
      animation,
      groupConfigs,
      driverCalibration,
      activeScreenMap,
    ]
  );

  const createStudioSnapshot = useCallback(
    async (params: {
      label: string;
      note?: string;
      versionTag?: string;
      isPinned?: boolean;
    }) => {
      const isOnlineHttp =
        typeof window !== 'undefined' &&
        window.location.protocol.startsWith('http') &&
        !window.__AETHER_STANDALONE_OFFLINE__ &&
        (typeof navigator === 'undefined' || navigator.onLine);

      const ownerUid = user?.uid || studioAccount?.uid;
      if (!ownerUid) {
        throw new Error(
          'Zaloguj się na Konto Studio AI (lub Google), aby zapisywać migawki w Historii wersji.'
        );
      }
      setSnapshotsError(null);
      const nextVersionTag = normalizeVersionTag(
        params.versionTag,
        snapshots.length
      );

      if (user && isOnlineHttp) {
        try {
          const createdId = await createStudioSnapshotInFirestore({
            ownerId: user.uid,
            label: params.label,
            note: params.note || '',
            versionTag: nextVersionTag,
            isPinned: Boolean(params.isPinned),
            summary: currentSnapshotBundle.summary,
            state: currentSnapshotBundle.state,
          });
          setActiveRestoredSnapshotId(createdId);
          hapticAudio.triggerPress(synth, haptic, patterns);
          pulseInteraction(1.15);
          return;
        } catch (err) {
          const msg = formatFirestoreQuotaOrErrorMessage(err);
          setSnapshotsError(msg);
          throw err;
        }
      }

      // Offline / Studio AI Account Vault snapshot persistence
      const now = new Date();
      const localRecord: StudioSnapshotRecord = {
        id: `snap_off_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        ownerId: ownerUid,
        label: params.label.trim() || 'Migawka Studio Offline',
        note: (params.note || '').trim(),
        versionTag: nextVersionTag,
        isPinned: Boolean(params.isPinned),
        summary: currentSnapshotBundle.summary,
        state: currentSnapshotBundle.state,
        createdAtMs: now.getTime(),
        updatedAtMs: now.getTime(),
        createdAtFormatted: now.toLocaleString('pl-PL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
      setSnapshots((prev) => {
        const nextList = [localRecord, ...prev].sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return b.createdAtMs - a.createdAtMs;
        });
        saveLocalAccountSnapshots(ownerUid, nextList);
        return nextList;
      });
      setActiveRestoredSnapshotId(localRecord.id);
      hapticAudio.triggerPress(synth, haptic, patterns);
      pulseInteraction(1.15);
    },
    [
      user,
      studioAccount?.uid,
      snapshots.length,
      currentSnapshotBundle,
      synth,
      haptic,
      patterns,
      pulseInteraction,
    ]
  );

  const restoreStudioSnapshot = useCallback(
    (snapshot: StudioSnapshotRecord) => {
      const s = snapshot.state;
      const safeBaseFreq = Math.max(
        36,
        Math.min(158, Number(s.synth?.baseFrequency) || 86)
      );
      const restoredSynth: SynthPatchSettings = {
        ...DEFAULT_SYNTH,
        ...s.synth,
        baseFrequency: safeBaseFreq,
      };
      const restoredHaptic: HapticSettings = {
        ...DEFAULT_HAPTIC,
        ...s.haptic,
      };
      const restoredDriver: RotaryDriverCalibrationConfig = {
        ...DEFAULT_ROTARY_DRIVER_CALIBRATION,
        ...s.driverCalibration,
        lowBodyFreqHz: Math.max(
          36,
          Math.min(156, Number(s.driverCalibration?.lowBodyFreqHz) || 74)
        ),
      };

      setPalette(s.palette || 'pearl-flebologia');
      setDepth({ ...DEFAULT_DEPTH, ...s.depth });
      setSynth(restoredSynth);
      setHaptic(restoredHaptic);
      setEngraving({ ...DEFAULT_ENGRAVING, ...s.engraving });
      setAnimation({ ...DEFAULT_ANIMATION, ...s.animation });
      if (Array.isArray(s.selectedGroups)) {
        setSelectedGroups(s.selectedGroups);
      }
      if (s.groupConfigs) {
        setGroupConfigs({ ...DEFAULT_GROUPS, ...s.groupConfigs });
      }
      setDriverCalibration(restoredDriver);

      const validTrans = SCREEN_TRANSITION_PRESETS.some(
        (p) => p.id === s.activeScreenTransition
      )
        ? s.activeScreenTransition
        : 'spatial-glass-push';
      setActiveScreenTransitionState(validTrans);

      if (s.screenMap && Array.isArray(s.screenMap.nodes) && s.screenMap.nodes.length > 0) {
        setActiveScreenMap({
          id: s.screenMap.id,
          name: s.screenMap.name,
          description: s.screenMap.description,
          sourceRepo: s.screenMap.sourceRepo,
          defaultTransition: s.screenMap.defaultTransition || validTrans,
          nodes: s.screenMap.nodes,
          edges: Array.isArray(s.screenMap.edges) ? s.screenMap.edges : [],
          githubMeta: s.screenMap.githubMeta,
          createdAt: snapshot.createdAtFormatted,
        });
      }

      setActiveRestoredSnapshotId(snapshot.id);
      hapticAudio.triggerPress(restoredSynth, restoredHaptic, patterns);
      pulseInteraction(1.25);
    },
    [patterns, pulseInteraction]
  );

  const togglePinStudioSnapshot = useCallback(
    async (snapshot: StudioSnapshotRecord) => {
      setSnapshotsError(null);
      const isOnlineHttp =
        typeof window !== 'undefined' &&
        window.location.protocol.startsWith('http') &&
        !window.__AETHER_STANDALONE_OFFLINE__ &&
        (typeof navigator === 'undefined' || navigator.onLine);
      const ownerUid = studioAccount?.uid || user?.uid;

      if (user && isOnlineHttp && !snapshot.id.startsWith('snap_off_')) {
        try {
          await toggleStudioSnapshotPinInFirestore(snapshot.id, !snapshot.isPinned);
          hapticAudio.triggerPress(synth, haptic, patterns);
          return;
        } catch (err) {
          setSnapshotsError(formatFirestoreQuotaOrErrorMessage(err));
          return;
        }
      }

      setSnapshots((prev) => {
        const updated = prev
          .map((s) =>
            s.id === snapshot.id
              ? { ...s, isPinned: !s.isPinned, updatedAtMs: Date.now() }
              : s
          )
          .sort((a, b) => {
            if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
            return b.createdAtMs - a.createdAtMs;
          });
        if (ownerUid) saveLocalAccountSnapshots(ownerUid, updated);
        return updated;
      });
      hapticAudio.triggerPress(synth, haptic, patterns);
    },
    [user, studioAccount?.uid, synth, haptic, patterns]
  );

  const renameStudioSnapshot = useCallback(
    async (snapshotId: string, label: string, note: string) => {
      setSnapshotsError(null);
      const isOnlineHttp =
        typeof window !== 'undefined' &&
        window.location.protocol.startsWith('http') &&
        !window.__AETHER_STANDALONE_OFFLINE__ &&
        (typeof navigator === 'undefined' || navigator.onLine);
      const ownerUid = studioAccount?.uid || user?.uid;

      if (user && isOnlineHttp && !snapshotId.startsWith('snap_off_')) {
        try {
          await updateStudioSnapshotMetadataInFirestore(snapshotId, label, note);
          hapticAudio.triggerPress(synth, haptic, patterns);
          return;
        } catch (err) {
          setSnapshotsError(formatFirestoreQuotaOrErrorMessage(err));
          return;
        }
      }

      setSnapshots((prev) => {
        const updated = prev.map((s) =>
          s.id === snapshotId ? { ...s, label, note, updatedAtMs: Date.now() } : s
        );
        if (ownerUid) saveLocalAccountSnapshots(ownerUid, updated);
        return updated;
      });
      hapticAudio.triggerPress(synth, haptic, patterns);
    },
    [user, studioAccount?.uid, synth, haptic, patterns]
  );

  const deleteStudioSnapshot = useCallback(
    async (snapshotId: string) => {
      setSnapshotsError(null);
      const isOnlineHttp =
        typeof window !== 'undefined' &&
        window.location.protocol.startsWith('http') &&
        !window.__AETHER_STANDALONE_OFFLINE__ &&
        (typeof navigator === 'undefined' || navigator.onLine);
      const ownerUid = studioAccount?.uid || user?.uid;

      if (user && isOnlineHttp && !snapshotId.startsWith('snap_off_')) {
        try {
          await deleteStudioSnapshotFromFirestore(snapshotId);
          if (activeRestoredSnapshotId === snapshotId) {
            setActiveRestoredSnapshotId(null);
          }
          hapticAudio.triggerPress(synth, haptic, patterns);
          return;
        } catch (err) {
          setSnapshotsError(formatFirestoreQuotaOrErrorMessage(err));
          return;
        }
      }

      setSnapshots((prev) => {
        const updated = prev.filter((s) => s.id !== snapshotId);
        if (ownerUid) saveLocalAccountSnapshots(ownerUid, updated);
        return updated;
      });
      if (activeRestoredSnapshotId === snapshotId) {
        setActiveRestoredSnapshotId(null);
      }
      hapticAudio.triggerPress(synth, haptic, patterns);
    },
    [user, studioAccount?.uid, activeRestoredSnapshotId, synth, haptic, patterns]
  );

  // Keep activePreviewScreenId synced if activeScreenMap switches to a map without that ID
  useEffect(() => {
    if (!activeScreenMap.nodes.length) return;
    const exists = activeScreenMap.nodes.some((n) => n.id === activePreviewScreenId);
    if (!exists) {
      setActivePreviewScreenId(activeScreenMap.nodes[0].id);
    }
  }, [activeScreenMap, activePreviewScreenId]);

  const addAttachedPromptGraphic = useCallback(
    (params: {
      name: string;
      mimeType: string;
      dataUrl: string;
      role?: PromptGraphicRole;
    }) => {
      const item: PromptReferenceGraphic = {
        id: `gfx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: params.name || 'referencja.png',
        mimeType: params.mimeType || 'image/png',
        dataUrl: params.dataUrl,
        role: params.role || 'uklad-ekranu',
        addedAt: new Date().toLocaleTimeString('pl-PL', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
      setAttachedPromptGraphics((prev) => [...prev.slice(-7), item]);
      hapticAudio.triggerPress(synth, haptic, patterns);
      pulseInteraction(0.6);
    },
    [synth, haptic, patterns, pulseInteraction]
  );

  const removeAttachedPromptGraphic = useCallback(
    (id: string) => {
      setAttachedPromptGraphics((prev) => prev.filter((g) => g.id !== id));
      hapticAudio.triggerPress(synth, haptic, patterns);
    },
    [synth, haptic, patterns]
  );

  const updateAttachedPromptGraphicRole = useCallback(
    (id: string, role: PromptGraphicRole) => {
      setAttachedPromptGraphics((prev) =>
        prev.map((g) => (g.id === id ? { ...g, role } : g))
      );
    },
    []
  );

  const clearAttachedPromptGraphics = useCallback(() => {
    setAttachedPromptGraphics([]);
  }, []);

  const generateCompleteUiElement = useCallback(
    async (params: {
      compiledPrompt: string;
      userBrief: string;
      targetScreenId: string;
      targetZone: PrototypeDropZone;
    }): Promise<GeneratedCompleteElement> => {
      const targetScreen =
        activeScreenMap.nodes.find((n) => n.id === params.targetScreenId) ||
        activeScreenMap.nodes[0];

      const resp = await studioApiFetch('/api/gemini/generate-complete-element', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compiledPrompt: params.compiledPrompt,
          userBrief: params.userBrief,
          targetScreenId: targetScreen?.id || params.targetScreenId,
          targetScreenTitle: targetScreen?.title || 'Ekran Główny',
          targetZone: params.targetZone,
          palette,
          material: haptic.material,
          depth,
          baseFreqHz: synth.baseFrequency,
          attachedGraphics: attachedPromptGraphics.map((g) => ({
            name: g.name,
            mimeType: g.mimeType,
            dataUrl: g.dataUrl,
            role: g.role,
          })),
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(
          data?.error || 'Nie udało się wygenerować kompletnego elementu UI.'
        );
      }

      const created: GeneratedCompleteElement = {
        id: `el_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: String(data.name || 'Kompletny Moduł UI'),
        fileName: String(data.fileName || 'CompleteUiModule.tsx'),
        targetScreenId: targetScreen?.id || params.targetScreenId,
        targetZone: params.targetZone,
        categoryLabel: String(data.categoryLabel || 'Moduł Frontendu'),
        summary: String(data.summary || ''),
        headline: String(data.headline || data.name || 'Moduł Frontendu'),
        subheadline: String(data.subheadline || ''),
        accentHex: String(data.accentHex || '#4F46E5'),
        referenceThumbUrl: data.referenceThumbUrl || attachedPromptGraphics[0]?.dataUrl,
        controls: Array.isArray(data.controls) ? data.controls : [],
        reactTailwindCode: String(data.reactTailwindCode || ''),
        compiledPromptUsed: params.compiledPrompt,
        createdAt: new Date().toLocaleTimeString('pl-PL', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      setGeneratedElements((prev) => [created, ...prev]);
      const assignedShade = hashStringToShadeId(created.id, generatedElements.length);
      setComposedElementShades((prev) => ({
        ...prev,
        [created.id]: prev[created.id] || assignedShade,
      }));
      setActiveModifiedElement({
        id: created.id,
        kind: 'generated',
        label: created.name,
        zone: created.targetZone,
        screenId: created.targetScreenId,
        shadeId: assignedShade,
        sourceSurface: 'Kreator Kompletnego Promptu',
        updatedAtMs: Date.now(),
      });
      if (targetScreen?.id) {
        setActivePreviewScreenId(targetScreen.id);
      }
      hapticAudio.triggerPress(synth, haptic, patterns, { pitchSemitones: 6 });
      pulseInteraction(1.2);
      return created;
    },
    [
      activeScreenMap.nodes,
      palette,
      haptic,
      depth,
      synth,
      patterns,
      attachedPromptGraphics,
      generatedElements.length,
      pulseInteraction,
    ]
  );

  const removeGeneratedElement = useCallback(
    (id: string) => {
      setGeneratedElements((prev) => prev.filter((el) => el.id !== id));
      setActiveModifiedElement((prev) => (prev?.id === id ? null : prev));
      hapticAudio.triggerPress(synth, haptic, patterns);
    },
    [synth, haptic, patterns]
  );

  const moveGeneratedElementTarget = useCallback(
    (id: string, targetScreenId: string, targetZone: PrototypeDropZone) => {
      setGeneratedElements((prev) =>
        prev.map((el) => {
          if (el.id !== id) return el;
          const shadeId =
            composedElementShades[id] || hashStringToShadeId(id, 0);
          setActiveModifiedElement({
            id,
            kind: 'generated',
            label: el.name,
            zone: targetZone,
            screenId: targetScreenId,
            shadeId,
            sourceSurface: 'Zmiana strefy na podglądzie',
            updatedAtMs: Date.now(),
          });
          return { ...el, targetScreenId, targetZone };
        })
      );
      hapticAudio.triggerPress(synth, haptic, patterns);
    },
    [synth, haptic, patterns, composedElementShades]
  );

  // External Plugins & GitHub Profile Actions
  const toggleExternalPlugin = useCallback(
    (id: string) => {
      setExternalPlugins((prev) =>
        prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
      );
      hapticAudio.triggerPress(synth, haptic, patterns, { pitchSemitones: 2 });
    },
    [synth, haptic, patterns]
  );

  const addCustomExternalPlugin = useCallback(
    (input: {
      targetAppName: string;
      pluginTitle: string;
      description: string;
      integrationKind: ExternalPluginIntegrationKind;
      endpointOrUri: string;
      scopes: ExternalPluginDataScope[];
      customHeadersJson?: string;
    }): ExternalAppPlugin => {
      const slug = slugifyExportName(
        `${input.targetAppName}-${input.pluginTitle}`
      );
      const created: ExternalAppPlugin = {
        id: `plg_custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        slug,
        targetAppName: input.targetAppName.trim() || 'Aplikacja Zewnętrzna',
        pluginTitle: input.pluginTitle.trim() || 'Mostek Integracyjny Aether',
        description:
          input.description.trim() ||
          'Dedykowana wtyczka synchronizująca model frontendu i parametry dotykowe Aether Tactile Studio.',
        integrationKind: input.integrationKind,
        enabled: true,
        isCustom: true,
        endpointOrUri: input.endpointOrUri.trim() || '*',
        scopes:
          input.scopes.length > 0
            ? input.scopes
            : ['design-tokens', 'generated-tsx'],
        customHeadersJson: input.customHeadersJson,
        version: '1.0.0',
        createdAt: new Date().toLocaleTimeString('pl-PL', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
      setExternalPlugins((prev) => [created, ...prev]);
      hapticAudio.triggerPress(synth, haptic, patterns, { pitchSemitones: 5 });
      pulseInteraction(0.9);
      return created;
    },
    [synth, haptic, patterns, pulseInteraction]
  );

  const updateExternalPluginEndpoint = useCallback(
    (id: string, endpointOrUri: string) => {
      setExternalPlugins((prev) =>
        prev.map((p) => (p.id === id ? { ...p, endpointOrUri } : p))
      );
    },
    []
  );

  const removeExternalPlugin = useCallback(
    (id: string) => {
      setExternalPlugins((prev) =>
        prev.filter((p) => !(p.id === id && p.isCustom))
      );
      hapticAudio.triggerPress(synth, haptic, patterns);
    },
    [synth, haptic, patterns]
  );

  const updateGitHubRepoProfile = useCallback(
    (patch: Partial<GitHubRepoProfileMetadata>) => {
      setGitHubRepoProfile((prev) => ({ ...prev, ...patch }));
    },
    []
  );

  const regenerateGitHubRepoProfileWithAi =
    useCallback(async (): Promise<GitHubRepoProfileMetadata> => {
      const matProfile =
        MATERIAL_PROFILES[haptic.material] || MATERIAL_PROFILES['frosted-glass'];
      const activePluginNames = externalPlugins
        .filter((p) => p.enabled)
        .map((p) => `${p.targetAppName} (${p.pluginTitle})`);

      const resp = await studioApiFetch('/api/gemini/generate-repo-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: activeScreenMap.name || 'Aether Tactile Studio',
          screensCount: activeScreenMap.nodes.length,
          generatedElementsCount: generatedElements.length,
          activePluginNames,
          materialLabel: matProfile.label,
          palette,
          baseFreqHz: Math.min(158, synth.baseFrequency),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(
          data?.error ||
            'Nie udało się wygenerować opisu repozytorium GitHub.'
        );
      }

      const nextProfile: GitHubRepoProfileMetadata = {
        ...gitHubRepoProfile,
        shortAboutDescription:
          String(data.shortAboutDescription || '').trim() ||
          gitHubRepoProfile.shortAboutDescription,
        readmeSubtitle:
          String(data.readmeSubtitle || '').trim() ||
          gitHubRepoProfile.readmeSubtitle,
        topics:
          Array.isArray(data.topics) && data.topics.length > 0
            ? data.topics
            : gitHubRepoProfile.topics,
      };
      setGitHubRepoProfile(nextProfile);
      hapticAudio.triggerPress(synth, haptic, patterns, { pitchSemitones: 4 });
      return nextProfile;
    }, [
      activeScreenMap.name,
      activeScreenMap.nodes.length,
      generatedElements.length,
      externalPlugins,
      haptic,
      palette,
      synth,
      patterns,
      gitHubRepoProfile,
    ]);

  // Start Page: Local Disk Directory & Working Frontend Image Actions
  const updateLocalDiskConfig = useCallback(
    (patch: Partial<LocalDiskWorkspaceConfig>) => {
      setLocalDiskConfig((prev) => ({ ...prev, ...patch }));
    },
    []
  );

  const selectLocalDiskDirectory = useCallback(async () => {
    const res = await pickLocalDiskDirectory(localDiskConfig.subFolderName);
    if (res.ok && res.directoryName) {
      setLocalDiskConfig((prev) => ({
        ...prev,
        directoryName: res.directoryName || prev.directoryName,
        accessMode: 'fs-handle-readwrite',
        statusNote: `Połączono bezpośredni zapis na dysku lokalnym w folderze „${res.directoryName}”.`,
      }));
      hapticAudio.triggerPress(synth, haptic, patterns, { pitchSemitones: 5 });
      return {
        ok: true,
        message: `Wybrano folder lokalny „${res.directoryName}” do zapisu danych projektu.`,
      };
    }

    return {
      ok: false,
      fallbackRequired: res.fallbackRequired,
      message:
        res.errorMessage || 'Nie wybrano folderu na dysku lokalnym.',
    };
  }, [localDiskConfig.subFolderName, synth, haptic, patterns]);

  const linkLocalDirectoryNameFallback = useCallback(
    (folderName: string) => {
      const cleaned = folderName.trim() || 'aether-lokalny-dysk';
      setLocalDiskConfig((prev) => ({
        ...prev,
        directoryName: cleaned,
        accessMode: 'directory-linked-download',
        statusNote: `Powiązano katalog lokalny „${cleaned}” — gotowy do synchronizacji plików.`,
      }));
      hapticAudio.triggerPress(synth, haptic, patterns, { pitchSemitones: 3 });
    },
    [synth, haptic, patterns]
  );

  const saveProjectToLocalDiskNow = useCallback(
    async (forceDownloadFallback = false) => {
      const prefsPayload = buildCurrentPreferencesPayload();
      const workspaceStateJson = JSON.stringify(
        {
          version: 'aether-local-disk-v1',
          savedAt: new Date().toISOString(),
          directoryName: localDiskConfig.directoryName,
          subFolderName: localDiskConfig.subFolderName,
          preferences: prefsPayload,
          snapshots: snapshots.slice(0, 20),
        },
        null,
        2
      );

      const readmeMarkdown = buildComprehensiveGitHubReadme({
        repoSlug: slugifyExportName(
          activeScreenMap.name || 'aether-tactile-studio'
        ),
        profile: gitHubRepoProfile,
        ctx: {
          palette,
          depth,
          engraving,
          synth,
          haptic,
          screenMap: activeScreenMap,
          generatedElements,
        },
        plugins: externalPlugins,
      });

      const writeRes = await writeWorkspaceFilesToLocalDisk({
        config: localDiskConfig,
        workspaceStateJson,
        readmeMarkdown,
        workingImage: workingFrontendImage,
        generatedElements,
        forceBrowserDownloadFallback: forceDownloadFallback,
      });

      if (writeRes.ok) {
        setLocalDiskConfig((prev) => ({
          ...prev,
          lastSavedAt: writeRes.savedAtLabel,
          savedFilesCount: writeRes.filesWritten,
          statusNote: writeRes.message,
        }));
        hapticAudio.triggerPress(synth, haptic, patterns, { pitchSemitones: 4 });
      }

      return { ok: writeRes.ok, message: writeRes.message };
    },
    [
      buildCurrentPreferencesPayload,
      localDiskConfig,
      snapshots,
      activeScreenMap,
      gitHubRepoProfile,
      palette,
      depth,
      engraving,
      synth,
      haptic,
      generatedElements,
      externalPlugins,
      workingFrontendImage,
      patterns,
    ]
  );

  // Automatic silent sync to local disk when a live FileSystemDirectoryHandle is granted and autoSaveOnChange is enabled
  const autoSaveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (
      !localDiskConfig.autoSaveOnChange ||
      localDiskConfig.accessMode !== 'fs-handle-readwrite' ||
      !getActiveLocalDirectoryHandle()
    ) {
      return;
    }

    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = window.setTimeout(async () => {
      try {
        const prefsPayload = buildCurrentPreferencesPayload();
        const readmeMarkdown = buildComprehensiveGitHubReadme({
          repoSlug: slugifyExportName(
            activeScreenMap.name || 'aether-tactile-studio'
          ),
          profile: gitHubRepoProfile,
          ctx: {
            palette,
            depth,
            engraving,
            synth,
            haptic,
            screenMap: activeScreenMap,
            generatedElements,
          },
          plugins: externalPlugins,
        });
        const res = await writeWorkspaceFilesToLocalDisk({
          config: localDiskConfig,
          workspaceStateJson: JSON.stringify(
            {
              version: 'aether-local-disk-v1',
              savedAt: new Date().toISOString(),
              preferences: prefsPayload,
            },
            null,
            2
          ),
          readmeMarkdown,
          workingImage: workingFrontendImage,
          generatedElements,
        });
        if (res.ok) {
          setLocalDiskConfig((prev) => ({
            ...prev,
            lastSavedAt: res.savedAtLabel,
            savedFilesCount: res.filesWritten,
          }));
        }
      } catch {
        // Ignore background auto-save errors
      }
    }, 1500);

    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [
    localDiskConfig.autoSaveOnChange,
    localDiskConfig.accessMode,
    localDiskConfig.subFolderName,
    localDiskConfig.saveImagesAndTsx,
    activeScreenMap,
    generatedElements,
    workingFrontendImage,
    composedElementShades,
    palette,
    depth,
    engraving,
    synth,
    haptic,
    gitHubRepoProfile,
    externalPlugins,
    buildCurrentPreferencesPayload,
  ]);

  const updateFrontendImageRegion = useCallback(
    (regionId: string, patch: Partial<FrontendImageRegion>) => {
      setWorkingFrontendImage((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          regions: prev.regions.map((r) =>
            r.id === regionId ? { ...r, ...patch } : r
          ),
        };
      });
    },
    []
  );

  const addFrontendImageRegion = useCallback(
    (region: Omit<FrontendImageRegion, 'id'>): FrontendImageRegion => {
      const created: FrontendImageRegion = {
        ...region,
        id: `reg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      };
      setWorkingFrontendImage((prev) =>
        prev ? { ...prev, regions: [...prev.regions, created] } : prev
      );
      hapticAudio.triggerPress(synth, haptic, patterns, { pitchSemitones: 3 });
      return created;
    },
    [synth, haptic, patterns]
  );

  const removeFrontendImageRegion = useCallback(
    (regionId: string) => {
      setWorkingFrontendImage((prev) =>
        prev
          ? { ...prev, regions: prev.regions.filter((r) => r.id !== regionId) }
          : prev
      );
      hapticAudio.triggerPress(synth, haptic, patterns);
    },
    [synth, haptic, patterns]
  );

  const setElementCustomShade = useCallback(
    (elementId: string, shadeId: ElementShadeId) => {
      setComposedElementShades((prev) => ({
        ...prev,
        [elementId]: shadeId,
      }));
      setActiveModifiedElement((prev) =>
        prev && prev.id === elementId ? { ...prev, shadeId, updatedAtMs: Date.now() } : prev
      );
      hapticAudio.triggerSliderTick(haptic, 0.55);
    },
    [haptic]
  );

  const markElementAsActivelyModified = useCallback(
    (target: Omit<ActiveModifiedElementState, 'updatedAtMs'> | null) => {
      if (!target) {
        setActiveModifiedElement(null);
        return;
      }
      setActiveModifiedElement({
        ...target,
        updatedAtMs: Date.now(),
      });
    },
    []
  );

  const activeIdentityLabel =
    studioAccount?.displayName ||
    user?.displayName ||
    studioAccount?.email ||
    user?.email ||
    null;
  const isAuthenticatedAny = Boolean(studioAccount || user);
  const isBootAuthLocked = Boolean(requireAuthOnBootRequired && !isAuthenticatedAny);

  const value: StudioContextValue = {
    user,
    studioAccount,
    activeIdentityLabel,
    isAuthenticatedAny,
    isBootAuthLocked,
    authLoading,
    authModalOpen,
    authModalTab,
    openAuthModal,
    closeAuthModal,
    lastRecoveryCode,
    clearLastRecoveryCode,
    signInWithGoogle,
    signOutUser,
    registerStudioAccount,
    loginStudioAccount,
    recoverStudioAccount,
    syncStudioWorkspaceNow,
    downloadOfflineHtmlApp,
    exportStudioJsonBackup,
    importStudioJsonBackup,
    palette,
    setPalette,
    depth,
    updateDepth,
    synth,
    updateSynth,
    haptic,
    updateHaptic,
    selectMaterialProfile,
    engraving,
    updateEngraving,
    animation,
    setAnimation,
    applyButtonMotionPreset,
    applyButtonIlluminationPreset,
    selectedGroups,
    toggleGroupSelection,
    unifySelectedGroupsNow,
    groupConfigs,
    patterns,
    importCustomPattern,
    removeCustomPattern,
    savedPresets,
    saveCurrentPreset,
    loadSavedPreset,
    removeSavedPreset,
    sourcePrompts,
    addSourcePrompt,
    removeSourcePrompt,
    mediaLibrary,
    addMediaAsset,
    removeMediaAsset,
    driverCalibration,
    updateDriverCalibration,
    calibrationReport,
    savedCalibrations,
    saveDriverCalibrationProfile,
    loadDriverCalibrationProfile,
    removeDriverCalibrationProfile,
    runDriverCalibrationService,
    activeScreenTransition,
    setActiveScreenTransition,
    activeScreenMap,
    setActiveScreenMap,
    savedScreenMaps,
    saveActiveScreenMap,
    loadScreenMapProject,
    removeScreenMapProject,
    designScreenMapFromGitHub,
    activeBuildMatrix,
    savedBuildMatrices,
    generatePlanAndMatrixFromFile,
    generateFullFrontendFromUploadedFile,
    selectSavedBuildMatrix,
    removeSavedBuildMatrix,
    pendingImageGeneratorDraft,
    setPendingImageGeneratorDraft,
    snapshots,
    snapshotsLoading,
    snapshotsError,
    activeRestoredSnapshotId,
    currentSnapshotStatePreview: currentSnapshotBundle.state,
    createStudioSnapshot,
    restoreStudioSnapshot,
    togglePinStudioSnapshot,
    renameStudioSnapshot,
    deleteStudioSnapshot,
    applyRenderPreset,
    workbenchLayoutMode,
    setWorkbenchLayoutMode,
    activePreviewScreenId,
    setActivePreviewScreenId,
    masterPromptDraft,
    setMasterPromptDraft,
    attachedPromptGraphics,
    addAttachedPromptGraphic,
    removeAttachedPromptGraphic,
    updateAttachedPromptGraphicRole,
    clearAttachedPromptGraphics,
    generatedElements,
    generateCompleteUiElement,
    removeGeneratedElement,
    moveGeneratedElementTarget,
    gitHubExportModalOpen,
    setGitHubExportModalOpen,
    localhostModalOpen,
    setLocalhostModalOpen,
    zeroLimitLocalMode,
    setZeroLimitLocalMode,
    externalPlugins,
    toggleExternalPlugin,
    addCustomExternalPlugin,
    updateExternalPluginEndpoint,
    removeExternalPlugin,
    gitHubRepoProfile,
    updateGitHubRepoProfile,
    regenerateGitHubRepoProfileWithAi,
    pluginsModalOpen,
    setPluginsModalOpen,
    localDiskConfig,
    updateLocalDiskConfig,
    selectLocalDiskDirectory,
    linkLocalDirectoryNameFallback,
    saveProjectToLocalDiskNow,
    workingFrontendImage,
    setWorkingFrontendImage,
    updateFrontendImageRegion,
    addFrontendImageRegion,
    removeFrontendImageRegion,
    composedElementShades,
    setElementCustomShade,
    activeModifiedElement,
    markElementAsActivelyModified,
    interactionEnergy,
    activeHoldLevel,
    setActiveHoldLevel,
    pulseInteraction,
  };

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
};

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) {
    throw new Error('useStudio must be used within StudioProvider');
  }
  return ctx;
}
