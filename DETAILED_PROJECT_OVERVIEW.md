# DETAILED_PROJECT_OVERVIEW.md

## 📁 Project Purpose & Overview

oLegal is an open‑source chat interface that supports multiple AI models. The application can run with cloud models (OpenAI, Mistral, Claude, etc.) or local models via Ollama. It integrates authentication and storage through Supabase and uses Next.js 15 with React 19. The UI relies on Tailwind CSS, shadcn/ui components, motion‑primitives animations and prompt‑kit chat widgets.

The project offers:

- Multi‑model chat with BYOK (bring‑your‑own‑key) support.
- File uploads and chat sharing.
- Rate limiting and usage tracking per model.
- Docker support for local or production deployment.

## 🧠 Core Architectural Concepts

- **Next.js App Router** – under the `app` directory with server actions and React components.
- **API Routes** – inside `app/api/*` for chat processing, model lists, projects, guest creation and more.
- **Supabase Integration** – `lib/supabase` provides client and server helpers. Database types reside in `app/types`.
- **State Stores** – `lib/chat-store`, `lib/model-store`, and `lib/user-store` manage chats, selected models and user info through React context.
- **User Preferences & Keys** – encrypted API keys (`lib/encryption.ts`) and preference persistence (`lib/user-preference-store`).
- **OpenProviders** – mapping of model IDs to providers along with environment key handling.
- **CSRF Protection & Middleware** – `lib/csrf.ts` and `middleware.ts` secure API calls.

## 🗂️ File-by-File Breakdown

Below is a condensed explanation of key files. Image/icon assets are grouped for brevity.

### Root Files

- `.dockerignore` – Files ignored by Docker builds.
- `.env.example` – Sample environment variables such as API keys and Supabase URL【F:.env.example†L1-L29】.
- `.gitignore` – Git ignore rules.
- `Dockerfile` – Multi‑stage build producing a standalone Next.js app【F:Dockerfile†L1-L63】.
- `docker-compose.yml` – Runs the app container with health checks【F:docker-compose.yml†L1-L17】.
- `docker-compose.ollama.yml` – Adds an Ollama service for local models alongside oLegal【F:docker-compose.ollama.yml†L1-L39】.
- `eslint.config.mjs` – ESLint configuration.
- `next.config.ts` – Next.js configuration enabling bundle analyzer and remote image patterns【F:next.config.ts†L1-L29】.
- `middleware.ts` – Updates Supabase session and enforces CSRF tokens and CSP headers【F:middleware.ts†L1-L35】.
- `package.json` – Defines scripts and dependencies including ai-sdk, supabase, tailwind, etc.【F:package.json†L1-L59】.
- `postcss.config.mjs` – Tailwind/PostCSS setup.
- `tsconfig.json` – TypeScript compiler settings with path alias `@/*`【F:tsconfig.json†L1-L27】.
- `CODE_OF_CONDUCT.md` – Community guidelines.
- `INSTALL.md` – Extensive installation and deployment guide explaining environment variables, database schema, Docker usage and more【F:INSTALL.md†L1-L140】【F:INSTALL.md†L160-L200】.
- `README.md` – Introductory overview and quick start instructions【F:README.md†L1-L50】.

### Public Assets

- `public/*` – Images (banner backgrounds, cover) and GitHub button graphic.

### Application Directory (`app`)

- `app/layout.tsx` – Root layout that loads fonts, providers and analytics scripts【F:app/layout.tsx†L1-L87】.
- `app/layout-client.tsx` – Client component for responsive behavior.
- `app/globals.css` – Global Tailwind styles.
- `app/page.tsx` – Home page rendering `ChatContainer` inside `LayoutApp`【F:app/page.tsx†L1-L13】.
- `app/not-found.tsx` – 404 fallback component【F:app/not-found.tsx†L1-L12】.
- `app/auth/*` – Authentication pages and OAuth callback logic. `login-page.tsx` performs Google sign‑in using Supabase【F:app/auth/login-page.tsx†L1-L77】. `callback/route.ts` exchanges OAuth codes and inserts new users【F:app/auth/callback/route.ts†L1-L69】. `error/page.tsx` displays auth errors.
- `app/c/[chatId]/page.tsx` – Dynamic route showing a single chat with user authentication check【F:app/c/[chatId]/page.tsx†L1-L24】.
- `app/p/[projectId]/*` – Project chat view; `project-view.tsx` handles message submission, file uploads and chat listing【F:app/p/[projectId]/project-view.tsx†L1-L159】【F:app/p/[projectId]/project-view.tsx†L160-L320】.
- `app/share/[chatId]/*` – Public sharing page and article layout for an exported chat conversation【F:app/share/[chatId]/page.tsx†L1-L71】【F:app/share/[chatId]/article.tsx†L1-L79】.
- `app/hooks/*` – React hooks for breakpoints, key shortcuts and chat drafts.
- `app/components/*` – UI pieces such as chat input, conversation view, sidebar items, header, etc.
- `app/api/**` – Serverless API routes:
  - `api/chat/route.ts` – Streams chat completions via the AI SDK and logs messages【F:app/api/chat/route.ts†L1-L79】【F:app/api/chat/route.ts†L80-L158】.
  - `api/chat/api.ts` – Validates usage, saves messages and increments counts【F:app/api/chat/api.ts†L1-L69】.
  - `api/models/route.ts` – Returns available models, refreshing cache if necessary【F:app/api/models/route.ts†L1-L69】.
  - `api/create-chat/route.ts` – Creates a new chat record【F:app/api/create-chat/route.ts†L1-L37】.
  - `api/update-chat-model/route.ts` – Changes the model field on a chat row【F:app/api/update-chat-model/route.ts†L1-L43】.
  - `api/projects/*` – CRUD endpoints for user projects【F:app/api/projects/route.ts†L1-L61】【F:app/api/projects/[projectId]/route.ts†L1-L119】.
  - `api/create-guest/route.ts` – Creates anonymous user profiles if Supabase is enabled【F:app/api/create-guest/route.ts†L1-L62】.
  - `api/providers/route.ts` – Checks if a user has an API key stored for a provider【F:app/api/providers/route.ts†L1-L56】.
  - `api/rate-limits/*` – Returns usage counts and daily limits【F:app/api/rate-limits/route.ts†L1-L25】【F:app/api/rate-limits/api.ts†L1-L36】.
  - `api/csrf/route.ts` – Generates and sets a CSRF token cookie【F:app/api/csrf/route.ts†L1-L14】.
  - `api/health/route.ts` – Simple health check endpoint returning uptime【F:app/api/health/route.ts†L1-L11】.

### Library (`lib`)

- `lib/config.ts` – App constants, default prompt and suggestion lists【F:lib/config.ts†L1-L89】.
- `lib/csrf.ts` – CSRF token creation and validation helpers【F:lib/csrf.ts†L1-L25】.
- `lib/fetch.ts` – Adds CSRF header to client fetches【F:lib/fetch.ts†L1-L14】.
- `lib/encryption.ts` – AES‑256‑GCM encryption for user API keys【F:lib/encryption.ts†L1-L37】.
- `lib/api.ts` – Client utilities for guest creation, rate limit checks, OAuth sign‑in and chat model updates【F:lib/api.ts†L1-L69】【F:lib/api.ts†L160-L219】.
- `lib/models/*` – Static and dynamic model configuration. `index.ts` loads provider model lists and caches Ollama detections【F:lib/models/index.ts†L1-L59】.
- `lib/openproviders/*` – Provider mapping and environment handling. `provider-map.ts` resolves which provider owns each model ID【F:lib/openproviders/provider-map.ts†L1-L150】【F:lib/openproviders/provider-map.ts†L160-L167】. `env.ts` exposes API keys from environment variables【F:lib/openproviders/env.ts†L1-L22】.
- `lib/supabase/*` – Client creation for browser or server, plus guest server client using the service role【F:lib/supabase/server.ts†L1-L30】【F:lib/supabase/server-guest.ts†L1-L20】.
- `lib/user/*` – Retrieval of user profiles and type definitions【F:lib/user/api.ts†L1-L48】.
- `lib/user-keys.ts` – Fetches encrypted API keys for a user and falls back to environment values【F:lib/user-keys.ts†L1-L42】.
- `lib/user-preference-store/*` – React context provider storing layout and model preferences; conversion helpers map camelCase to database fields【F:lib/user-preference-store/provider.tsx†L1-L120】【F:lib/user-preference-store/utils.ts†L1-L35】.
- `lib/chat-store/*` – Context providers for chats, messages and current session. Persistence utilities store data in IndexedDB for offline access【F:lib/chat-store/chats/provider.tsx†L1-L119】【F:lib/chat-store/messages/provider.tsx†L1-L100】【F:lib/chat-store/persist.ts†L1-L80】.
- `lib/model-store`, `lib/tanstack-query` and `lib/user-store` – Additional contexts managing selected models, query cache and logged‑in user.
- `lib/usage.ts` – Functions to check and increment message quotas per user and per model【F:lib/usage.ts†L1-L92】【F:lib/usage.ts†L160-L218】.
- `lib/file-handling.ts` – File upload utilities used in chat input.
- `lib/motion.ts` – Shared motion configuration for animations.

### Components (`components`)

- `components/ui/*` – Shadcn/ui wrappers (buttons, dialogs, forms).
- `components/prompt-kit/*` – Chat interface primitives like `chat-container.tsx` and `file-upload.tsx`【F:components/prompt-kit/chat-container.tsx†L1-L37】【F:components/prompt-kit/file-upload.tsx†L1-L63】.
- `components/motion-primitives/*` – Reusable animation helpers such as `progressive-blur.tsx`【F:components/motion-primitives/progressive-blur.tsx†L1-L40】.
- `components/icons/*` – SVG icons for each provider (OpenAI, Mistral, etc.)【F:components/icons/openai.tsx†L1-L28】.
- `components/common/*` – Shared UI features. Example: `feedback-form.tsx` posts feedback to Supabase【F:components/common/feedback-form.tsx†L1-L88】.

### Utilities (`utils`)

- `utils/supabase/middleware.ts` – Middleware helper for Supabase sessions used in `middleware.ts`【F:utils/supabase/middleware.ts†L1-L62】.

### Type Definitions

- `app/types/api.types.ts` – Interfaces for API message formats and Supabase client type【F:app/types/api.types.ts†L1-L53】.
- `app/types/database.types.ts` – Generated types for Supabase tables (users, chats, messages, etc.)【F:app/types/database.types.ts†L1-L157】.

## 🔗 Inter-File Dependencies Map

- **Next.js Pages** call API routes for chat interaction and project management.
- **React Providers** in `lib/*store` supply state to components in `app/components`.
- **API Routes** use helpers from `lib` (e.g., `lib/models`, `lib/user-keys`, `lib/usage`) and Supabase client factories.
- **Middleware** uses `utils/supabase/middleware.ts` and `lib/csrf.ts` to attach sessions and validate tokens.
- **Ollama Detection** in `lib/models/data/ollama.ts` (not shown) fetches local models for `index.ts`.
- **Encryption** and `user-keys.ts` ensure BYOK secrets are stored securely and accessed by `api/chat` when streaming messages.

## 🛠️ Tech Stack, Tools & Configs

- **Language**: TypeScript with React 19 and Next.js 15.
- **Styling**: Tailwind CSS 4 with PostCSS and tailwindcss-animate.
- **AI SDK**: `@ai-sdk/*` packages for multiple providers, plus `openrouter` integration.
- **State Management**: React context + Zustand (via context wrappers).
- **Database**: Supabase Postgres; SQL schema detailed in `INSTALL.md`.
- **Testing**: Type checking via `npm run type-check` (fails without dependencies)【e0a28d†L1-L35】.
- **CI/CD**: GitHub Actions defined in `.github/workflows` (not opened here). Dependabot for dependency updates.
- **Docker**: Provided Dockerfile and Compose files for running with or without Ollama.

## 🧭 Execution Flow(s)

1. **Development Start** – `npm run dev` launches Next.js with the app router. Middleware sets CSRF cookies and Supabase sessions.
2. **User Visits `/`** – `app/page.tsx` loads the chat UI. `ChatsProvider` retrieves chat history via `lib/chat-store/chats/api.ts`. Messages are stored client-side via IndexedDB (`persist.ts`).
3. **Sending a Message** – `ChatInput` invokes `useChat` from `@ai-sdk/react`, which posts to `/api/chat`. `api/chat/route.ts` validates rate limits, obtains the correct provider and streams the response back.
4. **Storing to Database** – If Supabase is configured, `api/chat/api.ts` records user and assistant messages, increments usage and updates counts.
5. **Projects & Sharing** – `/p/[projectId]` provides a chat workspace with project filtering. `/share/[chatId]` creates a public article view of messages.
6. **Authentication** – Visiting `/auth` renders `LoginPage`. Supabase OAuth callback stores user data in `users` table. Sessions are refreshed via middleware on each request.

## 🧹 Legacy / Dead / Risky Files

- Some provider mapping files in `lib/models/data/*` may contain outdated model lists. Refresh via the API route `POST /api/models` as documented.
- `docker-compose.yml` only runs the app, while `docker-compose.ollama.yml` adds a full Ollama service.
- The project includes numerous icons and example assets which have no logic impact.

## 📌 Final Notes & Onboarding Tips

1. Create `.env.local` using `.env.example` and ensure `CSRF_SECRET` plus Supabase keys are set.
2. Install dependencies with `npm install`. Running `npm run type-check` requires TypeScript and `@types/*` packages which may be missing in a minimal environment.
3. For local models, install Ollama and run `docker-compose -f docker-compose.ollama.yml up` to start both the model server and oLegal.
4. Review `INSTALL.md` for full database setup and environment configuration.
5. Explore React context providers under `lib/*store` to understand state management and persistence.
