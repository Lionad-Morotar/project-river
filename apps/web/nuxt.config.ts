import process from 'node:process'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  ssr: false,
  modules: ['@nuxt/ui', '@vueuse/nuxt', '@nuxtjs/i18n', 'nuxt-llms'],
  css: ['~/assets/css/main.css'],
  app: {
    baseURL: process.env.NODE_ENV === 'production' ? '/project-river/' : '/',
  },
  runtimeConfig: {
    // server-only: NUXT_AGENT_LLM_API_KEY → agentLlmApiKey (auto-mapped by Nuxt)
    agentLlmApiKey: '',
    // Optional: custom LLM endpoint (e.g. Deepseek via Anthropic-compatible API)
    // Set via NUXT_AGENT_LLM_BASE_URL in .env
    agentLlmBaseUrl: '',
    public: {
      staticMode: process.env.STATIC_MODE === 'true',
    },
  },
  colorMode: {
    preference: 'system',
  },
  // nuxt-llms: 生成 /llms.txt 供 LLM 爬取与人工分享
  // 注意：项目部署在 GitHub Pages 子路径 /project-river/，规范上的根级
  // /llms.txt 不会被自动发现，此处生成的副本主要用作人工提交给 LLM 的素材。
  llms: {
    domain: 'https://lionad-morotar.github.io/project-river',
    title: 'Project River',
    description: 'Renders Git repository contributor activity as a time-flowing Streamgraph, helping engineering decision-makers assess project health, identify core contributors, and understand the evolution rhythm of a codebase.',
    sections: [
      {
        title: 'Overview',
        description: 'Project River is an interactive Git history visualization tool. Analyze a repository via CLI, persist into PostgreSQL, then explore through a Nuxt 4 web app powered by D3 Streamgraphs.',
        links: [
          {
            title: 'Live Demo',
            description: 'Static deployment with pre-built demo repositories (e.g. Vue, VueUse) — no backend needed to explore.',
            href: 'https://lionad-morotar.github.io/project-river/',
          },
          {
            title: 'Homepage',
            description: 'Web app landing page listing imported projects.',
            href: 'https://lionad-morotar.github.io/project-river/',
          },
        ],
      },
      {
        title: 'Source & Documentation',
        description: 'Source code, roadmap, and bilingual README (English / 中文).',
        links: [
          {
            title: 'GitHub Repository',
            description: 'Monorepo: pipeline (CLI), db (Drizzle ORM + PostgreSQL), web (Nuxt 4 SPA).',
            href: 'https://github.com/Lionad-Morotar/project-river',
          },
          {
            title: 'README (English)',
            description: 'Features, local setup, usage walkthrough.',
            href: 'https://github.com/Lionad-Morotar/project-river/blob/main/README.md',
          },
          {
            title: 'README (中文)',
            description: '功能介绍、本地部署、使用指南。',
            href: 'https://github.com/Lionad-Morotar/project-river/blob/main/README.zh.md',
          },
        ],
      },
    ],
    notes: [
      'The web app embeds an Agent QA capability backed by a Pi-Agent core that can answer questions about a project\'s Git history (contributor shifts, milestone events, module ownership) via streaming SSE.',
      'Deep links to individual project pages follow /projects/{id}, where {id} is assigned at import time and is not stable across deployments.',
      'This llms.txt lives at /project-river/llms.txt due to GitHub Pages subpath deployment, not at the canonical site root.',
    ],
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
