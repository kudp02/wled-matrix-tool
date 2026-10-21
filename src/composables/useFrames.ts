import { ref, computed, watch, nextTick, onMounted, type Ref } from "vue";
import { renderGradient } from "./gradientRenderer";

// Frame source — drawn frames have no extra params. Gradient/image frames
// carry the generator settings so re-opening them restores the editor.
export interface GradientSettings {
  gradientType: "linear" | "radial" | "elliptical";
  customAngle: number;
  centerX: number;
  centerY: number;
  ellipticalRotation: number;
  scaleValue: number;
  colorStops: { color: string; position: number }[];
}

export interface ImageSettings {
  brightness: number;
  contrast: number;
  imagePreview: string | null;
}

export type FrameSource =
  | { type: "drawn" }
  | { type: "gradient"; params: GradientSettings }
  | { type: "image"; params: ImageSettings };

export interface Frame {
  id: string;
  pixelData: string[];
  source?: FrameSource;
}

interface DrawAPI {
  pixelData: Ref<string[]>;
  gridWidth: Ref<number>;
  gridHeight: Ref<number>;
  applyPixelArray: (
    pixels: string[],
    opts?: { skipHistory?: boolean }
  ) => void;
  clearHistory: () => void;
}

const STORAGE_KEY = "wled_frames_v1";
const MAX_IMAGE_PREVIEW_BYTES = 200 * 1024;

function stripLargeImagePreview(source?: FrameSource): FrameSource | undefined {
  if (
    source?.type === "image" &&
    source.params.imagePreview &&
    source.params.imagePreview.length > MAX_IMAGE_PREVIEW_BYTES
  ) {
    return {
      type: "image",
      params: { ...source.params, imagePreview: null },
    };
  }
  return source;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Linear RGB lerp between two `#RRGGBB` or `#RRGGBBAA` hex strings. Output
// width matches the inputs: if either side has alpha, the result carries
// alpha too (8-char) — otherwise 6-char. Black is the fallback for malformed
// values, matching the rest of the app.
function lerpHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  const r = Math.round(pa.r + (pb.r - pa.r) * t);
  const g = Math.round(pa.g + (pb.g - pa.g) * t);
  const bl = Math.round(pa.b + (pb.b - pa.b) * t);
  const hex2 = (n: number) =>
    Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  const hasAlpha = pa.hasAlpha || pb.hasAlpha;
  if (hasAlpha) {
    const al = Math.round(pa.a + (pb.a - pa.a) * t);
    return `#${hex2(r)}${hex2(g)}${hex2(bl)}${hex2(al)}`;
  }
  return `#${hex2(r)}${hex2(g)}${hex2(bl)}`;
}

function parseHex(hex: string): {
  r: number;
  g: number;
  b: number;
  a: number;
  hasAlpha: boolean;
} {
  const h = (hex || "#000000").replace("#", "");
  if (h.length !== 6 && h.length !== 8) {
    return { r: 0, g: 0, b: 0, a: 255, hasAlpha: false };
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255,
    hasAlpha: h.length === 8,
  };
}

// Build N in-between frames between two pixel arrays via per-pixel linear
// RGB interpolation. count=2 yields t=1/3 and t=2/3 — endpoints are NOT
// included. Pixel arrays of mismatched length fall back to black for the
// missing slot.
function buildPixelTweens(
  a: string[],
  b: string[],
  count: number
): string[][] {
  const out: string[][] = [];
  const len = Math.max(a.length, b.length);
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const frame: string[] = new Array(len);
    for (let p = 0; p < len; p++) {
      const ca = a[p] || "#000000";
      const cb = b[p] || "#000000";
      frame[p] = lerpHex(ca, cb, t);
    }
    out.push(frame);
  }
  return out;
}

// Shortest-arc interpolation between two angles in degrees (0..360). Avoids
// taking the long way around at 350° → 10°.
function lerpAngle(a: number, b: number, t: number): number {
  const diff = (((((b - a) % 360) + 540) % 360)) - 180;
  return ((a + diff * t) % 360 + 360) % 360;
}

function lerpNumber(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Pair-wise lerp of gradient settings. Caller guarantees same gradientType
// and matching colorStops length; positions and colors lerp index-by-index.
function lerpGradientSettings(
  a: GradientSettings,
  b: GradientSettings,
  t: number
): GradientSettings {
  return {
    gradientType: a.gradientType,
    customAngle: lerpAngle(a.customAngle, b.customAngle, t),
    centerX: lerpNumber(a.centerX, b.centerX, t),
    centerY: lerpNumber(a.centerY, b.centerY, t),
    ellipticalRotation: lerpAngle(
      a.ellipticalRotation,
      b.ellipticalRotation,
      t
    ),
    scaleValue: lerpNumber(a.scaleValue, b.scaleValue, t),
    colorStops: a.colorStops.map((sa, i) => {
      const sb = b.colorStops[i];
      return {
        color: lerpHex(sa.color, sb.color, t),
        position: lerpNumber(sa.position, sb.position, t),
      };
    }),
  };
}

// Returns the gradient params from both endpoints if they're compatible
// (same type, same number of stops). Different types (linear → radial) or
// mismatched stop counts can't be parameter-lerped meaningfully, so the
// caller falls back to pixel blending.
function matchedGradientParams(
  a: FrameSource | undefined,
  b: FrameSource | undefined
): { a: GradientSettings; b: GradientSettings } | null {
  if (!a || !b) return null;
  if (a.type !== "gradient" || b.type !== "gradient") return null;
  if (a.params.gradientType !== b.params.gradientType) return null;
  if (a.params.colorStops.length !== b.params.colorStops.length) return null;
  return { a: a.params, b: b.params };
}

export function useFrames(draw: DrawAPI) {
  const frames = ref<Frame[]>([]);
  const activeFrameIndex = ref(-1);
  const fps = ref(5);
  const isAnimationModeOn = ref(false);
  // WLED segment's fx:53 speed knob (`sx`). 128 = native speed; lower slows,
  // higher speeds up. Independent from `fps` which sets the GIF's intrinsic
  // delay at encode time. The Play button uses this when launching, and
  // dragging the slider on a playing animation sends a live update.
  const playbackSpeed = ref(128);
  // Per-gap interpolated frame count, applied at export/play time. The user's
  // `frames` are key frames only; tweens are derived on demand (see
  // expandFrames) rather than baked into the timeline. 0..500.
  const tweenCount = ref(30);
  // When true, expandFrames also appends interpolated frames from the LAST
  // key back to the FIRST so the animation wraps without a visual snap.
  const loopStitch = ref(false);

  // Suppresses the auto-save watcher while we programmatically swap frames
  // or apply a source-aware payload (gradient/image). Without this, switching
  // frames would immediately overwrite the just-loaded frame with itself,
  // and an apply-from-source call would race the watcher and lose its source.
  const isLoadingFrame = ref(false);

  // 1/100 s as expected by GIF (delay = 100 / fps).
  const delayHundredths = computed(() =>
    Math.max(1, Math.round(100 / fps.value))
  );

  // Persist to localStorage. Strip large image data URLs to bound storage.
  watch(
    [
      frames,
      activeFrameIndex,
      fps,
      isAnimationModeOn,
      playbackSpeed,
      tweenCount,
      loopStitch,
    ],
    () => {
      try {
        const payload = {
          frames: frames.value.map((f) => ({
            ...f,
            source: stripLargeImagePreview(f.source),
          })),
          activeFrameIndex: activeFrameIndex.value,
          fps: fps.value,
          isAnimationModeOn: isAnimationModeOn.value,
          playbackSpeed: playbackSpeed.value,
          tweenCount: tweenCount.value,
          loopStitch: loopStitch.value,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (e) {
        console.warn("Failed to save frames:", e);
      }
    },
    { deep: true }
  );

  // Sync canvas → active frame. Fires on pen strokes, undo, clear, etc.
  // Skips programmatic loads (via isLoadingFrame).
  watch(
    () => draw.pixelData.value,
    () => {
      if (isLoadingFrame.value) return;
      if (!isAnimationModeOn.value) return;
      const i = activeFrameIndex.value;
      if (i < 0 || i >= frames.value.length) return;
      const f = frames.value[i];
      f.pixelData = [...draw.pixelData.value];
      // A manual edit invalidates any saved source — the frame is now "drawn".
      f.source = { type: "drawn" };
    },
    { deep: true }
  );

  function setActiveFrame(i: number): void {
    if (i < 0 || i >= frames.value.length) return;
    isLoadingFrame.value = true;
    activeFrameIndex.value = i;
    // Frame switches are navigation, not edits — skip drawing-history push
    // so Cmd+Z doesn't try to undo a "frame switch" by writing the previous
    // frame's pixels into the now-active frame.
    draw.applyPixelArray(frames.value[i].pixelData, { skipHistory: true });
    // Clear stale entries from the previous frame's editing session. Without
    // this, hitting Cmd+Z after a switch would pop entries logged against a
    // different frame, restoring pixels that don't belong to the current one
    // — the watcher would then write those pixels into the current frame.
    draw.clearHistory();
    nextTick(() => {
      isLoadingFrame.value = false;
    });
  }

  function addFrame(source?: FrameSource): void {
    const f: Frame = {
      id: makeId(),
      pixelData: [...draw.pixelData.value],
      source: source ?? { type: "drawn" },
    };
    frames.value.push(f);
    // Activate the new frame. The canvas already shows the right pixels, so
    // we just flip the index — but we still guard so the watcher doesn't
    // ping-pong on the next pixelData tick.
    isLoadingFrame.value = true;
    activeFrameIndex.value = frames.value.length - 1;
    nextTick(() => {
      isLoadingFrame.value = false;
    });
  }

  function duplicateFrame(i: number): void {
    if (i < 0 || i >= frames.value.length) return;
    const src = frames.value[i];
    const copy: Frame = {
      id: makeId(),
      pixelData: [...src.pixelData],
      source: src.source
        ? (JSON.parse(JSON.stringify(src.source)) as FrameSource)
        : { type: "drawn" },
    };
    frames.value.splice(i + 1, 0, copy);
    setActiveFrame(i + 1);
  }

  function deleteFrame(i: number): void {
    if (i < 0 || i >= frames.value.length) return;
    frames.value.splice(i, 1);
    if (frames.value.length === 0) {
      activeFrameIndex.value = -1;
      return;
    }
    const next = Math.min(i, frames.value.length - 1);
    setActiveFrame(next);
  }

  function moveFrame(from: number, to: number): void {
    if (from < 0 || from >= frames.value.length) return;
    if (to < 0 || to >= frames.value.length) return;
    if (from === to) return;
    const [moved] = frames.value.splice(from, 1);
    frames.value.splice(to, 0, moved);
    // Keep the active highlight on whichever frame was active.
    if (activeFrameIndex.value === from) {
      activeFrameIndex.value = to;
    } else if (from < activeFrameIndex.value && to >= activeFrameIndex.value) {
      activeFrameIndex.value -= 1;
    } else if (from > activeFrameIndex.value && to <= activeFrameIndex.value) {
      activeFrameIndex.value += 1;
    }
  }

  // Two interpolation strategies, shared by gap inserts and loop stitching:
  //  - "gradient-aware": when both endpoints have compatible gradient
  //    sources (same type, same number of stops) we lerp the SETTINGS
  //    (angle, center, scale, stop colors/positions) and re-render via
  //    renderGradient. Angles use shortest-arc so 350° → 10° doesn't take
  //    the long way. New frames keep `type: "gradient"` so you can still
  //    open them in the panel and tweak.
  //  - "pixel-blend": fallback for any other pair (drawn, image, or
  //    mismatched gradients). Per-pixel RGB lerp, tagged as {type: "drawn"}.
  function buildTweensBetween(a: Frame, b: Frame, count: number): Frame[] {
    const n = Math.max(1, Math.min(500, Math.round(count)));
    const tweens: Frame[] = [];
    const gradPair = matchedGradientParams(a.source, b.source);

    if (gradPair) {
      const w = draw.gridWidth.value;
      const h = draw.gridHeight.value;
      for (let i = 1; i <= n; i++) {
        const t = i / (n + 1);
        const lerped = lerpGradientSettings(gradPair.a, gradPair.b, t);
        tweens.push({
          id: makeId(),
          pixelData: renderGradient(lerped, w, h),
          source: { type: "gradient", params: lerped },
        });
      }
    } else {
      const pixelTweens = buildPixelTweens(a.pixelData, b.pixelData, n);
      for (const px of pixelTweens) {
        tweens.push({
          id: makeId(),
          pixelData: px,
          source: { type: "drawn" },
        });
      }
    }
    return tweens;
  }

  // Expand the user's key frames into the full animation sequence used by
  // export/play. Keys stay the source of truth in `frames`; tweens are derived
  // here on demand so editing a key automatically refreshes the in-between
  // motion — no manual re-tween step. `tweenCount` controls per-gap density;
  // when `loopStitch` is on, additional tweens are appended from the last key
  // back to the first to smooth the wrap-around.
  function expandFrames(): Frame[] {
    const keys = frames.value;
    if (keys.length === 0) return [];
    if (keys.length === 1) return [keys[0]];

    const n = Math.max(0, Math.min(500, Math.round(tweenCount.value)));
    const out: Frame[] = [];
    for (let i = 0; i < keys.length - 1; i++) {
      out.push(keys[i]);
      if (n > 0) {
        out.push(...buildTweensBetween(keys[i], keys[i + 1], n));
      }
    }
    out.push(keys[keys.length - 1]);

    if (loopStitch.value && n > 0) {
      out.push(...buildTweensBetween(keys[keys.length - 1], keys[0], n));
    }
    return out;
  }

  function clearFrames(): void {
    frames.value = [];
    activeFrameIndex.value = -1;
  }

  function updateActiveFrameSource(source: FrameSource): void {
    const i = activeFrameIndex.value;
    if (i < 0 || i >= frames.value.length) return;
    frames.value[i].source = source;
  }

  // Apply a source-tagged payload (from GradientGenerator/ImageUploader).
  // - Outside animation mode (or with no active frame): plain canvas update.
  // - In animation mode with active frame: push pixels to canvas AND directly
  //   write {pixelData, source} on the frame, suppressing the auto-watcher so
  //   the source label survives.
  function applyFromSource(pixels: string[], source: FrameSource): void {
    if (!isAnimationModeOn.value || activeFrameIndex.value < 0) {
      draw.applyPixelArray(pixels);
      return;
    }
    isLoadingFrame.value = true;
    draw.applyPixelArray(pixels);
    const f = frames.value[activeFrameIndex.value];
    f.pixelData = [...pixels];
    f.source = source;
    nextTick(() => {
      isLoadingFrame.value = false;
    });
  }

  onMounted(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed.frames)) {
        frames.value = parsed.frames.filter(
          (f: unknown): f is Frame =>
            !!f &&
            typeof f === "object" &&
            Array.isArray((f as Frame).pixelData) &&
            typeof (f as Frame).id === "string"
        );
      }
      if (typeof parsed.fps === "number" && parsed.fps >= 1 && parsed.fps <= 30) {
        fps.value = parsed.fps;
      }
      if (typeof parsed.isAnimationModeOn === "boolean") {
        isAnimationModeOn.value = parsed.isAnimationModeOn;
      }
      if (
        typeof parsed.playbackSpeed === "number" &&
        parsed.playbackSpeed >= 0 &&
        parsed.playbackSpeed <= 255
      ) {
        playbackSpeed.value = parsed.playbackSpeed;
      }
      if (
        typeof parsed.tweenCount === "number" &&
        parsed.tweenCount >= 0 &&
        parsed.tweenCount <= 500
      ) {
        tweenCount.value = Math.round(parsed.tweenCount);
      }
      if (typeof parsed.loopStitch === "boolean") {
        loopStitch.value = parsed.loopStitch;
      }
      if (
        typeof parsed.activeFrameIndex === "number" &&
        parsed.activeFrameIndex >= 0 &&
        parsed.activeFrameIndex < frames.value.length
      ) {
        // Defer so useWledDraw's own onMounted/setupGrid finishes first.
        nextTick(() => setActiveFrame(parsed.activeFrameIndex));
      }
    } catch (e) {
      console.warn("Failed to load frames:", e);
    }
  });

  return {
    frames,
    activeFrameIndex,
    fps,
    isAnimationModeOn,
    playbackSpeed,
    tweenCount,
    loopStitch,
    delayHundredths,
    setActiveFrame,
    addFrame,
    duplicateFrame,
    deleteFrame,
    moveFrame,
    expandFrames,
    clearFrames,
    updateActiveFrameSource,
    applyFromSource,
  };
}
