<script setup lang="ts">
import {
  SliderRoot,
  SliderTrack,
  SliderRange,
  SliderThumb,
} from "reka-ui";

interface Props {
  modelValue: number;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
  disabled?: boolean;
}

withDefaults(defineProps<Props>(), {
  min: 0,
  max: 100,
  step: 1,
  ariaLabel: undefined,
  disabled: false,
});

const emit = defineEmits<{
  (e: "update:modelValue", value: number): void;
}>();

// Reka's SliderRoot uses an array model for multi-thumb support — unwrap
// [v] before re-emitting since this slider is always single-thumb.
function onUpdate(v: unknown): void {
  if (Array.isArray(v) && typeof v[0] === "number") {
    emit("update:modelValue", v[0]);
  }
}
</script>

<template>
  <SliderRoot
    as="div"
    :model-value="[modelValue]"
    @update:model-value="onUpdate"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    orientation="horizontal"
    :aria-label="ariaLabel"
    class="relative flex items-center w-full h-4 select-none touch-none data-[disabled]:opacity-50"
  >
    <SliderTrack
      as="div"
      class="relative h-1.5 grow rounded-full overflow-hidden bg-gray-200 dark:bg-gray-600 cursor-pointer"
    >
      <SliderRange
        as="div"
        class="absolute h-full bg-blue-400/40 dark:bg-blue-400/40"
      />
    </SliderTrack>
    <SliderThumb
      as="div"
      class="block w-4 h-4 rounded-full bg-blue-500 border-[3px] border-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    />
  </SliderRoot>
</template>
