import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  QrCode,
  RefreshCw,
  Smartphone,
  Vibrate,
  Wifi,
  X,
} from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import { hapticAudio } from '../lib/hapticAudioEngine';

type MobileTargetMode =
  | 'github-pages'
  | 'rotary-3d'
  | 'sphere-3d'
  | 'mobile-pad'
  | 'haptics'
  | 'studio';

const GITHUB_PAGES_BASE_URL = 'https://teraj-stack.github.io/aether-tactile-studio';

interface NetworkInfoResponse {
  port: number;
  protocol: string;
  lanIp: string;
  lanIps: string[];
  hostname: string;
  lanUrl: string;
  localUrl: string;
}

interface MobileQrHapticsModalProps {
  open: boolean;
  onClose: () => void;
}

export const MobileQrHapticsModal: React.FC<MobileQrHapticsModalProps> = ({
  open,
  onClose,
}) => {
  const { palette, synth, haptic, patterns } = useStudio();
  const isDark = palette === 'emerald-clinic';

  const [networkInfo, setNetworkInfo] = useState<NetworkInfoResponse | null>(null);
  const [selectedIp, setSelectedIp] = useState<string>('');
  const [customBaseUrl, setCustomBaseUrl] = useState<string>('');
  const [targetMode, setTargetMode] = useState<MobileTargetMode>('github-pages');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [loadingNet, setLoadingNet] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const fetchNetworkInfo = async () => {
    setLoadingNet(true);
    try {
      const res = await fetch('/api/network-info');
      if (res.ok) {
        const data = (await res.json()) as NetworkInfoResponse;
        setNetworkInfo(data);
        setSelectedIp((prev) => prev || data.lanIp);
      }
    } catch {
      // Fallback to window.location when running standalone/offline
    } finally {
      setLoadingNet(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    fetchNetworkInfo();
  }, [open]);

  const resolvedBaseUrl = useMemo(() => {
    if (customBaseUrl.trim()) {
      return customBaseUrl.trim().replace(/\/+$/, '');
    }
    if (selectedIp && networkInfo) {
      return `${networkInfo.protocol}://${selectedIp}:${networkInfo.port}`;
    }
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return 'http://localhost:3007';
  }, [customBaseUrl, selectedIp, networkInfo]);

  const targetUrl = useMemo(() => {
    switch (targetMode) {
      case 'github-pages':
        return `${GITHUB_PAGES_BASE_URL}/`;
      case 'rotary-3d':
        return `${GITHUB_PAGES_BASE_URL}/rotary-3d.html`;
      case 'sphere-3d':
        return `${GITHUB_PAGES_BASE_URL}/sphere-3d.html`;
      case 'mobile-pad':
        return `${resolvedBaseUrl}/?mobileTest=1`;
      case 'haptics':
        return `${resolvedBaseUrl}/?tab=haptics`;
      case 'studio':
      default:
        return `${resolvedBaseUrl}/`;
    }
  }, [resolvedBaseUrl, targetMode]);

  useEffect(() => {
    if (!open || !targetUrl) return;
    let cancelled = false;
    QRCode.toDataURL(targetUrl, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [open, targetUrl]);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopied(true);
      hapticAudio.triggerMinimalistLowClick('crystal-glass-tap-9ms', 0.55);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard error
    }
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `aether-mobile-haptics-qr.png`;
    link.click();
    hapticAudio.triggerPress(synth, haptic, patterns, { pitchSemitones: 4 });
  };

  const modeOptions: Array<{
    id: MobileTargetMode;
    label: string;
    hint: string;
  }> = [
    {
      id: 'github-pages',
      label: 'Całe Studio + 3D (HTTPS)',
      hint: 'Sterowniki 3D + BM Clinic + 14 dźwięków (działa z każdego tabletu)',
    },
    {
      id: 'rotary-3d',
      label: 'Tylko Model 3D: Pokrętło CNC 270°',
      hint: 'Ultralekki, dedykowany kod QR wyłącznie pod pokrętło 3D (4 presety)',
    },
    {
      id: 'sphere-3d',
      label: 'Tylko Model 3D: Sfera Haptyczna 3D',
      hint: 'Ultralekki, dedykowany kod QR wyłącznie pod sferę 3D i 5 materiałów',
    },
    {
      id: 'mobile-pad',
      label: 'Lokalny Pad Wi-Fi (LAN)',
      hint: 'Lokalny serwer na Macu (wymaga tej samej sieci Wi-Fi)',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Kod QR do testów haptyki na telefonie"
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-2xl rounded-3xl border shadow-2xl overflow-hidden ${
          isDark
            ? 'bg-[#081d18] border-emerald-400/25 text-emerald-50'
            : 'bg-white/95 border-slate-200/90 text-slate-900'
        }`}
      >
        {/* Header */}
        <div
          className={`px-6 py-4 flex items-center justify-between border-b ${
            isDark ? 'border-emerald-400/15 bg-emerald-950/50' : 'border-slate-200/80 bg-slate-50/80'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                isDark
                  ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30'
                  : 'bg-indigo-600/10 text-indigo-600 border border-indigo-200'
              }`}
            >
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">
                Testowanie Haptyki na Telefonie (Kod QR)
              </h2>
              <p
                className={`text-xs mt-0.5 ${
                  isDark ? 'text-emerald-200/70' : 'text-slate-500'
                }`}
              >
                Zeskanuj aparatem w tej samej sieci Wi-Fi, aby wyklikać przyciski i stuknięcia
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij okno QR"
            className={`p-2 rounded-xl transition-colors cursor-pointer ${
              isDark
                ? 'hover:bg-emerald-900/70 text-emerald-200'
                : 'hover:bg-slate-200/70 text-slate-600'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Left: Scannable QR Code */}
          <div className="md:col-span-5 flex flex-col items-center gap-3">
            <div className="p-4 rounded-3xl bg-white shadow-lg border border-slate-200/90 flex items-center justify-center w-full max-w-[260px] aspect-square">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`Kod QR dla ${targetUrl}`}
                  className="w-full h-full object-contain rounded-xl"
                />
              ) : (
                <div className="text-xs text-slate-400">Generowanie kodu QR...</div>
              )}
            </div>

            <div className="flex items-center gap-2 w-full max-w-[260px]">
              <button
                type="button"
                onClick={handleCopy}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  isDark
                    ? 'bg-emerald-400 text-emerald-950 hover:bg-emerald-300'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Skopiowano!' : 'Kopiuj link'}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadQr}
                title="Pobierz kod QR jako PNG"
                className={`py-2 px-3 rounded-xl text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer border ${
                  isDark
                    ? 'bg-emerald-950/60 border-emerald-400/25 text-emerald-100 hover:bg-emerald-900/70'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Download className="w-3.5 h-3.5" />
                <span>PNG</span>
              </button>
            </div>

            <a
              href={targetUrl}
              target="_blank"
              rel="noreferrer"
              className={`text-[11px] font-mono break-all text-center inline-flex items-center gap-1 underline ${
                isDark ? 'text-emerald-300' : 'text-indigo-600'
              }`}
            >
              <span>{targetUrl}</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>

          {/* Right: Target mode & Wi-Fi IP settings */}
          <div className="md:col-span-7 space-y-4">
            <div>
              <span
                className={`text-[11px] font-semibold uppercase tracking-wider ${
                  isDark ? 'text-emerald-300/80' : 'text-slate-500'
                }`}
              >
                1. Co ma się otworzyć na telefonie?
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                {modeOptions.map((opt) => {
                  const active = targetMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setTargetMode(opt.id);
                        hapticAudio.triggerMinimalistLowClick('satin-tick-4ms', 0.35);
                      }}
                      className={`p-3 rounded-2xl text-left border transition-all cursor-pointer ${
                        active
                          ? isDark
                            ? 'bg-emerald-400/15 border-emerald-400 text-emerald-50'
                            : 'bg-indigo-50 border-indigo-500 text-slate-900 shadow-sm'
                          : isDark
                            ? 'bg-emerald-950/40 border-emerald-400/15 text-emerald-100/80 hover:border-emerald-400/35'
                            : 'bg-slate-50/70 border-slate-200/80 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <div className="text-xs font-semibold flex items-center justify-between gap-1">
                        <span>{opt.label}</span>
                        {active && (
                          <span className="w-2 h-2 rounded-full bg-indigo-500 dark:bg-emerald-400" />
                        )}
                      </div>
                      <p
                        className={`text-[11px] mt-0.5 leading-snug ${
                          isDark ? 'text-emerald-200/70' : 'text-slate-500'
                        }`}
                      >
                        {opt.hint}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* LAN IP selector */}
            <div
              className={`p-3.5 rounded-2xl border space-y-2.5 ${
                isDark
                  ? 'bg-emerald-950/40 border-emerald-400/15'
                  : 'bg-slate-50/80 border-slate-200/80'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold inline-flex items-center gap-1.5">
                  <Wifi className="w-3.5 h-3.5 text-indigo-500 dark:text-emerald-400" />
                  <span>Adres sieciowy Wi-Fi (LAN)</span>
                </span>
                <button
                  type="button"
                  onClick={fetchNetworkInfo}
                  disabled={loadingNet}
                  className="text-[11px] inline-flex items-center gap-1 opacity-75 hover:opacity-100 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingNet ? 'animate-spin' : ''}`} />
                  <span>Odśwież IP</span>
                </button>
              </div>

              {networkInfo && networkInfo.lanIps.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {networkInfo.lanIps.map((ip) => (
                    <button
                      key={ip}
                      type="button"
                      onClick={() => {
                        setSelectedIp(ip);
                        setCustomBaseUrl('');
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono cursor-pointer border ${
                        !customBaseUrl && selectedIp === ip
                          ? isDark
                            ? 'bg-emerald-400 text-emerald-950 border-emerald-400 font-semibold'
                            : 'bg-indigo-600 text-white border-indigo-600 font-semibold'
                          : isDark
                            ? 'bg-emerald-950/70 border-emerald-400/20 text-emerald-200'
                            : 'bg-white border-slate-200 text-slate-700'
                      }`}
                    >
                      {ip}:{networkInfo.port}
                    </button>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-[11px] opacity-70 mb-1">
                  Opcjonalny własny adres (np. tunel HTTPS / inny host):
                </label>
                <input
                  type="text"
                  value={customBaseUrl}
                  onChange={(e) => setCustomBaseUrl(e.target.value)}
                  placeholder={
                    networkInfo
                      ? `${networkInfo.protocol}://${networkInfo.lanIp}:${networkInfo.port}`
                      : 'http://10.105.153.235:3007'
                  }
                  className={`w-full px-3 py-1.5 rounded-xl text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    isDark
                      ? 'bg-emerald-950/80 border-emerald-400/25 text-emerald-50 placeholder:text-emerald-200/35'
                      : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'
                  }`}
                />
              </div>
            </div>

            {/* Mobile Haptics Note */}
            <div
              className={`p-3.5 rounded-2xl border text-[11px] leading-relaxed flex items-start gap-2.5 ${
                isDark
                  ? 'bg-emerald-900/25 border-emerald-400/20 text-emerald-100/90'
                  : 'bg-indigo-50/70 border-indigo-200/70 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-1 mt-0.5 text-indigo-600 dark:text-emerald-300 shrink-0">
                <Smartphone className="w-4 h-4" />
                <Vibrate className="w-4 h-4" />
              </div>
              <div>
                <strong>Wskazówka dla telefonu:</strong> na <strong>Androidzie</strong> działają
                zarówno fizyczne wibracje (<code>navigator.vibrate</code>), jak i dźwięk{' '}
                <code>&lt;160 Hz</code>. Na <strong>iPhonie (iOS Safari)</strong> wyłącz tryb
                wyciszenia (dzwonek ON) — w Padzie Testowym masz dźwięki dotykowe WebAudio oraz
                natywny przełącznik haptyczny iOS.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
