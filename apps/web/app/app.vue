<script setup lang="ts">
const i18nHead = useLocaleHead({ addDirAttribute: true, addSeoAttributes: true })

useHead(() => ({
  htmlAttrs: {
    lang: i18nHead.value.htmlAttrs?.lang ?? 'zh-CN',
  },
}))
</script>

<template>
  <div class="min-h-screen bg-default text-default antialiased">
    <NuxtPage />
  </div>
</template>
