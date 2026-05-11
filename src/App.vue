<script setup lang="ts">
import DrawingCanvas from "./components/DrawingCanvas.vue";
import ColorPicker from "./components/ColorPicker.vue";
import Settings from "./components/Settings.vue";
import Toolbar from "./components/Toolbar.vue";
import DarkModeToggle from "./components/DarkModeToggle.vue";
import GradientGenerator from "./components/GradientGenerator.vue";
import ImageUploader from "./components/ImageUploader.vue";
import SaveToDevice from "./components/SaveToDevice.vue";
import { useWledDraw } from "./composables/useWledDraw";
import { ArrowLeft, Menu } from "lucide-vue-next";
import { ref, onMounted, onUnmounted } from "vue";

// Initialize WLED drawing functionality with the enhanced composable
const {
  // State properties
  apiUrl,
  wledUrl,
  cellSize,
  gridWidth,
  gridHeight,
  pixelData,
  currentColor,
  colorPalette,
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
 * Apply a gradient to the canvas - direct connection to applyPixelArray
 * We'll pass this function to the GradientGenerator component
 */
function handleGradientUpdate(gradientData: string[]) {
  applyPixelArray(gradientData);
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
        <ColorPicker
          v-model="currentColor"
          v-model:palette="colorPalette"
          :cell-size="cellSize"
          class="flex-shrink-0"
        />

        <!-- Gradient Generator Section -->
        <GradientGenerator
          :pixel-data="pixelData"
          :grid-width="gridWidth"
          :grid-height="gridHeight"
          :apply-pixel-array="handleGradientUpdate"
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
        :grid-width="gridWidth"
        :grid-height="gridHeight"
        :wled-json="wledJson"
        @undo="undo"
        @clear="clearScreen"
        @update:brushSize="handleBrushSizeChange"
      >
        <!-- Save to device as GIF (uses WLED Image effect for smooth on/off) -->
        <SaveToDevice
          :api-url="apiUrl"
          :pixel-data="pixelData"
          :grid-width="gridWidth"
          :grid-height="gridHeight"
          :disabled="!apiUrl || loading || error"
        />

        <!-- Settings Section -->
        <Settings
          v-model:api-url="apiUrl"
          v-model:grid-width="gridWidth"
          v-model:grid-height="gridHeight"
          v-model:debounce-delay="debounceDelay"
          :wled-json="wledJson"
          class="flex-shrink-0"
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
    </main>
  </div>
</template>
