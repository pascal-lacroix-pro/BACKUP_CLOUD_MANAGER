<template>
  <div class="flex flex-col gap-2">
    <span class="text-sm font-medium text-gray-300">{{ label }}</span>

    <!-- Toggle Local / Remote -->
    <div class="flex rounded-md overflow-hidden border border-gray-600 w-fit">
      <button
        v-for="t in ['local', 'remote']"
        :key="t"
        :disabled="disabled"
        :class="[
          'px-4 py-1 text-xs font-semibold transition-colors',
          modelValue.type === t
            ? 'bg-blue-600 text-white'
            : 'bg-gray-800 text-gray-400 hover:bg-gray-700',
          'disabled:opacity-40 disabled:cursor-not-allowed',
        ]"
        @click="update({ type: t })"
      >
        {{ t === 'local' ? 'Local' : 'Remote' }}
      </button>
    </div>

    <!-- Local : champ texte + bouton Parcourir -->
    <div v-if="modelValue.type === 'local'" class="flex gap-2">
      <input
        :value="modelValue.localPath"
        type="text"
        placeholder="/chemin/absolu"
        :disabled="disabled"
        class="flex-1 rounded-md border px-3 py-2 text-sm font-mono
               bg-gray-800 text-white placeholder-gray-500
               border-gray-600 focus:border-blue-500 focus:outline-none
               disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        @input="update({ localPath: $event.target.value })"
      />
      <button
        :disabled="disabled"
        class="rounded-md px-3 py-2 text-xs font-semibold
               bg-gray-700 text-gray-200 hover:bg-gray-600
               disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        @click="browse"
      >
        Parcourir
      </button>
    </div>

    <!-- Remote : dropdown remote + champ sous-chemin -->
    <div v-else class="flex gap-2">
      <select
        :value="modelValue.remote"
        :disabled="disabled || remotes.length === 0"
        class="rounded-md border px-3 py-2 text-sm font-mono
               bg-gray-800 text-white border-gray-600
               focus:border-blue-500 focus:outline-none
               disabled:opacity-40 disabled:cursor-not-allowed"
        @change="update({ remote: $event.target.value })"
      >
        <option value="" disabled>— remote —</option>
        <option v-for="r in remotes" :key="r" :value="r">{{ r }}</option>
      </select>

      <input
        :value="modelValue.remotePath"
        type="text"
        placeholder="sous/chemin (optionnel)"
        :disabled="disabled"
        class="flex-1 rounded-md border px-3 py-2 text-sm font-mono
               bg-gray-800 text-white placeholder-gray-500
               border-gray-600 focus:border-blue-500 focus:outline-none
               disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        @input="update({ remotePath: $event.target.value })"
      />
    </div>

    <!-- Erreur de validation -->
    <p v-if="error" class="text-xs text-red-400">{{ error }}</p>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'

const props = defineProps({
  label:      { type: String,  default: '' },
  modelValue: { type: Object,  default: () => ({ type: 'local', localPath: '', remote: '', remotePath: '' }) },
  remotes:    { type: Array,   default: () => [] },
  disabled:   { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'valid'])

const error = computed(() => {
  const ep = props.modelValue
  if (ep.type === 'local') {
    if (!ep.localPath.trim()) return 'Sélectionnez un dossier.'
    if (!ep.localPath.startsWith('/')) return 'Le chemin doit être absolu (commencer par /).'
  } else {
    if (!ep.remote) return 'Sélectionnez un remote.'
  }
  return ''
})

const isValid = computed(() => error.value === '')

watch(isValid, v => emit('valid', v), { immediate: true })

function update(patch) {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}

async function browse() {
  if (props.disabled) return
  const result = await window.rcloneAPI.browse()
  if (result) update({ localPath: result })
}
</script>
