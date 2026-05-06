<script setup lang="ts">
/**
 * AgentChat — FAB + 可拖拽/可缩放浮动面板 + 10 状态机 + SSE 消费
 *
 * 用户与 Agent 交互的唯一入口。右下悬浮 FAB 点击后展开浮动面板，
 * 支持 SSE 流式 token、tool-call 卡片、5 个 chip 快捷提问、10 类 UI 状态。
 */
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { useStorage, watchThrottled } from '@vueuse/core'
import AgentToolCard from './AgentToolCard.vue'

const props = defineProps<{
  projectId: number
  projectName?: string
}>()
const { t } = useI18n()

/** 上下文窗口 token 上限（deepseek-v4-flash = 1M tokens） */
const CONTEXT_WINDOW_TOKENS = 1_000_000

/** 累计已消耗的精确 token 数（由后端 usage 事件提供），按项目持久化 */
const totalTokensConsumed = useStorage(`agent-chat-tokens-${props.projectId}`, 0)

/** 当前对话上下文占用百分比 */
const contextPercent = computed(() => {
  const pct = (totalTokensConsumed.value / CONTEXT_WINDOW_TOKENS) * 100
  return Math.min(pct, 100).toFixed(1)
})

// ── Display mode: 'fab' | 'open' ──
const displayMode = ref<'fab' | 'open'>('fab')
const isOpen = computed(() => displayMode.value === 'open')
function minimize() {
  displayMode.value = 'fab'
}
function expand() {
  displayMode.value = 'open'
}

// ── Panel position & size (draggable + resizable) ──
const MIN_WIDTH = 360
const MIN_HEIGHT = 400
const DEFAULT_WIDTH = 480
const DEFAULT_HEIGHT = 640

const panelPos = useStorage('agent-panel-pos', { x: 0, y: 0 })
const panelSize = useStorage('agent-panel-size', { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })

onMounted(() => {
  // Set default position on first open (bottom-right with margin)
  if (panelPos.value.x === 0 && panelPos.value.y === 0) {
    panelPos.value = {
      x: Math.max(window.innerWidth - DEFAULT_WIDTH - 24, 24),
      y: Math.max(window.innerHeight - DEFAULT_HEIGHT - 24, 24),
    }
  }
})

function startDrag(e: MouseEvent) {
  const startX = e.clientX
  const startY = e.clientY
  const initialX = panelPos.value.x
  const initialY = panelPos.value.y

  function onMouseMove(ev: MouseEvent) {
    panelPos.value.x = initialX + (ev.clientX - startX)
    panelPos.value.y = initialY + (ev.clientY - startY)
  }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function startResize(e: MouseEvent) {
  e.preventDefault()
  const startX = e.clientX
  const startY = e.clientY
  const initialW = panelSize.value.width
  const initialH = panelSize.value.height

  function onMouseMove(ev: MouseEvent) {
    panelSize.value.width = Math.max(MIN_WIDTH, initialW + (ev.clientX - startX))
    panelSize.value.height = Math.max(MIN_HEIGHT, initialH + (ev.clientY - startY))
  }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

// ── State machine ──
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

/** 消息片段：text 或 tool，按事件顺序排列 */
type Part
  = | { type: 'text', content: string }
    | { type: 'tool', toolCall: ToolCallItem }

interface AgentMessage {
  role: 'user' | 'assistant'
  text: string
  toolCalls?: ToolCallItem[]
  /** 按事件顺序排列的片段（text/tool 交错），渲染时优先使用 */
  parts?: Part[]
}

const phase = ref<AgentPhase>('idle')
const inputValue = ref('')
const sessionTokens = ref(0)
let abortController: AbortController | null = null

// ── LocalStorage persistence per project ──
const storageKey = computed(() => `agent-chat-${props.projectId}`)
const storedMessages = useStorage<AgentMessage[]>(storageKey, [])

const messages = reactive<AgentMessage[]>([])

/** 将旧格式（text + toolCalls[] 分离）迁移为 parts 数组 */
function migrateMessage(msg: AgentMessage): AgentMessage {
  if (!msg.parts && msg.role === 'assistant') {
    const parts: Part[] = []
    if (msg.text)
      parts.push({ type: 'text', content: msg.text })
    if (msg.toolCalls?.length) {
      for (const tc of msg.toolCalls) parts.push({ type: 'tool', toolCall: tc })
    }
    return { ...msg, parts }
  }
  return msg
}

// Restore from storage on mount
if (storedMessages.value.length > 0) {
  messages.push(...storedMessages.value.map(migrateMessage))
}
// Sync to storage (throttled to avoid excessive writes during streaming)
watchThrottled(
  messages,
  (newVal) => {
    storedMessages.value = [...newVal]
  },
  { deep: true, throttle: 1000 },
)

function clearConversation() {
  messages.length = 0
  storedMessages.value = []
  phase.value = 'idle'
  sessionTokens.value = 0
  totalTokensConsumed.value = 0
}

const inputTooLong = computed(() => inputValue.value.length > 500)

// Reset input-too-long when length drops
watch(inputTooLong, (v) => {
  if (!v && phase.value === 'input-too-long')
    phase.value = 'idle'
})

// Chip definitions — 通用问题，支持项目名插值
const chips = computed(() => {
  const name = props.projectName || t('agent.drawer.title')
  return [
    t('agent.chip.1', { name }),
    t('agent.chip.2'),
    t('agent.chip.3'),
    t('agent.chip.4'),
    t('agent.chip.5'),
  ]
})

function handleChipClick(text: string) {
  inputValue.value = text
  submit(text)
}

// ── SSE submit ──
async function submit(text: string) {
  if (!text.trim() || inputTooLong.value)
    return

  inputValue.value = ''
  abortController = new AbortController()
  phase.value = 'streaming'
  messages.push({ role: 'user', text: text.trim() })

  const assistant: AgentMessage = reactive({
    role: 'assistant',
    text: '',
    toolCalls: [],
    parts: [],
  })
  messages.push(assistant)

  const toolStartTimes = new Map<string, number>()
  let toolIndex = 0
  let currentTextPart: Part | null = null

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
          case 'text': {
            assistant.text += payload.token
            sessionTokens.value += 1
            if (sessionTokens.value > 50_000)
              phase.value = 'cost-cap'
            // 追加到当前 text part，或新建一个
            if (!currentTextPart) {
              currentTextPart = { type: 'text', content: payload.token }
              assistant.parts!.push(currentTextPart)
            }
            else {
              currentTextPart.content += payload.token
            }
            break
          }
          case 'tool-call': {
            phase.value = 'tool-calling'
            toolStartTimes.set(payload.id, Date.now())
            toolIndex += 1
            const tc: ToolCallItem = {
              id: payload.id,
              name: payload.name,
              input: payload.args,
              output: null,
              isError: false,
              status: 'running',
              index: toolIndex,
            }
            assistant.toolCalls!.push(tc)
            // text part 结束后开始 tool part
            currentTextPart = null
            assistant.parts!.push({ type: 'tool', toolCall: tc })
            break
          }
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
          case 'usage': {
            // 精确 token 计数（由后端 LLM API usage 提供）
            totalTokensConsumed.value += payload.total || 0
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

// Refs
const inputRef = ref<HTMLInputElement | null>(null)

// Auto-focus input when panel opens
watch(isOpen, (v) => {
  if (v) {
    nextTick(() => {
      inputRef.value?.focus()
    })
  }
})

// Cleanup
onBeforeUnmount(() => {
  abortController?.abort()
  if (rateLimitTimer)
    clearInterval(rateLimitTimer)
})
</script>

<template>
  <div>
    <!-- FAB Button -->
    <button
      v-show="displayMode === 'fab'"
      class="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-sky-500 text-white shadow-lg shadow-black/30 flex items-center justify-center hover:bg-sky-400 transition-colors"
      :aria-label="t('agent.askButton')"
      @click="expand"
    >
      <UIcon name="i-lucide-message-circle-question" class="w-6 h-6" />
    </button>

    <!-- Draggable & Resizable Floating Panel -->
    <div
      v-show="displayMode === 'open'"
      data-testid="agent-panel"
      class="fixed z-50 bg-default border border-default rounded-lg shadow-xl shadow-black/20 flex flex-col overflow-hidden"
      :style="{
        left: `${panelPos.x}px`,
        top: `${panelPos.y}px`,
        width: `${panelSize.width}px`,
        height: `${panelSize.height}px`,
      }"
    >
      <!-- Draggable Header -->
      <div
        class="flex items-center justify-between px-4 py-3 border-b border-default cursor-move select-none bg-elevated/30"
        @mousedown="startDrag"
      >
        <h3 class="text-base font-semibold text-highlighted">
          {{ t('agent.drawer.title') }}
        </h3>
        <div class="flex items-center gap-1">
          <button
            v-if="messages.length > 0"
            class="hover:bg-elevated/60 p-1.5 rounded text-muted hover:text-red-400 transition-colors"
            :aria-label="t('agent.drawer.clear')"
            @click="clearConversation"
          >
            <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
          </button>
          <button
            class="hover:bg-elevated/60 p-1.5 rounded text-muted hover:text-default transition-colors"
            :aria-label="t('agent.drawer.minimize')"
            @click="minimize"
          >
            <UIcon name="i-lucide-chevrons-down-up" class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="flex flex-col flex-1 min-h-0">
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
            <p class="text-sm text-muted">
              {{ t('agent.error.noData') }}
            </p>
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
                <p class="text-sm text-default">
                  {{ msg.text }}
                </p>
              </div>
            </div>

            <!-- Assistant message -->
            <div v-else class="flex justify-start">
              <div class="max-w-[85%] space-y-2">
                <!-- Parts: text / tool 按事件顺序交错渲染 -->
                <template v-if="msg.parts?.length">
                  <template v-for="(part, pIdx) in msg.parts" :key="pIdx">
                    <!-- Text part -->
                    <div v-if="part.type === 'text'" class="bg-default border border-default rounded-lg px-3 py-2">
                      <MarkdownRender
                        :content="part.content"
                        :max-live-nodes="0"
                        :final="!(phase === 'streaming' && idx === messages.length - 1 && pIdx === msg.parts!.length - 1)"
                        class="text-sm text-default"
                      />
                      <!-- Streaming cursor on last text part of last message -->
                      <span v-if="phase === 'streaming' && idx === messages.length - 1 && pIdx === msg.parts!.length - 1" class="inline-block w-0.5 h-4 bg-sky-500 ml-0.5 align-middle animate-pulse" />
                    </div>
                    <!-- Tool part -->
                    <AgentToolCard
                      v-else
                      :name="part.toolCall.name"
                      :input="part.toolCall.input"
                      :output="part.toolCall.output"
                      :is-error="part.toolCall.isError"
                      :status="part.toolCall.status"
                      :index="part.toolCall.index"
                      :duration="part.toolCall.duration"
                    />
                  </template>
                </template>
                <!-- Fallback: 旧格式无 parts，按原逻辑渲染 -->
                <template v-else>
                  <div class="bg-default border border-default rounded-lg px-3 py-2">
                    <MarkdownRender
                      :content="msg.text"
                      :max-live-nodes="0"
                      :final="!(phase === 'streaming' && idx === messages.length - 1)"
                      class="text-sm text-default"
                    />
                    <span v-if="phase === 'streaming' && idx === messages.length - 1" class="inline-block w-0.5 h-4 bg-sky-500 ml-0.5 align-middle animate-pulse" />
                  </div>
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
                </template>

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
            <p class="text-xs text-red-400 flex-1">
              {{ t('agent.error.streamInterrupted') }}
            </p>
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
            <p class="text-xs text-amber-400">
              {{ t('agent.error.rateLimited', { n: rateLimitSeconds }) }}
            </p>
          </div>

          <!-- Cost cap banner -->
          <div v-if="phase === 'cost-cap'" class="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
            <p class="text-xs text-orange-400">
              {{ t('agent.error.costCap') }}
            </p>
          </div>

          <!-- API key missing overlay -->
          <div v-if="phase === 'api-key-missing'" class="absolute inset-0 bg-default/90 flex flex-col items-center justify-center p-6 z-10">
            <UIcon name="i-lucide-key-round" class="w-8 h-8 text-muted mb-3" />
            <p class="text-sm text-muted text-center">
              {{ t('agent.error.apiKeyMissing') }}
            </p>
          </div>
        </div>

        <!-- Composer -->
        <div class="border-t border-default p-3 shrink-0">
          <!-- 上下文信息栏 -->
          <div v-if="projectName || messages.length > 0" class="flex items-center gap-3 mb-2 text-[10px] text-muted">
            <span v-if="projectName" class="truncate max-w-[140px]" :title="projectName">
              {{ projectName }}
            </span>
            <span v-if="projectName && messages.length > 0" class="text-muted/30">|</span>
            <span v-if="messages.length > 0" class="tabular-nums">
              {{ t('agent.context.lengthAndPercent', { len: totalTokensConsumed.toLocaleString(), pct: contextPercent }) }}
            </span>
          </div>
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

      <!-- Resize Handle -->
      <div
        class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-10"
        @mousedown="startResize"
      >
        <div class="absolute bottom-1 right-1 w-2 h-2 border-r-2 border-b-2 border-muted/40 rounded-br-sm" />
      </div>
    </div>
  </div>
</template>
