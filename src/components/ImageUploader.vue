<script setup lang="ts">
import { ref, watch } from "vue";
import RangeSlider from "./RangeSlider.vue";

// Define props for component
const props = defineProps<{
  gridWidth: number;
  gridHeight: number;
}>();

// Define emits
const emit = defineEmits<{
  "apply-image": [pixelData: string[]];
}>();

// Reactive state
const isOpen = ref(false);
const imagePreview = ref<string | null>(null);
const pixelatedPreview = ref<string | null>(null);
const uploadError = ref<string | null>(null);
const processingImage = ref(false);
const brightness = ref(100); // Default brightness (percentage)
const contrast = ref(0); // Default contrast (percentage)

// Toggle panel open/closed
function togglePanel() {
  isOpen.value = !isOpen.value;
}

// Handle file input change
async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) {
    return;
  }

  const file = input.files[0];
  if (!file.type.startsWith("image/")) {
    uploadError.value = "The selected file is not an image";
    return;
  }

  uploadError.value = null;
  processingImage.value = true;

  try {
    // Create image preview
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        imagePreview.value = e.target.result as string;
        processImage();
      }
    };
    reader.readAsDataURL(file);
  } catch (error) {
    console.error("Error reading image file:", error);
    uploadError.value = "Failed to read the image file";
  } finally {
    processingImage.value = false;
  }
}

// Process the image and convert to pixel data
async function processImage() {
  if (!imagePreview.value) return;

  processingImage.value = true;

  try {
    // Create an image element to load the image
    const img = new Image();
    img.src = imagePreview.value;

    await new Promise((resolve) => {
      img.onload = resolve;
    });

    // Create a canvas to draw and sample the image
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not create canvas context");
    }

    // Set canvas to match the matrix dimensions
    canvas.width = props.gridWidth;
    canvas.height = props.gridHeight;

    // Draw the image scaled to fit the matrix dimensions
    ctx.drawImage(img, 0, 0, props.gridWidth, props.gridHeight);

    // Apply brightness and contrast adjustments
    const imageData = ctx.getImageData(0, 0, props.gridWidth, props.gridHeight);
    const data = imageData.data;

    // Apply brightness and contrast
    const brightnessValue = brightness.value / 100;
    const contrastValue = contrast.value / 100;
    const factor =
      (259 * (contrastValue * 255 + 255)) / (255 * (259 - contrastValue * 255));

    for (let i = 0; i < data.length; i += 4) {
      // Apply brightness
      data[i] = data[i] * brightnessValue; // R
      data[i + 1] = data[i + 1] * brightnessValue; // G
      data[i + 2] = data[i + 2] * brightnessValue; // B

      // Apply contrast
      data[i] = factor * (data[i] - 128) + 128;
      data[i + 1] = factor * (data[i + 1] - 128) + 128;
      data[i + 2] = factor * (data[i + 2] - 128) + 128;

      // Ensure values are within range
      data[i] = Math.max(0, Math.min(255, data[i]));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1]));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2]));
    }

    ctx.putImageData(imageData, 0, 0);

    // Create a pixelated preview
    pixelatedPreview.value = canvas.toDataURL("image/png");

    // Extract pixel colors for the LED matrix
    const pixelColors: string[] = [];
    for (let y = 0; y < props.gridHeight; y++) {
      for (let x = 0; x < props.gridWidth; x++) {
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        const hexColor = rgbToHex(pixel[0], pixel[1], pixel[2]);
        pixelColors.push(hexColor);
      }
    }

    // Save the pixel data for applying to the matrix
    convertedPixelData.value = pixelColors;
  } catch (error) {
    console.error("Error processing image:", error);
    uploadError.value = "Failed to process the image";
  } finally {
    processingImage.value = false;
  }
}

// Store converted pixel data
const convertedPixelData = ref<string[]>([]);

// Apply the processed image to the LED matrix
function applyImageToMatrix() {
  if (convertedPixelData.value.length === props.gridWidth * props.gridHeight) {
    emit("apply-image", convertedPixelData.value);
  } else {
    uploadError.value = "Image processing incomplete";
  }
}

// Convert RGB values to hex color
function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("")
  );
}

// Watch for brightness/contrast changes and reprocess the image
watch([brightness, contrast], () => {
  if (imagePreview.value) {
    processImage();
  }
});
</script>

<template>
  <div
    class="rounded-lg overflow-hidden flex-shrink-0 bg-gray-50 dark:bg-dark-secondary shadow-md"
  >
    <!-- Header - clickable to expand/collapse -->
    <div
      @click="togglePanel"
      class="flex justify-between items-center px-4 py-3 cursor-pointer select-none transition-colors duration-200"
    >
      <h3 class="font-medium text-gray-800 dark:text-gray-200">
        Image to Matrix Converter
      </h3>
      <svg
        class="w-5 h-5 transition-transform duration-200"
        :class="{ 'rotate-180': isOpen }"
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

    <!-- Collapsible content -->
    <div v-if="isOpen" class="p-4">
      <!-- File upload -->
      <div class="mb-4">
        <label
          class="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Upload Image
        </label>
        <input
          type="file"
          accept="image/*"
          @change="handleFileChange"
          class="block w-full px-3 py-2 text-sm text-gray-700 bg-white dark:bg-gray-800 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          The image will be resized to {{ gridWidth }}x{{ gridHeight }} pixels
          for your LED matrix
        </p>
      </div>

      <!-- Error message -->
      <div
        v-if="uploadError"
        class="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-md"
      >
        {{ uploadError }}
      </div>

      <!-- Image previews -->
      <div v-if="imagePreview" class="mb-4 grid grid-cols-2 gap-4">
        <div>
          <h4 class="text-sm font-medium mb-2">Original Image</h4>
          <img
            :src="imagePreview"
            alt="Original image"
            class="max-w-full h-auto border border-gray-300 dark:border-gray-600 rounded"
          />
        </div>
        <div v-if="pixelatedPreview">
          <h4 class="text-sm font-medium mb-2">Preview</h4>
          <img
            :src="pixelatedPreview"
            alt="Pixelated preview"
            class="max-w-full h-auto border border-gray-300 dark:border-gray-600 rounded image-rendering-pixelated"
            style="image-rendering: pixelated; width: 100%"
          />
        </div>
      </div>

      <!-- Image adjustment controls -->
      <div v-if="imagePreview" class="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label
            class="block mb-2 text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap"
          >
            Brightness: {{ brightness }}%
          </label>
          <RangeSlider
            v-model="brightness"
            :min="0"
            :max="200"
            aria-label="Image brightness"
          />
        </div>
        <div>
          <label
            class="block mb-2 text-xs font-medium text-gray-700 dark:text-gray-300"
          >
            Contrast: {{ contrast }}%
          </label>
          <RangeSlider
            v-model="contrast"
            :min="0"
            :max="50"
            aria-label="Image contrast"
          />
        </div>
      </div>

      <!-- Apply button -->
      <button
        v-if="convertedPixelData.length > 0"
        @click="applyImageToMatrix"
        class="w-full px-4 py-2 bg-blue-500 text-white font-medium rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-600 dark:hover:bg-blue-700 transition-colors"
        :disabled="processingImage"
      >
        Apply to LED Matrix
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Fix for Safari which doesn't support image-rendering: pixelated */
.image-rendering-pixelated {
  image-rendering: -moz-crisp-edges;
  image-rendering: -webkit-crisp-edges;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
</style>
