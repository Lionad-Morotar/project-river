<script setup lang="ts">
import { COLOR_THEMES, useAppSettings } from '~/composables/useAppSettings'

defineProps<{ open: boolean, showStorage?: boolean }>()
const emit = defineEmits<{ (e: 'update:open', val: boolean): void }>()

const { settings: appSettings, updateTheme, toggleSaveLocally } = useAppSettings()

function close() {
  emit('update:open', false)
}
</script>

<template>
  <div
    v-if="open"
    class="z-50 fixed inset-0 flex justify-center items-center"
    @click.self="close"
  >
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" />

    <!-- Modal content -->
    <div class="z-10 relative bg-elevated shadow-2xl p-6 border border-default rounded-xl w-full max-w-sm">
      <div class="flex justify-between items-center mb-5">
        <h2 class="font-semibold text-highlighted text-lg">
          {{ $t('settings.title') }}
        </h2>
        <button
          class="hover:bg-elevated/60 p-1 rounded text-muted hover:text-default transition-colors"
          @click="close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      <!-- Style group: theme color -->
      <div class="mb-5">
        <h3 class="mb-2 font-medium text-muted text-xs uppercase tracking-wider">
          {{ $t('settings.styleGroup') }}
        </h3>
        <div class="flex gap-2">
          <button
            v-for="(theme, idx) in COLOR_THEMES"
            :key="theme.id"
            class="flex-1 border-2 rounded-md h-10 overflow-hidden cursor-pointer transition-all"
            :class="appSettings.themeIndex === idx ? 'border-accented ring-2 ring-accented/30 scale-105' : 'border-default hover:border-muted'"
            @click="updateTheme(idx)"
          >
            <div class="flex h-full">
              <div class="flex-1" :style="{ background: theme.swatches[0] }" />
              <div class="flex-1" :style="{ background: theme.swatches[1] }" />
              <div class="flex-1" :style="{ background: theme.swatches[2] }" />
            </div>
          </button>
        </div>
        <p class="mt-1.5 text-[10px] text-muted">
          {{ $t('settings.themeHint') }}
        </p>
      </div>

      <!-- Storage group: local save -->
      <div v-if="showStorage">
        <h3 class="mb-2 font-medium text-muted text-xs uppercase tracking-wider">
          {{ $t('settings.storageGroup') }}
        </h3>
        <label class="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            class="bg-elevated border-muted rounded focus:ring-1 focus:ring-sky-500/30 w-4 h-4 text-sky-500 cursor-pointer"
            :checked="appSettings.saveLocally"
            @change="toggleSaveLocally(($event.target as HTMLInputElement).checked)"
          >
          <div>
            <span class="text-default text-sm">{{ $t('settings.saveLocally') }}</span>
            <p class="text-[10px] text-muted">{{ $t('settings.saveLocallyHint') }}</p>
          </div>
        </label>
      </div>
    </div>
  </div>
</template>
