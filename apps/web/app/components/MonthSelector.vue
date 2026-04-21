<script setup lang="ts">
const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void
}>()

const { t } = useI18n()

interface Props {
  months: string[]
  modelValue: string | null
}

const isOpen = ref(false)

const currentLabel = computed(() => {
  if (!props.modelValue)
    return t('monthSelector.allHistory')
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
      class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-toned bg-elevated/80 border border-accented rounded-md hover:bg-elevated hover:text-highlighted hover:border-accented transition-all"
      @click="toggle"
    >
      <svg
        class="w-3.5 h-3.5 text-dimmed"
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
        class="w-3 h-3 text-dimmed transition-transform"
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
        <div class="max-h-[280px] overflow-y-auto bg-muted border border-accented rounded-lg shadow-xl shadow-sm min-w-[160px] py-1">
          <button
            class="w-full px-3 py-1.5 text-left text-sm text-toned hover:bg-elevated hover:text-highlighted transition-colors"
            :class="{ 'bg-elevated text-highlighted': !modelValue }"
            @click="select(null)"
          >
            {{ $t('monthSelector.allHistory') }}
          </button>
          <div class="border-t border-default my-1" />
          <button
            v-for="m in months"
            :key="m"
            class="w-full px-3 py-1.5 text-left text-sm tabular-nums text-toned hover:bg-elevated hover:text-highlighted transition-colors"
            :class="{ 'bg-elevated text-highlighted': modelValue === m }"
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
