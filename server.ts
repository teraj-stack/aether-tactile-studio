import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import {
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  ThinkingLevel,
  Type,
} from '@google/genai';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { build as viteBuild, createServer as createViteServer } from 'vite';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import {
  loginServerStudioAccount,
  recoverServerStudioAccountPassword,
  registerServerStudioAccount,
  saveServerAccountWorkspaceBackup,
} from './src/lib/studioServerAuth.ts';
import {
  createDriverCalibrationRecord,
  createHapticPatternRecord,
  createMediaAssetRecord,
  createScreenMapRecord,
  createSourcePromptRecord,
  createSynthPresetRecord,
  deleteDriverCalibrationRecord,
  deleteHapticPatternRecord,
  deleteMediaAssetRecord,
  deleteScreenMapRecord,
  deleteSourcePromptRecord,
  deleteSynthPresetRecord,
  getOrCreateUser,
  listUserStudioData,
} from './src/db/repository.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedOfflineBundleParts: {
  cssContent: string;
  jsContent: string;
  offlineAssetsMap: Record<string, string>;
} | null = null;

function safeJsonForInlineScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function collectEmbeddedPublicAssets(): Record<string, string> {
  const map: Record<string, string> = {};
  const assetsDir = path.resolve(__dirname, 'public/assets/aistudio');
  if (!fs.existsSync(assetsDir)) return map;

  try {
    const files = fs.readdirSync(assetsDir);
    for (const file of files) {
      const fullPath = path.join(assetsDir, file);
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) continue;
      const ext = path.extname(file).toLowerCase();
      const mime =
        ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : ext === '.svg'
              ? 'image/svg+xml'
              : 'image/jpeg';
      const base64 = fs.readFileSync(fullPath).toString('base64');
      map[`/assets/aistudio/${file}`] = `data:${mime};base64,${base64}`;
    }
  } catch {
    // Ignore asset read errors
  }
  return map;
}

async function getOrCompileStandaloneBundleParts(): Promise<{
  cssContent: string;
  jsContent: string;
  offlineAssetsMap: Record<string, string>;
}> {
  if (cachedOfflineBundleParts) {
    return cachedOfflineBundleParts;
  }

  const offlineAssetsMap = collectEmbeddedPublicAssets();
  let cssContent = '';
  let jsContent = '';

  const buildResult = await viteBuild({
    configFile: false,
    root: __dirname,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      write: false,
      cssCodeSplit: false,
      assetsInlineLimit: 8_000_000,
    },
    logLevel: 'silent',
  });

  const outputs = Array.isArray(buildResult) ? buildResult : [buildResult];
  for (const outItem of outputs) {
    if ('output' in outItem && Array.isArray(outItem.output)) {
      for (const item of outItem.output) {
        if (item.type === 'chunk' && item.isEntry) {
          jsContent += item.code;
        } else if (
          item.type === 'asset' &&
          item.fileName.endsWith('.css') &&
          typeof item.source === 'string'
        ) {
          cssContent += item.source;
        } else if (
          item.type === 'asset' &&
          item.fileName.endsWith('.css') &&
          item.source instanceof Uint8Array
        ) {
          cssContent += Buffer.from(item.source).toString('utf8');
        }
      }
    }
  }

  if (!jsContent) {
    throw new Error('Kompilator nie wygenerował kodu uruchomieniowego aplikacji.');
  }

  cachedOfflineBundleParts = {
    cssContent,
    jsContent,
    offlineAssetsMap,
  };
  return cachedOfflineBundleParts;
}

function getGenAIClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isQuotaOrTierError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  return (
    raw.includes('429') ||
    raw.includes('RESOURCE_EXHAUSTED') ||
    raw.includes('403') ||
    raw.includes('PERMISSION_DENIED') ||
    raw.includes('503') ||
    raw.includes('UNAVAILABLE') ||
    raw.includes('404') ||
    raw.includes('NOT_FOUND')
  );
}

async function generateContentWithQuotaFallback(
  ai: GoogleGenAI,
  primaryModel: string,
  params: {
    contents: unknown;
    config?: Record<string, unknown>;
  }
) {
  try {
    return await ai.models.generateContent({
      model: primaryModel,
      contents: params.contents as never,
      config: params.config as never,
    });
  } catch (err) {
    if (primaryModel !== 'gemini-3.1-flash-lite' && isQuotaOrTierError(err)) {
      const liteConfig = { ...(params.config || {}) };
      delete liteConfig.thinkingConfig;
      return await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: params.contents as never,
        config: liteConfig as never,
      });
    }
    throw err;
  }
}

function formatGeminiError(error: unknown): { status: number; message: string } {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes('403') || raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message:
        'Błąd autoryzacji klucza Gemini API. Sprawdź klucz w panelu Settings > Secrets.',
    };
  }
  if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message:
        'Przekroczono limit zapytań (429). Wybierz klucz z aktywnym rozliczeniem w Settings > Secrets.',
    };
  }
  return {
    status: 500,
    message: raw || 'Wystąpił błąd podczas komunikacji z modelem Gemini.',
  };
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  app.use(express.json({ limit: '50mb' }));

  // Allow downloaded standalone offline HTML files (Origin: null / file://) to sync with Studio AI Cloud when online
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  // ============================================================================
  // Studio AI Account Registration, Login, Recovery & Offline Bundle Compiler
  // ============================================================================
  app.post('/api/studio-auth/register', async (req, res) => {
    try {
      const {
        email,
        password,
        displayName,
        organization,
        role,
        clientRecoveryCode,
        clientStudioId,
        clientUid,
      } = req.body || {};
      const registered = registerServerStudioAccount({
        email: String(email || ''),
        password: String(password || ''),
        displayName: String(displayName || ''),
        organization: organization ? String(organization) : undefined,
        role: role ? String(role) : undefined,
        clientRecoveryCode: clientRecoveryCode ? String(clientRecoveryCode) : undefined,
        clientStudioId: clientStudioId ? String(clientStudioId) : undefined,
        clientUid: clientUid ? String(clientUid) : undefined,
      });

      // Best-effort sync to SQL users table if database is configured
      if (process.env.SQL_HOST) {
        try {
          await getOrCreateUser(
            registered.account.uid,
            registered.account.email,
            registered.account.displayName
          );
        } catch {
          // Non-fatal when SQL is not active
        }
      }

      res.json(registered);
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : 'Błąd rejestracji konta Studio AI.';
      const status = msg.includes('już zarejestrowane') ? 409 : 400;
      res.status(status).json({ error: msg });
    }
  });

  app.post('/api/studio-auth/login', (req, res) => {
    try {
      const { email, password } = req.body || {};
      const session = loginServerStudioAccount({
        email: String(email || ''),
        password: String(password || ''),
      });
      res.json(session);
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : 'Błąd logowania do konta Studio AI.';
      res.status(401).json({ error: msg });
    }
  });

  app.post('/api/studio-auth/recover', (req, res) => {
    try {
      const { email, recoveryCode, newPassword } = req.body || {};
      const recovered = recoverServerStudioAccountPassword({
        email: String(email || ''),
        recoveryCode: String(recoveryCode || ''),
        newPassword: String(newPassword || ''),
      });
      res.json(recovered);
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : 'Błąd odzyskiwania konta Studio AI.';
      res.status(400).json({ error: msg });
    }
  });

  app.post('/api/studio-auth/workspace-sync', requireAuth, (req: AuthRequest, res) => {
    try {
      const email = req.user?.email;
      if (!email) {
        return res.status(400).json({ error: 'Brak adresu e-mail w tokenie sesji.' });
      }
      const workspaceBackup =
        req.body?.workspaceBackup && typeof req.body.workspaceBackup === 'object'
          ? (req.body.workspaceBackup as Record<string, unknown>)
          : {};
      const syncedAt = saveServerAccountWorkspaceBackup(email, workspaceBackup);
      res.json({ ok: true, syncedAt });
    } catch (error: unknown) {
      const msg =
        error instanceof Error
          ? error.message
          : 'Błąd synchronizacji przestrzeni roboczej konta Studio AI.';
      res.status(400).json({ error: msg });
    }
  });

  app.post('/api/offline-bundle/build', async (req, res) => {
    try {
      const initialState =
        req.body?.initialState && typeof req.body.initialState === 'object'
          ? req.body.initialState
          : {};
      const cloudOrigin =
        typeof req.body?.cloudOrigin === 'string' && req.body.cloudOrigin.startsWith('http')
          ? req.body.cloudOrigin
          : process.env.APP_URL || `${req.protocol}://${req.get('host')}`;

      const parts = await getOrCompileStandaloneBundleParts();
      const safeCss = parts.cssContent.replace(/<\/style/gi, '<\\/style');
      const safeJs = parts.jsContent.replace(/<\/script/gi, '<\\/script');

      const htmlContent = `<!doctype html>
<html lang="pl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Aether Tactile Studio — Aplikacja Offline</title>
    <meta name="description" content="Samodzielna aplikacja Offline Aether Tactile Studio ze wszystkimi zachowanymi funkcjami i wbudowanym narzędziem autoryzacji Konta Studio AI." />
    <style id="aether-bundle-css">${safeCss}</style>
    <script id="aether-offline-flags">
      window.__AETHER_STANDALONE_OFFLINE__ = true;
      window.__AETHER_CLOUD_ORIGIN__ = ${safeJsonForInlineScript(cloudOrigin)};
    </script>
    <script id="aether-offline-assets">
      window.__AETHER_OFFLINE_ASSETS__ = ${safeJsonForInlineScript(parts.offlineAssetsMap)};
    </script>
    <script id="aether-initial-state">
      window.__AETHER_INITIAL_STATE__ = ${safeJsonForInlineScript(initialState)};
    </script>
  </head>
  <body class="antialiased selection:bg-indigo-500/20">
    <div id="root"></div>
    <script id="aether-bundle-js" type="module">${safeJs}</script>
  </body>
</html>`;

      res.json({
        htmlContent,
        sizeBytes: Buffer.byteLength(htmlContent, 'utf8'),
        compiledAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const msg =
        error instanceof Error
          ? error.message
          : 'Nie udało się wygenerować odrębnego pliku HTML aplikacji Offline.';
      res.status(500).json({ error: msg });
    }
  });

  // ============================================================================
  // Cloud SQL Authenticated Studio Persistence Routes
  // ============================================================================

  app.post('/api/user/sync', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const email = req.user!.email || 'user@studio.local';
      const name = req.user!.name || null;
      const profile = await getOrCreateUser(uid, email, name);
      const studioData = await listUserStudioData(uid);
      res.json({ profile, ...studioData });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Błąd synchronizacji profilu.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/studio/presets', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { name, materialType, configJson } = req.body;
      if (!name || !materialType || !configJson) {
        return res.status(400).json({ error: 'Brak wymaganych pól presetu.' });
      }
      const created = await createSynthPresetRecord(
        req.user!.uid,
        String(name),
        String(materialType),
        typeof configJson === 'string' ? configJson : JSON.stringify(configJson)
      );
      res.json(created);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Błąd zapisu presetu.';
      res.status(500).json({ error: msg });
    }
  });

  app.delete('/api/studio/presets/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      await deleteSynthPresetRecord(req.user!.uid, Number(req.params.id));
      res.json({ ok: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Błąd usuwania presetu.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/studio/prompts', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { title, category, promptText, sourceConfigJson } = req.body;
      if (!title || !promptText) {
        return res.status(400).json({ error: 'Wymagany tytuł oraz treść promptu.' });
      }
      const created = await createSourcePromptRecord(
        req.user!.uid,
        String(title),
        String(category || 'Custom UI'),
        String(promptText),
        typeof sourceConfigJson === 'string'
          ? sourceConfigJson
          : JSON.stringify(sourceConfigJson || {})
      );
      res.json(created);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Błąd zapisu konfiguracji sorsa.';
      res.status(500).json({ error: msg });
    }
  });

  app.delete('/api/studio/prompts/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      await deleteSourcePromptRecord(req.user!.uid, Number(req.params.id));
      res.json({ ok: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Błąd usuwania konfiguracji sorsa.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/studio/haptics', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { name, patternJson, hardness, reverseClutch } = req.body;
      if (!name || !patternJson) {
        return res.status(400).json({ error: 'Wymagana nazwa i tablica impulsów.' });
      }
      const created = await createHapticPatternRecord(
        req.user!.uid,
        String(name),
        typeof patternJson === 'string' ? patternJson : JSON.stringify(patternJson),
        Number(hardness ?? 75),
        Number(reverseClutch ?? 55)
      );
      res.json(created);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Błąd zapisu wzorca haptycznego.';
      res.status(500).json({ error: msg });
    }
  });

  app.delete('/api/studio/haptics/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      await deleteHapticPatternRecord(req.user!.uid, Number(req.params.id));
      res.json({ ok: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Błąd usuwania wzorca haptycznego.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/studio/media', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { title, mediaType, aspectRatio, resolution, prompt, dataUrl } = req.body;
      if (!title || !dataUrl) {
        return res.status(400).json({ error: 'Brak danych zasobu multimedialnego.' });
      }
      const created = await createMediaAssetRecord(
        req.user!.uid,
        String(title),
        String(mediaType || 'image'),
        String(aspectRatio || '1:1'),
        String(resolution || '1K'),
        String(prompt || ''),
        String(dataUrl)
      );
      res.json(created);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Błąd zapisu zasobu w bibliotece.';
      res.status(500).json({ error: msg });
    }
  });

  app.delete('/api/studio/media/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      await deleteMediaAssetRecord(req.user!.uid, Number(req.params.id));
      res.json({ ok: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Błąd usuwania zasobu.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/studio/calibrations', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { name, controllerModel, calibrationJson } = req.body;
      if (!name || !calibrationJson) {
        return res
          .status(400)
          .json({ error: 'Wymagana nazwa profilu oraz dane kalibracji sterownika.' });
      }
      const created = await createDriverCalibrationRecord(
        req.user!.uid,
        String(name),
        String(controllerModel || 'CNC Radial Spun-Metal 270°'),
        typeof calibrationJson === 'string'
          ? calibrationJson
          : JSON.stringify(calibrationJson)
      );
      res.json(created);
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : 'Błąd zapisu kalibracji sterownika.';
      res.status(500).json({ error: msg });
    }
  });

  app.delete(
    '/api/studio/calibrations/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        await deleteDriverCalibrationRecord(req.user!.uid, Number(req.params.id));
        res.json({ ok: true });
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : 'Błąd usuwania kalibracji sterownika.';
        res.status(500).json({ error: msg });
      }
    }
  );

  app.post('/api/studio/screen-maps', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { name, sourceRepo, defaultTransition, mapJson } = req.body;
      if (!name || !mapJson) {
        return res
          .status(400)
          .json({ error: 'Wymagana nazwa projektu oraz struktura mapy ekranów.' });
      }
      const created = await createScreenMapRecord(
        req.user!.uid,
        String(name),
        String(sourceRepo || 'manual'),
        String(defaultTransition || 'spatial-glass-push'),
        typeof mapJson === 'string' ? mapJson : JSON.stringify(mapJson)
      );
      res.json(created);
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : 'Błąd zapisu mapy ekranów.';
      res.status(500).json({ error: msg });
    }
  });

  app.delete(
    '/api/studio/screen-maps/:id',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        await deleteScreenMapRecord(req.user!.uid, Number(req.params.id));
        res.json({ ok: true });
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : 'Błąd usuwania mapy ekranów.';
        res.status(500).json({ error: msg });
      }
    }
  );

  // ============================================================================
  // GitHub Repository / Library -> Application Screen Map Designer Service
  // ============================================================================
  app.post('/api/screen-map/from-github', async (req, res) => {
    try {
      const rawInput = String(req.body?.repoInput || '').trim();
      const appGoal = String(req.body?.appGoal || '').trim();

      if (!rawInput) {
        return res
          .status(400)
          .json({ error: 'Podaj adres URL repozytorium GitHub lub nazwę owner/repo.' });
      }

      // Extract owner/repo from full URL or slug
      const cleaned = rawInput
        .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
        .replace(/\.git$/i, '')
        .replace(/^\/+|\/+$/g, '');
      const segments = cleaned.split('/').filter(Boolean);
      if (segments.length < 2) {
        return res.status(400).json({
          error:
            'Nieprawidłowy format repozytorium. Użyj np. "radix-ui/primitives" lub pełnego linku https://github.com/owner/repo.',
        });
      }

      const owner = segments[0];
      const repo = segments[1];
      const repoFullName = `${owner}/${repo}`;
      const ghHeaders: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Aether-Tactile-Studio',
      };

      let description = '';
      let language = 'TypeScript';
      let stars = 0;
      let defaultBranch = 'main';
      let treePaths: string[] = [];
      let detectedPackages: string[] = [];
      let readmeExcerpt = '';

      // 1. Fetch repository metadata from GitHub API
      const metaResp = await fetch(`https://api.github.com/repos/${repoFullName}`, {
        headers: ghHeaders,
      });

      if (metaResp.status === 404) {
        return res.status(404).json({
          error: `Nie znaleziono publicznego repozytorium GitHub „${repoFullName}”. Sprawdź nazwę właściciela i biblioteki.`,
        });
      }

      if (metaResp.ok) {
        const metaJson = (await metaResp.json()) as {
          description?: string;
          language?: string;
          stargazers_count?: number;
          default_branch?: string;
          topics?: string[];
        };
        description = metaJson.description || '';
        language = metaJson.language || 'TypeScript';
        stars = Number(metaJson.stargazers_count || 0);
        defaultBranch = metaJson.default_branch || 'main';
        if (Array.isArray(metaJson.topics)) {
          detectedPackages.push(...metaJson.topics.slice(0, 6));
        }

        // Fetch git tree (non-fatal if rate-limited)
        try {
          const treeResp = await fetch(
            `https://api.github.com/repos/${repoFullName}/git/trees/${encodeURIComponent(
              defaultBranch
            )}?recursive=1`,
            { headers: ghHeaders }
          );
          if (treeResp.ok) {
            const treeJson = (await treeResp.json()) as {
              tree?: Array<{ path?: string; type?: string }>;
            };
            if (Array.isArray(treeJson.tree)) {
              treePaths = treeJson.tree
                .filter((item) => item.type === 'blob' && typeof item.path === 'string')
                .map((item) => item.path as string)
                .slice(0, 600);
            }
          }
        } catch {
          // Continue with raw fallback
        }
      }

      // 2. Fetch raw package.json & README.md via raw.githubusercontent.com (also works when REST rate-limited)
      const branchCandidates = Array.from(new Set([defaultBranch, 'main', 'master']));
      for (const br of branchCandidates) {
        try {
          const pkgResp = await fetch(
            `https://raw.githubusercontent.com/${repoFullName}/${br}/package.json`
          );
          if (pkgResp.ok) {
            defaultBranch = br;
            const pkg = (await pkgResp.json()) as {
              name?: string;
              description?: string;
              dependencies?: Record<string, string>;
              peerDependencies?: Record<string, string>;
              workspaces?: string[] | { packages?: string[] };
            };
            if (!description && pkg.description) description = pkg.description;
            const deps = [
              ...Object.keys(pkg.dependencies || {}),
              ...Object.keys(pkg.peerDependencies || {}),
            ].filter((d) => !d.startsWith('@types/'));
            detectedPackages = Array.from(new Set([...detectedPackages, ...deps])).slice(
              0,
              10
            );
            break;
          }
        } catch {
          // Ignore
        }
      }

      for (const br of branchCandidates) {
        try {
          const rmResp = await fetch(
            `https://raw.githubusercontent.com/${repoFullName}/${br}/README.md`
          );
          if (rmResp.ok) {
            const txt = await rmResp.text();
            readmeExcerpt = txt.slice(0, 2600);
            break;
          }
        } catch {
          // Ignore
        }
      }

      if (!metaResp.ok && !readmeExcerpt && detectedPackages.length === 0) {
        return res.status(404).json({
          error: `Nie udało się pobrać struktury repozytorium „${repoFullName}” z GitHub.`,
        });
      }

      // Extract salient UI/module/route names from file tree
      const interestingPaths = treePaths.filter((p) =>
        /(pages\/|app\/|routes\/|screens\/|views\/|components\/|packages\/|examples\/)/i.test(
          p
        ) && /\.(tsx|ts|jsx|js|vue|svelte)$/i.test(p)
      );

      const detectedModules = Array.from(
        new Set(
          (interestingPaths.length > 0 ? interestingPaths : treePaths)
            .map((p) => {
              const base = p.split('/').pop() || p;
              return base.replace(/\.(tsx|ts|jsx|js|vue|svelte|md|json)$/i, '');
            })
            .filter(
              (name) =>
                name.length > 2 &&
                !['index', 'types', 'utils', 'config', 'setup', 'vite.config'].includes(
                  name.toLowerCase()
                )
            )
        )
      ).slice(0, 18);

      const validTransitions = [
        'spatial-glass-push',
        'shared-axis-z-portal',
        'frosted-sheet-detent',
        'prism-3d-hinge',
        'velvet-dissolve',
        'cnc-shutter-snap',
        'cascade-split-deck',
        'iris-aperture-reveal',
      ] as const;
      const validRoles = ['entry', 'core', 'detail', 'settings', 'modal'] as const;
      const validMaterials = [
        'shiny-glass',
        'frosted-glass',
        'matte-metal',
        'suede',
      ] as const;

      type GeneratedMapPayload = {
        projectName: string;
        projectDescription: string;
        architectureSummary: string;
        defaultTransition: string;
        screens: Array<{
          id: string;
          title: string;
          route: string;
          role: string;
          status: string;
          summary: string;
          components: string[];
          hapticMaterial: string;
          preferredTransition: string;
          githubSourcePath?: string;
        }>;
        edges: Array<{
          fromScreenId: string;
          toScreenId: string;
          triggerLabel: string;
          transitionId: string;
        }>;
      };

      let aiResult: GeneratedMapPayload | null = null;
      let generatedByModel = 'Analizator drzewa GitHub AST';

      // 3. Synthesize structured multi-screen architecture using Gemini (gemini-4-hydrogen) when GEMINI_API_KEY is available
      if (process.env.GEMINI_API_KEY) {
        try {
          const ai = getGenAIClient();
          const prompt = `Zaprojektuj kompletną, realistyczną mapę ekranów aplikacji (6 do 8 ekranów oraz 6 do 9 połączeń nawigacyjnych) zbudowanej w oparciu o bibliotekę/repozytorium GitHub "${repoFullName}".
Opis repozytorium: ${description || 'Biblioteka open-source'}
Język główny: ${language}
Wykryte pakiety/tematy: ${detectedPackages.join(', ') || 'brak'}
Wykryte moduły i pliki w drzewie GitHub: ${interestingPaths.slice(0, 35).join(', ') || detectedModules.join(', ')}
Fragment README: ${readmeExcerpt.slice(0, 1200)}
Cel dodatkowy od użytkownika: ${appGoal || 'Nowoczesna aplikacja produkcyjna wykorzystująca pełen potencjał tej biblioteki GitHub.'}

Zasady:
- Wszystkie tytuły ekranów, opisy (summary), architectureSummary oraz etykiety przejść (triggerLabel) napisz po polsku.
- W polu components każdego ekranu umieść 3-4 konkretne komponenty/moduły wynikające z tej biblioteki GitHub.
- Używaj wyłącznie dozwolonych wartości role: entry, core, detail, settings, modal.
- Używaj wyłącznie dozwolonych wartości hapticMaterial: shiny-glass, frosted-glass, matte-metal, suede.
- Używaj wyłącznie dozwolonych wartości transitionId / preferredTransition / defaultTransition: ${validTransitions.join(', ')}.`;

          const response = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: prompt,
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  projectName: { type: Type.STRING },
                  projectDescription: { type: Type.STRING },
                  architectureSummary: { type: Type.STRING },
                  defaultTransition: { type: Type.STRING },
                  screens: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        title: { type: Type.STRING },
                        route: { type: Type.STRING },
                        role: { type: Type.STRING },
                        status: { type: Type.STRING },
                        summary: { type: Type.STRING },
                        components: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                        },
                        hapticMaterial: { type: Type.STRING },
                        preferredTransition: { type: Type.STRING },
                        githubSourcePath: { type: Type.STRING },
                      },
                      required: [
                        'id',
                        'title',
                        'route',
                        'role',
                        'status',
                        'summary',
                        'components',
                        'hapticMaterial',
                        'preferredTransition',
                      ],
                    },
                  },
                  edges: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        fromScreenId: { type: Type.STRING },
                        toScreenId: { type: Type.STRING },
                        triggerLabel: { type: Type.STRING },
                        transitionId: { type: Type.STRING },
                      },
                      required: [
                        'fromScreenId',
                        'toScreenId',
                        'triggerLabel',
                        'transitionId',
                      ],
                    },
                  },
                },
                required: [
                  'projectName',
                  'projectDescription',
                  'architectureSummary',
                  'defaultTransition',
                  'screens',
                  'edges',
                ],
              },
            },
          });

          const parsed = JSON.parse((response.text ?? '{}').trim()) as GeneratedMapPayload;
          if (parsed && Array.isArray(parsed.screens) && parsed.screens.length >= 3) {
            aiResult = parsed;
            generatedByModel = 'GitHub Tree API + Gemini 4 Hydrogen';
          }
        } catch {
          // Graceful fallback to deterministic GitHub tree architect below
        }
      }

      // 4. Deterministic fallback derived from real GitHub modules/tree if Gemini wasn't used
      if (!aiResult) {
        const modA = detectedModules[0] || `${repo}Provider`;
        const modB = detectedModules[1] || `${repo}Canvas`;
        const modC = detectedModules[2] || `${repo}Inspector`;
        const modD = detectedModules[3] || `${repo}Controls`;
        const modE = detectedModules[4] || `${repo}Presets`;
        const modF = detectedModules[5] || `${repo}Export`;

        aiResult = {
          projectName: `Architektura ${repoFullName}`,
          projectDescription:
            description ||
            `Mapa ekranów aplikacji zaprojektowana na podstawie struktury modułów biblioteki ${repoFullName}.`,
          architectureSummary: `Przeanalizowano repozytorium ${repoFullName} (${language}, ★ ${stars}) i wydzielono 6 powiązanych ekranów wykorzystujących wykryte moduły: ${
            detectedModules.slice(0, 6).join(', ') || repo
          }.`,
          defaultTransition: 'spatial-glass-push',
          screens: [
            {
              id: 'gh-entry',
              title: `Start i Konfiguracja ${repo}`,
              route: '/',
              role: 'entry',
              status: 'ready',
              summary: `Ekran powitalny inicjalizujący kontekst biblioteki ${repoFullName} oraz wybór szablonu projektu.`,
              components: [modA, 'ProjectQuickStart', 'ThemeBootstrap'],
              hapticMaterial: 'frosted-glass',
              preferredTransition: 'spatial-glass-push',
              githubSourcePath: interestingPaths[0] || 'README.md',
            },
            {
              id: 'gh-workspace',
              title: `Główna Przestrzeń Robocza ${repo}`,
              route: '/workspace',
              role: 'core',
              status: 'ready',
              summary: `Centralny ekran interaktywny osadzający główne prymitywy i widoki z ${repoFullName}.`,
              components: [modB, modD, 'LiveViewport'],
              hapticMaterial: 'shiny-glass',
              preferredTransition: 'shared-axis-z-portal',
              githubSourcePath: interestingPaths[1] || 'src/index.ts',
            },
            {
              id: 'gh-catalog',
              title: 'Katalog Wariantów i Przykładów',
              route: '/examples',
              role: 'core',
              status: 'designing',
              summary: `Przeglądarka gotowych komponentów i wzorców integracyjnych wykrytych w drzewie ${repoFullName}.`,
              components: [modE, 'VariantMatrix', 'InteractivePreview'],
              hapticMaterial: 'frosted-glass',
              preferredTransition: 'cascade-split-deck',
              githubSourcePath: interestingPaths[2] || 'examples/',
            },
            {
              id: 'gh-inspector',
              title: 'Inspektor Stanu i Parametrów',
              route: '/inspector',
              role: 'detail',
              status: 'designing',
              summary:
                'Szczegółowy widok właściwości, telemetrii wydajności i powiązań danych wybranego modułu.',
              components: [modC, 'StateTreeTable', 'TelemetryChart'],
              hapticMaterial: 'matte-metal',
              preferredTransition: 'cnc-shutter-snap',
              githubSourcePath: interestingPaths[3] || 'packages/',
            },
            {
              id: 'gh-settings',
              title: 'Ustawienia Integracji i Motywu',
              route: '/settings',
              role: 'settings',
              status: 'review',
              summary:
                'Konfiguracja wtyczek, skrótów, dostępności oraz parametrów haptyczno-wizualnych.',
              components: [modD, 'PluginRegistry', 'HapticBindings'],
              hapticMaterial: 'suede',
              preferredTransition: 'velvet-dissolve',
              githubSourcePath: 'package.json',
            },
            {
              id: 'gh-export',
              title: 'Arkusz Eksportu i Wdrożenia Kodu',
              route: '/export',
              role: 'modal',
              status: 'designing',
              summary:
                'Modal generowania kodu produkcyjnego, paczki konfiguracyjnej JSON oraz podglądu zależności.',
              components: [modF, 'CodeBundlePreview', 'DependencyCheck'],
              hapticMaterial: 'shiny-glass',
              preferredTransition: 'frosted-sheet-detent',
              githubSourcePath: interestingPaths[4] || 'package.json',
            },
          ],
          edges: [
            {
              fromScreenId: 'gh-entry',
              toScreenId: 'gh-workspace',
              triggerLabel: 'Utwórz projekt',
              transitionId: 'spatial-glass-push',
            },
            {
              fromScreenId: 'gh-entry',
              toScreenId: 'gh-catalog',
              triggerLabel: 'Przeglądaj przykłady',
              transitionId: 'cascade-split-deck',
            },
            {
              fromScreenId: 'gh-catalog',
              toScreenId: 'gh-workspace',
              triggerLabel: 'Załaduj wariant do edytora',
              transitionId: 'shared-axis-z-portal',
            },
            {
              fromScreenId: 'gh-workspace',
              toScreenId: 'gh-inspector',
              triggerLabel: 'Zbadaj komponent',
              transitionId: 'cnc-shutter-snap',
            },
            {
              fromScreenId: 'gh-workspace',
              toScreenId: 'gh-settings',
              triggerLabel: 'Konfiguruj środowisko',
              transitionId: 'velvet-dissolve',
            },
            {
              fromScreenId: 'gh-inspector',
              toScreenId: 'gh-export',
              triggerLabel: 'Eksportuj moduł',
              transitionId: 'frosted-sheet-detent',
            },
          ],
        };
      }

      // 5. Assign clean layered DAG coordinates (x, y) by screen role/column
      const sanitizeTransition = (val: string) =>
        (validTransitions as readonly string[]).includes(val)
          ? val
          : 'spatial-glass-push';
      const sanitizeRole = (val: string) =>
        (validRoles as readonly string[]).includes(val) ? val : 'core';
      const sanitizeMaterial = (val: string) =>
        (validMaterials as readonly string[]).includes(val)
          ? val
          : 'frosted-glass';

      const roleColumn: Record<string, number> = {
        entry: 0,
        core: 1,
        detail: 2,
        settings: 2,
        modal: 3,
      };
      const colCounts: Record<number, number> = {};

      const normalizedNodes = aiResult.screens.slice(0, 10).map((scr, idx) => {
        const cleanId = scr.id?.trim() || `gh-scr-${idx + 1}`;
        const role = sanitizeRole(scr.role);
        const col = roleColumn[role] ?? 1;
        const rowInCol = colCounts[col] ?? 0;
        colCounts[col] = rowInCol + 1;

        return {
          id: cleanId,
          title: scr.title || `Ekran ${idx + 1}`,
          route: scr.route?.startsWith('/') ? scr.route : `/${scr.route || `screen-${idx + 1}`}`,
          role,
          status:
            scr.status === 'ready' || scr.status === 'review' ? scr.status : 'designing',
          summary: scr.summary || '',
          components: Array.isArray(scr.components)
            ? scr.components.slice(0, 5)
            : [repo],
          hapticMaterial: sanitizeMaterial(scr.hapticMaterial),
          preferredTransition: sanitizeTransition(scr.preferredTransition),
          githubSourcePath: scr.githubSourcePath || undefined,
          x: 60 + col * 340,
          y: 65 + rowInCol * 185,
        };
      });

      const validNodeIds = new Set(normalizedNodes.map((n) => n.id));
      const normalizedEdges = (aiResult.edges || [])
        .filter(
          (e) =>
            validNodeIds.has(e.fromScreenId) &&
            validNodeIds.has(e.toScreenId) &&
            e.fromScreenId !== e.toScreenId
        )
        .map((e, idx) => ({
          id: `gh-edge-${idx + 1}`,
          fromScreenId: e.fromScreenId,
          toScreenId: e.toScreenId,
          triggerLabel: e.triggerLabel || 'Nawiguj',
          transitionId: sanitizeTransition(e.transitionId),
        }));

      // Ensure at least sequential edges exist if AI omitted valid IDs
      if (normalizedEdges.length === 0 && normalizedNodes.length >= 2) {
        for (let i = 0; i < normalizedNodes.length - 1; i++) {
          normalizedEdges.push({
            id: `gh-edge-auto-${i + 1}`,
            fromScreenId: normalizedNodes[i].id,
            toScreenId: normalizedNodes[i + 1].id,
            triggerLabel: 'Przejdź dalej',
            transitionId: normalizedNodes[i + 1].preferredTransition,
          });
        }
      }

      const mapProject = {
        id: `gh-map-${Date.now()}`,
        name: aiResult.projectName || `Mapa Aplikacji: ${repoFullName}`,
        description:
          aiResult.projectDescription ||
          description ||
          `Architektura ekranów wygenerowana z repozytorium ${repoFullName}`,
        sourceRepo: repoFullName,
        defaultTransition: sanitizeTransition(aiResult.defaultTransition),
        nodes: normalizedNodes,
        edges: normalizedEdges,
        githubMeta: {
          repoFullName,
          repoUrl: `https://github.com/${repoFullName}`,
          description: description || 'Repozytorium publiczne GitHub',
          language,
          stars,
          defaultBranch,
          detectedPackages: detectedPackages.slice(0, 8),
          detectedModules: detectedModules.slice(0, 10),
          architectureSummary: aiResult.architectureSummary,
          generatedByModel,
        },
        createdAt: new Date().toLocaleDateString('pl-PL'),
      };

      res.json({ mapProject });
    } catch (error: unknown) {
      const msg =
        error instanceof Error
          ? error.message
          : 'Błąd podczas projektowania mapy aplikacji na podstawie GitHub.';
      res.status(500).json({ error: msg });
    }
  });

  // ============================================================================
  // File Upload -> AI Screen Plan & Website / Web App Build Matrix Service
  // ============================================================================
  app.post('/api/screen-map/from-file', async (req, res) => {
    try {
      const rawFileName = String(req.body?.fileName || '').trim();
      const rawMimeType = String(req.body?.mimeType || 'text/plain').trim().toLowerCase();
      const fileSize = Math.max(0, Number(req.body?.fileSize) || 0);
      const rawBase64: string =
        typeof req.body?.base64Data === 'string' ? req.body.base64Data.trim() : '';
      const rawTextContent: string =
        typeof req.body?.textContent === 'string' ? req.body.textContent.trim() : '';
      const projectGoal = String(req.body?.projectGoal || '').trim();
      const rawTargetType = String(req.body?.targetType || 'website-and-webapp');
      const targetType =
        rawTargetType === 'website-only' || rawTargetType === 'webapp-only'
          ? rawTargetType
          : 'website-and-webapp';

      if (!rawFileName) {
        return res.status(400).json({
          error: 'Wybierz lub upuść plik specyfikacji, makiety lub dokumentu projektowego.',
        });
      }

      if (!rawBase64 && !rawTextContent) {
        return res.status(400).json({
          error:
            'Wgrany plik jest pusty lub nie zawiera czytelnej treści tekstowej ani obrazu/PDF.',
        });
      }

      const safeFileName = rawFileName.slice(0, 120);
      const fileSizeKb = Math.max(1, Math.round(fileSize / 1024) || Math.round((rawTextContent.length || rawBase64.length * 0.75) / 1024) || 1);

      const validTransitions = [
        'spatial-glass-push',
        'frosted-sheet-detent',
        'shared-axis-z-portal',
        'prism-3d-hinge',
        'velvet-dissolve',
        'cnc-shutter-snap',
        'cascade-split-deck',
        'iris-aperture-reveal',
      ] as const;
      const validRoles = ['entry', 'core', 'detail', 'settings', 'modal'] as const;
      const validMaterials = [
        'shiny-glass',
        'frosted-glass',
        'matte-metal',
        'suede',
      ] as const;

      type GeneratedFilePlanPayload = {
        projectTitle: string;
        executiveSummary: string;
        defaultTransition: string;
        designTokens: {
          recommendedPalette: string;
          typographyPairing: string;
          layoutArchitecture: string;
          primaryHapticMaterial: string;
          stackRecommendation: string;
        };
        screens: Array<{
          id: string;
          title: string;
          route: string;
          role: string;
          status: string;
          summary: string;
          components: string[];
          hapticMaterial: string;
          preferredTransition: string;
        }>;
        edges: Array<{
          fromScreenId: string;
          toScreenId: string;
          triggerLabel: string;
          transitionId: string;
        }>;
        websiteMatrix: Array<{
          sectionName: string;
          routeOrAnchor: string;
          gridLayout: string;
          keyComponents: string[];
          visualAndTactileSpec: string;
          conversionGoal: string;
          buildPrompt: string;
        }>;
        webAppMatrix: Array<{
          moduleName: string;
          route: string;
          userRole: string;
          stateAndDataFlow: string;
          uiComponents: string[];
          transitionAndHaptics: string;
          acceptanceCriteria: string;
        }>;
        masterBuildPrompt: string;
      };

      let aiPlan: GeneratedFilePlanPayload | null = null;
      let generatedByModel = 'Analizator struktury dokumentu Aether';

      const inlineSupportedMimes = new Set([
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/webp',
        'image/gif',
      ]);

      if (process.env.GEMINI_API_KEY) {
        try {
          const ai = getGenAIClient();
          const parts: Array<
            | { text: string }
            | { inlineData: { mimeType: string; data: string } }
          > = [];

          if (rawBase64 && inlineSupportedMimes.has(rawMimeType)) {
            const cleanedBase64 = rawBase64.includes(',')
              ? rawBase64.split(',')[1] || rawBase64
              : rawBase64;
            const normalizedMime =
              rawMimeType === 'image/jpg' ? 'image/jpeg' : rawMimeType;
            parts.push({
              inlineData: {
                mimeType: normalizedMime,
                data: cleanedBase64,
              },
            });
          }

          const targetScopeLabel =
            targetType === 'website-only'
              ? 'Strona internetowa (Landing + Podstrony ofertowe i konwersyjne) wraz z lekkim panelem kontaktowym/rezerwacyjnym'
              : targetType === 'webapp-only'
                ? 'Aplikacja internetowa (SaaS / Panel operacyjny / Portal użytkownika) wraz z punktem wejścia'
                : 'Pełny ekosystem: Strona internetowa (Marketing / Landing) + Aplikacja internetowa (Panel SaaS / Portal klienta)';

          const promptLines = [
            `Przeanalizuj wgrany plik "${safeFileName}" (typ: ${rawMimeType}, rozmiar: ${fileSizeKb} KB) i przygotuj po polsku kompletny, gotowy do wdrożenia:`,
            `1) Plan ekranów (6 do 8 ekranów + 6 do 10 połączeń nawigacyjnych DAG),`,
            `2) Gotową Matrycę Budowy Strony Internetowej (websiteMatrix: 5 do 6 sekcji z siatką kolumn 1440px/Mobile, komponentami, specyfikacją wizualno-haptyczną, celem konwersji i gotowym promptem sekcji),`,
            `3) Gotową Matrycę Projektu Aplikacji Internetowej (webAppMatrix: 5 do 7 modułów funkcjonalnych z trasami routingu, rolami użytkowników, przepływem stanu/API/bazy danych, komponentami UI, fizyką przejść i kryteriami odbioru),`,
            `4) Tokeny systemu projektowego (designTokens) oraz kompleksowy Master-Prompt wdrożeniowy (masterBuildPrompt).`,
            `Zakres docelowy wybrany przez użytkownika: ${targetScopeLabel}.`,
          ];

          if (projectGoal) {
            promptLines.push(`Dodatkowe wytyczne użytkownika: ${projectGoal}`);
          }

          if (rawTextContent) {
            promptLines.push(
              `\n--- ZAWARTOŚĆ TEKSTOWA WGRANEGO PLIKU (${safeFileName}) ---\n${rawTextContent.slice(0, 85000)}\n--- KONIEC PLIKU ---`
            );
          }

          promptLines.push(
            `\nWymagania techniczne formatu:`,
            `- Wszystkie opisy, nazwy ekranów, sekcji, modułów i prompty muszą być w języku polskim.`,
            `- Dozwolone wartości role dla ekranów: entry, core, detail, settings, modal.`,
            `- Dozwolone wartości status dla ekranów: ready, designing, review.`,
            `- Dozwolone wartości hapticMaterial / primaryHapticMaterial: shiny-glass, frosted-glass, matte-metal, suede.`,
            `- Dozwolone wartości preferredTransition / transitionId / defaultTransition: ${validTransitions.join(', ')}.`,
            `- Zachowaj dyscyplinę akustyczną Aether (<160 Hz sub-bass + mikroprzełącznik) w specyfikacji dotykowej.`
          );

          parts.push({ text: promptLines.join('\n') });

          const response = await generateContentWithQuotaFallback(
            ai,
            'gemini-4-hydrogen',
            {
              contents: { parts },
              config: {
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
                systemInstruction:
                  'Jesteś głównym architektem systemów webowych i projektantem UI/UX w Aether Tactile Studio. Z każdego wgranego dokumentu (briefu PDF, makiety UI, pliku Markdown, JSON, CSV lub kodu) wydobywasz konkretną domenę biznesową i tworzysz precyzyjny plan ekranów oraz inżynieryjną matrycę budowy strony internetowej i aplikacji internetowej.',
                responseMimeType: 'application/json',
                responseSchema: {
                type: Type.OBJECT,
                properties: {
                  projectTitle: { type: Type.STRING },
                  executiveSummary: { type: Type.STRING },
                  defaultTransition: { type: Type.STRING },
                  designTokens: {
                    type: Type.OBJECT,
                    properties: {
                      recommendedPalette: { type: Type.STRING },
                      typographyPairing: { type: Type.STRING },
                      layoutArchitecture: { type: Type.STRING },
                      primaryHapticMaterial: { type: Type.STRING },
                      stackRecommendation: { type: Type.STRING },
                    },
                    required: [
                      'recommendedPalette',
                      'typographyPairing',
                      'layoutArchitecture',
                      'primaryHapticMaterial',
                      'stackRecommendation',
                    ],
                  },
                  screens: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        title: { type: Type.STRING },
                        route: { type: Type.STRING },
                        role: { type: Type.STRING },
                        status: { type: Type.STRING },
                        summary: { type: Type.STRING },
                        components: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                        },
                        hapticMaterial: { type: Type.STRING },
                        preferredTransition: { type: Type.STRING },
                      },
                      required: [
                        'id',
                        'title',
                        'route',
                        'role',
                        'status',
                        'summary',
                        'components',
                        'hapticMaterial',
                        'preferredTransition',
                      ],
                    },
                  },
                  edges: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        fromScreenId: { type: Type.STRING },
                        toScreenId: { type: Type.STRING },
                        triggerLabel: { type: Type.STRING },
                        transitionId: { type: Type.STRING },
                      },
                      required: [
                        'fromScreenId',
                        'toScreenId',
                        'triggerLabel',
                        'transitionId',
                      ],
                    },
                  },
                  websiteMatrix: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        sectionName: { type: Type.STRING },
                        routeOrAnchor: { type: Type.STRING },
                        gridLayout: { type: Type.STRING },
                        keyComponents: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                        },
                        visualAndTactileSpec: { type: Type.STRING },
                        conversionGoal: { type: Type.STRING },
                        buildPrompt: { type: Type.STRING },
                      },
                      required: [
                        'sectionName',
                        'routeOrAnchor',
                        'gridLayout',
                        'keyComponents',
                        'visualAndTactileSpec',
                        'conversionGoal',
                        'buildPrompt',
                      ],
                    },
                  },
                  webAppMatrix: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        moduleName: { type: Type.STRING },
                        route: { type: Type.STRING },
                        userRole: { type: Type.STRING },
                        stateAndDataFlow: { type: Type.STRING },
                        uiComponents: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                        },
                        transitionAndHaptics: { type: Type.STRING },
                        acceptanceCriteria: { type: Type.STRING },
                      },
                      required: [
                        'moduleName',
                        'route',
                        'userRole',
                        'stateAndDataFlow',
                        'uiComponents',
                        'transitionAndHaptics',
                        'acceptanceCriteria',
                      ],
                    },
                  },
                  masterBuildPrompt: { type: Type.STRING },
                },
                required: [
                  'projectTitle',
                  'executiveSummary',
                  'defaultTransition',
                  'designTokens',
                  'screens',
                  'edges',
                  'websiteMatrix',
                  'webAppMatrix',
                  'masterBuildPrompt',
                ],
              },
            },
          });

          const parsed = JSON.parse(
            (response.text ?? '{}').trim()
          ) as GeneratedFilePlanPayload;
          if (
            parsed &&
            Array.isArray(parsed.screens) &&
            parsed.screens.length >= 3 &&
            Array.isArray(parsed.websiteMatrix) &&
            Array.isArray(parsed.webAppMatrix)
          ) {
            aiPlan = parsed;
            generatedByModel = 'Gemini 4 Hydrogen (Multimodal)';
          }
        } catch {
          // Seamlessly fall back to deterministic document & UI image architect below on 429/403/parse issues
          generatedByModel = 'Silnik Architektury Lokalnej Aether (Zero-Limit)';
        }
      }

      // Deterministic structural fallback if Gemini API key is absent or output failed validation
      if (!aiPlan) {
        const baseTitle = safeFileName
          .replace(/\.[^.]+$/, '')
          .replace(/[-_]+/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());

        const extractedHeadings = rawTextContent
          .split(/\r?\n/)
          .map((line: string) => line.replace(/^#+\s*/, '').trim())
          .filter(
            (line: string) =>
              line.length >= 4 &&
              line.length <= 64 &&
              !/^[{[\]},:;"']+$/.test(line)
          )
          .slice(0, 6);

        const h1 = extractedHeadings[0] || `Strona Główna ${baseTitle}`;
        const h2 = extractedHeadings[1] || 'Oferta i Architektura Rozwiązania';
        const h3 = extractedHeadings[2] || 'Panel Główny Aplikacji (Dashboard)';
        const h4 = extractedHeadings[3] || 'Moduł Analityki i Operacji';
        const h5 = extractedHeadings[4] || 'Konfiguracja Konta i Integracji';

        aiPlan = {
          projectTitle: projectGoal ? `${baseTitle} — ${projectGoal.slice(0, 48)}` : `Plan Projektu: ${baseTitle}`,
          executiveSummary: `Architektura wygenerowana na podstawie pliku ${safeFileName} (${fileSizeKb} KB). Obejmuje spójną warstwę marketingową strony internetowej (1440px Desktop / Mobile) oraz wielomodułową aplikację internetową z nawigacją DAG.`,
          defaultTransition: 'spatial-glass-push',
          designTokens: {
            recommendedPalette: 'Jasny neutralny kanwas (#F8FAFC) + głębokie powierzchnie #0F172A i akcent indygo #4F46E5 (proporcja 60-30-10)',
            typographyPairing: 'Plus Jakarta Sans (nagłówki i nawigacja) + DM Sans (treść) + JetBrains Mono tabular-nums (tabele i metryki)',
            layoutArchitecture: '3-strefowy pasek nawigacji + kontener 1360px (12 kolumn) na stronie oraz układ Sidebar 260px + Workspace w aplikacji',
            primaryHapticMaterial: 'frosted-glass',
            stackRecommendation: 'React 19 + TypeScript + Tailwind CSS + Express API + PostgreSQL / Firestore',
          },
          screens: [
            {
              id: 'file-scr-landing',
              title: h1,
              route: '/',
              role: 'entry',
              status: 'ready',
              summary: `Strona wejściowa projektu ${baseTitle} z główną propozycją wartości, dowodami skuteczności i przejściem do aplikacji.`,
              components: ['TopBarNavigation', 'HeroSplitSection', 'ProofMetricsStrip'],
              hapticMaterial: 'frosted-glass',
              preferredTransition: 'spatial-glass-push',
            },
            {
              id: 'file-scr-offer',
              title: h2,
              route: '/oferta',
              role: 'entry',
              status: 'ready',
              summary: 'Prezentacja kluczowych funkcji, specyfikacji wdrożeniowej oraz porównania wariantów dla klientów.',
              components: ['FeatureBentoGrid', 'ComparisonMatrixTable', 'ConversionCTA'],
              hapticMaterial: 'shiny-glass',
              preferredTransition: 'velvet-dissolve',
            },
            {
              id: 'file-scr-auth',
              title: 'Autoryzacja i Onboarding Użytkownika',
              route: '/logowanie',
              role: 'modal',
              status: 'ready',
              summary: 'Bezpieczne logowanie OAuth / SSO oraz szybka konfiguracja profilu początkowego.',
              components: ['AuthCardModal', 'RoleSelector', 'WorkspaceInitializer'],
              hapticMaterial: 'frosted-glass',
              preferredTransition: 'frosted-sheet-detent',
            },
            {
              id: 'file-scr-dashboard',
              title: h3,
              route: '/app/pulpit',
              role: 'core',
              status: 'designing',
              summary: 'Główny pulpit operacyjny aplikacji internetowej z kluczowymi wskaźnikami KPI, wyszukiwarką i szybkimi akcjami.',
              components: ['KpiSummaryRow', 'OperationsDataTable', 'QuickActionsToolbar'],
              hapticMaterial: 'frosted-glass',
              preferredTransition: 'shared-axis-z-portal',
            },
            {
              id: 'file-scr-detail',
              title: h4,
              route: '/app/modul-operacyjny',
              role: 'detail',
              status: 'designing',
              summary: 'Widok szczegółowy rekordów, edycji procesów oraz eksportu raportów i danych.',
              components: ['RecordDetailInspector', 'StatusFilterBar', 'ExportActionMenu'],
              hapticMaterial: 'matte-metal',
              preferredTransition: 'cnc-shutter-snap',
            },
            {
              id: 'file-scr-settings',
              title: h5,
              route: '/app/ustawienia',
              role: 'settings',
              status: 'review',
              summary: 'Zarządzanie uprawnieniami zespołu, kluczami integracji API oraz preferencjami powiadomień.',
              components: ['TeamPermissionsGrid', 'IntegrationWebhooks', 'ProfilePreferences'],
              hapticMaterial: 'suede',
              preferredTransition: 'velvet-dissolve',
            },
          ],
          edges: [
            {
              fromScreenId: 'file-scr-landing',
              toScreenId: 'file-scr-offer',
              triggerLabel: 'Poznaj ofertę',
              transitionId: 'velvet-dissolve',
            },
            {
              fromScreenId: 'file-scr-landing',
              toScreenId: 'file-scr-auth',
              triggerLabel: 'Uruchom aplikację',
              transitionId: 'frosted-sheet-detent',
            },
            {
              fromScreenId: 'file-scr-offer',
              toScreenId: 'file-scr-auth',
              triggerLabel: 'Wybierz plan',
              transitionId: 'frosted-sheet-detent',
            },
            {
              fromScreenId: 'file-scr-auth',
              toScreenId: 'file-scr-dashboard',
              triggerLabel: 'Zaloguj do panelu',
              transitionId: 'shared-axis-z-portal',
            },
            {
              fromScreenId: 'file-scr-dashboard',
              toScreenId: 'file-scr-detail',
              triggerLabel: 'Otwórz szczegóły modułu',
              transitionId: 'cnc-shutter-snap',
            },
            {
              fromScreenId: 'file-scr-dashboard',
              toScreenId: 'file-scr-settings',
              triggerLabel: 'Konfiguruj konto',
              transitionId: 'velvet-dissolve',
            },
          ],
          websiteMatrix: [
            {
              sectionName: '01. Pasek Nawigacji i Sekcja Hero',
              routeOrAnchor: '/#hero',
              gridLayout: 'Desktop 1440px: Split 7/5 kolumn · Mobile: 1 kolumna ze stosem pionowym',
              keyComponents: ['3-Zone Header', 'Headline + Lead', 'Primary Tactile CTA', 'Live Product Preview'],
              visualAndTactileSpec: 'Szkło mrożone (blur 22px), odpowiedź kliknięcia 86 Hz (<160 Hz) z transjentem mikroprzełącznika.',
              conversionGoal: 'Natychmiastowe zrozumienie wartości projektu i kliknięcie głównego przycisku startu.',
              buildPrompt: `Zbuduj responsywną sekcję Hero dla "${baseTitle}" z 3-strefowym nagłówkiem, układem 7/5 kolumn na desktopie 1440px, jednym wyraźnym przyciskiem CTA oraz interaktywnym podglądem produktu po prawej stronie.`,
            },
            {
              sectionName: '02. Pasek Dowodów Liczbowych i Zaufania',
              routeOrAnchor: '/#metryki',
              gridLayout: 'Pełna szerokość 12 kolumn · Siatka 4 równych bloków metryk tabular-nums',
              keyComponents: ['MetricStatRow', 'ClientProofQuotes'],
              visualAndTactileSpec: 'Czyste linie podziału 1px bez zagnieżdżonych kart, liczby w JetBrains Mono tabular-nums.',
              conversionGoal: 'Uwiarygodnienie obietnicy z sekcji Hero konkretnymi danymi w odległości <= 1 sekcji.',
              buildPrompt: `Dodaj pod sekcją Hero pełnoszerokościowy pas 4 mierzalnych wskaźników efektywności dla "${baseTitle}" używając font-mono tabular-nums i subtelnych separatorów 1px.`,
            },
            {
              sectionName: '03. Architektura Funkcji (Mechanizm -> Rezultat)',
              routeOrAnchor: '/oferta#funkcje',
              gridLayout: 'Siatka asymetryczna 3 modułów (6 + 6 kolumn oraz pełny moduł 12 kolumn)',
              keyComponents: ['InteractiveFeatureTabs', 'WorkflowPreviewCard'],
              visualAndTactileSpec: 'Przełączniki segmentowe o czasie reakcji <=180 ms, powierzchnia matowego szkła.',
              conversionGoal: 'Pokazanie jak główne procesy z pliku specyfikacji rozwiązują problem użytkownika.',
              buildPrompt: `Zaprojektuj sekcję kluczowych funkcji "${baseTitle}" z interaktywnym przełącznikiem zakładek prezentującym łańcuch: Cel użytkownika -> Mechanizm UI -> Mierzalny wynik.`,
            },
            {
              sectionName: '04. Matryca Planów i Specyfikacji Wdrożeniowej',
              routeOrAnchor: '/oferta#plany',
              gridLayout: '3 kolumny porównawcze + tabela parametrów technicznych poniżej',
              keyComponents: ['TierCardsGrid', 'SpecificationTable'],
              visualAndTactileSpec: 'Wyróżniony plan główny subtelnym obramowaniem akcentowym, konkretne limity liczbowe.',
              conversionGoal: 'Kwalifikacja leada i wybór odpowiedniego wariantu wdrożenia.',
              buildPrompt: `Stwórz przejrzystą matrycę 3 planów wdrożeniowych dla "${baseTitle}" nazywając plany według grupy docelowej i podając konkretne parametry liczbowe.`,
            },
            {
              sectionName: '05. Sekcja Konwersji Końcowej i Stopka Redakcyjna',
              routeOrAnchor: '/#kontakt',
              gridLayout: 'Kontener centralny 8 kolumn + minimalistyczna stopka 4-kolumnowa',
              keyComponents: ['QuickOnboardingForm', 'EditorialFooter'],
              visualAndTactileSpec: 'Pola formularza o wysokości >=44px z wyraźnym focus-visible, spokojna stopka bez zbędnych ozdobników.',
              conversionGoal: 'Rejestracja konta lub wysłanie zapytania wdrożeniowego.',
              buildPrompt: `Dodaj sekcję szybkiego rozpoczęcia współpracy z formularzem walidowanym po stronie klienta oraz czystą stopkę nawigacyjną dla "${baseTitle}".`,
            },
          ],
          webAppMatrix: [
            {
              moduleName: 'Autoryzacja i Inicjalizacja Sesji',
              route: '/logowanie',
              userRole: 'Gość / Użytkownik zalogowany',
              stateAndDataFlow: 'Firebase Auth / OAuth 2.0 -> synchronizacja profilu POST /api/user/sync',
              uiComponents: ['SignInModal', 'SessionGuard', 'RoleOnboardingStep'],
              transitionAndHaptics: 'frosted-sheet-detent · Szkło mrożone (74 Sh)',
              acceptanceCriteria: 'Logowanie bez przeładowania strony, obsługa błędów autoryzacji i przekierowanie do /app/pulpit.',
            },
            {
              moduleName: h3,
              route: '/app/pulpit',
              userRole: 'Operator / Klient',
              stateAndDataFlow: 'GET /api/dashboard/summary -> pamięć podręczna stanu + filtry po stronie klienta',
              uiComponents: ['SidebarNav', 'KpiStrip', 'RecentRecordsTable', 'EmptyStateCard'],
              transitionAndHaptics: 'shared-axis-z-portal · Szkło mrożone (74 Sh)',
              acceptanceCriteria: 'Pełna obsługa stanów: ładowanie (skeleton), brak danych (empty state z CTA), dane i błędy.',
            },
            {
              moduleName: h4,
              route: '/app/modul-operacyjny',
              userRole: 'Operator / Specjalista',
              stateAndDataFlow: 'CRUD REST /api/records (GET, POST, PATCH, DELETE) + walidacja schematu',
              uiComponents: ['SearchAndFilterBar', 'HighDensityGrid', 'DetailDrawer', 'BatchExportButton'],
              transitionAndHaptics: 'cnc-shutter-snap · Anodowany metal (95 Sh)',
              acceptanceCriteria: 'Wiersze 40px, wyrównanie liczb tabular-nums, filtrowanie na żywo <100 ms i eksport JSON/CSV.',
            },
            {
              moduleName: 'Generator Raportów i Archiwum Wersji',
              route: '/app/raporty',
              userRole: 'Menedżer / Administrator',
              stateAndDataFlow: 'Kolekcja migawek Firestore / tabela raportów SQL + pobieranie plików lokalnych',
              uiComponents: ['SnapshotTimeline', 'ComparisonDiffModal', 'DownloadReportMenu'],
              transitionAndHaptics: 'cascade-split-deck · Szkło polerowane (88 Sh)',
              acceptanceCriteria: 'Zapis i przywracanie migawek jednym kliknięciem oraz eksport architektury do .md / .json.',
            },
            {
              moduleName: h5,
              route: '/app/ustawienia',
              userRole: 'Administrator',
              stateAndDataFlow: 'PATCH /api/settings/workspace + reguły bezpieczeństwa RBAC',
              uiComponents: ['PermissionsMatrix', 'NotificationToggles', 'AuditHistoryList'],
              transitionAndHaptics: 'velvet-dissolve · Zamsz syntetyczny (42 Sh)',
              acceptanceCriteria: 'Kontrola ról użytkowników, zapis zmian z natychmiastowym potwierdzeniem stanu.',
            },
          ],
          masterBuildPrompt: `Zbuduj kompletny projekt webowy "${baseTitle}" (Strona internetowa + Aplikacja internetowa) w React + TypeScript + Tailwind CSS z backendem Express:\n1. Warstwa strony internetowej (/, /oferta): 3-strefowy pasek nawigacji, sekcja Hero 7/5 na siatce 1440px, pas 4 metryk tabular-nums, interaktywna prezentacja funkcji, tabela planów i formularz startowy.\n2. Warstwa aplikacji internetowej (/logowanie, /app/pulpit, /app/modul-operacyjny, /app/raporty, /app/ustawienia): nawigacja boczna, gęste tabele danych z wyszukiwarką i filtrami, obsługa stanów (loading/empty/error/populated), autoryzacja użytkowników oraz trwały zapis danych.`,
        };
      }

      const sanitizeTransition = (val: string) =>
        (validTransitions as readonly string[]).includes(val)
          ? val
          : 'spatial-glass-push';
      const sanitizeRole = (val: string) =>
        (validRoles as readonly string[]).includes(val) ? val : 'core';
      const sanitizeMaterial = (val: string) =>
        (validMaterials as readonly string[]).includes(val)
          ? val
          : 'frosted-glass';

      const roleColumn: Record<string, number> = {
        entry: 0,
        core: 1,
        detail: 2,
        settings: 2,
        modal: 3,
      };
      const colCounts: Record<number, number> = {};

      const normalizedNodes = aiPlan.screens.slice(0, 12).map((scr, idx) => {
        const cleanId =
          scr.id?.trim().replace(/[^a-zA-Z0-9_-]/g, '-') || `file-scr-${idx + 1}`;
        const role = sanitizeRole(scr.role);
        const col = roleColumn[role] ?? 1;
        const rowInCol = colCounts[col] ?? 0;
        colCounts[col] = rowInCol + 1;

        return {
          id: cleanId,
          title: scr.title || `Ekran ${idx + 1}`,
          route: scr.route?.startsWith('/')
            ? scr.route
            : `/${scr.route || `ekran-${idx + 1}`}`,
          role,
          status:
            scr.status === 'ready' || scr.status === 'review'
              ? scr.status
              : 'designing',
          summary: scr.summary || '',
          components: Array.isArray(scr.components)
            ? scr.components.slice(0, 6)
            : ['ViewContainer'],
          hapticMaterial: sanitizeMaterial(scr.hapticMaterial),
          preferredTransition: sanitizeTransition(scr.preferredTransition),
          x: 60 + col * 340,
          y: 65 + rowInCol * 185,
        };
      });

      const validNodeIds = new Set(normalizedNodes.map((n) => n.id));
      const normalizedEdges = (aiPlan.edges || [])
        .filter(
          (e) =>
            validNodeIds.has(e.fromScreenId) &&
            validNodeIds.has(e.toScreenId) &&
            e.fromScreenId !== e.toScreenId
        )
        .map((e, idx) => ({
          id: `file-edge-${idx + 1}`,
          fromScreenId: e.fromScreenId,
          toScreenId: e.toScreenId,
          triggerLabel: e.triggerLabel || 'Przejdź',
          transitionId: sanitizeTransition(e.transitionId),
        }));

      if (normalizedEdges.length === 0 && normalizedNodes.length >= 2) {
        for (let i = 0; i < normalizedNodes.length - 1; i++) {
          normalizedEdges.push({
            id: `file-edge-auto-${i + 1}`,
            fromScreenId: normalizedNodes[i].id,
            toScreenId: normalizedNodes[i + 1].id,
            triggerLabel: 'Przejdź dalej',
            transitionId: normalizedNodes[i + 1].preferredTransition,
          });
        }
      }

      const nowStamp = Date.now();
      const createdAt = new Date().toLocaleDateString('pl-PL');
      const mapId = `file-map-${nowStamp}`;

      const mapProject = {
        id: mapId,
        name: aiPlan.projectTitle || `Plan z pliku: ${safeFileName}`,
        description:
          aiPlan.executiveSummary ||
          `Plan ekranów wygenerowany na podstawie pliku ${safeFileName}.`,
        sourceRepo: `plik: ${safeFileName}`,
        defaultTransition: sanitizeTransition(aiPlan.defaultTransition),
        nodes: normalizedNodes,
        edges: normalizedEdges,
        createdAt,
      };

      const buildMatrix = {
        id: `file-matrix-${nowStamp}`,
        fileName: safeFileName,
        fileMimeType: rawMimeType || 'text/plain',
        fileSizeKb,
        targetType,
        projectTitle: mapProject.name,
        executiveSummary: mapProject.description,
        generatedByModel,
        createdAt,
        linkedScreenMapId: mapId,
        designTokens: {
          recommendedPalette:
            aiPlan.designTokens?.recommendedPalette ||
            'Neutralny kanwas 60% · Powierzchnie strukturalne 30% · Akcent 10%',
          typographyPairing:
            aiPlan.designTokens?.typographyPairing ||
            'Plus Jakarta Sans + DM Sans + JetBrains Mono (tabular-nums)',
          layoutArchitecture:
            aiPlan.designTokens?.layoutArchitecture ||
            '1440px Desktop Container + Responsywny Workspace aplikacji',
          primaryHapticMaterial: sanitizeMaterial(
            aiPlan.designTokens?.primaryHapticMaterial || 'frosted-glass'
          ),
          stackRecommendation:
            aiPlan.designTokens?.stackRecommendation ||
            'React + TypeScript + Tailwind CSS + Express + SQL/Firestore',
        },
        websiteMatrix: (aiPlan.websiteMatrix || []).slice(0, 10).map((row, idx) => ({
          id: `web-sec-${idx + 1}`,
          sectionName: row.sectionName || `0${idx + 1}. Sekcja strony`,
          routeOrAnchor: row.routeOrAnchor || `/#sekcja-${idx + 1}`,
          gridLayout: row.gridLayout || '12 kolumn Desktop (1440px) / 1 kol. Mobile',
          keyComponents: Array.isArray(row.keyComponents)
            ? row.keyComponents.slice(0, 6)
            : ['SectionContainer'],
          visualAndTactileSpec: row.visualAndTactileSpec || 'Szkło mrożone · <160 Hz',
          conversionGoal: row.conversionGoal || 'Zaangażowanie i konwersja użytkownika',
          buildPrompt: row.buildPrompt || '',
        })),
        webAppMatrix: (aiPlan.webAppMatrix || []).slice(0, 12).map((row, idx) => ({
          id: `app-mod-${idx + 1}`,
          moduleName: row.moduleName || `Moduł ${idx + 1}`,
          route: row.route?.startsWith('/') ? row.route : `/${row.route || `app/modul-${idx + 1}`}`,
          userRole: row.userRole || 'Użytkownik zalogowany',
          stateAndDataFlow: row.stateAndDataFlow || 'REST API + stan klienta',
          uiComponents: Array.isArray(row.uiComponents)
            ? row.uiComponents.slice(0, 6)
            : ['WorkspaceModule'],
          transitionAndHaptics:
            row.transitionAndHaptics || 'spatial-glass-push · Szkło mrożone',
          acceptanceCriteria:
            row.acceptanceCriteria || 'Obsługa stanów ładowania, pustego widoku i walidacji.',
        })),
        masterBuildPrompt:
          aiPlan.masterBuildPrompt ||
          `Zbuduj stronę internetową oraz aplikację internetową dla projektu "${mapProject.name}" zgodnie z wygenerowanym planem ${normalizedNodes.length} ekranów.`,
      };

      res.json({ mapProject, buildMatrix });
    } catch (error: unknown) {
      const msg =
        error instanceof Error
          ? error.message
          : 'Błąd podczas analizy wgranego pliku i generowania matrycy projektu.';
      res.status(500).json({ error: msg });
    }
  });

  // ============================================================================
  // Screen Map UI Image-Generator Prompt Refinement (Gemini 4 Hydrogen)
  // ============================================================================
  app.post('/api/screen-map/refine-image-prompt', async (req, res) => {
    try {
      const basePrompt = String(req.body?.basePrompt || '').trim();
      const screenTitle = String(req.body?.screenTitle || 'Ekran UI').trim();
      const totalButtons = Math.max(0, Math.min(20, Number(req.body?.totalButtons) || 0));
      const language = String(req.body?.language || 'en-with-pl-labels');

      if (!basePrompt) {
        return res
          .status(400)
          .json({ error: 'Brak bazowego promptu do doprecyzowania.' });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.json({
          refinedPrompt: `${basePrompt}\nLIGHTING & MICRO-DETAIL: Balanced softbox studio illumination, crisp anti-aliased button edges, exact ${totalButtons}-button layout hierarchy without visual clutter.`,
          model: 'Deterministic Spatial Engine',
        });
      }

      const ai = getGenAIClient();
      const sysInstruction =
        language === 'pl'
          ? `Jesteś dyrektorem artystycznym systemów UI/UX. Ulepsz podany prompt do generatora obrazów dla ekranu "${screenTitle}", dodając precyzyjne detale kompozycji, oświetlenia, hierarchii typograficznej i faktury powierzchni. KRYTYCZNA ZASADA: Musisz zachować DOKŁADNIE ${totalButtons} przycisków oraz wszystkie ich współrzędne X/Y, strefy (góra/środek/dół) i etykiety z promptu wejściowego. Nie zmieniaj liczby przycisków i nie dodawaj żadnych nowych elementów klikalnych. Zwróć wyłącznie gotowy tekst promptu do skopiowania (bez komentarzy wstępnych i bez znaczników markdown).`
          : `You are a Principal UI/UX Visual Systems Director. Refine the provided image-generator prompt for the screen "${screenTitle}" with richer visual hierarchy, micro-surface realism, clean grid spacing, and crisp lighting. CRITICAL INVARIANT: You MUST preserve the EXACT button count (${totalButtons} buttons in total) and every numbered button's exact zone, X/Y percentage coordinates, and quoted text label from the input prompt. Never add or remove any buttons. Output ONLY the final copy-ready prompt text without markdown code fences or commentary.`;

      const response = await generateContentWithQuotaFallback(
        ai,
        'gemini-4-hydrogen',
        {
          contents: basePrompt,
          config: {
            systemInstruction: sysInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        }
      );

      const refined = (response.text ?? '').trim() || basePrompt;
      res.json({
        refinedPrompt: refined,
        model: 'Gemini 4 Hydrogen',
      });
    } catch {
      const fallbackBase = String(req.body?.basePrompt || '').trim();
      const fallbackButtons = Math.max(0, Math.min(20, Number(req.body?.totalButtons) || 0));
      res.json({
        refinedPrompt: `${fallbackBase}\nLIGHTING & MICRO-DETAIL: Balanced softbox studio illumination, crisp anti-aliased optical glass edges, exact ${fallbackButtons}-button layout hierarchy without visual clutter.`,
        model: 'Silnik Lokalny Aether (Zero-Limit)',
      });
    }
  });

  // ============================================================================
  // Rotary Controller Click & Haptic Calibration Service Endpoint
  // ============================================================================
  app.post('/api/driver-calibration/analyze', (req, res) => {
    try {
      const raw = req.body?.config || {};
      const targetCharacter = String(req.body?.targetCharacter || 'reference-cnc');

      const clamp = (val: number, min: number, max: number) =>
        Math.max(min, Math.min(max, val));

      let detentCount = clamp(Math.round(Number(raw.detentCount) || 120), 12, 120);
      let majorTickEvery = clamp(Math.round(Number(raw.majorTickEvery) || 10), 4, 15);
      const sweepAngleDeg = clamp(Math.round(Number(raw.sweepAngleDeg) || 270), 180, 300);
      let lowBodyFreqHz = clamp(Math.round(Number(raw.lowBodyFreqHz) || 74), 36, 156);
      let mouseSnapBlend = clamp(Math.round(Number(raw.mouseSnapBlend) || 82), 0, 100);
      let majorTickAccent = Number(
        clamp(Number(raw.majorTickAccent) || 1.65, 1.0, 2.4).toFixed(2)
      );
      let rotaryHapticStrength = clamp(
        Math.round(Number(raw.rotaryHapticStrength) || 84),
        10,
        100
      );
      let tickPulseMs = clamp(Math.round(Number(raw.tickPulseMs) || 9), 3, 36);
      let endStopResistance = clamp(
        Math.round(Number(raw.endStopResistance) || 90),
        10,
        100
      );
      let axialPushForce = clamp(Math.round(Number(raw.axialPushForce) || 88), 10, 100);
      let backlashClutch = clamp(Math.round(Number(raw.backlashClutch) || 76), 0, 100);

      // Apply target mechanical-acoustic calibration law
      if (targetCharacter === 'reference-cnc') {
        detentCount = 120;
        majorTickEvery = 10;
        lowBodyFreqHz = clamp(lowBodyFreqHz, 64, 92);
        mouseSnapBlend = clamp(Math.max(76, mouseSnapBlend), 76, 94);
        tickPulseMs = clamp(tickPulseMs, 7, 11);
        majorTickAccent = 1.68;
      } else if (targetCharacter === 'studio-master') {
        detentCount = 60;
        majorTickEvery = 10;
        lowBodyFreqHz = 84;
        mouseSnapBlend = 92;
        tickPulseMs = 11;
        majorTickAccent = 1.85;
        rotaryHapticStrength = 88;
      } else if (targetCharacter === 'heavy-flywheel') {
        detentCount = 24;
        majorTickEvery = 6;
        lowBodyFreqHz = 56;
        mouseSnapBlend = 74;
        tickPulseMs = 18;
        majorTickAccent = 2.05;
        rotaryHapticStrength = 94;
        endStopResistance = 98;
      } else if (targetCharacter === 'silent-night') {
        detentCount = 96;
        majorTickEvery = 12;
        lowBodyFreqHz = 48;
        mouseSnapBlend = 42;
        tickPulseMs = 6;
        majorTickAccent = 1.35;
        rotaryHapticStrength = 52;
      }

      // Prevent pulse overlap at high detent density
      const stepAngleDeg = Number((sweepAngleDeg / detentCount).toFixed(2));
      const minCycleSec = (tickPulseMs + 6) / 1000;
      const maxCleanSpeedDegPerSec = Math.round(stepAngleDeg / Math.max(0.008, minCycleSec));
      const minorImpulseIndex = Number(
        ((rotaryHapticStrength / 100) * tickPulseMs * 0.12).toFixed(2)
      );
      const majorImpulseIndex = Number((minorImpulseIndex * majorTickAccent).toFixed(2));
      const verifiedSub160Hz = lowBodyFreqHz < 160;
      const acousticBalanceScore = clamp(
        Math.round(
          98 -
            Math.abs(mouseSnapBlend - 80) * 0.18 -
            (detentCount > 90 && tickPulseMs > 14 ? 12 : 0)
        ),
        72,
        99
      );

      const calibratedConfig = {
        detentCount,
        majorTickEvery,
        sweepAngleDeg,
        lowBodyFreqHz,
        mouseSnapBlend,
        majorTickAccent,
        rotaryHapticStrength,
        tickPulseMs,
        endStopResistance,
        axialPushForce,
        backlashClutch,
      };

      const recommendation =
        detentCount >= 96
          ? `Skalibrowano gęstą podziałkę ${detentCount} kroków (${stepAngleDeg}°/krok): skrócono impuls zapadki do ${tickPulseMs} ms przy tonie trzpienia ${lowBodyFreqHz} Hz (<160 Hz), aby zachować selektywność kliku do ${maxCleanSpeedDegPerSec} °/s.`
          : `Skalibrowano skok mechaniczny ${detentCount} zapadek (${stepAngleDeg}°/krok) z rezonansem korpusu ${lowBodyFreqHz} Hz (<160 Hz) oraz wyraźnym akcentem głównych kresek (${majorTickAccent}×).`;

      res.json({
        calibratedConfig,
        report: {
          stepAngleDeg,
          maxCleanSpeedDegPerSec,
          minorImpulseIndex,
          majorImpulseIndex,
          verifiedSub160Hz,
          acousticBalanceScore,
          recommendation,
          calibratedAt: new Date().toLocaleTimeString('pl-PL'),
        },
      });
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : 'Błąd usługi kalibracji sterownika.';
      res.status(500).json({ error: msg });
    }
  });

  // ============================================================================
  // Gemini AI Server-Side Endpoints (@google/genai)
  // ============================================================================

  // 1. Deep Reasoning Organic Animation & Haptic Physics Optimizer
  app.post('/api/gemini/optimize-animation', async (req, res) => {
    const { synth, haptic, depth } = req.body || {};
    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error('NO_KEY_USE_LOCAL');
      }
      const ai = getGenAIClient();

      const response = await generateContentWithQuotaFallback(
        ai,
        'gemini-4-hydrogen',
        {
          contents: `Zoptymalizuj parametry animacji sprężynowej (Framer Motion) i rezonansu świetlnego tak, aby idealnie i organicznie współgrały z podanym modułem dźwięku Aether oraz materiałem haptycznym:
Syntezator: ${JSON.stringify(synth)}
Haptyka i materiał: ${JSON.stringify(haptic)}
Cienie i głębia: ${JSON.stringify(depth)}`,
          config: {
            systemInstruction:
              'Jesteś głównym inżynierem fizyki interfejsów dotykowych i akustyki UI. Dobierz realistyczne, organiczne parametry sprężyny i fali świetlnej w formacie JSON. Zwróć zwięzłe wyjaśnienie w polu aiNote po polsku (maksymalnie 2 zdania).',
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.LOW,
            },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                stiffness: { type: Type.NUMBER },
                damping: { type: Type.NUMBER },
                mass: { type: Type.NUMBER },
                pressScale: { type: Type.NUMBER },
                rippleDurationMs: { type: Type.INTEGER },
                glowSpread: { type: Type.INTEGER },
                holdTremorHz: { type: Type.NUMBER },
                aiNote: { type: Type.STRING },
              },
              required: [
                'stiffness',
                'damping',
                'mass',
                'pressScale',
                'rippleDurationMs',
                'glowSpread',
                'holdTremorHz',
                'aiNote',
              ],
            },
          },
        }
      );

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch {
      const hardness = Math.max(0, Math.min(100, Number(haptic?.materialHardness) || 74));
      const baseFreq = Math.max(36, Math.min(158, Number(synth?.baseFrequency) || 86));
      const blur = Math.max(8, Math.min(80, Number(depth?.blur) || 42));
      res.json({
        stiffness: Math.round(240 + hardness * 4.2),
        damping: Math.round(22 + hardness * 0.18),
        mass: Number((1.15 - hardness * 0.0045).toFixed(2)),
        pressScale: Number((0.945 + hardness * 0.00032).toFixed(3)),
        rippleDurationMs: Math.round(520 - hardness * 2.1),
        glowSpread: Math.round(Math.max(18, Math.min(54, blur * 0.72))),
        holdTremorHz: Math.round(Math.max(10, Math.min(32, baseFreq * 0.24))),
        aiNote: `Skalibrowano sprężynę lokalnie dla twardości ${hardness} Shore i częstotliwości nośnej ${baseFreq} Hz (<160 Hz), zapewniając natychmiastowe tłumienie bez przeregulowania.`,
      });
    }
  });

  // 2. Expanded Source Prompt Generator (gemini-3.1-flash-lite / gemini-4-hydrogen / gemini-4-carbon with automatic fallback)
  app.post('/api/gemini/expand-prompt', async (req, res) => {
    const { concept, mode, palette, material, depth } = req.body || {};
    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error('NO_KEY_USE_LOCAL');
      }
      const ai = getGenAIClient();

      const selectedModel =
        mode === 'deep'
          ? 'gemini-4-carbon'
          : mode === 'fast'
            ? 'gemini-3.1-flash-lite'
            : 'gemini-4-hydrogen';

      const response = await generateContentWithQuotaFallback(ai, selectedModel, {
        contents: `Rozwiń koncepcję UI/3D w gotowy, profesjonalny prompt renderowania oraz konfigurację sorsa JSON.
Koncepcja użytkownika: "${concept || 'Szklany pulpit medyczno-finansowy z przyciskiem Dalej'}"
Paleta: ${palette}, Materiał dotyku: ${material}, Głębia cieni: ${JSON.stringify(depth)}`,
        config: {
          systemInstruction:
            'Tworzysz rozbudowane, precyzyjne podpowiedzi renderowania UI/UX oraz kompletną strukturę konfiguracji sorsa (tokeny szkła, oświetlenia PBR, twardości materiału i cieni).',
          ...(selectedModel === 'gemini-4-carbon'
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } }
            : selectedModel === 'gemini-4-hydrogen'
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              category: { type: Type.STRING },
              promptText: { type: Type.STRING },
              lightingSetup: { type: Type.STRING },
              opticalIor: { type: Type.NUMBER },
              recommendedHardness: { type: Type.INTEGER },
              recommendedReverseClutch: { type: Type.INTEGER },
            },
            required: [
              'title',
              'category',
              'promptText',
              'lightingSetup',
              'opticalIor',
              'recommendedHardness',
              'recommendedReverseClutch',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch {
      const cleanConcept = String(
        concept || 'Szklany moduł sterowania dotykowego Aether'
      ).trim();
      const mat = String(material || 'frosted-glass');
      res.json({
        title: cleanConcept.slice(0, 56),
        category: 'Tactile Glass & CNC UI',
        promptText: `Architectural tactile UI surface featuring "${cleanConcept}", ${mat} optical substrate, crisp top Fresnel specular highlight, backdrop blur ${Number(depth?.glassBlur) || 22}px, subtle elevation ${Number(depth?.elevation) || 20}px, clean 1440px studio grid.`,
        lightingSetup: 'Dual softbox key + top Fresnel rim + subsurface caustic backlight',
        opticalIor: mat === 'shiny-glass' ? 1.56 : 1.49,
        recommendedHardness: mat === 'matte-metal' ? 95 : mat === 'suede' ? 28 : 78,
        recommendedReverseClutch: mat === 'matte-metal' ? 84 : 56,
      });
    }
  });

  // 3. Analyze Uploaded Photo with real local pixel-analysis fallback + Gemini Vision enrichment
  app.post('/api/gemini/analyze-image', async (req, res) => {
    const { imageBase64, mimeType, question, localMetrics } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: 'Brak obrazu do analizy.' });
    }
    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error('NO_KEY_USE_LOCAL');
      }
      const ai = getGenAIClient();

      const cleanBase64 = String(imageBase64).replace(/^data:[^;]+;base64,/, '');
      const response = await generateContentWithQuotaFallback(
        ai,
        'gemini-4-hydrogen',
        {
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: mimeType || 'image/jpeg',
                  data: cleanBase64,
                },
              },
              {
                text:
                  question ||
                  'Przeanalizuj dokładnie ten projekt UI/obraz pod kątem: (1) WSZYSTKICH widocznych klikalnych przycisków i kontrolek (wykryj każdy wyraźny przycisk, podaj dokładne współrzędne w procentach 0-100: xPct, yPct, wPct, hPct, widoczną etykietę, rolę: primary/secondary/nav/icon oraz sugerowany profil z 4 doznań: glass-chime, metal-detent, tactile-dome, sub-velvet — NIE wymyślaj przycisków, których nie widać), (2) głębi cieni, rozmycia szkła, palety kolorów, sugerowanego materiału haptycznego (shiny-glass, frosted-glass, matte-metal, abs-plastic, suede), twardości (0-100) oraz gotowego promptu.',
              },
            ],
          },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                suggestedMaterial: { type: Type.STRING },
                suggestedHardness: { type: Type.INTEGER },
                suggestedGlassBlur: { type: Type.INTEGER },
                suggestedElevation: { type: Type.INTEGER },
                extractedPrompt: { type: Type.STRING },
                detectedButtons: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      label: { type: Type.STRING },
                      role: { type: Type.STRING },
                      xPct: { type: Type.NUMBER },
                      yPct: { type: Type.NUMBER },
                      wPct: { type: Type.NUMBER },
                      hPct: { type: Type.NUMBER },
                      shape: { type: Type.STRING },
                      sensationType: { type: Type.STRING },
                      confidence: { type: Type.NUMBER },
                    },
                    required: ['label', 'role', 'xPct', 'yPct', 'wPct', 'hPct'],
                  },
                },
              },
              required: [
                'summary',
                'suggestedMaterial',
                'suggestedHardness',
                'suggestedGlassBlur',
                'suggestedElevation',
                'extractedPrompt',
                'detectedButtons',
              ],
            },
          },
        }
      );

      const parsed = JSON.parse((response.text ?? '{}').trim());
      const rawButtons = Array.isArray(parsed.detectedButtons) ? parsed.detectedButtons : [];
      const sanitizedButtons = rawButtons
        .filter((b: Record<string, unknown>) => b && typeof b.xPct === 'number' && typeof b.yPct === 'number')
        .map((b: Record<string, unknown>, idx: number) => ({
          id: `ai-btn-${idx + 1}`,
          label: String(b.label || `Przycisk ${idx + 1}`).slice(0, 48),
          role: String(b.role || 'secondary'),
          xPct: Math.max(0, Math.min(96, Number(b.xPct) || 0)),
          yPct: Math.max(0, Math.min(96, Number(b.yPct) || 0)),
          wPct: Math.max(4, Math.min(90, Number(b.wPct) || 14)),
          hPct: Math.max(3, Math.min(35, Number(b.hPct) || 6)),
          shape: String(b.shape || 'pill'),
          sensationType: String(b.sensationType || 'glass-chime'),
          confidence: Math.max(0.35, Math.min(1, Number(b.confidence) || 0.86)),
          source: 'gemini-vision',
        }));
      const mergedButtons =
        sanitizedButtons.length > 0
          ? sanitizedButtons
          : Array.isArray(localMetrics?.detectedButtons)
            ? localMetrics.detectedButtons
            : [];
      res.json({ ...parsed, detectedButtons: mergedButtons, analysisEngine: 'gemini-vision' });
    } catch {
      if (localMetrics && typeof localMetrics === 'object') {
        res.json({
          summary: String(localMetrics.summary || 'Analiza pikseli ukończona.'),
          suggestedMaterial: String(localMetrics.suggestedMaterial || 'frosted-glass'),
          suggestedHardness: Number(localMetrics.suggestedHardness) || 74,
          suggestedGlassBlur: Number(localMetrics.suggestedGlassBlur) || 20,
          suggestedElevation: Number(localMetrics.suggestedElevation) || 18,
          extractedPrompt: String(localMetrics.extractedPrompt || ''),
          detectedButtons: Array.isArray(localMetrics.detectedButtons) ? localMetrics.detectedButtons : [],
          analysisEngine: 'local-pixel-cv',
        });
        return;
      }
      res.json({
        summary:
          'Wykryto wielowarstwową architekturę interfejsu z wyraźną hierarchią kart i kontrastowymi punktami akcji (analiza lokalna Zero-Limit).',
        suggestedMaterial: 'frosted-glass',
        suggestedHardness: 78,
        suggestedGlassBlur: 22,
        suggestedElevation: 18,
        extractedPrompt:
          'Clean architectural 1440px desktop UI with frosted optical glass cards, crisp Fresnel top rim highlights, balanced 60-30-10 neutral palette, and high-contrast interactive controls.',
        analysisEngine: 'local-fallback',
      });
    }
  });

  // 3b. Export Generated Frontend Project + Graphics directly to local scratch/generated-frontends/
  app.post('/api/vision/export-project', (req, res) => {
    try {
      const { slug = 'generated-frontend', files = {} } = req.body || {};
      if (!files || typeof files !== 'object' || Object.keys(files).length === 0) {
        return res.status(400).json({ error: 'Brak plików projektu do zapisania.' });
      }
      const safeSlug =
        String(slug)
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 48) || 'generated-frontend';
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const baseExportRoot = path.resolve(__dirname, '..', 'generated-frontends');
      const outputDir = path.join(baseExportRoot, `${safeSlug}-${stamp}`);
      fs.mkdirSync(outputDir, { recursive: true });

      let fileCount = 0;
      for (const [relPath, rawContent] of Object.entries(files as Record<string, string>)) {
        const normalized = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
        const fullPath = path.join(outputDir, normalized);
        if (!fullPath.startsWith(outputDir)) continue;
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });

        if (typeof rawContent === 'string' && rawContent.startsWith('data:image/')) {
          const commaIdx = rawContent.indexOf(',');
          const b64 = commaIdx >= 0 ? rawContent.slice(commaIdx + 1) : rawContent;
          fs.writeFileSync(fullPath, Buffer.from(b64, 'base64'));
        } else {
          fs.writeFileSync(fullPath, String(rawContent ?? ''), 'utf-8');
        }
        fileCount++;
      }

      const launcherPath = path.join(outputDir, 'open-offline.command');
      fs.writeFileSync(
        launcherPath,
        `#!/usr/bin/env zsh\nDIR="$(cd "$(dirname "$0")" && pwd)"\nopen "$DIR/index.html"\n`,
        { mode: 0o755 }
      );
      fileCount++;

      res.json({ ok: true, outputDir, fileCount });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Błąd zapisu projektu na dysk.';
      res.status(500).json({ error: message });
    }
  });

  // 3c. Detect installed local Apple Silicon / HTTP diffusion engines (mflux / Draw Things / A1111)
  app.get('/api/vision/local-engines', async (_req, res) => {
    const { execFileSync } = await import('child_process');
    let mfluxAvailable = false;
    try {
      execFileSync('which', ['mflux-generate'], { stdio: 'ignore' });
      mfluxAvailable = true;
    } catch {
      mfluxAvailable = false;
    }

    let localHttpApiAvailable = false;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 800);
      const r = await fetch('http://127.0.0.1:7860/sdapi/v1/sd-models', { signal: ctrl.signal });
      clearTimeout(timer);
      localHttpApiAvailable = r.ok;
    } catch {
      localHttpApiAvailable = false;
    }

    res.json({
      proceduralCanvas: true,
      mfluxAvailable,
      localHttpApiAvailable,
      installMfluxHint: 'uv tool install mflux',
      localHttpEndpoint: 'http://127.0.0.1:7860',
    });
  });

  // 3d. Generate photorealistic image via local Apple Silicon mflux or local HTTP API (Draw Things / A1111)
  app.post('/api/vision/generate-local-image', async (req, res) => {
    const {
      prompt,
      negativePrompt = '',
      width = 1024,
      height = 576,
      localApiUrl = 'http://127.0.0.1:7860',
    } = req.body || {};

    if (!prompt) {
      return res.status(400).json({ error: 'Brak promptu do wygenerowania grafiki.' });
    }

    // 1. Try local HTTP API (Draw Things / Automatic1111 / Forge) if reachable
    try {
      const cleanUrl = String(localApiUrl || 'http://127.0.0.1:7860').replace(/\/+$/, '');
      if (cleanUrl.startsWith('http://127.0.0.1') || cleanUrl.startsWith('http://localhost')) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 45000);
        const resp = await fetch(`${cleanUrl}/sdapi/v1/txt2img`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            negative_prompt: negativePrompt,
            width: Number(width) || 1024,
            height: Number(height) || 576,
            steps: 8,
          }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (resp.ok) {
          const data = (await resp.json()) as { images?: string[] };
          if (data.images?.[0]) {
            return res.json({
              ok: true,
              engine: 'local-http-sdapi',
              imageDataUrl: `data:image/png;base64,${data.images[0]}`,
            });
          }
        }
      }
    } catch {
      // Fall through to mflux check
    }

    // 2. Try local mflux-generate (FLUX.1-schnell on Apple Metal)
    try {
      const { execFile } = await import('child_process');
      const os = await import('os');
      const outPath = path.join(os.tmpdir(), `aether-mflux-${Date.now()}.png`);
      await new Promise<void>((resolve, reject) => {
        execFile(
          'mflux-generate',
          [
            '--model',
            'schnell',
            '--steps',
            '4',
            '--width',
            String(Number(width) || 1024),
            '--height',
            String(Number(height) || 576),
            '--prompt',
            String(prompt),
            '--output',
            outPath,
          ],
          { timeout: 120000 },
          (err) => (err ? reject(err) : resolve())
        );
      });
      if (fs.existsSync(outPath)) {
        const b64 = fs.readFileSync(outPath).toString('base64');
        fs.unlinkSync(outPath);
        return res.json({
          ok: true,
          engine: 'mflux-apple-metal',
          imageDataUrl: `data:image/png;base64,${b64}`,
        });
      }
    } catch {
      // Neither local diffusion engine installed
    }

    return res.status(200).json({
      ok: false,
      fallbackToBrowserRenderer: true,
      message:
        'Użyto wbudowanego lokalnego renderera studyjnego (100% offline). Aby podłączyć FLUX.1-schnell na Apple Silicon, zainstaluj: uv tool install mflux lub włącz lokalny serwer API w Draw Things (127.0.0.1:7860).',
    });
  });

  // 4. Create & Edit High-Quality Images (gemini-nano-banana-2.1 & gemini-3-pro-image-preview, 1K/2K/4K, all aspect ratios)
  app.post('/api/gemini/generate-image', async (req, res) => {
    try {
      const {
        prompt,
        aspectRatio = '1:1',
        imageSize = '1K',
        model = 'gemini-nano-banana-2.1',
        sourceImageBase64,
        sourceMimeType,
      } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: 'Wprowadź opis obrazu (prompt).' });
      }

      const ai = getGenAIClient();
      const parts: Array<
        { text: string } | { inlineData: { data: string; mimeType: string } }
      > = [];

      if (sourceImageBase64) {
        const cleanBase64 = String(sourceImageBase64).replace(/^data:[^;]+;base64,/, '');
        parts.push({
          inlineData: {
            data: cleanBase64,
            mimeType: sourceMimeType || 'image/png',
          },
        });
      }
      parts.push({ text: String(prompt) });

      const runImageGen = async (targetModel: string) => {
        return ai.models.generateContent({
          model: targetModel,
          contents: { parts },
          config: {
            imageConfig: {
              aspectRatio: String(aspectRatio),
              imageSize: String(imageSize),
            },
          },
        });
      };

      let response;
      try {
        response = await runImageGen(String(model));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (String(model) === 'gemini-3-pro-image-preview' && msg.includes('404')) {
          response = await runImageGen('gemini-3-pro-image');
        } else {
          throw err;
        }
      }

      let imageUrl: string | null = null;
      let notes = '';

      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType ?? 'image/png';
          imageUrl = `data:${mime};base64,${part.inlineData.data}`;
        } else if (part.text) {
          notes += part.text;
        }
      }

      if (!imageUrl) {
        return res.status(500).json({
          error: 'Model nie zwrócił danych obrazu. Spróbuj doprecyzować opis.',
        });
      }

      res.json({ imageUrl, notes });
    } catch (error) {
      const formatted = formatGeminiError(error);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 5. Generate Video from Text or Animate Photo into Video (gemini-omni-1.2-flash via Interactions API)
  app.post('/api/gemini/generate-video', async (req, res) => {
    try {
      const {
        prompt,
        aspectRatio = '16:9',
        sourceImageBase64,
        sourceMimeType,
      } = req.body;

      if (!prompt && !sourceImageBase64) {
        return res.status(400).json({ error: 'Podaj opis animacji lub prześlij zdjęcie.' });
      }

      const ai = getGenAIClient();
      const validAspect = aspectRatio === '9:16' ? '9:16' : '16:9';

      const inputPayload = sourceImageBase64
        ? [
            {
              type: 'image' as const,
              mime_type: sourceMimeType || 'image/png',
              data: String(sourceImageBase64).replace(/^data:[^;]+;base64,/, ''),
            },
            {
              type: 'text' as const,
              text:
                String(prompt || '').trim() ||
                'Subtelna płynna animacja światła podpowierzchniowego i głębi ostrości szkła w jakości studyjnej.',
            },
          ]
        : String(prompt);

      const interaction = await ai.interactions.create(
        {
          model: 'gemini-omni-1.2-flash',
          input: inputPayload,
          background: false,
          store: false,
          stream: false,
          response_format: {
            type: 'video',
            aspect_ratio: validAspect,
            duration: '5s',
            resolution: '720p',
          },
        },
        { timeout: 300000 }
      );

      const videoPart = interaction.output_video;
      if (videoPart?.data) {
        const mime = videoPart.mime_type || 'video/mp4';
        return res.json({
          videoUrl: `data:${mime};base64,${videoPart.data}`,
        });
      }
      if (videoPart?.uri) {
        return res.json({
          videoUrl: videoPart.uri,
        });
      }

      res.status(500).json({
        error: 'Nie udało się odczytać strumienia wideo z odpowiedzi modelu.',
      });
    } catch (error) {
      const formatted = formatGeminiError(error);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 6. Audio Transcription from Microphone (gemini-3.5-transcribe)
  app.post('/api/gemini/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType } = req.body;
      if (!audioBase64) {
        return res.status(400).json({ error: 'Brak nagrania audio do transkrypcji.' });
      }

      const ai = getGenAIClient();
      const cleanBase64 = String(audioBase64).replace(/^data:[^;]+;base64,/, '');

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType || 'audio/webm',
                data: cleanBase64,
              },
            },
            {
              text: 'Transkrybuj dokładnie wypowiedź z nagrania audio.',
            },
          ],
        },
      });

      res.json({ text: (response.text ?? '').trim() });
    } catch (error) {
      const formatted = formatGeminiError(error);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 7. Multimodal Complete UI Element Generator (Prompt + Attached Graphics -> Interactive Spec + React/Tailwind TSX)
  app.post('/api/gemini/generate-complete-element', async (req, res) => {
    try {
      const {
        compiledPrompt,
        userBrief,
        targetScreenId,
        targetScreenTitle,
        targetZone,
        palette,
        material,
        baseFreqHz,
        attachedGraphics,
      } = req.body || {};

      const ai = getGenAIClient();
      const parts: Array<
        | { inlineData: { mimeType: string; data: string } }
        | { text: string }
      > = [];

      const validGraphics = Array.isArray(attachedGraphics)
        ? attachedGraphics.slice(0, 4)
        : [];

      let referenceThumbUrl: string | undefined;
      for (const gfx of validGraphics) {
        if (typeof gfx?.dataUrl === 'string' && gfx.dataUrl.startsWith('data:')) {
          if (!referenceThumbUrl) referenceThumbUrl = gfx.dataUrl;
          const match = gfx.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (match && !match[1].includes('svg')) {
            parts.push({
              inlineData: {
                mimeType: match[1],
                data: match[2],
              },
            });
          }
        }
      }

      const instructionPrompt = `Zaprojektuj i wygeneruj KOMPLETNY, produkcyjny element interfejsu frontendowego (React 19 + TypeScript + Tailwind CSS) na podstawie poniższego kompletnego promptu i załączonych grafik referencyjnych (${validGraphics.length} załączników).

 Kontekst docelowy:
 - Ekran docelowy: ${String(targetScreenTitle || targetScreenId || 'Ekran Główny')} (ID: ${String(targetScreenId || 'scr-dashboard')})
 - Strefa osadzenia w modelu frontendu: ${String(targetZone || 'main')}
 - Paleta: ${String(palette || 'pearl-flebologia')}, Materiał haptyczny: ${String(material || 'frosted-glass')}, Częstotliwość akustyczna: ${Number(baseFreqHz) || 86} Hz (<160 Hz)
 - Główna intencja projektanta: ${String(userBrief || 'Kompletny moduł sterowania i prezentacji danych')}

 Pełny skompilowany prompt z parametrami studia:
 ${String(compiledPrompt || userBrief || '')}

 Wymagania:
 1. Zwróć poprawne dane w formacie JSON zgodnym ze schematem.
 2. Pole "reactTailwindCode" musi zawierać kompletny, czysty, gotowy do zapisu w pliku .tsx komponent React z obsługą trybu jasnego i ciemnego (dark:*), tabular-nums dla liczb oraz estetyką szkła i dotyku (bez komentarzy // w nagłówkach UI i bez zbędnych ozdobników).
 3. Pole "controls" (3 do 5 elementów) definiuje interaktywne kontrolki prezentowane natychmiast w podglądzie modelu frontendu (kind musi być jednym z: "primary-cta", "secondary-btn", "slider", "toggle", "metric-tile").`;

      parts.push({ text: instructionPrompt });

      const response = await generateContentWithQuotaFallback(
        ai,
        'gemini-4-hydrogen',
        {
          contents: { parts },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                fileName: { type: Type.STRING },
                categoryLabel: { type: Type.STRING },
                summary: { type: Type.STRING },
                headline: { type: Type.STRING },
                subheadline: { type: Type.STRING },
                accentHex: { type: Type.STRING },
                controls: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      kind: { type: Type.STRING },
                      label: { type: Type.STRING },
                      valueText: { type: Type.STRING },
                    },
                    required: ['id', 'kind', 'label'],
                  },
                },
                reactTailwindCode: { type: Type.STRING },
              },
              required: [
                'name',
                'fileName',
                'categoryLabel',
                'summary',
                'headline',
                'subheadline',
                'accentHex',
                'controls',
                'reactTailwindCode',
              ],
            },
          },
        }
      );

      const parsed = JSON.parse((response.text ?? '{}').trim());
      const allowedKinds = new Set([
        'primary-cta',
        'secondary-btn',
        'slider',
        'toggle',
        'metric-tile',
      ]);
      const normalizedControls = Array.isArray(parsed.controls)
        ? parsed.controls.slice(0, 6).map((c: Record<string, unknown>, idx: number) => ({
            id: String(c.id || `ctrl-${idx + 1}`),
            kind: allowedKinds.has(String(c.kind)) ? String(c.kind) : 'secondary-btn',
            label: String(c.label || `Akcja ${idx + 1}`),
            valueText: c.valueText ? String(c.valueText) : undefined,
          }))
        : [];

      res.json({
        name: String(parsed.name || 'Wygenerowany Element UI'),
        fileName: String(parsed.fileName || 'GeneratedTactileElement.tsx').endsWith('.tsx')
          ? String(parsed.fileName)
          : `${String(parsed.fileName || 'GeneratedTactileElement')}.tsx`,
        targetScreenId: String(targetScreenId || 'scr-dashboard'),
        targetZone: String(targetZone || 'main'),
        categoryLabel: String(parsed.categoryLabel || 'Kompletny Moduł UI'),
        summary: String(parsed.summary || ''),
        headline: String(parsed.headline || parsed.name || 'Moduł Frontendu'),
        subheadline: String(parsed.subheadline || parsed.summary || ''),
        accentHex: /^#[0-9A-Fa-f]{6}$/.test(String(parsed.accentHex || ''))
          ? String(parsed.accentHex)
          : '#4F46E5',
        referenceThumbUrl,
        controls: normalizedControls,
        reactTailwindCode: String(parsed.reactTailwindCode || ''),
      });
    } catch {
      const {
        userBrief,
        targetScreenId,
        targetZone,
        palette,
        material,
        baseFreqHz,
        attachedGraphics,
      } = req.body || {};
      const cleanBrief =
        String(userBrief || '').trim() || 'Moduł Sterowania i Prezentacji Frontendu';
      const pascal =
        cleanBrief
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9]+/g, ' ')
          .trim()
          .split(/\s+/)
          .slice(0, 4)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join('') || 'TactileFrontendModule';
      const safeComp = /^[A-Za-z]/.test(pascal) ? pascal : `Ui${pascal}`;
      const hz = Math.max(36, Math.min(156, Number(baseFreqHz) || 82));
      const zone = String(targetZone || 'main');
      const accentHex =
        palette === 'emerald-clinic'
          ? '#34D399'
          : palette === 'finance-ice'
            ? '#38BDF8'
            : '#6366F1';
      const firstThumb =
        Array.isArray(attachedGraphics) && typeof attachedGraphics[0]?.dataUrl === 'string'
          ? attachedGraphics[0].dataUrl
          : undefined;

      const fallbackControls =
        zone === 'header'
          ? [
              { id: 'c-nav-1', kind: 'secondary-btn', label: 'Przegląd modułów' },
              { id: 'c-nav-2', kind: 'toggle', label: 'Podświetlenie Fresnela', valueText: 'Aktywne' },
              { id: 'c-nav-3', kind: 'primary-cta', label: 'Otwórz panel główny' },
            ]
          : zone === 'footer'
            ? [
                { id: 'c-ft-1', kind: 'metric-tile', label: 'Klik akustyczny', valueText: `${hz} Hz · 6 ms` },
                { id: 'c-ft-2', kind: 'secondary-btn', label: 'Zapisz wariant' },
                { id: 'c-ft-3', kind: 'primary-cta', label: 'Zatwierdź i przejdź dalej' },
              ]
            : [
                { id: 'c-mn-1', kind: 'metric-tile', label: 'Pasmo rezonansu', valueText: `${hz} Hz (<160 Hz)` },
                { id: 'c-mn-2', kind: 'slider', label: 'Natężenie podświetlenia', valueText: '82%' },
                { id: 'c-mn-3', kind: 'toggle', label: 'Minimalistyczny klik', valueText: 'Włączony' },
                { id: 'c-mn-4', kind: 'primary-cta', label: 'Uruchom moduł' },
              ];

      const fallbackTsx = `import React, { useState } from 'react';

export const ${safeComp}: React.FC<{ onPrimaryAction?: () => void }> = ({ onPrimaryAction }) => {
  const [level, setLevel] = useState(82);
  const [active, setActive] = useState(true);

  return (
    <section className="p-6 rounded-2xl border border-slate-200/80 dark:border-emerald-400/25 bg-white/90 dark:bg-emerald-950/80 backdrop-blur-xl shadow-sm space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs text-slate-500 dark:text-emerald-300/80">
            Strefa ${zone} · ${String(material || 'frosted-glass')} · ${hz} Hz
          </div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-emerald-50">
            ${cleanBrief.replace(/"/g, "'")}
          </h2>
        </div>
        <span className="font-mono tabular-nums text-sm font-semibold text-indigo-600 dark:text-emerald-300">
          {level}%
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        value={level}
        onChange={(e) => setLevel(Number(e.target.value))}
        className="w-full accent-indigo-600 dark:accent-emerald-400 cursor-pointer"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={() => setActive((v) => !v)}
          className="px-3.5 py-2 rounded-xl text-xs font-medium bg-slate-100 dark:bg-emerald-900/60 text-slate-800 dark:text-emerald-100 cursor-pointer"
        >
          {active ? 'Podświetlenie aktywne' : 'Podświetlenie wyciszone'}
        </button>
        <button
          type="button"
          onClick={onPrimaryAction}
          className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-emerald-400 text-white dark:text-emerald-950 cursor-pointer"
        >
          Zatwierdź i przejdź dalej
        </button>
      </div>
    </section>
  );
};

export default ${safeComp};
`;

      res.json({
        name: cleanBrief.slice(0, 46),
        fileName: `${safeComp}.tsx`,
        targetScreenId: String(targetScreenId || 'scr-dashboard'),
        targetZone: zone,
        categoryLabel: 'Moduł Frontendu · Zero-Limit',
        summary: `Kompletny, interaktywny moduł wygenerowany bez limitów zapytań dla strefy ${zone} (${hz} Hz).`,
        headline: cleanBrief.slice(0, 68),
        subheadline: `Zoptymalizowane podświetlenie optyczne oraz minimalistyczny klik ${hz} Hz (<160 Hz).`,
        accentHex,
        referenceThumbUrl: firstThumb,
        controls: fallbackControls,
        reactTailwindCode: fallbackTsx,
      });
    }
  });

  // ============================================================================
  // GitHub OAuth Popup Integration & Atomic Repository Export (/api/github/*)
  // ============================================================================
  app.get('/api/github/oauth/url', (req, res) => {
    const clientId = process.env.GITHUB_CLIENT_ID || process.env.CLIENT_ID || '';
    const appBaseUrl = (
      process.env.APP_URL ||
      String(req.query.origin || '').trim() ||
      'http://localhost:3000'
    ).replace(/\/+$/, '');
    const redirectUri = `${appBaseUrl}/auth/github/callback`;

    if (!clientId) {
      return res.json({
        configured: false,
        redirectUri,
        message:
          'Aplikacja GitHub OAuth nie ma jeszcze ustawionego GITHUB_CLIENT_ID. Możesz od razu wypchnąć repozytorium podając Personal Access Token GitHub lub pobrać gotowe archiwum Git (.zip).',
      });
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'repo',
    });

    res.json({
      configured: true,
      redirectUri,
      url: `https://github.com/login/oauth/authorize?${params.toString()}`,
    });
  });

  const githubOAuthCallbackHandler: express.RequestHandler = async (req, res) => {
    const code = String(req.query.code || '');
    const clientId = process.env.GITHUB_CLIENT_ID || process.env.CLIENT_ID || '';
    const clientSecret =
      process.env.GITHUB_CLIENT_SECRET || process.env.CLIENT_SECRET || '';

    if (!code || !clientId || !clientSecret) {
      return res.status(400).send(`<!doctype html><html lang="pl"><body>
        <p>Brak kodu autoryzacji lub konfiguracji GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET.</p>
      </body></html>`);
    }

    try {
      const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      });
      const tokenJson = (await tokenResp.json()) as {
        access_token?: string;
        error_description?: string;
      };
      if (!tokenJson.access_token) {
        throw new Error(tokenJson.error_description || 'Brak access_token z GitHub.');
      }

      let login = 'github-user';
      const userResp = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${tokenJson.access_token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'aether-tactile-studio',
        },
      });
      if (userResp.ok) {
        const u = (await userResp.json()) as { login?: string };
        if (u.login) login = u.login;
      }

      const payloadScript = safeJsonForInlineScript({
        type: 'GITHUB_OAUTH_SUCCESS',
        accessToken: tokenJson.access_token,
        login,
      });

      res.send(`<!doctype html>
<html lang="pl">
  <body style="font-family: system-ui, sans-serif; padding: 24px;">
    <script>
      if (window.opener) {
        window.opener.postMessage(${payloadScript}, '*');
        window.close();
      } else {
        window.location.href = '/';
      }
    </script>
    <p>Autoryzacja GitHub zakończona pomyślnie (${login}). To okno zamknie się automatycznie.</p>
  </body>
</html>`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Błąd autoryzacji GitHub.';
      res.status(500).send(`<!doctype html><html lang="pl"><body><p>${msg}</p></body></html>`);
    }
  };

  app.get(['/auth/github/callback', '/auth/github/callback/'], githubOAuthCallbackHandler);

  app.post('/api/github/export-repo', async (req, res) => {
    try {
      const {
        githubToken,
        repoName,
        repoDescription,
        isPrivate,
        branch = 'main',
        commitMessage = 'feat: export frontend model & generated UI elements from Aether Tactile Studio',
        files,
      } = req.body || {};

      const cleanToken = String(githubToken || '').trim();
      if (!cleanToken) {
        return res.status(400).json({
          error: 'Podaj token autoryzacji GitHub lub połącz konto GitHub OAuth.',
        });
      }
      if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({
          error: 'Brak wygenerowanych plików repozytorium do wysłania.',
        });
      }

      const ghHeaders = {
        Authorization: `Bearer ${cleanToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'aether-tactile-studio',
        'X-GitHub-Api-Version': '2022-11-28',
      };

      const userResp = await fetch('https://api.github.com/user', { headers: ghHeaders });
      if (!userResp.ok) {
        return res.status(401).json({
          error:
            'Nieprawidłowy token GitHub lub brak uprawnień. Wygeneruj token z zakresem repo (lub Contents: Read & Write).',
        });
      }
      const ghUser = (await userResp.json()) as { login: string };

      const rawRepo = String(repoName || 'aether-tactile-frontend').trim();
      const [explicitOwner, explicitName] = rawRepo.includes('/')
        ? rawRepo.split('/', 2)
        : [
            ghUser.login,
            rawRepo
              .toLowerCase()
              .replace(/[^a-z0-9-_]+/g, '-')
              .replace(/^-+|-+$/g, '') || 'aether-tactile-frontend',
          ];
      const owner = explicitOwner || ghUser.login;
      const cleanRepoName = explicitName || 'aether-tactile-frontend';

      let createdNewRepo = false;
      let repoData: { full_name: string; html_url: string; default_branch: string };

      const checkResp = await fetch(
        `https://api.github.com/repos/${owner}/${cleanRepoName}`,
        { headers: ghHeaders }
      );

      if (checkResp.status === 404) {
        const createResp = await fetch('https://api.github.com/user/repos', {
          method: 'POST',
          headers: ghHeaders,
          body: JSON.stringify({
            name: cleanRepoName,
            description:
              String(repoDescription || '').trim() ||
              'Projekt frontendowy wygenerowany w Aether Tactile Studio',
            private: Boolean(isPrivate),
            auto_init: true,
          }),
        });
        if (!createResp.ok) {
          const errJson = (await createResp.json().catch(() => ({}))) as {
            message?: string;
          };
          return res.status(createResp.status).json({
            error:
              errJson.message ||
              'Nie udało się utworzyć repozytorium na GitHub (sprawdź uprawnienia tokenu).',
          });
        }
        repoData = await createResp.json();
        createdNewRepo = true;
        await new Promise((r) => setTimeout(r, 900));
      } else if (!checkResp.ok) {
        return res.status(checkResp.status).json({
          error: 'Brak dostępu do wskazanego repozytorium GitHub.',
        });
      } else {
        repoData = await checkResp.json();
      }

      const targetBranch = String(branch || repoData.default_branch || 'main').trim();
      let baseCommitSha: string | null = null;
      let baseTreeSha: string | null = null;

      const refResp = await fetch(
        `https://api.github.com/repos/${repoData.full_name}/git/ref/heads/${targetBranch}`,
        { headers: ghHeaders }
      );
      if (refResp.ok) {
        const refData = await refResp.json();
        baseCommitSha = refData?.object?.sha || null;
      } else {
        const fallbackRef = await fetch(
          `https://api.github.com/repos/${repoData.full_name}/git/ref/heads/${repoData.default_branch || 'main'}`,
          { headers: ghHeaders }
        );
        if (fallbackRef.ok) {
          const refData = await fallbackRef.json();
          baseCommitSha = refData?.object?.sha || null;
        }
      }

      if (baseCommitSha) {
        const commitResp = await fetch(
          `https://api.github.com/repos/${repoData.full_name}/git/commits/${baseCommitSha}`,
          { headers: ghHeaders }
        );
        if (commitResp.ok) {
          const commitData = await commitResp.json();
          baseTreeSha = commitData?.tree?.sha || null;
        }
      }

      const treeItems: Array<{
        path: string;
        mode: '100644' | '100755';
        type: 'blob';
        sha: string;
      }> = [];

      for (const f of files as Array<{ path: string; content: string; encoding?: string }>) {
        const blobResp = await fetch(
          `https://api.github.com/repos/${repoData.full_name}/git/blobs`,
          {
            method: 'POST',
            headers: ghHeaders,
            body: JSON.stringify({
              content: String(f.content ?? ''),
              encoding: f.encoding === 'base64' ? 'base64' : 'utf-8',
            }),
          }
        );
        if (!blobResp.ok) {
          return res.status(502).json({
            error: `Błąd zapisu pliku ${f.path} w GitHub Git Data API.`,
          });
        }
        const blobJson = (await blobResp.json()) as { sha: string };
        treeItems.push({
          path: String(f.path),
          mode: String(f.path).endsWith('.sh') ? '100755' : '100644',
          type: 'blob',
          sha: blobJson.sha,
        });
      }

      const treeResp = await fetch(
        `https://api.github.com/repos/${repoData.full_name}/git/trees`,
        {
          method: 'POST',
          headers: ghHeaders,
          body: JSON.stringify({
            ...(baseTreeSha ? { base_tree: baseTreeSha } : {}),
            tree: treeItems,
          }),
        }
      );
      if (!treeResp.ok) {
        return res.status(502).json({ error: 'Błąd budowania drzewa Git na GitHub.' });
      }
      const treeJson = (await treeResp.json()) as { sha: string };

      const commitCreateResp = await fetch(
        `https://api.github.com/repos/${repoData.full_name}/git/commits`,
        {
          method: 'POST',
          headers: ghHeaders,
          body: JSON.stringify({
            message: String(commitMessage),
            tree: treeJson.sha,
            parents: baseCommitSha ? [baseCommitSha] : [],
          }),
        }
      );
      if (!commitCreateResp.ok) {
        return res.status(502).json({ error: 'Błąd tworzenia commita Git na GitHub.' });
      }
      const newCommit = (await commitCreateResp.json()) as { sha: string };

      const patchRefResp = await fetch(
        `https://api.github.com/repos/${repoData.full_name}/git/refs/heads/${targetBranch}`,
        {
          method: 'PATCH',
          headers: ghHeaders,
          body: JSON.stringify({ sha: newCommit.sha, force: true }),
        }
      );
      if (!patchRefResp.ok) {
        await fetch(`https://api.github.com/repos/${repoData.full_name}/git/refs`, {
          method: 'POST',
          headers: ghHeaders,
          body: JSON.stringify({
            ref: `refs/heads/${targetBranch}`,
            sha: newCommit.sha,
          }),
        });
      }

      const cleanTopics = Array.isArray(req.body?.topics)
        ? (req.body.topics as unknown[])
            .map((t) =>
              String(t || '')
                .toLowerCase()
                .replace(/[^a-z0-9-]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .slice(0, 50)
            )
            .filter(Boolean)
            .slice(0, 20)
        : [];

      if (cleanTopics.length > 0) {
        try {
          await fetch(`https://api.github.com/repos/${repoData.full_name}/topics`, {
            method: 'PUT',
            headers: ghHeaders,
            body: JSON.stringify({ names: cleanTopics }),
          });
        } catch {
          // Non-fatal if token does not include repository metadata write
        }
      }

      res.json({
        repoFullName: repoData.full_name,
        repoHtmlUrl: repoData.html_url,
        branch: targetBranch,
        commitSha: newCommit.sha,
        filesCount: treeItems.length,
        createdNewRepo,
        appliedTopics: cleanTopics,
      });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Wystąpił błąd podczas eksportu na GitHub.';
      res.status(500).json({ error: msg });
    }
  });

  // Generate tailored GitHub Repository Description, Topics & Subtitle via Gemini
  app.post('/api/gemini/generate-repo-profile', async (req, res) => {
    try {
      const {
        projectName,
        screensCount,
        generatedElementsCount,
        activePluginNames,
        materialLabel,
        palette,
        baseFreqHz,
      } = req.body || {};

      const ai = getGenAIClient();
      const response = await generateContentWithQuotaFallback(
        ai,
        'gemini-4-hydrogen',
        {
          contents: `Przygotuj profesjonalny opis aplikacji do utworzenia repozytorium na GitHub po polsku.
 Dane projektu:
 - Nazwa projektu: ${String(projectName || 'Aether Tactile Studio')}
 - Liczba ekranów w architekturze: ${Number(screensCount) || 7}
 - Wygenerowane komponenty .tsx: ${Number(generatedElementsCount) || 0}
 - Aktywne wtyczek zewnętrzne: ${Array.isArray(activePluginNames) && activePluginNames.length ? activePluginNames.join(', ') : 'Figma, VS Code, Web Embed SDK'}
 - Materiał i akustyka: ${String(materialLabel || 'Szkło matowe')}, ${Number(baseFreqHz) || 86} Hz (<160 Hz), paleta ${String(palette || 'pearl-flebologia')}

 Zwróć JSON zawierający:
 1. "shortAboutDescription" — zwięzły, konkretny opis do pola "About" na GitHub (maksymalnie 320 znaków, bez emoji).
 2. "readmeSubtitle" — rozszerzone 2-zdaniowe wprowadzenie techniczne na górę pliku README.md.
 3. "topics" — tablicę 8-10 tagów GitHub (małe litery, myślniki, np. "react", "typescript", "threejs", "web-audio-api", "haptics").`,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                shortAboutDescription: { type: Type.STRING },
                readmeSubtitle: { type: Type.STRING },
                topics: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['shortAboutDescription', 'readmeSubtitle', 'topics'],
            },
          },
        }
      );

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({
        shortAboutDescription: String(parsed.shortAboutDescription || '').slice(0, 345),
        readmeSubtitle: String(parsed.readmeSubtitle || ''),
        topics: Array.isArray(parsed.topics)
          ? parsed.topics
              .map((t: unknown) =>
                String(t || '')
                  .toLowerCase()
                  .replace(/[^a-z0-9-]+/g, '-')
                  .replace(/^-+|-+$/g, '')
              )
              .filter(Boolean)
              .slice(0, 12)
          : [],
      });
    } catch {
      const pName = String(req.body?.projectName || 'Aether Tactile Studio');
      const sCount = Number(req.body?.screensCount) || 7;
      const hz = Math.min(158, Number(req.body?.baseFreqHz) || 82);
      res.json({
        shortAboutDescription: `${pName} — studio projektowania frontendu dotykowego (${sCount} ekranów), podświetleń optycznych, niskich kliknięć ${hz} Hz (<160 Hz) oraz lokalnego hosta prezentacji.`.slice(
          0,
          345
        ),
        readmeSubtitle: `Zintegrowany warsztat projektowania frontendów React 19 + TypeScript + Tailwind CSS z żywym hostem prezentacji Localhost, podświetleniami optycznymi i syntezą akustyczną <160 Hz.`,
        topics: [
          'react',
          'typescript',
          'tailwindcss',
          'threejs',
          'web-audio-api',
          'haptics',
          'ui-design-studio',
          'localhost-preview',
        ],
      });
    }
  });

  // ============================================================================
  // WebSocket Live Voice Bridge (/ws/live -> gemini-3.8-live)
  // ============================================================================
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    if (pathname === '/ws/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', async (clientWs: WebSocket) => {
    const ai = getGenAIClient();
    let sessionClosed = false;

    try {
      const sessionPromise = ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Zephyr' },
            },
          },
          systemInstruction:
            'Jesteś głosowym projektantem dźwięku, haptyki i interfejsów Aether Tactile Studio. Odpowiadaj naturalnie, zwięźle i pomocnie po polsku (lub w języku rozmówcy).',
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== WebSocket.OPEN) return;
            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  type: 'inputTranscript',
                  text: content.inputTranscription.text,
                })
              );
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  type: 'outputTranscript',
                  text: content.outputTranscription.text,
                })
              );
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(
                  JSON.stringify({
                    type: 'audio',
                    audio: part.inlineData.data,
                  })
                );
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ type: 'interrupted' }));
            }
          },
          onerror: (err: unknown) => {
            if (clientWs.readyState === WebSocket.OPEN) {
              const formatted = formatGeminiError(err);
              clientWs.send(JSON.stringify({ type: 'error', message: formatted.message }));
            }
          },
        },
      });

      const session = await sessionPromise;
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'ready' }));
      }

      clientWs.on('message', (raw) => {
        if (sessionClosed) return;
        try {
          const parsed = JSON.parse(raw.toString());
          if (parsed.audio) {
            sessionPromise
              .then((s) => {
                s.sendRealtimeInput({
                  audio: {
                    data: parsed.audio,
                    mimeType: 'audio/pcm;rate=16000',
                  },
                });
              })
              .catch(() => {});
          }
        } catch {
          // Ignore malformed frame
        }
      });

      clientWs.on('close', () => {
        sessionClosed = true;
        try {
          session.close();
        } catch {
          // Ignore
        }
      });
    } catch (err) {
      if (clientWs.readyState === WebSocket.OPEN) {
        const formatted = formatGeminiError(err);
        clientWs.send(JSON.stringify({ type: 'error', message: formatted.message }));
        clientWs.close();
      }
    }
  });

  // ============================================================================
  // Local Network Info Endpoint (for Mobile QR Haptics Testing)
  // ============================================================================
  app.get('/api/network-info', (req, res) => {
    const interfaces = os.networkInterfaces();
    const candidates: Array<{ name: string; address: string }> = [];
    for (const [name, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;
      for (const info of addrs) {
        if (info.family === 'IPv4' && !info.internal) {
          candidates.push({ name, address: info.address });
        }
      }
    }
    // Prefer Wi-Fi / primary interfaces (en0, en1, wlan0)
    candidates.sort((a, b) => {
      const score = (n: string) =>
        n === 'en0' ? 0 : n === 'en1' ? 1 : n.startsWith('wlan') || n.startsWith('wi') ? 2 : 3;
      return score(a.name) - score(b.name);
    });

    const port = Number(process.env.PORT) || 3000;
    const protocol = req.protocol === 'https' ? 'https' : 'http';
    const lanIps = candidates.map((c) => c.address);
    const lanIp = lanIps[0] || 'localhost';

    res.json({
      port,
      protocol,
      lanIp,
      lanIps,
      hostname: os.hostname(),
      lanUrl: `${protocol}://${lanIp}:${port}`,
      localUrl: `${protocol}://localhost:${port}`,
    });
  });

  // ============================================================================
  // Vite Middleware (Dev) or Static Assets (Production)
  // ============================================================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server },
        forwardConsole: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    // Prevent stale Service Worker / cached HTML from serving outdated Vite dev pages
    app.get('/sw.js', (_req, res) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.send(`self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.map(k=>caches.delete(k)))).then(()=>self.registration.unregister()));});`);
    });
    app.use(
      express.static(distPath, {
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Aether Tactile Studio listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
