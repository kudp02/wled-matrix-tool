<script setup lang="ts">
import { ref, computed, watch } from "vue";
import {
  ColorAreaRoot,
  ColorAreaArea,
  ColorAreaThumb,
  ColorSliderRoot,
  ColorSliderTrack,
  ColorSliderThumb,
} from "reka-ui";

interface Props {
  modelValue: string;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: "#ff2500",
});

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

// Internal source of truth, fed to all Reka components via v-model. May be
// 6-digit (#RRGGBB) when alpha=100% or 8-digit (#RRGGBBAA) when alpha<100% —
// Reka emits the shorter form whenever it can, so both shapes show up.
const localColor = ref(props.modelValue.toLowerCase());

function parseHex(hex: string): { r: number; g: number; b: number; a: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
  };
}

// Alpha is pre-multiplied into the RGB so consumers stay in 6-digit hex land.
const emittedColor = computed(() => {
  const { r, g, b, a } = parseHex(localColor.value);
  const c = (n: number) =>
    Math.round(n * a)
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toLowerCase();
});

const rgbHex = computed(() => localColor.value.slice(0, 7).toUpperCase());

const alphaPct = computed(() => {
  const h = localColor.value.replace("#", "");
  if (h.length < 8) return 100;
  return Math.round((parseInt(h.slice(6, 8), 16) / 255) * 100);
});

const hexInput = ref(rgbHex.value);
const alphaInput = ref(String(alphaPct.value));

watch(rgbHex, (v) => {
  hexInput.value = v;
});
watch(alphaPct, (v) => {
  alphaInput.value = String(v);
});

watch(
  () => props.modelValue,
  (v) => {
    if (v.toLowerCase() !== emittedColor.value.toLowerCase()) {
      localColor.value = v.toLowerCase();
    }
  }
);

watch(emittedColor, (v) => {
  emit("update:modelValue", v);
});

function handleHexInput(): void {
  const v = hexInput.value.trim();
  if (/^#?[0-9A-Fa-f]{6}$/.test(v)) {
    const rgb = (v.startsWith("#") ? v : "#" + v).toLowerCase();
    const h = localColor.value.replace("#", "");
    const alphaTail = h.length === 8 ? h.slice(6, 8) : "";
    localColor.value = rgb + alphaTail;
  } else {
    hexInput.value = rgbHex.value;
  }
}

function handleAlphaInput(): void {
  const n = parseInt(alphaInput.value, 10);
  if (!isNaN(n) && n >= 0 && n <= 100) {
    const rgb = localColor.value.slice(0, 7).toLowerCase();
    if (n >= 100) {
      localColor.value = rgb;
    } else {
      const a = Math.round((n / 100) * 255)
        .toString(16)
        .padStart(2, "0");
      localColor.value = rgb + a;
    }
  } else {
    alphaInput.value = String(alphaPct.value);
  }
}
</script>

<template>
  <div class="space-y-3">
    <!-- 2D saturation/brightness area -->
    <ColorAreaRoot
      v-model="localColor"
      color-space="hsb"
      x-channel="saturation"
      y-channel="brightness"
    >
      <template #default="{ style }">
        <ColorAreaArea
          :style="style"
          class="relative w-full aspect-[4/3] rounded-lg overflow-hidden cursor-crosshair border border-gray-200 dark:border-gray-700 select-none"
        >
          <ColorAreaThumb
            class="block w-4 h-4 rounded-full border-[3px] border-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          />
        </ColorAreaArea>
      </template>
    </ColorAreaRoot>

    <!-- Hue strip — Reka's Root/Track default to <span>, so force block
         elements so width/height classes actually take effect. -->
    <ColorSliderRoot
      as="div"
      v-model="localColor"
      color-space="hsb"
      channel="hue"
      orientation="horizontal"
    >
      <ColorSliderTrack
        as="div"
        class="relative h-4 w-full rounded-full overflow-hidden cursor-pointer"
      >
        <ColorSliderThumb
          class="block w-4 h-4 rounded-full border-[3px] border-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        />
      </ColorSliderTrack>
    </ColorSliderRoot>

    <!-- Per-pixel brightness (alpha). Pre-multiplies into RGB on emit. -->
    <ColorSliderRoot
      as="div"
      v-model="localColor"
      color-space="hsb"
      channel="alpha"
      orientation="horizontal"
    >
      <ColorSliderTrack
        as="div"
        class="alpha-track relative h-4 w-full rounded-full overflow-hidden cursor-pointer"
      >
        <ColorSliderThumb
          class="block w-4 h-4 rounded-full border-[3px] border-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        />
      </ColorSliderTrack>
    </ColorSliderRoot>

    <!-- Swatch + Hex input + Alpha % -->
    <div class="flex gap-2 items-center pt-1">
      <div
        class="w-10 h-10 rounded-md border border-gray-200 dark:border-gray-700 shrink-0"
        :style="{ backgroundColor: emittedColor }"
      ></div>
      <input
        type="text"
        v-model="hexInput"
        @change="handleHexInput"
        @keydown.enter="handleHexInput"
        maxlength="7"
        placeholder="#RRGGBB"
        class="flex-1 min-w-0 h-10 px-3 py-2 border border-gray-200 dark:border-gray-600 dark:bg-dark-accent dark:text-dark-text rounded-lg font-mono uppercase text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors duration-200"
      />
      <div class="relative shrink-0">
        <input
          type="text"
          inputmode="numeric"
          v-model="alphaInput"
          @change="handleAlphaInput"
          @keydown.enter="handleAlphaInput"
          maxlength="3"
          class="w-14 h-10 pl-2 pr-5 py-2 border border-gray-200 dark:border-gray-600 dark:bg-dark-accent dark:text-dark-text rounded-lg font-mono text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors duration-200"
          aria-label="Brightness percent"
        />
        <span
          class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400 pointer-events-none"
          >%</span
        >
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Checkerboard under the alpha track so 0% looks transparent, 100% looks
   solid color. The slider track's own gradient (rgba(c,0) → rgba(c,1)) is
   painted on top of this by Reka. */
.alpha-track {
  background-color: #fff;
  background-image: linear-gradient(
      45deg,
      #ccc 25%,
      transparent 25%,
      transparent 75%,
      #ccc 75%,
      #ccc
    ),
    linear-gradient(
      45deg,
      #ccc 25%,
      transparent 25%,
      transparent 75%,
      #ccc 75%,
      #ccc
    );
  background-size: 8px 8px;
  background-position: 0 0, 4px 4px;
}
:global(.dark) .alpha-track {
  background-color: #1f2937;
  background-image: linear-gradient(
      45deg,
      #4b5563 25%,
      transparent 25%,
      transparent 75%,
      #4b5563 75%,
      #4b5563
    ),
    linear-gradient(
      45deg,
      #4b5563 25%,
      transparent 25%,
      transparent 75%,
      #4b5563 75%,
      #4b5563
    );
}
</style>
