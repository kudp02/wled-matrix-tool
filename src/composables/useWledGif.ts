import { ref } from "vue";
// @ts-expect-error - omggif ships without types
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

// Build a palette + indexed pixel buffer from the hex color array.
// GIF requires a palette size that's a power of 2, between 2 and 256.
function quantize(pixelData: string[]): {
  palette: number[];
  indexed: Uint8Array;
} {
  const colorMap = new Map<string, number>();
  const palette: number[] = [];
  const indexed = new Uint8Array(pixelData.length);

  for (let i = 0; i < pixelData.length; i++) {
    const hex = (pixelData[i] || "#000000").toLowerCase();
    let idx = colorMap.get(hex);
    if (idx === undefined) {
      if (palette.length >= 256) {
        throw new Error(
          `Drawing has more than 256 unique colors (currently ${
            colorMap.size + 1
          }). Reduce color count before saving as GIF.`
        );
      }
      idx = palette.length;
      palette.push(hexToRgb(hex));
      colorMap.set(hex, idx);
    }
    indexed[i] = idx;
  }

  // Pad palette up to the next power of 2 (min 2).
  let target = 2;
  while (target < palette.length) target <<= 1;
  while (palette.length < target) palette.push(0);

  return { palette, indexed };
}

function encodeGif(
  pixelData: string[],
  width: number,
  height: number
): Uint8Array {
  if (pixelData.length !== width * height) {
    throw new Error(
      `Pixel count ${pixelData.length} does not match ${width}x${height} = ${
        width * height
      }`
    );
  }

  const { palette, indexed } = quantize(pixelData);

  // Generous buffer: header + GCT + frame headers + LZW-compressed pixels.
  // Worst case is roughly pixels * 1.5 + 1KB overhead; size for max 256x256.
  const buf: number[] = [];
  const writer = new GifWriter(buf, width, height, { palette, loop: 0 });
  // delay is in 1/100 s; for a 1-frame GIF it does not matter, but a non-zero
  // value avoids decoder edge cases. disposal:2 = restore-to-background.
  writer.addFrame(0, 0, width, height, indexed, { delay: 10, disposal: 2 });
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
    const file = new File([gif], filename, { type: "image/gif" });
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
    pixelData: string[],
    width: number,
    height: number,
    payload: SavePayload
  ): Promise<SaveResult> {
    busy.value = true;
    lastError.value = "";
    lastStatus.value = "Encoding GIF...";

    try {
      const filename = sanitizeFilename(payload.filename);
      const gif = encodeGif(pixelData, width, height);

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

  return {
    busy,
    lastError,
    lastStatus,
    encodeGif,
    sanitizeFilename,
    saveAndPlay,
  };
}
