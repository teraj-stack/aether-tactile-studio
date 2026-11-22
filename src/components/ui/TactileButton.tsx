import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useStudio } from '../../context/StudioContext';
import { hapticAudio } from '../../lib/hapticAudioEngine';
import {
  BUTTON_MOTION_PRESETS,
  ButtonGroupId,
  ButtonIlluminationPresetId,
  ButtonMotionPresetId,
  EngravingSymbol,
  HapticMaterialType,
} from '../../types/studio';
import { EngravingGlyph } from './EngravingGlyph';

interface TactileButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  groupId?: ButtonGroupId;
  symbol?: EngravingSymbol;
  materialOverride?: HapticMaterialType;
  motionPresetOverride?: ButtonMotionPresetId;
  illuminationPresetOverride?: ButtonIlluminationPresetId;
  glowColorOverride?: string;
  pitchSemitones?: number;
  variant?: 'glass-card' | 'crystal-pill' | 'neumorphic-icon' | 'primary-cta';
  selected?: boolean;
  className?: string;
  subtitle?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

export const TactileButton: React.FC<TactileButtonProps> = ({
  children,
  onClick,
  groupId = 'group-primary',
  symbol,
  materialOverride,
  motionPresetOverride,
  illuminationPresetOverride,
  glowColorOverride,
  pitchSemitones,
  variant = 'glass-card',
  selected = false,
  className = '',
  subtitle,
  ariaLabel,
  disabled = false,
}) => {
  const {
    synth,
    haptic,
    engraving,
    animation,
    patterns,
    palette,
    depth,
    selectedGroups,
    groupConfigs,
    setActiveHoldLevel,
    pulseInteraction,
  } = useStudio();

  const [isPressed, setIsPressed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [holdIntensity, setHoldIntensity] = useState(0);
  const [pointerCoords, setPointerCoords] = useState({
    spotX: 50,
    spotY: 50,
    normX: 0,
    normY: 0,
  });

  const btnRef = useRef<HTMLButtonElement | null>(null);
  const lastHoverTickRef = useRef<number>(0);

  const isGroupUnified = selectedGroups.includes(groupId);
  const groupCfg = groupConfigs[groupId];

  const effectiveMaterial: HapticMaterialType =
    materialOverride ?? (isGroupUnified ? haptic.material : groupCfg.material);

  const effectiveSymbol: EngravingSymbol =
    symbol ?? (isGroupUnified ? engraving.symbol : groupCfg.symbol);

  const effectiveGlowColor =
    glowColorOverride ?? (isGroupUnified ? engraving.glowColor : groupCfg.glowColor);

  const effectivePitch =
    pitchSemitones ?? (isGroupUnified ? 0 : groupCfg.pitchOffsetSemitones);

  const effectiveMotionId: ButtonMotionPresetId =
    motionPresetOverride ?? animation.motionPreset ?? 'magnetic-levitation';

  const effectiveIlluminationId: ButtonIlluminationPresetId =
    illuminationPresetOverride ?? animation.illuminationPreset ?? 'cursor-spotlight';

  const overrideMotionSpec = motionPresetOverride
    ? BUTTON_MOTION_PRESETS.find((m) => m.id === motionPresetOverride)
    : undefined;

  const activeStiffness = overrideMotionSpec?.stiffness ?? animation.stiffness;
  const activeDamping = overrideMotionSpec?.damping ?? animation.damping;
  const activeMass = overrideMotionSpec?.mass ?? animation.mass;
  const activePressScale = overrideMotionSpec?.pressScale ?? animation.pressScale;

  const updateLocalCoords = (e: React.PointerEvent<HTMLButtonElement>) => {
    const el = btnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = Math.max(0, Math.min(100, ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100));
    const py = Math.max(0, Math.min(100, ((e.clientY - rect.top) / Math.max(1, rect.height)) * 100));
    setPointerCoords({
      spotX: px,
      spotY: py,
      normX: (px - 50) / 50,
      normY: (py - 50) / 50,
    });
  };

  const handlePointerEnter = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    setIsHovered(true);
    updateLocalCoords(e);
    const now = performance.now();
    if (haptic.enabled && now - lastHoverTickRef.current > 95) {
      lastHoverTickRef.current = now;
      const hoverGain = Math.max(0.08, Math.min(0.22, (haptic.intensity / 100) * 0.22));
      hapticAudio.triggerMinimalistLowClick('satin-tick-4ms', hoverGain);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    updateLocalCoords(e);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    updateLocalCoords(e);
    setIsPressed(true);

    hapticAudio.triggerPress(synth, haptic, patterns, {
      material: effectiveMaterial,
      pitchSemitones: effectivePitch,
    });
    pulseInteraction(1);

    hapticAudio.startHoldRamp(
      synth,
      haptic,
      (lvl) => {
        setHoldIntensity(lvl);
        setActiveHoldLevel(lvl);
        pulseInteraction(0.35);
      },
      effectiveMaterial
    );
  };

  const endPress = () => {
    setIsHovered(false);
    setPointerCoords((prev) => ({ ...prev, normX: 0, normY: 0 }));
    if (!isPressed) return;
    setIsPressed(false);
    setHoldIntensity(0);
    setActiveHoldLevel(0);
    hapticAudio.stopHoldRamp();
    hapticAudio.triggerReleaseReverseClutch(haptic, effectiveMaterial);
  };

  const handlePointerUpOnly = () => {
    if (!isPressed) return;
    setIsPressed(false);
    setHoldIntensity(0);
    setActiveHoldLevel(0);
    hapticAudio.stopHoldRamp();
    hapticAudio.triggerReleaseReverseClutch(haptic, effectiveMaterial);
  };

  const isDark = palette === 'emerald-clinic';

  const getMaterialClasses = (): string => {
    if (variant === 'primary-cta') {
      return isDark
        ? 'bg-gradient-to-r from-[#67B596] to-[#3B7D65] text-white border border-emerald-200/40'
        : 'bg-gradient-to-r from-[#2E274E] via-[#3A3163] to-[#282246] text-white border border-indigo-200/30';
    }

    if (variant === 'crystal-pill') {
      return isDark
        ? 'bg-emerald-900/45 text-emerald-50 border border-emerald-300/35'
        : 'bg-white/65 text-slate-900 border border-white/90';
    }

    switch (effectiveMaterial) {
      case 'shiny-glass':
        return isDark
          ? 'bg-emerald-900/40 text-emerald-50 border border-emerald-200/35'
          : 'bg-white/82 text-slate-900 border border-white';
      case 'matte-metal':
        return isDark
          ? 'bg-gradient-to-b from-[#17332D] to-[#0D211D] text-emerald-50 border border-emerald-400/25'
          : 'bg-gradient-to-b from-[#F4F6FB] to-[#DCE2F0] text-slate-900 border border-slate-300/90';
      case 'abs-plastic':
        return isDark
          ? 'bg-[#122C26] text-emerald-50 border border-emerald-400/30'
          : 'bg-[#F8FAFC] text-slate-900 border border-slate-300';
      case 'suede':
        return isDark
          ? 'bg-[#102621]/95 text-emerald-100 border border-emerald-700/40'
          : 'bg-[#E9ECF8]/95 text-slate-800 border border-indigo-200/60';
      case 'frosted-glass':
      default:
        return isDark
          ? 'bg-emerald-950/55 text-emerald-50 border border-emerald-400/20'
          : 'bg-white/62 text-slate-900 border border-white/80';
    }
  };

  const dynamicRadius =
    variant === 'crystal-pill' || variant === 'neumorphic-icon'
      ? 9999
      : Math.max(14, depth.borderRadius - 4);

  const shadowColor = isDark
    ? 'rgba(0, 0, 0, 0.48)'
    : palette === 'finance-ice'
      ? 'rgba(79, 105, 198, 0.16)'
      : 'rgba(88, 76, 148, 0.15)';

  const specularAlpha =
    (depth.specularRim / 100) * (effectiveMaterial === 'suede' ? 0.32 : 0.92);
  const glowFactor = engraving.glowEnabled ? Math.max(0.35, engraving.glowIntensity / 100) : 0.32;

  const boxShadowStyle = isPressed
    ? `inset 0 2px 9px ${shadowColor}, inset 0 1px 0 rgba(255,255,255,${(specularAlpha * 0.65).toFixed(2)}), 0 0 ${Math.round(
        animation.glowSpread * (0.75 + holdIntensity * 0.9)
      )}px ${effectiveGlowColor}88, 0 0 12px ${effectiveGlowColor}55`
    : selected || isHovered || effectiveIlluminationId === 'subsurface-caustic'
      ? `0 ${Math.round(depth.elevation * 0.62)}px ${Math.round(
          depth.blur * 0.78
        )}px ${shadowColor}, 0 0 ${Math.round(
          glowFactor * (effectiveIlluminationId === 'subsurface-caustic' ? 38 : isHovered ? 28 : 22)
        )}px ${effectiveGlowColor}${isHovered ? '58' : '44'}, inset 0 1px 1.5px rgba(255,255,255,${specularAlpha.toFixed(2)}), inset 0 -1px 6px ${effectiveGlowColor}26`
      : `0 ${Math.round(depth.elevation * 0.52)}px ${Math.round(
          depth.blur * 0.68
        )}px ${shadowColor}, inset 0 1px 1.5px rgba(255,255,255,${specularAlpha.toFixed(2)})`;

  // Compute compositor-only motion targets per preset
  const holdTremorX =
    holdIntensity > 0.25 ? Math.sin(performance.now() * 0.06) * holdIntensity * 1.35 : 0;

  let targetX = holdTremorX;
  let targetY = 0;
  let targetRotateX = 0;
  let targetRotateY = 0;
  let targetScale = isPressed ? activePressScale - holdIntensity * 0.014 : 1;

  if (!disabled) {
    switch (effectiveMotionId) {
      case 'magnetic-levitation':
        if (isHovered && !isPressed) {
          targetX += pointerCoords.normX * 3.8;
          targetY = pointerCoords.normY * 2.4 - 2;
          targetScale = 1.012;
        } else if (isPressed) {
          targetY = 1;
        }
        break;
      case 'liquid-glass-spring':
        if (isHovered && !isPressed) {
          targetY = -2;
          targetScale = 1.014;
        }
        break;
      case 'cnc-micro-detent':
        if (isPressed) {
          targetY = 1.6;
        } else if (isHovered) {
          targetY = -0.8;
          targetScale = 1.005;
        }
        break;
      case 'velvet-cushion':
        if (isPressed) {
          targetY = 2.2;
        } else if (isHovered) {
          targetY = -1.2;
          targetScale = 1.008;
        }
        break;
      case 'rocker-tilt':
        if (isPressed) {
          targetRotateY = pointerCoords.normX * 8.5;
          targetRotateX = -pointerCoords.normY * 7.5;
        } else if (isHovered) {
          targetRotateY = pointerCoords.normX * 4.5;
          targetRotateX = -pointerCoords.normY * 4;
          targetY = -1.5;
        }
        break;
      case 'harmonic-hover-lift':
        if (isPressed) {
          targetY = 1.2;
        } else if (isHovered) {
          targetY = -3.5;
          targetScale = 1.018;
        }
        break;
    }
  }

  return (
    <motion.button
      ref={btnRef}
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={onClick}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUpOnly}
      onPointerLeave={endPress}
      onPointerCancel={endPress}
      animate={{
        scale: targetScale,
        x: targetX,
        y: targetY,
        rotateX: targetRotateX,
        rotateY: targetRotateY,
      }}
      transition={{
        type: 'spring',
        stiffness: activeStiffness,
        damping: activeDamping,
        mass: activeMass,
      }}
      style={{
        borderRadius: `${dynamicRadius}px`,
        transformPerspective: effectiveMotionId === 'rocker-tilt' ? 640 : undefined,
        backdropFilter:
          effectiveMaterial === 'frosted-glass' || effectiveMaterial === 'shiny-glass'
            ? `blur(${depth.glassBlur}px)`
            : undefined,
        boxShadow: boxShadowStyle,
      }}
      className={`relative overflow-hidden select-none cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 ${getMaterialClasses()} ${
        selected
          ? isDark
            ? 'ring-1.5 ring-emerald-300/85'
            : 'ring-1.5 ring-indigo-500/75'
          : ''
      } ${className}`}
    >
      {/* Illumination Layer 1: Dual-Zone Cursor Radial Spotlight + Tracking Top Fresnel Rim */}
      {effectiveIlluminationId === 'cursor-spotlight' && (
        <>
          <span
            aria-hidden="true"
            style={{
              opacity: isPressed ? 1 : isHovered ? 0.92 : 0.34,
              background: `radial-gradient(96px circle at ${pointerCoords.spotX}% ${pointerCoords.spotY}%, rgba(255,255,255,${isDark ? '0.28' : '0.52'}) 0%, ${effectiveGlowColor}68 38%, transparent 74%), radial-gradient(220px circle at ${pointerCoords.spotX}% ${pointerCoords.spotY}%, ${effectiveGlowColor}36 0%, transparent 78%)`,
            }}
            className="pointer-events-none absolute inset-0 transition-opacity duration-150"
          />
          <span
            aria-hidden="true"
            style={{
              opacity: isPressed || isHovered ? 0.95 : 0.45,
              background: `radial-gradient(120px 3px at ${pointerCoords.spotX}% 0%, #ffffff 0%, ${effectiveGlowColor} 55%, transparent 100%)`,
            }}
            className="pointer-events-none absolute top-0 inset-x-2 h-[2px] transition-opacity duration-150"
          />
        </>
      )}

      {/* Illumination Layer 2: Crisp 2px Conic Fiber-Optic Border Waveguide + Soft Inner Halo */}
      {effectiveIlluminationId === 'conic-border-beam' && (
        <>
          <span
            aria-hidden="true"
            style={{
              padding: '2px',
              borderRadius: `${dynamicRadius}px`,
              WebkitMask:
                'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
              WebkitMaskComposite: 'xor',
              maskComposite: 'exclude',
              opacity: isPressed ? 1 : isHovered ? 0.98 : 0.78,
            }}
            className="pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-150"
          >
            <span
              style={{
                background: `conic-gradient(from 0deg, transparent 56%, ${effectiveGlowColor}55 76%, ${effectiveGlowColor} 91%, #ffffff 98%, transparent 100%)`,
              }}
              className="absolute left-1/2 top-1/2 w-[250%] aspect-square animate-border-beam"
            />
          </span>
          <span
            aria-hidden="true"
            style={{
              opacity: isPressed ? 0.55 : isHovered ? 0.38 : 0.18,
              background: `radial-gradient(80% 90% at ${pointerCoords.spotX}% ${pointerCoords.spotY}%, ${effectiveGlowColor}48 0%, transparent 72%)`,
            }}
            className="pointer-events-none absolute inset-0 transition-opacity duration-150"
          />
        </>
      )}

      {/* Illumination Layer 3: Chromatic Prism Specular Sweep */}
      {effectiveIlluminationId === 'prism-refraction-sweep' && (
        <>
          <span
            aria-hidden="true"
            style={{
              opacity: isPressed || isHovered ? 0.98 : 0.58,
              background: `linear-gradient(108deg, transparent 18%, ${effectiveGlowColor}42 39%, rgba(255,255,255,0.86) 50%, #38bdf844 58%, transparent 80%)`,
            }}
            className="pointer-events-none absolute inset-y-0 -left-1/4 w-2/3 animate-prism-sweep"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-4 right-4 h-[1.5px] aether-fresnel-top opacity-75"
          />
        </>
      )}

      {/* Illumination Layer 4: Subsurface Volumetric Caustic Cloud */}
      {effectiveIlluminationId === 'subsurface-caustic' && (
        <span
          aria-hidden="true"
          style={{
            opacity: Math.min(
              1,
              0.52 + (isHovered ? 0.24 : 0) + (isPressed ? 0.28 : 0) + holdIntensity * 0.35
            ),
            background: `radial-gradient(92% 105% at ${pointerCoords.spotX}% 108%, ${effectiveGlowColor}82 0%, ${effectiveGlowColor}34 48%, transparent 82%), radial-gradient(60% 45% at 50% 0%, rgba(255,255,255,0.38) 0%, transparent 75%)`,
          }}
          className="pointer-events-none absolute inset-0 transition-opacity duration-150"
        />
      )}

      {/* Illumination Layer 5: Dual Horizon Fresnel Specular Rim */}
      {effectiveIlluminationId === 'horizon-dual-rim' && (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-3 right-3 h-[2px] bg-gradient-to-r from-transparent via-white to-transparent opacity-95"
          />
          <span
            aria-hidden="true"
            style={{
              opacity: isPressed ? 1 : isHovered ? 0.94 : 0.68,
              background: `linear-gradient(90deg, transparent 6%, ${effectiveGlowColor} 50%, transparent 94%)`,
              boxShadow: `0 -2px 12px ${effectiveGlowColor}`,
            }}
            className="pointer-events-none absolute bottom-0 left-2 right-2 h-[2.5px] transition-opacity duration-150"
          />
        </>
      )}

      {/* Illumination Layer 6: Breathing Laser-Etched Halo */}
      {effectiveIlluminationId === 'breathing-etched-halo' && (
        <span
          aria-hidden="true"
          style={{
            background: `radial-gradient(72% 86% at 50% 50%, ${effectiveGlowColor}5c 0%, ${effectiveGlowColor}1e 52%, transparent 78%)`,
          }}
          className="pointer-events-none absolute inset-0 animate-etch-breathe"
        />
      )}

      {/* Group Unification Indicator Bar (crisp top optical waveguide) */}
      {isGroupUnified &&
        variant !== 'neumorphic-icon' &&
        effectiveIlluminationId !== 'horizon-dual-rim' && (
          <span
            aria-hidden="true"
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${effectiveGlowColor} 50%, transparent 100%)`,
            }}
            className="pointer-events-none absolute top-0 left-5 right-5 h-[1.5px] opacity-75"
          />
        )}

      {/* Enhanced Key-Edge Luminous Highlight & Press Wave */}
      <span
        aria-hidden="true"
        style={{
          opacity: isPressed ? 1 : isHovered ? 0.85 : 0,
          background: `radial-gradient(circle 130px at ${pointerCoords.spotX}% ${pointerCoords.spotY}%, ${effectiveGlowColor}${isPressed ? '70' : '38'} 0%, transparent 72%)`,
          boxShadow: isPressed
            ? `inset 0 0 0 1.5px ${effectiveGlowColor}, 0 0 22px ${effectiveGlowColor}55`
            : isHovered
              ? `inset 0 0 0 1px ${effectiveGlowColor}88`
              : 'none',
        }}
        className="pointer-events-none absolute inset-0 rounded-[inherit] transition-all duration-150"
      />

      <span className="relative z-10 flex items-center justify-between gap-3 w-full">
        <span className="flex items-center gap-3 min-w-0">
          {effectiveSymbol !== 'none' && variant !== 'neumorphic-icon' && (
            <EngravingGlyph
              symbol={effectiveSymbol}
              glowEnabled={engraving.glowEnabled}
              glowColor={effectiveGlowColor}
              glowIntensity={
                isPressed
                  ? Math.min(100, engraving.glowIntensity + 25)
                  : engraving.glowIntensity
              }
              etchDepth={engraving.etchDepth}
              className={
                variant === 'primary-cta'
                  ? 'text-white'
                  : isDark
                    ? 'text-emerald-200'
                    : 'text-indigo-900/85'
              }
            />
          )}
          <span className="flex flex-col items-start min-w-0 text-left">
            <span className="font-medium leading-tight truncate max-w-full">
              {children}
            </span>
            {subtitle && (
              <span
                className={`text-xs mt-0.5 truncate max-w-full ${
                  variant === 'primary-cta'
                    ? 'text-white/80'
                    : isDark
                      ? 'text-emerald-200/70'
                      : 'text-slate-500'
                }`}
              >
                {subtitle}
              </span>
            )}
          </span>
        </span>

        {selected && variant === 'glass-card' && (
          <span
            aria-label="Wybrano"
            className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] shrink-0 ${
              isDark
                ? 'bg-emerald-400 text-emerald-950'
                : 'bg-slate-900 text-white'
            }`}
          >
            ✓
          </span>
        )}
      </span>
    </motion.button>
  );
};
