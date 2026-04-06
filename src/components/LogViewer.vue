<template>
  <div
    ref="logBox"
    class="h-56 overflow-y-auto rounded-md border border-gray-700
           bg-gray-950 p-3 font-mono text-xs text-gray-300 scroll-smooth"
  >
    <p v-if="lines.length === 0" class="text-gray-600 italic">En attente…</p>
    <p
      v-for="(line, i) in lines"
      :key="i"
      :class="lineClass(line)"
      class="whitespace-pre-wrap leading-5"
    >{{ line }}</p>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  lines: { type: Array, default: () => [] },
})

const logBox = ref(null)

watch(() => props.lines.length, async () => {
  await nextTick()
  if (logBox.value) logBox.value.scrollTop = logBox.value.scrollHeight
})

function lineClass(line) {
  if (/\[ERREUR\]|error|ERROR/.test(line))   return 'text-red-400'
  if (/NOTICE|notice/.test(line))             return 'text-yellow-400'
  if (/Transferred|transferred/.test(line))   return 'text-green-400'
  if (/^--dry-run|dry.run/i.test(line))       return 'text-yellow-300'
  return 'text-gray-300'
}
</script>
