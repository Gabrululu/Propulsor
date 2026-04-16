import { useState, useRef, useCallback } from "react";

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

  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      if (!isVoiceEnabled()) return;

      stop();

      if (document.hidden) return;

      setIsSpeaking(true);

      try {
        let blob = audioCache.get(text);

        if (!blob) {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

          if (supabaseUrl && supabaseKey) {
            const response = await fetch(`${supabaseUrl}/functions/v1/tts`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: supabaseKey,
                Authorization: `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({ text }),
            });

            if (response.ok) {
              const candidate = await response.blob();
              if (candidate.size > 0) blob = candidate;
              audioCache.set(text, blob!);
            }
          }
        }

        if (blob) {
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
        } else {
          // Fallback: browser speech synthesis
          speakWithBrowser(text, () => setIsSpeaking(false));
        }
      } catch {
        // Last resort: browser synthesis
        speakWithBrowser(text, () => setIsSpeaking(false));
      }
    },
    [stop]
  );

  return { speak, stop, isSpeaking };
}
