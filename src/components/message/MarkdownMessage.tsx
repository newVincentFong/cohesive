import { Streamdown } from "streamdown";
import { createCodePlugin } from "@streamdown/code";

const codePlugin = createCodePlugin({
  themes: ["github-light", "github-dark"],
});

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
        plugins={{ code: codePlugin }}
        shikiTheme={["github-light", "github-dark"]}
        animated={isAnimating}
        isAnimating={isAnimating}
        className="space-y-2"
        lineNumbers={false}
        controls={{
          code: { copy: true, download: false },
          table: { copy: true, download: false, fullscreen: false },
          mermaid: { copy: true, download: false, fullscreen: false },
        }}
      >
        {content}
      </Streamdown>
    </div>
  );
}
