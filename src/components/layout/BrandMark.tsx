import { useId } from "react";
import {
  brandMarkPath,
  brandMarkTile,
  brandMarkViewBox,
} from "@/assets/brand-mark.geometry";

export function BrandMark() {
  const gradientId = useId().replace(/:/g, "");

  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox={brandMarkViewBox} fill="none">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand-mark-from)" />
            <stop offset="100%" stopColor="var(--brand-mark-to)" />
          </linearGradient>
        </defs>
        <rect
          x={brandMarkTile.x}
          y={brandMarkTile.y}
          width={brandMarkTile.width}
          height={brandMarkTile.height}
          rx={brandMarkTile.rx}
          ry={brandMarkTile.ry}
          fill={`url(#${gradientId})`}
        />
        <path d={brandMarkPath} fill="var(--brand-mark-fg)" />
      </svg>
    </span>
  );
}
