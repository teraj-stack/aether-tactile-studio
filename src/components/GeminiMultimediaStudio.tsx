import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  Film,
  FolderOutput,
  ImagePlus,
  Loader2,
  Mic,
  PhoneOff,
  ScanEye,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import { studioApiFetch } from '../lib/offlineStudioEngines';
import {
  analyzeImagePixels,
  generateFrontendProjectFiles,
  generateGraphicsFromAnalysis,
  type GeneratedFrontendBundle,
  type LocalPixelAnalysis,
} from '../lib/localImageToFrontend';
import { isRunningAsStandaloneHtmlFile } from '../hooks/usePWAInstall';
import { HapticMaterialType } from '../types/studio';
import { ProgressiveImage } from './ui/ProgressiveImage';

const ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '9:16',
  '16:9',
  '21:9',
] as const;

const IMAGE_SIZES = ['1K', '2K', '4K'] as const;

function floatTo16BitPCMBase64(float32Array: Float32Array): string {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export const GeminiMultimediaStudio: React.FC = () => {
  const {
    palette,
    depth,
    updateDepth,
    haptic,
    updateHaptic,
    selectMaterialProfile,
    addMediaAsset,
    pendingImageGeneratorDraft,
    setPendingImageGeneratorDraft,
  } = useStudio();

  const [loadedFromScreenTitle, setLoadedFromScreenTitle] = useState<string | null>(
    null
  );

  // Image Create & Edit State
  const [imgPrompt, setImgPrompt] = useState(
    'Makro render szklanego przycisku „Dalej” z iryzującą falą światła pod palcem, perłowe tło, miękkie światło studyjne'
  );
  const [imgModel, setImgModel] = useState<
    'gemini-nano-banana-2.1' | 'gemini-3-pro-image-preview'
  >('gemini-nano-banana-2.1');
  const [imgSize, setImgSize] = useState<(typeof IMAGE_SIZES)[number]>('1K');
  const [imgAspect, setImgAspect] = useState<(typeof ASPECT_RATIOS)[number]>('16:9');
  const [editSourceImg, setEditSourceImg] = useState<{
    base64: string;
    mime: string;
  } | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingImageGeneratorDraft) return;
    setImgPrompt(pendingImageGeneratorDraft.prompt);
    setImgAspect(pendingImageGeneratorDraft.aspectRatio);
    setLoadedFromScreenTitle(pendingImageGeneratorDraft.screenTitle || 'Mapa Ekranów');
    setPendingImageGeneratorDraft(null);
  }, [pendingImageGeneratorDraft, setPendingImageGeneratorDraft]);

  // Video Omni Flash State
  const [vidPrompt, setVidPrompt] = useState(
    'Płynny ruch kamery wokół żłobionej perłowej sfery ze szkła matowego z delikatnymi cząsteczkami światła'
  );
  const [vidAspect, setVidAspect] = useState<'16:9' | '9:16'>('16:9');
  const [vidSourceImg, setVidSourceImg] = useState<{
    base64: string;
    mime: string;
  } | null>(null);
  const [vidLoading, setVidLoading] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [vidError, setVidError] = useState<string | null>(null);

  // Image Analysis & Image-to-Frontend State
  const [analyzeSource, setAnalyzeSource] = useState<{
    base64: string;
    mime: string;
  } | null>(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    summary: string;
    suggestedMaterial: HapticMaterialType;
    suggestedHardness: number;
    suggestedGlassBlur: number;
    suggestedElevation: number;
    extractedPrompt: string;
  } | null>(null);
  const [pixelAnalysis, setPixelAnalysis] = useState<LocalPixelAnalysis | null>(null);
  const [generatedBundle, setGeneratedBundle] = useState<GeneratedFrontendBundle | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportingProject, setExportingProject] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // Live API Voice Conversation State (gemini-3.8-live)
  const [liveConnected, setLiveConnected] = useState(false);
  const [liveConnecting, setLiveConnecting] = useState(false);
  const [liveTranscripts, setLiveTranscripts] = useState<
    Array<{ role: 'user' | 'model'; text: string }>
  >([]);
  const [liveError, setLiveError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const isDark = palette === 'emerald-clinic';

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

  const readFileAsBase64 = (
    file: File,
    cb: (res: { base64: string; mime: string }) => void
  ) => {
    const reader = new FileReader();
    reader.onload = () => {
      cb({
        base64: String(reader.result),
        mime: file.type || 'image/png',
      });
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateOrEditImage = async (e: React.FormEvent) => {
    e.preventDefault();
    setImgLoading(true);
    setImgError(null);
    try {
      const resp = await studioApiFetch('/api/gemini/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imgPrompt,
          model: imgModel,
          imageSize: imgSize,
          aspectRatio: imgAspect,
          sourceImageBase64: editSourceImg?.base64,
          sourceMimeType: editSourceImg?.mime,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Błąd generowania obrazu.');
      setGeneratedImage(data.imageUrl);
      await addMediaAsset({
        title: editSourceImg ? 'Edycja Obrazu Studio' : 'Render Obrazu Gemini',
        subtitle: `${imgModel === 'gemini-3-pro-image-preview' ? 'Pro Image' : 'Nano Banana 2.1'} · ${imgAspect} · ${imgSize}`,
        category: 'AI Studio Render',
        mediaType: 'image',
        aspectRatio: imgAspect,
        resolution: imgSize,
        prompt: imgPrompt,
        src: data.imageUrl,
        audioFreq: 86,
      });
    } catch (err: unknown) {
      setImgError(err instanceof Error ? err.message : 'Błąd generowania obrazu.');
    } finally {
      setImgLoading(false);
    }
  };

  const handleGenerateVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    setVidLoading(true);
    setVidError(null);
    try {
      const resp = await studioApiFetch('/api/gemini/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: vidPrompt,
          aspectRatio: vidAspect,
          sourceImageBase64: vidSourceImg?.base64,
          sourceMimeType: vidSourceImg?.mime,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Błąd generowania wideo.');
      setGeneratedVideoUrl(data.videoUrl);
      await addMediaAsset({
        title: vidSourceImg ? 'Animacja Zdjęcia Omni' : 'Wideo Omni Flash',
        subtitle: `Omni 1.2 Flash · ${vidAspect} · 720p`,
        category: 'Omni Video',
        mediaType: 'video',
        aspectRatio: vidAspect,
        resolution: '720p',
        prompt: vidPrompt,
        src: data.videoUrl,
        audioFreq: 86,
      });
    } catch (err: unknown) {
      setVidError(err instanceof Error ? err.message : 'Błąd generowania wideo.');
    } finally {
      setVidLoading(false);
    }
  };

  const handleAnalyzePhoto = async () => {
    if (!analyzeSource) return;
    setAnalyzeLoading(true);
    setAnalyzeError(null);
    setExportStatus(null);
    try {
      const dataUrl = analyzeSource.base64.startsWith('data:')
        ? analyzeSource.base64
        : `data:${analyzeSource.mime || 'image/png'};base64,${analyzeSource.base64}`;

      // 1. Real local pixel-level CV analysis (instant, 100% offline, works on every image)
      const localMetrics = await analyzeImagePixels(dataUrl);
      setPixelAnalysis(localMetrics);

      // 2. Generate bespoke SVG + PNG graphic assets & complete runnable frontend project
      const graphics = generateGraphicsFromAnalysis(localMetrics);
      const bundle = generateFrontendProjectFiles(localMetrics, graphics, 'Aether Vision UI');
      setGeneratedBundle(bundle);

      // 3. Optional server / Gemini Vision enrichment (falls back to real localMetrics, never dummy text)
      let finalData: {
        summary: string;
        suggestedMaterial: string;
        suggestedHardness: number;
        suggestedGlassBlur: number;
        suggestedElevation: number;
        extractedPrompt: string;
      } = {
        summary: localMetrics.summary,
        suggestedMaterial: localMetrics.suggestedMaterial,
        suggestedHardness: localMetrics.suggestedHardness,
        suggestedGlassBlur: localMetrics.suggestedGlassBlur,
        suggestedElevation: localMetrics.suggestedElevation,
        extractedPrompt: localMetrics.extractedPrompt,
      };

      try {
        const resp = await studioApiFetch('/api/gemini/analyze-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: analyzeSource.base64,
            mimeType: analyzeSource.mime,
            localMetrics,
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data && data.summary) {
            finalData = data;
          }
        }
      } catch {
        // Keep real localMetrics on pure offline mode
      }

      const validMat: HapticMaterialType = [
        'shiny-glass',
        'frosted-glass',
        'matte-metal',
        'abs-plastic',
        'suede',
      ].includes(finalData.suggestedMaterial)
        ? (finalData.suggestedMaterial as HapticMaterialType)
        : localMetrics.suggestedMaterial;

      setAnalysisResult({
        summary: finalData.summary,
        suggestedMaterial: validMat,
        suggestedHardness: Math.max(0, Math.min(100, Number(finalData.suggestedHardness) || localMetrics.suggestedHardness)),
        suggestedGlassBlur: Math.max(6, Math.min(36, Number(finalData.suggestedGlassBlur) || localMetrics.suggestedGlassBlur)),
        suggestedElevation: Math.max(4, Math.min(40, Number(finalData.suggestedElevation) || localMetrics.suggestedElevation)),
        extractedPrompt: finalData.extractedPrompt || localMetrics.extractedPrompt,
      });
    } catch (err: unknown) {
      setAnalyzeError(err instanceof Error ? err.message : 'Błąd analizy zdjęcia.');
    } finally {
      setAnalyzeLoading(false);
    }
  };

  const handleExportProjectToDisk = async () => {
    if (!generatedBundle) return;
    setExportingProject(true);
    setExportStatus(null);
    try {
      const resp = await studioApiFetch('/api/vision/export-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: generatedBundle.slug,
          files: generatedBundle.files,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Błąd zapisu projektu.');
      setExportStatus(`Zapisano ${data.fileCount} plików w: ${data.outputDir}`);
    } catch (err: unknown) {
      setExportStatus(
        err instanceof Error
          ? `Nie udało się zapisać na serwerze (${err.message}) — użyj przycisku Pobierz HTML.`
          : 'Błąd zapisu projektu.'
      );
    } finally {
      setExportingProject(false);
    }
  };

  const handleDownloadStandaloneHtml = () => {
    if (!generatedBundle) return;
    const blob = new Blob([generatedBundle.standaloneHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${generatedBundle.slug}-offline.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stopLiveSession = () => {
    activeSourcesRef.current.forEach((s) => {
      try {
        s.stop();
      } catch {
        // Ignore
      }
    });
    activeSourcesRef.current = [];

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }
    if (outputAudioCtxRef.current) {
      outputAudioCtxRef.current.close().catch(() => {});
      outputAudioCtxRef.current = null;
    }
    setLiveConnected(false);
    setLiveConnecting(false);
  };

  useEffect(() => {
    return () => stopLiveSession();
  }, []);

  const play24kHzPcmChunk = (base64Pcm: string) => {
    const outCtx = outputAudioCtxRef.current;
    if (!outCtx) return;

    const binary = window.atob(base64Pcm);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const sampleCount = Math.floor(bytes.byteLength / 2);
    const view = new DataView(bytes.buffer);
    const audioBuffer = outCtx.createBuffer(1, sampleCount, 24000);
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      channel[i] = view.getInt16(i * 2, true) / 32768;
    }

    const source = outCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(outCtx.destination);

    const startAt = Math.max(outCtx.currentTime, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + audioBuffer.duration;
    activeSourcesRef.current.push(source);
  };

  const startLiveSession = async () => {
    setLiveError(null);
    if (isRunningAsStandaloneHtmlFile() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      setLiveError(
        'Strumieniowa rozmowa głosowa Live API wymaga połączenia online z serwerem WebSocket. W trybie Offline używaj generatora obrazów, skanera zdjęć, syntezatora i mapy ekranów.'
      );
      return;
    }
    setLiveConnecting(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const inCtx = new AudioContext({ sampleRate: 16000 });
      const outCtx = new AudioContext({ sampleRate: 24000 });
      inputAudioCtxRef.current = inCtx;
      outputAudioCtxRef.current = outCtx;
      nextStartTimeRef.current = outCtx.currentTime;

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws/live`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'ready') {
            setLiveConnected(true);
            setLiveConnecting(false);
          } else if (msg.type === 'audio' && msg.audio) {
            play24kHzPcmChunk(msg.audio);
          } else if (msg.type === 'interrupted') {
            activeSourcesRef.current.forEach((s) => {
              try {
                s.stop();
              } catch {
                // Ignore
              }
            });
            activeSourcesRef.current = [];
            if (outputAudioCtxRef.current) {
              nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
            }
          } else if (msg.type === 'inputTranscript' && msg.text) {
            setLiveTranscripts((prev) => [...prev.slice(-8), { role: 'user', text: msg.text }]);
          } else if (msg.type === 'outputTranscript' && msg.text) {
            setLiveTranscripts((prev) => [...prev.slice(-8), { role: 'model', text: msg.text }]);
          } else if (msg.type === 'error') {
            setLiveError(msg.message || 'Błąd połączenia Live API.');
            stopLiveSession();
          }
        } catch {
          // Ignore malformed WS packet
        }
      };

      ws.onerror = () => {
        setLiveError('Nie udało się nawiązać sesji głosowej Live API.');
        stopLiveSession();
      };

      ws.onclose = () => {
        setLiveConnected(false);
        setLiveConnecting(false);
      };

      const source = inCtx.createMediaStreamSource(stream);
      const processor = inCtx.createScriptProcessor(4096, 1, 1);
      source.connect(processor);
      processor.connect(inCtx.destination);

      processor.onaudioprocess = (ev) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const base64Audio = floatTo16BitPCMBase64(ev.inputBuffer.getChannelData(0));
          wsRef.current.send(JSON.stringify({ audio: base64Audio }));
        }
      };
    } catch {
      setLiveError('Brak uprawnień do mikrofonu lub błąd inicjalizacji audio.');
      stopLiveSession();
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* 1. Image Creation & Editing (1K, 2K, 4K + All 8 Aspect Ratios) */}
      <section
        style={cardSurfaceStyle}
        className="lg:col-span-6 p-6 sm:p-8 border border-white/80 dark:border-emerald-400/20 space-y-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500 dark:text-emerald-300/80 flex items-center gap-1.5">
              <span>Nano Banana 2.1 & Pro Image</span>
              <span aria-hidden="true">·</span>
              <span>1K · 2K · 4K</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-emerald-50 mt-1">
              Generowanie i Edycja Obrazów UI
            </h2>
          </div>
          <ImagePlus className="w-5 h-5 text-indigo-600 dark:text-emerald-300 shrink-0" />
        </div>

        <form onSubmit={handleGenerateOrEditImage} className="space-y-4">
          {loadedFromScreenTitle && (
            <div className="px-3.5 py-2.5 rounded-xl bg-indigo-50/85 dark:bg-emerald-950/80 border border-indigo-200/80 dark:border-emerald-400/30 text-xs text-slate-800 dark:text-emerald-100 flex items-center justify-between gap-2">
              <span>
                Załadowano prompt układu przycisków dla ekranu:{' '}
                <strong className="font-semibold">{loadedFromScreenTitle}</strong>
              </span>
              <button
                type="button"
                onClick={() => setLoadedFromScreenTitle(null)}
                className="text-slate-500 dark:text-emerald-300 hover:underline cursor-pointer shrink-0"
              >
                Ukryj
              </button>
            </div>
          )}
          {/* Model Switch */}
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['gemini-nano-banana-2.1', 'Nano Banana 2.1 (Tworzenie & Edycja)'],
                ['gemini-3-pro-image-preview', 'Pro Image Preview (Jakość Studyjna)'],
              ] as const
            ).map(([mId, label]) => (
              <button
                key={mId}
                type="button"
                onClick={() => setImgModel(mId)}
                className={`py-2 px-3 rounded-xl text-xs font-medium border cursor-pointer truncate ${
                  imgModel === mId
                    ? isDark
                      ? 'bg-emerald-400 text-emerald-950 border-emerald-300'
                      : 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white/60 dark:bg-emerald-950/50 border-slate-200 dark:border-emerald-400/20 text-slate-700 dark:text-emerald-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Size & Aspect Ratio Controls */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-slate-700 dark:text-emerald-200">
                Rozdzielczość i proporcje obrazu
              </span>
              <div className="flex items-center gap-1">
                {IMAGE_SIZES.map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setImgSize(sz)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold cursor-pointer ${
                      imgSize === sz
                        ? 'bg-indigo-600 text-white dark:bg-emerald-400 dark:text-emerald-950'
                        : 'bg-white/65 dark:bg-emerald-950/60 text-slate-600 dark:text-emerald-200'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
              {ASPECT_RATIOS.map((ar) => (
                <button
                  key={ar}
                  type="button"
                  onClick={() => setImgAspect(ar)}
                  className={`py-1.5 rounded-lg text-[11px] font-mono cursor-pointer border ${
                    imgAspect === ar
                      ? 'bg-indigo-100 border-indigo-500 text-indigo-950 dark:bg-emerald-800 dark:border-emerald-300 dark:text-emerald-50'
                      : 'bg-white/50 dark:bg-emerald-950/40 border-slate-200/70 dark:border-emerald-400/15 text-slate-600 dark:text-emerald-200/80'
                  }`}
                >
                  {ar}
                </button>
              ))}
            </div>
          </div>

          {/* Optional Source Image for Editing */}
          <div className="flex items-center justify-between gap-3">
            <label className="px-3.5 py-2 rounded-xl bg-white/75 dark:bg-emerald-950/70 border border-slate-200 dark:border-emerald-400/25 text-xs font-medium text-slate-700 dark:text-emerald-100 inline-flex items-center gap-2 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>
                {editSourceImg ? 'Zmień obraz źródłowy edycji' : 'Opcjonalnie: prześlij obraz do edycji'}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) readFileAsBase64(f, setEditSourceImg);
                }}
                className="hidden"
              />
            </label>
            {editSourceImg && (
              <button
                type="button"
                onClick={() => setEditSourceImg(null)}
                className="text-xs text-rose-600 dark:text-rose-300 underline cursor-pointer"
              >
                Usuń obraz źródłowy
              </button>
            )}
          </div>

          <textarea
            rows={3}
            value={imgPrompt}
            onChange={(e) => setImgPrompt(e.target.value)}
            placeholder="Opisz scenę lub instrukcję edycji obrazu..."
            className="w-full p-3.5 rounded-2xl text-sm bg-white/80 dark:bg-emerald-950/70 border border-slate-200 dark:border-emerald-400/25 text-slate-900 dark:text-emerald-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          {imgError && (
            <p className="text-xs text-rose-600 dark:text-rose-300">{imgError}</p>
          )}

          <button
            type="submit"
            disabled={imgLoading}
            className="w-full py-3 px-4 rounded-2xl bg-slate-900 dark:bg-emerald-400 text-white dark:text-emerald-950 text-sm font-medium inline-flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-60 cursor-pointer whitespace-nowrap"
          >
            {imgLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Renderowanie zasobu {imgSize}...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>{editSourceImg ? 'Edytuj obraz i zapisz w bibliotece' : 'Wygeneruj obraz i zapisz w bibliotece'}</span>
              </>
            )}
          </button>
        </form>

        {generatedImage && (
          <div className="pt-2">
            <ProgressiveImage
              src={generatedImage}
              alt={imgPrompt}
              aspectClass="aspect-video"
              className="rounded-2xl border border-white/80 dark:border-emerald-400/25"
            />
          </div>
        )}
      </section>

      {/* 2. Video Generation & Photo Animation (gemini-omni-1.2-flash Interactions API) */}
      <section
        style={cardSurfaceStyle}
        className="lg:col-span-6 p-6 sm:p-8 border border-white/80 dark:border-emerald-400/20 space-y-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500 dark:text-emerald-300/80 flex items-center gap-1.5">
              <span>Gemini Omni 1.2 Flash</span>
              <span aria-hidden="true">·</span>
              <span>Tekst na Wideo & Animacja Zdjęć</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-emerald-50 mt-1">
              Studio Animacji Wideo (16:9 / 9:16)
            </h2>
          </div>
          <Film className="w-5 h-5 text-indigo-600 dark:text-emerald-300 shrink-0" />
        </div>

        <form onSubmit={handleGenerateVideo} className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {(['16:9', '9:16'] as const).map((ar) => (
                <button
                  key={ar}
                  type="button"
                  onClick={() => setVidAspect(ar)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-semibold cursor-pointer ${
                    vidAspect === ar
                      ? isDark
                        ? 'bg-emerald-400 text-emerald-950'
                        : 'bg-slate-900 text-white'
                      : 'bg-white/65 dark:bg-emerald-950/60 text-slate-700 dark:text-emerald-100'
                  }`}
                >
                  {ar === '16:9' ? '16:9 Poziomo' : '9:16 Pionowo'}
                </button>
              ))}
            </div>

            <label className="px-3.5 py-1.5 rounded-xl bg-white/75 dark:bg-emerald-950/70 border border-slate-200 dark:border-emerald-400/25 text-xs font-medium text-slate-700 dark:text-emerald-100 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
              <Upload className="w-3.5 h-3.5" />
              <span>{vidSourceImg ? 'Zdjęcie załadowane' : 'Prześlij zdjęcie do animacji'}</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) readFileAsBase64(f, setVidSourceImg);
                }}
                className="hidden"
              />
            </label>
          </div>

          {vidSourceImg && (
            <div className="flex items-center justify-between text-xs text-indigo-700 dark:text-emerald-300 bg-indigo-50/70 dark:bg-emerald-950/60 px-3 py-2 rounded-xl">
              <span>Tryb: Animacja przesłanego zdjęcia do wideo ({vidAspect})</span>
              <button
                type="button"
                onClick={() => setVidSourceImg(null)}
                className="underline cursor-pointer"
              >
                Przełącz na tekst-na-wideo
              </button>
            </div>
          )}

          <textarea
            rows={3}
            value={vidPrompt}
            onChange={(e) => setVidPrompt(e.target.value)}
            placeholder="Opisz ruch kamery, światła i animację..."
            className="w-full p-3.5 rounded-2xl text-sm bg-white/80 dark:bg-emerald-950/70 border border-slate-200 dark:border-emerald-400/25 text-slate-900 dark:text-emerald-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          {vidError && (
            <p className="text-xs text-rose-600 dark:text-rose-300">{vidError}</p>
          )}

          <button
            type="submit"
            disabled={vidLoading}
            className="w-full py-3 px-4 rounded-2xl bg-indigo-600 dark:bg-emerald-400 text-white dark:text-emerald-950 text-sm font-medium inline-flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-60 cursor-pointer whitespace-nowrap"
          >
            {vidLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generowanie klipu wideo Omni Flash...</span>
              </>
            ) : (
              <>
                <Film className="w-4 h-4" />
                <span>{vidSourceImg ? 'Animuj zdjęcie w wideo' : 'Wygeneruj wideo z tekstu'}</span>
              </>
            )}
          </button>
        </form>

        {generatedVideoUrl && (
          <video
            src={generatedVideoUrl}
            controls
            playsInline
            loop
            className="w-full rounded-2xl border border-white/80 dark:border-emerald-400/25 bg-black/90 max-h-72"
          />
        )}
      </section>

      {/* 3. Image Understanding Analyzer + Image-to-Frontend + Graphics Generator */}
      <section
        style={cardSurfaceStyle}
        className="lg:col-span-12 p-6 sm:p-8 border border-white/80 dark:border-emerald-400/20 space-y-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500 dark:text-emerald-300/80 flex items-center gap-1.5">
              <span>Aether Vision CV + Gemini</span>
              <span aria-hidden="true">·</span>
              <span>Analiza Pikseli, Generacja Grafik i Projektu Frontendu (100% Offline)</span>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-emerald-50 mt-1">
              Skaner Obrazu → Generator Frontendu i Grafik SVG/PNG
            </h3>
          </div>
          <ScanEye className="w-5 h-5 text-indigo-600 dark:text-emerald-300 shrink-0" />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="px-4 py-2.5 rounded-xl bg-white/80 dark:bg-emerald-950/75 border border-slate-200 dark:border-emerald-400/25 text-xs font-medium text-slate-800 dark:text-emerald-100 inline-flex items-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4" />
            <span>{analyzeSource ? 'Zmień wgrany obraz' : 'Wybierz obraz / makietę UI'}</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readFileAsBase64(f, setAnalyzeSource);
              }}
              className="hidden"
            />
          </label>

          <button
            type="button"
            disabled={!analyzeSource || analyzeLoading}
            onClick={handleAnalyzePhoto}
            className="px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-emerald-400 text-white dark:text-emerald-950 text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {analyzeLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Analiza pikseli i generowanie projektu...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Przeanalizuj obraz i wygeneruj frontend + grafiki</span>
              </>
            )}
          </button>
        </div>

        {analyzeSource && !analysisResult && (
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/50 dark:bg-emerald-950/40 border border-slate-200/70 dark:border-emerald-400/20">
            <img
              src={
                analyzeSource.base64.startsWith('data:')
                  ? analyzeSource.base64
                  : `data:${analyzeSource.mime};base64,${analyzeSource.base64}`
              }
              alt="Podgląd wgranego obrazu"
              className="w-24 h-16 object-cover rounded-xl border border-slate-200 dark:border-emerald-400/25"
            />
            <span className="text-xs text-slate-600 dark:text-emerald-200">
              Obraz wczytany. Kliknij <strong>Przeanalizuj obraz i wygeneruj frontend + grafiki</strong>, aby wydobyć paletę kolorów, układ, grafiki SVG i gotowy kod projektu.
            </span>
          </div>
        )}

        {analyzeError && (
          <p className="text-xs text-rose-600 dark:text-rose-300">{analyzeError}</p>
        )}

        {analysisResult && pixelAnalysis && generatedBundle && (
          <div className="p-5 rounded-2xl bg-white/65 dark:bg-emerald-950/55 border border-slate-200/80 dark:border-emerald-400/20 space-y-5">
            <p className="text-xs text-slate-700 dark:text-emerald-100 leading-relaxed">
              {analysisResult.summary}
            </p>

            {/* Real Extracted Color Swatches + Physics */}
            <div className="flex flex-wrap items-center gap-2">
              {pixelAnalysis.palette.map((hex) => (
                <span
                  key={hex}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-emerald-400/25 text-[11px] font-mono text-slate-700 dark:text-emerald-100"
                >
                  <span
                    className="w-3 h-3 rounded-sm border border-black/15"
                    style={{ backgroundColor: hex }}
                  />
                  {hex}
                </span>
              ))}
              <span className="text-[11px] font-mono text-slate-600 dark:text-emerald-300 ml-1">
                Materiał: {analysisResult.suggestedMaterial} · {analysisResult.suggestedHardness} Sh · Blur: {analysisResult.suggestedGlassBlur}px · Siatka: {pixelAnalysis.layout.suggestedColumns} kol.
              </span>
            </div>

            {/* Generated Graphics Strip */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-800 dark:text-emerald-100">
                Wygenerowane grafiki dopasowane do palety obrazu (4 zasoby):
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {generatedBundle.graphics.map((asset) => (
                  <div
                    key={asset.filename}
                    className="p-2 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-emerald-400/20 space-y-1.5"
                  >
                    <img
                      src={asset.dataUrl}
                      alt={asset.label}
                      className="w-full h-20 object-cover rounded-lg border border-black/10"
                    />
                    <div className="text-[11px] font-medium text-slate-700 dark:text-emerald-100 truncate">
                      {asset.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Live Interactive Frontend Preview */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-800 dark:text-emerald-100">
                Żywy podgląd wygenerowanego frontendu:
              </div>
              <iframe
                title="Wygenerowany projekt frontendu"
                srcDoc={generatedBundle.standaloneHtml}
                className="w-full h-[380px] rounded-2xl border border-slate-300/80 dark:border-emerald-400/30 bg-slate-950"
                sandbox="allow-scripts"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  selectMaterialProfile(analysisResult.suggestedMaterial, { silent: true });
                  updateHaptic({ materialHardness: analysisResult.suggestedHardness });
                  updateDepth({
                    glassBlur: analysisResult.suggestedGlassBlur,
                    elevation: analysisResult.suggestedElevation,
                  });
                }}
                className="py-2 px-3.5 rounded-xl bg-indigo-600 dark:bg-emerald-400 text-white dark:text-emerald-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                Zastosuj parametry w całym studiu
              </button>

              <button
                type="button"
                disabled={exportingProject}
                onClick={handleExportProjectToDisk}
                className="py-2 px-3.5 rounded-xl bg-slate-900 dark:bg-emerald-900/80 text-white dark:text-emerald-50 border border-slate-700 dark:border-emerald-400/40 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                <FolderOutput className="w-3.5 h-3.5" />
                <span>{exportingProject ? 'Zapisywanie...' : 'Zapisz projekt na dysku (scratch/)'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadStandaloneHtml}
                className="py-2 px-3.5 rounded-xl bg-white/85 dark:bg-emerald-950/80 text-slate-800 dark:text-emerald-100 border border-slate-300 dark:border-emerald-400/30 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Pobierz jako 1 plik HTML (Offline)</span>
              </button>
            </div>

            {exportStatus && (
              <p className="text-xs font-mono text-emerald-700 dark:text-emerald-300 break-all">
                {exportStatus}
              </p>
            )}
          </div>
        )}
      </section>

      {/* 4. Real-Time Voice Conversation (gemini-3.8-live) */}
      <section
        style={cardSurfaceStyle}
        className="lg:col-span-6 p-6 sm:p-8 border border-white/80 dark:border-emerald-400/20 space-y-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500 dark:text-emerald-300/80 flex items-center gap-1.5">
              <span>Gemini 3.8 Live API</span>
              <span aria-hidden="true">·</span>
              <span>Rozmowa Głosowa w Czasie Rzeczywistym</span>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-emerald-50 mt-1">
              Konsultant Akustyki i Projektowania Live
            </h3>
          </div>
          <Mic className="w-5 h-5 text-indigo-600 dark:text-emerald-300 shrink-0" />
        </div>

        <p className="text-xs text-slate-600 dark:text-emerald-100/80 leading-relaxed">
          Porozmawiaj głosowo na żywo z asystentem studyjnym o doborze tonacji szkła, parametrach syntezatora Aether lub wzorcach haptycznych.
        </p>

        {liveError && (
          <p className="text-xs text-rose-600 dark:text-rose-300">{liveError}</p>
        )}

        <div className="flex items-center gap-3">
          {!liveConnected ? (
            <button
              type="button"
              disabled={liveConnecting}
              onClick={startLiveSession}
              className="px-5 py-3 rounded-2xl bg-slate-900 dark:bg-emerald-400 text-white dark:text-emerald-950 text-sm font-medium inline-flex items-center gap-2 cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              {liveConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Łączenie z Gemini 3.8 Live...</span>
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4" />
                  <span>Rozpocznij rozmowę głosową Live</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={stopLiveSession}
              className="px-5 py-3 rounded-2xl bg-rose-600 text-white text-sm font-medium inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <PhoneOff className="w-4 h-4" />
              <span>Zakończ sesję głosową</span>
            </button>
          )}
        </div>

        {liveTranscripts.length > 0 && (
          <div className="p-4 rounded-2xl bg-white/55 dark:bg-emerald-950/50 border border-slate-200/70 dark:border-emerald-400/15 space-y-2 max-h-48 overflow-y-auto">
            {liveTranscripts.map((entry, idx) => (
              <div key={idx} className="text-xs">
                <span className="font-semibold text-slate-800 dark:text-emerald-200">
                  {entry.role === 'user' ? 'Ty: ' : 'Studio Live: '}
                </span>
                <span className="text-slate-600 dark:text-emerald-100/85">{entry.text}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
