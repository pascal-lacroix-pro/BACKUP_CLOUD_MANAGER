<template>
  <div class="flex items-center gap-3">

    <!-- Label gauche : SSD -->
    <span :class="['text-sm font-medium transition-colors', isDropboxToSsd ? 'text-gray-500' : 'text-blue-400']">
      SSD
    </span>

    <!-- Toggle switch -->
    <button
      role="switch"
      :aria-checked="isDropboxToSsd"
      :disabled="disabled"
      class="relative inline-flex h-6 w-12 items-center rounded-full
             bg-gray-600 transition-colors focus:outline-none focus:ring-2
             focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900
             disabled:opacity-40 disabled:cursor-not-allowed"
      @click="toggle"
    >
      <span
        :class="[
          'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
          isDropboxToSsd ? 'translate-x-7' : 'translate-x-1'
        ]"
      />
    </button>

    <!-- Label droite : Dropbox -->
    <span :class="['text-sm font-medium transition-colors', isDropboxToSsd ? 'text-blue-400' : 'text-gray-500']">
      Dropbox
    </span>

    <!-- Indicateur de direction -->
    <span class="ml-2 text-xs text-gray-400 font-mono">
      {{ isDropboxToSsd ? 'Dropbox → SSD' : 'SSD → Dropbox' }}
    </span>

  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: 'ssd-to-dropbox' },
  disabled:   { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const isDropboxToSsd = computed(() => props.modelValue === 'dropbox-to-ssd')

function toggle() {
  emit('update:modelValue', isDropboxToSsd.value ? 'ssd-to-dropbox' : 'dropbox-to-ssd')
}
</script>
