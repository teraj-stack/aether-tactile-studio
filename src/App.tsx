/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  FolderOpen,
  GitBranch,
  LayoutPanelLeft,
  Maximize2,
  MessageSquareCode,
  Monitor,
  PlugZap,
  QrCode,
  Server,
} from 'lucide-react';
import { StudioProvider, useStudio } from './context/StudioContext';
import { StartWorkspaceSection } from './components/StartWorkspaceSection';
import { DashboardView } from './components/DashboardView';
import { AetherSynthPanel } from './components/AetherSynthPanel';
import { HapticSettingsPanel } from './components/HapticSettingsPanel';
import { MagicGlassChimePanel } from './components/MagicGlassChimePanel';
import { SourcePromptStudio } from './components/SourcePromptStudio';
import { GeminiMultimediaStudio } from './components/GeminiMultimediaStudio';
import { TactileComponentsHub } from './components/TactileComponentsHub';
import {
  ScreenArchitectureHub,
  ScreenHubSection,
} from './components/ScreenArchitectureHub';
import { StudioAuthAndOfflineModal } from './components/StudioAuthAndOfflineModal';
import { OfflineConnectivityBanner } from './components/OfflineSuiteCard';
import { LiveFrontendModelPreview } from './components/LiveFrontendModelPreview';
import {
  PersistentMasterPromptWindow,
  useCompiledStudioMasterPrompt,
} from './components/PersistentMasterPromptWindow';
import { GitHubRepoExportModal } from './components/GitHubRepoExportModal';
import { ExternalPluginsModal } from './components/ExternalPluginsHub';
import { LocalhostPresentationModal } from './components/LocalhostPresentationModal';
import { MobileQrHapticsModal } from './components/MobileQrHapticsModal';
import { MobileHapticsPadView } from './components/MobileHapticsPadView';
import { hapticAudio } from './lib/hapticAudioEngine';
import { hasTactileCatalogDrag } from './lib/tactileUiCatalog';
import {
  CreativeWorkbenchLayoutMode,
  PrototypeDropZone,
  SCREEN_TRANSITION_PRESETS,
  StudioLiveTabId,
} from './types/studio';

type StudioTab = StudioLiveTabId;

const StudioShell: React.FC = () => {
  const {
    isAuthenticatedAny,
    activeIdentityLabel,
    authLoading,
    openAuthModal,
    palette,
    synth,
    haptic,
    patterns,
    activeScreenTransition,
    workbenchLayoutMode,
    setWorkbenchLayoutMode,
    setActivePreviewScreenId,
    attachedPromptGraphics,
    generatedElements,
    setGitHubExportModalOpen,
    setLocalhostModalOpen,
    zeroLimitLocalMode,
    setZeroLimitLocalMode,
    externalPlugins,
    setPluginsModalOpen,
    localDiskConfig,
    workingFrontendImage,
  } = useStudio();

  // Read initial tab / mobile haptics pad mode from URL query params (for QR code scans)
  const initialUrlParams =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialTabParam = initialUrlParams?.get('tab') as StudioTab | null;
  const allowedTabs: StudioTab[] = [
    'start',
    'dashboard',
    'screens',
    'haptics',
    'ui-library',
    'synth',
    'prompts',
    'gemini',
  ];

  // First section of the application is now the Start Page ('start') unless overridden by ?tab=
  const [activeTab, setActiveTab] = useState<StudioTab>(
    initialTabParam && allowedTabs.includes(initialTabParam) ? initialTabParam : 'start'
  );
  const [mobilePadMode, setMobilePadMode] = useState<boolean>(
    initialUrlParams?.get('mobileTest') === '1'
  );
  const [mobileQrModalOpen, setMobileQrModalOpen] = useState<boolean>(false);
  const [screensSection, setScreensSection] = useState<ScreenHubSection>('all');
  const [screensFocusedId, setScreensFocusedId] = useState<string | null>(null);

  // Persistent prompt builder options (kept alive across all creative tabs)
  const [targetZone, setTargetZone] = useState<PrototypeDropZone>('main');
  const [includeScreenContext, setIncludeScreenContext] = useState<boolean>(true);
  const [includeVisualTokens, setIncludeVisualTokens] = useState<boolean>(true);
  const [hapticsSubTab, setHapticsSubTab] = useState<'magic' | 'haptics' | 'synth'>('magic');
  const [includeHapticAudio, setIncludeHapticAudio] = useState<boolean>(true);
  const [includeBuildMatrix, setIncludeBuildMatrix] = useState<boolean>(true);

  const compiledMasterPrompt = useCompiledStudioMasterPrompt({
    includeScreenContext,
    includeVisualTokens,
    includeHapticAudio,
    includeBuildMatrix,
    targetZone,
  });

  const isDark = palette === 'emerald-clinic';

  const bgGradientClass =
    palette === 'emerald-clinic'
      ? 'bg-gradient-to-br from-[#061512] via-[#0B231E] to-[#071915] text-emerald-50'
      : palette === 'finance-ice'
        ? 'bg-gradient-to-br from-[#EEF4FF] via-[#E3ECFF] to-[#EDE9FE] text-slate-900'
        : 'bg-gradient-to-br from-[#EFEFFA] via-[#E3E6F8] to-[#EDE5F8] text-slate-900';

  // Strict 5 single-line navigation links in Top Bar Zone 2
  const navItems: Array<{ id: StudioTab; label: string }> = [
    { id: 'start', label: 'Start' },
    { id: 'dashboard', label: 'Pulpit' },
    { id: 'screens', label: 'Mapa Ekranów' },
    { id: 'haptics', label: 'Magic Sounds' },
    { id: 'ui-library', label: 'Biblioteka i Kreator' },
  ];

  const activeTransitionSpec =
    SCREEN_TRANSITION_PRESETS.find((p) => p.id === activeScreenTransition) ||
    SCREEN_TRANSITION_PRESETS[0];

  const handleSelectTab = (tab: StudioTab, subSection?: ScreenHubSection) => {
    if (tab === 'screens') {
      setScreensSection(subSection || 'all');
    }
    setActiveTab(tab);
    hapticAudio.triggerPress(synth, haptic, patterns);
  };

  const handleSwitchWorkbenchMode = (mode: CreativeWorkbenchLayoutMode) => {
    setWorkbenchLayoutMode(mode);
    hapticAudio.triggerPress(synth, haptic, patterns);
  };

  const showRightDock = workbenchLayoutMode !== 'canvas-full';
  const showFrontendPreview =
    workbenchLayoutMode === 'split-studio' ||
    workbenchLayoutMode === 'preview-only';
  const showMasterComposer =
    workbenchLayoutMode === 'split-studio' ||
    workbenchLayoutMode === 'composer-only';

  const activePluginsCount = externalPlugins.filter((p) => p.enabled).length;

  if (mobilePadMode) {
    return (
      <MobileHapticsPadView
        onExitToStudio={() => {
          setMobilePadMode(false);
          setActiveTab('haptics');
          if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.delete('mobileTest');
            url.searchParams.set('tab', 'haptics');
            window.history.replaceState({}, '', url.toString());
          }
        }}
      />
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${bgGradientClass}`}>
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-white/60 dark:border-emerald-400/15 bg-white/55 dark:bg-[#071814]/75 backdrop-blur-xl">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => handleSelectTab('start')}
            className="text-lg font-bold tracking-tight text-slate-900 dark:text-emerald-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Magic Sounds · Aether Studio
          </button>

          {/* Zone 2: 5 Concise Single-Line Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {navItems.map((item) => {
              const isActive =
                activeTab === item.id ||
                (item.id === 'haptics' && activeTab === 'synth') ||
                (item.id === 'ui-library' &&
                  (activeTab === 'prompts' || activeTab === 'gemini'));
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectTab(item.id)}
                  onDragOver={(e) => {
                    if (item.id === 'screens' && hasTactileCatalogDrag(e)) {
                      e.preventDefault();
                      if (activeTab !== 'screens') {
                        setScreensSection('prototyper');
                        setActiveTab('screens');
                      }
                    }
                  }}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                    isActive
                      ? isDark
                        ? 'text-emerald-200 border-emerald-300'
                        : 'text-slate-900 border-indigo-600'
                      : 'text-slate-600 dark:text-emerald-200/70 border-transparent hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 Primary Action (Studio AI Account & Offline Suite) */}
          <div className="flex items-center shrink-0">
            {authLoading ? (
              <span className="text-xs text-slate-500 dark:text-emerald-200/70 whitespace-nowrap">
                Inicjalizacja...
              </span>
            ) : isAuthenticatedAny ? (
              <button
                type="button"
                onClick={() => openAuthModal('auth')}
                className="px-4 py-2 text-xs font-medium rounded-xl bg-white/85 dark:bg-emerald-900/80 text-slate-900 dark:text-emerald-50 border border-slate-200/80 dark:border-emerald-400/25 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer max-w-[210px] truncate"
              >
                Konto: {activeIdentityLabel || 'Studio AI'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openAuthModal('auth')}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 dark:bg-emerald-400 text-white dark:text-emerald-950 hover:opacity-95 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
              >
                Konto Studio AI
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Tab Strip (visible below md, compact height respecting 15% cap) */}
      <div className="md:hidden px-4 pt-3 overflow-x-auto">
        <div className="inline-flex items-center gap-1.5 p-1 rounded-xl bg-white/60 dark:bg-emerald-950/70 border border-white/70 dark:border-emerald-400/20">
          {navItems.map((item) => {
            const isMobileActive =
              activeTab === item.id ||
              (item.id === 'haptics' && activeTab === 'synth') ||
              (item.id === 'ui-library' &&
                (activeTab === 'prompts' || activeTab === 'gemini'));
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectTab(item.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                  isMobileActive
                    ? isDark
                      ? 'bg-emerald-400 text-emerald-950'
                      : 'bg-slate-900 text-white'
                    : 'text-slate-600 dark:text-emerald-200/80'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Creative Workbench Container (1440px Desktop Presence) */}
      <main className="max-w-[1440px] mx-auto px-4 sm:px-8 py-6 space-y-6 overflow-x-clip">
        {/* Universal Creative Workspace Toolbar (Available across ALL Creative Tabs) */}
        <div className="p-3 rounded-2xl bg-white/65 dark:bg-emerald-950/75 border border-white/80 dark:border-emerald-400/20 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-emerald-900/60">
            {(
              [
                ['split-studio', LayoutPanelLeft, 'Pulpit + Podgląd + Stały Prompt'],
                ['preview-only', Monitor, 'Pulpit + Podgląd Frontendu'],
                ['composer-only', MessageSquareCode, 'Pulpit + Stałe Okno Promptu'],
                ['canvas-full', Maximize2, 'Pełna szerokość pulpitu'],
              ] as const
            ).map(([modeId, Icon, label]) => (
              <button
                key={modeId}
                type="button"
                onClick={() => handleSwitchWorkbenchMode(modeId)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  workbenchLayoutMode === modeId
                    ? isDark
                      ? 'bg-emerald-400 text-emerald-950 font-semibold shadow-sm'
                      : 'bg-white text-slate-900 font-semibold shadow-sm'
                    : 'text-slate-600 dark:text-emerald-200/80 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <button
              type="button"
              onClick={() => handleSelectTab('start')}
              className="min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-medium bg-white/85 dark:bg-emerald-900/70 border border-slate-200/80 dark:border-emerald-400/25 text-slate-800 dark:text-emerald-100 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <FolderOpen className="w-3.5 h-3.5 shrink-0" />
              <span>
                {localDiskConfig.directoryName
                  ? `Dysk: ${localDiskConfig.directoryName}`
                  : workingFrontendImage
                    ? `Obraz: ${workingFrontendImage.fileName}`
                    : 'Konfiguracja Dysk + Obraz'}
              </span>
            </button>

            <span className="hidden sm:inline text-slate-500 dark:text-emerald-300/80 font-mono tabular-nums whitespace-nowrap">
              Grafiki: {attachedPromptGraphics.length} · Elementy .tsx: {generatedElements.length}
            </span>

            <label className="min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-medium bg-white/85 dark:bg-emerald-900/70 border border-slate-200/80 dark:border-emerald-400/25 text-slate-800 dark:text-emerald-100 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0">
              <input
                type="checkbox"
                checked={zeroLimitLocalMode}
                onChange={(e) => {
                  setZeroLimitLocalMode(e.target.checked);
                  hapticAudio.triggerPress(synth, haptic, patterns);
                }}
                className="rounded accent-indigo-600 dark:accent-emerald-400"
              />
              <span>Zero-Limit</span>
            </label>

            <button
              type="button"
              onClick={() => {
                setMobileQrModalOpen(true);
                hapticAudio.triggerMinimalistLowClick('crystal-glass-tap-9ms', 0.6);
              }}
              className="min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 dark:from-emerald-400 dark:to-teal-400 text-white dark:text-emerald-950 hover:opacity-95 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 shadow-sm"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Kod QR (Telefon)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setLocalhostModalOpen(true);
                hapticAudio.triggerPress(synth, haptic, patterns, { pitchSemitones: 4 });
              }}
              className="min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 dark:bg-emerald-500 text-white dark:text-emerald-950 hover:opacity-95 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Server className="w-3.5 h-3.5" />
              <span>Host Localhost</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPluginsModalOpen(true);
                hapticAudio.triggerPress(synth, haptic, patterns, { pitchSemitones: 3 });
              }}
              className="min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/90 dark:bg-emerald-900/80 border border-slate-200/85 dark:border-emerald-400/25 text-slate-900 dark:text-emerald-50 hover:opacity-95 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <PlugZap className="w-3.5 h-3.5" />
              <span>Wtyczki ({activePluginsCount})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setGitHubExportModalOpen(true);
                hapticAudio.triggerPress(synth, haptic, patterns, { pitchSemitones: 5 });
              }}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-emerald-400 text-white dark:text-emerald-950 hover:opacity-95 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>Eksportuj na GitHub</span>
            </button>
          </div>
        </div>

        {/* Two-Column Unified Creative Workbench: Active Creative Tab (Left) + Persistent Frontend Model Preview & Master Prompt Window (Right) */}
        <div
          className={
            showRightDock
              ? 'grid grid-cols-1 xl:grid-cols-12 gap-6 items-start'
              : 'block'
          }
        >
          {/* Left Creative Workspace Column */}
          <div className={showRightDock ? 'xl:col-span-7 min-w-0' : 'w-full min-w-0'}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={activeTransitionSpec.enterInitial}
                animate={activeTransitionSpec.enterAnimate}
                exit={activeTransitionSpec.exitTarget}
                transition={{
                  type: 'spring',
                  stiffness: activeTransitionSpec.spring.stiffness,
                  damping: activeTransitionSpec.spring.damping,
                  mass: activeTransitionSpec.spring.mass,
                }}
                style={{ transformPerspective: 1100 }}
              >
                {activeTab === 'start' && (
                  <StartWorkspaceSection
                    onEnterStudioTab={(t) => handleSelectTab(t)}
                  />
                )}

                {activeTab === 'dashboard' && (
                  <DashboardView
                    onNavigateTab={(t, section) =>
                      handleSelectTab(t as StudioTab, section)
                    }
                  />
                )}

                {activeTab === 'screens' && (
                  <ScreenArchitectureHub
                    initialSection={screensSection}
                    initialFocusedScreenId={screensFocusedId}
                    onNavigateLiveTab={(t) => handleSelectTab(t)}
                  />
                )}

                {(activeTab === 'ui-library' ||
                  activeTab === 'prompts' ||
                  activeTab === 'gemini') && (
                  <div className="space-y-6">
                    <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-white/65 dark:bg-emerald-950/75 border border-white/80 dark:border-emerald-400/20">
                      <button
                        type="button"
                        onClick={() => handleSelectTab('ui-library')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[36px] ${
                          activeTab === 'ui-library'
                            ? isDark
                              ? 'bg-emerald-400 text-emerald-950 shadow-sm'
                              : 'bg-slate-900 text-white shadow-sm'
                            : 'text-slate-600 dark:text-emerald-200/80'
                        }`}
                      >
                        Biblioteka Komponentów UI
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectTab('prompts')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[36px] ${
                          activeTab === 'prompts'
                            ? isDark
                              ? 'bg-emerald-400 text-emerald-950 shadow-sm'
                              : 'bg-slate-900 text-white shadow-sm'
                            : 'text-slate-600 dark:text-emerald-200/80'
                        }`}
                      >
                        Generator Sorsów i Promptów
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectTab('gemini')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[36px] ${
                          activeTab === 'gemini'
                            ? isDark
                              ? 'bg-emerald-400 text-emerald-950 shadow-sm'
                              : 'bg-slate-900 text-white shadow-sm'
                            : 'text-slate-600 dark:text-emerald-200/80'
                        }`}
                      >
                        Studio Multimediów Gemini
                      </button>
                    </div>

                    {activeTab === 'ui-library' && (
                      <TactileComponentsHub
                        onNavigateLiveTab={(t) => handleSelectTab(t)}
                        onOpenScreenPrototyper={(screenId) => {
                          setScreensFocusedId(screenId);
                          setActivePreviewScreenId(screenId);
                          handleSelectTab('screens', 'prototyper');
                        }}
                      />
                    )}
                    {activeTab === 'prompts' && <SourcePromptStudio />}
                    {activeTab === 'gemini' && <GeminiMultimediaStudio />}
                  </div>
                )}

                {(activeTab === 'haptics' || activeTab === 'synth') && (
                  <div className="space-y-6">
                    <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-white/65 dark:bg-emerald-950/75 border border-white/80 dark:border-emerald-400/20">
                      <button
                        type="button"
                        onClick={() => {
                          setHapticsSubTab('magic');
                          handleSelectTab('haptics');
                        }}
                        className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[36px] ${
                          activeTab === 'haptics' && hapticsSubTab === 'magic'
                            ? isDark
                              ? 'bg-emerald-400 text-emerald-950 shadow-sm'
                              : 'bg-slate-900 text-white shadow-sm'
                            : 'text-slate-600 dark:text-emerald-200/80'
                        }`}
                      >
                        ✨ Cymbałki / Szkło + 4 Doznania + Przyciski
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setHapticsSubTab('haptics');
                          handleSelectTab('haptics');
                        }}
                        className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[36px] ${
                          activeTab === 'haptics' && hapticsSubTab === 'haptics'
                            ? isDark
                              ? 'bg-emerald-400 text-emerald-950 shadow-sm'
                              : 'bg-slate-900 text-white shadow-sm'
                            : 'text-slate-600 dark:text-emerald-200/80'
                        }`}
                      >
                        Moduł Haptyki i Materiałów
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setHapticsSubTab('synth');
                          handleSelectTab('synth');
                        }}
                        className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[36px] ${
                          activeTab === 'synth'
                            ? isDark
                              ? 'bg-emerald-400 text-emerald-950 shadow-sm'
                              : 'bg-slate-900 text-white shadow-sm'
                            : 'text-slate-600 dark:text-emerald-200/80'
                        }`}
                      >
                        Syntezator Akustyczny (&lt;160 Hz)
                      </button>
                    </div>
                    {activeTab === 'synth' ? (
                      <AetherSynthPanel />
                    ) : hapticsSubTab === 'magic' ? (
                      <MagicGlassChimePanel />
                    ) : (
                      <HapticSettingsPanel />
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Right Persistent Creative Dock: Live Frontend Model Preview + Single Persistent Master Prompt & GitHub Export Window */}
          <aside
            aria-label="Stały podgląd modelu frontendu i okno kompletnego promptu"
            className={
              showRightDock
                ? 'xl:col-span-5 xl:sticky xl:top-20 space-y-6 min-w-0'
                : 'hidden'
            }
          >
            <div className={showFrontendPreview ? 'block' : 'hidden'}>
              <LiveFrontendModelPreview />
            </div>

            <div className={showMasterComposer ? 'block' : 'hidden'}>
              <PersistentMasterPromptWindow
                targetZone={targetZone}
                onChangeTargetZone={setTargetZone}
                includeScreenContext={includeScreenContext}
                onToggleScreenContext={() =>
                  setIncludeScreenContext((v) => !v)
                }
                includeVisualTokens={includeVisualTokens}
                onToggleVisualTokens={() => setIncludeVisualTokens((v) => !v)}
                includeHapticAudio={includeHapticAudio}
                onToggleHapticAudio={() => setIncludeHapticAudio((v) => !v)}
                includeBuildMatrix={includeBuildMatrix}
                onToggleBuildMatrix={() => setIncludeBuildMatrix((v) => !v)}
                compiledMasterPrompt={compiledMasterPrompt}
              />
            </div>
          </aside>
        </div>
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="max-w-[1440px] mx-auto px-4 sm:px-8 py-8 border-t border-slate-300/40 dark:border-emerald-400/15 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 dark:text-emerald-200/65">
        <span>
          Aether Tactile Studio · System Projektowania Dotyku, Szkła, Dźwięku i Mapy Ekranów
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => handleSelectTab('start')}
            className="underline hover:text-slate-800 dark:hover:text-emerald-100 cursor-pointer whitespace-nowrap"
          >
            Zapis lokalny i obraz frontendu
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => setPluginsModalOpen(true)}
            className="underline hover:text-slate-800 dark:hover:text-emerald-100 cursor-pointer whitespace-nowrap"
          >
            Wtyczki do innych aplikacji ({activePluginsCount})
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => setLocalhostModalOpen(true)}
            className="underline hover:text-slate-800 dark:hover:text-emerald-100 cursor-pointer whitespace-nowrap"
          >
            Host prezentacji Localhost:4173
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => setGitHubExportModalOpen(true)}
            className="underline hover:text-slate-800 dark:hover:text-emerald-100 cursor-pointer whitespace-nowrap"
          >
            Eksportuj repozytorium na GitHub
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => openAuthModal('offline')}
            className="underline hover:text-slate-800 dark:hover:text-emerald-100 cursor-pointer whitespace-nowrap"
          >
            Pobierz aplikację Offline (.html)
          </button>
        </div>
      </footer>

      {/* Mobile QR Code Haptics Testing Modal */}
      <MobileQrHapticsModal
        open={mobileQrModalOpen}
        onClose={() => setMobileQrModalOpen(false)}
      />

      {/* Localhost Frontend Presentation Host & Server Builder Modal */}
      <LocalhostPresentationModal />

      {/* External Application Plugins Modal */}
      <ExternalPluginsModal />

      {/* GitHub Repository Export Modal (Description Package + GitHub OAuth/PAT Push + Instant Git .zip Download) */}
      <GitHubRepoExportModal compiledMasterPrompt={compiledMasterPrompt} />

      {/* Built-in Studio AI Account Registration & Standalone Offline HTML Generator Modal */}
      <StudioAuthAndOfflineModal />

      {/* Subtle Offline / Standalone File Connectivity Indicator */}
      <OfflineConnectivityBanner />
    </div>
  );
};

export default function App() {
  return (
    <StudioProvider>
      <StudioShell />
    </StudioProvider>
  );
}
