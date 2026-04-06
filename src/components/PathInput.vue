<template>
  <div class="flex flex-col gap-1">
    <label for="path-input" class="text-sm font-medium text-gray-300">
      Sous-chemin à synchroniser
    </label>
    <input
      id="path-input"
      v-model="localValue"
      type="text"
      placeholder="ex: Photos/2023"
      :disabled="disabled"
      class="w-full rounded-md border px-3 py-2 text-sm font-mono
             bg-gray-800 text-white placeholder-gray-500
             border-gray-600 focus:border-blue-500 focus:outline-none
             disabled:opacity-40 disabled:cursor-not-allowed
             transition-colors"
      @input="onInput"
    />
    <p v-if="error" class="text-xs text-red-400">{{ error }}</p>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  disabled:   { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'valid'])

const localValue = ref(props.modelValue)
const error = ref('')

// Même règle que dans main.js : pas de "..", pas de métacaractères shell
function validate(value) {
  if (value.trim() === '') return 'Le chemin ne peut pas être vide.'
  if (/\.\./.test(value)) return 'Le chemin ne peut pas contenir "..".'
  if (/[;&|`$!*?{}[\]<>\\]/.test(value)) return 'Caractères non autorisés.'
  return ''
}

function onInput() {
  const err = validate(localValue.value)
  error.value = err
  if (!err) {
    emit('update:modelValue', localValue.value.trim())
    emit('valid', true)
  } else {
    emit('valid', false)
  }
}

watch(() => props.modelValue, (val) => {
  localValue.value = val
})
</script>
