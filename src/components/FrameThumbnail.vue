<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import {
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuPortal,
  ContextMenuContent,
  ContextMenuItem,
} from "reka-ui";

interface Props {
  pixelData: string[];
  gridWidth: number;
  gridHeight: number;
  isActive: boolean;
  index: number;
  total: number;
  isDragging?: boolean;
}

const props = withDefaults(defineProps<Props>(), { isDragging: false });

const emit = defineEmits<{
  select: [];
  duplicate: [];
  delete: [];
  move: [delta: number];
  "drag-start": [index: number];
  "drag-over": [index: number];
  "drag-end": [];
}>();

// Custom MIME type so we don't react to arbitrary text/file drags from
// outside the app (e.g. dragging a URL into the timeline). The actual
// reorder state lives in FrameTimeline so the array can shift in real time
// while the user is still holding the mouse button.
const DRAG_MIME = "application/x-wled-frame-index";

function onDragStart(e: DragEvent): void {
  if (!e.dataTransfer) return;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData(DRAG_MIME, String(props.index));
  // Some browsers refuse the drag if no text/plain payload exists.
  e.dataTransfer.setData("text/plain", String(props.index));
  emit("drag-start", props.index);
}

function onDragOver(e: DragEvent): void {
  if (!e.dataTransfer) return;
  if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  emit("drag-over", props.index);
}

function onDrop(e: DragEvent): void {
  // The actual reordering already happened during dragover; just suppress
  // the browser's default drop handling.
  if (e.dataTransfer?.types.includes(DRAG_MIME)) {
    e.preventDefault();
  }
}

function onDragEnd(): void {
  emit("drag-end");
}

const canvas = ref<HTMLCanvasElement | null>(null);

// Renders the frame's pixelData into a native-sized canvas; CSS upscales it
// with pixelated rendering, so the visual is a crisp miniature.
function render(): void {
  if (!canvas.value) return;
  const ctx = canvas.value.getContext("2d");
  if (!ctx) return;
  const w = props.gridWidth;
  const h = props.gridHeight;
  ctx.clearRect(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      ctx.fillStyle = props.pixelData[y * w + x] || "#000000";
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

watch(() => props.pixelData, render, { deep: true });
watch(
  () => [props.gridWidth, props.gridHeight],
  () => render()
);
onMounted(render);
</script>

<template>
  <ContextMenuRoot>
    <ContextMenuTrigger as-child>
      <button
        type="button"
        @click="emit('select')"
        draggable="true"
        @dragstart="onDragStart"
        @dragover="onDragOver"
        @drop="onDrop"
        @dragend="onDragEnd"
        class="w-12 h-12 shrink-0 rounded-md overflow-hidden bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 focus:outline-none transition-all cursor-grab active:cursor-grabbing"
        :class="{
          'ring-2 ring-blue-500 ring-offset-1 ring-offset-gray-50 dark:ring-offset-dark-accent':
            isActive,
          'opacity-40': isDragging,
        }"
        :aria-label="`Frame ${index + 1}${isActive ? ' (active)' : ''}`"
        :title="`Frame ${index + 1}`"
      >
        <canvas
          ref="canvas"
          :width="gridWidth"
          :height="gridHeight"
          class="block w-full h-full pixelated pointer-events-none"
        />
      </button>
    </ContextMenuTrigger>
    <ContextMenuPortal>
      <ContextMenuContent
        class="z-50 min-w-[140px] bg-white dark:bg-dark-secondary border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-1 outline-none"
      >
        <ContextMenuItem
          @select="emit('select')"
          class="px-2 py-1.5 text-sm rounded cursor-pointer outline-none data-[highlighted]:bg-blue-500 data-[highlighted]:text-white"
        >
          Edit
        </ContextMenuItem>
        <ContextMenuItem
          @select="emit('duplicate')"
          class="px-2 py-1.5 text-sm rounded cursor-pointer outline-none data-[highlighted]:bg-blue-500 data-[highlighted]:text-white"
        >
          Duplicate
        </ContextMenuItem>
        <ContextMenuItem
          @select="emit('move', -1)"
          :disabled="index === 0"
          class="px-2 py-1.5 text-sm rounded cursor-pointer outline-none data-[highlighted]:bg-blue-500 data-[highlighted]:text-white data-[disabled]:opacity-50 data-[disabled]:cursor-default"
        >
          Move left
        </ContextMenuItem>
        <ContextMenuItem
          @select="emit('move', 1)"
          :disabled="index === total - 1"
          class="px-2 py-1.5 text-sm rounded cursor-pointer outline-none data-[highlighted]:bg-blue-500 data-[highlighted]:text-white data-[disabled]:opacity-50 data-[disabled]:cursor-default"
        >
          Move right
        </ContextMenuItem>
        <ContextMenuItem
          @select="emit('delete')"
          class="px-2 py-1.5 text-sm rounded cursor-pointer outline-none text-red-500 data-[highlighted]:bg-red-500 data-[highlighted]:text-white"
        >
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>

<style scoped>
.pixelated {
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
}
</style>
