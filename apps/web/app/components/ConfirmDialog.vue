<script setup lang="ts">
interface Props {
  title: string
  description?: string
  confirmLabel?: string
  confirmColor?: 'error' | 'warning' | 'primary'
  loading?: boolean
}

withDefaults(defineProps<Props>(), {
  description: '',
  confirmLabel: 'Confirm',
  confirmColor: 'primary',
  loading: false,
})

const emit = defineEmits<{
  (e: 'confirm'): void
}>()

const open = defineModel<boolean>('open', { required: true })
</script>

<template>
  <UModal v-model:open="open">
    <template #content>
      <div class="p-5">
        <h3 class="text-sm font-semibold text-highlighted">
          {{ title }}
        </h3>
        <p
          v-if="description"
          class="mt-2 text-xs text-muted"
        >
          {{ description }}
        </p>
        <div class="flex justify-end gap-2 mt-5">
          <UButton
            size="sm"
            variant="ghost"
            color="neutral"
            label="Cancel"
            @click="open = false"
          />
          <UButton
            size="sm"
            :color="confirmColor"
            :label="confirmLabel"
            :loading="loading"
            @click="emit('confirm')"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
