import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  FileCode2,
  FileText,
  FolderOpen,
  HardDriveDownload,
  ImagePlus,
  Layers,
  Palette,
  Plus,
  Server,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import { ImageToFrontendCard } from './ImageToFrontendCard';
import { hapticAudio } from '../lib/hapticAudioEngine';
import {
  FRONTEND_ELEMENT_SHADE_ORDER,
  FRONTEND_ELEMENT_SHADES,
  resolveElementShadeSpec,
} from '../lib/frontendElementShades';
import {
  createWorkingStateFromAssetUrl,
  readImageFileToWorkingState,
} from '../lib/localDiskWorkspace';
import {
  appendCatalogWidgetToNode,
  buildComponentsArrayFromWidgets,
  PROTOTYPE_ZONE_LABELS,
  resolvePrototypeWidgetsForNode,
  TACTILE_UI_CATALOG,
} from '../lib/tactileUiCatalog';
import {
  ElementShadeId,
  PrototypeDropZone,
  PrototypeScreenWidget,
} from '../types/studio';

const ZONE_OPTIONS: PrototypeDropZone[] = ['header', 'main', 'footer'];

export const StartWorkspaceSection: React.FC<{
  onEnterStudioTab: (tab: 'dashboard' | 'screens' | 'ui-library') => void;
}> = ({ onEnterStudioTab }) => {
  const {
    palette,
    depth,
    synth,
    haptic,
    patterns,
    activeScreenMap,
    setActiveScreenMap,
    activePreviewScreenId,
    setActivePreviewScreenId,
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
    generatedElements,
    addAttachedPromptGraphic,
    generatePlanAndMatrixFromFile,
    generateFullFrontendFromUploadedFile,
    setLocalhostModalOpen,
    zeroLimitLocalMode,
    setZeroLimitLocalMode,
    mediaLibrary,
    pulseInteraction,
  } = useStudio();

  const [diskNotice, setDiskNotice] = useState<string | null>(null);
  const [savingDisk, setSavingDisk] = useState<boolean>(false);
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);
  const [analyzingAiPlan, setAnalyzingAiPlan] = useState<boolean>(false);
  const [aiPlanBanner, setAiPlanBanner] = useState<string | null>(null);
  const [uploadedDocMeta, setUploadedDocMeta] = useState<{
    file: File;
    sizeKb: number;
    kindLabel: string;
  } | null>(null);
  const [dragOverUpload, setDragOverUpload] = useState<boolean>(false);
  const [imgBroken, setImgBroken] = useState<boolean>(false);
  const [selectedQuickCatalogId, setSelectedQuickCatalogId] = useState<string>(
    TACTILE_UI_CATALOG[0]?.id || 'btn-primary-cta'
  );
  const [selectedQuickZone, setSelectedQuickZone] =
    useState<PrototypeDropZone>('main');

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const folderFallbackInputRef = useRef<HTMLInputElement | null>(null);

  const isDark = palette === 'emerald-clinic';

  const cardSurfaceStyle: React.CSSProperties = {
    borderRadius: `${depth.borderRadius}px`,
    backdropFilter: `blur(${depth.glassBlur}px)`,
    backgroundColor: isDark
      ? `rgba(11, 34, 29, ${depth.glassOpacity})`
      : `rgba(255, 255, 255, ${depth.glassOpacity})`,
    boxShadow: isDark
      ? `0 ${depth.elevation}px ${depth.blur}px rgba(0,0,0,0.44)`
      : `0 ${depth.elevation}px ${depth.blur}px rgba(88, 76, 148, 0.12)`,
  };

  const activeScreen = useMemo(
    () =>
      activeScreenMap.nodes.find((n) => n.id === activePreviewScreenId) ||
      activeScreenMap.nodes[0],
    [activeScreenMap.nodes, activePreviewScreenId]
  );

  const screenWidgets = useMemo(
    () => (activeScreen ? resolvePrototypeWidgetsForNode(activeScreen) : []),
    [activeScreen]
  );

  const screenGeneratedElements = useMemo(
    () =>
      generatedElements.filter((el) => el.targetScreenId === activeScreen?.id),
    [generatedElements, activeScreen?.id]
  );

  const sampleImages = useMemo(
    () => mediaLibrary.filter((m) => m.mediaType === 'image' && m.src).slice(0, 3),
    [mediaLibrary]
  );

  const handleChooseLocalDiskFolder = async () => {
    setDiskNotice(null);
    const res = await selectLocalDiskDirectory();
    setDiskNotice(res.message);
  };

  const handleFallbackDirectorySelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const firstRel =
      (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath || '';
    const folderName = firstRel.split('/')[0] || 'lokalny-katalog-projektu';
    linkLocalDirectoryNameFallback(folderName);
    setDiskNotice(
      `Powiązano lokalny katalog „${folderName}” (${files.length} plików w katalogu).`
    );

    // If the user's selected folder already contains an image and none is loaded yet, offer seamless load
    if (!workingFrontendImage) {
      const firstImage = Array.from(files).find((f) =>
        f.type.startsWith('image/')
      );
      if (firstImage) {
        try {
          const loaded = await readImageFileToWorkingState(firstImage);
          setWorkingFrontendImage(loaded);
          setImgBroken(false);
        } catch {
          // Ignore optional image preload error
        }
      }
    }
    e.target.value = '';
  };

  const handleManualSaveToDisk = async (forceDownload = false) => {
    setSavingDisk(true);
    setDiskNotice(null);
    try {
      const res = await saveProjectToLocalDiskNow(forceDownload);
      setDiskNotice(res.message);
    } finally {
      setSavingDisk(false);
    }
  };

  const handleUnifiedUploadAndGenerate = async (
    file: File,
    autoBuildFrontend = true
  ) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isImg =
      file.type.startsWith('image/') ||
      ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext);

    setUploadingImage(true);
    setAiPlanBanner(null);
    setImgBroken(false);

    try {
      if (isImg) {
        const state = await readImageFileToWorkingState(file);
        setWorkingFrontendImage(state);
        setUploadedDocMeta({
          file,
          sizeKb: state.compressedSizeKb || Math.max(1, Math.round(file.size / 1024)),
          kindLabel: `Obraz UI (${state.widthPx}×${state.heightPx} px${
            state.originalSizeKb && state.compressedSizeKb
              ? ` · skompresowano ${state.originalSizeKb} KB → ${state.compressedSizeKb} KB`
              : ''
          })`,
        });
        addAttachedPromptGraphic({
          name: state.fileName,
          mimeType: state.mimeType,
          dataUrl: state.dataUrl,
          role: 'uklad-ekranu',
        });
        if (state.regions[0]) {
          markElementAsActivelyModified({
            id: state.regions[0].id,
            kind: 'region',
            label: state.regions[0].label,
            zone: state.regions[0].zone,
            screenId: activeScreen?.id,
            shadeId: state.regions[0].shadeId,
            sourceSurface: 'Obraz referencyjny frontendu',
          });
        }
      } else {
        setUploadedDocMeta({
          file,
          sizeKb: Math.max(1, Math.round(file.size / 1024)),
          kindLabel: `Specyfikacja / Kod (.${ext || 'txt'})`,
        });
      }

      if (autoBuildFrontend) {
        setAnalyzingAiPlan(true);
        const res = await generateFullFrontendFromUploadedFile(file, {
          targetType: 'website-and-webapp',
        });
        setAiPlanBanner(
          `Gotowe: wygenerowano kompletny frontend „${res.buildMatrix.projectTitle}” — ${res.mapProject.nodes.length} ekranów, ${res.createdElements.length} interaktywne moduły .tsx na żywym podglądzie oraz gotowość do prezentacji na Localhost.`
        );
      } else {
        pulseInteraction(0.95);
      }
    } catch (err) {
      setAiPlanBanner(
        err instanceof Error
          ? err.message
          : 'Nie udało się przetworzyć wgranego pliku.'
      );
    } finally {
      setUploadingImage(false);
      setAnalyzingAiPlan(false);
    }
  };

  const handleGenerateAiPlanFromFrontendImage = async () => {
    if (uploadedDocMeta?.file) {
      await handleUnifiedUploadAndGenerate(uploadedDocMeta.file, true);
      return;
    }
    if (!workingFrontendImage) return;
    setAnalyzingAiPlan(true);
    setAiPlanBanner(null);
    try {
      const base64Clean = workingFrontendImage.dataUrl.includes(',')
        ? workingFrontendImage.dataUrl.split(',')[1] || ''
        : workingFrontendImage.dataUrl;
      const res = await generatePlanAndMatrixFromFile({
        fileName: workingFrontendImage.fileName,
        mimeType: workingFrontendImage.mimeType,
        fileSize:
          (workingFrontendImage.compressedSizeKb || 120) * 1024,
        base64Data: base64Clean,
        projectGoal:
          'Odtwórz architekturę ekranów, sekcje i komponenty na podstawie wgranego obrazu frontendu.',
        targetType: 'website-and-webapp',
      });
      setAiPlanBanner(
        `Utworzono mapę „${res.mapProject.name}” (${res.mapProject.nodes.length} ekranów) oraz matrycę budowy bez błędów limitu zapytań.`
      );
      hapticAudio.triggerPress(synth, haptic, patterns, { pitchSemitones: 6 });
    } catch (err) {
      setAiPlanBanner(
        err instanceof Error
          ? err.message
          : 'Nie udało się przeanalizować obrazu frontendu.'
      );
    } finally {
      setAnalyzingAiPlan(false);
    }
  };

  const handleUpdateWidget = (
    widget: PrototypeScreenWidget,
    index: number,
    patch: Partial<PrototypeScreenWidget>
  ) => {
    if (!activeScreen) return;
    const shadeSpec = resolveElementShadeSpec(
      widget.instanceId,
      composedElementShades,
      index
    );

    setActiveScreenMap((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) => {
        if (node.id !== activeScreen.id) return node;
        const curr = resolvePrototypeWidgetsForNode(node);
        const updated = curr.map((w) =>
          w.instanceId === widget.instanceId ? { ...w, ...patch } : w
        );
        return {
          ...node,
          prototypeWidgets: updated,
          components: buildComponentsArrayFromWidgets(updated, node.components),
        };
      }),
    }));

    markElementAsActivelyModified({
      id: widget.instanceId,
      kind: 'widget',
      label: patch.label ?? widget.label,
      zone: patch.zone ?? widget.zone,
      screenId: activeScreen.id,
      shadeId: shadeSpec.id,
      sourceSurface: 'Kompozytor Odcieni (Strona Startowa)',
    });
    hapticAudio.triggerSliderTick(haptic, 0.5);
  };

  const handleAddQuickElement = () => {
    if (!activeScreen) return;
    const catalogItem =
      TACTILE_UI_CATALOG.find((c) => c.id === selectedQuickCatalogId) ||
      TACTILE_UI_CATALOG[0];
    if (!catalogItem) return;

    let addedInstanceId = '';
    let addedLabel = catalogItem.labelPl;

    setActiveScreenMap((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) => {
        if (node.id !== activeScreen.id) return node;
        const updatedNode = appendCatalogWidgetToNode(
          node,
          catalogItem,
          selectedQuickZone
        );
        const list = updatedNode.prototypeWidgets || [];
        const newest = list[list.length - 1];
        if (newest) {
          addedInstanceId = newest.instanceId;
          addedLabel = newest.label;
        }
        return updatedNode;
      }),
    }));

    const nextIdx = screenWidgets.length;
    const assignedShade =
      FRONTEND_ELEMENT_SHADE_ORDER[
        nextIdx % FRONTEND_ELEMENT_SHADE_ORDER.length
      ];
    if (addedInstanceId) {
      setElementCustomShade(addedInstanceId, assignedShade);
      markElementAsActivelyModified({
        id: addedInstanceId,
        kind: 'widget',
        label: addedLabel,
        zone: selectedQuickZone,
        screenId: activeScreen.id,
        shadeId: assignedShade,
        sourceSurface: 'Dodano nowy element w Kompozytorze',
      });
    }
    hapticAudio.triggerPress(synth, haptic, patterns, { pitchSemitones: 4 });
    pulseInteraction(0.85);
  };

  return (
    <div
      onPaste={async (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            const f = items[i].getAsFile();
            if (f) {
              await handleUnifiedUploadAndGenerate(f, true);
              break;
            }
          }
        }
      }}
      className="space-y-6"
    >
      {/* Direct 100% Offline Image-to-Frontend + Graphics Generator right at the top */}
      <ImageToFrontendCard />

      {/* Hero Proposition & Primary Action Card */}
      <section
        style={cardSurfaceStyle}
        className="p-6 sm:p-7 border border-white/80 dark:border-emerald-400/20 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="text-xs text-slate-500 dark:text-emerald-300/80 flex flex-wrap items-center gap-1.5">
              <span>Sekcja Startowa Projektu</span>
              <span aria-hidden="true">·</span>
              <span>Wgrywanie Plików i Obrazów · Generator Zero-Limit · Serwer Localhost</span>
            </div>
            <h1
              style={{ textWrap: 'balance' }}
              className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-emerald-50"
            >
              Wgraj plik lub makietę UI, wygeneruj kompletny frontend i uruchom go na Localhost
            </h1>
            <p className="text-sm text-slate-600 dark:text-emerald-100/80 leading-relaxed">
              Wskaż folder zapisu na dysku, upuść zrzut ekranu (PNG/JPG/WEBP) lub specyfikację
              (PDF/MD/JSON/HTML/TSX) i wygeneruj jednym kliknięciem wieloekranowy frontend bez błędów
              zbyt dużej liczby zapytań — gotowy do prezentacji na wbudowanym hoście `localhost:4173`.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setLocalhostModalOpen(true);
                hapticAudio.triggerPress(synth, haptic, patterns, { pitchSemitones: 4 });
              }}
              className="min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 dark:bg-emerald-500 text-white dark:text-emerald-950 hover:opacity-95 transition-opacity inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Server className="w-4 h-4 shrink-0" />
              <span>Host Prezentacji Localhost</span>
            </button>

            <button
              type="button"
              onClick={() => onEnterStudioTab('dashboard')}
              className="min-h-[44px] px-5 py-2.5 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-emerald-400 text-white dark:text-emerald-950 hover:opacity-95 transition-opacity inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <span>Przejdź do Pulpitu Głównego</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Active Synchronized Color Status Bar */}
        {activeModifiedElement && (
          <div
            style={{
              backgroundColor: isDark
                ? FRONTEND_ELEMENT_SHADES[activeModifiedElement.shadeId].surfaceBgDark
                : FRONTEND_ELEMENT_SHADES[activeModifiedElement.shadeId].surfaceBgLight,
              borderColor:
                FRONTEND_ELEMENT_SHADES[activeModifiedElement.shadeId].activeBorderHex,
            }}
            className="p-3 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                style={{
                  backgroundColor:
                    FRONTEND_ELEMENT_SHADES[activeModifiedElement.shadeId].badgeBgHex,
                  color:
                    FRONTEND_ELEMENT_SHADES[activeModifiedElement.shadeId].badgeTextHex,
                }}
                className="px-2.5 py-0.5 rounded-md font-semibold whitespace-nowrap shrink-0"
              >
                Odcień: {FRONTEND_ELEMENT_SHADES[activeModifiedElement.shadeId].shortNamePl}
              </span>
              <span className="font-medium text-slate-900 dark:text-emerald-50 truncate">
                Aktualnie modyfikowany na podglądzie: „{activeModifiedElement.label}” (
                {PROTOTYPE_ZONE_LABELS[activeModifiedElement.zone]})
              </span>
            </div>
            <button
              type="button"
              onClick={() => markElementAsActivelyModified(null)}
              className="text-[11px] underline text-slate-700 dark:text-emerald-100 cursor-pointer whitespace-nowrap"
            >
              Zakończ podświetlenie
            </button>
          </div>
        )}
      </section>

      {/* Step 01: Local Disk Storage Location Selector */}
      <section
        style={cardSurfaceStyle}
        className="p-6 border border-white/80 dark:border-emerald-400/20 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500 dark:text-emerald-300/80 flex flex-wrap items-center gap-1.5">
              <span>Krok 1 z 3</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {localDiskConfig.lastSavedAt
                  ? `Ostatni zapis: ${localDiskConfig.lastSavedAt} (${localDiskConfig.savedFilesCount} plików)`
                  : 'Oczekuje na wybór folderu dysku'}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-emerald-50 mt-0.5">
              01. Miejsce zapisu danych projektu na lokalnym dysku
            </h2>
          </div>

          <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-emerald-200/85">
            {localDiskConfig.directoryName
              ? `Katalog: ${localDiskConfig.directoryName}/${localDiskConfig.subFolderName}`
              : 'Nie wybrano jeszcze katalogu'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-5 space-y-1.5">
            <label
              htmlFor="local-disk-subfolder-input"
              className="block text-xs font-medium text-slate-700 dark:text-emerald-100"
            >
              Nazwa podkatalogu projektu na dysku
            </label>
            <input
              id="local-disk-subfolder-input"
              type="text"
              value={localDiskConfig.subFolderName}
              onChange={(e) =>
                updateLocalDiskConfig({ subFolderName: e.target.value })
              }
              placeholder="aether-frontend-workspace"
              className="w-full h-10 px-3 rounded-xl text-xs font-mono bg-white/90 dark:bg-emerald-950/85 border border-slate-200/90 dark:border-emerald-400/25 text-slate-900 dark:text-emerald-50"
            />
          </div>

          <div className="md:col-span-7 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleChooseLocalDiskFolder}
              className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 dark:bg-emerald-400 text-white dark:text-emerald-950 hover:opacity-95 inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <FolderOpen className="w-4 h-4 shrink-0" />
              <span>Wybierz folder na dysku</span>
            </button>

            {/* Fallback folder linker that also works in cross-origin preview iframes */}
            <input
              ref={folderFallbackInputRef}
              type="file"
              // @ts-expect-error webkitdirectory is standard across Chromium/Firefox/Safari
              webkitdirectory="true"
              directory=""
              multiple
              className="hidden"
              onChange={handleFallbackDirectorySelected}
            />
            <button
              type="button"
              onClick={() => folderFallbackInputRef.current?.click()}
              className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-medium bg-white/90 dark:bg-emerald-900/75 border border-slate-200/85 dark:border-emerald-400/25 text-slate-800 dark:text-emerald-50 hover:opacity-95 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 shrink-0" />
              <span>Powiąż istniejący katalog</span>
            </button>

            <button
              type="button"
              disabled={savingDisk}
              onClick={() => handleManualSaveToDisk(false)}
              className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-emerald-800 text-white dark:text-emerald-50 hover:opacity-95 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              <HardDriveDownload className="w-3.5 h-3.5 shrink-0" />
              <span>{savingDisk ? 'Zapisywanie...' : 'Zapisz na dysku teraz'}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5 pt-1 text-xs text-slate-700 dark:text-emerald-100">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={localDiskConfig.autoSaveOnChange}
              onChange={(e) =>
                updateLocalDiskConfig({ autoSaveOnChange: e.target.checked })
              }
              className="rounded accent-indigo-600 dark:accent-emerald-400"
            />
            <span>Automatyczny zapis zmian na wybranym dysku lokalnym</span>
          </label>

          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={localDiskConfig.saveImagesAndTsx}
              onChange={(e) =>
                updateLocalDiskConfig({ saveImagesAndTsx: e.target.checked })
              }
              className="rounded accent-indigo-600 dark:accent-emerald-400"
            />
            <span>Zapisuj wgrany obraz frontendu, mapę odcieni i komponenty .tsx</span>
          </label>
        </div>

        {(diskNotice || localDiskConfig.statusNote) && (
          <div className="p-3 rounded-xl bg-white/75 dark:bg-emerald-950/65 border border-slate-200/80 dark:border-emerald-400/20 text-xs text-slate-700 dark:text-emerald-100 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300 shrink-0" />
              <span>{diskNotice || localDiskConfig.statusNote}</span>
            </span>
            {localDiskConfig.accessMode !== 'fs-handle-readwrite' && (
              <button
                type="button"
                onClick={() => handleManualSaveToDisk(true)}
                className="underline font-medium text-indigo-600 dark:text-emerald-300 cursor-pointer whitespace-nowrap"
              >
                Pobierz plik zapisu bezpośrednio
              </button>
            )}
          </div>
        )}
      </section>

      {/* Step 02: Unified File & UI Image Upload + 1-Click Complete Frontend Generation */}
      <section
        style={cardSurfaceStyle}
        className="p-6 border border-white/80 dark:border-emerald-400/20 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500 dark:text-emerald-300/80 flex flex-wrap items-center gap-1.5 font-mono tabular-nums">
              <span>Krok 2 z 3</span>
              <span aria-hidden="true">·</span>
              <span>
                {workingFrontendImage
                  ? `${workingFrontendImage.fileName} (${workingFrontendImage.widthPx}×${workingFrontendImage.heightPx} px${
                      workingFrontendImage.compressedSizeKb
                        ? ` · ${workingFrontendImage.compressedSizeKb} KB`
                        : ''
                    })`
                  : uploadedDocMeta
                    ? `${uploadedDocMeta.file.name} (${uploadedDocMeta.sizeKb} KB)`
                    : 'Obrazy UI (PNG/JPG/WEBP) + Dokumenty i Kod (PDF/MD/TXT/JSON/HTML/TSX)'}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-emerald-50 mt-0.5">
              02. Wgraj obraz makiety lub plik specyfikacji → Wygeneruj kompletny frontend
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="min-h-[40px] px-3 py-2 rounded-xl text-xs font-medium bg-white/85 dark:bg-emerald-950/75 border border-slate-200/85 dark:border-emerald-400/25 text-slate-800 dark:text-emerald-100 inline-flex items-center gap-2 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={zeroLimitLocalMode}
                onChange={(e) => {
                  setZeroLimitLocalMode(e.target.checked);
                  hapticAudio.triggerPress(synth, haptic, patterns);
                }}
                className="rounded accent-indigo-600 dark:accent-emerald-400"
              />
              <span>Tryb Zero-Limit (0 ms, bez limitów zapytań)</span>
            </label>

            <input
              ref={imageInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.md,.markdown,.txt,.json,.csv,.html,.htm,.tsx,.ts,.jsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void handleUnifiedUploadAndGenerate(file, true);
                  e.target.value = '';
                }
              }}
            />
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={uploadingImage || analyzingAiPlan}
              className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 dark:bg-emerald-400 text-white dark:text-emerald-950 hover:opacity-95 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              <ImagePlus className="w-4 h-4 shrink-0" />
              <span>
                {uploadingImage || analyzingAiPlan
                  ? 'Przetwarzanie i budowa frontendu...'
                  : workingFrontendImage || uploadedDocMeta
                    ? 'Wgraj nowy plik i przebuduj frontend'
                    : 'Wybierz plik lub obraz i zbuduj frontend'}
              </span>
            </button>

            {(workingFrontendImage || uploadedDocMeta) && (
              <button
                type="button"
                disabled={analyzingAiPlan}
                onClick={handleGenerateAiPlanFromFrontendImage}
                className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/90 dark:bg-emerald-900/75 border border-slate-200/85 dark:border-emerald-400/25 text-slate-900 dark:text-emerald-50 hover:opacity-95 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {analyzingAiPlan
                    ? 'Budowanie ekranów i modułów...'
                    : 'Przebuduj ekrany i moduły .tsx'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setLocalhostModalOpen(true)}
              className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-emerald-800 text-white dark:text-emerald-50 hover:opacity-95 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Server className="w-3.5 h-3.5 shrink-0" />
              <span>Otwórz Localhost</span>
            </button>
          </div>
        </div>

        {/* Clear 3-Step Upload & Generation Pipeline Indicator */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="p-3 rounded-xl bg-white/75 dark:bg-emerald-950/60 border border-slate-200/80 dark:border-emerald-400/20 flex items-center justify-between gap-2">
            <span className="font-medium text-slate-800 dark:text-emerald-100">
              1. Odczyt i kompresja pliku
            </span>
            <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-emerald-300/85">
              {workingFrontendImage || uploadedDocMeta ? 'Załadowano' : 'Oczekuje'}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-white/75 dark:bg-emerald-950/60 border border-slate-200/80 dark:border-emerald-400/20 flex items-center justify-between gap-2">
            <span className="font-medium text-slate-800 dark:text-emerald-100">
              2. Synteza ekranów i .tsx
            </span>
            <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-emerald-300/85">
              {analyzingAiPlan
                ? 'W toku...'
                : `${activeScreenMap.nodes.length} ekr. · ${generatedElements.length} .tsx`}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-white/75 dark:bg-emerald-950/60 border border-slate-200/80 dark:border-emerald-400/20 flex items-center justify-between gap-2">
            <span className="font-medium text-slate-800 dark:text-emerald-100">
              3. Ochrona przed limitem 429
            </span>
            <span className="font-mono tabular-nums text-[11px] text-emerald-700 dark:text-emerald-300">
              {zeroLimitLocalMode ? 'Silnik lokalny (0 ms)' : 'Auto-Fallback aktywny'}
            </span>
          </div>
        </div>

        {aiPlanBanner && (
          <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/45 border border-emerald-200 dark:border-emerald-400/30 text-xs text-emerald-900 dark:text-emerald-100 flex flex-wrap items-center justify-between gap-3">
            <span>{aiPlanBanner}</span>
            <button
              type="button"
              onClick={() => setLocalhostModalOpen(true)}
              className="px-3 py-1.5 rounded-lg font-semibold bg-emerald-800 dark:bg-emerald-400 text-white dark:text-emerald-950 cursor-pointer whitespace-nowrap"
            >
              Zobacz na Localhost:4173
            </button>
          </div>
        )}

        {/* Always-Visible Dropzone when no image is loaded OR compact drop bar when loaded */}
        {!workingFrontendImage ? (
          <div
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
                if (!dragOverUpload) setDragOverUpload(true);
              }
            }}
            onDragLeave={() => setDragOverUpload(false)}
            onDrop={(e) => {
              setDragOverUpload(false);
              const file = e.dataTransfer.files?.[0];
              if (file) {
                e.preventDefault();
                void handleUnifiedUploadAndGenerate(file, true);
              }
            }}
            onClick={() => imageInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                imageInputRef.current?.click();
              }
            }}
            className={`p-8 rounded-2xl border-2 border-dashed transition-all text-center space-y-4 cursor-pointer ${
              dragOverUpload
                ? 'border-indigo-500 bg-indigo-500/10 dark:border-emerald-300 dark:bg-emerald-900/45'
                : 'border-slate-300/90 dark:border-emerald-400/35 bg-white/65 dark:bg-emerald-950/45 hover:bg-white/90 dark:hover:bg-emerald-950/70'
            }`}
          >
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 dark:bg-emerald-400/15 text-indigo-600 dark:text-emerald-300 mx-auto flex items-center justify-center">
              <Upload className="w-6 h-6" />
            </div>

            <div className="space-y-1.5 max-w-xl mx-auto">
              <p className="text-sm sm:text-base font-semibold text-slate-900 dark:text-emerald-50">
                {uploadedDocMeta
                  ? `Załadowano plik: ${uploadedDocMeta.file.name} (${uploadedDocMeta.kindLabel})`
                  : 'Kliknij tutaj lub upuść plik makiety / specyfikacji (albo wklej obraz Ctrl+V)'}
              </p>
              <p className="text-xs text-slate-600 dark:text-emerald-200/80 leading-relaxed">
                Obsługiwane jednym kliknięciem: <strong>PNG, JPG, WEBP, GIF</strong> (automatyczna
                kompresja obrazu zapobiegająca błędom sieciowym) oraz <strong>PDF, Markdown (.md), TXT, JSON, CSV, HTML, TSX</strong>.
                System od razu wygeneruje mapę ekranów, matrycę budowy i żywe moduły frontendu po prawej stronie.
              </p>
            </div>

            <div
              onClick={(e) => e.stopPropagation()}
              className="pt-2 flex flex-wrap items-center justify-center gap-2"
            >
              <button
                type="button"
                onClick={async () => {
                  const demoContent = `# Platforma Medyczna i Portal Rezerwacji AetherClinic\n- Strona główna z kwalifikatorem wizyt i cennikiem zabiegów\n- Panel pacjenta (/portal) z kalendarzem rezerwacji i wynikami badań\n- Konsola specjalisty (/gabinet) z harmonogramem przyjęć`;
                  const demoFile = new File(
                    [demoContent],
                    'specyfikacja-frontendu-demo.md',
                    { type: 'text/markdown' }
                  );
                  await handleUnifiedUploadAndGenerate(demoFile, true);
                }}
                className="min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-emerald-400 text-white dark:text-emerald-950 hover:opacity-95 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Przetestuj 1-klikiem z gotowego pliku .md</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  const demoJson = JSON.stringify(
                    {
                      project: 'Vanguard SaaS Analytics',
                      websiteSections: ['Hero Kokpitu KPI', 'Porównanie Planów B2B'],
                      webAppModules: [
                        { route: '/app/raporty', role: 'Analityk', features: ['Filtry kohortowe', 'Eksport CSV'] },
                        { route: '/app/alerty', role: 'Manager', features: ['Progi anomalii', 'Powiadomienia'] },
                      ],
                    },
                    null,
                    2
                  );
                  const demoFile = new File([demoJson], 'architektura-saas.json', {
                    type: 'application/json',
                  });
                  await handleUnifiedUploadAndGenerate(demoFile, true);
                }}
                className="min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-medium bg-white dark:bg-emerald-900/80 border border-slate-200/85 dark:border-emerald-400/25 text-slate-800 dark:text-emerald-50 hover:opacity-95 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <FileCode2 className="w-3.5 h-3.5" />
                <span>Przetestuj z pliku architektury .json</span>
              </button>

              {sampleImages.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={async () => {
                    const state = await createWorkingStateFromAssetUrl({
                      title: sample.title,
                      src: sample.src,
                    });
                    setWorkingFrontendImage(state);
                    setImgBroken(false);
                    hapticAudio.triggerPress(synth, haptic, patterns);
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-medium bg-white dark:bg-emerald-900/75 border border-slate-200/85 dark:border-emerald-400/25 text-slate-800 dark:text-emerald-50 hover:opacity-95 cursor-pointer whitespace-nowrap"
                >
                  Wzorzec UI: {sample.title}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Interactive Frontend Reference Canvas with Synchronized Colored Region Overlays */}
            <div className="relative rounded-2xl overflow-hidden border border-slate-300/80 dark:border-emerald-400/25 bg-slate-900">
              {!imgBroken ? (
                <img
                  src={workingFrontendImage.dataUrl}
                  alt={workingFrontendImage.fileName}
                  referrerPolicy="no-referrer"
                  onError={() => setImgBroken(true)}
                  className="w-full max-h-[420px] object-contain mx-auto block select-none"
                />
              ) : (
                <div className="h-56 flex items-center justify-center text-xs text-slate-300">
                  Podgląd obrazu referencyjnego ({workingFrontendImage.fileName})
                </div>
              )}

              {/* Shaded Regions Mapped onto the Uploaded Frontend Image */}
              <div className="absolute inset-0 pointer-events-none">
                {workingFrontendImage.regions.map((reg) => {
                  const shade = FRONTEND_ELEMENT_SHADES[reg.shadeId];
                  const isHighlighted =
                    activeModifiedElement?.id === reg.id ||
                    activeModifiedElement?.zone === reg.zone;
                  return (
                    <button
                      key={reg.id}
                      type="button"
                      onClick={() => {
                        markElementAsActivelyModified({
                          id: reg.id,
                          kind: 'region',
                          label: reg.label,
                          zone: reg.zone,
                          screenId: activeScreen?.id,
                          shadeId: reg.shadeId,
                          sourceSurface: 'Strefa na obrazie frontendu',
                        });
                        hapticAudio.triggerPress(synth, haptic, patterns, {
                          pitchSemitones: 2,
                        });
                      }}
                      style={{
                        left: `${reg.xPct}%`,
                        top: `${reg.yPct}%`,
                        width: `${reg.wPct}%`,
                        height: `${reg.hPct}%`,
                        borderColor: shade.activeBorderHex,
                        backgroundColor: isHighlighted
                          ? shade.activeOverlayFill
                          : 'rgba(15, 23, 42, 0.08)',
                        boxShadow: isHighlighted ? shade.activeGlowShadow : undefined,
                      }}
                      className="pointer-events-auto absolute rounded-xl border-2 transition-opacity flex items-start justify-between p-1.5 text-left cursor-pointer"
                    >
                      <span
                        style={{
                          backgroundColor: shade.badgeBgHex,
                          color: shade.badgeTextHex,
                        }}
                        className="px-2 py-0.5 rounded-md text-[10px] font-semibold shadow-sm truncate max-w-full"
                      >
                        {shade.shortNamePl}: {reg.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Region List & Quick Add Region */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-700 dark:text-emerald-100">
                Strefy na wgranym obrazie frontendu (kliknij strefę, aby podświetlić odpowiadające elementy na podglądzie):
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const nextShade =
                      FRONTEND_ELEMENT_SHADE_ORDER[
                        workingFrontendImage.regions.length %
                          FRONTEND_ELEMENT_SHADE_ORDER.length
                      ];
                    const created = addFrontendImageRegion({
                      label: `Nowa sekcja UI #${workingFrontendImage.regions.length + 1}`,
                      zone: 'main',
                      xPct: 12,
                      yPct: 30,
                      wPct: 45,
                      hPct: 24,
                      shadeId: nextShade,
                    });
                    markElementAsActivelyModified({
                      id: created.id,
                      kind: 'region',
                      label: created.label,
                      zone: created.zone,
                      screenId: activeScreen?.id,
                      shadeId: created.shadeId,
                      sourceSurface: 'Nowa strefa obrazu frontendu',
                    });
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white/90 dark:bg-emerald-900/75 border border-slate-200/85 dark:border-emerald-400/25 text-slate-800 dark:text-emerald-50 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Dodaj strefę na obrazie</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWorkingFrontendImage(null)}
                  className="px-2.5 py-1.5 rounded-xl text-xs text-rose-600 dark:text-rose-300 hover:underline cursor-pointer whitespace-nowrap"
                >
                  Usuń obraz
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {workingFrontendImage.regions.map((reg) => {
                const shade = FRONTEND_ELEMENT_SHADES[reg.shadeId];
                const isMod = activeModifiedElement?.id === reg.id;
                return (
                  <div
                    key={reg.id}
                    onClick={() =>
                      markElementAsActivelyModified({
                        id: reg.id,
                        kind: 'region',
                        label: reg.label,
                        zone: reg.zone,
                        screenId: activeScreen?.id,
                        shadeId: reg.shadeId,
                        sourceSurface: 'Edycja strefy obrazu',
                      })
                    }
                    style={{
                      backgroundColor: isDark
                        ? shade.surfaceBgDark
                        : shade.surfaceBgLight,
                      borderColor: isMod
                        ? shade.activeBorderHex
                        : isDark
                          ? shade.idleBorderDark
                          : shade.idleBorderLight,
                      boxShadow: isMod ? shade.activeGlowShadow : undefined,
                    }}
                    className="p-3 rounded-2xl border space-y-2 transition-shadow cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={reg.label}
                        aria-label="Nazwa strefy obrazu"
                        onChange={(e) => {
                          updateFrontendImageRegion(reg.id, {
                            label: e.target.value,
                          });
                          markElementAsActivelyModified({
                            id: reg.id,
                            kind: 'region',
                            label: e.target.value,
                            zone: reg.zone,
                            screenId: activeScreen?.id,
                            shadeId: reg.shadeId,
                            sourceSurface: 'Edycja nazwy strefy obrazu',
                          });
                        }}
                        className="flex-1 min-w-0 h-7 px-2 rounded-lg text-xs font-semibold bg-white/85 dark:bg-emerald-950/80 border border-slate-200/70 dark:border-emerald-400/20 text-slate-900 dark:text-emerald-50"
                      />
                      <select
                        aria-label="Powiązana strefa ekranu"
                        value={reg.zone}
                        onChange={(e) => {
                          const z = e.target.value as PrototypeDropZone;
                          updateFrontendImageRegion(reg.id, { zone: z });
                          markElementAsActivelyModified({
                            id: reg.id,
                            kind: 'region',
                            label: reg.label,
                            zone: z,
                            screenId: activeScreen?.id,
                            shadeId: reg.shadeId,
                            sourceSurface: 'Zmiana strefy docelowej obrazu',
                          });
                        }}
                        className="h-7 px-2 rounded-lg text-[11px] bg-white/85 dark:bg-emerald-950/80 border border-slate-200/70 dark:border-emerald-400/20 text-slate-800 dark:text-emerald-100"
                      >
                        {ZONE_OPTIONS.map((z) => (
                          <option key={z} value={z}>
                            {PROTOTYPE_ZONE_LABELS[z]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFrontendImageRegion(reg.id);
                        }}
                        aria-label={`Usuń strefę ${reg.label}`}
                        className="p-1 text-slate-500 hover:text-rose-600 dark:text-emerald-200/75 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-1">
                        {FRONTEND_ELEMENT_SHADE_ORDER.map((sId) => {
                          const sSpec = FRONTEND_ELEMENT_SHADES[sId];
                          const selected = reg.shadeId === sId;
                          return (
                            <button
                              key={sId}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateFrontendImageRegion(reg.id, { shadeId: sId });
                                markElementAsActivelyModified({
                                  id: reg.id,
                                  kind: 'region',
                                  label: reg.label,
                                  zone: reg.zone,
                                  screenId: activeScreen?.id,
                                  shadeId: sId,
                                  sourceSurface: 'Zmiana odcienia strefy',
                                });
                              }}
                              title={sSpec.labelPl}
                              style={{ backgroundColor: sSpec.badgeBgHex }}
                              className={`w-5 h-5 rounded-md cursor-pointer transition-transform ${
                                selected ? 'ring-2 ring-offset-1 ring-slate-900 dark:ring-white scale-110' : 'opacity-70 hover:opacity-100'
                              }`}
                            />
                          );
                        })}
                      </div>

                      <span className="font-mono tabular-nums text-slate-600 dark:text-emerald-200/80">
                        X:{reg.xPct}% Y:{reg.yPct}% · {reg.wPct}×{reg.hPct}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Step 03: Multi-Shade Composed Elements Matrix Synchronized Live with Preview */}
      <section
        style={cardSurfaceStyle}
        className="p-6 border border-white/80 dark:border-emerald-400/20 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500 dark:text-emerald-300/80 flex flex-wrap items-center gap-1.5">
              <span>Krok 3 z 3</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {screenWidgets.length + screenGeneratedElements.length} komponowanych elementów na ekranie
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-emerald-50 mt-0.5">
              03. Komponowane elementy w różnych odcieniach z synchronizacją na podglądzie
            </h2>
            <p className="text-xs text-slate-600 dark:text-emerald-100/75 mt-1">
              Każdy komponowany element posiada własny odcień powierzchni frontendu. Kliknięcie lub
              edycja dowolnego parametru natychmiast zaznacza ten sam element identycznym kolorem
              na podglądzie modelu frontendu.
            </p>
          </div>

          <select
            aria-label="Wybierz ekran do kompozycji odcieni"
            value={activeScreen?.id || ''}
            onChange={(e) => setActivePreviewScreenId(e.target.value)}
            className="h-9 px-3 rounded-xl text-xs font-medium bg-white/90 dark:bg-emerald-950/85 border border-slate-200/85 dark:border-emerald-400/25 text-slate-900 dark:text-emerald-50 cursor-pointer"
          >
            {activeScreenMap.nodes.map((node, i) => (
              <option key={node.id} value={node.id}>
                Ekran {i + 1}: {node.title}
              </option>
            ))}
          </select>
        </div>

        {/* Quick Add Composed Element Bar */}
        <div className="p-3.5 rounded-2xl bg-white/70 dark:bg-emerald-950/55 border border-slate-200/80 dark:border-emerald-400/20 flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-medium text-slate-700 dark:text-emerald-100 inline-flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            <span>Skomponuj nowy element na ekranie:</span>
          </span>

          <select
            aria-label="Wybierz komponent z katalogu"
            value={selectedQuickCatalogId}
            onChange={(e) => setSelectedQuickCatalogId(e.target.value)}
            className="h-9 px-2.5 rounded-xl text-xs bg-white dark:bg-emerald-950 border border-slate-200/85 dark:border-emerald-400/25 text-slate-900 dark:text-emerald-50 max-w-[240px]"
          >
            {TACTILE_UI_CATALOG.map((item) => (
              <option key={item.id} value={item.id}>
                {item.labelPl}
              </option>
            ))}
          </select>

          <select
            aria-label="Docelowa strefa osadzenia"
            value={selectedQuickZone}
            onChange={(e) => setSelectedQuickZone(e.target.value as PrototypeDropZone)}
            className="h-9 px-2.5 rounded-xl text-xs bg-white dark:bg-emerald-950 border border-slate-200/85 dark:border-emerald-400/25 text-slate-900 dark:text-emerald-50"
          >
            {ZONE_OPTIONS.map((z) => (
              <option key={z} value={z}>
                {PROTOTYPE_ZONE_LABELS[z]}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleAddQuickElement}
            className="min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-emerald-400 text-white dark:text-emerald-950 hover:opacity-95 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Dodaj i przypisz odcień</span>
          </button>
        </div>

        {/* Distinctly Shaded Composed Elements Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {screenGeneratedElements.map((genEl, idx) => {
            const shade = resolveElementShadeSpec(
              genEl.id,
              composedElementShades,
              idx
            );
            const isActivelyMod = activeModifiedElement?.id === genEl.id;

            return (
              <div
                key={genEl.id}
                onClick={() =>
                  markElementAsActivelyModified({
                    id: genEl.id,
                    kind: 'generated',
                    label: genEl.name,
                    zone: genEl.targetZone,
                    screenId: genEl.targetScreenId,
                    shadeId: shade.id,
                    sourceSurface: 'Karta wygenerowanego modułu .tsx',
                  })
                }
                style={{
                  backgroundColor: isDark
                    ? shade.surfaceBgDark
                    : shade.surfaceBgLight,
                  borderColor: isActivelyMod
                    ? shade.activeBorderHex
                    : isDark
                      ? shade.idleBorderDark
                      : shade.idleBorderLight,
                  boxShadow: isActivelyMod ? shade.activeGlowShadow : undefined,
                }}
                className="p-4 rounded-2xl border space-y-3 transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-600 dark:text-emerald-200/85 flex items-center gap-1.5">
                      <span
                        style={{
                          backgroundColor: shade.badgeBgHex,
                          color: shade.badgeTextHex,
                        }}
                        className="px-2 py-0.5 rounded font-semibold"
                      >
                        {shade.shortNamePl}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono truncate">{genEl.fileName}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-emerald-50 mt-1 truncate">
                      {genEl.headline || genEl.name}
                    </h3>
                  </div>

                  {isActivelyMod && (
                    <span
                      style={{
                        backgroundColor: shade.badgeBgHex,
                        color: shade.badgeTextHex,
                      }}
                      className="px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap shrink-0"
                    >
                      Modyfikowany
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-slate-600 dark:text-emerald-200/80" />
                    {FRONTEND_ELEMENT_SHADE_ORDER.map((sId) => {
                      const sSpec = FRONTEND_ELEMENT_SHADES[sId];
                      return (
                        <button
                          key={sId}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setElementCustomShade(genEl.id, sId);
                            markElementAsActivelyModified({
                              id: genEl.id,
                              kind: 'generated',
                              label: genEl.name,
                              zone: genEl.targetZone,
                              screenId: genEl.targetScreenId,
                              shadeId: sId,
                              sourceSurface: 'Zmiana odcienia modułu .tsx',
                            });
                          }}
                          title={sSpec.labelPl}
                          style={{ backgroundColor: sSpec.badgeBgHex }}
                          className={`w-5 h-5 rounded-md cursor-pointer ${
                            shade.id === sId
                              ? 'ring-2 ring-offset-1 ring-slate-900 dark:ring-white scale-110'
                              : 'opacity-70 hover:opacity-100'
                          }`}
                        />
                      );
                    })}
                  </div>
                  <span className="text-[11px] font-mono text-slate-700 dark:text-emerald-200">
                    {PROTOTYPE_ZONE_LABELS[genEl.targetZone]}
                  </span>
                </div>
              </div>
            );
          })}

          {screenWidgets.map((widget, idx) => {
            const shade = resolveElementShadeSpec(
              widget.instanceId,
              composedElementShades,
              idx + screenGeneratedElements.length
            );
            const isActivelyMod = activeModifiedElement?.id === widget.instanceId;

            return (
              <div
                key={widget.instanceId}
                onClick={() =>
                  markElementAsActivelyModified({
                    id: widget.instanceId,
                    kind: 'widget',
                    label: widget.label,
                    zone: widget.zone,
                    screenId: activeScreen?.id,
                    shadeId: shade.id,
                    sourceSurface: 'Kompozytor elementów (Strona Startowa)',
                  })
                }
                style={{
                  backgroundColor: isDark
                    ? shade.surfaceBgDark
                    : shade.surfaceBgLight,
                  borderColor: isActivelyMod
                    ? shade.activeBorderHex
                    : isDark
                      ? shade.idleBorderDark
                      : shade.idleBorderLight,
                  boxShadow: isActivelyMod ? shade.activeGlowShadow : undefined,
                }}
                className="p-4 rounded-2xl border space-y-3 transition-shadow cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    style={{
                      backgroundColor: shade.badgeBgHex,
                      color: shade.badgeTextHex,
                    }}
                    className="px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap"
                  >
                    Odcień: {shade.shortNamePl}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {isActivelyMod && (
                      <span
                        style={{
                          backgroundColor: shade.badgeBgHex,
                          color: shade.badgeTextHex,
                        }}
                        className="px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap"
                      >
                        Modyfikowany teraz
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpdateWidget(widget, idx, {
                          spanCols: widget.spanCols === 2 ? 1 : 2,
                        });
                      }}
                      className="px-2 py-0.5 rounded text-[11px] font-mono tabular-nums bg-white/80 dark:bg-emerald-950/80 border border-slate-200/75 dark:border-emerald-400/20 text-slate-800 dark:text-emerald-100 cursor-pointer"
                    >
                      {widget.spanCols === 2 ? '2 kol.' : '1 kol.'}
                    </button>
                  </div>
                </div>

                {/* Inline Label & Zone Editor (modifying immediately highlights on preview in the same color) */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <input
                    type="text"
                    value={widget.label}
                    aria-label={`Etykieta elementu ${widget.label}`}
                    onFocus={() =>
                      markElementAsActivelyModified({
                        id: widget.instanceId,
                        kind: 'widget',
                        label: widget.label,
                        zone: widget.zone,
                        screenId: activeScreen?.id,
                        shadeId: shade.id,
                        sourceSurface: 'Edycja tekstu elementu',
                      })
                    }
                    onChange={(e) =>
                      handleUpdateWidget(widget, idx, { label: e.target.value })
                    }
                    className="sm:col-span-8 h-8 px-2.5 rounded-xl text-xs font-medium bg-white/90 dark:bg-emerald-950/85 border border-slate-200/80 dark:border-emerald-400/25 text-slate-900 dark:text-emerald-50"
                  />

                  <select
                    aria-label="Strefa elementu"
                    value={widget.zone}
                    onChange={(e) =>
                      handleUpdateWidget(widget, idx, {
                        zone: e.target.value as PrototypeDropZone,
                      })
                    }
                    className="sm:col-span-4 h-8 px-2 rounded-xl text-[11px] bg-white/90 dark:bg-emerald-950/85 border border-slate-200/80 dark:border-emerald-400/25 text-slate-800 dark:text-emerald-100"
                  >
                    {ZONE_OPTIONS.map((z) => (
                      <option key={z} value={z}>
                        {PROTOTYPE_ZONE_LABELS[z]}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Shade Picker Swatches */}
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <div className="flex items-center gap-1.5">
                    {(FRONTEND_ELEMENT_SHADE_ORDER as ElementShadeId[]).map((sId) => {
                      const sSpec = FRONTEND_ELEMENT_SHADES[sId];
                      return (
                        <button
                          key={sId}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setElementCustomShade(widget.instanceId, sId);
                            markElementAsActivelyModified({
                              id: widget.instanceId,
                              kind: 'widget',
                              label: widget.label,
                              zone: widget.zone,
                              screenId: activeScreen?.id,
                              shadeId: sId,
                              sourceSurface: 'Wybór odcienia elementu',
                            });
                          }}
                          title={sSpec.labelPl}
                          style={{ backgroundColor: sSpec.badgeBgHex }}
                          className={`w-5 h-5 rounded-md cursor-pointer transition-transform ${
                            shade.id === sId
                              ? 'ring-2 ring-offset-1 ring-slate-900 dark:ring-white scale-110'
                              : 'opacity-70 hover:opacity-100'
                          }`}
                        />
                      );
                    })}
                  </div>
                  <span className="text-[11px] text-slate-600 dark:text-emerald-200/80 font-mono">
                    {widget.componentName}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
