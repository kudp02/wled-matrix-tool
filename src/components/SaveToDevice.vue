<script setup lang="ts">
import { ref, watch, onBeforeUnmount, computed } from "vue";
import { CloudUpload, X, Save, CheckCircle2, AlertCircle } from "lucide-vue-next";
import { useWledGif } from "../composables/useWledGif";

interface Props {
  apiUrl: string;
  pixelData: string[];
  gridWidth: number;
  gridHeight: number;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), { disabled: false });

const { busy, lastError, lastStatus, saveAndPlay, sanitizeFilename } =
  useWledGif();

const isModalOpen = ref(false);
const filename = ref("drawing");
const presetId = ref(1);
const presetName = ref("Drawing");
const segmentId = ref(0);
const brightness = ref(230);
const speed = ref(128);
const savePresetEnabled = ref(true);
const result = ref<"" | "ok" | "err">("");

const modalRef = ref<HTMLDialogElement | null>(null);
const triggerRef = ref<HTMLButtonElement | null>(null);

const previewName = computed(() => sanitizeFilename(filename.value));

watch(filename, () => {
  result.value = "";
});

function openModal() {
  isModalOpen.value = true;
  result.value = "";
  document.addEventListener("keydown", handleKeyDown);
  setTimeout(() => {
    const first = modalRef.value?.querySelector<HTMLElement>(
      'input, button, [tabindex]:not([tabindex="-1"])'
    );
    first?.focus();
  }, 50);
}

function closeModal() {
  isModalOpen.value = false;
  document.removeEventListener("keydown", handleKeyDown);
  triggerRef.value?.focus();
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape") closeModal();
}

onBeforeUnmount(() => {
  document.removeEventListener("keydown", handleKeyDown);
});

async function onSave() {
  result.value = "";
  const r = await saveAndPlay(
    props.apiUrl,
    props.pixelData,
    props.gridWidth,
    props.gridHeight,
    {
      filename: filename.value,
      presetId: savePresetEnabled.value ? presetId.value : 0,
      presetName: presetName.value || filename.value,
      segmentId: segmentId.value,
      brightness: brightness.value,
      speed: speed.value,
    }
  );
  result.value = r.ok ? "ok" : "err";
}
</script>

<template>
  <div>
    <button
      ref="triggerRef"
      @click="openModal"
      :disabled="disabled"
      class="flex items-center justify-center p-2 text-base bg-white text-gray-800 rounded border-none cursor-pointer transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed relative group"
      title="Save to WLED as GIF"
      aria-haspopup="dialog"
    >
      <CloudUpload class="size-5" />
      <span
        class="absolute left-1/2 -bottom-8 transform -translate-x-1/2 bg-gray-800 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10"
      >
        Save to device as GIF
      </span>
    </button>

    <div
      v-if="isModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
    >
      <dialog
        ref="modalRef"
        open
        class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto m-0 p-0 border-none relative animate-modal-appear"
        role="dialog"
        aria-modal="true"
      >
        <header
          class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"
        >
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
            Save to WLED as GIF
          </h2>
          <button
            @click="closeModal"
            class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full p-1"
            aria-label="Close dialog"
          >
            <X class="w-5 h-5" />
          </button>
        </header>

        <div class="p-6 space-y-5">
          <p class="text-xs text-gray-600 dark:text-gray-400 -mt-2">
            Encodes the current drawing as a GIF, uploads it to the WLED
            device's filesystem, and plays it via the Image effect. Smooth
            on/off transitions work, unlike raw-pixel presets. Requires WLED
            0.16+ on an ESP32 build with GIF support.
          </p>

          <div class="space-y-2">
            <label
              for="gif-filename"
              class="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              GIF filename
            </label>
            <input
              type="text"
              id="gif-filename"
              v-model="filename"
              placeholder="drawing"
              class="w-full py-2 px-3 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Saved on device as <code class="font-mono">/{{ previewName }}</code>
            </p>
          </div>

          <fieldset class="space-y-3">
            <legend class="text-sm font-medium text-gray-700 dark:text-gray-300">
              Playback
            </legend>
            <div class="grid grid-cols-3 gap-3">
              <div>
                <label
                  for="seg-id"
                  class="block text-xs text-gray-600 dark:text-gray-400 mb-1"
                >
                  Segment
                </label>
                <input
                  type="number"
                  id="seg-id"
                  v-model.number="segmentId"
                  min="0"
                  max="31"
                  class="w-full py-1.5 px-2 text-sm border border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label
                  for="seg-bri"
                  class="block text-xs text-gray-600 dark:text-gray-400 mb-1"
                >
                  Brightness
                </label>
                <input
                  type="number"
                  id="seg-bri"
                  v-model.number="brightness"
                  min="1"
                  max="255"
                  class="w-full py-1.5 px-2 text-sm border border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label
                  for="seg-sx"
                  class="block text-xs text-gray-600 dark:text-gray-400 mb-1"
                >
                  Speed
                </label>
                <input
                  type="number"
                  id="seg-sx"
                  v-model.number="speed"
                  min="0"
                  max="255"
                  class="w-full py-1.5 px-2 text-sm border border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>
          </fieldset>

          <div class="space-y-3">
            <label class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                v-model="savePresetEnabled"
                class="rounded"
              />
              Also save as preset
            </label>
            <div
              v-if="savePresetEnabled"
              class="grid grid-cols-3 gap-3 pl-6"
            >
              <div>
                <label
                  for="preset-id"
                  class="block text-xs text-gray-600 dark:text-gray-400 mb-1"
                >
                  Slot
                </label>
                <input
                  type="number"
                  id="preset-id"
                  v-model.number="presetId"
                  min="1"
                  max="250"
                  class="w-full py-1.5 px-2 text-sm border border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div class="col-span-2">
                <label
                  for="preset-name"
                  class="block text-xs text-gray-600 dark:text-gray-400 mb-1"
                >
                  Preset name
                </label>
                <input
                  type="text"
                  id="preset-name"
                  v-model="presetName"
                  class="w-full py-1.5 px-2 text-sm border border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>
            <p
              v-if="savePresetEnabled"
              class="text-xs text-amber-600 dark:text-amber-400 pl-6"
            >
              Overwrites whatever is currently in slot {{ presetId }}.
            </p>
          </div>

          <div
            v-if="busy || lastStatus || result"
            class="text-sm rounded p-3 flex items-start gap-2"
            :class="{
              'bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200':
                busy,
              'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200':
                result === 'ok' && !busy,
              'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200':
                result === 'err' && !busy,
            }"
          >
            <CheckCircle2 v-if="result === 'ok' && !busy" class="size-4 mt-0.5 shrink-0" />
            <AlertCircle v-else-if="result === 'err' && !busy" class="size-4 mt-0.5 shrink-0" />
            <span>{{ busy ? lastStatus : result === "err" ? lastError : lastStatus }}</span>
          </div>
        </div>

        <footer
          class="flex items-center justify-end p-4 border-t border-gray-200 dark:border-gray-700 gap-2"
        >
          <button
            @click="closeModal"
            class="py-2 px-4 text-sm bg-gray-200 text-gray-800 rounded border-none cursor-pointer transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Close
          </button>
          <button
            @click="onSave"
            :disabled="busy"
            class="py-2 px-4 text-sm bg-blue-500 text-white rounded border-none cursor-pointer transition-colors hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 inline-flex items-center focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Save class="w-4 h-4 mr-1" />
            {{ busy ? "Working..." : "Save & Play" }}
          </button>
        </footer>
      </dialog>
    </div>
  </div>
</template>

<style scoped>
@keyframes modal-appear {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
.animate-modal-appear { animation: modal-appear 0.2s ease-out; }
</style>
