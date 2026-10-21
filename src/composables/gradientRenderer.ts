import type { GradientSettings } from "./useFrames";

// Linear RGB lerp on two `#RRGGBB` strings. Kept here (not in useFrames)
// so callers that don't deal with frames can render gradients standalone.
export function mixHexRgb(c1: string, c2: string, t: number): string {
  const r1 = parseInt(c1.substring(1, 3), 16);
  const g1 = parseInt(c1.substring(3, 5), 16);
  const b1 = parseInt(c1.substring(5, 7), 16);
  const r2 = parseInt(c2.substring(1, 3), 16);
  const g2 = parseInt(c2.substring(3, 5), 16);
  const b2 = parseInt(c2.substring(5, 7), 16);
  const r = Math.round(r1 + t * (r2 - r1));
  const g = Math.round(g1 + t * (g2 - g1));
  const b = Math.round(b1 + t * (b2 - b1));
  return `#${r.toString(16).padStart(2, "0")}${g
    .toString(16)
    .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function colorAtPosition(
  stops: ReadonlyArray<{ color: string; position: number }>,
  position: number
): string {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  if (position <= sorted[0].position) return sorted[0].color;
  if (position >= sorted[sorted.length - 1].position)
    return sorted[sorted.length - 1].color;
  let startIndex = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (position >= sorted[i].position && position <= sorted[i + 1].position) {
      startIndex = i;
      break;
    }
  }
  const start = sorted[startIndex];
  const end = sorted[startIndex + 1];
  const factor = (position - start.position) / (end.position - start.position);
  return mixHexRgb(start.color, end.color, factor);
}

// Pure renderer for the gradient generator's settings. Mirrors the math
// that used to live inline in GradientGenerator.vue, so a frame rendered
// here looks identical to what the panel preview shows.
//
// Scaling is anchored at the geometric center (0.5, 0.5), NOT the gradient
// center — that matches the legacy behavior and keeps "Center X/Y" purely
// about where the gradient origin is.
export function renderGradient(
  s: GradientSettings,
  width: number,
  height: number
): string[] {
  const scaleFactor = s.scaleValue / 100;
  const aspectRatio = width / height;
  const pixels: string[] = new Array(width * height);
  const cache = new Map<string, string>();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const normalizedX = width > 1 ? x / (width - 1) : 0;
      const normalizedY = height > 1 ? y / (height - 1) : 0;

      const scaledX = 0.5 + (normalizedX - 0.5) / scaleFactor;
      const scaledY = 0.5 + (normalizedY - 0.5) / scaleFactor;
      const isOutsideRange =
        scaledX < 0 || scaledX > 1 || scaledY < 0 || scaledY > 1;

      const mappedX = isOutsideRange
        ? scaledX < 0
          ? 0
          : width - 1
        : Math.min(Math.max(0, Math.round(scaledX * (width - 1))), width - 1);
      const mappedY = isOutsideRange
        ? scaledY < 0
          ? 0
          : height - 1
        : Math.min(Math.max(0, Math.round(scaledY * (height - 1))), height - 1);

      const cacheKey = `${s.gradientType}-${mappedX}-${mappedY}`;
      let color = cache.get(cacheKey);
      if (color === undefined) {
        if (isOutsideRange) {
          if (s.gradientType === "linear") {
            const angleRad = (s.customAngle * Math.PI) / 180;
            const av = [Math.cos(angleRad), Math.sin(angleRad)];
            const position = (scaledX * av[0] + scaledY * av[1]) * 100;
            color = colorAtPosition(
              s.colorStops,
              Math.max(0, Math.min(100, position))
            );
          } else {
            color = colorAtPosition(s.colorStops, 100);
          }
        } else if (s.gradientType === "linear") {
          const angleRad = (s.customAngle * Math.PI) / 180;
          const av = [Math.cos(angleRad), Math.sin(angleRad)];
          const position = (scaledX * av[0] + scaledY * av[1]) * 100;
          color = colorAtPosition(
            s.colorStops,
            Math.max(0, Math.min(100, position))
          );
        } else {
          const centerXNorm = s.centerX / 100;
          const centerYNorm = s.centerY / 100;
          let dx = (scaledX - centerXNorm) * aspectRatio;
          let dy = scaledY - centerYNorm;
          if (s.gradientType === "elliptical") {
            if (s.ellipticalRotation !== 0) {
              const rr = (s.ellipticalRotation * Math.PI) / 180;
              const rdx = dx * Math.cos(rr) - dy * Math.sin(rr);
              const rdy = dx * Math.sin(rr) + dy * Math.cos(rr);
              dx = rdx;
              dy = rdy;
            }
            dy = dy * 2;
          }
          const maxDistanceX =
            Math.max(centerXNorm, 1 - centerXNorm) * aspectRatio;
          const maxDistanceY = Math.max(centerYNorm, 1 - centerYNorm);
          const maxDistance = Math.sqrt(
            maxDistanceX * maxDistanceX + maxDistanceY * maxDistanceY
          );
          const distance =
            (Math.sqrt(dx * dx + dy * dy) / maxDistance) * 100;
          color = colorAtPosition(s.colorStops, Math.min(distance, 100));
        }
        cache.set(cacheKey, color);
      }
      pixels[y * width + x] = color;
    }
  }
  return pixels;
}
