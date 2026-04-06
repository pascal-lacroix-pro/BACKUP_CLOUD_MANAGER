<template>
  <div
    class="min-h-screen bg-gray-900 text-white flex items-start justify-center p-6"
  >
    <div class="w-full max-w-xl flex flex-col gap-6 py-4">
      <!-- En-tête -->
      <div>
        <h1 class="text-xl font-bold tracking-tight">BACKUP CLOUD MANAGER</h1>
        <p class="text-sm text-gray-400 mt-1">
          Synchronisation sécurisée via rclone
        </p>
      </div>

      <!-- Chemin -->
      <PathInput
        v-model="subPath"
        :disabled="running"
        @valid="pathValid = $event"
      />

      <!-- Direction -->
      <div class="flex flex-col gap-1">
        <span class="text-sm font-medium text-gray-300">Direction</span>
        <DirectionToggle v-model="direction" :disabled="running" />
      </div>

      <!-- Boutons TEST / APPLY / STOP -->
      <ActionButtons
        :path-valid="pathValid"
        :has-transfers="hasTransfers"
        :running="running"
        :mode="mode"
        @test="handleTest"
        @apply="handleApply"
        @stop="handleStop"
      />

      <!-- Liste des fichiers -->
      <FileList :files="fileList" :done="fileDone" />

      <!-- Statut final -->
      <p
        v-if="exitCode !== null"
        :class="exitCode === 0 ? 'text-green-400' : 'text-red-400'"
        class="text-xs font-semibold -mt-2"
      >
        {{
          exitCode === 0
            ? "✓ Terminé avec succès."
            : `✗ Terminé avec le code ${exitCode}.`
        }}
      </p>

      <!-- Toggle logs -->
      <div class="flex items-center justify-between">
        <button
          class="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          @click="showLogs = !showLogs"
        >
          <span>{{ showLogs ? "▾" : "▸" }}</span>
          Logs rclone
          <span v-if="logs.length > 0" class="text-gray-600"
            >({{ logs.length }})</span
          >
        </button>
        <button
          v-if="logs.length > 0 && showLogs"
          class="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          @click="clearLogs"
        >
          Effacer
        </button>
      </div>

      <div v-show="showLogs" class="-mt-4">
        <LogViewer :lines="logs" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import PathInput from "./components/PathInput.vue";
import DirectionToggle from "./components/DirectionToggle.vue";
import ActionButtons from "./components/ActionButtons.vue";
import LogViewer from "./components/LogViewer.vue";
import FileList from "./components/FileList.vue";

// ─── État ────────────────────────────────────────────────────────────────────

const subPath = ref("");
const direction = ref("ssd-to-dropbox");
const pathValid = ref(false);
const running = ref(false);
const mode = ref("");
const logs = ref([]);
const exitCode = ref(null);
const showLogs = ref(false);

const fileList = ref([]); // [{ name, size, date, status }]
const fileDone = ref(0);

// APPLY activé uniquement si des fichiers en attente existent
const hasTransfers = computed(() =>
  fileList.value.some((f) => f.status === "pending"),
);

// ─── Abonnements IPC ─────────────────────────────────────────────────────────

let unsubLog = null;
let unsubFile = null;
let unsubDone = null;

onMounted(() => {
  unsubLog = window.rcloneAPI.onLog((line) => {
    logs.value.push(line);
  });

  unsubFile = window.rcloneAPI.onFile(
    ({ name, size, sizeBytes, date, status }) => {
      if (status === "pending") {
        if (!fileList.value.find((f) => f.name === name))
          fileList.value.push({
            name,
            size,
            sizeBytes: sizeBytes || 0,
            date,
            status: "pending",
          });
      } else if (status === "done") {
        const existing = fileList.value.find((f) => f.name === name);
        if (existing) {
          existing.status = "done";
        } else {
          fileList.value.push({
            name,
            size: size || "—",
            sizeBytes: sizeBytes || 0,
            date: date || "—",
            status: "done",
          });
        }
        fileDone.value++;
      }
    },
  );

  unsubDone = window.rcloneAPI.onDone(({ code }) => {
    exitCode.value = code;
    running.value = false;
    mode.value = "";
  });
});

onUnmounted(() => {
  unsubLog?.();
  unsubFile?.();
  unsubDone?.();
});

// ─── Actions ─────────────────────────────────────────────────────────────────

function startRun(dryRun) {
  logs.value = [];
  exitCode.value = null;
  fileDone.value = 0;
  running.value = true;
  mode.value = dryRun ? "test" : "apply";

  if (dryRun) {
    fileList.value = [];
  } else {
    fileList.value.forEach((f) => {
      f.status = "pending";
    });
  }

  window.rcloneAPI.run(subPath.value, direction.value, dryRun);
}

function handleTest() {
  startRun(true);
}

async function handleApply() {
  const dirLabel =
    direction.value === "ssd-to-dropbox" ? "SSD → Dropbox" : "Dropbox → SSD";
  const confirmed = await window.rcloneAPI.confirm(
    `Copier "${subPath.value}" (${dirLabel}) ?\n\nCette action copie des fichiers réels.`,
  );
  if (confirmed) startRun(false);
}

function handleStop() {
  window.rcloneAPI.stop();
}

function clearLogs() {
  logs.value = [];
  exitCode.value = null;
  fileList.value = [];
  fileDone.value = 0;
}
</script>
