import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FolderOutput,
  ImagePlus,
  Loader2,
  ScanEye,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import { studioApiFetch } from '../lib/offlineStudioEngines';
import {
  analyzeImagePixels,
  generateFrontendProjectFiles,
  generateGraphicsFromAnalysis,
  generatePhotorealisticPromptPack,
  renderLocalPhotorealisticHeroPng,
  type GeneratedFrontendBundle,
  type GeneratedGraphicAsset,
  type LocalPixelAnalysis,
  type PromptModelFormat,
} from '../lib/localImageToFrontend';

const MODEL_FORMAT_OPTIONS: Array<{ id: PromptModelFormat; label: string }> = [
  { id: 'flux', label: 'FLUX / Uniwersalny' },
  { id: 'midjourney', label: 'Midjourney v6' },
  { id: 'gemini', label: 'Gemini Imagen' },
  { id: 'sdxl', label: 'SDXL / Draw Things' },
];

export const ImageToFrontendCard: React.FC = () => {
  const { palette, depth, selectMaterialProfile, updateHaptic, updateDepth } = useStudio();
  const isDark = palette === 'emerald-clinic';

  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pixelAnalysis, setPixelAnalysis] = useState<LocalPixelAnalysis | null>(null);
  const [bundle, setBundle] = useState<GeneratedFrontendBundle | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Prompt Generator & Local Photorealistic Engine state
  const [modelFormat, setModelFormat] = useState<PromptModelFormat>('flux');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [renderingLocalPhoto, setRenderingLocalPhoto] = useState(false);
  const [localRenderInfo, setLocalRenderInfo] = useState<string | null>(null);

  const projectName = useMemo(
    () => (sourceName ? sourceName.replace(/\.[^.]+$/, '') : 'Aether Vision UI'),
    [sourceName]
  );

  const promptPack = useMemo(() => {
    if (!pixelAnalysis) return null;
    return generatePhotorealisticPromptPack(pixelAnalysis, projectName, modelFormat);
  }, [pixelAnalysis, projectName, modelFormat]);

  const cardSurfaceStyle: React.CSSProperties = {
    borderRadius: `${depth.borderRadius}px`,
    backdropFilter: `blur(${depth.glassBlur}px)`,
    backgroundColor: isDark
      ? `rgba(11, 34, 29, ${depth.glassOpacity})`
      : `rgba(255, 255, 255, ${depth.glassOpacity})`,
    boxShadow: isDark
      ? `0 ${depth.elevation}px ${depth.blur}px rgba(0,0,0,0.45)`
      : `0 ${depth.elevation}px ${depth.blur}px rgba(88, 76, 148, 0.12)`,
  };

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 1800);
  };

  const rebuildBundleWithHero = (
    metrics: LocalPixelAnalysis,
    baseName: string,
    heroPhotoDataUrl?: string
  ) => {
    const graphics: GeneratedGraphicAsset[] = generateGraphicsFromAnalysis(metrics);
    if (heroPhotoDataUrl) {
      const idx = graphics.findIndex((g) => g.filename === 'assets/source-hero.png');
      if (idx >= 0) {
        graphics[idx] = {
          ...graphics[idx],
          label: 'Render Fotorealistyczny (PNG)',
          content: heroPhotoDataUrl,
          dataUrl: heroPhotoDataUrl,
        };
      }
    }
    const generated = generateFrontendProjectFiles(metrics, graphics, baseName);
    const pack = generatePhotorealisticPromptPack(metrics, baseName, modelFormat);
    generated.files['PROMPTS.txt'] = pack.fullBundleText;
    setBundle(generated);
  };

  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Wybierz plik graficzny (PNG, JPG, WebP, SVG).');
      return;
    }
    setLoading(true);
    setError(null);
    setExportMsg(null);
    setLocalRenderInfo(null);
    setSourceName(file.name);

    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Nie udało się odczytać pliku obrazu.'));
        reader.readAsDataURL(file);
      });

      setSourcePreview(dataUrl);

      // 1. Real instant pixel-level CV analysis (100% offline)
      const metrics = await analyzeImagePixels(dataUrl);
      setPixelAnalysis(metrics);

      // 2. Render instant local photorealistic studio stage PNG (100% offline)
      const localPhotoPng = await renderLocalPhotorealisticHeroPng(metrics, dataUrl);
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'Aether Vision UI';
      rebuildBundleWithHero(metrics, baseName, localPhotoPng);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Błąd analizy obrazu.');
    } finally {
      setLoading(false);
    }
  };

  const handleRunLocalDiffusion = async () => {
    if (!pixelAnalysis || !promptPack || !sourcePreview) return;
    setRenderingLocalPhoto(true);
    setLocalRenderInfo(null);
    try {
      const heroPrompt = promptPack.slots[0];
      const resp = await studioApiFetch('/api/vision/generate-local-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: heroPrompt.prompt,
          negativePrompt: heroPrompt.negativePrompt,
          width: 1024,
          height: 576,
        }),
      });
      const data = await resp.json();
      if (data.ok && data.imageDataUrl) {
        rebuildBundleWithHero(pixelAnalysis, projectName, data.imageDataUrl);
        setLocalRenderInfo(`Wyrenderowano lokalnie przez silnik: ${data.engine}`);
      } else {
        const studioPng = await renderLocalPhotorealisticHeroPng(pixelAnalysis, sourcePreview);
        rebuildBundleWithHero(pixelAnalysis, projectName, studioPng);
        setLocalRenderInfo(
          data.message ||
            'Zastosowano wbudowany lokalny renderer studyjny (100% offline). Skopiuj prompt poniżej do dowolnego modelu (FLUX / Midjourney / Draw Things) lub podmień plik.'
        );
      }
    } catch {
      const studioPng = await renderLocalPhotorealisticHeroPng(pixelAnalysis, sourcePreview);
      rebuildBundleWithHero(pixelAnalysis, projectName, studioPng);
      setLocalRenderInfo('Zastosowano wbudowany lokalny renderer studyjny (100% offline).');
    } finally {
      setRenderingLocalPhoto(false);
    }
  };

  const handleReplaceHeroWithCustomImage = async (file: File) => {
    if (!pixelAnalysis || !file.type.startsWith('image/')) return;
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Błąd odczytu pliku.'));
      reader.readAsDataURL(file);
    });
    rebuildBundleWithHero(pixelAnalysis, projectName, dataUrl);
    setLocalRenderInfo(`Podmieniono grafikę Hero własnym plikiem: ${file.name}`);
  };

  const handleExportDisk = async () => {
    if (!bundle || !pixelAnalysis) return;
    setExporting(true);
    setExportMsg(null);
    try {
      const latestPrompts = generatePhotorealisticPromptPack(pixelAnalysis, projectName, modelFormat);
      const filesToSave = {
        ...bundle.files,
        'PROMPTS.txt': latestPrompts.fullBundleText,
      };
      const resp = await studioApiFetch('/api/vision/export-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: bundle.slug, files: filesToSave }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Błąd zapisu projektu.');
      setExportMsg(`Zapisano ${data.fileCount} plików (w tym PROMPTS.txt i assets/) w: ${data.outputDir}`);
    } catch (err: unknown) {
      setExportMsg(
        err instanceof Error
          ? `Zapis na dysk nie powiódł się (${err.message}) — użyj przycisku Pobierz HTML.`
          : 'Błąd zapisu projektu.'
      );
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadHtml = () => {
    if (!bundle) return;
    const blob = new Blob([bundle.standaloneHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${bundle.slug}-offline.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      style={cardSurfaceStyle}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) void processFile(f);
      }}
      className={`p-6 sm:p-7 border transition-colors space-y-5 ${
        isDragging
          ? 'border-indigo-500 dark:border-emerald-300 ring-2 ring-indigo-500/30'
          : 'border-indigo-300/80 dark:border-emerald-400/35'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-indigo-600 dark:text-emerald-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Aether Vision Local · 100% Offline · Generator Grafik i Promptów dla Dowolnego Modelu</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-emerald-50 mt-1">
            Wgraj Obraz → Projekt Frontendu, Lokalne Grafiki i Generator Promptów
          </h2>
          <p className="text-xs text-slate-600 dark:text-emerald-100/80 mt-1">
            Upuść zrzut ekranu lub dowolny obraz — silnik wydobędzie kolory HEX, wyrenderuje lokalne grafiki, utworzy 4 gotowe prompty do skopiowania w dowolnym modelu (FLUX, Midjourney, Gemini, SDXL) oraz zbuduje gotowy projekt frontendu.
          </p>
        </div>
        <ScanEye className="w-6 h-6 text-indigo-600 dark:text-emerald-300 shrink-0" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-emerald-400 text-white dark:text-emerald-950 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer hover:opacity-95">
          <Upload className="w-4 h-4" />
          <span>{sourcePreview ? `Zmień obraz (${sourceName})` : 'Wybierz lub upuść obraz tutaj'}</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void processFile(f);
              e.currentTarget.value = '';
            }}
            className="hidden"
          />
        </label>

        {loading && (
          <span className="inline-flex items-center gap-2 text-xs text-indigo-600 dark:text-emerald-300">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Analiza pikseli, generowanie grafik i promptów...</span>
          </span>
        )}
      </div>

      {error && <p className="text-xs text-rose-600 dark:text-rose-300">{error}</p>}

      {pixelAnalysis && bundle && promptPack && (
        <div className="p-5 rounded-2xl bg-white/75 dark:bg-emerald-950/60 border border-slate-200/80 dark:border-emerald-400/25 space-y-6">
          {/* 1. Pixel Analysis Summary & HEX Palette */}
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            {sourcePreview && (
              <img
                src={sourcePreview}
                alt="Wgrany obraz"
                className="w-32 h-22 object-cover rounded-xl border border-slate-200 dark:border-emerald-400/30 shrink-0"
              />
            )}
            <div className="space-y-2.5 flex-1 min-w-0">
              <p className="text-xs text-slate-800 dark:text-emerald-100 leading-relaxed">
                {pixelAnalysis.summary}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {pixelAnalysis.palette.map((hex) => (
                  <span
                    key={hex}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-emerald-400/25 text-[11px] font-mono text-slate-800 dark:text-emerald-100"
                  >
                    <span
                      className="w-3 h-3 rounded-sm border border-black/15"
                      style={{ backgroundColor: hex }}
                    />
                    {hex}
                  </span>
                ))}
              </div>
              <div className="text-[11px] font-mono text-slate-600 dark:text-emerald-300">
                Materiał: {pixelAnalysis.suggestedMaterial} · Twardość: {pixelAnalysis.suggestedHardness} Sh · Blur: {pixelAnalysis.suggestedGlassBlur}px · Siatka: {pixelAnalysis.layout.suggestedColumns} kol.
              </div>
            </div>
          </div>

          {/* 2. Universal Photorealistic Prompt Generator (Copy to ANY model) */}
          <div className="p-4 rounded-2xl bg-slate-50/90 dark:bg-slate-950/60 border border-slate-200 dark:border-emerald-400/25 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-slate-900 dark:text-emerald-100 flex items-center gap-1.5">
                  <Wand2 className="w-4 h-4 text-indigo-600 dark:text-emerald-300" />
                  <span>Generator Promptów Fotorealistycznych (skopiuj i użyj w dowolnym modelu)</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-emerald-300/80 mt-0.5">
                  Wybierz format docelowego generatora — prompty automatycznie blokują wyekstrahowaną paletę HEX, oświetlenie i materiał.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyText('all', promptPack.fullBundleText)}
                className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-emerald-400 text-white dark:text-emerald-950 text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                {copiedKey === 'all' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'all' ? 'Skopiowano cały pakiet!' : 'Kopiuj cały pakiet (4 prompty)'}</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {MODEL_FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setModelFormat(opt.id)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold cursor-pointer transition ${
                    modelFormat === opt.id
                      ? 'bg-indigo-600 dark:bg-emerald-400 text-white dark:text-emerald-950'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-emerald-200 border border-slate-200 dark:border-emerald-400/20'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {promptPack.slots.map((slot) => (
                <div
                  key={slot.id}
                  className="p-3 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200/90 dark:border-emerald-400/20 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-800 dark:text-emerald-100">
                      {slot.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => void copyText(slot.id, slot.prompt)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-emerald-950 text-slate-800 dark:text-emerald-200 hover:bg-slate-200 dark:hover:bg-emerald-900 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      {copiedKey === slot.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === slot.id ? 'Skopiowano' : 'Kopiuj'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] font-mono leading-relaxed text-slate-600 dark:text-emerald-200/85 break-words select-all">
                    {slot.prompt}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/80 dark:border-emerald-400/15">
              <div className="text-[11px] text-slate-600 dark:text-emerald-200/80 truncate max-w-2xl">
                <strong>Negative Prompt:</strong> <span className="font-mono">{promptPack.slots[0].negativePrompt}</span>
              </div>
              <button
                type="button"
                onClick={() => void copyText('neg', promptPack.slots[0].negativePrompt)}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-emerald-400/25 text-[11px] font-semibold text-slate-700 dark:text-emerald-200 inline-flex items-center gap-1 cursor-pointer shrink-0"
              >
                {copiedKey === 'neg' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey === 'neg' ? 'Skopiowano' : 'Kopiuj Negative'}</span>
              </button>
            </div>
          </div>

          {/* 3. Local Photorealistic Engine + Generated Graphics Strip */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-800 dark:text-emerald-100">
                Wygenerowane grafiki lokalne (4 zasoby gotowe do projektu):
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={renderingLocalPhoto}
                  onClick={() => void handleRunLocalDiffusion()}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 dark:bg-emerald-400 text-white dark:text-emerald-950 text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {renderingLocalPhoto ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>Renderuj lokalnie (mflux / Draw Things / Studio)</span>
                </button>
                <label className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-emerald-400/30 text-[11px] font-semibold text-slate-800 dark:text-emerald-100 inline-flex items-center gap-1.5 cursor-pointer">
                  <ImagePlus className="w-3.5 h-3.5" />
                  <span>Wstaw wygenerowaną grafikę Hero</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleReplaceHeroWithCustomImage(f);
                      e.currentTarget.value = '';
                    }}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {localRenderInfo && (
              <p className="text-[11px] text-indigo-700 dark:text-emerald-300 font-medium">
                {localRenderInfo}
              </p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {bundle.graphics.map((asset) => (
                <div
                  key={asset.filename}
                  className="p-2 rounded-xl bg-white dark:bg-slate-900/65 border border-slate-200 dark:border-emerald-400/20 space-y-1.5"
                >
                  <img
                    src={asset.dataUrl}
                    alt={asset.label}
                    className="w-full h-24 object-cover rounded-lg border border-black/10"
                  />
                  <div className="text-[11px] font-medium text-slate-700 dark:text-emerald-100 truncate">
                    {asset.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 4. Live Interactive Frontend Preview */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-800 dark:text-emerald-100">
              Żywy podgląd wygenerowanego projektu frontendu:
            </div>
            <iframe
              title="Podgląd wygenerowanego frontendu"
              srcDoc={bundle.standaloneHtml}
              className="w-full h-[400px] rounded-2xl border border-slate-300 dark:border-emerald-400/30 bg-slate-950"
              sandbox="allow-scripts"
            />
          </div>

          {/* 5. Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                selectMaterialProfile(pixelAnalysis.suggestedMaterial, { silent: true });
                updateHaptic({ materialHardness: pixelAnalysis.suggestedHardness });
                updateDepth({
                  glassBlur: pixelAnalysis.suggestedGlassBlur,
                  elevation: pixelAnalysis.suggestedElevation,
                });
              }}
              className="py-2 px-3.5 rounded-xl bg-indigo-600 dark:bg-emerald-400 text-white dark:text-emerald-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              Zastosuj styl w całym studiu
            </button>

            <button
              type="button"
              disabled={exporting}
              onClick={handleExportDisk}
              className="py-2 px-3.5 rounded-xl bg-slate-900 dark:bg-emerald-900/85 text-white dark:text-emerald-50 border border-slate-700 dark:border-emerald-400/40 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              <FolderOutput className="w-3.5 h-3.5" />
              <span>{exporting ? 'Zapisywanie...' : 'Zapisz projekt + PROMPTS.txt w scratch/'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadHtml}
              className="py-2 px-3.5 rounded-xl bg-white dark:bg-emerald-950/80 text-slate-800 dark:text-emerald-100 border border-slate-300 dark:border-emerald-400/30 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Pobierz jako 1 plik HTML (Offline)</span>
            </button>
          </div>

          {exportMsg && (
            <p className="text-xs font-mono text-emerald-700 dark:text-emerald-300 break-all">
              {exportMsg}
            </p>
          )}
        </div>
      )}
    </section>
  );
};
