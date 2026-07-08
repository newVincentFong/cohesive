import type { KeyboardEvent } from "react";

export function handleComposerKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  onSend: () => void,
) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    onSend();
  }
}
