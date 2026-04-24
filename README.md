# Project River

English | **[中文](./README.zh.md)**

<a href="https://www.producthunt.com/products/project-river?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-project-river" target="_blank" rel="noopener noreferrer"><img alt="Project River - See how your codebase evolved, contributor by contributor | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1130153&amp;theme=light&amp;t=1776886010561"></a>

Renders Git repository contributor activity as a time-flowing Streamgraph, helping you quickly assess project health, identify core contributors, and understand the evolution rhythm of a codebase.

![landing](./assets/landing.gif)

## Features

- **Streamgraph Visualization** — D3-powered Streamgraph with zoom, brush navigation, and contributor highlighting
- **Project Health Signals** — Automatically analyzes Git history to surface actionable insights such as contribution concentration and activity trends
- **Event Timeline** — Detects key milestones, core contributor changes, and other significant events
- **Light & Dark Themes** — Theme switching, configurable color schemes, and i18n (中文 / English)

![project-detail](./assets/project-detail.png)

## Live Demo

Visit the [GitHub Pages](https://lionad-morotar.github.io/project-river/) demo.

The online version is a static deployment showcasing pre-built demo data. To analyze your own repositories, follow the local setup below.

## Local Setup

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 20 (ESM support required)
- [pnpm](https://pnpm.io/) ≥ 9
- [Docker](https://www.docker.com/) (for running PostgreSQL)
- [Git](https://git-scm.com/) (needed when analyzing target repositories)
- [Bun](https://bun.sh/) (for running the CLI analysis script)

### 1. Start the Database

```bash
docker compose up -d
```

This starts two containers:

| Service       | Port   | Purpose                           |
| ------------- | ------ | --------------------------------- |
| PostgreSQL 16 | `5432` | Primary database                  |
| pgAdmin 4     | `5050` | Database management UI (optional) |

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/river
```

### 3. Install Dependencies & Run Migrations

```bash
pnpm install
pnpm db:migrate
```

### 4. Start the Dev Server

```bash
pnpm dev
```

Open http://localhost:10400 and you're ready to go.

### 5. Analyze a Repository

Add new projects via the web UI, or use the CLI to import and analyze Git repositories:

```bash
# Analyze a local repository
bun packages/pipeline/src/cli.ts /path/to/repo owner/repo

# Incremental update for an existing project
bun packages/pipeline/src/cli.ts /path/to/repo owner/repo --incremental

# Force a full re-analysis
bun packages/pipeline/src/cli.ts /path/to/repo owner/repo --force
```

Refresh the page after analysis completes to see the Streamgraph.

## Tech Stack

- **Frontend** — Nuxt 4 · Vue 3 · TypeScript · Tailwind CSS v4
- **Visualization** — D3.js (Streamgraph · Brush · Zoom)
- **Database** — PostgreSQL 16 · Drizzle ORM
- **Package Manager** — pnpm workspace monorepo
- **Static Deploy** — Columnar-compressed `.bin` format + pako decompression

## Roadmap

- **Zero-config CLI** — `npx @lionad/project-river` inside any local repo to analyze and launch the Web UI instantly
- **Agent Analysis** — Feed commit-derived timeline & milestone data into deep-research agents for automated project summaries
- **AI-Native Architecture** — MCP servers and Claude Skills for first-class agent interoperability
- **More Dimensions** — AI code percentage, 24-hour commit radar, code-churn heatmap, and other insightful metrics

## License

[Business Source License 1.1](./LICENSE) — Free for personal use; commercial use requires authorization.

Automatically converts to the MIT license on 2029-01-01.

## Acknowledgements

Inspired by [The Git Distributed Version Control System](https://git-history.jpalmer.dev/).
