import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL } from "@/lib/supabase/config";

const audioCache = new Map<string, Blob>();

// Browser speech synthesis fallback (no API key required)
function speakWithBrowser(text: string, onEnd: () => void): void {
  if (!window.speechSynthesis) { onEnd(); return; }

  window.speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "es-ES";
  utter.rate = 0.95;
  utter.pitch = 1;

  // Prefer a Spanish female voice if available
  const voices = window.speechSynthesis.getVoices();
  const spanishFemale = voices.find(
    (v) => v.lang.startsWith("es") && v.name.toLowerCase().includes("female")
  ) ?? voices.find((v) => v.lang.startsWith("es"));
  if (spanishFemale) utter.voice = spanishFemale;

  utter.onend = onEnd;
  utter.onerror = onEnd;
  window.speechSynthesis.speak(utter);
}

function isVoiceEnabled(): boolean {
  try {
    const stored = localStorage.getItem("propulsor_voice_enabled");
    // Default true if never set
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

export function useVoice() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }, []);

  // Stop any in-flight speech when the consuming component unmounts (e.g.
  // navigating away mid-narration) so audio doesn't keep playing in the background.
  useEffect(() => stop, [stop]);

  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      if (!isVoiceEnabled()) return;

      stop();

      if (document.hidden) return;

      setIsSpeaking(true);
      // Any failure of the cloud voice (no session, tts function error, empty
      // audio, network error) falls back to the browser's built-in voice
      // rather than going silent — this is an accessibility feature, so it
      // should always say something if it can.
      const fallback = () => speakWithBrowser(text, () => setIsSpeaking(false));

      try {
        let blob = audioCache.get(text);

        if (!blob) {
          // Use the current user's session JWT — the anon key alone doesn't
          // identify a specific user for the tts function to authorize against.
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) return fallback();

          const response = await fetch(`${SUPABASE_URL}/functions/v1/tts`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ text }),
          });

          if (!response.ok) return fallback();

          blob = await response.blob();
          if (blob.size === 0) return fallback();

          audioCache.set(text, blob);
        }

        // ElevenLabs audio
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
          urlRef.current = null;
          audioRef.current = null;
        };
        audio.onerror = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
          urlRef.current = null;
          audioRef.current = null;
        };

        await audio.play();
      } catch {
        fallback();
      }
    },
    [stop]
  );

  return { speak, stop, isSpeaking };
}
