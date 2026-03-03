import { SIGNATURE_COMBOS } from "@/lib/presence";

type SignatureCombosProps = {
  onSelect: (surface: string, voice: string, light: string) => void;
  activeSurface: string;
  activeVoice: string;
  activeLight: string;
};

export function SignatureCombos({ onSelect, activeSurface, activeVoice, activeLight }: SignatureCombosProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {SIGNATURE_COMBOS.map(combo => {
        const isActive = combo.surface === activeSurface && combo.voice === activeVoice && combo.light === activeLight;
        return (
          <button
            key={combo.name}
            onClick={() => onSelect(combo.surface, combo.voice, combo.light)}
            style={{
              textAlign: "left", padding: "10px 14px", borderRadius: 8,
              border: `1px solid ${isActive ? "rgba(201,169,110,0.5)" : "rgba(255,255,255,0.08)"}`,
              background: isActive ? "rgba(201,169,110,0.12)" : "rgba(255,255,255,0.03)",
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 500, color: isActive ? "#c9a96e" : "#e8e4de" }}>
              {combo.name}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
              {combo.for}
            </div>
          </button>
        );
      })}
    </div>
  );
}
