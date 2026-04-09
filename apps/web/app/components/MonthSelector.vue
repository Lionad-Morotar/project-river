<script setup lang="ts">
interface Props {
  months: string[]
  modelValue: string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void
}>()

const items = computed(() => [
  { label: 'All history', value: null },
  ...props.months.map(m => ({ label: m, value: m })),
])
</script>

<template>
  <USelectMenu
    :model-value="modelValue"
    :items="items"
    value-attribute="value"
    placeholder="Select month"
    class="w-48"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
