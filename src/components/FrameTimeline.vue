<script setup lang="ts">
import { computed, ref } from "vue";
import FrameThumbnail from "./FrameThumbnail.vue";
import RangeSlider from "./RangeSlider.vue";
import { Plus, Play, Trash2, Repeat } from "lucide-vue-next";
import type { Frame } from "../composables/useFrames";

interface Props {
  frames: Frame[];
  activeIndex: number;
  fps: number;
  playbackSpeed: number;
  tweenCount: number;
  loopStitch: boolean;
  gridWidth: number;
  gridHeight: number;
  canPlay?: boolean;
  isBusy?: boolean;
}
const props = withDefaults(defineProps<Props>(), {
  canPlay: true,
  isBusy: false,
});

const emit = defineEmits<{
  add: [];
  select: [index: number];
  duplicate: [index: number];
  delete: [index: number];
  move: [from: number, to: number];
  "update:fps": [value: number];
  "update:playbackSpeed": [value: number];
  "update:tweenCount": [value: number];
  "update:loopStitch": [value: boolean];
  "clear-frames": [];
  play: [];
}>();

function onMove(index: number, delta: number): void {
  emit("move", index, index + delta);
}

// Drag-reorder state. We track by frame ID, not index, because the index
// shifts every time we move the dragged frame to a new slot — the ID is
// the only stable handle to "this is still the thing the user is dragging."
const draggingId = ref<string | null>(null);

function onThumbDragStart(index: number): void {
  const f = props.frames[index];
  if (!f) return;
  draggingId.value = f.id;
}

function onThumbDragOver(targetIndex: number): void {
  if (!draggingId.value) return;
  const fromIndex = props.frames.findIndex((f) => f.id === draggingId.value);
  if (fromIndex < 0 || fromIndex === targetIndex) return;
  // Live shuffle: the dragged frame steps onto the hovered slot's index,
  // pushing whoever was there into the now-vacated source slot.
  emit("move", fromIndex, targetIndex);
}

function onThumbDragEnd(): void {
  draggingId.value = null;
}

// Total frame count after interpolation — mirrors the math in
// useFrames.expandFrames so the header preview matches what gets uploaded.
const expandedCount = computed(() => {
  const k = props.frames.length;
  if (k <= 1) return k;
  const n = Math.max(0, Math.min(500, Math.round(props.tweenCount)));
  const gaps = k - 1 + (props.loopStitch ? 1 : 0);
  return k + gaps * n;
});

function onTweenCountInput(e: Event): void {
  const raw = Number((e.target as HTMLInputElement).value);
  if (!Number.isFinite(raw)) return;
  const clamped = Math.max(0, Math.min(500, Math.round(raw)));
  emit("update:tweenCount", clamped);
}

function onClearFrames(): void {
  if (typeof window !== "undefined" && window.confirm) {
    if (!window.confirm("Delete all frames? This can't be undone.")) return;
  }
  emit("clear-frames");
}
</script>

<template>
  <div
    class="w-full bg-gray-50 dark:bg-dark-accent rounded-xl shadow-md overflow-hidden mt-3 flex-shrink-0"
  >
    <!-- Header: title/count + Play on the left, FPS + Speed on the right.
         Play button uploads a temp _preview.gif and switches the segment to
         fx:53; Speed slider feeds the segment's sx for live tweaks. -->
    <div
      class="flex items-center px-4 py-2 gap-3 border-b border-gray-200 dark:border-gray-700 flex-wrap"
    >
      <h3
        class="text-sm font-medium text-gray-700 dark:text-dark-text whitespace-nowrap"
      >
        Frames
        <span
          class="text-gray-500 dark:text-gray-400 font-mono"
          :title="
            expandedCount > frames.length
              ? `${frames.length} key${frames.length === 1 ? '' : 's'} → ${expandedCount} frame${expandedCount === 1 ? '' : 's'} after interpolation`
              : undefined
          "
        >
          <template v-if="expandedCount > frames.length"
            >({{ frames.length }} → {{ expandedCount }})</template
          >
          <template v-else>({{ frames.length }})</template>
        </span>
      </h3>
      <button
        type="button"
        @click="onClearFrames"
        :disabled="frames.length === 0"
        class="inline-flex items-center justify-center p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Delete all frames"
        aria-label="Delete all frames"
      >
        <Trash2 class="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        @click="emit('play')"
        :disabled="frames.length === 0 || !canPlay || isBusy"
        class="inline-flex items-center gap-1.5 px-3 py-1 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        :title="
          frames.length === 0
            ? 'Add at least one frame'
            : !canPlay
              ? 'Connect to a WLED device first'
              : 'Encode + upload as _preview.gif and play on device'
        "
      >
        <Play class="w-3.5 h-3.5" />
        Play
      </button>
      <!-- Speed sits next to Play (both are playback controls). Raw sx value
           0..255 — that's the value WLED's segment expects, no conversion. -->
      <div class="flex items-center gap-2 shrink-0 w-56">
        <span class="text-xs text-gray-500 dark:text-gray-400">Speed</span>
        <RangeSlider
          :model-value="playbackSpeed"
          @update:model-value="(v) => emit('update:playbackSpeed', v)"
          :min="0"
          :max="255"
          aria-label="Playback speed (WLED segment sx)"
          class="w-48"
        />
        <span
          class="text-xs font-mono text-gray-600 dark:text-gray-400 tabular-nums w-8 text-right"
          >{{ playbackSpeed }}</span
        >
      </div>
      <div class="flex-1" />
      <!-- Tween controls: count input + Loop toggle. Edit only your key
           frames — interpolated in-betweens are generated automatically at
           Play / Save time, so adjusting a key reshapes the animation with
           no manual re-tween step. -->
      <div class="flex items-center gap-2 shrink-0">
        <label
          class="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap"
          for="tween-count-input"
          title="In-between frames generated per gap at export. 0 disables interpolation."
          >Tween</label
        >
        <input
          id="tween-count-input"
          type="number"
          min="0"
          max="500"
          :value="tweenCount"
          @input="onTweenCountInput"
          class="w-16 px-1.5 py-1 text-xs font-mono text-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Interpolated frames generated per gap at export"
        />
        <button
          type="button"
          @click="emit('update:loopStitch', !loopStitch)"
          :disabled="frames.length < 2 || tweenCount === 0"
          :class="[
            'inline-flex items-center justify-center p-1.5 rounded-md border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed',
            loopStitch
              ? 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600'
              : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600',
          ]"
          :title="
            frames.length < 2
              ? 'Need at least 2 frames to loop'
              : tweenCount === 0
                ? 'Increase Tween to enable loop interpolation'
                : loopStitch
                  ? 'Loop interpolation ON — wraps last key → first key at export'
                  : 'Loop interpolation OFF — animation snaps from last key back to first'
          "
          :aria-pressed="loopStitch"
          aria-label="Toggle loop interpolation"
        >
          <Repeat class="w-3.5 h-3.5" />
        </button>
      </div>
      <!-- FPS controls how the GIF is encoded; lives away from Play to make
           it visually clear it's a different concept (encode-time, not live). -->
      <div class="flex items-center gap-2 shrink-0 w-56">
        <span class="text-xs text-gray-500 dark:text-gray-400">FPS</span>
        <RangeSlider
          :model-value="fps"
          @update:model-value="(v) => emit('update:fps', v)"
          :min="1"
          :max="30"
          aria-label="Frames per second"
        />
        <span
          class="text-xs font-mono text-gray-600 dark:text-gray-400 tabular-nums w-6 text-right"
          >{{ fps }}</span
        >
      </div>
    </div>

    <!-- Key-frame strip. Tweens are derived at export, not stored here, so
         each thumbnail is one key the user can edit. -->
    <div class="frame-scroll flex items-center gap-2 px-4 py-3 overflow-x-auto">
      <FrameThumbnail
        v-for="(frame, index) in frames"
        :key="frame.id"
        :pixel-data="frame.pixelData"
        :grid-width="gridWidth"
        :grid-height="gridHeight"
        :is-active="index === activeIndex"
        :index="index"
        :total="frames.length"
        :is-dragging="draggingId === frame.id"
        @select="emit('select', index)"
        @duplicate="emit('duplicate', index)"
        @delete="emit('delete', index)"
        @move="(delta) => onMove(index, delta)"
        @drag-start="onThumbDragStart"
        @drag-over="onThumbDragOver"
        @drag-end="onThumbDragEnd"
      />
      <button
        type="button"
        @click="emit('add')"
        class="w-12 h-12 shrink-0 rounded-md border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-blue-500 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        title="Add frame from current canvas"
        aria-label="Add new frame"
      >
        <Plus class="w-5 h-5" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.frame-scroll {
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
}
.frame-scroll::-webkit-scrollbar {
  height: 6px;
}
.frame-scroll::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}
.frame-scroll::-webkit-scrollbar-track {
  background: transparent;
}
:global(.dark) .frame-scroll {
  scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
}
:global(.dark) .frame-scroll::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.15);
}
</style>
