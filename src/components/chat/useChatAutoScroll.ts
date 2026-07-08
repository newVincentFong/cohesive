import { useCallback, useEffect, useRef, useState } from "react";

const PIN_THRESHOLD_PX = 40;

export function useChatAutoScroll(deps: unknown[]) {
  const threadRef = useRef<HTMLDivElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);

  const handleScroll = useCallback(() => {
    const element = threadRef.current;
    if (!element) {
      return;
    }

    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    setPinnedToBottom(distanceFromBottom < PIN_THRESHOLD_PX);
  }, []);

  useEffect(() => {
    const element = threadRef.current;
    if (!element || !pinnedToBottom) {
      return;
    }

    element.scrollTop = element.scrollHeight;
  }, [pinnedToBottom, ...deps]);

  return { threadRef, handleScroll };
}
