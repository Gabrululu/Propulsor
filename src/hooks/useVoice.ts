import { useState, useRef, useCallback } from "react";

const audioCache = new Map<string, Blob>();

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
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      // Stop any current playback
      stop();

      try {
        let blob = audioCache.get(text);

        if (!blob) {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

          if (!supabaseUrl || !supabaseKey) return;

          const response = await fetch(`${supabaseUrl}/functions/v1/tts`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({ text }),
          });

          if (!response.ok) return; // Fail silently

          blob = await response.blob();
          if (blob.size === 0) return;

          audioCache.set(text, blob);
        }

        const url = URL.createObjectURL(blob);
        urlRef.current = url;

        const audio = new Audio(url);
        audioRef.current = audio;

        setIsSpeaking(true);

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

        // Check if page is visible and respect silent mode
        if (document.hidden) return;

        await audio.play();
      } catch {
        // Fail silently
        setIsSpeaking(false);
      }
    },
    [stop]
  );

  return { speak, stop, isSpeaking };
}
