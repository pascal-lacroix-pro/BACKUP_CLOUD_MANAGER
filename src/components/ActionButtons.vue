<template>
  <div class="flex gap-3">

    <!-- TEST (dry-run) -->
    <button
      :disabled="running || !pathValid"
      class="flex-1 rounded-md px-4 py-2 text-sm font-semibold
             bg-gray-700 text-gray-200 hover:bg-gray-600
             disabled:opacity-40 disabled:cursor-not-allowed
             transition-colors"
      @click="onTest"
    >
      <span v-if="running && mode === 'test'" class="flex items-center justify-center gap-2">
        <Spinner /> Test en cours…
      </span>
      <span v-else>TEST (dry-run)</span>
    </button>

    <!-- APPLY — visible quand pas en cours -->
    <button
      v-if="!running"
      :disabled="!pathValid || !hasTransfers"
      class="flex-1 rounded-md px-4 py-2 text-sm font-semibold
             bg-blue-600 text-white hover:bg-blue-500
             disabled:opacity-40 disabled:cursor-not-allowed
             transition-colors"
      @click="onApply"
    >
      APPLY
    </button>

    <!-- STOP — visible uniquement pendant une opération, même slot qu'APPLY -->
    <button
      v-else
      class="flex-1 rounded-md px-4 py-2 text-sm font-semibold
             bg-red-700 text-white hover:bg-red-600
             transition-colors"
      @click="onStop"
    >
      <span class="flex items-center justify-center gap-2">
        <Spinner /> ⏹ Arrêt
      </span>
    </button>

  </div>
</template>

<script setup>
import Spinner from './Spinner.vue'

defineProps({
  disabled:     { type: Boolean, default: false },
  pathValid:    { type: Boolean, default: false },
  hasTransfers: { type: Boolean, default: false },
  running:      { type: Boolean, default: false },
  mode:         { type: String,  default: '' },
})

const emit = defineEmits(['test', 'apply', 'stop'])

function onTest()  { emit('test') }
function onApply() { emit('apply') }
function onStop()  { emit('stop') }
</script>
