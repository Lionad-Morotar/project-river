<script setup lang="ts">
/**
 * AgentToolCard — 折叠/展开 tool-call 卡片
 *
 * 展示单个 tool-call 的输入参数、返回结果、执行时长和错误状态。
 * 默认折叠，点击 header 展开显示 JSON 详情。
 */
interface Props {
  name: string
  input: unknown
  output: unknown | null
  isError: boolean
  status: 'running' | 'done'
  index: number
  duration?: number
}

const props = defineProps<Props>()
const { t } = useI18n()
const expanded = ref(false)

const statusIcon = computed(() => {
  if (props.status === 'running')
    return 'i-lucide-loader-2'
  return expanded.value ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'
})
</script>

<template>
  <div
    class="rounded border overflow-hidden"
    :class="isError ? 'border-red-500' : 'border-default'"
  >
    <!-- Header: clickable toggle -->
    <button
      class="w-full flex items-center gap-2 p-2 text-left hover:bg-elevated/50 transition-colors"
      :aria-expanded="expanded"
      :aria-controls="`tool-body-${index}`"
      @click="expanded = !expanded"
    >
      <span class="text-xs font-semibold text-muted shrink-0">
        {{ t('agent.toolcard.step', { n: index }) }}
      </span>
      <code class="text-xs text-default truncate">{{ name }}</code>
      <UIcon
        v-if="status === 'running'"
        name="i-lucide-loader-2"
        class="w-3.5 h-3.5 text-muted animate-spin shrink-0 ml-auto"
      />
      <span
        v-else-if="isError"
        class="ml-auto text-[10px] font-semibold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded shrink-0"
      >
        Error
      </span>
      <UIcon
        v-else
        :name="statusIcon"
        class="w-3.5 h-3.5 text-muted shrink-0 ml-auto transition-transform"
      />
    </button>

    <!-- Body: expanded content -->
    <div
      v-show="expanded"
      :id="`tool-body-${index}`"
      class="p-2 border-t border-default space-y-2"
    >
      <!-- Input -->
      <div>
        <p class="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">
          {{ t('agent.toolcard.input') }}
        </p>
        <pre class="text-xs font-mono text-dimmed bg-default p-2 rounded overflow-x-auto">{{ JSON.stringify(input, null, 2) }}</pre>
      </div>

      <!-- Output -->
      <div v-if="output !== null">
        <p class="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">
          {{ t('agent.toolcard.output') }}
        </p>
        <pre class="text-xs font-mono text-dimmed bg-default p-2 rounded overflow-x-auto">{{ JSON.stringify(output, null, 2) }}</pre>
      </div>

      <!-- Duration -->
      <p v-if="duration !== undefined" class="text-[10px] text-muted text-right">
        {{ t('agent.toolcard.duration', { n: duration }) }}
      </p>
    </div>
  </div>
</template>
