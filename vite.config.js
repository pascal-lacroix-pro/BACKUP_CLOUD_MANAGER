import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Electron charge via file:// — l'attribut crossorigin bloque les modules ES
const removeCrossorigin = {
  name: 'remove-crossorigin',
  transformIndexHtml: (html) => html.replace(/ crossorigin(="[^"]*")?/g, ''),
}

export default defineConfig({
  plugins: [vue(), removeCrossorigin],
  base: './',   // chemins relatifs indispensables pour electron:build
  server: {
    port: 5173, // port attendu par wait-on dans electron:dev
  },
})
