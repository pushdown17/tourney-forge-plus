import { useEffect, useRef } from "react";

/**
 * Fires `onVisible` once every time the document transitions from hidden → visible.
 * This handles mobile browsers waking from sleep and tabs becoming active again.
 */
export const usePageVisibility = (onVisible: () => void) => {
  // Keep a stable ref so the listener never captures a stale callback
  const callbackRef = useRef(onVisible);
  useEffect(() => {
    callbackRef.current = onVisible;
  }, [onVisible]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        callbackRef.current();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);
};
