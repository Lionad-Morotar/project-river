<script setup lang="ts">
const { locale, setLocale } = useI18n()

const i18nHead = useLocaleHead({ addDirAttribute: true, addSeoAttributes: true })

useHead(() => ({
  htmlAttrs: {
    lang: i18nHead.value.htmlAttrs?.lang ?? 'zh-CN',
  },
}))

function toggleLocale() {
  setLocale(locale.value === 'zh-CN' ? 'en' : 'zh-CN')
}
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 antialiased">
    <!-- Language switcher -->
    <div class="fixed top-3 right-3 z-50">
      <button
        class="px-2 py-1 text-xs font-medium text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-md transition-colors"
        @click="toggleLocale"
      >
        {{ locale === 'zh-CN' ? 'English' : '简体中文' }}
      </button>
    </div>
    <NuxtPage />
  </div>
</template>
