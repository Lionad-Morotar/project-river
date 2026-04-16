// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  ssr: false,
  modules: ['@nuxt/ui', '@vueuse/nuxt'],
  css: ['~/assets/css/main.css'],
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
