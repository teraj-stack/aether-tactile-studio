import type { HapticMaterialType } from '../types/studio';

export interface DetectedUiButton {
  id: string;
  label: string;
  role: 'primary' | 'secondary' | 'nav' | 'icon';
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  shape: 'pill' | 'rounded' | 'circle';
  sensationType: 'glass-chime' | 'metal-detent' | 'tactile-dome' | 'sub-velvet';
  confidence: number;
  source: 'local-cv' | 'gemini-vision';
}

export interface LocalPixelAnalysis {
  width: number;
  height: number;
  aspectRatio: number;
  theme: 'dark' | 'light';
  avgLuminance: number;
  contrastScore: number;
  avgSaturation: number;
  edgeDensity: number;
  bgHex: string;
  surfaceHex: string;
  primaryAccentHex: string;
  secondaryAccentHex: string;
  textHex: string;
  mutedTextHex: string;
  palette: string[];
  layout: {
    hasTopBar: boolean;
    hasSidebar: boolean;
    suggestedColumns: 2 | 3 | 4;
  };
  suggestedMaterial: HapticMaterialType;
  suggestedHardness: number;
  suggestedGlassBlur: number;
  suggestedElevation: number;
  summary: string;
  extractedPrompt: string;
  sourceHeroDataUrl: string;
  detectedButtons: DetectedUiButton[];
}

export interface GeneratedGraphicAsset {
  filename: string;
  label: string;
  mimeType: string;
  content: string; // raw SVG markup or data URL for PNG
  dataUrl: string;
}

export type PromptModelFormat = 'flux' | 'midjourney' | 'gemini' | 'sdxl';

export interface PhotorealisticPromptSlot {
  id: 'hero' | 'card' | 'background' | 'icon';
  title: string;
  aspectRatio: '16:9' | '1:1';
  filename: string;
  prompt: string;
  negativePrompt: string;
}

export interface PhotorealisticPromptPack {
  modelFormat: PromptModelFormat;
  slots: PhotorealisticPromptSlot[];
  fullBundleText: string;
}

export interface GeneratedFrontendBundle {
  projectName: string;
  slug: string;
  files: Record<string, string>; // relative path -> UTF-8 text or base64 data URL
  standaloneHtml: string;
  graphics: GeneratedGraphicAsset[];
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h * 360, s, l];
}

function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function mixHex(hexA: string, hexB: string, ratio: number): string {
  const parse = (hex: string) => {
    const clean = hex.replace('#', '');
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  };
  const [r1, g1, b1] = parse(hexA);
  const [r2, g2, b2] = parse(hexB);
  return rgbToHex(
    r1 + (r2 - r1) * ratio,
    g1 + (g2 - g1) * ratio,
    b1 + (b2 - b1) * ratio
  );
}

function colorDist(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Nie udało się odczytać pikseli wgranego obrazu.'));
    img.src = src;
  });
}

export async function analyzeImagePixels(imageDataUrl: string): Promise<LocalPixelAnalysis> {
  const img = await loadImageElement(imageDataUrl);
  const origW = img.naturalWidth || img.width || 1280;
  const origH = img.naturalHeight || img.height || 720;

  // 1. Downscale to <= 160px for fast, accurate pixel analysis
  const scale = Math.min(1, 160 / Math.max(origW, origH));
  const w = Math.max(16, Math.round(origW * scale));
  const h = Math.max(16, Math.round(origH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Brak kontekstu Canvas 2D do analizy obrazu.');
  ctx.drawImage(img, 0, 0, w, h);

  const { data } = ctx.getImageData(0, 0, w, h);

  // Quantize into 5-bit RGB buckets (32x32x32)
  const buckets = new Map<string, { r: number; g: number; b: number; count: number; sat: number; lum: number }>();
  let lumSum = 0;
  let lumSqSum = 0;
  let satSum = 0;
  let totalPixels = 0;

  let topLumSum = 0;
  let topCount = 0;
  let midLumSum = 0;
  let midCount = 0;
  let leftLumSum = 0;
  let leftCount = 0;
  let rightLumSum = 0;
  let rightCount = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const a = data[idx + 3];
      if (a < 24) continue;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = luminance(r, g, b);
      const [, sat] = rgbToHsl(r, g, b);

      lumSum += lum;
      lumSqSum += lum * lum;
      satSum += sat;
      totalPixels++;

      if (y < h * 0.14) {
        topLumSum += lum;
        topCount++;
      } else {
        midLumSum += lum;
        midCount++;
      }
      if (x < w * 0.22) {
        leftLumSum += lum;
        leftCount++;
      } else {
        rightLumSum += lum;
        rightCount++;
      }

      const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
      const prev = buckets.get(key);
      if (prev) {
        prev.r += r;
        prev.g += g;
        prev.b += b;
        prev.sat += sat;
        prev.lum += lum;
        prev.count++;
      } else {
        buckets.set(key, { r, g, b, count: 1, sat, lum });
      }
    }
  }

  // Edge density (simple Sobel-like gradient magnitude)
  let edgeSum = 0;
  let edgeCount = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const iL = (y * w + (x - 1)) * 4;
      const iR = (y * w + (x + 1)) * 4;
      const iU = ((y - 1) * w + x) * 4;
      const iD = ((y + 1) * w + x) * 4;
      const gx =
        Math.abs(data[iR] - data[iL]) +
        Math.abs(data[iR + 1] - data[iL + 1]) +
        Math.abs(data[iR + 2] - data[iL + 2]);
      const gy =
        Math.abs(data[iD] - data[iU]) +
        Math.abs(data[iD + 1] - data[iU + 1]) +
        Math.abs(data[iD + 2] - data[iU + 2]);
      edgeSum += (gx + gy) / 6;
      edgeCount++;
    }
  }

  const avgLum = totalPixels > 0 ? lumSum / totalPixels : 0.2;
  const variance = totalPixels > 0 ? Math.max(0, lumSqSum / totalPixels - avgLum * avgLum) : 0.05;
  const contrastScore = clamp(Math.round(Math.sqrt(variance) * 280), 15, 100);
  const avgSat = totalPixels > 0 ? satSum / totalPixels : 0.25;
  const edgeDensity = edgeCount > 0 ? clamp(Math.round((edgeSum / edgeCount) * 3.2), 5, 100) : 35;

  const sortedClusters = Array.from(buckets.values())
    .map((c) => ({
      rgb: [c.r / c.count, c.g / c.count, c.b / c.count] as [number, number, number],
      count: c.count,
      sat: c.sat / c.count,
      lum: c.lum / c.count,
    }))
    .sort((a, b) => b.count - a.count);

  // Pick 6 visually distinct dominant colors
  const distinct: typeof sortedClusters = [];
  for (const c of sortedClusters) {
    if (distinct.every((d) => colorDist(d.rgb, c.rgb) > 42)) {
      distinct.push(c);
      if (distinct.length >= 6) break;
    }
  }
  while (distinct.length < 3 && sortedClusters.length > distinct.length) {
    distinct.push(sortedClusters[distinct.length]);
  }

  const theme: 'dark' | 'light' = avgLum < 0.48 ? 'dark' : 'light';
  const palette = distinct.map((c) => rgbToHex(c.rgb[0], c.rgb[1], c.rgb[2]));
  if (palette.length === 0) {
    palette.push('#0f172a', '#1e293b', '#38bdf8', '#818cf8', '#f8fafc');
  }

  // Pick background & surface based on theme
  const dominantBg = distinct[0]?.rgb ?? (theme === 'dark' ? [15, 23, 42] : [248, 250, 252]);
  const rawBgHex = rgbToHex(dominantBg[0], dominantBg[1], dominantBg[2]);
  const bgHex =
    theme === 'dark'
      ? mixHex(rawBgHex, '#090d16', 0.35)
      : mixHex(rawBgHex, '#f8fafc', 0.45);
  const surfaceHex =
    theme === 'dark'
      ? mixHex(bgHex, '#ffffff', 0.08)
      : mixHex(bgHex, '#ffffff', 0.72);

  // Pick highest-saturation vibrant accents
  const vibrant = [...distinct].sort((a, b) => b.sat * (1 - Math.abs(b.lum - 0.55)) - a.sat * (1 - Math.abs(a.lum - 0.55)));
  const primaryAccentHex =
    vibrant[0] && vibrant[0].sat > 0.14
      ? rgbToHex(vibrant[0].rgb[0], vibrant[0].rgb[1], vibrant[0].rgb[2])
      : theme === 'dark'
        ? '#38bdf8'
        : '#2563eb';
  const secondaryAccentHex =
    vibrant[1] && vibrant[1].sat > 0.12
      ? rgbToHex(vibrant[1].rgb[0], vibrant[1].rgb[1], vibrant[1].rgb[2])
      : mixHex(primaryAccentHex, theme === 'dark' ? '#a78bfa' : '#0ea5e9', 0.55);

  const textHex = theme === 'dark' ? '#f1f5f9' : '#0f172a';
  const mutedTextHex = theme === 'dark' ? '#94a3b8' : '#475569';

  // Layout zone detection from luminance deltas
  const topAvg = topCount > 0 ? topLumSum / topCount : avgLum;
  const midAvg = midCount > 0 ? midLumSum / midCount : avgLum;
  const leftAvg = leftCount > 0 ? leftLumSum / leftCount : avgLum;
  const rightAvg = rightCount > 0 ? rightLumSum / rightCount : avgLum;

  const hasTopBar = Math.abs(topAvg - midAvg) > 0.045 || origW >= origH;
  const hasSidebar = origW / origH >= 1.2 && Math.abs(leftAvg - rightAvg) > 0.055;
  const suggestedColumns: 2 | 3 | 4 = origW / origH > 1.65 ? 4 : origW / origH > 1.15 ? 3 : 2;

  // Material physics derived from real sharpness, saturation, contrast
  let suggestedMaterial: HapticMaterialType = 'frosted-glass';
  if (edgeDensity > 58 && contrastScore > 62) {
    suggestedMaterial = avgSat > 0.28 ? 'shiny-glass' : 'matte-metal';
  } else if (edgeDensity < 26 && contrastScore < 45) {
    suggestedMaterial = 'suede';
  } else if (avgSat < 0.14 && theme === 'dark') {
    suggestedMaterial = 'matte-metal';
  }

  const suggestedHardness =
    suggestedMaterial === 'matte-metal'
      ? clamp(Math.round(80 + edgeDensity * 0.2), 75, 98)
      : suggestedMaterial === 'shiny-glass'
        ? clamp(Math.round(74 + contrastScore * 0.18), 70, 92)
        : suggestedMaterial === 'suede'
          ? clamp(Math.round(24 + contrastScore * 0.25), 20, 48)
          : clamp(Math.round(62 + edgeDensity * 0.25), 55, 84);

  const suggestedGlassBlur = clamp(Math.round(30 - edgeDensity * 0.22), 10, 32);
  const suggestedElevation = clamp(Math.round(10 + contrastScore * 0.24), 8, 34);

  // Extract a crisp 960px hero crop from the uploaded image
  const heroCanvas = document.createElement('canvas');
  const targetHeroW = Math.min(960, origW);
  const targetHeroH = Math.max(200, Math.round((targetHeroW / origW) * origH));
  heroCanvas.width = targetHeroW;
  heroCanvas.height = targetHeroH;
  const hCtx = heroCanvas.getContext('2d');
  let detectedButtons: DetectedUiButton[] = [];
  if (hCtx) {
    hCtx.drawImage(img, 0, 0, targetHeroW, targetHeroH);
    try {
      const imgData = hCtx.getImageData(0, 0, targetHeroW, targetHeroH);
      detectedButtons = detectButtonsLocally(imgData.data, targetHeroW, targetHeroH, dominantBg);
    } catch {
      detectedButtons = [];
    }
  }
  const sourceHeroDataUrl = heroCanvas.toDataURL('image/png');

  const themePl = theme === 'dark' ? 'ciemny (Dark Mode)' : 'jasny (Light Mode)';
  const layoutDesc = [
    hasTopBar ? 'górny pasek nawigacji' : null,
    hasSidebar ? 'panel boczny (sidebar)' : null,
    `siatka ${suggestedColumns}-kolumnowa`,
  ]
    .filter(Boolean)
    .join(', ');

  const summary = `Analiza pikseli (${origW}×${origH}px): wykryto motyw ${themePl}, kontrast ${contrastScore}/100, ostrość krawędzi ${edgeDensity}/100, ${detectedButtons.length} kandydatów na przyciski UI oraz strukturę: ${layoutDesc}. Dominujące barwy: ${palette.slice(0, 4).join(', ')}.`;

  const extractedPrompt = `Production-ready ${theme} desktop web UI (${origW}x${origH} reference) featuring ${hasSidebar ? 'left navigation sidebar, ' : ''}${hasTopBar ? 'sticky glass topbar, ' : ''}${suggestedColumns}-column bento card grid, background ${bgHex}, elevated ${suggestedMaterial} cards (${surfaceHex}), primary accent ${primaryAccentHex}, secondary highlight ${secondaryAccentHex}, blur ${suggestedGlassBlur}px, elevation ${suggestedElevation}px.`;

  return {
    width: origW,
    height: origH,
    aspectRatio: Number((origW / origH).toFixed(2)),
    theme,
    avgLuminance: Number(avgLum.toFixed(3)),
    contrastScore,
    avgSaturation: Number(avgSat.toFixed(3)),
    edgeDensity,
    bgHex,
    surfaceHex,
    primaryAccentHex,
    secondaryAccentHex,
    textHex,
    mutedTextHex,
    palette,
    layout: {
      hasTopBar,
      hasSidebar,
      suggestedColumns,
    },
    suggestedMaterial,
    suggestedHardness,
    suggestedGlassBlur,
    suggestedElevation,
    summary,
    extractedPrompt,
    sourceHeroDataUrl,
    detectedButtons,
  };
}

function detectButtonsLocally(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  bgRgb: [number, number, number]
): DetectedUiButton[] {
  const cols = 64;
  const rows = 40;
  const cellW = w / cols;
  const cellH = h / rows;
  const mask = new Uint8Array(cols * rows);
  const satGrid = new Float32Array(cols * rows);

  for (let r = 0; r < rows; r++) {
    const py = Math.min(h - 1, Math.floor((r + 0.5) * cellH));
    for (let c = 0; c < cols; c++) {
      const px = Math.min(w - 1, Math.floor((c + 0.5) * cellW));
      const idx = (py * w + px) * 4;
      const cr = rgba[idx];
      const cg = rgba[idx + 1];
      const cb = rgba[idx + 2];
      const distBg = colorDist([cr, cg, cb], bgRgb);
      const [, sat] = rgbToHsl(cr, cg, cb);
      satGrid[r * cols + c] = sat;
      if (distBg > 52 || (sat > 0.34 && distBg > 28)) {
        mask[r * cols + c] = 1;
      }
    }
  }

  const visited = new Uint8Array(cols * rows);
  const candidates: Array<{
    minC: number;
    maxC: number;
    minR: number;
    maxR: number;
    cells: number;
    avgSat: number;
  }> = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const start = r * cols + c;
      if (!mask[start] || visited[start]) continue;
      const queue = [start];
      visited[start] = 1;
      let minC = c, maxC = c, minR = r, maxR = r, cells = 0, satSum = 0;
      while (queue.length) {
        const cur = queue.pop()!;
        const cr = Math.floor(cur / cols);
        const cc = cur % cols;
        cells++;
        satSum += satGrid[cur];
        if (cc < minC) minC = cc;
        if (cc > maxC) maxC = cc;
        if (cr < minR) minR = cr;
        if (cr > maxR) maxR = cr;
        const dirs = [
          [cr - 1, cc],
          [cr + 1, cc],
          [cr, cc - 1],
          [cr, cc + 1],
        ];
        for (const [nr, nc] of dirs) {
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          const nIdx = nr * cols + nc;
          if (mask[nIdx] && !visited[nIdx]) {
            visited[nIdx] = 1;
            queue.push(nIdx);
          }
        }
      }
      const bw = maxC - minC + 1;
      const bh = maxR - minR + 1;
      const fillRatio = cells / (bw * bh);
      const wPct = (bw / cols) * 100;
      const hPct = (bh / rows) * 100;
      const aspect = (wPct * (w / Math.max(1, h))) / Math.max(1, hPct);
      // Realistic UI button geometry: compact height, reasonable width, solid fill
      if (wPct >= 4.5 && wPct <= 42 && hPct >= 2.5 && hPct <= 14 && fillRatio >= 0.55 && aspect >= 0.8 && aspect <= 10) {
        candidates.push({ minC, maxC, minR, maxR, cells, avgSat: satSum / cells });
      }
    }
  }

  candidates.sort((a, b) => b.avgSat * 2 + b.cells / 40 - (a.avgSat * 2 + a.cells / 40));

  return candidates.slice(0, 12).map((b, idx) => {
    const xPct = Number(((b.minC / cols) * 100).toFixed(1));
    const yPct = Number(((b.minR / rows) * 100).toFixed(1));
    const wPct = Number((((b.maxC - b.minC + 1) / cols) * 100).toFixed(1));
    const hPct = Number((((b.maxR - b.minR + 1) / rows) * 100).toFixed(1));
    const isTop = yPct < 14;
    const isPrimary = b.avgSat > 0.36 && !isTop;
    const role: DetectedUiButton['role'] = isPrimary
      ? 'primary'
      : isTop
        ? 'nav'
        : wPct < 7 && hPct > 4
          ? 'icon'
          : 'secondary';
    const sensationType: DetectedUiButton['sensationType'] =
      role === 'primary'
        ? 'glass-chime'
        : role === 'nav'
          ? 'tactile-dome'
          : role === 'icon'
            ? 'metal-detent'
            : 'sub-velvet';
    return {
      id: `local-btn-${idx + 1}`,
      label:
        role === 'primary'
          ? `CTA #${idx + 1}`
          : role === 'nav'
            ? `Nawigacja #${idx + 1}`
            : role === 'icon'
              ? `Ikona #${idx + 1}`
              : `Przycisk #${idx + 1}`,
      role,
      xPct,
      yPct,
      wPct,
      hPct,
      shape: role === 'icon' ? 'circle' : wPct > hPct * 2.2 ? 'pill' : 'rounded',
      sensationType,
      confidence: Number(Math.min(0.94, 0.62 + b.avgSat * 0.45).toFixed(2)),
      source: 'local-cv',
    };
  });
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function generateGraphicsFromAnalysis(a: LocalPixelAnalysis): GeneratedGraphicAsset[] {
  const heroSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" width="960" height="540">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${a.bgHex}"/>
      <stop offset="55%" stop-color="${a.surfaceHex}"/>
      <stop offset="100%" stop-color="${a.bgHex}"/>
    </linearGradient>
    <radialGradient id="orb1" cx="30%" cy="35%" r="48%">
      <stop offset="0%" stop-color="${a.primaryAccentHex}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${a.primaryAccentHex}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="orb2" cx="76%" cy="68%" r="45%">
      <stop offset="0%" stop-color="${a.secondaryAccentHex}" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="${a.secondaryAccentHex}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="glassCard" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="${a.theme === 'dark' ? '0.16' : '0.85'}"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="${a.theme === 'dark' ? '0.03' : '0.45'}"/>
    </linearGradient>
  </defs>
  <rect width="960" height="540" rx="28" fill="url(#bgGrad)"/>
  <rect width="960" height="540" rx="28" fill="url(#orb1)"/>
  <rect width="960" height="540" rx="28" fill="url(#orb2)"/>
  <g stroke="${a.primaryAccentHex}" stroke-opacity="0.18" stroke-width="1">
    <line x1="0" y1="135" x2="960" y2="135"/>
    <line x1="0" y1="270" x2="960" y2="270"/>
    <line x1="0" y1="405" x2="960" y2="405"/>
    <line x1="240" y1="0" x2="240" y2="540"/>
    <line x1="480" y1="0" x2="480" y2="540"/>
    <line x1="720" y1="0" x2="720" y2="540"/>
  </g>
  <g transform="translate(90 78)">
    <rect x="0" y="0" width="460" height="270" rx="22" fill="url(#glassCard)" stroke="${a.primaryAccentHex}" stroke-opacity="0.45" stroke-width="1.5"/>
    <circle cx="34" cy="30" r="7" fill="${a.primaryAccentHex}"/>
    <circle cx="58" cy="30" r="7" fill="${a.secondaryAccentHex}"/>
    <rect x="30" y="64" width="210" height="16" rx="8" fill="${a.textHex}" fill-opacity="0.85"/>
    <rect x="30" y="94" width="150" height="10" rx="5" fill="${a.mutedTextHex}" fill-opacity="0.65"/>
    <path d="M30 218 C110 155, 175 225, 255 148 S370 112, 430 135" fill="none" stroke="${a.primaryAccentHex}" stroke-width="5" stroke-linecap="round"/>
    <path d="M30 232 C125 190, 210 238, 300 176 S385 150, 430 168" fill="none" stroke="${a.secondaryAccentHex}" stroke-width="3" stroke-opacity="0.8" stroke-linecap="round"/>
  </g>
  <g transform="translate(590 130)">
    <rect x="0" y="0" width="280" height="310" rx="24" fill="url(#glassCard)" stroke="${a.secondaryAccentHex}" stroke-opacity="0.5" stroke-width="1.5"/>
    <circle cx="140" cy="118" r="68" fill="none" stroke="${a.primaryAccentHex}" stroke-width="10" stroke-dasharray="290 140" stroke-linecap="round"/>
    <circle cx="140" cy="118" r="46" fill="none" stroke="${a.secondaryAccentHex}" stroke-width="6" stroke-opacity="0.8"/>
    <rect x="40" y="220" width="200" height="14" rx="7" fill="${a.textHex}" fill-opacity="0.8"/>
    <rect x="64" y="248" width="152" height="10" rx="5" fill="${a.mutedTextHex}" fill-opacity="0.6"/>
  </g>
</svg>`;

  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <linearGradient id="emblemGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${a.primaryAccentHex}"/>
      <stop offset="100%" stop-color="${a.secondaryAccentHex}"/>
    </linearGradient>
  </defs>
  <rect x="8" y="8" width="112" height="112" rx="28" fill="${a.bgHex}" stroke="url(#emblemGrad)" stroke-width="4"/>
  <polygon points="64,26 98,46 98,82 64,102 30,82 30,46" fill="url(#emblemGrad)" fill-opacity="0.22" stroke="url(#emblemGrad)" stroke-width="4"/>
  <circle cx="64" cy="64" r="16" fill="url(#emblemGrad)"/>
</svg>`;

  const meshSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240">
  <defs>
    <radialGradient id="m1" cx="20%" cy="20%" r="60%">
      <stop offset="0%" stop-color="${a.primaryAccentHex}" stop-opacity="0.26"/>
      <stop offset="100%" stop-color="${a.bgHex}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="m2" cx="85%" cy="85%" r="55%">
      <stop offset="0%" stop-color="${a.secondaryAccentHex}" stop-opacity="0.24"/>
      <stop offset="100%" stop-color="${a.bgHex}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="400" height="240" fill="${a.surfaceHex}"/>
  <rect width="400" height="240" fill="url(#m1)"/>
  <rect width="400" height="240" fill="url(#m2)"/>
</svg>`;

  return [
    {
      filename: 'assets/hero-artwork.svg',
      label: 'Grafika Hero 3D (SVG)',
      mimeType: 'image/svg+xml',
      content: heroSvg,
      dataUrl: svgToDataUrl(heroSvg),
    },
    {
      filename: 'assets/brand-logo.svg',
      label: 'Emblemat Marki (SVG)',
      mimeType: 'image/svg+xml',
      content: logoSvg,
      dataUrl: svgToDataUrl(logoSvg),
    },
    {
      filename: 'assets/card-mesh.svg',
      label: 'Tło Kart Mesh (SVG)',
      mimeType: 'image/svg+xml',
      content: meshSvg,
      dataUrl: svgToDataUrl(meshSvg),
    },
    {
      filename: 'assets/source-hero.png',
      label: 'Referencja Obrazu (PNG)',
      mimeType: 'image/png',
      content: a.sourceHeroDataUrl,
      dataUrl: a.sourceHeroDataUrl,
    },
  ];
}

export function generateFrontendProjectFiles(
  analysis: LocalPixelAnalysis,
  graphics: GeneratedGraphicAsset[],
  projectName = 'Aether Generated UI'
): GeneratedFrontendBundle {
  const slug =
    projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'generated-frontend';

  const borderCol = analysis.theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)';
  const stylesCss = `:root {
  --bg: ${analysis.bgHex};
  --surface: ${analysis.surfaceHex};
  --accent: ${analysis.primaryAccentHex};
  --accent-2: ${analysis.secondaryAccentHex};
  --text: ${analysis.textHex};
  --muted: ${analysis.mutedTextHex};
  --border: ${borderCol};
  --blur: ${analysis.suggestedGlassBlur}px;
  --elev: ${analysis.suggestedElevation}px;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", system-ui, sans-serif;
  background: radial-gradient(circle at 12% 8%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 42%), var(--bg);
  color: var(--text);
  min-height: 100vh;
}
.shell { display: grid; grid-template-columns: ${analysis.layout.hasSidebar ? '240px 1fr' : '1fr'}; min-height: 100vh; }
.sidebar {
  border-right: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: blur(var(--blur));
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 15px; }
.brand img { width: 34px; height: 34px; border-radius: 10px; }
.nav-item {
  padding: 10px 12px; border-radius: 12px; color: var(--muted); text-decoration: none; font-size: 13px; font-weight: 500;
  border: 1px solid transparent; transition: all 0.2s ease; cursor: pointer; background: transparent; text-align: left;
}
.nav-item.active, .nav-item:hover {
  color: var(--text); background: color-mix(in srgb, var(--accent) 16%, transparent); border-color: color-mix(in srgb, var(--accent) 38%, transparent);
}
.main { display: flex; flex-direction: column; }
.topbar {
  display: flex; align-items: center; justify-content: space-between; padding: 14px 24px;
  border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--surface) 78%, transparent);
  backdrop-filter: blur(var(--blur)); position: sticky; top: 0; z-index: 10;
}
.btn {
  padding: 9px 16px; border-radius: 12px; border: 1px solid var(--border); font-size: 13px; font-weight: 600;
  cursor: pointer; transition: transform 0.15s ease, opacity 0.15s ease;
}
.btn:hover { transform: translateY(-1px); opacity: 0.94; }
.btn-primary { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #090d16; border: none; }
.btn-ghost { background: var(--surface); color: var(--text); }
.content { padding: 24px; max-width: 1240px; width: 100%; margin: 0 auto; display: flex; flex-direction: column; gap: 22px; }
.hero {
  display: grid; grid-template-columns: 1.1fr 1fr; gap: 22px; padding: 26px; border-radius: 24px;
  background: var(--surface); border: 1px solid var(--border); box-shadow: 0 20px 44px rgba(0,0,0,0.22);
  align-items: center;
}
.hero h1 { margin: 8px 0 12px; font-size: 28px; line-height: 1.15; }
.hero p { margin: 0 0 18px; color: var(--muted); font-size: 14px; line-height: 1.6; }
.hero-visual { width: 100%; border-radius: 18px; border: 1px solid var(--border); display: block; }
.pill {
  display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px;
  font-size: 11px; font-weight: 600; background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent);
}
.grid { display: grid; grid-template-columns: repeat(${analysis.layout.suggestedColumns}, minmax(0, 1fr)); gap: 16px; }
.card {
  padding: 18px; border-radius: 18px; background: var(--surface); border: 1px solid var(--border);
  position: relative; overflow: hidden;
}
.card-label { font-size: 12px; color: var(--muted); }
.card-value { font-size: 26px; font-weight: 700; margin-top: 6px; }
.swatches { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.swatch { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 8px; border: 1px solid var(--border); font-size: 11px; font-family: monospace; }
.swatch-dot { width: 12px; height: 12px; border-radius: 4px; }
.gallery { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.gallery img { width: 100%; height: 180px; object-fit: cover; border-radius: 14px; border: 1px solid var(--border); }
@media (max-width: 900px) {
  .shell { grid-template-columns: 1fr; }
  .sidebar { display: none; }
  .hero, .grid, .gallery { grid-template-columns: 1fr; }
}
`;

  const appJs = `document.querySelectorAll('[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
  });
});
const toggleBtn = document.getElementById('toggle-hero-src');
const heroImg = document.getElementById('hero-img');
if (toggleBtn && heroImg) {
  let showingVector = true;
  toggleBtn.addEventListener('click', () => {
    showingVector = !showingVector;
    heroImg.src = showingVector ? heroImg.dataset.vector : heroImg.dataset.source;
    toggleBtn.textContent = showingVector ? 'Pokaż obraz źródłowy' : 'Pokaż wygenerowaną grafikę SVG';
  });
}
`;

  const buildBodyHtml = (logoSrc: string, heroSrc: string, sourceSrc: string, meshSrc: string) => `
  <div class="shell">
    ${
      analysis.layout.hasSidebar
        ? `<aside class="sidebar">
      <div class="brand"><img src="${logoSrc}" alt="Logo"/><span>${projectName}</span></div>
      <button class="nav-item active" data-tab="overview">Pulpit Główny</button>
      <button class="nav-item" data-tab="analytics">Analityka i KPI</button>
      <button class="nav-item" data-tab="assets">Wygenerowane Grafiki</button>
      <button class="nav-item" data-tab="tokens">Tokeny Designu</button>
    </aside>`
        : ''
    }
    <div class="main">
      <header class="topbar">
        <div class="brand"><img src="${logoSrc}" alt="Logo"/><span>${projectName}</span></div>
        <div style="display:flex;gap:10px;">
          <button id="toggle-hero-src" class="btn btn-ghost">Pokaż obraz źródłowy</button>
          <button class="btn btn-primary">Rozpocznij</button>
        </div>
      </header>
      <main class="content">
        <section class="hero">
          <div>
            <span class="pill">Wygenerowano z obrazu · ${analysis.theme.toUpperCase()} · ${analysis.suggestedMaterial}</span>
            <h1>Interfejs dopasowany do Twojej inspiracji wizualnej</h1>
            <p>${analysis.summary}</p>
            <div class="swatches">
              ${analysis.palette
                .map(
                  (hex) =>
                    `<span class="swatch"><span class="swatch-dot" style="background:${hex}"></span>${hex}</span>`
                )
                .join('')}
            </div>
          </div>
          <img id="hero-img" class="hero-visual" src="${heroSrc}" data-vector="${heroSrc}" data-source="${sourceSrc}" alt="Hero Graphic"/>
        </section>

        <section class="grid">
          <div class="card" style="background-image:url('${meshSrc}');background-size:cover;">
            <div class="card-label">Kontrast sceny</div>
            <div class="card-value">${analysis.contrastScore}/100</div>
          </div>
          <div class="card" style="background-image:url('${meshSrc}');background-size:cover;">
            <div class="card-label">Materiał haptyczny</div>
            <div class="card-value" style="font-size:20px;">${analysis.suggestedMaterial}</div>
          </div>
          <div class="card" style="background-image:url('${meshSrc}');background-size:cover;">
            <div class="card-label">Rozmycie szkła</div>
            <div class="card-value">${analysis.suggestedGlassBlur}px</div>
          </div>
          ${
            analysis.layout.suggestedColumns >= 4
              ? `<div class="card" style="background-image:url('${meshSrc}');background-size:cover;">
            <div class="card-label">Twardość (Shore)</div>
            <div class="card-value">${analysis.suggestedHardness} Sh</div>
          </div>`
              : ''
          }
        </section>

        <section class="gallery">
          <div class="card">
            <div class="card-label" style="margin-bottom:10px;">Wygenerowana grafika Hero (SVG)</div>
            <img src="${heroSrc}" alt="Generated Hero SVG"/>
          </div>
          <div class="card">
            <div class="card-label" style="margin-bottom:10px;">Oryginalna referencja (PNG)</div>
            <img src="${sourceSrc}" alt="Source Reference"/>
          </div>
        </section>
      </main>
    </div>
  </div>`;

  const indexHtml = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${projectName}</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
${buildBodyHtml('./assets/brand-logo.svg', './assets/hero-artwork.svg', './assets/source-hero.png', './assets/card-mesh.svg')}
  <script src="./app.js"></script>
</body>
</html>
`;

  const heroAsset = graphics.find((g) => g.filename.endsWith('hero-artwork.svg'))!;
  const logoAsset = graphics.find((g) => g.filename.endsWith('brand-logo.svg'))!;
  const meshAsset = graphics.find((g) => g.filename.endsWith('card-mesh.svg'))!;
  const sourceAsset = graphics.find((g) => g.filename.endsWith('source-hero.png'))!;

  const standaloneHtml = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${projectName} (Offline)</title>
  <style>${stylesCss}</style>
</head>
<body>
${buildBodyHtml(logoAsset.dataUrl, heroAsset.dataUrl, sourceAsset.dataUrl, meshAsset.dataUrl)}
  <script>${appJs}</script>
</body>
</html>`;

  const tokensJson = JSON.stringify(
    {
      projectName,
      theme: analysis.theme,
      colors: {
        background: analysis.bgHex,
        surface: analysis.surfaceHex,
        primaryAccent: analysis.primaryAccentHex,
        secondaryAccent: analysis.secondaryAccentHex,
        text: analysis.textHex,
        mutedText: analysis.mutedTextHex,
        palette: analysis.palette,
      },
      layout: analysis.layout,
      material: {
        profile: analysis.suggestedMaterial,
        hardnessShore: analysis.suggestedHardness,
        glassBlurPx: analysis.suggestedGlassBlur,
        elevationPx: analysis.suggestedElevation,
      },
      prompt: analysis.extractedPrompt,
    },
    null,
    2
  );

  const files: Record<string, string> = {
    'index.html': indexHtml,
    'styles.css': stylesCss,
    'app.js': appJs,
    'tokens.json': tokensJson,
  };

  for (const g of graphics) {
    files[g.filename] = g.content;
  }

  return {
    projectName,
    slug,
    files,
    standaloneHtml,
    graphics,
  };
}

export function generatePhotorealisticPromptPack(
  a: LocalPixelAnalysis,
  projectName = 'Aether Vision UI',
  modelFormat: PromptModelFormat = 'flux'
): PhotorealisticPromptPack {
  const lighting =
    a.theme === 'dark'
      ? 'dramatic moody architectural studio lighting, volumetric rim light, deep obsidian shadows, crisp specular highlights'
      : 'bright airy architectural daylight, soft diffused skylight, clean studio bounce light, natural contact shadows';

  const materialPhrase =
    a.suggestedMaterial === 'shiny-glass'
      ? 'polished optical crystal glass with sharp Fresnel reflections and subtle caustics'
      : a.suggestedMaterial === 'matte-metal'
        ? 'anodized brushed aerospace aluminum and satin dark titanium surfaces'
        : a.suggestedMaterial === 'suede'
          ? 'tactile matte architectural ceramic and soft-touch micro-textured surfaces'
          : 'frosted architectural smoked glass with soft subsurface light diffusion';

  const colorLock = `strict color palette anchored in background ${a.bgHex}, surface ${a.surfaceHex}, primary accent ${a.primaryAccentHex}, secondary accent ${a.secondaryAccentHex}`;
  const negativePrompt =
    'text, typography, letters, watermark, logo text, UI wireframe borders, low resolution, blurry, oversaturated neon, cartoon, clip art, distorted geometry, jpeg artifacts, busy clutter';

  const formatSuffix = (aspect: '16:9' | '1:1') => {
    if (modelFormat === 'midjourney') {
      return ` --ar ${aspect} --v 6.1 --style raw --q 2 --no text, letters, watermark, ui buttons`;
    }
    if (modelFormat === 'gemini') {
      return `. Output as ultra-clean photorealistic editorial photography (${aspect}), zero embedded text or letters, ready for web hero composition.`;
    }
    if (modelFormat === 'sdxl') {
      return `, masterpiece, best quality, photorealistic, 8k UHD, shot on Hasselblad X2D 100C, 50mm f/2.8, sharp focus, physically based rendering (${aspect})`;
    }
    return `. Photorealistic studio photography, 8k resolution, physically accurate materials, shot on medium format camera, clean negative space for web typography (${aspect}).`;
  };

  const slots: PhotorealisticPromptSlot[] = [
    {
      id: 'hero',
      title: '1. Fotorealistyczny Hero Banner (16:9)',
      aspectRatio: '16:9',
      filename: 'assets/hero-photo.png',
      prompt: `Photorealistic luxury web hero visual for "${projectName}", minimalist sculptural centerpiece crafted from ${materialPhrase}, ${lighting}, ${colorLock}, clean composition with generous negative space on the left side for headline typography, ultra-sharp depth of field${formatSuffix('16:9')}`,
      negativePrompt,
    },
    {
      id: 'card',
      title: '2. Makro Grafika Karty / Produktu (1:1)',
      aspectRatio: '1:1',
      filename: 'assets/feature-card.png',
      prompt: `Studio macro product photography for a modern web feature card, precision-machined geometric object made of ${materialPhrase}, floating gently above a ${a.surfaceHex} plinth, ${lighting}, ${colorLock}, centered square framing${formatSuffix('1:1')}`,
      negativePrompt,
    },
    {
      id: 'background',
      title: '3. Ambientowe Tło Sekcji (16:9)',
      aspectRatio: '16:9',
      filename: 'assets/section-backdrop.png',
      prompt: `Ultra-subtle photorealistic abstract architectural backdrop, flowing frosted glass ribbons and soft out-of-focus light refraction waves, ${lighting}, ${colorLock}, low visual noise designed for crisp foreground text legibility${formatSuffix('16:9')}`,
      negativePrompt,
    },
    {
      id: 'icon',
      title: '4. Taktylna Ikona / Emblemat 3D (1:1)',
      aspectRatio: '1:1',
      filename: 'assets/emblem-3d.png',
      prompt: `Isometric 3D tactile app emblem icon on solid ${a.bgHex} studio backdrop, sculpted hexagonal core crafted from ${materialPhrase}, glowing internal edge accent in ${a.primaryAccentHex} and ${a.secondaryAccentHex}, ${lighting}, centered with clean padding${formatSuffix('1:1')}`,
      negativePrompt,
    },
  ];

  const fullBundleText = [
    `=== AETHER VISION PROMPT PACK (${modelFormat.toUpperCase()}) ===`,
    `Projekt: ${projectName}`,
    `Paleta HEX: ${a.palette.join(', ')}`,
    `Motyw: ${a.theme.toUpperCase()} | Materiał: ${a.suggestedMaterial}`,
    '',
    ...slots.flatMap((s) => [
      `--- ${s.title} (${s.filename}) ---`,
      s.prompt,
      '',
    ]),
    `--- NEGATIVE PROMPT (dla FLUX / SDXL / Draw Things / ComfyUI) ---`,
    negativePrompt,
  ].join('\n');

  return {
    modelFormat,
    slots,
    fullBundleText,
  };
}

/**
 * 100% offline local photorealistic studio renderer (HTML5 Canvas PBR-style lighting,
 * Fresnel refraction, bokeh, specular reflections & style-graded source fusion).
 */
export async function renderLocalPhotorealisticHeroPng(
  a: LocalPixelAnalysis,
  sourceDataUrl: string
): Promise<string> {
  const W = 1280;
  const H = 720;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return a.sourceHeroDataUrl;

  // 1. Deep studio gradient backdrop
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, a.bgHex);
  bg.addColorStop(0.55, a.surfaceHex);
  bg.addColorStop(1, a.bgHex);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 2. Soft photographic bokeh & atmospheric light blooms
  const blooms = [
    { x: W * 0.24, y: H * 0.3, r: 420, color: a.primaryAccentHex, alpha: 0.34 },
    { x: W * 0.78, y: H * 0.65, r: 460, color: a.secondaryAccentHex, alpha: 0.3 },
    { x: W * 0.56, y: H * 0.22, r: 280, color: '#ffffff', alpha: a.theme === 'dark' ? 0.1 : 0.32 },
  ];
  for (const b of blooms) {
    ctx.save();
    ctx.globalAlpha = b.alpha;
    const rad = ctx.createRadialGradient(b.x, b.y, 10, b.x, b.y, b.r);
    rad.addColorStop(0, b.color);
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // 3. Draw source image inside an angled studio glass stage with soft shadow & color grading
  try {
    const img = await loadImageElement(sourceDataUrl);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.48)';
    ctx.shadowBlur = 64;
    ctx.shadowOffsetY = 26;

    const cardX = 110;
    const cardY = 82;
    const cardW = W - 220;
    const cardH = H - 164;
    const rad = 28;

    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, rad);
    ctx.fillStyle = a.surfaceHex;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, rad);
    ctx.clip();

    // Cover-fit source image
    const scale = Math.max(cardW / img.width, cardH / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, cardX + (cardW - dw) / 2, cardY + (cardH - dh) / 2, dw, dh);

    // Subtle cinematic studio vignette + Fresnel glass sheen
    const sheen = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
    sheen.addColorStop(0, 'rgba(255,255,255,0.22)');
    sheen.addColorStop(0.35, 'rgba(255,255,255,0.03)');
    sheen.addColorStop(0.75, 'rgba(0,0,0,0.08)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = sheen;
    ctx.fillRect(cardX, cardY, cardW, cardH);

    // Specular rim border
    ctx.strokeStyle = 'rgba(255,255,255,0.38)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(cardX + 1, cardY + 1, cardW - 2, cardH - 2, rad);
    ctx.stroke();
    ctx.restore();
  } catch {
    // Fallback if source image couldn't be re-drawn
  }

  // 4. Subtle photographic micro-grain for realism
  ctx.save();
  ctx.globalAlpha = 0.035;
  for (let i = 0; i < 1800; i++) {
    const gx = (i * 7919) % W;
    const gy = (i * 6271) % H;
    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#000000';
    ctx.fillRect(gx, gy, 2, 2);
  }
  ctx.restore();

  return canvas.toDataURL('image/png');
}

