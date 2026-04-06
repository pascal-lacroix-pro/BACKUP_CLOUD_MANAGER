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

      <!-- Dossier A -->
      <FolderPicker
        label="Dossier A"
        v-model="endpointA"
        :remotes="remotes"
        :disabled="running"
        @valid="validA = $event"
      />

      <!-- Indicateur de direction + bouton swap -->
      <div class="flex items-center gap-3">
        <div class="flex-1 h-px bg-gray-700" />
        <span class="text-xs font-mono text-gray-400">{{ directionLabel }}</span>
        <button
          :disabled="running"
          class="rounded-full w-7 h-7 flex items-center justify-center
                 bg-gray-700 hover:bg-gray-600 text-gray-300
                 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Inverser la direction"
          @click="swapDirection"
        >⇅</button>
        <div class="flex-1 h-px bg-gray-700" />
      </div>

      <!-- Dossier B -->
      <FolderPicker
        label="Dossier B"
        v-model="endpointB"
        :remotes="remotes"
        :disabled="running"
        @valid="validB = $event"
      />

      <!-- Boutons TEST / APPLY / STOP -->
      <ActionButtons
        :path-valid="endpointsValid"
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
import FolderPicker from "./components/FolderPicker.vue";
import ActionButtons from "./components/ActionButtons.vue";
import LogViewer from "./components/LogViewer.vue";
import FileList from "./components/FileList.vue";

// ─── État ────────────────────────────────────────────────────────────────────

const endpointA = ref({ type: "local", localPath: "", remote: "", remotePath: "" });
const endpointB = ref({ type: "local", localPath: "", remote: "", remotePath: "" });
const direction = ref("a-to-b"); // 'a-to-b' | 'b-to-a'
const validA    = ref(false);
const validB    = ref(false);
const remotes   = ref([]);
const running   = ref(false);
const mode      = ref("");
const logs      = ref([]);
const exitCode  = ref(null);
const showLogs  = ref(false);
const fileList  = ref([]);
const fileDone  = ref(0);

// ─── Computed ─────────────────────────────────────────────────────────────────

const endpointsValid = computed(() => validA.value && validB.value);

const hasTransfers = computed(() =>
  fileList.value.some((f) => f.status === "pending")
);

const directionLabel = computed(() =>
  direction.value === "a-to-b" ? "A → B" : "B → A"
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rclonePath(ep) {
  if (ep.type === "local") return ep.localPath;
  return `${ep.remote}:${ep.remotePath}`;
}

function srcDst() {
  const a = rclonePath(endpointA.value);
  const b = rclonePath(endpointB.value);
  return direction.value === "a-to-b"
    ? { src: a, dst: b }
    : { src: b, dst: a };
}

function swapDirection() {
  direction.value = direction.value === "a-to-b" ? "b-to-a" : "a-to-b";
}

// ─── Abonnements IPC ─────────────────────────────────────────────────────────

let unsubLog = null;
let unsubFile = null;
let unsubDone = null;

onMounted(async () => {
  remotes.value = await window.rcloneAPI.listRemotes();

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
    }
  );

  unsubDone = window.rcloneAPI.onDone(({ code }) => {
    exitCode.value = code;
    running.value  = false;
    mode.value     = "";
  });
});

onUnmounted(() => {
  unsubLog?.();
  unsubFile?.();
  unsubDone?.();
});

// ─── Actions ─────────────────────────────────────────────────────────────────

function handleTest() {
  logs.value     = [];
  exitCode.value = null;
  fileDone.value = 0;
  fileList.value = [];
  running.value  = true;
  mode.value     = "test";

  const { src, dst } = srcDst();
  window.rcloneAPI.diff(src, dst);
}

async function handleApply() {
  const { src, dst } = srcDst();
  const confirmed = await window.rcloneAPI.confirm(
    `Copier :\n  ${src}\n→ ${dst}\n\nCette action copie des fichiers réels.`
  );
  if (!confirmed) return;

  logs.value     = [];
  exitCode.value = null;
  fileDone.value = 0;
  running.value  = true;
  mode.value     = "apply";

  // Liste des fichiers identifiés au TEST → pas de re-scan
  const filesList = fileList.value
    .filter((f) => f.status === "pending")
    .map((f) => f.name);
  fileList.value.forEach((f) => { f.status = "pending"; });

  window.rcloneAPI.run(src, dst, filesList);
}

function handleStop() {
  window.rcloneAPI.stop();
}

function clearLogs() {
  logs.value     = [];
  exitCode.value = null;
  fileList.value = [];
  fileDone.value = 0;
}
</script>
