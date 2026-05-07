import { useEffect, useState } from "react";

export function useVoiceSettings(params: {
  onStatusChange?: (text: string) => void;
}) {
  const { onStatusChange } = params;

  const [turnFallbackEnabled, setTurnFallbackEnabled] = useState(true);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await fetch("/api/voice/settings", {
          cache: "no-store",
        });

        const data = await res.json();

        if (!alive) return;

        if (data?.settings) {
          setTurnFallbackEnabled(
            Boolean(data.settings.turn_fallback_enabled ?? true)
          );
        }
      } catch {
        // fallbackはtrueのまま
        onStatusChange?.("設定取得失敗（fallback有効）");
      }
    }

    void load();

    return () => {
      alive = false;
    };
  }, [onStatusChange]);

  return {
    turnFallbackEnabled,
  };
}