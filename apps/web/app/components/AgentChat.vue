<script setup lang="ts">
/**
 * AgentChat — FAB + USlideover drawer + 10 状态机 + SSE 消费
 *
 * 用户与 Agent 交互的唯一入口。右下悬浮 FAB 点击后展开 USlideover drawer，
 * 支持 SSE 流式 token、tool-call 卡片、5 个 chip 快捷提问、10 类 UI 状态。
 */
import { fetchEventSource } from '@microsoft/fetch-event-source'
import AgentToolCard from './AgentToolCard.vue'

const props = defineProps<{ projectId: number }>()
const { t } = useI18n()

// ── Display mode: 'fab' | 'drawer' (D-02) ──
const displayMode = ref<'fab' | 'drawer'>('fab')
const open = computed({
  get: () => displayMode.value === 'drawer',
  set: (v) => { displayMode.value = v ? 'drawer' : 'fab' },
})
function minimize() { displayMode.value = 'fab' }
function expand() { displayMode.value = 'drawer' }

// ── State machine (D-07) ──
type AgentPhase = 'idle' | 'streaming' | 'tool-calling' | 'stream-mid-error'
  | 'abort' | 'rate-limit' | 'cost-cap' | 'input-too-long'
  | 'api-key-missing' | 'empty-result'

interface ToolCallItem {
  id: string
  name: string
  input: unknown
  output?: unknown
  isError: boolean
  status: 'running' | 'done'
  index: number
  duration?: number
}

interface AgentMessage {
  role: 'user' | 'assistant'
  text: string
  toolCalls?: ToolCallItem[]
}

const phase = ref<AgentPhase>('idle')
const messages = reactive<AgentMessage[]>([])
const inputValue = ref('')
const sessionTokens = ref(0)
let abortController: AbortController | null = null

const inputTooLong = computed(() => inputValue.value.length > 500)

// Reset input-too-long when length drops
watch(inputTooLong, (v) => {
  if (!v && phase.value === 'input-too-long')
    phase.value = 'idle'
})

// Chip definitions (D-14)
const chips = computed(() => [
  t('agent.chip.1'),
  t('agent.chip.2'),
  t('agent.chip.3'),
  t('agent.chip.4'),
  t('agent.chip.5'),
])

function handleChipClick(text: string) {
  inputValue.value = text
  submit(text)
}

// ── SSE submit ──
async function submit(text: string) {
  if (!text.trim() || inputTooLong.value)
    return

  abortController = new AbortController()
  phase.value = 'streaming'
  messages.push({ role: 'user', text: text.trim() })

  const assistant: AgentMessage = reactive({
    role: 'assistant',
    text: '',
    toolCalls: [],
  })
  messages.push(assistant)

  const toolStartTimes = new Map<string, number>()
  let toolIndex = 0

  try {
    await fetchEventSource(`/api/projects/${props.projectId}/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text.trim() }),
      signal: abortController.signal,
      async onopen(response) {
        if (response.status === 503) {
          phase.value = 'api-key-missing'
          throw new Error('api-key-missing')
        }
        if (response.status === 429) {
          const retry = Number(response.headers.get('retry-after') ?? 30)
          phase.value = 'rate-limit'
          startRateLimitCountdown(retry)
          throw new Error('rate-limit')
        }
        if (response.status === 400) {
          phase.value = 'stream-mid-error'
          throw new Error('bad-request')
        }
        if (!response.ok) {
          phase.value = 'stream-mid-error'
          throw new Error(`HTTP ${response.status}`)
        }
      },
      onmessage(ev) {
        const payload = JSON.parse(ev.data)
        switch (payload.type) {
          case 'text':
            assistant.text += payload.token
            sessionTokens.value += 1
            if (sessionTokens.value > 50_000)
              phase.value = 'cost-cap'
            break
          case 'tool-call':
            phase.value = 'tool-calling'
            toolStartTimes.set(payload.id, Date.now())
            toolIndex += 1
            assistant.toolCalls!.push({
              id: payload.id,
              name: payload.name,
              input: payload.args,
              output: null,
              isError: false,
              status: 'running',
              index: toolIndex,
            })
            break
          case 'tool-result': {
            const tc = assistant.toolCalls!.find(t => t.id === payload.id)
            if (tc) {
              tc.output = payload.result
              tc.isError = payload.isError
              tc.status = 'done'
              const start = toolStartTimes.get(payload.id)
              if (start)
                tc.duration = Date.now() - start
            }
            phase.value = 'streaming'
            break
          }
          case 'done':
            phase.value = assistant.text.trim() === '' ? 'empty-result' : 'idle'
            break
          case 'error':
            phase.value = 'stream-mid-error'
            break
        }
      },
      onerror(err) {
        if (abortController?.signal.aborted)
          phase.value = 'abort'
        else
          phase.value = 'stream-mid-error'
        throw err // stop auto-retry
      },
    })
  }
  catch {
    // phase already set in onopen/onerror/onmessage
  }
}

function abort() {
  abortController?.abort()
  phase.value = 'abort'
}

function retry() {
  phase.value = 'idle'
}

// Rate limit countdown
const rateLimitSeconds = ref(0)
let rateLimitTimer: ReturnType<typeof setInterval> | null = null
function startRateLimitCountdown(seconds: number) {
  rateLimitSeconds.value = seconds
  if (rateLimitTimer)
    clearInterval(rateLimitTimer)
  rateLimitTimer = setInterval(() => {
    rateLimitSeconds.value -= 1
    if (rateLimitSeconds.value <= 0) {
      clearInterval(rateLimitTimer!)
      rateLimitTimer = null
      phase.value = 'idle'
    }
  }, 1000)
}

// Cleanup
onBeforeUnmount(() => {
  abortController?.abort()
  if (rateLimitTimer)
    clearInterval(rateLimitTimer)
})

// Auto-focus input when drawer opens
watch(open, (v) => {
  if (v) {
    nextTick(() => {
      inputRef.value?.focus()
    })
  }
})

const inputRef = ref<HTMLInputElement | null>(null)
</script>

<template>
  <div>
    <!-- FAB Button (D-01, D-02) -->
    <button
      v-show="displayMode === 'fab'"
      class="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-sky-500 text-white shadow-lg shadow-black/30 flex items-center justify-center hover:bg-sky-400 transition-colors"
      :aria-label="t('agent.askButton')"
      @click="expand"
    >
      <UIcon name="i-lucide-message-circle-question" class="w-6 h-6" />
    </button>

    <!-- USlideover Drawer (D-03, UI-05) -->
    <USlideover
      v-model:open="open"
      side="right"
      :dismissible="false"
      class="w-[40vw] max-md:w-full"
    >
      <template #header>
        <div class="flex items-center justify-between w-full">
          <h3 class="text-base font-semibold text-highlighted">
            {{ t('agent.drawer.title') }}
          </h3>
          <button
            class="hover:bg-elevated/60 p-1.5 rounded text-muted hover:text-default transition-colors"
            :aria-label="t('agent.drawer.minimize')"
            @click="minimize"
          >
            <UIcon name="i-lucide-chevrons-down-up" class="w-4 h-4" />
          </button>
        </div>
      </template>

      <template #body>
        <div class="flex flex-col h-full">
          <!-- Message list -->
          <div class="flex-1 overflow-y-auto space-y-4 p-4 min-h-0">
            <!-- Idle: chips -->
            <div v-if="phase === 'idle' && messages.length === 0" class="flex flex-wrap gap-2">
              <button
                v-for="(chip, idx) in chips"
                :key="idx"
                class="px-3 py-1.5 text-xs rounded-full border border-default bg-elevated/30 text-dimmed hover:border-sky-500 hover:bg-sky-500/10 hover:text-default transition-all"
                @click="handleChipClick(chip)"
              >
                {{ chip }}
              </button>
            </div>

            <!-- Empty result -->
            <div v-else-if="phase === 'empty-result'" class="text-center py-8">
              <p class="text-sm text-muted">{{ t('agent.error.noData') }}</p>
              <div class="flex flex-wrap gap-2 mt-4 justify-center">
                <button
                  v-for="(chip, idx) in chips"
                  :key="idx"
                  class="px-3 py-1.5 text-xs rounded-full border border-default bg-elevated/30 text-dimmed hover:border-sky-500 hover:bg-sky-500/10 hover:text-default transition-all"
                  @click="handleChipClick(chip)"
                >
                  {{ chip }}
                </button>
              </div>
            </div>

            <!-- Messages -->
            <template v-for="(msg, idx) in messages" :key="idx">
              <!-- User message -->
              <div v-if="msg.role === 'user'" class="flex justify-end">
                <div class="bg-elevated rounded-lg px-3 py-2 max-w-[85%]">
                  <p class="text-sm text-default">{{ msg.text }}</p>
                </div>
              </div>

              <!-- Assistant message -->
              <div v-else class="flex justify-start">
                <div class="max-w-[85%] space-y-2">
                  <div class="bg-default border border-default rounded-lg px-3 py-2">
                    <p class="text-sm text-default whitespace-pre-wrap">{{ msg.text }}</p>
                    <!-- Streaming cursor -->
                    <span v-if="phase === 'streaming' && idx === messages.length - 1" class="inline-block w-0.5 h-4 bg-sky-500 ml-0.5 align-middle animate-pulse" />
                  </div>

                  <!-- Tool cards -->
                  <div v-if="msg.toolCalls?.length" class="space-y-2">
                    <AgentToolCard
                      v-for="tc in msg.toolCalls"
                      :key="tc.id"
                      :name="tc.name"
                      :input="tc.input"
                      :output="tc.output"
                      :is-error="tc.isError"
                      :status="tc.status"
                      :index="tc.index"
                      :duration="tc.duration"
                    />
                  </div>

                  <!-- Abort badge -->
                  <div v-if="phase === 'abort' && idx === messages.length - 1" class="text-xs text-muted">
                    {{ t('agent.error.aborted') }}
                  </div>
                </div>
              </div>
            </template>

            <!-- Error banner: stream-mid-error -->
            <div v-if="phase === 'stream-mid-error'" class="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-3">
              <UIcon name="i-lucide-alert-circle" class="w-4 h-4 text-red-400 shrink-0" />
              <p class="text-xs text-red-400 flex-1">{{ t('agent.error.streamInterrupted') }}</p>
              <button
                class="px-2 py-1 text-xs rounded bg-elevated text-default hover:bg-elevated/80 transition-colors"
                @click="retry"
              >
                <UIcon name="i-lucide-refresh-cw" class="w-3 h-3 inline mr-1" />
                {{ t('common.retry') }}
              </button>
            </div>

            <!-- Rate limit banner -->
            <div v-if="phase === 'rate-limit'" class="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <p class="text-xs text-amber-400">{{ t('agent.error.rateLimited', { n: rateLimitSeconds }) }}</p>
            </div>

            <!-- Cost cap banner -->
            <div v-if="phase === 'cost-cap'" class="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
              <p class="text-xs text-orange-400">{{ t('agent.error.costCap') }}</p>
            </div>

            <!-- API key missing overlay -->
            <div v-if="phase === 'api-key-missing'" class="absolute inset-0 bg-default/90 flex flex-col items-center justify-center p-6 z-10">
              <UIcon name="i-lucide-key-round" class="w-8 h-8 text-muted mb-3" />
              <p class="text-sm text-muted text-center">{{ t('agent.error.apiKeyMissing') }}</p>
            </div>
          </div>

          <!-- Composer -->
          <div class="border-t border-default p-3 shrink-0">
            <div class="flex items-end gap-2">
              <div class="flex-1 relative">
                <input
                  ref="inputRef"
                  v-model="inputValue"
                  type="text"
                  class="w-full bg-elevated border border-default rounded-lg px-3 py-2 text-sm text-default placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-sky-500/30"
                  :placeholder="t('agent.drawer.placeholder')"
                  :disabled="phase === 'streaming' || phase === 'tool-calling' || phase === 'rate-limit' || phase === 'cost-cap' || phase === 'api-key-missing'"
                  @keyup.enter="submit(inputValue)"
                >
                <span
                  class="absolute right-2 bottom-2 text-[10px] tabular-nums"
                  :class="inputTooLong ? 'text-red-400' : 'text-muted'"
                >
                  {{ t('agent.error.inputTooLong', { n: inputValue.length }) }}
                </span>
              </div>

              <!-- Submit / Stop button -->
              <button
                v-if="phase === 'streaming' || phase === 'tool-calling'"
                class="w-9 h-9 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center justify-center transition-colors shrink-0"
                :aria-label="t('common.cancel')"
                @click="abort"
              >
                <UIcon name="i-lucide-square" class="w-4 h-4" />
              </button>
              <button
                v-else
                class="w-9 h-9 rounded-lg bg-sky-500 text-white hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0"
                :disabled="!inputValue.trim() || inputTooLong"
                :aria-label="t('common.confirm')"
                @click="submit(inputValue)"
              >
                <UIcon name="i-lucide-send" class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </template>
    </USlideover>
  </div>
</template>
