<script setup lang="ts">
interface Props {
  months: string[]
  modelValue: string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void
}>()

const isOpen = ref(false)

const currentLabel = computed(() => {
  if (!props.modelValue)
    return 'All history'
  return props.modelValue
})

const dropdownPosition = ref<Record<string, string>>({})

function toggle(event: MouseEvent) {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    dropdownPosition.value = {
      top: `${rect.bottom + 4}px`,
      left: `${rect.left}px`,
    }
  }
}

function select(value: string | null) {
  emit('update:modelValue', value)
  isOpen.value = false
}
</script>

<template>
  <div class="relative">
    <button
      class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-300 bg-slate-800/80 border border-slate-700 rounded-md hover:bg-slate-750 hover:text-slate-100 hover:border-slate-600 transition-all"
      @click="toggle"
    >
      <svg
        class="w-3.5 h-3.5 text-slate-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
      <span class="max-w-[120px] truncate tabular-nums">{{ currentLabel }}</span>
      <svg
        class="w-3 h-3 text-slate-500 transition-transform"
        :class="{ 'rotate-180': isOpen }"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <Teleport to="body">
      <div
        v-if="isOpen"
        class="fixed z-50"
        :style="dropdownPosition"
      >
        <div class="max-h-[280px] overflow-y-auto bg-slate-900 border border-slate-700 rounded-lg shadow-xl shadow-black/40 min-w-[160px] py-1">
          <button
            class="w-full px-3 py-1.5 text-left text-sm text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
            :class="{ 'bg-slate-800 text-slate-100': !modelValue }"
            @click="select(null)"
          >
            All history
          </button>
          <div class="border-t border-slate-800 my-1" />
          <button
            v-for="m in months"
            :key="m"
            class="w-full px-3 py-1.5 text-left text-sm tabular-nums text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
            :class="{ 'bg-slate-800 text-slate-100': modelValue === m }"
            @click="select(m)"
          >
            {{ m }}
          </button>
        </div>
      </div>
    </Teleport>

    <!-- Backdrop to close dropdown -->
    <div
      v-if="isOpen"
      class="fixed inset-0 z-40"
      @click="isOpen = false"
    />
  </div>
</template>
