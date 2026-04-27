<script setup lang="ts">
// pi-mono SSE client spike — throwaway probe for Phase 1 PRE-01
// 通过后立即删除或归档到 docs/spike-archive/
// 访问: http://localhost:10400/_agent-spike

const messages = ref<string[]>([])
const status = ref<'idle' | 'streaming' | 'done' | 'error'>('idle')

onMounted(() => {
  const es = new EventSource('/api/agent/_spike')

  es.onmessage = (event) => {
    const data = JSON.parse(event.data)
    console.log('SSE message:', data)

    if (data.token) {
      messages.value.push(data.token)
      status.value = 'streaming'
    }
    else if (data.done) {
      status.value = 'done'
      es.close()
    }
    else if (data.error) {
      messages.value.push(`ERROR: ${data.error}`)
      status.value = 'error'
      es.close()
    }
  }

  es.onerror = (err) => {
    console.error('EventSource error:', err)
    status.value = 'error'
    es.close()
  }
})
</script>

<template>
  <div class="p-8">
    <h1 class="text-xl font-bold mb-4">
      PRE-01 Spike: pi-mono SSE Streaming
    </h1>
    <p class="mb-4 text-gray-500">
      Status: {{ status }}
    </p>
    <!-- 使用 textContent 渲染，防止 LLM 返回内容中的 XSS -->
    <div class="border rounded p-4 bg-gray-50 dark:bg-gray-900">
      <pre
        v-for="(msg, i) in messages"
        :key="i"
        class="inline"
      >{{ msg }}</pre>
    </div>
  </div>
</template>
