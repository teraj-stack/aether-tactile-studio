import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Code2,
  Copy,
  Eye,
  GitBranch,
  Image as ImageIcon,
  Layers,
  Monitor,
  Palette,
  Server,
  Smartphone,
  Tablet,
  Trash2,
} from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import { BM_CLINIC_REGION_HAPTICS } from '../lib/bmClinicProktologiaScreen';
import { hapticAudio } from '../lib/hapticAudioEngine';
import {
  DEFAULT_ZONE_SHADES,
  FRONTEND_ELEMENT_SHADES,
  FrontendElementShadeSpec,
  getNextElementShadeId,
  resolveElementShadeSpec,
} from '../lib/frontendElementShades';
import { copyTextToClipboard } from '../lib/screenImagePromptGenerator';
import {
  appendCatalogWidgetToNode,
  buildComponentsArrayFromWidgets,
  hasTactileCatalogDrag,
  parseCatalogItemFromDrop,
  PROTOTYPE_ZONE_LABELS,
  resolvePrototypeWidgetsForNode,
} from '../lib/tactileUiCatalog';
import {
  GeneratedCompleteElement,
  MATERIAL_PROFILES,
  PrototypeDropZone,
  PrototypeScreenWidget,
} from '../types/studio';

const ZONE_ORDER: PrototypeDropZone[] = ['header', 'main', 'footer'];

const GeneratedElementLiveCard: React.FC<{
  element: GeneratedCompleteElement;
  shade: FrontendElementShadeSpec;
  isCurrentlyModified: boolean;
  isDark: boolean;
  onSelectModify: () => void;
  onCycleShade: () => void;
  onTriggerTactile: (semitones?: number) => void;
  onMoveZone: (id: string, nextZone: PrototypeDropZone) => void;
  onRemove: (id: string) => void;
}> = ({
  element,
  shade,
  isCurrentlyModified,
  isDark,
  onSelectModify,
  onCycleShade,
  onTriggerTactile,
  onMoveZone,
  onRemove,
}) => {
  const [sliderValues, setSliderValues] = useState<Record<string, number>>({});
  const [toggleStates, setToggleStates] = useState<Record<string, boolean>>({});
  const [showCode, setShowCode] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [imgBroken, setImgBroken] = useState<boolean>(false);

  const handleCopyCode = async () => {
    const ok = await copyTextToClipboard(element.reactTailwindCode);
    if (ok) {
      setCopiedCode(true);
      onTriggerTactile(4);
      window.setTimeout(() => setCopiedCode(false), 1800);
    }
  };

  return (
    <div
      onClick={onSelectModify}
      onPointerMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100;
        const y = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 100;
        e.currentTarget.style.setProperty('--lx', `${x.toFixed(1)}%`);
        e.currentTarget.style.setProperty('--ly', `${y.toFixed(1)}%`);
      }}
      style={
        {
          '--illum-color': shade.activeBorderHex,
          backgroundColor: isDark ? shade.surfaceBgDark : shade.surfaceBgLight,
          borderColor: isCurrentlyModified
            ? shade.activeBorderHex
            : isDark
              ? shade.idleBorderDark
              : shade.idleBorderLight,
          boxShadow: isCurrentlyModified ? shade.activeGlowShadow : undefined,
        } as React.CSSProperties
      }
      className={`aether-illum-spotlight relative overflow-hidden p-4 rounded-2xl border space-y-3.5 transition-all duration-200 cursor-pointer ${
        isCurrentlyModified ? 'ring-1 ring-white/55 dark:ring-white/25' : ''
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-slate-600 dark:text-emerald-200/85 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCycleShade();
              }}
              title="Kliknij, aby zmienić odcień tego elementu"
              style={{
                backgroundColor: shade.badgeBgHex,
                color: shade.badgeTextHex,
              }}
              className="px-2 py-0.5 rounded font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Palette className="w-2.5 h-2.5" />
              <span>{shade.shortNamePl}</span>
            </button>
            {isCurrentlyModified && (
              <span
                style={{
                  backgroundColor: shade.badgeBgHex,
                  color: shade.badgeTextHex,
                }}
                className="px-2 py-0.5 rounded font-semibold whitespace-nowrap"
              >
                Aktualnie modyfikowany
              </span>
            )}
            <span aria-hidden="true">·</span>
            <span className="font-mono">{element.fileName}</span>
          </div>
          <h4 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-emerald-50 mt-1">
            {element.headline}
          </h4>
          {element.subheadline && (
            <p className="text-xs text-slate-700 dark:text-emerald-100/85 mt-0.5">
              {element.subheadline}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <select
            aria-label="Strefa elementu"
            value={element.targetZone}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) =>
              onMoveZone(element.id, e.target.value as PrototypeDropZone)
            }
            className="h-7 px-2 rounded-lg text-[11px] bg-white/90 dark:bg-emerald-950/85 text-slate-800 dark:text-emerald-100 border border-slate-200/80 dark:border-emerald-400/20 cursor-pointer"
          >
            {ZONE_ORDER.map((z) => (
              <option key={z} value={z}>
                {PROTOTYPE_ZONE_LABELS[z]}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowCode((v) => !v);
              onTriggerTactile(2);
            }}
            title="Podgląd kodu React (.tsx)"
            className="h-7 px-2 rounded-lg text-[11px] font-medium bg-white/90 dark:bg-emerald-950/85 text-slate-800 dark:text-emerald-100 border border-slate-200/80 dark:border-emerald-400/20 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <Code2 className="w-3 h-3" />
            <span>{showCode ? 'UI' : '.tsx'}</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(element.id);
            }}
            aria-label="Usuń wygenerowany element"
            className="h-7 w-7 rounded-lg bg-white/90 dark:bg-emerald-950/85 text-slate-500 hover:text-rose-600 dark:text-emerald-200/75 dark:hover:text-rose-300 inline-flex items-center justify-center cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {element.referenceThumbUrl && !imgBroken && !showCode && (
        <div className="relative h-28 rounded-xl overflow-hidden border border-slate-200/70 dark:border-emerald-400/20 bg-slate-100 dark:bg-emerald-900/40">
          <img
            src={element.referenceThumbUrl}
            alt={element.name}
            referrerPolicy="no-referrer"
            onError={() => setImgBroken(true)}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent flex items-end p-2.5">
            <span className="text-[11px] text-white/95 font-medium">
              Zintegrowana referencja wizualna
            </span>
          </div>
        </div>
      )}

      {showCode ? (
        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-emerald-300/85">
            <span className="font-mono">src/components/generated/{element.fileName}</span>
            <button
              type="button"
              onClick={handleCopyCode}
              className="inline-flex items-center gap-1 text-indigo-700 dark:text-emerald-300 font-medium cursor-pointer whitespace-nowrap"
            >
              {copiedCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{copiedCode ? 'Skopiowano' : 'Kopiuj kod'}</span>
            </button>
          </div>
          <pre className="p-3 rounded-xl bg-slate-950 text-slate-100 text-[11px] font-mono overflow-x-auto max-h-52 leading-relaxed">
            <code>{element.reactTailwindCode}</code>
          </pre>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          {element.controls.map((ctrl) => {
            if (ctrl.kind === 'primary-cta') {
              return (
                <button
                  key={ctrl.id}
                  type="button"
                  onClick={() => {
                    onSelectModify();
                    onTriggerTactile(6);
                  }}
                  style={{ backgroundColor: isDark ? undefined : shade.badgeBgHex }}
                  className={`sm:col-span-2 min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-between gap-2 cursor-pointer transition-opacity hover:opacity-95 whitespace-nowrap ${
                    isDark ? 'bg-emerald-400 text-emerald-950' : 'text-white'
                  }`}
                >
                  <span className="truncate">{ctrl.label}</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                </button>
              );
            }

            if (ctrl.kind === 'slider') {
              const val = sliderValues[ctrl.id] ?? 72;
              return (
                <div
                  key={ctrl.id}
                  className="p-2.5 rounded-xl bg-white/85 dark:bg-emerald-950/75 border border-slate-200/70 dark:border-emerald-400/15 space-y-1"
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-700 dark:text-emerald-100">
                    <span className="truncate font-medium">{ctrl.label}</span>
                    <span className="font-mono tabular-nums">{val}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={val}
                    aria-label={ctrl.label}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setSliderValues((prev) => ({ ...prev, [ctrl.id]: next }));
                      onSelectModify();
                      onTriggerTactile(1);
                    }}
                    className="w-full accent-indigo-600 dark:accent-emerald-400 cursor-pointer"
                  />
                </div>
              );
            }

            if (ctrl.kind === 'toggle') {
              const active = toggleStates[ctrl.id] ?? true;
              return (
                <button
                  key={ctrl.id}
                  type="button"
                  onClick={() => {
                    setToggleStates((prev) => ({ ...prev, [ctrl.id]: !active }));
                    onSelectModify();
                    onTriggerTactile(active ? -2 : 4);
                  }}
                  className="p-2.5 rounded-xl bg-white/85 dark:bg-emerald-950/75 border border-slate-200/70 dark:border-emerald-400/15 flex items-center justify-between gap-2 text-left cursor-pointer"
                >
                  <span className="text-xs font-medium text-slate-800 dark:text-emerald-100 truncate">
                    {ctrl.label}
                  </span>
                  <span
                    className={`text-[11px] font-mono tabular-nums px-2 py-0.5 rounded-md whitespace-nowrap ${
                      active
                        ? isDark
                          ? 'bg-emerald-400 text-emerald-950 font-semibold'
                          : 'bg-slate-900 text-white font-semibold'
                        : 'bg-white/80 dark:bg-emerald-950 text-slate-500 dark:text-emerald-300/75'
                    }`}
                  >
                    {active ? 'Wł.' : 'Wył.'}
                  </span>
                </button>
              );
            }

            if (ctrl.kind === 'metric-tile') {
              return (
                <div
                  key={ctrl.id}
                  className="p-2.5 rounded-xl bg-white/85 dark:bg-emerald-950/75 border border-slate-200/70 dark:border-emerald-400/15 flex items-center justify-between gap-2"
                >
                  <span className="text-[11px] text-slate-600 dark:text-emerald-300/80 truncate">
                    {ctrl.label}
                  </span>
                  <span className="text-xs font-mono font-semibold tabular-nums text-slate-900 dark:text-emerald-100 whitespace-nowrap">
                    {ctrl.valueText || '100%'}
                  </span>
                </div>
              );
            }

            return (
              <button
                key={ctrl.id}
                type="button"
                onClick={() => {
                  onSelectModify();
                  onTriggerTactile(2);
                }}
                className="min-h-[38px] px-3 py-2 rounded-xl text-xs font-medium bg-white/90 dark:bg-emerald-950/80 border border-slate-200/85 dark:border-emerald-400/20 text-slate-800 dark:text-emerald-50 hover:opacity-95 cursor-pointer truncate"
              >
                {ctrl.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const LiveFrontendModelPreview: React.FC = () => {
  const {
    palette,
    depth,
    synth,
    haptic,
    engraving,
    patterns,
    activeScreenMap,
    setActiveScreenMap,
    activePreviewScreenId,
    setActivePreviewScreenId,
    generatedElements,
    removeGeneratedElement,
    moveGeneratedElementTarget,
    setGitHubExportModalOpen,
    setLocalhostModalOpen,
    workingFrontendImage,
    composedElementShades,
    setElementCustomShade,
    activeModifiedElement,
    markElementAsActivelyModified,
    pulseInteraction,
  } = useStudio();

  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [viewMode, setViewMode] = useState<'interactive' | 'reference' | 'code'>(
    workingFrontendImage ? 'reference' : 'interactive'
  );
  const [overlayStyle, setOverlayStyle] = useState<'transparent' | 'subtle' | 'labels'>('transparent');
  const [flashingRegionId, setFlashingRegionId] = useState<string | null>(null);
  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);
  const [expandedPreview, setExpandedPreview] = useState<boolean>(false);
  const [dragOverZone, setDragOverZone] = useState<PrototypeDropZone | null>(null);
  const [widgetSliderVals, setWidgetSliderVals] = useState<Record<string, number>>({});
  const [widgetToggles, setWidgetToggles] = useState<Record<string, boolean>>({});
  const [copiedScreenCode, setCopiedScreenCode] = useState<boolean>(false);
  const [refImgBroken, setRefImgBroken] = useState<boolean>(false);

  const isDark = palette === 'emerald-clinic';
  const matProfile =
    MATERIAL_PROFILES[haptic.material] || MATERIAL_PROFILES['frosted-glass'];

  const activeScreen = useMemo(() => {
    return (
      activeScreenMap.nodes.find((n) => n.id === activePreviewScreenId) ||
      activeScreenMap.nodes[0]
    );
  }, [activeScreenMap.nodes, activePreviewScreenId]);

  const resolvedWidgets = useMemo(
    () => (activeScreen ? resolvePrototypeWidgetsForNode(activeScreen) : []),
    [activeScreen]
  );

  const screenElements = useMemo(
    () =>
      generatedElements.filter((el) => el.targetScreenId === activeScreen?.id),
    [generatedElements, activeScreen?.id]
  );

  const triggerPreviewFeedback = (semitones = 0) => {
    hapticAudio.triggerPress(synth, haptic, patterns, {
      material: activeScreen?.hapticMaterial || haptic.material,
      pitchSemitones: semitones,
    });
    pulseInteraction(0.75);
  };

  const handleDropCatalogWidget = (
    e: React.DragEvent<HTMLDivElement>,
    zone: PrototypeDropZone
  ) => {
    e.preventDefault();
    setDragOverZone(null);
    if (!activeScreen) return;

    const item = parseCatalogItemFromDrop(e);
    if (!item) return;

    let createdInstanceId = '';
    setActiveScreenMap((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) => {
        if (node.id !== activeScreen.id) return node;
        const updated = appendCatalogWidgetToNode(node, item, zone);
        const last = updated.prototypeWidgets?.[updated.prototypeWidgets.length - 1];
        if (last) createdInstanceId = last.instanceId;
        return updated;
      }),
    }));

    if (createdInstanceId) {
      const shadeSpec = resolveElementShadeSpec(
        createdInstanceId,
        composedElementShades,
        resolvedWidgets.length
      );
      markElementAsActivelyModified({
        id: createdInstanceId,
        kind: 'widget',
        label: item.labelPl,
        zone,
        screenId: activeScreen.id,
        shadeId: shadeSpec.id,
        sourceSurface: 'Upuszczono na podglądzie frontendu',
      });
    }
    triggerPreviewFeedback(5);
  };

  const handleRemovePrototypeWidget = (instanceId: string) => {
    if (!activeScreen) return;
    setActiveScreenMap((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) => {
        if (node.id !== activeScreen.id) return node;
        const current = resolvePrototypeWidgetsForNode(node);
        const filtered = current.filter((w) => w.instanceId !== instanceId);
        return {
          ...node,
          prototypeWidgets: filtered,
          components: buildComponentsArrayFromWidgets(filtered, node.components),
        };
      }),
    }));
    if (activeModifiedElement?.id === instanceId) {
      markElementAsActivelyModified(null);
    }
    triggerPreviewFeedback(-2);
  };

  const liveScreenTsxPreview = useMemo(() => {
    if (!activeScreen) return '';
    return `// Podgląd modelu ekranu: ${activeScreen.title} (${activeScreen.route})
import React from 'react';
import { triggerTactileClick } from '../lib/tactileHaptics';
${screenElements
  .map(
    (el) =>
      `import ${el.fileName.replace(/\.tsx$/, '')} from '../components/generated/${el.fileName.replace(/\.tsx$/, '')}';`
  )
  .join('\n')}

export function ScreenView() {
  return (
    <main style={{ borderRadius: '${depth.borderRadius}px', backdropFilter: 'blur(${depth.glassBlur}px)' }} className="p-6 space-y-6">
      <header className="space-y-1">
        <span className="text-xs opacity-70">${matProfile.label} · ${Math.min(158, synth.baseFrequency)} Hz</span>
        <h1 className="text-2xl font-semibold">${activeScreen.title}</h1>
        <p className="text-sm opacity-80">${activeScreen.summary}</p>
      </header>
${screenElements
  .map(
    (el) =>
      `      {/* Strefa: ${el.targetZone} */}\n      <${el.fileName.replace(/\.tsx$/, '')} />`
  )
  .join('\n')}
      {/* Widżety interaktywne na ekranie: ${resolvedWidgets.length} */}
    </main>
  );
}`;
  }, [
    activeScreen,
    screenElements,
    depth.borderRadius,
    depth.glassBlur,
    matProfile.label,
    synth.baseFrequency,
    resolvedWidgets.length,
  ]);

  const cardSurfaceStyle: React.CSSProperties = {
    borderRadius: `${Math.min(28, depth.borderRadius)}px`,
    backdropFilter: `blur(${depth.glassBlur}px)`,
    backgroundColor: isDark
      ? `rgba(11, 34, 29, ${Math.max(0.75, depth.glassOpacity)})`
      : `rgba(255, 255, 255, ${Math.max(0.78, depth.glassOpacity)})`,
    boxShadow: isDark
      ? `0 ${Math.round(depth.elevation * 0.7)}px ${depth.blur}px rgba(0,0,0,0.42)`
      : `0 ${Math.round(depth.elevation * 0.7)}px ${depth.blur}px rgba(88, 76, 148, 0.12)`,
  };

  const renderShadedCompactWidget = (
    w: PrototypeScreenWidget,
    globalIdx: number
  ) => {
    const shade = resolveElementShadeSpec(
      w.instanceId,
      composedElementShades,
      globalIdx + screenElements.length
    );
    const isCurrentlyModified = activeModifiedElement?.id === w.instanceId;

    const selectThisWidget = () => {
      markElementAsActivelyModified({
        id: w.instanceId,
        kind: 'widget',
        label: w.label,
        zone: w.zone,
        screenId: activeScreen?.id,
        shadeId: shade.id,
        sourceSurface: 'Podgląd modelu frontendu',
      });
    };

    const cycleWidgetShade = (e: React.MouseEvent) => {
      e.stopPropagation();
      const nextShade = getNextElementShadeId(shade.id);
      setElementCustomShade(w.instanceId, nextShade);
      markElementAsActivelyModified({
        id: w.instanceId,
        kind: 'widget',
        label: w.label,
        zone: w.zone,
        screenId: activeScreen?.id,
        shadeId: nextShade,
        sourceSurface: 'Zmiana odcienia na podglądzie',
      });
    };

    const wrapperStyle: React.CSSProperties = {
      backgroundColor: isDark ? shade.surfaceBgDark : shade.surfaceBgLight,
      borderColor: isCurrentlyModified
        ? shade.activeBorderHex
        : isDark
          ? shade.idleBorderDark
          : shade.idleBorderLight,
      boxShadow: isCurrentlyModified ? shade.activeGlowShadow : undefined,
    };

    if (w.category === 'sliders') {
      const val = widgetSliderVals[w.instanceId] ?? 65;
      return (
        <div
          key={w.instanceId}
          onClick={selectThisWidget}
          style={wrapperStyle}
          className={`p-3 rounded-xl border space-y-1.5 transition-shadow cursor-pointer ${
            w.spanCols === 2 && viewport !== 'mobile' ? 'sm:col-span-2' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-1.5 text-[10px]">
            <button
              type="button"
              onClick={cycleWidgetShade}
              style={{
                backgroundColor: shade.badgeBgHex,
                color: shade.badgeTextHex,
              }}
              className="px-1.5 py-0.5 rounded font-semibold cursor-pointer whitespace-nowrap"
            >
              {shade.shortNamePl}
            </button>
            {isCurrentlyModified && (
              <span
                style={{
                  backgroundColor: shade.badgeBgHex,
                  color: shade.badgeTextHex,
                }}
                className="px-1.5 py-0.5 rounded font-semibold whitespace-nowrap"
              >
                Modyfikowany
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium text-slate-900 dark:text-emerald-50 truncate">
              {w.label}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="font-mono tabular-nums text-[11px] text-slate-700 dark:text-emerald-200">
                {val}%
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemovePrototypeWidget(w.instanceId);
                }}
                aria-label={`Usuń ${w.label}`}
                className="text-slate-500 hover:text-rose-600 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={val}
            aria-label={w.label}
            onChange={(e) => {
              const v = Number(e.target.value);
              setWidgetSliderVals((prev) => ({ ...prev, [w.instanceId]: v }));
              selectThisWidget();
              hapticAudio.triggerSliderTick(haptic, v / 100);
            }}
            className="w-full accent-indigo-600 dark:accent-emerald-400 cursor-pointer"
          />
        </div>
      );
    }

    if (w.category === 'levers') {
      const isOn = widgetToggles[w.instanceId] ?? true;
      return (
        <div
          key={w.instanceId}
          onClick={selectThisWidget}
          style={wrapperStyle}
          className={`p-3 rounded-xl border space-y-1.5 transition-shadow cursor-pointer ${
            w.spanCols === 2 && viewport !== 'mobile' ? 'sm:col-span-2' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-1.5 text-[10px]">
            <button
              type="button"
              onClick={cycleWidgetShade}
              style={{
                backgroundColor: shade.badgeBgHex,
                color: shade.badgeTextHex,
              }}
              className="px-1.5 py-0.5 rounded font-semibold cursor-pointer whitespace-nowrap"
            >
              {shade.shortNamePl}
            </button>
            {isCurrentlyModified && (
              <span
                style={{
                  backgroundColor: shade.badgeBgHex,
                  color: shade.badgeTextHex,
                }}
                className="px-1.5 py-0.5 rounded font-semibold whitespace-nowrap"
              >
                Modyfikowany
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setWidgetToggles((prev) => ({ ...prev, [w.instanceId]: !isOn }));
                selectThisWidget();
                triggerPreviewFeedback(isOn ? -3 : 4);
              }}
              className="flex-1 flex items-center justify-between gap-2 text-left cursor-pointer min-w-0"
            >
              <span className="text-xs font-medium text-slate-900 dark:text-emerald-50 truncate">
                {w.label}
              </span>
              <span
                className={`px-2 py-0.5 rounded-md text-[11px] font-mono tabular-nums whitespace-nowrap ${
                  isOn
                    ? isDark
                      ? 'bg-emerald-400 text-emerald-950 font-semibold'
                      : 'bg-slate-900 text-white font-semibold'
                    : 'bg-white/80 dark:bg-emerald-950 text-slate-600 dark:text-emerald-200'
                }`}
              >
                {isOn ? 'Aktywny' : 'Spoczynek'}
              </span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRemovePrototypeWidget(w.instanceId);
              }}
              aria-label={`Usuń ${w.label}`}
              className="text-slate-500 hover:text-rose-600 cursor-pointer shrink-0"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      );
    }

    const isPrimaryBtn = w.catalogId === 'btn-primary-cta';
    return (
      <div
        key={w.instanceId}
        onClick={selectThisWidget}
        style={wrapperStyle}
        className={`p-2 rounded-xl border space-y-1.5 transition-shadow cursor-pointer ${
          w.spanCols === 2 && viewport !== 'mobile' ? 'sm:col-span-2' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-1.5 text-[10px] px-0.5">
          <button
            type="button"
            onClick={cycleWidgetShade}
            style={{
              backgroundColor: shade.badgeBgHex,
              color: shade.badgeTextHex,
            }}
            className="px-1.5 py-0.5 rounded font-semibold cursor-pointer whitespace-nowrap"
          >
            {shade.shortNamePl}
          </button>
          <div className="flex items-center gap-1">
            {isCurrentlyModified && (
              <span
                style={{
                  backgroundColor: shade.badgeBgHex,
                  color: shade.badgeTextHex,
                }}
                className="px-1.5 py-0.5 rounded font-semibold whitespace-nowrap"
              >
                Modyfikowany
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRemovePrototypeWidget(w.instanceId);
              }}
              aria-label={`Usuń ${w.label}`}
              className="text-slate-500 hover:text-rose-600 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            selectThisWidget();
            triggerPreviewFeedback(isPrimaryBtn ? 5 : 1);
          }}
          style={
            isPrimaryBtn
              ? { backgroundColor: isDark ? undefined : shade.badgeBgHex }
              : undefined
          }
          className={`w-full min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center justify-between gap-2 transition-opacity hover:opacity-95 cursor-pointer whitespace-nowrap min-w-0 ${
            isPrimaryBtn
              ? isDark
                ? 'bg-emerald-400 text-emerald-950'
                : 'text-white'
              : 'bg-white/90 dark:bg-emerald-950/85 border border-slate-200/85 dark:border-emerald-400/25 text-slate-900 dark:text-emerald-50'
          }`}
        >
          <span className="truncate">{w.label}</span>
          <ArrowRight className="w-3.5 h-3.5 shrink-0 opacity-80" />
        </button>
      </div>
    );
  };

  return (
    <section
      style={cardSurfaceStyle}
      className="p-5 border border-white/80 dark:border-emerald-400/20 space-y-4"
    >
      {/* Top Header & Active Screen Picker */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500 dark:text-emerald-300/80 flex flex-wrap items-center gap-1.5">
            <span>Podgląd Projektowanego Modelu Frontendu</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {matProfile.label} · {Math.min(158, synth.baseFrequency)} Hz
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-emerald-50 mt-0.5">
            Żywa Makieta z Synchronizacją Odcieni Elementów
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setLocalhostModalOpen(true);
              triggerPreviewFeedback(5);
            }}
            className="min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 dark:bg-emerald-400 text-white dark:text-emerald-950 hover:opacity-95 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Server className="w-3.5 h-3.5" />
            <span>Host Localhost</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setGitHubExportModalOpen(true);
              triggerPreviewFeedback(4);
            }}
            className="min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/90 dark:bg-emerald-900/75 border border-slate-200/85 dark:border-emerald-400/25 text-slate-800 dark:text-emerald-50 hover:opacity-95 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>GitHub</span>
          </button>
        </div>
      </div>

      {/* Synchronized Currently Modified Element Banner (Same Color as Modified Element) */}
      {activeModifiedElement && (
        <div
          style={{
            backgroundColor: isDark
              ? FRONTEND_ELEMENT_SHADES[activeModifiedElement.shadeId].surfaceBgDark
              : FRONTEND_ELEMENT_SHADES[activeModifiedElement.shadeId].surfaceBgLight,
            borderColor:
              FRONTEND_ELEMENT_SHADES[activeModifiedElement.shadeId].activeBorderHex,
          }}
          className="p-2.5 rounded-xl border flex items-center justify-between gap-2 text-[11px]"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              style={{
                backgroundColor:
                  FRONTEND_ELEMENT_SHADES[activeModifiedElement.shadeId].badgeBgHex,
                color:
                  FRONTEND_ELEMENT_SHADES[activeModifiedElement.shadeId].badgeTextHex,
              }}
              className="px-2 py-0.5 rounded font-semibold whitespace-nowrap shrink-0"
            >
              {FRONTEND_ELEMENT_SHADES[activeModifiedElement.shadeId].shortNamePl}
            </span>
            <span className="font-medium text-slate-900 dark:text-emerald-50 truncate">
              Modyfikowany teraz: „{activeModifiedElement.label}”
            </span>
          </div>
          <span className="text-[10px] text-slate-600 dark:text-emerald-200/80 whitespace-nowrap shrink-0">
            {PROTOTYPE_ZONE_LABELS[activeModifiedElement.zone]}
          </span>
        </div>
      )}

      {/* Controls Row: Screen Selector + Viewport + Model / Reference Image / Code Switch */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60 dark:border-emerald-400/15">
        <select
          aria-label="Projektowany ekran frontendu"
          value={activeScreen?.id || ''}
          onChange={(e) => {
            setActivePreviewScreenId(e.target.value);
            triggerPreviewFeedback(2);
          }}
          className="h-9 px-3 rounded-xl text-xs font-medium bg-white/90 dark:bg-emerald-950/85 border border-slate-200/85 dark:border-emerald-400/25 text-slate-900 dark:text-emerald-50 max-w-[210px] truncate cursor-pointer"
        >
          {activeScreenMap.nodes.map((node, idx) => (
            <option key={node.id} value={node.id}>
              {idx + 1}. {node.title} ({node.route})
            </option>
          ))}
        </select>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex items-center gap-0.5 p-1 rounded-xl bg-slate-200/75 dark:bg-emerald-950/85">
            {(
              [
                ['desktop', Monitor, 'Desktop'],
                ['tablet', Tablet, 'Tablet'],
                ['mobile', Smartphone, 'Mobile'],
              ] as const
            ).map(([id, Icon, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setViewport(id);
                  triggerPreviewFeedback(1);
                }}
                title={label}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                  viewport === id
                    ? isDark
                      ? 'bg-emerald-400 text-emerald-950'
                      : 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 dark:text-emerald-200/75'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>

          <div className="inline-flex items-center gap-0.5 p-1 rounded-xl bg-slate-200/75 dark:bg-emerald-950/85">
            <button
              type="button"
              onClick={() => setViewMode('interactive')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                viewMode === 'interactive'
                  ? isDark
                    ? 'bg-emerald-400 text-emerald-950'
                    : 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 dark:text-emerald-200/75'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Model</span>
            </button>

            {workingFrontendImage && (
              <button
                type="button"
                onClick={() => setViewMode('reference')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                  viewMode === 'reference'
                    ? isDark
                      ? 'bg-emerald-400 text-emerald-950'
                      : 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 dark:text-emerald-200/75'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Obraz</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setViewMode('code')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                viewMode === 'code'
                  ? isDark
                    ? 'bg-emerald-400 text-emerald-950'
                    : 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 dark:text-emerald-200/75'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Kod</span>
            </button>
          </div>
        </div>
      </div>

      {/* Synchronized Compact Uploaded Frontend Image Reference Strip when in Interactive Model mode */}
      {workingFrontendImage && viewMode === 'interactive' && !refImgBroken && (
        <div className="p-2.5 rounded-2xl bg-white/70 dark:bg-emerald-950/60 border border-slate-200/75 dark:border-emerald-400/20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative w-14 h-10 rounded-lg overflow-hidden bg-slate-900 shrink-0 border border-slate-300/70 dark:border-emerald-400/25">
              <img
                src={workingFrontendImage.dataUrl}
                alt={workingFrontendImage.fileName}
                referrerPolicy="no-referrer"
                onError={() => setRefImgBroken(true)}
                className="w-full h-full object-cover"
              />
              {activeModifiedElement && (
                <div
                  style={{
                    borderColor:
                      FRONTEND_ELEMENT_SHADES[activeModifiedElement.shadeId]
                        .activeBorderHex,
                    backgroundColor:
                      FRONTEND_ELEMENT_SHADES[activeModifiedElement.shadeId]
                        .activeOverlayFill,
                  }}
                  className="absolute inset-0 border-2 rounded-lg"
                />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-slate-900 dark:text-emerald-50 truncate">
                Wgrany obraz frontendu: {workingFrontendImage.fileName}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-emerald-300/80">
                {workingFrontendImage.regions.length} stref odcieni zsynchronizowanych z modelem
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setViewMode('reference')}
            className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white dark:bg-emerald-900/80 border border-slate-200/80 dark:border-emerald-400/25 text-slate-800 dark:text-emerald-100 cursor-pointer whitespace-nowrap shrink-0"
          >
            Pokaż strefy na obrazie
          </button>
        </div>
      )}

      {/* Uploaded Working Frontend Image Full Overlay Mode */}
      {workingFrontendImage && viewMode === 'reference' && (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
            <div className="text-[11px] font-semibold text-slate-800 dark:text-emerald-100 truncate">
              {workingFrontendImage.fileName} · {workingFrontendImage.regions.length} stref
            </div>
            <div className="flex items-center gap-1.5">
              <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-200/75 dark:bg-emerald-900/60 text-[10px]">
                {(
                  [
                    ['transparent', 'Transparentne'],
                    ['subtle', 'Subtelne'],
                    ['labels', 'Etykiety'],
                  ] as const
                ).map(([mode, lbl]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setOverlayStyle(mode)}
                    className={`px-2 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                      overlayStyle === mode
                        ? isDark
                          ? 'bg-emerald-400 text-emerald-950 font-semibold'
                          : 'bg-white text-slate-900 font-semibold shadow-sm'
                        : 'text-slate-600 dark:text-emerald-200/75'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setExpandedPreview(true)}
                className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-indigo-600 dark:bg-emerald-400 text-white dark:text-emerald-950 hover:opacity-95 cursor-pointer whitespace-nowrap"
              >
                Powiększ
              </button>
            </div>
          </div>

          <div className="rounded-3xl overflow-hidden border border-white/60 dark:border-emerald-400/25 shadow-2xl bg-transparent">
            {!refImgBroken ? (
              <div className="relative w-full">
                <img
                  src={workingFrontendImage.dataUrl}
                  alt={workingFrontendImage.fileName}
                  referrerPolicy="no-referrer"
                  onError={() => setRefImgBroken(true)}
                  className="w-full h-auto block select-none"
                />

                <div className="absolute inset-0 pointer-events-none">
                  {workingFrontendImage.regions.map((reg) => {
                    const shade = FRONTEND_ELEMENT_SHADES[reg.shadeId];
                    const regHaptic = BM_CLINIC_REGION_HAPTICS[reg.id];
                    const isMod = activeModifiedElement?.id === reg.id;
                    const isFlashing = flashingRegionId === reg.id;
                    const isHovered = hoveredRegionId === reg.id;
                    return (
                      <button
                        key={reg.id}
                        type="button"
                        title={`${reg.label}${regHaptic ? ` — ${regHaptic.rolePl}` : ''}`}
                        onPointerEnter={() => {
                          setHoveredRegionId(reg.id);
                          if (haptic.enabled) {
                            hapticAudio.triggerMinimalistLowClick('satin-tick-4ms', 0.14);
                          }
                        }}
                        onPointerLeave={() => {
                          setHoveredRegionId((prev) => (prev === reg.id ? null : prev));
                        }}
                        onPointerDown={() => {
                          setFlashingRegionId(reg.id);
                          window.setTimeout(() => {
                            setFlashingRegionId((prev) => (prev === reg.id ? null : prev));
                          }, 220);

                          const chosenSound =
                            haptic.minimalistClickVariant &&
                            haptic.minimalistClickVariant !== 'none'
                              ? haptic.minimalistClickVariant
                              : regHaptic?.soundId;

                          if (chosenSound) {
                            hapticAudio.triggerMinimalistLowClick(
                              chosenSound,
                              Math.max(0.32, haptic.intensity / 100)
                            );
                            pulseInteraction(0.95);
                          } else {
                            triggerPreviewFeedback(2);
                          }

                          if (
                            typeof navigator !== 'undefined' &&
                            'vibrate' in navigator &&
                            regHaptic
                          ) {
                            try {
                              navigator.vibrate(regHaptic.vibrateMs);
                            } catch {
                              // Ignore
                            }
                          }
                        }}
                        onClick={() => {
                          markElementAsActivelyModified({
                            id: reg.id,
                            kind: 'region',
                            label: reg.label,
                            zone: reg.zone,
                            screenId: activeScreen?.id,
                            shadeId: reg.shadeId,
                            sourceSurface: 'Podgląd obrazu frontendu',
                          });
                        }}
                        style={{
                          left: `${reg.xPct}%`,
                          top: `${reg.yPct}%`,
                          width: `${reg.wPct}%`,
                          height: `${reg.hPct}%`,
                          borderColor: isFlashing
                            ? 'rgba(125, 249, 255, 0.95)'
                            : isHovered
                              ? 'rgba(103, 232, 249, 0.72)'
                              : overlayStyle === 'transparent'
                                ? 'rgba(103, 232, 249, 0.14)'
                                : overlayStyle === 'subtle'
                                  ? 'rgba(103, 232, 249, 0.42)'
                                  : shade.activeBorderHex,
                          backgroundColor: isFlashing
                            ? 'rgba(56, 224, 240, 0.28)'
                            : isHovered
                              ? 'rgba(56, 224, 240, 0.11)'
                              : overlayStyle === 'labels' && isMod
                                ? 'rgba(56, 224, 240, 0.14)'
                                : 'transparent',
                          boxShadow: isFlashing
                            ? '0 0 26px rgba(56, 224, 240, 0.78), inset 0 0 18px rgba(255,255,255,0.42)'
                            : isHovered
                              ? '0 0 16px rgba(56, 224, 240, 0.35), inset 0 0 10px rgba(255,255,255,0.16)'
                              : undefined,
                        }}
                        className="pointer-events-auto absolute rounded-2xl border p-1 flex items-end justify-end text-left cursor-pointer transition-all duration-150 active:scale-[0.97]"
                      >
                        {(overlayStyle === 'labels' || isHovered || isFlashing) && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-950/65 text-cyan-100 backdrop-blur-md border border-cyan-300/35 truncate max-w-full shadow-sm">
                            {reg.label}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-xs text-slate-300">
                Obraz referencyjny ({workingFrontendImage.fileName})
              </div>
            )}
          </div>

          {/* Full-Height Lightbox Preview Modal when "Powiększ" is clicked */}
          {expandedPreview && !refImgBroken && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-lg"
              onClick={() => setExpandedPreview(false)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="relative max-h-[92vh] flex flex-col items-center gap-3"
              >
                <div className="flex items-center justify-between w-full text-xs text-white/90 px-1">
                  <span className="font-semibold">
                    {workingFrontendImage.fileName} — Pełny tryb testowania kliknięć
                  </span>
                  <button
                    type="button"
                    onClick={() => setExpandedPreview(false)}
                    className="px-3 py-1 rounded-xl bg-white/15 hover:bg-white/25 text-white font-semibold cursor-pointer"
                  >
                    Zamknij ✕
                  </button>
                </div>
                <div className="relative inline-block rounded-3xl overflow-hidden shadow-2xl border border-cyan-300/35">
                  <img
                    src={workingFrontendImage.dataUrl}
                    alt={workingFrontendImage.fileName}
                    className="max-h-[84vh] w-auto h-auto block select-none"
                  />
                  <div className="absolute inset-0 pointer-events-none">
                    {workingFrontendImage.regions.map((reg) => {
                      const regHaptic = BM_CLINIC_REGION_HAPTICS[reg.id];
                      const isFlashing = flashingRegionId === reg.id;
                      const isHovered = hoveredRegionId === reg.id;
                      return (
                        <button
                          key={`exp-${reg.id}`}
                          type="button"
                          title={reg.label}
                          onPointerEnter={() => {
                            setHoveredRegionId(reg.id);
                            if (haptic.enabled) {
                              hapticAudio.triggerMinimalistLowClick('satin-tick-4ms', 0.14);
                            }
                          }}
                          onPointerLeave={() => {
                            setHoveredRegionId((prev) => (prev === reg.id ? null : prev));
                          }}
                          onPointerDown={() => {
                            setFlashingRegionId(reg.id);
                            window.setTimeout(() => {
                              setFlashingRegionId((prev) => (prev === reg.id ? null : prev));
                            }, 220);
                            const chosenSound =
                              haptic.minimalistClickVariant &&
                              haptic.minimalistClickVariant !== 'none'
                                ? haptic.minimalistClickVariant
                                : regHaptic?.soundId;
                            if (chosenSound) {
                              hapticAudio.triggerMinimalistLowClick(
                                chosenSound,
                                Math.max(0.35, haptic.intensity / 100)
                              );
                              pulseInteraction(0.95);
                            } else {
                              triggerPreviewFeedback(2);
                            }
                          }}
                          style={{
                            left: `${reg.xPct}%`,
                            top: `${reg.yPct}%`,
                            width: `${reg.wPct}%`,
                            height: `${reg.hPct}%`,
                            borderColor: isFlashing
                              ? 'rgba(125, 249, 255, 0.95)'
                              : isHovered
                                ? 'rgba(103, 232, 249, 0.72)'
                                : 'transparent',
                            backgroundColor: isFlashing
                              ? 'rgba(56, 224, 240, 0.28)'
                              : isHovered
                                ? 'rgba(56, 224, 240, 0.10)'
                                : 'transparent',
                            boxShadow: isFlashing
                              ? '0 0 28px rgba(56, 224, 240, 0.8), inset 0 0 18px rgba(255,255,255,0.45)'
                              : isHovered
                                ? '0 0 18px rgba(56, 224, 240, 0.35)'
                                : undefined,
                          }}
                          className="pointer-events-auto absolute rounded-2xl border transition-all duration-150 active:scale-[0.97] cursor-pointer"
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Live Simulated Frontend Frame with Multi-Shade Composed Elements & Synchronized Active Highlight */}
      {activeScreen && viewMode === 'interactive' && (
        <div className="flex justify-center">
          <div
            style={{
              borderRadius: `${Math.max(16, Math.round(depth.borderRadius * 0.78))}px`,
              boxShadow: engraving.glowEnabled
                ? `0 12px 34px -14px ${engraving.glowColor}55`
                : undefined,
            }}
            className={`w-full transition-all duration-200 border border-slate-300/75 dark:border-emerald-400/25 bg-gradient-to-br ${
              palette === 'emerald-clinic'
                ? 'from-[#071915] via-[#0B241E] to-[#081C17]'
                : palette === 'finance-ice'
                  ? 'from-[#F5F8FF] via-[#EBF2FF] to-[#F3F0FF]'
                  : 'from-[#F7F6FD] via-[#ECEFFA] to-[#F3EDFB]'
            } overflow-hidden ${
              viewport === 'mobile'
                ? 'max-w-[360px]'
                : viewport === 'tablet'
                  ? 'max-w-[540px]'
                  : 'max-w-full'
            }`}
          >
            {/* Simulated Browser / App Top Bar */}
            <div className="px-4 py-2.5 border-b border-slate-200/80 dark:border-emerald-400/15 bg-white/70 dark:bg-emerald-950/75 flex items-center justify-between gap-3 text-[11px]">
              <span className="font-semibold text-slate-900 dark:text-emerald-50 truncate">
                {activeScreen.title}
              </span>
              <span className="font-mono text-slate-500 dark:text-emerald-300/80 tabular-nums whitespace-nowrap">
                {activeScreen.route}
              </span>
            </div>

            {/* 3 Live Drop & Render Zones */}
            <div className="p-4 space-y-3.5 max-h-[540px] overflow-y-auto">
              {ZONE_ORDER.map((zone) => {
                const zoneWidgets = resolvedWidgets.filter((w) => w.zone === zone);
                const zoneGenerated = screenElements.filter(
                  (el) => el.targetZone === zone
                );
                const isOver = dragOverZone === zone;
                const isZoneHighlighted =
                  activeModifiedElement &&
                  (activeModifiedElement.kind === 'zone' ||
                    activeModifiedElement.kind === 'region') &&
                  activeModifiedElement.zone === zone;

                const zoneHighlightShade = isZoneHighlighted
                  ? FRONTEND_ELEMENT_SHADES[activeModifiedElement.shadeId]
                  : FRONTEND_ELEMENT_SHADES[DEFAULT_ZONE_SHADES[zone]];

                return (
                  <div
                    key={zone}
                    onDragOver={(e) => {
                      if (hasTactileCatalogDrag(e)) {
                        e.preventDefault();
                        setDragOverZone(zone);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverZone === zone) setDragOverZone(null);
                    }}
                    onDrop={(e) => handleDropCatalogWidget(e, zone)}
                    style={
                      isZoneHighlighted
                        ? {
                            borderColor: zoneHighlightShade.activeBorderHex,
                            boxShadow: zoneHighlightShade.activeGlowShadow,
                            backgroundColor: isDark
                              ? zoneHighlightShade.surfaceBgDark
                              : zoneHighlightShade.surfaceBgLight,
                          }
                        : undefined
                    }
                    className={`p-3 rounded-2xl border transition-all space-y-2.5 ${
                      isOver
                        ? 'border-indigo-500 dark:border-emerald-300 bg-indigo-50/60 dark:bg-emerald-900/40'
                        : 'border-slate-200/75 dark:border-emerald-400/15 bg-white/55 dark:bg-emerald-950/35'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-emerald-300/75">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">
                          {PROTOTYPE_ZONE_LABELS[zone]}
                        </span>
                        {isZoneHighlighted && (
                          <span
                            style={{
                              backgroundColor: zoneHighlightShade.badgeBgHex,
                              color: zoneHighlightShade.badgeTextHex,
                            }}
                            className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                          >
                            Modyfikowana strefa ({zoneHighlightShade.shortNamePl})
                          </span>
                        )}
                      </div>
                      <span className="font-mono tabular-nums">
                        {zoneGenerated.length + zoneWidgets.length} el.
                      </span>
                    </div>

                    {zone === 'main' && zoneGenerated.length === 0 && (
                      <div className="px-1 py-0.5">
                        <div className="text-sm font-semibold text-slate-900 dark:text-emerald-50">
                          {activeScreen.title}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-emerald-100/75 mt-0.5">
                          {activeScreen.summary}
                        </p>
                      </div>
                    )}

                    {/* Generated Complete UI Elements in this Zone (with Distinct Shade + Same-Color Active Highlight) */}
                    {zoneGenerated.length > 0 && (
                      <div className="space-y-2.5">
                        {zoneGenerated.map((genEl) => {
                          const globalGenIdx = screenElements.findIndex(
                            (x) => x.id === genEl.id
                          );
                          const shadeSpec = resolveElementShadeSpec(
                            genEl.id,
                            composedElementShades,
                            Math.max(0, globalGenIdx)
                          );
                          return (
                            <GeneratedElementLiveCard
                              key={genEl.id}
                              element={genEl}
                              shade={shadeSpec}
                              isCurrentlyModified={
                                activeModifiedElement?.id === genEl.id
                              }
                              isDark={isDark}
                              onSelectModify={() =>
                                markElementAsActivelyModified({
                                  id: genEl.id,
                                  kind: 'generated',
                                  label: genEl.name,
                                  zone: genEl.targetZone,
                                  screenId: activeScreen.id,
                                  shadeId: shadeSpec.id,
                                  sourceSurface: 'Podgląd modelu frontendu',
                                })
                              }
                              onCycleShade={() => {
                                const next = getNextElementShadeId(shadeSpec.id);
                                setElementCustomShade(genEl.id, next);
                                markElementAsActivelyModified({
                                  id: genEl.id,
                                  kind: 'generated',
                                  label: genEl.name,
                                  zone: genEl.targetZone,
                                  screenId: activeScreen.id,
                                  shadeId: next,
                                  sourceSurface: 'Zmiana odcienia na podglądzie',
                                });
                              }}
                              onTriggerTactile={triggerPreviewFeedback}
                              onMoveZone={(id, nextZone) =>
                                moveGeneratedElementTarget(
                                  id,
                                  activeScreen.id,
                                  nextZone
                                )
                              }
                              onRemove={removeGeneratedElement}
                            />
                          );
                        })}
                      </div>
                    )}

                    {/* Tactile Widgets in this Zone (each rendered in its own distinct frontend shade) */}
                    {zoneWidgets.length > 0 ? (
                      <div
                        className={`grid gap-2 ${
                          viewport === 'mobile'
                            ? 'grid-cols-1'
                            : 'grid-cols-1 sm:grid-cols-2'
                        }`}
                      >
                        {zoneWidgets.map((w) => {
                          const globalWIdx = resolvedWidgets.findIndex(
                            (rw) => rw.instanceId === w.instanceId
                          );
                          return renderShadedCompactWidget(
                            w,
                            Math.max(0, globalWIdx)
                          );
                        })}
                      </div>
                    ) : (
                      zoneGenerated.length === 0 && (
                        <div className="py-2 text-[11px] text-slate-400 dark:text-emerald-300/50 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            Przeciągnij tu komponent lub dodaj go na Stronie Startowej / w Stałym Oknie Promptu
                          </span>
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeScreen && viewMode === 'code' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-emerald-300/80">
            <span className="font-mono">
              Podgląd struktury TSX ekranu ({activeScreen.route})
            </span>
            <button
              type="button"
              onClick={async () => {
                const ok = await copyTextToClipboard(liveScreenTsxPreview);
                if (ok) {
                  setCopiedScreenCode(true);
                  triggerPreviewFeedback(4);
                  window.setTimeout(() => setCopiedScreenCode(false), 1800);
                }
              }}
              className="inline-flex items-center gap-1 text-indigo-600 dark:text-emerald-300 font-medium cursor-pointer"
            >
              {copiedScreenCode ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedScreenCode ? 'Skopiowano' : 'Kopiuj TSX'}</span>
            </button>
          </div>
          <pre className="p-3.5 rounded-2xl bg-slate-950 text-slate-100 text-[11px] font-mono overflow-x-auto max-h-[420px] leading-relaxed">
            <code>{liveScreenTsxPreview}</code>
          </pre>
        </div>
      )}

      {/* Compact Summary Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-emerald-300/75 pt-1">
        <span>
          Ekrany w modelu:{' '}
          <strong className="font-mono tabular-nums">
            {activeScreenMap.nodes.length}
          </strong>{' '}
          · Wygenerowane elementy:{' '}
          <strong className="font-mono tabular-nums">
            {generatedElements.length}
          </strong>
        </span>
        <span className="font-mono tabular-nums">
          Promień {depth.borderRadius}px · Szkło {depth.glassBlur}px
        </span>
      </div>
    </section>
  );
};
