<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { ColorSwatchPickerRoot, ColorSwatchPickerItem } from "reka-ui";
import { ChevronDown, Plus, X, Check } from "lucide-vue-next";
import ColorPickerPanel from "./ColorPickerPanel.vue";

interface ColorPickerProps {
  modelValue: string;
  expanded?: boolean;
}

const props = withDefaults(defineProps<ColorPickerProps>(), {
  modelValue: "#ff2500",
  expanded: true,
});

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "update:expanded", value: boolean): void;
}>();

const PALETTE_SIZE = 10;
const STORAGE_KEY = "userPalette";

// We forward through ColorPickerPanel which handles its own internal alpha
// state — currentColor is always the 6-digit pre-multiplied hex.
const currentColor = ref(props.modelValue.toLowerCase());

const palette = ref<string[]>([]);
const isExpanded = ref(props.expanded);
const showPalette = ref(true);

watch(
  () => props.modelValue,
  (v) => {
    if (v.toLowerCase() !== currentColor.value.toLowerCase()) {
      currentColor.value = v.toLowerCase();
    }
  }
);

watch(currentColor, (v) => {
  emit("update:modelValue", v);
});

watch(
  palette,
  (p) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch (e) {
      console.warn("Failed to save palette:", e);
    }
  },
  { deep: true }
);

function addCurrentToPalette(): void {
  if (palette.value.length >= PALETTE_SIZE) return;
  const c = currentColor.value.toLowerCase();
  if (palette.value.includes(c)) return;
  palette.value.push(c);
}

function removeFromPalette(index: number): void {
  palette.value.splice(index, 1);
}

// Reka's ColorSwatchPickerRoot is uncontrolled; we react to clicks via
// @update:model-value rather than v-model. See comment on the template.
function onPaletteSelect(value: unknown): void {
  const v =
    typeof value === "string" ? value : Array.isArray(value) ? value[0] : null;
  if (typeof v === "string") currentColor.value = v.toLowerCase();
}

function toggleExpanded(): void {
  isExpanded.value = !isExpanded.value;
  emit("update:expanded", isExpanded.value);
}

onMounted(() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        palette.value = parsed
          .filter((x): x is string => typeof x === "string")
          .map((c) => c.toLowerCase())
          .slice(0, PALETTE_SIZE);
      }
    }
  } catch (e) {
    console.warn("Failed to load palette:", e);
  }
});

watch(
  () => props.expanded,
  (v) => {
    isExpanded.value = v;
  }
);
</script>

<template>
  <div
    class="w-full bg-gray-50 dark:bg-dark-accent rounded-xl overflow-hidden shadow-md transition-colors duration-200 flex-shrink-0"
  >
    <!-- Header -->
    <div
      class="flex justify-between items-center px-4 py-3 cursor-pointer select-none transition-colors duration-200"
      @click="toggleExpanded"
    >
      <h3 class="m-0 text-base font-medium text-gray-700 dark:text-dark-text">
        Color Picker
      </h3>
      <div class="flex items-center">
        <div
          class="w-6 h-6 rounded-md mr-2 border border-gray-300 dark:border-gray-600"
          :style="{ backgroundColor: currentColor }"
        ></div>
        <ChevronDown
          class="w-5 h-5 transition-transform duration-200"
          :class="{ 'rotate-180': isExpanded }"
        />
      </div>
    </div>

    <!-- Collapsible content -->
    <div v-show="isExpanded" class="transition-all duration-300">
      <!-- Picker panel — area + hue + alpha + hex/% inputs -->
      <div
        class="p-4 bg-white dark:bg-dark-secondary transition-colors duration-200"
      >
        <ColorPickerPanel v-model="currentColor" />
      </div>

      <!-- User palette -->
      <div
        class="border-t border-gray-200 dark:border-gray-700 transition-colors duration-200"
      >
        <div
          class="flex justify-between items-center px-4 py-3 cursor-pointer select-none"
          @click="showPalette = !showPalette"
        >
          <h3
            class="m-0 text-base font-medium text-gray-700 dark:text-dark-text transition-colors duration-200"
          >
            Palette
          </h3>
          <ChevronDown
            class="w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform duration-200"
            :class="{ 'rotate-180': showPalette }"
          />
        </div>

        <!-- Conditional `hidden` class instead of v-show: ColorSwatchPickerRoot
             renders through a PrimitiveSlot, which is a multi-wrapper Reka
             pattern that doesn't have a single DOM element for Vue to pin
             v-show's inline `display: none` onto.
             Uncontrolled (no v-model): Reka's internal Listbox runs
             scrollIntoView on every modelValue change from a non-user source,
             which would yank the scroll back to the first swatch every time
             the user drags the color area. We listen to @update:modelValue
             for clicks instead and render the active-swatch indicator
             ourselves via v-if. -->
        <ColorSwatchPickerRoot
          as="div"
          @update:model-value="onPaletteSelect"
          class="palette-scroll flex gap-2 px-4 pt-2 pb-4 overflow-x-auto"
          :class="{ hidden: !showPalette }"
        >
          <ColorSwatchPickerItem
            v-for="(slotColor, index) in palette"
            :key="`swatch-${slotColor}-${index}`"
            :value="slotColor"
            class="w-9 h-9 shrink-0 rounded-md cursor-pointer shadow-sm relative group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            :style="{ backgroundColor: slotColor }"
            :title="slotColor.toUpperCase()"
          >
            <span
              v-if="slotColor === currentColor"
              class="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <Check class="w-4 h-4 text-white drop-shadow" />
            </span>
            <button
              type="button"
              class="absolute -top-1.5 -right-1.5 w-4 h-4 bg-gray-800/90 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center justify-center focus:outline-none focus:ring-1 focus:ring-blue-500"
              @click.stop="removeFromPalette(index)"
              aria-label="Remove color from palette"
            >
              <X class="w-2.5 h-2.5" />
            </button>
          </ColorSwatchPickerItem>

          <button
            v-if="palette.length < PALETTE_SIZE"
            type="button"
            class="w-9 h-9 shrink-0 rounded-md border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-blue-500 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            @click="addCurrentToPalette"
            :title="`Save ${currentColor.toUpperCase()} to palette`"
            aria-label="Save current color to palette"
          >
            <Plus class="w-4 h-4" />
          </button>
        </ColorSwatchPickerRoot>
      </div>
    </div>
  </div>
</template>

<style scoped>
.palette-scroll {
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
}
.palette-scroll::-webkit-scrollbar {
  height: 6px;
}
.palette-scroll::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}
.palette-scroll::-webkit-scrollbar-track {
  background: transparent;
}
:global(.dark) .palette-scroll {
  scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
}
:global(.dark) .palette-scroll::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.15);
}
</style>
