<script setup lang="ts">
import DrawingCanvas from "./components/DrawingCanvas.vue";
import ColorPicker from "./components/ColorPicker.vue";
import Settings from "./components/Settings.vue";
import Toolbar from "./components/Toolbar.vue";
import DarkModeToggle from "./components/DarkModeToggle.vue";
import GradientGenerator from "./components/GradientGenerator.vue";
import ImageUploader from "./components/ImageUploader.vue";
import SaveToDevice from "./components/SaveToDevice.vue";
import FrameTimeline from "./components/FrameTimeline.vue";
import { useWledDraw } from "./composables/useWledDraw";
import { useFrames, type FrameSource } from "./composables/useFrames";
import { useWledGif } from "./composables/useWledGif";
import { ArrowLeft, Menu } from "lucide-vue-next";
import { ref, computed, onMounted, onUnmounted } from "vue";

// Initialize WLED drawing functionality with the enhanced composable
const {
  // State properties
  apiUrl,
  wledUrl,
  cellSize,
  gridWidth,
  gridHeight,
  flipHorizontal,
  flipVertical,
  globalBrightness,
  pixelData,
  displayPixelData,
  currentColor,
  loading,
  error,
  wledJson,
  debounceDelay,

  // Core methods
  updatePixel,
  batchUpdatePixels,
  applyPixelArray,
  sendDrawingUpdate, // New drawing-specific update method
  flushChanges,
  undo,
  clearScreen,
  ignoreApiAndContinue,
} = useWledDraw();

// Animation / frames composable — wires its own watchers onto pixelData and
// drives applyPixelArray when the user switches frames.
const framesAPI = useFrames({
  pixelData,
  gridWidth,
  gridHeight,
  applyPixelArray,
});
const {
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
  applyFromSource,
} = framesAPI;

// Lightweight gif preview path — distinct from SaveToDevice (which has its
// own filename + preset modal). Play button here uses a fixed temp filename.
const gif = useWledGif();

async function playFromTimeline(): Promise<void> {
  if (!apiUrl.value || frames.value.length === 0) return;
  // Tweens are derived from keys at this point, not stored — the user's
  // edits to a key frame are reflected on the next Play with no re-tween step.
  const expanded = expandFrames();
  const pixels =
    expanded.length >= 2
      ? expanded.map((f) => flipFrame(f.pixelData))
      : flipFrame(expanded[0].pixelData);
  await gif.playAnimation(apiUrl.value, pixels, gridWidth.value, gridHeight.value, {
    segmentId: 0,
    brightness: globalBrightness.value,
    speed: playbackSpeed.value,
    delayHundredths: delayHundredths.value,
  });
}

// Live speed tweak. Skip the device round-trip when there's nothing playing
// yet (no apiUrl). The Play button picks up the latest value on next launch.
function onSpeedChange(v: number): void {
  playbackSpeed.value = v;
  if (apiUrl.value && !loading.value && !error.value) {
    gif.setSpeed(apiUrl.value, 0, v);
  }
}

// Hand the GradientGenerator's hydration prop the params from the active
// frame (when it has gradient source). Otherwise null — generator falls back
// to its own localStorage defaults.
const activeGradientSettings = computed(() => {
  const i = activeFrameIndex.value;
  if (i < 0 || i >= frames.value.length) return null;
  const src = frames.value[i].source;
  return src?.type === "gradient" ? src.params : null;
});

// Frames are stored in logical (unflipped) coordinates so the matrix-flip
// settings stay a render-time concern. For sending to the device we apply
// the active flips to each frame, matching what `displayPixelData` does for
// the single-canvas case.
function flipFrame(pixels: string[]): string[] {
  let data = pixels;
  const w = gridWidth.value;
  const h = gridHeight.value;
  if (flipHorizontal.value) {
    const out: string[] = [];
    for (let y = 0; y < h; y++) {
      const start = y * w;
      out.push(...data.slice(start, start + w).reverse());
    }
    data = out;
  }
  if (flipVertical.value) {
    const out: string[] = [];
    for (let y = h - 1; y >= 0; y--) {
      const start = y * w;
      out.push(...data.slice(start, start + w));
    }
    data = out;
  }
  return data;
}

// Frames sent to SaveToDevice = keys expanded with derived tweens, then
// flipped. Recomputes whenever a key edit, tweenCount, or loopStitch changes.
const displayFrames = computed(() => {
  if (!isAnimationModeOn.value) return [];
  // Reactive deps: track frames + the knobs so the computed invalidates.
  void frames.value;
  void tweenCount.value;
  void loopStitch.value;
  return expandFrames().map((f) => ({
    ...f,
    pixelData: flipFrame(f.pixelData),
  }));
});

// Current drawing tool and brush size
const currentTool = ref("pen");
const brushSize = ref(1);

// Settings modal control
const isSettingsOpen = ref(false);

// Mobile sidebar control
const isSidebarOpen = ref(false);
const isMobile = ref(window.innerWidth < 768);

// Handle window resize for mobile detection
function handleResize() {
  isMobile.value = window.innerWidth < 768;
  // Auto-close sidebar on desktop
  if (!isMobile.value) {
    isSidebarOpen.value = false;
  }
}

// Add resize listener
onMounted(() => {
  window.addEventListener("resize", handleResize);
  handleResize(); // Initial check
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
});

// Toggle sidebar for mobile
function toggleSidebar() {
  isSidebarOpen.value = !isSidebarOpen.value;
}

/**
 * Handle pixel update from the drawing canvas
 * @param index - Pixel index in the grid
 * @param color - New color for the pixel
 */
function handleUpdatePixel(index: number, color: string) {
  updatePixel(index, color);
}

/**
 * Handle batch pixel updates (for brush with size > 1)
 * @param indices - Array of pixel indices to update
 * @param color - Color to apply to all pixels
 */
function handleBatchUpdatePixels(indices: number[], color: string) {
  batchUpdatePixels(indices, color);
}

/**
 * Handle draw complete event - flush any pending changes
 */
const handleDrawComplete = () => flushChanges();

// Add a handler for drawing updates
function handleDrawingUpdate() {
  // Use the drawing-specific update method
  sendDrawingUpdate();
}

/**
 * Apply a gradient to the canvas. When animation mode is on with an active
 * frame, route through `applyFromSource` so the gradient params get stamped
 * onto the frame (and editing it later restores the picker to those values).
 * Otherwise fall through to the plain canvas update.
 */
function handleGradientUpdate(gradientData: string[], source?: FrameSource) {
  if (isAnimationModeOn.value && activeFrameIndex.value >= 0 && source) {
    applyFromSource(gradientData, source);
  } else {
    applyPixelArray(gradientData);
  }
}

/**
 * Apply image pixels to the canvas - direct connection to applyPixelArray
 */
function applyImageToCanvas(imagePixelData: string[]) {
  applyPixelArray(imagePixelData);
}

/**
 * Update brush size
 * @param size - New brush size (1-3)
 */
function handleBrushSizeChange(size: number) {
  brushSize.value = size;
}
</script>

<template>
  <div
    class="flex h-screen bg-gray-50 text-gray-900 dark:bg-dark-primary dark:text-dark-text transition-colors duration-200 overflow-hidden"
  >
    <!-- Mobile Menu Toggle -->
    <button
      v-if="isMobile"
      @click="toggleSidebar"
      class="fixed top-4 left-4 z-10 p-2 bg-white dark:bg-dark-accent shadow-lg rounded-lg md:hidden transition-all duration-300"
    >
      <Menu class="w-6 h-6" />
    </button>

    <!-- Sidebar -->
    <aside
      class="w-[300px] bg-white dark:bg-dark-primary shadow-md overflow-y-auto h-full transition-all duration-300"
      :class="{
        'fixed top-0 left-0 z-40': isMobile,
        'transform -translate-x-full': isMobile && !isSidebarOpen,
        'transform translate-x-0': isMobile && isSidebarOpen,
      }"
    >
      <div class="p-6 pr-3 flex flex-col gap-6 h-full">
        <!-- Header with WLED link and dark mode toggle -->
        <div class="flex justify-between items-center mb-4">
          <div class="flex items-center gap-2">
            <a
              v-if="wledUrl"
              :href="wledUrl"
              class="inline-flex items-center justify-center size-7 rounded-full bg-gray-100 dark:bg-dark-accent dark:text-white hover:bg-gray-200 dark:hover:bg-dark-muted/20"
              title="Go back to WLED"
            >
              <ArrowLeft class="size-4" />
            </a>
            <h1 class="text-xl font-bold">Matrix Editor</h1>
          </div>
          <DarkModeToggle />
        </div>

        <!-- Color Picker Section -->
        <ColorPicker v-model="currentColor" class="flex-shrink-0" />

        <!-- Gradient Generator Section -->
        <GradientGenerator
          :pixel-data="pixelData"
          :grid-width="gridWidth"
          :grid-height="gridHeight"
          :apply-pixel-array="handleGradientUpdate"
          :initial-settings="activeGradientSettings"
        />

        <!-- Image Uploader Section -->
        <ImageUploader
          :grid-width="gridWidth"
          :grid-height="gridHeight"
          @apply-image="applyImageToCanvas"
        />
      </div>
    </aside>

    <!-- Mobile Sidebar Overlay -->
    <div
      v-if="isMobile && isSidebarOpen"
      @click="isSidebarOpen = false"
      class="fixed inset-0 z-30"
      style="background-color: rgba(0, 0, 0, 0.15)"
    ></div>

    <!-- Main Content Area -->
    <main
      class="flex-1 p-6 flex flex-col dark:bg-dark-primary transition-colors duration-200 overflow-y-auto h-full"
      :class="{
        'pl-3': !isMobile,
        'pt-16': isMobile,
      }"
    >
      <!-- Status Notifications (Loading/Error) -->
      <div class="w-full max-w-3xl mx-auto mb-4" v-if="loading || error">
        <!-- Loading Notification -->
        <div
          v-if="loading && !error"
          class="p-6 bg-blue-50 dark:bg-blue-900/20 rounded mb-4 transition-colors duration-200"
        >
          <h3 class="font-bold mb-2">
            We're currently loading your settings. Make sure your matrix is
            setup correctly. <i>Fetching {{ apiUrl }}</i>
          </h3>
          <p>
            If you keep seeing this, make sure you update your API endpoint URL
            e.g. <i>`http://[device_ip_address]/json`</i>
          </p>
        </div>

        <!-- Error Notification -->
        <div
          v-if="error"
          class="p-6 bg-red-50 dark:bg-red-900/20 rounded mb-4 transition-colors duration-200"
        >
          <h3 class="font-bold mb-2">
            We could not fetch your settings at <i>{{ apiUrl }}</i>
          </h3>
          <p class="mb-2">
            You can change the URL manually in Settings or just use the tool
            without the API connected
          </p>
          <button
            @click="ignoreApiAndContinue"
            class="py-2 px-4 bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Just use the tool
          </button>
        </div>
      </div>

      <!-- Toolbar -->
      <Toolbar
        v-model:current-tool="currentTool"
        v-model:brush-size="brushSize"
        v-model:brightness="globalBrightness"
        v-model:is-animation-mode-on="isAnimationModeOn"
        :grid-width="gridWidth"
        :grid-height="gridHeight"
        :wled-json="wledJson"
        @undo="undo"
        @clear="clearScreen"
        @update:brushSize="handleBrushSizeChange"
      >
        <!-- Save to device as GIF (uses WLED Image effect for smooth on/off).
             Uses displayPixelData (flipped) for the single-canvas path and
             displayFrames (each frame flipped) for the animated path. With
             animation mode off, displayFrames is empty so SaveToDevice falls
             back to the today single-frame behavior. -->
        <SaveToDevice
          :api-url="apiUrl"
          :pixel-data="displayPixelData"
          :frames="displayFrames"
          :delay-hundredths="delayHundredths"
          :grid-width="gridWidth"
          :grid-height="gridHeight"
          :disabled="!apiUrl || loading || error"
        />

        <!-- Settings Section -->
        <Settings
          v-model:api-url="apiUrl"
          v-model:grid-width="gridWidth"
          v-model:grid-height="gridHeight"
          v-model:flip-horizontal="flipHorizontal"
          v-model:flip-vertical="flipVertical"
          v-model:debounce-delay="debounceDelay"
          :wled-json="wledJson"
          @update:apiUrl="isSettingsOpen = false"
        />
      </Toolbar>

      <!-- Drawing Canvas - Main interactive component -->
      <DrawingCanvas
        v-if="!loading"
        v-model="pixelData"
        :grid-width="gridWidth"
        :grid-height="gridHeight"
        :cell-size="cellSize"
        :current-color="currentColor"
        :current-tool="currentTool"
        :brush-size="brushSize"
        @update-pixel="handleUpdatePixel"
        @batch-update-pixels="handleBatchUpdatePixels"
        @drawing-update="handleDrawingUpdate"
        @draw-complete="handleDrawComplete"
      />

      <!-- Frame timeline — only shown while animation mode is on -->
      <FrameTimeline
        v-if="!loading && isAnimationModeOn"
        :frames="frames"
        :active-index="activeFrameIndex"
        :fps="fps"
        :playback-speed="playbackSpeed"
        :tween-count="tweenCount"
        :loop-stitch="loopStitch"
        :grid-width="gridWidth"
        :grid-height="gridHeight"
        :can-play="!!apiUrl && !error"
        :is-busy="gif.busy.value"
        @add="addFrame()"
        @select="(i) => setActiveFrame(i)"
        @duplicate="(i) => duplicateFrame(i)"
        @delete="(i) => deleteFrame(i)"
        @move="(from, to) => moveFrame(from, to)"
        @update:fps="(v) => (fps = v)"
        @update:playback-speed="onSpeedChange"
        @update:tween-count="(v) => (tweenCount = v)"
        @update:loop-stitch="(v) => (loopStitch = v)"
        @clear-frames="clearFrames"
        @play="playFromTimeline"
      />

      <!-- Surface play/encode failures so the user isn't left wondering why
           Play did nothing. Most commonly fires when the GIF quantizer runs
           out of palette room (rare now that quantization adapts) or the
           device upload/play HTTP call fails. -->
      <div
        v-if="!loading && isAnimationModeOn && gif.lastError.value"
        class="mt-2 px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-start justify-between gap-3"
      >
        <span>{{ gif.lastError.value }}</span>
        <button
          type="button"
          @click="gif.lastError.value = ''"
          class="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200 text-xs font-medium shrink-0"
          aria-label="Dismiss error"
        >
          Dismiss
        </button>
      </div>
    </main>
  </div>
</template>
