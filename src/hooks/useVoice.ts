import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL } from "@/lib/supabase/config";

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
          // Get the current user session for a real JWT
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) return; // Not authenticated, fail silently

          const response = await fetch(`${SUPABASE_URL}/functions/v1/tts`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
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
