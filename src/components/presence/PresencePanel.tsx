"use client";
import { listSurfaces, listVoices } from "@/lib/presence";
import type { SurfaceDefinition, VoiceDefinition } from "@/lib/presence";
import { SignatureCombos } from "./SignatureCombos";
import { MiniPreview } from "./MiniPreview";
import { ConnectorSection } from "@/components/sources/SourcesPanel";
import type { PageConfig } from "@/lib/page-config/schema";
import { LAYOUT_TEMPLATES, type LayoutTemplateId } from "@/lib/layout/contracts";
import { getLayoutTemplate } from "@/lib/layout/registry";
import { AvatarSection } from "@/components/settings/AvatarSection";

type PresencePanelProps = {
  open: boolean;
  onClose: () => void;
  config: PageConfig | null;
  surface: string;
  voice: string;
  light: string;
  layoutTemplate: LayoutTemplateId;
  onSurfaceChange: (s: string) => void;
  onVoiceChange: (v: string) => void;
  onLightChange: (l: "day" | "night") => void;
  onComboSelect: (s: string, v: string, l: string) => void;
  onLayoutChange: (l: LayoutTemplateId) => void;
  onAvatarChange: () => void;
  language: string;
  inlineFullscreen?: boolean;
  showMiniPreview?: boolean;
  miniPreviewConfig?: PageConfig | null;
};

export function PresencePanel({
  open, onClose, config,
  surface, voice, light, layoutTemplate,
  onSurfaceChange, onVoiceChange, onLightChange, onComboSelect, onLayoutChange,
  onAvatarChange, language,
  inlineFullscreen = false,
  showMiniPreview = false,
  miniPreviewConfig,
}: PresencePanelProps) {
  if (!open) return null;

  const surfaces = listSurfaces();
  const voices = listVoices();

  // Build a fallback config with all required PageConfig fields.
  const fallbackConfig: PageConfig = {
    version: 1,
    username: "preview",
    surface,
    voice,
    light,
    layoutTemplate,
    style: { primaryColor: "#c9a96e", layout: "centered" },
    sections: [],
  };
  const previewConfig: PageConfig = config
    ? { ...config, surface, voice, light }
    : fallbackConfig;

  const effectiveMiniConfig = miniPreviewConfig ?? previewConfig;

  if (inlineFullscreen) {
    return (
      <div style={{ width: "100%", padding: "24px 20px" }}>
        {showMiniPreview && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "#c9a96e" }}>
              Presence
            </h2>
            <button type="button" aria-label="Close presence panel" onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 18 }}>×</button>
          </div>
        )}
        {showMiniPreview && (
          <div style={{ marginBottom: 24 }}>
            <MiniPreview config={effectiveMiniConfig} height={180} />
          </div>
        )}
        <PresencePanelControls
          surfaces={surfaces} voices={voices}
          surface={surface} voice={voice} light={light}
          layoutTemplate={layoutTemplate}
          onSurfaceChange={onSurfaceChange} onVoiceChange={onVoiceChange} onLightChange={onLightChange}
          onComboSelect={onComboSelect}
          onLayoutChange={onLayoutChange} onAvatarChange={onAvatarChange}
          onClose={onClose}
          showHeader={!showMiniPreview}
        />
      </div>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.4)" }}
      />
      {/* Panel — desktop: 320px single column, controls only */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 70,
        width: 320, background: "#0e0e10",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        overflowY: "auto",
        padding: "24px 20px",
      }}>
        <PresencePanelControls
          surfaces={surfaces} voices={voices}
          surface={surface} voice={voice} light={light}
          layoutTemplate={layoutTemplate}
          onSurfaceChange={onSurfaceChange} onVoiceChange={onVoiceChange} onLightChange={onLightChange}
          onComboSelect={onComboSelect}
          onLayoutChange={onLayoutChange} onAvatarChange={onAvatarChange}
          onClose={onClose}
          showHeader
        />
      </div>
    </>
  );
}

type PresencePanelControlsProps = {
  surfaces: SurfaceDefinition[];
  voices: VoiceDefinition[];
  surface: string;
  voice: string;
  light: string;
  layoutTemplate: LayoutTemplateId;
  onSurfaceChange: (s: string) => void;
  onVoiceChange: (v: string) => void;
  onLightChange: (l: "day" | "night") => void;
  onComboSelect: (s: string, v: string, l: string) => void;
  onLayoutChange: (l: LayoutTemplateId) => void;
  onAvatarChange: () => void;
  onClose: () => void;
  showHeader?: boolean;
};

function PresencePanelControls({
  surfaces, voices, surface, voice, light, layoutTemplate,
  onSurfaceChange, onVoiceChange, onLightChange, onComboSelect, onLayoutChange, onAvatarChange, onClose,
  showHeader = true,
}: PresencePanelControlsProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {showHeader && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "#c9a96e" }}>
            Presence
          </h2>
          <button type="button" aria-label="Close presence panel" onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 18 }}>×</button>
        </div>
      )}

      {/* Signature Combinations — first */}
      <div>
        <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>Signature Combinations</div>
        <SignatureCombos activeSurface={surface} activeVoice={voice} activeLight={light}
          onSelect={onComboSelect} />
      </div>

      {/* Surface */}
      <div>
        <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>Surface</div>
        {surfaces.map(s => (
          <button key={s.id} type="button" aria-pressed={surface === s.id} onClick={() => onSurfaceChange(s.id)}
            style={{
              width: "100%", textAlign: "left", padding: "10px 14px", borderRadius: 8, marginBottom: 6,
              border: `1px solid ${surface === s.id ? "rgba(201,169,110,0.5)" : "rgba(255,255,255,0.08)"}`,
              background: surface === s.id ? "rgba(201,169,110,0.12)" : "rgba(255,255,255,0.03)",
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 500, color: surface === s.id ? "#c9a96e" : "#e8e4de" }}>{s.displayName}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{s.description.split(".")[0]}</div>
          </button>
        ))}
      </div>

      {/* Voice */}
      <div>
        <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>Voice</div>
        {voices.map(v => (
          <button key={v.id} type="button" aria-pressed={voice === v.id} onClick={() => onVoiceChange(v.id)}
            style={{
              width: "100%", textAlign: "left", padding: "10px 14px", borderRadius: 8, marginBottom: 6,
              border: `1px solid ${voice === v.id ? "rgba(201,169,110,0.5)" : "rgba(255,255,255,0.08)"}`,
              background: voice === v.id ? "rgba(201,169,110,0.12)" : "rgba(255,255,255,0.03)",
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 500, color: voice === v.id ? "#c9a96e" : "#e8e4de" }}>{v.displayName}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{v.headingFont} + {v.bodyFont}</div>
          </button>
        ))}
      </div>

      {/* Light */}
      <div>
        <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>Light</div>
        <div style={{ display: "flex", gap: 8 }}>
          {(["day", "night"] as const).map(l => (
            <button key={l} type="button" aria-pressed={light === l} onClick={() => onLightChange(l)}
              style={{
                flex: 1, padding: "8px", borderRadius: 8, textTransform: "capitalize",
                fontSize: 12, fontWeight: 500, cursor: "pointer",
                border: `1px solid ${light === l ? "rgba(201,169,110,0.5)" : "rgba(255,255,255,0.08)"}`,
                background: light === l ? "rgba(201,169,110,0.12)" : "rgba(255,255,255,0.03)",
                color: light === l ? "#c9a96e" : "#e8e4de",
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Layout */}
      <div>
        <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>Layout</div>
        {LAYOUT_TEMPLATES.map(t => {
          const tmpl = getLayoutTemplate(t);
          return (
            <button key={t} type="button" aria-pressed={layoutTemplate === t} onClick={() => onLayoutChange(t)}
              style={{
                width: "100%", textAlign: "left", padding: "10px 14px", borderRadius: 8, marginBottom: 6,
                border: `1px solid ${layoutTemplate === t ? "rgba(201,169,110,0.5)" : "rgba(255,255,255,0.08)"}`,
                background: layoutTemplate === t ? "rgba(201,169,110,0.12)" : "rgba(255,255,255,0.03)",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 500, color: layoutTemplate === t ? "#c9a96e" : "#e8e4de" }}>{tmpl?.name ?? t}</div>
            </button>
          );
        })}
      </div>

      {/* Avatar/Photo */}
      <div>
        <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>Photo</div>
        <AvatarSection onAvatarChange={onAvatarChange} />
      </div>

      {/* Sources */}
      <div>
        <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>Sources</div>
        <ConnectorSection />
      </div>
    </div>
  );
}
