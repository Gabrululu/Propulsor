import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { SUPABASE_URL } from "@/lib/supabase/config";

const audioCache = new Map<string, Blob>();

// Browser speech synthesis fallback (no API key required)
function speakWithBrowser(
  text: string,
  language: string,
  onEnd: () => void,
): void {
  if (!window.speechSynthesis) {
    onEnd();
    return;
  }

  window.speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  const locale = language === "en" ? "en-US" : "es-PE";
  const voices = window.speechSynthesis.getVoices();
  const voice =
    voices.find((v) => v.lang === locale) ??
    voices.find((v) => v.lang === (language === "en" ? "en-GB" : "es-MX")) ??
    voices.find((v) => v.lang.startsWith(language));
  utter.lang = voice?.lang ?? locale;
  utter.rate = 0.95;
  if (voice) utter.voice = voice;

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
  const { language } = useLanguage();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const generationRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    generationRef.current++;
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
      const generation = generationRef.current;
      const active = () => generationRef.current === generation;

      if (document.hidden) return;

      setIsSpeaking(true);
      // Any failure of the cloud voice (no session, tts function error, empty
      // audio, network error) falls back to the browser's built-in voice
      // rather than going silent — this is an accessibility feature, so it
      // should always say something if it can.
      const fallback = () => {
        if (active())
          speakWithBrowser(text, language, () => {
            if (active()) setIsSpeaking(false);
          });
      };

      try {
        let blob = audioCache.get(text);

        if (!blob) {
          // Use the current user's session JWT — the anon key alone doesn't
          // identify a specific user for the tts function to authorize against.
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (!active()) return;
          if (!session?.access_token) return fallback();

          const response = await fetch(`${SUPABASE_URL}/functions/v1/tts`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ text }),
          });

          if (!active()) return;
          if (!response.ok) return fallback();

          blob = await response.blob();
          if (!active()) return;
          if (blob.size === 0) return fallback();

          audioCache.set(text, blob);
        }

        // ElevenLabs audio
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => {
          if (!active()) return;
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
          urlRef.current = null;
          audioRef.current = null;
        };
        audio.onerror = () => {
          if (!active()) return;
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
    [stop, language],
  );

  return { speak, stop, isSpeaking };
}
