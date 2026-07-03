import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";

interface MarkdownMessageProps {
  content: string;
  isAnimating?: boolean;
  mode?: "streaming" | "static";
  className?: string;
}

export function MarkdownMessage({
  content,
  isAnimating = false,
  mode,
  className,
}: MarkdownMessageProps) {
  return (
    <div className={className ? `markdown-message ${className}` : "markdown-message"}>
      <Streamdown
        mode={mode ?? (isAnimating ? undefined : "static")}
        plugins={{ code }}
        animated={isAnimating}
        isAnimating={isAnimating}
      >
        {content}
      </Streamdown>
    </div>
  );
}
