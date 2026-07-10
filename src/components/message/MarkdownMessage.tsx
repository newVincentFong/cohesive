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
      >
        {content}
      </Streamdown>
    </div>
  );
}
