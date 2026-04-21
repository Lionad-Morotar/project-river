<script setup lang="ts">
import type { EventGroupNode, EventSeverity } from '~/composables/useProjectEvents'

interface Props {
  groups: EventGroupNode[]
  selectedIds: Set<string>
  expandedIds: Set<string>
  counts: Map<string, number>
  totalCounts: Map<string, number>
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'toggle', id: string, checked: boolean): void
  (e: 'toggleExpanded', id: string): void
}>()

const isOpen = ref(false)
const expanded = ref<Set<string>>(new Set(props.groups.map(g => g.id)))

function isChecked(id: string): boolean {
  return props.selectedIds.has(id)
}

function isIndeterminate(group: EventGroupNode): boolean {
  if (!group.children)
    return false
  const childIds = group.children.map(c => c.id)
  const checkedCount = childIds.filter(id => props.selectedIds.has(id)).length
  return checkedCount > 0 && checkedCount < childIds.length
}

function toggleExpand(id: string) {
  const next = new Set(expanded.value)
  if (next.has(id))
    next.delete(id)
  else next.add(id)
  expanded.value = next
}

function onToggle(id: string, checked: boolean) {
  emit('toggle', id, checked)
}

function onParentToggle(group: EventGroupNode, checked: boolean) {
  emit('toggle', group.id, checked)
  if (group.children) {
    for (const child of group.children) {
      emit('toggle', child.id, checked)
    }
  }
}

function severityColor(severity?: EventSeverity): string {
  switch (severity) {
    case 'positive': return 'text-emerald-400'
    case 'warning': return 'text-amber-400'
    case 'info': return 'text-sky-400'
    default: return 'text-dimmed'
  }
}

function groupCount(group: EventGroupNode): { shown: number, total: number } {
  if (!group.children) {
    return {
      shown: props.counts.get(group.id) || 0,
      total: props.totalCounts.get(group.id) || 0,
    }
  }
  return group.children.reduce((sum, c) => ({
    shown: sum.shown + (props.counts.get(c.id) || 0),
    total: sum.total + (props.totalCounts.get(c.id) || 0),
  }), { shown: 0, total: 0 })
}

function childCount(child: EventGroupNode): { shown: number, total: number } {
  return {
    shown: props.counts.get(child.id) || 0,
    total: props.totalCounts.get(child.id) || 0,
  }
}

function isExpanded(id: string): boolean {
  return props.expandedIds.has(id)
}

function hasLimit(child: EventGroupNode): boolean {
  return child.defaultLimit !== undefined && child.defaultLimit > 0
}

function onToggleExpanded(child: EventGroupNode) {
  emit('toggleExpanded', child.id)
}
</script>

<template>
  <div class="relative">
    <!-- Trigger button -->
    <button
      class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-dimmed hover:text-default hover:bg-elevated rounded-md transition-colors"
      :class="isOpen ? 'text-default bg-elevated' : ''"
      @click="isOpen = !isOpen"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
      {{ $t('events.panel.title', { count: 0 }).replace(' (0)', '') }}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="w-3 h-3 transition-transform duration-150"
        :class="isOpen ? 'rotate-180' : ''"
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

    <!-- Dropdown panel -->
    <Transition
      enter-active-class="transition-all duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div
        v-if="isOpen"
        class="absolute right-0 top-full mt-1.5 w-64 bg-elevated border border-default rounded-lg shadow-lg py-2 z-50"
      >
        <div
          v-for="group in groups"
          :key="group.id"
          class="px-2"
        >
          <!-- Parent group header -->
          <div class="flex items-center gap-1.5 py-1.5 px-1 hover:bg-elevated/60 rounded cursor-pointer" @click="toggleExpand(group.id)">
            <button
              class="text-muted hover:text-default transition-colors w-4 h-4 flex items-center justify-center"
              @click.stop="toggleExpand(group.id)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-3 h-3 transition-transform duration-150"
                :class="expanded.has(group.id) ? 'rotate-90' : ''"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            <label class="flex items-center gap-2 flex-1 cursor-pointer" @click.stop>
              <input
                type="checkbox"
                class="w-3.5 h-3.5 rounded border-muted bg-elevated text-sky-500 focus:ring-sky-500/30 focus:ring-1 cursor-pointer"
                :checked="isChecked(group.id)"
                :indeterminate="isIndeterminate(group)"
                @change="onParentToggle(group, ($event.target as HTMLInputElement).checked)"
              >
              <span class="text-xs text-default font-medium">{{ $t(group.labelKey) }}</span>
              <span class="text-[10px] text-muted ml-auto tabular-nums">
                {{ groupCount(group).shown }}
                <span v-if="groupCount(group).shown !== groupCount(group).total">/ {{ groupCount(group).total }}</span>
              </span>
            </label>
          </div>

          <!-- Children -->
          <Transition
            enter-active-class="transition-all duration-150 ease-out"
            enter-from-class="opacity-0 max-h-0"
            enter-to-class="opacity-100 max-h-48"
            leave-active-class="transition-all duration-100 ease-in"
            leave-from-class="opacity-100 max-h-48"
            leave-to-class="opacity-0 max-h-0"
          >
            <div v-if="expanded.has(group.id)" class="overflow-hidden">
              <div
                v-for="child in group.children"
                :key="child.id"
                class="flex items-center gap-2 py-1 px-1 pl-8 hover:bg-elevated/40 rounded"
              >
                <label class="flex items-center gap-2 flex-1 cursor-pointer">
                  <input
                    type="checkbox"
                    class="w-3.5 h-3.5 rounded border-muted bg-elevated text-sky-500 focus:ring-sky-500/30 focus:ring-1 cursor-pointer"
                    :checked="isChecked(child.id)"
                    @change="onToggle(child.id, ($event.target as HTMLInputElement).checked)"
                  >
                  <span class="w-1.5 h-1.5 rounded-full flex-shrink-0" :class="severityColor(child.severity)" />
                  <span class="text-[11px] text-dimmed">{{ $t(child.labelKey) }}</span>
                </label>
                <span class="text-[10px] text-muted tabular-nums">
                  {{ childCount(child).shown }}
                  <span v-if="childCount(child).shown !== childCount(child).total">/ {{ childCount(child).total }}</span>
                </span>
                <button
                  v-if="hasLimit(child) && isChecked(child.id)"
                  class="text-[10px] px-1.5 py-0.5 rounded text-muted hover:text-default hover:bg-accented transition-colors"
                  :class="isExpanded(child.id) ? 'bg-accented text-default' : ''"
                  @click="onToggleExpanded(child)"
                >
                  {{ isExpanded(child.id) ? '默认' : '全部' }}
                </button>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </Transition>
  </div>
</template>
