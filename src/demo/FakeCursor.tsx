import type { DemoCursorState } from "./types";

export function FakeCursor({ cursor }: { cursor: DemoCursorState }) {
  if (!cursor.visible) return null;

  return (
    <div
      className="demo-fake-cursor"
      style={{
        transform: `translate(${cursor.x}px, ${cursor.y}px) scale(${cursor.pressing ? 0.92 : 1})`,
      }}
      aria-hidden="true"
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <path
          d="M5 3.5L19.5 12.2L12.4 13.7L9.8 20.5L5 3.5Z"
          fill="#0f172a"
          stroke="#ffffff"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
