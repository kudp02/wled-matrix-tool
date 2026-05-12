<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { Plus, Minus } from "lucide-vue-next";
import {
  PopoverRoot,
  PopoverTrigger,
  PopoverPortal,
  PopoverContent,
  ColorSwatch,
} from "reka-ui";
import RangeSlider from "./RangeSlider.vue";
import ColorPickerPanel from "./ColorPickerPanel.vue";

interface ColorStop {
  color: string;
  position: number;
}

interface GradientGeneratorProps {
  pixelData: string[];
  gridWidth: number;
  gridHeight: number;
  applyPixelArray?: (pixels: string[]) => void; // New prop for the applyPixelArray function
}

const props = defineProps<GradientGeneratorProps>();

const emit = defineEmits<{
  (e: "apply-gradient", value: string[]): void;
}>();

// Gradient state
const expanded = ref(true);
const gradientType = ref<"linear" | "radial" | "elliptical">("linear");
const customAngle = ref(90); // Default angle for linear gradient
const centerX = ref(50); // Center X position (0-100%)
const centerY = ref(50); // Center Y position (0-100%)
const ellipticalRotation = ref(0); // Rotation for elliptical gradients (0-360°)
const scaleValue = ref(100); // Scale percentage (zoom level)
const colorStops = ref<ColorStop[]>([
  { color: "#FF3300", position: 0 },
  { color: "#FFB005", position: 100 },
]);

// Local storage keys
const STORAGE_KEY_PREFIX = "wled_gradient_";
const STORAGE_KEYS = {
  TYPE: `${STORAGE_KEY_PREFIX}type`,
  CUSTOM_ANGLE: `${STORAGE_KEY_PREFIX}custom_angle`,
  CENTER_X: `${STORAGE_KEY_PREFIX}center_x`,
  CENTER_Y: `${STORAGE_KEY_PREFIX}center_y`,
  ELLIPTICAL_ROTATION: `${STORAGE_KEY_PREFIX}elliptical_rotation`,
  SCALE_VALUE: `${STORAGE_KEY_PREFIX}scale_value`,
  OFFSET_X: `${STORAGE_KEY_PREFIX}offset_x`,
  OFFSET_Y: `${STORAGE_KEY_PREFIX}offset_y`,
  COLOR_STOPS: `${STORAGE_KEY_PREFIX}color_stops`,
  EXPANDED: `${STORAGE_KEY_PREFIX}expanded`,
};

// Save settings to local storage
function saveToLocalStorage() {
  try {
    localStorage.setItem(STORAGE_KEYS.TYPE, gradientType.value);
    localStorage.setItem(
      STORAGE_KEYS.CUSTOM_ANGLE,
      customAngle.value.toString()
    );
    localStorage.setItem(STORAGE_KEYS.CENTER_X, centerX.value.toString());
    localStorage.setItem(STORAGE_KEYS.CENTER_Y, centerY.value.toString());
    localStorage.setItem(
      STORAGE_KEYS.ELLIPTICAL_ROTATION,
      ellipticalRotation.value.toString()
    );
    localStorage.setItem(STORAGE_KEYS.SCALE_VALUE, scaleValue.value.toString());
    localStorage.setItem(
      STORAGE_KEYS.COLOR_STOPS,
      JSON.stringify(colorStops.value)
    );
    localStorage.setItem(STORAGE_KEYS.EXPANDED, expanded.value.toString());
  } catch (error) {
    console.error("Failed to save gradient settings to localStorage:", error);
  }
}

// Load settings from local storage
function loadFromLocalStorage() {
  try {
    // Load gradient type
    const savedType = localStorage.getItem(STORAGE_KEYS.TYPE);
    if (
      savedType &&
      (savedType === "linear" ||
        savedType === "radial" ||
        savedType === "elliptical")
    ) {
      gradientType.value = savedType as any;
    }

    // Load custom angle
    const savedAngle = localStorage.getItem(STORAGE_KEYS.CUSTOM_ANGLE);
    if (savedAngle) {
      const angle = parseInt(savedAngle);
      if (!isNaN(angle)) {
        customAngle.value = angle;
      }
    }

    // Load center positions
    const savedCenterX = localStorage.getItem(STORAGE_KEYS.CENTER_X);
    if (savedCenterX) {
      const x = parseInt(savedCenterX);
      if (!isNaN(x)) {
        centerX.value = x;
      }
    }

    const savedCenterY = localStorage.getItem(STORAGE_KEYS.CENTER_Y);
    if (savedCenterY) {
      const y = parseInt(savedCenterY);
      if (!isNaN(y)) {
        centerY.value = y;
      }
    }

    // Load elliptical rotation
    const savedRotation = localStorage.getItem(
      STORAGE_KEYS.ELLIPTICAL_ROTATION
    );
    if (savedRotation) {
      const rotation = parseInt(savedRotation);
      if (!isNaN(rotation)) {
        ellipticalRotation.value = rotation;
      }
    }

    // Load scale value
    const savedScale = localStorage.getItem(STORAGE_KEYS.SCALE_VALUE);
    if (savedScale) {
      const scale = parseInt(savedScale);
      if (!isNaN(scale)) {
        scaleValue.value = scale;
      }
    }

    // Load color stops
    const savedColorStops = localStorage.getItem(STORAGE_KEYS.COLOR_STOPS);
    if (savedColorStops) {
      try {
        const parsedStops = JSON.parse(savedColorStops);
        // Validate the loaded data has expected structure
        if (
          Array.isArray(parsedStops) &&
          parsedStops.length >= 2 &&
          parsedStops.every(
            (stop) =>
              typeof stop.color === "string" &&
              typeof stop.position === "number"
          )
        ) {
          colorStops.value = parsedStops;
        }
      } catch (e) {
        console.error("Error parsing color stops from localStorage:", e);
      }
    }

    // Load expanded state
    const savedExpanded = localStorage.getItem(STORAGE_KEYS.EXPANDED);
    if (savedExpanded) {
      expanded.value = savedExpanded === "true";
    }
  } catch (error) {
    console.error("Failed to load gradient settings from localStorage:", error);
  }
}

// Convert our angle to CSS angle convention
function convertAngleToCss(angle: number): number {
  // Apply the correction formula that works for this implementation
  return (angle + 90 + 360) % 360;
}

// Computed values
const cssGradient = computed(() => {
  const sortedStops = [...colorStops.value].sort(
    (a, b) => a.position - b.position
  );

  const stops = sortedStops
    .map((stop) => `${stop.color} ${stop.position}%`)
    .join(", ");

  if (gradientType.value === "linear") {
    // Convert our angle to CSS angle convention
    const cssAngle = convertAngleToCss(customAngle.value);
    return `linear-gradient(${cssAngle}deg, ${stops})`;
  } else if (gradientType.value === "radial") {
    return `radial-gradient(circle at ${centerX.value}% ${centerY.value}%, ${stops})`;
  } else {
    // elliptical
    return `radial-gradient(ellipse at ${centerX.value}% ${centerY.value}%, ${stops})`;
  }
});

// Memoization cache for color calculations
const colorCache = new Map<string, string>();

function getColorFromCache(key: string, calcFunc: () => string): string {
  if (!colorCache.has(key)) {
    colorCache.set(key, calcFunc());
    // Limit cache size to prevent memory issues
    if (colorCache.size > 5000) {
      // Clear half the cache when it gets too large
      const keysToDelete = Array.from(colorCache.keys()).slice(0, 2500);
      keysToDelete.forEach((k) => colorCache.delete(k));
    }
  }
  return colorCache.get(key)!;
}

// Clear cache when gradient type changes
watch(gradientType, () => {
  colorCache.clear();
});

// Create an optimized version that calculates fewer pixels based on grid size
function calculateOptimizedPixels(width: number, height: number): string[] {
  // For large grids, we'll downsample for calculation and then expand
  let calculationWidth = width;
  let calculationHeight = height;
  let skipFactor = 1;

  // Calculate the scaling and offset factors
  const scaleFactor = scaleValue.value / 100; // Convert percentage to factor (1.0 = 100%)

  // Calculate colors for the optimized grid
  const optimizedPixels: string[] = [];
  for (let y = 0; y < calculationHeight; y++) {
    for (let x = 0; x < calculationWidth; x++) {
      // Translate back to original coordinates
      const originalX = Math.min(x * skipFactor, width - 1);
      const originalY = Math.min(y * skipFactor, height - 1);

      // Apply scaling and offset to coordinates
      // For scaling: center on grid, scale, then restore
      // For offset: simply add the offset amount
      const normalizedX = originalX / (width - 1); // 0-1 range
      const normalizedY = originalY / (height - 1); // 0-1 range

      // Center point for scaling
      const centerXNorm = 0.5;
      const centerYNorm = 0.5;

      // Apply scaling around center
      let scaledX = centerXNorm + (normalizedX - centerXNorm) / scaleFactor;
      let scaledY = centerYNorm + (normalizedY - centerYNorm) / scaleFactor;

      // Check if the scaled point is outside the valid range (0-1)
      // If it is, we'll use the closest edge color
      const isOutsideRange =
        scaledX < 0 || scaledX > 1 || scaledY < 0 || scaledY > 1;

      // Map back to pixel coordinates if in range
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

      const cacheKey = `${gradientType.value}-${mappedX}-${mappedY}-${customAngle.value}-${centerX.value}-${centerY.value}-${ellipticalRotation.value}-${scaleValue.value}`;

      const color = getColorFromCache(cacheKey, () => {
        if (isOutsideRange) {
          // For points outside the valid range, use edge coloring
          if (gradientType.value === "linear") {
            // For linear gradients, extrapolate the color based on angle
            const angleRad = (customAngle.value * Math.PI) / 180;
            const angleVector = [Math.cos(angleRad), Math.sin(angleRad)];
            const position =
              (scaledX * angleVector[0] + scaledY * angleVector[1]) * 100;
            const adjustedPosition = Math.max(0, Math.min(100, position));
            return getColorAtPosition(adjustedPosition);
          } else {
            // For radial/elliptical, use the furthest position (100%)
            return getColorAtPosition(100);
          }
        }
        if (gradientType.value === "linear") {
          // Calculate position based on custom angle
          const angleRad = (customAngle.value * Math.PI) / 180;
          // Calculate dot product with angle vector
          const angleVector = [Math.cos(angleRad), Math.sin(angleRad)];
          const position =
            (scaledX * angleVector[0] + scaledY * angleVector[1]) * 100;
          // Ensure position is within 0-100 range
          const adjustedPosition = Math.max(0, Math.min(100, position));
          return getColorAtPosition(adjustedPosition);
        }
        if (
          gradientType.value === "radial" ||
          gradientType.value === "elliptical"
        ) {
          // Calculate center coordinates in normalized space
          const centerXNorm = centerX.value / 100;
          const centerYNorm = centerY.value / 100;
          // Calculate distance from center in normalized space
          let dx = scaledX - centerXNorm;
          let dy = scaledY - centerYNorm;
          // Apply aspect ratio correction for the rectangular grid
          // Adjust based on width/height ratio
          const aspectRatio = width / height;
          dx = dx * aspectRatio;
          // For elliptical gradients, apply rotation if needed
          if (gradientType.value === "elliptical") {
            // First apply rotation if needed
            if (ellipticalRotation.value !== 0) {
              const rotationRad = (ellipticalRotation.value * Math.PI) / 180;
              const rotatedDx =
                dx * Math.cos(rotationRad) - dy * Math.sin(rotationRad);
              const rotatedDy =
                dx * Math.sin(rotationRad) + dy * Math.cos(rotationRad);
              dx = rotatedDx;
              dy = rotatedDy;
            }
            // Then adjust aspect ratio for elliptical effect
            dy = dy * 2; // Make y axis have twice the effect of x axis
          }
          // Calculate maximum possible distance based on the grid's aspect ratio
          const maxDistanceX =
            Math.max(centerXNorm, 1 - centerXNorm) * aspectRatio;
          const maxDistanceY = Math.max(centerYNorm, 1 - centerYNorm);
          const maxDistance = Math.sqrt(
            maxDistanceX * maxDistanceX + maxDistanceY * maxDistanceY
          );
          // Calculate distance as a percentage of maximum possible distance
          const distance = (Math.sqrt(dx * dx + dy * dy) / maxDistance) * 100;
          return getColorAtPosition(Math.min(distance, 100));
        }

        // Default return value to ensure we always return a string
        // This fixed the TypeScript error
        return getColorAtPosition(0); // Default to the first color stop
      });

      optimizedPixels.push(color);
    }
  }

  // If we didn't optimize, return the calculated pixels directly
  if (skipFactor === 1) {
    return optimizedPixels;
  }

  // Otherwise, expand the optimized pixels back to the original size
  const fullPixels: string[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Find the nearest calculated pixel
      const optimizedX = Math.min(
        Math.floor(x / skipFactor),
        calculationWidth - 1
      );
      const optimizedY = Math.min(
        Math.floor(y / skipFactor),
        calculationHeight - 1
      );
      const index = optimizedY * calculationWidth + optimizedX;
      fullPixels.push(optimizedPixels[index]);
    }
  }

  return fullPixels;
}

const gradientPixels = computed(() => {
  return calculateOptimizedPixels(props.gridWidth, props.gridHeight);
});

// Methods
function getColorAtPosition(position: number): string {
  const sorted = [...colorStops.value].sort((a, b) => a.position - b.position);

  // Handle edge cases
  if (position <= sorted[0].position) return sorted[0].color;
  if (position >= sorted[sorted.length - 1].position)
    return sorted[sorted.length - 1].color;

  // Find the two colors to interpolate between
  let startIndex = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (position >= sorted[i].position && position <= sorted[i + 1].position) {
      startIndex = i;
      break;
    }
  }

  const start = sorted[startIndex];
  const end = sorted[startIndex + 1];

  // Calculate interpolation factor (0-1)
  const factor = (position - start.position) / (end.position - start.position);

  // Interpolate between colors
  return interpolateColor(start.color, end.color, factor);
}

function interpolateColor(
  color1: string,
  color2: string,
  factor: number
): string {
  // Parse colors
  const r1 = parseInt(color1.substring(1, 3), 16);
  const g1 = parseInt(color1.substring(3, 5), 16);
  const b1 = parseInt(color1.substring(5, 7), 16);

  const r2 = parseInt(color2.substring(1, 3), 16);
  const g2 = parseInt(color2.substring(3, 5), 16);
  const b2 = parseInt(color2.substring(5, 7), 16);

  // Interpolate
  const r = Math.round(r1 + factor * (r2 - r1));
  const g = Math.round(g1 + factor * (g2 - g1));
  const b = Math.round(b1 + factor * (b2 - b1));

  // Convert back to hex
  return `#${r.toString(16).padStart(2, "0")}${g
    .toString(16)
    .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function addColorStop() {
  if (colorStops.value.length >= 4) return;

  // Find the largest gap between positions
  const sorted = [...colorStops.value].sort((a, b) => a.position - b.position);
  let maxGap = 0;
  let gapPos = 50;

  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1].position - sorted[i].position;
    if (gap > maxGap) {
      maxGap = gap;
      gapPos = sorted[i].position + gap / 2;
    }
  }

  // Add a new stop with a default color in the middle of the largest gap
  colorStops.value.push({
    color: interpolateColor(
      sorted.find((s) => s.position < gapPos)?.color || "#000000",
      sorted.find((s) => s.position > gapPos)?.color || "#ffffff",
      0.5
    ),
    position: gapPos,
  });

  saveToLocalStorage();

  // Trigger debounced update
  applyGradient();
}

function removeColorStop(index: number) {
  if (colorStops.value.length <= 2) return;
  colorStops.value.splice(index, 1);

  saveToLocalStorage();

  // Trigger debounced update
  applyGradient();
}

function updateStopColor(index: number, color: string) {
  colorStops.value[index].color = color;

  // Clear color caches whenever color stops change
  colorCache.clear();

  saveToLocalStorage();

  // Trigger debounced update immediately for color changes
  applyGradient();
}

function updateStopPosition(index: number, position: number) {
  colorStops.value[index].position = Math.max(0, Math.min(100, position));

  // Clear color caches whenever color stops change
  colorCache.clear();

  saveToLocalStorage();

  // Trigger debounced update immediately for position changes
  applyGradient();
}

// Use throttle for slider updates to improve performance
let throttleTimers = {
  angle: null as number | null,
  centerX: null as number | null,
  centerY: null as number | null,
  rotation: null as number | null,
  scale: null as number | null,
};

function throttle(func: Function, key: string, delay: number) {
  // If there's already a timer, don't set another one
  if (throttleTimers[key] !== null) return;

  // Set a timer that will clear itself
  throttleTimers[key] = window.setTimeout(() => {
    throttleTimers[key] = null;
    func();
  }, delay);
}

function updateCustomAngle(angle: number) {
  customAngle.value = angle;

  // For UI updates, don't save to storage immediately
  // Throttle the actual updates
  throttle(
    () => {
      saveToLocalStorage();
      applyGradient();
    },
    "angle",
    50
  );
}

function updateCenterX(x: number) {
  centerX.value = x;

  throttle(
    () => {
      saveToLocalStorage();
      applyGradient();
    },
    "centerX",
    50
  );
}

function updateCenterY(y: number) {
  centerY.value = y;

  throttle(
    () => {
      saveToLocalStorage();
      applyGradient();
    },
    "centerY",
    50
  );
}

function updateEllipticalRotation(rotation: number) {
  ellipticalRotation.value = rotation;

  throttle(
    () => {
      saveToLocalStorage();
      applyGradient();
    },
    "rotation",
    50
  );
}

function updateScale(scale: number) {
  scaleValue.value = scale;

  throttle(
    () => {
      saveToLocalStorage();
      applyGradient();
    },
    "scale",
    50
  );
}

function resetTransform() {
  scaleValue.value = 100;

  saveToLocalStorage();
  colorCache.clear();
  applyGradient();
}

function toggleExpandedState() {
  saveToLocalStorage();
  expanded.value = !expanded.value;
}

// Keep track of pending updates to avoid excessive recalculations
let isUpdatePending = false;

function applyGradient() {
  const pixels = calculateOptimizedPixels(props.gridWidth, props.gridHeight);

  // Use the provided function if available, otherwise do nothing
  if (props.applyPixelArray) {
    props.applyPixelArray(pixels);
  }
}

// Set up watchers for changes in gradient type only - this needs immediate update
watch(gradientType, () => {
  // For type changes only, we'll update storage but debounce the pixel calculation
  saveToLocalStorage();
  applyGradient();
});

// For other parameters, use a separate watcher with higher debounce
watch(
  [customAngle, centerX, centerY, ellipticalRotation],
  () => {
    saveToLocalStorage();
    applyGradient();
  },
  { flush: "post" }
);
// Add watch for colorStops to ensure updates
watch(
  colorStops,
  () => {
    // Clear caches and update when color stops change
    colorCache.clear();
    applyGradient();
  },
  { deep: true }
);

// Add watch for colorStops to ensure updates
watch(
  colorStops,
  () => {
    // Clear caches and update when color stops change
    colorCache.clear();
    applyGradient();
  },
  { deep: true }
);

onMounted(() => loadFromLocalStorage());
</script>

<style scoped>
.gradient-center-indicator {
  position: absolute;
  width: 8px;
  height: 8px;
  background-color: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(0, 0, 0, 0.5);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
</style>

<template>
  <div>
    <div
      class="bg-white dark:bg-dark-secondary rounded-lg shadow-sm overflow-hidden transition-colors duration-200 flex-shrink-0"
    >
      <!-- Header -->
      <div
        class="p-3 bg-gray-50 dark:bg-dark-accent flex justify-between items-center cursor-pointer select-none transition-colors duration-200"
        @click="toggleExpandedState"
      >
        <h3
          class="font-medium text-gray-700 dark:text-dark-text transition-colors duration-200"
        >
          Gradient Generator
        </h3>
        <svg
          class="w-5 h-5 transition-transform duration-200"
          :class="{ 'rotate-180': expanded }"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 9l-7 7-7-7"
          ></path>
        </svg>
      </div>
    </div>

    <!-- Content -->
    <div v-if="expanded" class="space-y-4">
      <!-- Preview -->
      <div class="mb-3 relative overflow-hidden">
        <div
          class="w-full h-32 shadow-inner rounded-b-lg"
          :style="{ background: cssGradient }"
        ></div>
        <!-- Center indicator for radial/elliptical gradients - optimized with v-memo -->
        <div
          v-if="gradientType !== 'linear'"
          v-memo="[centerX, centerY]"
          class="gradient-center-indicator"
          :style="{ left: `${centerX}%`, top: `${centerY}%` }"
        ></div>
      </div>

      <!-- Color Stops -->
      <div>
        <div class="flex justify-between items-center mb-2">
          <label class="block text-sm font-medium dark:text-dark-text"
            >Color Stops</label
          >
          <button
            @click="addColorStop"
            :disabled="colorStops.length >= 4"
            class="p-1 text-blue-500 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed"
            title="Add color stop (max 4)"
          >
            <Plus class="w-4 h-4" />
          </button>
        </div>

        <div class="space-y-3">
          <div
            v-for="(stop, index) in colorStops"
            :key="`stop-${index}`"
            class="bg-gray-50 dark:bg-dark-accent p-2 rounded-lg flex items-center gap-2"
          >
            <div class="flex-none">
              <PopoverRoot>
                <PopoverTrigger as-child>
                  <ColorSwatch
                    as="button"
                    type="button"
                    :color="stop.color"
                    class="w-7 h-7 rounded cursor-pointer shadow-sm border border-gray-300 dark:border-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    :style="{ backgroundColor: stop.color }"
                    :aria-label="`Edit color ${stop.color}`"
                    :title="stop.color.toUpperCase()"
                  />
                </PopoverTrigger>
                <PopoverPortal>
                  <PopoverContent
                    :side-offset="8"
                    align="start"
                    class="z-50 w-72 p-4 bg-white dark:bg-dark-secondary border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl"
                  >
                    <ColorPickerPanel
                      :model-value="stop.color"
                      @update:model-value="(v: string) => updateStopColor(index, v)"
                    />
                  </PopoverContent>
                </PopoverPortal>
              </PopoverRoot>
            </div>

            <div class="flex-1">
              <RangeSlider
                :model-value="stop.position"
                @update:model-value="(v) => updateStopPosition(index, v)"
                :min="0"
                :max="100"
                aria-label="Color stop position"
              />
            </div>

            <div class="flex-none w-10 text-center">
              <span class="text-xs font-mono dark:text-dark-text"
                >{{ stop.position }}%</span
              >
            </div>

            <button
              v-if="colorStops.length > 2"
              @click="removeColorStop(index)"
              class="flex-none p-1 text-red-500 hover:text-red-700"
              title="Remove color stop"
            >
              <Minus class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <!-- Controls -->
      <div class="space-y-4">
        <!-- Gradient Type -->
        <div>
          <label class="block text-sm font-medium mb-2 dark:text-dark-text"
            >Type</label
          >
          <div class="flex gap-2">
            <button
              @click="gradientType = 'linear'"
              class="flex-1 py-1.5 px-3 rounded text-sm transition-colors"
              :class="{
                'bg-blue-500 text-white': gradientType === 'linear',
                'bg-gray-100 dark:bg-dark-accent hover:bg-gray-200 dark:hover:bg-gray-700':
                  gradientType !== 'linear',
              }"
            >
              Linear
            </button>
            <button
              @click="gradientType = 'radial'"
              class="flex-1 py-1.5 px-3 rounded text-sm transition-colors"
              :class="{
                'bg-blue-500 text-white': gradientType === 'radial',
                'bg-gray-100 dark:bg-dark-accent hover:bg-gray-200 dark:hover:bg-gray-700':
                  gradientType !== 'radial',
              }"
            >
              Radial
            </button>
            <button
              @click="gradientType = 'elliptical'"
              class="flex-1 py-1.5 px-3 rounded text-sm transition-colors"
              :class="{
                'bg-blue-500 text-white': gradientType === 'elliptical',
                'bg-gray-100 dark:bg-dark-accent hover:bg-gray-200 dark:hover:bg-gray-700':
                  gradientType !== 'elliptical',
              }"
            >
              Elliptical
            </button>
          </div>
        </div>

        <!-- Linear Gradient Angle Control -->
        <div v-if="gradientType === 'linear'" class="space-y-2">
          <div class="flex justify-between items-center">
            <label class="block text-sm font-medium dark:text-dark-text"
              >Angle: {{ customAngle }}°</label
            >
            <button
              @click="updateCustomAngle(90)"
              class="text-xs py-1 px-2 bg-gray-100 dark:bg-dark-accent rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Reset
            </button>
          </div>
          <RangeSlider
            :model-value="customAngle"
            @update:model-value="updateCustomAngle"
            :min="0"
            :max="359"
            aria-label="Gradient angle"
          />
          <div
            class="flex justify-between text-xs text-gray-500 dark:text-gray-400"
          >
            <span>0° </span>
            <span>90° </span>
            <span>180° </span>
            <span>270° </span>
            <span>359°</span>
          </div>
        </div>

        <!-- Radial/Elliptical Center Controls -->
        <div v-if="gradientType !== 'linear'" class="space-y-3">
          <div>
            <div class="flex justify-between items-center">
              <label class="block text-sm font-medium dark:text-dark-text"
                >Center X: {{ centerX }}%</label
              >
              <button
                @click="updateCenterX(50)"
                class="text-xs py-1 px-2 bg-gray-100 dark:bg-dark-accent rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Center
              </button>
            </div>
            <RangeSlider
              :model-value="centerX"
              @update:model-value="updateCenterX"
              :min="0"
              :max="100"
              aria-label="Gradient center X"
            />
          </div>

          <div>
            <div class="flex justify-between items-center">
              <label class="block text-sm font-medium dark:text-dark-text"
                >Center Y: {{ centerY }}%</label
              >
              <button
                @click="updateCenterY(50)"
                class="text-xs py-1 px-2 bg-gray-100 dark:bg-dark-accent rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Center
              </button>
            </div>
            <RangeSlider
              :model-value="centerY"
              @update:model-value="updateCenterY"
              :min="0"
              :max="100"
              aria-label="Gradient center Y"
            />
          </div>
        </div>

        <!-- Elliptical Rotation Control -->
        <div v-if="gradientType === 'elliptical'" class="space-y-2">
          <div class="flex justify-between items-center">
            <label class="block text-sm font-medium dark:text-dark-text"
              >Rotation: {{ ellipticalRotation }}°</label
            >
            <button
              @click="updateEllipticalRotation(0)"
              class="text-xs py-1 px-2 bg-gray-100 dark:bg-dark-accent rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Reset
            </button>
          </div>
          <RangeSlider
            :model-value="ellipticalRotation"
            @update:model-value="updateEllipticalRotation"
            :min="0"
            :max="359"
            aria-label="Elliptical rotation"
          />
          <div
            class="flex justify-between text-xs text-gray-500 dark:text-gray-400"
          >
            <span>0°</span>
            <span>90°</span>
            <span>180°</span>
            <span>270°</span>
            <span>359°</span>
          </div>
        </div>

        <!-- Scale (Zoom) Control -->
        <div>
          <div class="flex justify-between items-center">
            <label class="block text-sm font-medium dark:text-dark-text"
              >Scale: {{ scaleValue }}%</label
            >
            <button
              @click="resetTransform"
              class="text-xs py-1 px-2 bg-gray-100 dark:bg-dark-accent rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Reset
            </button>
          </div>
          <RangeSlider
            :model-value="scaleValue"
            @update:model-value="updateScale"
            :min="50"
            :max="300"
            aria-label="Gradient scale"
          />
          <div
            class="flex justify-between text-xs text-gray-500 dark:text-gray-400"
          >
            <span>50%</span>
            <span>100%</span>
            <span>300%</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
