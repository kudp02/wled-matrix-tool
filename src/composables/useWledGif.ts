/// <reference path="../types/omggif.d.ts" />
import { ref } from "vue";
import { GifWriter } from "omggif";

// WLED's "Image" effect ID. The effect reads the segment name `n` as a path
// to a GIF on LittleFS (e.g. "drawing.gif" -> "/drawing.gif") and plays it.
// Required build flag on the device: WLED_ENABLE_GIF (default on ESP32).
const IMAGE_FX_ID = 53;

interface SavePayload {
  filename: string;
  presetId: number;
  presetName: string;
  segmentId: number;
  brightness: number;
  speed: number;
}

interface SaveResult {
  ok: boolean;
  step: "encode" | "upload" | "play" | "preset" | "done";
  message: string;
}

function hexToRgb(hex: string): number {
  const h = hex.startsWith("#") ? hex.slice(1) : hex;
  return parseInt(h, 16) & 0xffffff;
}

// Quantize at a fixed per-channel bit depth: keep the top `bits` MSBs of each
// channel and snap to the bucket midpoint, which yields better perceptual
// accuracy than truncating to bucket floor. Returns null if the resulting
// palette still exceeds 256 entries.
function quantizeAtDepth(
  frames: string[][],
  bits: number
): { palette: number[]; indexedFrames: Uint8Array[] } | null {
  const shift = 8 - bits;
  // bit=8 → shift=0, no rounding. Otherwise pull each value to the midpoint
  // of its bucket so the represented color is centered, not floor-aligned.
  const mid = shift > 0 ? 1 << (shift - 1) : 0;
  const mask = shift > 0 ? (0xff << shift) & 0xff : 0xff;

  const colorMap = new Map<number, number>();
  const palette: number[] = [];
  const indexedFrames: Uint8Array[] = [];

  for (const pixels of frames) {
    const indexed = new Uint8Array(pixels.length);
    for (let i = 0; i < pixels.length; i++) {
      const rgb = hexToRgb(pixels[i] || "#000000");
      const r = ((rgb >> 16) & mask) | mid;
      const g = ((rgb >> 8) & mask) | mid;
      const b = (rgb & mask) | mid;
      const key = (r << 16) | (g << 8) | b;
      let idx = colorMap.get(key);
      if (idx === undefined) {
        if (palette.length >= 256) return null;
        idx = palette.length;
        palette.push(key);
        colorMap.set(key, idx);
      }
      indexed[i] = idx;
    }
    indexedFrames.push(indexed);
  }

  // Pad palette up to the next power of 2 (min 2). GIF requires a power-of-2
  // global color table size.
  let target = 2;
  while (target < palette.length) target <<= 1;
  while (palette.length < target) palette.push(0);

  return { palette, indexedFrames };
}

// Build a global palette + per-frame indexed pixel buffers. Starts at full
// 8-bit-per-channel color and progressively coarsens (7-bit, 6-bit, ...) if
// the unique-color count exceeds GIF's 256-entry limit. Interpolated frames
// generate many unique mid-gradient colors per pixel, so this fallback is
// what keeps Play working with N>1 tweens. Worst-case 2 bits per channel
// (64 possible colors) always fits.
function quantizeFrames(frames: string[][]): {
  palette: number[];
  indexedFrames: Uint8Array[];
} {
  for (let bits = 8; bits >= 2; bits--) {
    const result = quantizeAtDepth(frames, bits);
    if (result) return result;
  }
  // Unreachable on real inputs (2 bits → max 64 colors, well under 256),
  // but kept for completeness.
  throw new Error(
    "Could not reduce palette to 256 colors even at 2-bit depth — frame data appears malformed."
  );
}

// Accepts either a single pixel array (still GIF) or an array of frames
// (animated GIF). `delayHundredths` is the per-frame delay in 1/100 s — only
// meaningful for multi-frame animations.
function encodeGif(
  pixelData: string[] | string[][],
  width: number,
  height: number,
  delayHundredths = 20
): Uint8Array {
  const frames: string[][] = Array.isArray(pixelData[0])
    ? (pixelData as string[][])
    : [pixelData as string[]];

  const expected = width * height;
  for (const f of frames) {
    if (f.length !== expected) {
      throw new Error(
        `Pixel count ${f.length} does not match ${width}x${height} = ${expected}`
      );
    }
  }

  const { palette, indexedFrames } = quantizeFrames(frames);

  const buf: number[] = [];
  // loop: 0 => infinite playback for animated GIFs. Harmless for single frame.
  const writer = new GifWriter(buf, width, height, { palette, loop: 0 });
  for (const indexed of indexedFrames) {
    writer.addFrame(0, 0, width, height, indexed, {
      // disposal: 2 = restore-to-background between frames. Same as PixelForge.
      delay: frames.length > 1 ? delayHundredths : 10,
      disposal: 2,
    });
  }
  writer.end();

  return new Uint8Array(buf);
}

function sanitizeFilename(name: string): string {
  // LittleFS is permissive but WLED's segment-name field is short; keep it
  // simple and safe. Strip extension if the user already typed .gif.
  const base = name.trim().replace(/\.gif$/i, "");
  // Allow letters, digits, dash, underscore. Replace anything else with `_`.
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 24);
  return (cleaned || "drawing") + ".gif";
}

// Derive base device URL ("http://host") from the configured /json endpoint.
function getDeviceBase(apiUrl: string): string {
  const u = new URL(apiUrl);
  return `${u.protocol}//${u.host}`;
}

export function useWledGif() {
  const busy = ref(false);
  const lastError = ref("");
  const lastStatus = ref("");

  async function uploadGif(
    apiUrl: string,
    filename: string,
    gif: Uint8Array
  ): Promise<void> {
    const base = getDeviceBase(apiUrl);
    // TS 5+ is strict about Uint8Array<ArrayBufferLike> vs BlobPart's
    // ArrayBufferView<ArrayBuffer>. Runtime accepts both; cast through unknown.
    const file = new File([gif as unknown as BlobPart], filename, {
      type: "image/gif",
    });
    const fd = new FormData();
    fd.append("file", file, filename);

    const res = await fetch(`${base}/upload`, { method: "POST", body: fd });
    if (!res.ok) {
      throw new Error(`Upload failed: HTTP ${res.status} ${res.statusText}`);
    }
  }

  async function playGif(
    apiUrl: string,
    filename: string,
    segmentId: number,
    brightness: number,
    speed: number
  ): Promise<void> {
    // Bounce the segment first. Without this, re-issuing fx:53 with the same
    // filename (e.g. the _preview.gif slot for the Play button) makes WLED
    // skip reopening the file because the segment config didn't change — so
    // you keep watching the previously cached animation even after the file
    // on LittleFS was overwritten. Clearing fx and the name byte releases
    // the GIF decoder, then the second call opens the (now-fresh) file.
    await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seg: [{ id: segmentId, fx: 0, n: "" }] }),
    });
    // Short pause so WLED finishes tearing down the decoder. Empirically
    // 50-80ms is enough; we use 80ms to be safe on slower ESP32s.
    await new Promise((r) => setTimeout(r, 80));

    const body = {
      on: true,
      bri: brightness,
      seg: [
        {
          id: segmentId,
          fx: IMAGE_FX_ID,
          n: filename,
          frz: false,
          sx: speed,
          ix: 0,
        },
      ],
    };
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Play failed: HTTP ${res.status} ${res.statusText}`);
    }
  }

  async function savePreset(
    apiUrl: string,
    presetId: number,
    presetName: string
  ): Promise<void> {
    // psave captures the *current* device state into the given slot.
    // We send it right after playGif so the captured state already has
    // fx:53 + n:filename baked in, giving smooth on/off when recalled.
    const body = { psave: presetId, n: presetName, ib: true, sb: true };
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(
        `Preset save failed: HTTP ${res.status} ${res.statusText}`
      );
    }
  }

  async function saveAndPlay(
    apiUrl: string,
    pixelData: string[] | string[][],
    width: number,
    height: number,
    payload: SavePayload,
    opts: { delayHundredths?: number } = {}
  ): Promise<SaveResult> {
    busy.value = true;
    lastError.value = "";
    const frameCount = Array.isArray(pixelData[0])
      ? (pixelData as string[][]).length
      : 1;
    lastStatus.value =
      frameCount > 1
        ? `Encoding ${frameCount}-frame GIF...`
        : "Encoding GIF...";

    try {
      const filename = sanitizeFilename(payload.filename);
      const gif = encodeGif(pixelData, width, height, opts.delayHundredths);

      lastStatus.value = `Uploading ${filename} (${gif.length} bytes)...`;
      await uploadGif(apiUrl, filename, gif);

      lastStatus.value = `Playing ${filename}...`;
      await playGif(
        apiUrl,
        filename,
        payload.segmentId,
        payload.brightness,
        payload.speed
      );

      if (payload.presetId > 0) {
        lastStatus.value = `Saving preset #${payload.presetId}...`;
        // Tiny delay so WLED finishes applying the segment state before psave
        // snapshots it. Without this, psave occasionally captures the prior fx.
        await new Promise((r) => setTimeout(r, 150));
        await savePreset(apiUrl, payload.presetId, payload.presetName);
      }

      lastStatus.value = `Saved as ${filename}`;
      busy.value = false;
      return { ok: true, step: "done", message: lastStatus.value };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastError.value = msg;
      lastStatus.value = "";
      busy.value = false;
      return { ok: false, step: "encode", message: msg };
    }
  }

  // One-click preview: encode current frames as a temp GIF, upload, and play
  // via fx:53 with the given speed. Doesn't touch presets and reuses a single
  // filename ("_preview.gif") so it doesn't pollute the device's file list.
  async function playAnimation(
    apiUrl: string,
    pixelData: string[] | string[][],
    width: number,
    height: number,
    opts: {
      segmentId?: number;
      brightness?: number;
      speed?: number;
      delayHundredths?: number;
      filename?: string;
    } = {}
  ): Promise<SaveResult> {
    busy.value = true;
    lastError.value = "";
    const frameCount = Array.isArray(pixelData[0])
      ? (pixelData as string[][]).length
      : 1;
    lastStatus.value =
      frameCount > 1 ? `Preparing ${frameCount}-frame preview...` : "Preparing preview...";

    try {
      const filename = sanitizeFilename(opts.filename ?? "_preview");
      const gif = encodeGif(pixelData, width, height, opts.delayHundredths);

      lastStatus.value = `Uploading ${filename} (${gif.length} bytes)...`;
      await uploadGif(apiUrl, filename, gif);

      lastStatus.value = `Playing ${filename}...`;
      await playGif(
        apiUrl,
        filename,
        opts.segmentId ?? 0,
        opts.brightness ?? 230,
        opts.speed ?? 128
      );

      lastStatus.value = `Playing ${filename}`;
      busy.value = false;
      return { ok: true, step: "done", message: lastStatus.value };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastError.value = msg;
      lastStatus.value = "";
      busy.value = false;
      return { ok: false, step: "encode", message: msg };
    }
  }

  // Live-tweak just the playback speed (segment sx) without re-uploading.
  // Fire-and-forget; failures are logged but not surfaced — this is called
  // on every slider tick, surfacing errors there would be noisy.
  async function setSpeed(
    apiUrl: string,
    segmentId: number,
    speed: number
  ): Promise<void> {
    try {
      const body = { seg: [{ id: segmentId, sx: speed }] };
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.warn(`setSpeed: HTTP ${res.status} ${res.statusText}`);
      }
    } catch (e) {
      console.warn("setSpeed failed:", e);
    }
  }

  return {
    busy,
    lastError,
    lastStatus,
    encodeGif,
    sanitizeFilename,
    saveAndPlay,
    playAnimation,
    setSpeed,
  };
}
