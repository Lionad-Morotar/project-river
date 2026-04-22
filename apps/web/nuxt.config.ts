import process from 'node:process'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  ssr: false,
  modules: ['@nuxt/ui', '@vueuse/nuxt', '@nuxtjs/i18n'],
  css: ['~/assets/css/main.css'],
  app: {
    baseURL: process.env.NODE_ENV === 'production' ? '/project-river/' : '/',
    head: {
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap' },
      ],
    },
  },
  runtimeConfig: {
    public: {
      staticMode: process.env.STATIC_MODE === 'true',
    },
  },
  colorMode: {
    preference: 'system',
  },
  i18n: {
    baseUrl: 'http://localhost:10400',
    defaultLocale: 'zh-CN',
    strategy: 'no_prefix',
    langDir: 'locales',
    locales: [
      { code: 'zh-CN', file: 'zh-CN.ts', name: '简体中文' },
      { code: 'en', file: 'en.ts', name: 'English' },
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_redirected',
      redirectOn: 'root',
    },
    experimental: {
      typedOptionsAndMessages: 'all',
    },
  },
  vite: {
    optimizeDeps: {
      include: [
        '@atlaskit/pragmatic-drag-and-drop/element/adapter',
        'd3-array',
        'd3-axis',
        'd3-brush',
        'd3-scale',
        'd3-selection',
        'd3-shape',
        'd3-zoom',
      ],
    },
  },
})
