import { useEffect, useState, useCallback } from 'react';

export function useElectron() {
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);
  const [isPinned, setIsPinned] = useState(true); // Default alwaysOnTop in main.ts is true

  const applyScreenshot = useCallback((dataUrl: string | null | undefined) => {
    if (!dataUrl) return;
    setScreenshotBase64(dataUrl);
    window.electronAPI?.ackScreenshotReceived?.();
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;
    const unsubscribe = window.electronAPI.onScreenshotCaptured((dataUrl) => {
      applyScreenshot(dataUrl);
    });
    // Catch screenshots sent before the listener was ready (race on first open)
    window.electronAPI.getPendingScreenshot?.().then((dataUrl) => {
      applyScreenshot(dataUrl);
    }).catch(() => {});
    return unsubscribe;
  }, [applyScreenshot]);

  const togglePin = () => {
    const newPinnedState = !isPinned;
    setIsPinned(newPinnedState);
    if (window.electronAPI) {
      window.electronAPI.toggleAlwaysOnTop(newPinnedState);
    }
  };

  const clearScreenshot = () => setScreenshotBase64(null);

  return {
    isElectron: !!window.electronAPI,
    screenshotBase64,
    isPinned,
    togglePin,
    clearScreenshot
  };
}
