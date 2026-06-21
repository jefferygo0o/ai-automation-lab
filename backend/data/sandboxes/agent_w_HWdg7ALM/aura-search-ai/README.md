# AuraSearch AI 🌀

An advanced AI internet assistant with an animated wireframe face, voice interaction, web search, page summarization, source citations, browser automation, and a safety-first permission system.

> **Google Search + ChatGPT + Voice Assistant + Browser Automation + Animated AI Face**

---

## ✨ Features

### Phase 1 & 2 ✅
- **Animated AI Face** — 3D wireframe face built with Three.js/React Three Fiber. Responds to state: idle, listening, thinking, searching, speaking
- **Voice Input** — Browser Web Speech API for speech-to-text
- **Voice Output** — Browser SpeechSynthesis API for text-to-speech (with mute option)
- **Web Search** — Free DuckDuckGo integration (no API key needed), with Brave/Tavily as optional upgrades
- **Page Reading** — Fetch and extract readable text from any public URL
- **Source Citations** — All web-sourced answers include numbered citations with links
- **Safety System** — Low/Medium/High risk classification with confirmation modals for sensitive actions
- **LLM Integration** — Local-first with Ollama (Llama 3, Mistral, etc.), OpenAI-compatible as fallback
- **Memory** — Conversation history and preference tracking
- **Settings Panel** — Toggle voice input/output, view provider info
- **Futuristic UI** — Dark theme, cyan/purple glow effects, glass morphism, particle animations

### Phase 3 ✅
- **Browser Automation** — Full Playwright integration for safe, controlled browsing
- **Navigate to URLs** — Open and read any public webpage
- **Screenshots** — Capture page content as images displayed inline in chat
- **Page Content Extraction** — Read and summarize page content with link discovery
- **Interactive Elements** — List buttons, links, and form fields on any page
- **Click Elements** — Click buttons and links with visual feedback
- **Form Filling** — Fill form fields with user confirmation
- **Task Planning** — Multi-step plan generation for complex requests (search → navigate → read → summarize)
- **Safety Controls** — All browser actions require user confirmation (high risk). Local/private network URLs blocked.
- **Content Limits** — 5MB page size limit, resource blocking for speed

### Phase 4 (Planned) 🚀
- Real-time streaming responses via SSE
- User accounts with Auth.js
- Persistent database (SQLite → PostgreSQL)
- Advanced avatar with speaking animation
- Multimodal page understanding (vision)
- PWA support

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+**
- **npm** or **yarn** or **pnpm**
- **Ollama** (recommended for local LLM) — [ollama.ai](https://ollama.ai)

### 1. Install

```bash
cd aura-search-ai
npm install
# Playwright Chromium is auto-installed for browser automation
```

### 2. Set up Ollama (recommended)

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull a model
ollama pull llama3.1
# or: ollama pull mistral
# or: ollama pull phi

# Ollama runs on http://localhost:11434 by default
```

### 3. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` — the defaults work with Ollama + DuckDuckGo:

```env
# Local LLM with Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1

# Search (DuckDuckGo works with no config)
SEARCH_PROVIDER=duckduckgo

# Enable browser automation (disabled by default in production)
ENABLE_BROWSER_AUTOMATION=true
```

### 4. Run the Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 5. Start Talking!

- Click the **microphone button** to speak
- Or **type** in the chat input
- Watch the AI face animate as it listens, thinks, and responds
- Responses are spoken aloud (toggle mute in settings)

### Browser Commands

Try these once the app is running:
- "Go to example.com" — Opens a webpage
- "Take a screenshot of example.com" — Captures page screenshot
- "List all links on this page" — Shows clickable links
- "Search for the latest AI news" — Web search with results

---

## 🧠 How It Works

### Architecture

```
Frontend (Next.js + Three.js)        Backend (Next.js API Routes)
┌─────────────────────────┐         ┌──────────────────────────┐
│  AI Face (3D wireframe)  │         │  /api/agent             │
│  Chat Panel              │ ◄─────► │  Intent Classifier      │
│  Voice Controls          │         │  Risk Classifier        │
│  Source Panel            │         │  Tool System            │
│  Confirmation Modal      │         │  LLM Provider (Ollama)  │
│  Settings                │         │  Search Provider (DDG)  │
│  Screenshot Display      │         │  Browser Automation     │
└─────────────────────────┘         │  Task Planner           │
                                     │  Memory Store            │
                                     │  Safety / Permissions    │
                                     └──────────────────────────┘
```

### Agent Flow

1. User speaks/types a request
2. Frontend sends to `/api/agent`
3. **Intent Classifier** determines what the user wants
4. **Risk Classifier** checks if action is low/medium/high risk
5. **Tool System** executes appropriate tools (search, fetch, calculate, browser)
6. **Task Planner** decomposes complex requests into steps
7. **LLM** generates a response with citations
8. Response returned to frontend with sources and optional confirmation request

### Safety First

| Risk Level | Behavior |
|-----------|----------|
| **Low** (search, read, summarize) | Executed automatically |
| **Medium** (forms, drafts, preferences) | Asks for confirmation |
| **High** (browser actions, purchases, bookings) | Requires explicit confirmation |

---

## 🛠️ Configuration

### LLM Providers

| Provider | Setup | Notes |
|----------|-------|-------|
| **Ollama** (default) | `OLLAMA_BASE_URL=http://localhost:11434` | Free, local, private |
| **OpenAI** | `OPENAI_API_KEY=sk-...` | Paid, requires API key |
| **Groq** | `OPENAI_BASE_URL=https://api.groq.com/openai/v1` | Free tier available |
| **Gemini** | `GEMINI_API_KEY=...` | Free tier available |

### Search Providers

| Provider | Setup | Notes |
|----------|-------|-------|
| **DuckDuckGo** (default) | No config needed | Free, no API key |
| **Brave** | `BRAVE_SEARCH_API_KEY=...` | 2,000 free queries/month |
| **Tavily** | `TAVILY_API_KEY=...` | 1,000 free queries/month |

---

## 📁 Project Structure

```
aura-search-ai/
├── .env.example
├── package.json
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── src/
    ├── app/
    │   ├── page.tsx              # Main page with state management
    │   ├── layout.tsx            # Root layout
    │   ├── globals.css           # Global styles + animations
    │   └── api/
    │       ├── agent/route.ts    # Agent orchestrator endpoint
    │       ├── search/route.ts   # Direct search endpoint
    │       ├── webpage/route.ts  # Webpage fetch endpoint
    │       └── settings/route.ts # Config endpoint
    ├── components/
    │   ├── AIFace.tsx            # 3D wireframe face (Three.js)
    │   ├── ChatPanel.tsx         # Message display + screenshot support
    │   ├── VoiceControls.tsx     # Mic, mute, stop buttons
    │   ├── SourcePanel.tsx       # Citation sources list
    │   ├── AgentStatus.tsx       # Status indicator
    │   ├── ConfirmationModal.tsx # Risk confirmation dialog
    │   └── SettingsPanel.tsx     # Settings overlay
    ├── lib/
    │   ├── types.ts              # Core type definitions
    │   ├── agent/
    │   │   ├── orchestrator.ts   # Main agent logic + browser routing
    │   │   ├── intentClassifier.ts
    │   │   ├── riskClassifier.ts
    │   │   ├── promptBuilder.ts
    │   │   ├── responseFormatter.ts
    │   │   └── taskPlanner.ts    # Phase 3: Multi-step task planning
    │   ├── llm/
    │   │   ├── index.ts          # Provider factory
    │   │   ├── ollamaProvider.ts
    │   │   └── openAICompatibleProvider.ts
    │   ├── tools/
    │   │   ├── types.ts          # Tool registry
    │   │   ├── init.ts           # Tool registration
    │   │   ├── webSearchTool.ts
    │   │   ├── fetchWebpageTool.ts
    │   │   ├── summarizePageTool.ts
    │   │   ├── calculatorTool.ts
    │   │   ├── weatherTool.ts
    │   │   └── browserTool.ts    # Phase 3: Real Playwright integration
    │   ├── browser/
    │   │   └── playwrightClient.ts # Phase 3: Full browser session manager
    │   ├── search/
    │   │   ├── index.ts
    │   │   ├── duckduckgoProvider.ts
    │   │   ├── braveProvider.ts
    │   │   └── tavilyProvider.ts
    │   ├── safety/
    │   │   ├── permissions.ts    # Risk classification
    │   │   └── actionLogger.ts   # Action audit log
    │   ├── memory/
    │   │   └── memoryStore.ts    # Local memory
    │   └── utils/
    │       ├── env.ts            # Env config + validation
    │       ├── citations.ts      # Source citation formatting
    │       └── readability.ts    # Page content extraction
    └── types/
        └── global.d.ts           # Web Speech API types
```

---

## 🔒 Security

- No API keys in frontend code
- All secrets via `.env.local`
- Action audit log maintained
- Confirmation required for medium/high-risk actions
- Browser automation restricted to public URLs only (no localhost/private IPs)
- No arbitrary code execution
- Page fetch size limited to 5MB
- Request timeouts configured
- Browser resource blocking for performance

---

## 📄 License

MIT

---

## 🙏 Credits

- [Next.js](https://nextjs.org)
- [Three.js](https://threejs.org)
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber)
- [Ollama](https://ollama.ai)
- [Playwright](https://playwright.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [DuckDuckGo](https://duckduckgo.com)
