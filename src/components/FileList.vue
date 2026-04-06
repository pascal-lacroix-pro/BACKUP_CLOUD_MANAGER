<template>
  <div v-if="files.length > 0" class="flex flex-col gap-2">

    <!-- En-tête : restant + données -->
    <div class="flex items-baseline justify-between">
      <span class="text-sm font-medium text-gray-300">
        Fichiers détectés
      </span>
      <div class="flex items-baseline gap-3">
        <!-- Taille restante / totale -->
        <span v-if="totalBytes > 0" class="text-xs font-mono tabular-nums text-gray-400">
          <template v-if="isDone">{{ formatBytes(totalBytes) }}</template>
          <template v-else>{{ formatBytes(remainingBytes) }} / {{ formatBytes(totalBytes) }}</template>
        </span>
        <!-- Compteur restant -->
        <span class="text-sm font-mono tabular-nums" :class="isDone ? 'text-green-400' : 'text-blue-400'">
          <template v-if="isDone">
            ✓ {{ files.length }} fichier{{ files.length > 1 ? 's' : '' }}
          </template>
          <template v-else>
            {{ remaining }} restant{{ remaining > 1 ? 's' : '' }}
            <span class="text-gray-500">/ {{ files.length }}</span>
          </template>
        </span>
      </div>
    </div>

    <!-- Barre de progression -->
    <div class="h-1.5 w-full rounded-full bg-gray-700 overflow-hidden">
      <div
        class="h-full rounded-full transition-all duration-300"
        :class="isDone ? 'bg-green-500' : 'bg-blue-500'"
        :style="{ width: progressPct + '%' }"
      />
    </div>

    <!-- Liste complète des fichiers -->
    <div class="overflow-y-auto rounded-md border border-gray-700 bg-gray-950"
         :style="{ maxHeight: listMaxHeight }">
      <!-- Fichiers restants en premier, transférés ensuite -->
      <div
        v-for="file in sortedFiles"
        :key="file.name"
        class="flex items-center gap-2 px-3 py-1.5 border-b border-gray-800 last:border-0
               transition-all duration-300"
        :class="{
          'opacity-40': file.status === 'done',
          'bg-red-950/20': file.status === 'error',
        }"
      >
        <!-- Checkbox visuelle -->
        <span class="shrink-0 w-4 h-4 flex items-center justify-center
                     rounded border text-xs leading-none transition-all duration-300"
              :class="{
                'border-green-500 bg-green-500 text-white':  file.status === 'done',
                'border-red-500   bg-red-500   text-white':  file.status === 'error',
                'border-gray-500  bg-transparent':           file.status === 'pending',
              }">
          <span v-if="file.status === 'done'">✓</span>
          <span v-else-if="file.status === 'error'">✗</span>
        </span>

        <!-- Nom du fichier -->
        <span
          class="flex-1 truncate text-xs font-mono transition-all duration-300"
          :class="{
            'line-through text-gray-500': file.status === 'done',
            'text-red-400':               file.status === 'error',
            'text-gray-200':              file.status === 'pending',
          }"
          :title="file.name"
        >{{ file.name }}</span>

        <!-- Taille -->
        <span class="shrink-0 w-16 text-right text-xs font-mono tabular-nums"
              :class="file.status === 'done' ? 'text-gray-600' : 'text-gray-500'">
          {{ file.size || '—' }}
        </span>

        <!-- Date -->
        <span class="shrink-0 w-32 text-right text-xs font-mono tabular-nums"
              :class="file.status === 'done' ? 'text-gray-600' : 'text-gray-500'">
          {{ file.date || '—' }}
        </span>
      </div>
    </div>

  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  files: { type: Array,  default: () => [] },
  done:  { type: Number, default: 0 },
})

const LIST_ROW_HEIGHT = 32
const MAX_VISIBLE    = 5

const listMaxHeight = computed(() => `${MAX_VISIBLE * LIST_ROW_HEIGHT}px`)

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

const totalBytes = computed(() =>
  props.files.reduce((sum, f) => sum + (f.sizeBytes || 0), 0)
)

const remainingBytes = computed(() =>
  props.files
    .filter(f => f.status === 'pending')
    .reduce((sum, f) => sum + (f.sizeBytes || 0), 0)
)

// Fichiers restants en haut, transférés en bas (tri stable)
const sortedFiles = computed(() => {
  return [...props.files].sort((a, b) => {
    const order = { pending: 0, error: 1, done: 2 }
    return (order[a.status] ?? 0) - (order[b.status] ?? 0)
  })
})

const progressPct = computed(() =>
  props.files.length === 0 ? 0 : Math.round((props.done / props.files.length) * 100)
)

const remaining = computed(() => Math.max(props.files.length - props.done, 0))

const isDone = computed(() =>
  props.files.length > 0 && props.done >= props.files.length
)
</script>
