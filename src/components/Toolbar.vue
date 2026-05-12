<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import {
  Undo2,
  Trash2,
  PenLine,
  Eraser,
  Brush,
  Copy,
  Check,
  Sun,
} from "lucide-vue-next";
import RangeSlider from "./RangeSlider.vue";

// Define toolbar props
interface ToolbarProps {
  currentTool?: string;
  gridWidth: number;
  gridHeight: number;
  brushSize?: number;
  brightness?: number;
  wledJson?: string; // Add JSON prop
}

// Define props with defaults
const props = withDefaults(defineProps<ToolbarProps>(), {
  currentTool: "pen",
  brushSize: 1,
  brightness: 230,
  wledJson: "", // Default for wledJson
});

// Define emits
const emit = defineEmits<{
  "update:currentTool": [tool: string];
  "update:brushSize": [size: number];
  "update:brightness": [value: number];
  undo: [];
  clear: [];
}>();

// Local state
const tools = [
  { id: "pen", icon: PenLine, tooltip: "Pen Tool (P)" },
  { id: "eraser", icon: Eraser, tooltip: "Eraser (E)" },
  { id: "brush", icon: Brush, tooltip: "Brush Size" },
];

// Local refs
const selectedTool = ref(props.currentTool);
const brushSize = ref(props.brushSize);
const copied = ref(false); // For copy JSON functionality

// Watch for prop changes
watch(
  () => props.currentTool,
  (newTool) => {
    selectedTool.value = newTool;
  }
);

watch(
  () => props.brushSize,
  (newSize) => {
    brushSize.value = newSize;
  }
);

// Change the current tool
function changeTool(toolId: string) {
  selectedTool.value = toolId;
  emit("update:currentTool", toolId);
}

// Update brush size
function updateBrushSize(newSize: number) {
  brushSize.value = newSize;
  emit("update:brushSize", newSize);
}

// Next brush size (cycles through 1-3)
function cycleBrushSize() {
  const nextSize = (brushSize.value % 2) + 1;
  updateBrushSize(nextSize);
}

// JSON preset copy functionality
function copyJsonPreset() {
  if (!props.wledJson) return;

  if (navigator.clipboard && window.isSecureContext) {
    // Modern approach with clipboard API (secure contexts)
    navigator.clipboard
      .writeText(props.wledJson)
      .then(() => {
        copied.value = true;
        setTimeout(() => (copied.value = false), 2000);
      })
      .catch((err) => {
        console.error("Failed to copy text: ", err);
      });
  } else {
    // Fallback for older browsers or non-secure contexts
    const textarea = document.createElement("textarea");
    textarea.value = props.wledJson;
    textarea.setAttribute("aria-hidden", "true");
    document.body.appendChild(textarea);
    textarea.select();

    try {
      document.execCommand("copy");
      copied.value = true;
      setTimeout(() => (copied.value = false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

// Handle keyboard shortcuts
function handleKeyDown(event: KeyboardEvent) {
  // Only process if no modifier keys are pressed and not in an input
  if (
    (event.target as HTMLElement).tagName === "INPUT" ||
    (event.target as HTMLElement).tagName === "TEXTAREA"
  ) {
    return;
  }

  // Shortcuts without modifiers
  if (!event.ctrlKey && !event.metaKey && !event.altKey) {
    switch (event.key.toLowerCase()) {
      case "p":
        changeTool("pen");
        break;
      case "e":
        changeTool("eraser");
        break;
      case "b":
        changeTool("brush");
        break;
      case "[":
        if (brushSize.value > 1) updateBrushSize(brushSize.value - 1);
        break;
      case "]":
        if (brushSize.value < 2) updateBrushSize(brushSize.value + 1);
        break;
    }
  }

  // Shortcuts with modifiers
  if (event.ctrlKey || event.metaKey) {
    switch (event.key.toLowerCase()) {
      case "z":
        emit("undo");
        event.preventDefault();
        break;
    }
  }

  if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
    switch (event.key.toLowerCase()) {
      case "c":
        emit("clear");
        event.preventDefault();
        break;
    }
  }
}

// Attach and remove event listeners
onMounted(() => {
  window.addEventListener("keydown", handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeyDown);
});
</script>

<template>
  <div
    class="flex items-center p-2 bg-gray-100 dark:bg-gray-800 rounded-lg shadow-md mb-3 select-none"
  >
    <!-- Drawing tools -->
    <div class="flex gap-1 mr-2">
      <button
        v-for="tool in tools"
        :key="tool.id"
        @click="tool.id === 'brush' ? cycleBrushSize() : changeTool(tool.id)"
        :class="{
          'bg-blue-500 text-white':
            selectedTool === tool.id || (tool.id === 'brush' && brushSize > 1),
          'bg-white text-gray-700 dark:bg-gray-700 dark:text-gray-200':
            selectedTool !== tool.id && !(tool.id === 'brush' && brushSize > 1),
        }"
        class="p-2 rounded-md transition-all duration-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400 relative group"
        :title="tool.tooltip + (tool.id === 'brush' ? ` (${brushSize})` : '')"
      >
        <component :is="tool.icon" class="w-5 h-5" />

        <!-- Brush size indicator -->
        <span
          v-if="tool.id === 'brush'"
          class="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full size-4 flex items-center justify-center"
        >
          {{ brushSize }}
        </span>

        <!-- Shortcut tooltip -->
        <span
          class="absolute left-1/2 -bottom-8 transform -translate-x-1/2 bg-gray-800 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10"
        >
          {{
            tool.id === "pen"
              ? "Pen (P)"
              : tool.id === "eraser"
              ? "Eraser (E)"
              : tool.id === "brush"
              ? "Brush Size (B, [ ])"
              : ""
          }}
        </span>
      </button>
    </div>

    <!-- Separator -->
    <div class="h-8 w-px bg-gray-300 dark:bg-gray-600 mx-2"></div>

    <!-- History actions -->
    <div class="flex gap-1 mx-2">
      <button
        @click="emit('undo')"
        class="p-2 bg-white text-gray-700 dark:bg-gray-700 dark:text-gray-200 rounded-md transition-all duration-200 hover:bg-gray-200 dark:hover:bg-gray-600 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400 relative group"
        title="Undo"
      >
        <Undo2 class="w-5 h-5" />

        <!-- Shortcut tooltip -->
        <span
          class="absolute left-1/2 -bottom-8 transform -translate-x-1/2 bg-gray-800 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10"
        >
          Undo (Ctrl+Z)
        </span>
      </button>
      <button
        @click="emit('clear')"
        class="p-2 bg-white text-gray-700 dark:bg-gray-700 dark:text-gray-200 rounded-md transition-all duration-200 hover:bg-gray-200 dark:hover:bg-gray-600 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400 relative group"
        title="Clear Canvas"
      >
        <Trash2 class="w-5 h-5" />

        <!-- Shortcut tooltip -->
        <span
          class="absolute left-1/2 -bottom-8 transform -translate-x-1/2 bg-gray-800 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10"
        >
          Clear (Ctrl+Shift+C)
        </span>
      </button>
    </div>

    <!-- Separator -->
    <div class="h-8 w-px bg-gray-300 dark:bg-gray-600 mx-2"></div>

    <!-- Canvas size indicator -->
    <div class="text-sm text-gray-600 dark:text-gray-400 mr-4 font-mono ml-2">
      {{ gridWidth }}×{{ gridHeight }}
    </div>

    <!-- Separator -->
    <div class="h-8 w-px bg-gray-300 dark:bg-gray-600 mx-2"></div>

    <!-- Global brightness — Reka Slider so it matches the picker's sliders.
         The Range fill uses a low-opacity blue so the "filled" portion is
         visible but doesn't compete with the color picker. Thumb design
         mirrors the color sliders' (white border + black/40 ring). -->
    <div class="flex items-center gap-2 mx-2 group relative shrink-0">
      <Sun class="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" />
      <RangeSlider
        :model-value="brightness"
        @update:model-value="(v) => emit('update:brightness', v)"
        :min="1"
        :max="255"
        aria-label="Global matrix brightness"
        class="w-24 sm:w-32 shrink-0"
      />
      <span
        class="text-xs font-mono text-gray-600 dark:text-gray-400 tabular-nums w-9 text-right"
        >{{ Math.round((brightness / 255) * 100) }}%</span
      >
      <span
        class="absolute left-1/2 -bottom-8 transform -translate-x-1/2 bg-gray-800 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10"
      >
        Global brightness
      </span>
    </div>

    <!-- Spacer -->
    <div class="flex-grow"></div>

    <!-- Settings button -->
    <div class="flex gap-2">
      <!-- JSON Preset Button (New) -->
      <button
        v-if="wledJson"
        @click="copyJsonPreset"
        class="p-2 bg-white text-gray-700 dark:bg-gray-700 dark:text-gray-200 rounded-md transition-all duration-200 hover:bg-gray-200 dark:hover:bg-gray-600 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400 relative group"
        title="Copy JSON Preset"
      >
        <Copy v-if="!copied" class="w-5 h-5" />
        <Check v-else class="w-5 h-5" />

        <!-- Tooltip -->
        <span
          class="absolute left-1/2 -bottom-8 transform -translate-x-1/2 bg-gray-800 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10"
        >
          {{ copied ? "Copied!" : "Copy JSON Preset" }}
        </span>
      </button>
      <slot> </slot>
    </div>
  </div>
</template>

