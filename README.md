# ProLingo

A modern, high-performance web application for language learning, vocabulary mastery, and structured text-to-speech (TTS) audio management.

---

## 🌐 Live Environments

ProLingo operates on a dual-environment deployment model powered by **Vercel** and **Hostinger DNS**:

| Environment | URL | Git Branch | Description |
| :--- | :--- | :--- | :--- |
| **Production (Stable)** | [prolingo.site](https://prolingo.site) | `main` | Production-ready, verified stable release. |
| **Beta (Active Testing)** | [beta.prolingo.site](https://beta.prolingo.site) | `v6-beta` | Staging preview for latest features, runtime testing, and beta audits. |

---

## 🌿 Branching & Versioning Strategy

To maintain a clean and reliable release history, this repository follows release branching:

- **`main`**: Reserved strictly for stable, production releases. Direct commits are kept clean; features from beta are merged in via consolidated squash releases.
- **`v6-beta`**: Active development branch for v6 features (Structured Text, Paragraph/Sentence Authoring, Multi-Voice Audio Management, Batch Processing, and Runtime Audits).
- **`archive/full-history-main`**: Permanent immutable snapshot of the original 84-commit legacy history.
- **Git Tags**:
  - `v5.14.8` — Milestone Text T9 Mode-Specific Final Polish.
  - `v5.14.17` — Final stable v5 release milestone prior to v6 architecture.

---

## 🚀 Key Features

- **Vocabulary & Table Study Mode**: High-density interactive vocabulary tables with spaced repetition and mastery tracking.
- **Structured Text Authoring**: Multi-mode text authoring (Paragraph, Conversation, Legacy) with granular segment and sentence breakdown.
- **Edge TTS Integration**: High-fidelity text-to-speech rendering powered by Microsoft Edge neural voices (Indonesian & English).
- **Audio Lifecycle & Storage**: Persistent client-side audio caching using IndexedDB, folder-level reconnectivity, and mounted ZIP coverage.
- **Batch Export & Telemetry**: Consolidated audio generation, direct MP3 export waves, and resource-bounded multi-archive ZIP creation.

---

## 🛠️ Technology Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Lucide React
- **Backend / TTS Service**: Node.js, Express, `msedge-tts`, `cors`
- **Client Storage**: Browser IndexedDB with persistent state reconciliation
- **Hosting & Infrastructure**: Vercel (Preview & Production Deployments), Hostinger (DNS management)

---

## 💻 Local Development

### Prerequisites
- Node.js (v18 or higher recommended)
- npm

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Backend TTS Server
```bash
npm run server
```
*The local TTS proxy runs on `http://localhost:5000`.*

### 3. Start Frontend Dev Server
```bash
npm run dev
```
*The Vite development server will start (default: `http://localhost:5173`).*

---

## 📜 Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Runs the Vite dev server in stable-test mode. |
| `npm run dev:hmr` | Runs the Vite dev server with default Hot Module Replacement. |
| `npm run server` | Starts the local Express Edge-TTS server proxy. |
| `npm run build` | Builds the optimized production assets into `dist/`. |
| `npm run preview` | Previews the production build locally. |
| `npm run lint` | Runs ESLint code quality checks. |

---

## 📄 License
Private repository & application. All rights reserved.
