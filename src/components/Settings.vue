<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import { Cog, X, Save } from "lucide-vue-next";

interface SettingsProps {
  apiUrl: string;
  gridWidth: number;
  gridHeight: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  debounceDelay: number;
  wledJson: string; // Keep the prop but won't display it anymore
}

// Define emits with TypeScript type
type SettingsEmits = {
  "update:apiUrl": [value: string];
  "update:gridWidth": [value: number];
  "update:gridHeight": [value: number];
  "update:flipHorizontal": [value: boolean];
  "update:flipVertical": [value: boolean];
  "update:debounceDelay": [value: number];
};

const props = withDefaults(defineProps<SettingsProps>(), {
  apiUrl: "",
  gridWidth: 16,
  gridHeight: 16,
  flipHorizontal: false,
  flipVertical: false,
  debounceDelay: 100,
});

const emit = defineEmits<SettingsEmits>();

// Local state
const isModalOpen = ref(false);
const apiUrl = ref(props.apiUrl);
const gridWidth = ref(props.gridWidth);
const gridHeight = ref(props.gridHeight);
const flipHorizontal = ref(props.flipHorizontal);
const flipVertical = ref(props.flipVertical);
const debounceDelay = ref(props.debounceDelay);
const modalRef = ref<HTMLDialogElement | null>(null);
const triggerRef = ref<HTMLButtonElement | null>(null);

// Trap focus within the modal
function trapFocus(event: KeyboardEvent): void {
  if (!isModalOpen.value || !modalRef.value) return;

  const focusableElements = modalRef.value.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );

  const firstElement = focusableElements[0] as HTMLElement;
  const lastElement = focusableElements[
    focusableElements.length - 1
  ] as HTMLElement;

  // If shift + tab pressed and focus is on first element, move to last
  if (event.shiftKey && document.activeElement === firstElement) {
    lastElement.focus();
    event.preventDefault();
  }
  // If tab pressed and focus is on last element, move to first
  else if (!event.shiftKey && document.activeElement === lastElement) {
    firstElement.focus();
    event.preventDefault();
  }
}

// Modal control methods
function openModal(): void {
  isModalOpen.value = true;

  // Add event listeners for accessibility
  document.addEventListener("keydown", handleKeyDown);

  // Focus the first focusable element when modal opens
  setTimeout(() => {
    const focusableElements = modalRef.value?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusableElements && focusableElements.length > 0) {
      (focusableElements[0] as HTMLElement).focus();
    }

    // Set aria-hidden on all elements outside the modal
    document
      .querySelectorAll("#app > *:not(.settings-modal-container)")
      .forEach((el) => {
        el.setAttribute("aria-hidden", "true");
      });
  }, 50);
}

function closeModal(): void {
  isModalOpen.value = false;
  document.removeEventListener("keydown", handleKeyDown);

  // Restore focus to the trigger button
  if (triggerRef.value) {
    triggerRef.value.focus();
  }

  // Remove aria-hidden from all elements
  document.querySelectorAll('[aria-hidden="true"]').forEach((el) => {
    el.removeAttribute("aria-hidden");
  });
}

function handleKeyDown(e: KeyboardEvent): void {
  // Handle Escape key
  if (e.key === "Escape") {
    closeModal();
  }
  // Handle Tab key for focus trapping
  else if (e.key === "Tab") {
    trapFocus(e);
  }
}

// Clean up event listeners
onBeforeUnmount(() => {
  document.removeEventListener("keydown", handleKeyDown);
  // Remove any lingering aria-hidden attributes
  document.querySelectorAll('[aria-hidden="true"]').forEach((el) => {
    el.removeAttribute("aria-hidden");
  });
});

// Update methods
function saveSettings(): void {
  emit("update:apiUrl", apiUrl.value);
  emit("update:gridWidth", parseInt(gridWidth.value.toString()));
  emit("update:gridHeight", parseInt(gridHeight.value.toString()));
  emit("update:flipHorizontal", flipHorizontal.value);
  emit("update:flipVertical", flipVertical.value);
  emit("update:debounceDelay", parseInt(debounceDelay.value.toString()));
  closeModal();
}

// Watch for prop changes
watch(
  () => props.apiUrl,
  (newValue) => {
    apiUrl.value = newValue;
  }
);

watch(
  () => props.gridWidth,
  (newValue) => {
    gridWidth.value = newValue;
  }
);

watch(
  () => props.gridHeight,
  (newValue) => {
    gridHeight.value = newValue;
  }
);

watch(
  () => props.flipHorizontal,
  (newValue) => {
    flipHorizontal.value = newValue;
  }
);

watch(
  () => props.flipVertical,
  (newValue) => {
    flipVertical.value = newValue;
  }
);

watch(
  () => props.debounceDelay,
  (newValue) => {
    debounceDelay.value = newValue;
  }
);
</script>

<template>
  <div class="w-full">
    <!-- Settings button -->
    <button
      ref="triggerRef"
      @click="openModal"
      class="flex items-center justify-center p-2 text-base bg-white text-gray-800 rounded border-none cursor-pointer transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
      title="Settings"
      aria-haspopup="dialog"
      aria-expanded="false"
    >
      <Cog class="size-5" />
    </button>

    <!-- Accessible Modal Dialog -->
    <div
      v-if="isModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
    >
      <!-- Modal dialog -->
      <dialog
        ref="modalRef"
        open
        class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto m-0 p-0 border-none relative animate-modal-appear"
        role="dialog"
        aria-labelledby="modal-title"
        aria-modal="true"
      >
        <!-- Modal header -->
        <header
          class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"
        >
          <h2
            id="modal-title"
            class="text-lg font-semibold text-gray-900 dark:text-white"
          >
            WLED Matrix Settings
          </h2>
          <button
            @click="closeModal"
            class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full p-1"
            aria-label="Close dialog"
          >
            <X class="w-5 h-5" />
          </button>
        </header>

        <!-- Modal body -->
        <div class="p-6 space-y-6">
          <!-- API URL -->
          <div class="space-y-2">
            <label
              for="wled-url"
              class="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              WLED API URL
            </label>
            <div class="mt-1 flex rounded-md shadow-sm">
              <input
                type="text"
                id="wled-url"
                v-model="apiUrl"
                placeholder="http://your-wled-ip/json"
                class="flex-1 py-2 px-3 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                aria-describedby="url-description"
              />
            </div>
            <p
              id="url-description"
              class="mt-1 text-xs text-gray-500 dark:text-gray-400"
            >
              The JSON API endpoint of your WLED device
            </p>
          </div>

          <!-- Matrix Dimensions -->
          <fieldset class="space-y-3">
            <legend
              class="text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Matrix Dimensions
            </legend>
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <label
                  for="grid-width"
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Width
                </label>
                <input
                  type="number"
                  id="grid-width"
                  v-model.number="gridWidth"
                  min="1"
                  max="100"
                  inputmode="numeric"
                  class="w-full py-2 px-3 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  aria-describedby="width-description"
                />
                <p id="width-description" class="sr-only">
                  Width of the LED matrix in pixels
                </p>
              </div>
              <div class="space-y-2">
                <label
                  for="grid-height"
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Height
                </label>
                <input
                  type="number"
                  id="grid-height"
                  v-model.number="gridHeight"
                  min="1"
                  max="100"
                  inputmode="numeric"
                  class="w-full py-2 px-3 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  aria-describedby="height-description"
                />
                <p id="height-description" class="sr-only">
                  Height of the LED matrix in pixels
                </p>
              </div>
            </div>
          </fieldset>

          <!-- Flip Matrix -->
          <fieldset class="space-y-3">
            <legend
              class="text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Flip Matrix
            </legend>
            <div class="grid grid-cols-2 gap-4">

              <div class="flex items-center justify-between">
                <label for="flip-horizontal" class="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                  Horizontal
                </label>

                <button
                  type="button"
                  role="switch"
                  :aria-checked="flipHorizontal"
                  @click="flipHorizontal = !flipHorizontal"
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                         dark:focus:ring-offset-gray-800"
                  :class="flipHorizontal ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'"
                >
                  <span
                    class="inline-block h-5 w-5 transform rounded-full bg-white transition-transform"
                    :class="flipHorizontal ? 'translate-x-5' : 'translate-x-1'"
                  ></span>
                </button>
              </div>

              <div class="flex items-center justify-between">
                <label for="flip-vertical" class="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                  Vertical
                </label>

                <button
                  type="button"
                  role="switch"
                  :aria-checked="flipVertical"
                  @click="flipVertical = !flipVertical"
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                         dark:focus:ring-offset-gray-800"
                  :class="flipVertical ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'"
                >
                  <span
                    class="inline-block h-5 w-5 transform rounded-full bg-white transition-transform"
                    :class="flipVertical ? 'translate-x-5' : 'translate-x-1'"
                  ></span>
                </button>
              </div>


            </div>
          </fieldset>

          <!-- Debounce Delay Setting -->
          <div class="space-y-2">
            <label
              for="debounce-delay"
              class="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Update Delay (ms)
            </label>
            <div class="mt-1 flex rounded-md shadow-sm">
              <input
                type="number"
                id="debounce-delay"
                v-model.number="debounceDelay"
                min="0"
                max="1000"
                step="10"
                inputmode="numeric"
                class="w-full py-2 px-3 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                aria-describedby="debounce-description"
              />
            </div>
            <p
              id="debounce-description"
              class="mt-1 text-xs text-gray-500 dark:text-gray-400"
            >
              Delay between WLED updates (0-1000ms). Lower values provide faster
              updates but may cause more network traffic.
            </p>
          </div>
        </div>

        <!-- Modal footer -->
        <footer
          class="flex items-center justify-end p-4 border-t border-gray-200 dark:border-gray-700 gap-2"
        >
          <button
            @click="closeModal"
            class="py-2 px-4 text-sm bg-gray-200 text-gray-800 rounded border-none cursor-pointer transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Cancel
          </button>
          <button
            @click="saveSettings"
            class="py-2 px-4 text-sm bg-blue-500 text-white rounded border-none cursor-pointer transition-colors hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 inline-flex items-center focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <Save class="w-4 h-4 mr-1" />
            Save Changes
          </button>
        </footer>
      </dialog>
    </div>
  </div>
</template>

<style>
@keyframes modal-appear {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.animate-modal-appear {
  animation: modal-appear 0.2s ease-out;
}
</style>
