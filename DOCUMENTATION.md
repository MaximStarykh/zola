# Zola Technical Documentation

## Overview and Purpose

**Zola** is an open-source, full-stack AI chat application that provides a unified chat interface for multiple AI models. It aims to be **model-agnostic** and self-hostable, allowing users to interact with various large language models (LLMs) (OpenAI, Anthropic’s Claude, Google’s Gemini, Mistral, local LLaMA models via Ollama, etc.) from one web UI. Key features include multi-model chat, Bring-Your-Own-Key (BYOK) support (users can supply their own API keys via OpenRouter), file upload with context injection, and a clean responsive interface with light/dark themes. The application is built with modern web technologies – Next.js (React) for the frontend, a Node.js backend (serverless functions via Next API routes), and integrates Vercel’s AI SDK for streaming AI responses and model orchestration. Authentication and data persistence are handled by Supabase (managed PostgreSQL + auth), making it easy to store chat histories, user profiles, and file attachments securely. Overall, Zola’s goal is to provide developers and end-users a flexible chat platform that can work with both cloud-based and local AI models, with extensible components and a developer-friendly architecture.

## Architecture Overview

**High-Level Architecture:** Zola follows a **full-stack Next.js 13 architecture** using the App Router. The frontend (client) and backend (serverless functions) are part of one unified Next.js project. This means the app can render UI components and also define API endpoints under the same project. Zola’s architecture can be divided into:

* **Client-side UI (Frontend):** A single-page React application powered by Next.js. The UI is composed of modular components (using Tailwind CSS and Shadcn UI for styling) such as a sidebar for chat list, a chat conversation window, message bubbles, input box, etc. The frontend uses React context providers and hooks to manage state (for current chat session, message list, user info, theme, etc.). It communicates with the backend via fetch calls to Next API routes (e.g. sending user messages to the `/api/chat` route). On the client, Zola leverages the Vercel AI SDK’s React hooks (like `useChat`) to manage message streaming and state updates. The UI is responsive and supports multiple layouts (a full-width view or a sidebar view) based on user preference.

* **Server-side API (Backend):** A set of Next.js **API routes** under the `app/api` directory implement the backend logic. These routes run on the server (or edge, if configured) and handle tasks such as generating model responses, managing conversations, and performing authentication-related operations. Notable API endpoints include:

  * `POST /api/chat`: Accepts a user’s message and streams back the AI’s response. This is the core chat completion endpoint.
  * `POST /api/create-chat`: Creates a new chat (conversation) record in the database.
  * `POST /api/create-guest`: Registers a guest (anonymous) user in the database (for users not logged in).
  * `POST /api/update-chat-model`: Changes the model used for an existing chat (e.g. switch a conversation to a different model).
  * `GET /api/models`: Retrieves the list of available models (both remote APIs and local models) and their configuration for the frontend.
  * `GET /api/user-key-status`: Indicates which providers the current user has supplied API keys for (for BYOK support).
  * `GET /api/user-preferences/favorite-models`: Fetches the user’s saved favorite models.
  * `GET /api/rate-limits`: Checks the user’s current usage vs. daily limits.
  * `GET /api/csrf`: Issues a CSRF token (used to protect state-changing requests).

  The backend functions make heavy use of the Supabase client (for database reads/writes) and the Vercel AI SDK (for calling AI models and streaming responses). Each API route typically validates the request, performs any necessary Supabase queries, and returns JSON data (or streams events) as a response.

* **Database and Authentication:** Supabase serves as the **database (PostgreSQL)** and **auth provider**. Zola’s schema (see **Database Schema** below) has tables for users, chats, messages, etc., which Supabase manages. Supabase also provides authentication: users can log in via Google OAuth (or other providers) or use an **anonymous guest account**. The application uses Supabase JWT cookies to identify logged-in users on the server. For guest users, Supabase’s *anonymous sign-in* feature is used to obtain a temporary user ID without credentials. The Next.js server middleware ensures that on each request, the Supabase session is loaded (so the server knows which user is making the API call). Zola also uses **Row-Level Security** policies in Supabase to ensure users can only access their own data.

* **Local AI Model Service:** If configured, Zola connects to **Ollama**, an open-source local LLM runtime. Ollama runs separately (as a local service on port 11434) and hosts models like LLaMA 2, etc. Zola will automatically detect models available in the Ollama service and include them in the model list. When a user selects a local model, Zola’s backend will send the chat request to the Ollama API instead of an external provider. (Under the hood, Ollama exposes a REST API; Zola’s model integration layer can call it using the same interface as cloud APIs.)

**Data Flow:** The typical data flow for a user message is: **React UI → Next.js API route → External Model API (or local model) → Next.js API response (stream) → React UI updates.** For example, when a user types a prompt and hits *Send*:

1. The frontend (using the `useChat` hook from Vercel AI SDK) will optimistically add the user’s message to the UI and send an HTTP POST to `/api/chat` with the message content, the selected model, and conversation context.
2. The `/api/chat` route handler validates the request (e.g. checks that the user is allowed to use the chosen model and has not exceeded usage limits). It then prepares a call to the appropriate model provider. Zola uses a **provider mapping** to route the request: for example, if the model ID corresponds to OpenAI’s GPT-4, it will use the OpenAI API; if it’s a local Ollama model, it calls the Ollama API. It looks up the model config and obtains any required API keys (either from the server environment or the user’s stored keys) and then invokes the Vercel AI SDK to initiate a streaming completion.
3. The **Vercel AI SDK** (server-side) handles the low-level interaction with the model. Zola calls `streamText()` from the SDK, passing in a model client instance and the conversation parameters. This returns a **streaming response** (an `EventStream` that yields tokens or messages). Zola attaches callbacks for errors and for when the stream finishes. For example, on stream completion, Zola will store the assistant’s final message into the database asynchronously.
4. The `/api/chat` route doesn’t wait for the whole response; it begins streaming results back to the client as they are generated. This is done by converting the model’s stream to a response that can be consumed by the browser (`result.toDataStreamResponse()` in the code). The HTTP response is of type **text/event-stream** (Server-Sent Events). Each chunk contains either a piece of the assistant’s message, intermediate reasoning (if enabled), or a completion of the answer.
5. On the client side, the Vercel AI React hook (`useChat`) automatically handles the SSE stream. As tokens arrive, the hook updates the `messages` state so that the UI displays the assistant’s answer progressively. The streaming text appears in real-time in the conversation UI.
6. After the stream ends, the client hook calls its `onFinish` callback. In Zola, this triggers some cleanup: the user’s original message and the assistant’s completed response are added to the persistent context store. (Note: Zola maintains its own message state context in addition to the hook’s internal state, to merge with cached messages and enable features like edit/delete.)
7. The conversation is now updated on both client and server: the UI shows the full exchange, and the backend has saved the messages in the database for retrieval later.

**Session Flow and State:** Zola treats each chat conversation as a **session** identified by a `chatId`. In the URL, conversations are accessed under `/<c/[chatId]>`. The Next.js App Router uses a dynamic route for chat pages (`app/c/[chatId]/page.tsx`). This page component serves the main chat interface, and it reads the `chatId` from the URL to know which conversation to load. A React context called **ChatSessionContext** provides the current `chatId` to all components (it parses the URL via `usePathname()` and extracts the ID).

When a user opens Zola:

* If they navigate to the base URL (`/` with no chat specified) and are not currently in a conversation, the app will show a welcome or “What’s on your mind?” onboarding prompt (since there’s no active chat).
* If they start typing a message in this state, the app will **ensure a chat session exists** by creating a new chat record on the fly. This is handled by a utility `ensureChatExists` – it will call the `createNewChat` API if `chatId` is null and no messages have been sent yet. Once a new chat is created, if the user is authenticated Zola updates the URL to the new `chatId` (using `window.history.pushState`) so that the session is reflected in the route. (For guest users, Zola may keep them on the base URL and just store the chatId internally in localStorage, effectively allowing a single ongoing session without changing the address bar.) After this, subsequent messages will use that chat’s ID.
* If the user navigates to an existing chat URL (e.g. `/c/1234`), the app recognizes the chat session. On initial render, the client will fetch the messages for that chat from local cache or the database. Zola uses a **MessagesContext** provider to load the conversation history: it first loads any cached messages from IndexedDB (for offline or instant load), then queries the Supabase database for the full message list and merges them. This allows the conversation to persist across page reloads or user logins.
* The list of all user chats is managed by a **ChatsContext** provider. It similarly fetches chat metadata (IDs, titles, last updated time, etc.) from local storage and Supabase on startup. The chat list is displayed in the sidebar. When a user starts a new chat or deletes one, the context updates accordingly (including optimistic UI updates and syncing to the DB via API calls).
* **User session (authentication):** On every page load or navigation, Next.js runs a middleware (`middleware.ts`) that checks the auth status and sets security headers. The middleware uses the Supabase SSR helper to refresh the session cookie, so the server knows if the user is logged in. If a user is required for a certain page (e.g. the main chat page might redirect if not logged in and auth is enforced), the page component will handle that. In Zola’s case, the chat page allows guests, but if a guest tries to use a model that requires login, the application may prompt them to sign in (see **Usage Limits & Access Control** below).

In summary, the architecture is a **client-centric React app** with serverless API support. The client is responsible for rendering the chat UI and managing state in real-time (with contexts for user, chats, messages, etc.), while the server provides secure endpoints for model inference and data management. Supabase ties the two together by providing identity and persistence (so that, for example, a user can log in on one device and see their chat history, or resume a conversation later).

## Tech Stack and Dependencies

Zola’s implementation leverages a variety of modern frameworks and libraries:

* **Next.js 13 (App Router)** – Zola is built on Next.js, using the App Router architecture (`app/` directory) for defining routes and React Server Components. This provides server-rendering where appropriate and seamless API route integration. The React components use functional components and React hooks throughout.

* **TypeScript** – The codebase is written in TypeScript, providing static typing for React props, API payloads, Supabase data types, etc. (The repository is \~99% TypeScript.)

* **UI and Styling:**

  * **Tailwind CSS** is used for styling the application’s components, enabling utility-first, responsive design.
  * **shadcn/UI** (Radix UI) – Zola’s UI components are built on top of Radix primitives, via the shadcn/ui library. This gives accessible, pre-styled components (dialogs, dropdowns, scroll areas, toggles, etc.) that match the Tailwind design. For example, the chat input, modal dialogs (for settings or login), toasts, and tooltips use these components.
  * **Motion Primitives / Framer Motion** – For subtle animations, Zola includes the motion-primitives library. This likely is used for animating the appearance of messages or transitions of UI elements.
  * **Icons** – The app uses icon libraries such as Phosphor Icons and Lucide. For example, icons for “new chat”, “search”, GitHub logo, etc., are imported from `@phosphor-icons/react` in the sidebar component.
  * **Themes** – Dark/light theme toggling is supported via the `next-themes` library. The `<ThemeProvider>` in the layout ensures the chosen theme class is applied to the document (using `class` on `<html>` for Tailwind to style accordingly). Users can switch themes, which is persisted.

* **State Management:**

  * **React Context + Hooks** – Instead of an external state library, Zola organizes state with React context providers (found in the `lib/.../provider.tsx` files). There are providers for user auth state, user preferences, active chats list, current chat messages, and available models. Each provider uses `useState` or Zustand internally and exposes hooks like `useUser()`, `useChats()`, `useMessages()`, etc., for components to consume the state. For transient local state (e.g. the draft message text in the input before sending), it uses React state or custom hooks (like `use-chat-draft` to persist input per chat).
  * **Zustand** – The package `zustand` is included, which is a lightweight state container. It’s possible some parts of the app (maybe the sidebar open/closed state or other global flags) use Zustand, but the main usage is via React context as described. Many context providers in Zola are simple wrappers around React state or Tanstack Query (see below).
  * **TanStack React Query** – Zola uses React Query for some data fetching and caching. For example, the `LayoutClient` component uses `useQuery` to call the CSRF endpoint on mount. Also, model lists and user key status might be fetched via React Query to cache results. A `<TanstackQueryProvider>` is present to set up the QueryClient context globally.

* **Supabase (Database and Auth):** Supabase is a core part of the stack. Zola uses the official Supabase JS libraries:

  * On the server, it uses `@supabase/ssr` (Supabase’s server-side helper) to create a client with the user’s cookies for auth, or with the service role key when needed. For instance, `createServerClient` is used to get a server-side Supabase client in API routes or server components, and `createMiddlewareClient` is used in `middleware.ts` to manage auth cookies on each request.
  * On the client, `createBrowserClient` is used to initialize Supabase (using the anon public key) for making authenticated requests and real-time subscriptions. The app is configured to use Supabase both for **auth** (OAuth with Google, and anonymous sign-ins) and for **storage** (storing user-uploaded files, like chat attachments, in Supabase Storage buckets).
  * Supabase’s Auth integration: The app can sign users in via Google OAuth (`signInWithGoogle` function calls `supabase.auth.signInWithOAuth({...})` with the proper redirect URLs). It also enables anonymous login: `supabase.auth.signInAnonymously()` is used to create guest sessions when needed.
  * The database schema in Supabase includes tables for users, chats, messages, attachments, etc. (See **Database Schema** below for details). The app reads and writes to these tables via Supabase queries. For example, inserting a new message: `supabase.from("messages").insert({...})` is called in the backend when logging user messages, and selecting chat lists: `supabase.from("chats").select("*").eq("user_id", ...)` is used in the chats provider.
  * **Row Level Security**: Supabase RLS policies are expected to restrict data access. The installation guide explicitly reminds to enable RLS on these tables and create policies (e.g. users can select/update their own data, etc.). This ensures that even though the client might have the anon key, they cannot read other users’ chats. The backend uses the service role key only for specific tasks (like creating a guest user or checking usage counters) where elevated privileges are needed.

* **Vercel AI SDK:** Zola relies on Vercel’s AI SDK (the `ai` NPM package, along with provider-specific packages) for AI functionality. This SDK simplifies calling various model APIs and streaming responses. Zola’s usage includes:

  * On the **frontend**, it imports React hooks from `@ai-sdk/react` (the new AI SDK’s React integration). In particular, it uses the `useChat` hook which manages a message list and handles calling the backend API and receiving server-sent events for streaming. In `useChatCore`, Zola initializes `useChat({ api: "/api/chat", onFinish: ..., onError: ... })` to connect to its chat endpoint. The `useChat` hook provides reactive state for `messages`, `input`, `status`, and functions like `append` (to add a message) and `reload` (to resend the last prompt).
  * On the **backend**, it uses the SDK’s model provider classes and streaming utilities. The package `ai` exposes a `streamText` function that can take a model instance and stream a chat completion. Zola includes provider packages such as `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/mistral`, etc., which each export classes to call those APIs. It defines a mapping of model IDs to a function that yields a provider instance. For example, for an OpenAI model, Zola might use `new OpenAI(apiKey)`; for an Anthropic model, `new Anthropic(apiKey)`, etc. The **model configuration** (likely defined in `lib/models.ts`) associates each model with an `apiSdk` factory. When handling a request, the server finds the model config by ID and calls `modelConfig.apiSdk(userApiKey, options)` to get a configured client for that model. Then it calls `streamText({ model: modelClient, messages, ... })` from the SDK to get a streaming result. The SDK abstracts differences between providers, so `streamText` works uniformly for OpenAI, Anthropic, or others.
  * The AI SDK also supports **tools and agents**, as indicated by the presence of tool-related code in Zola (there is mention of “MCP” – Model Context Protocol – and WIP agent features). In the `streamText` call, Zola passes an empty `tools: {} as ToolSet` and some config like `maxSteps: 10`. This suggests Zola is preparing to integrate AI **agents** that can use tools, but currently no tools are active (the tools set is empty). The code includes utility functions to clean or detect tool-related content in messages, indicating that if a user mentions an `@agent` or triggers a tool, Zola would handle it. However, as of now these features are likely experimental (flagged as “WIP” in the README). The architecture does, however, support receiving structured data like reasoning steps or tool outputs in the streaming response (the `sendReasoning: true, sendSources: true` flags in the stream response indicate the client is prepared to handle reasoning and source parts if present).

* **Other Libraries:**

  * **BYOK encryption:** Zola allows users to store their own API keys (so they can use their own OpenAI account, etc.). For security, it uses encryption. The `lib/encryption` module and environment variable `ENCRYPTION_KEY` are used to encrypt these keys in the database. It likely uses Node’s crypto module (32-byte key, AES encryption). The `user_keys` table stores `encrypted_key` and `iv` (initialization vector) for each provider’s key. When needed, the server decrypts the key (via `decryptKey`) to call the provider. The `getEffectiveApiKey` function chooses the user’s key if available, otherwise falls back to a global API key from environment.
  * **Markdown and Code Rendering:** Chat messages often contain Markdown or code. Zola includes `react-markdown` and `shiki` for rendering formatted messages. The assistant’s replies (which might be markdown text with code blocks) are likely rendered in the UI using `react-markdown` with plugins like `remark-gfm` (for tables and GitHub-flavored markdown) and `shiki` for syntax highlighting of code blocks.
  * **DOMPurify:** To guard against any HTML in user inputs or model outputs, `dompurify` is included. It can sanitize any HTML strings in messages to prevent XSS in case the model returns unsafe content.
  * **File Handling:** The app uses `file-type` to detect file MIME types and `idb-keyval` to help cache data in IndexedDB. Uploads are handled via the browser to Supabase Storage – likely the `useFileUpload` hook in the chat input component manages reading files and uploading to a Supabase storage bucket (the `chat-attachments` bucket) before sending a reference in the message. Attachments are represented in messages with an `experimental_attachments` field (an array of attachment metadata). The UI can display these attachments and possibly use context (for example, feeding file text to the model, though that functionality is not explicitly detailed).
  * **CSRF Protection:** To protect against cross-site request forgery on state-changing requests (especially since this is a single-page app that might be served on Vercel), Zola implements a CSRF token system. A secure token is generated server-side and stored in a `csrf_token` cookie, and all modifying requests must include the matching token in an `x-csrf-token` header. The middleware checks this header for POST/PUT/DELETE requests and returns 403 if invalid. The token is generated using a secret (`CSRF_SECRET` in env) and a random value hashed together. On the client, Zola uses a small `fetchClient` wrapper to automatically include the CSRF token header on each request. This ensures API routes cannot be hit by unauthorized scripts from other origins.

In summary, Zola’s tech stack includes Next.js/React for the UI, Tailwind/Radix for styling, Supabase for backend services (auth and data), and the Vercel AI SDK for interacting with AI models. All these pieces are tied together to create a smooth chat experience where the complexity of dealing with different AI providers and maintaining state is largely abstracted away by the chosen libraries.

## Codebase Structure and Components

The repository is organized into several top-level directories and files, each with a specific role in the system:

```
├── app/
│   ├── layout.tsx
│   ├── layout-client.tsx
│   ├── globals.css
│   ├── middleware.ts    (Next.js middleware)
│   ├── page.tsx         (Landing page or redirect logic)
│   ├── c/[chatId]/page.tsx   (Chat page for a given conversation)
│   └── api/
│       ├── chat/route.ts         (Chat completion API)
│       ├── chat/api.ts           (Helper functions for chat route)
│       ├── chat/utils.ts         (Error handling, tool filtering for chat)
│       ├── chat/db.ts            (DB helpers for storing messages)
│       ├── create-chat/route.ts  (API to create a new chat)
│       ├── create-chat/api.ts    (Helper to insert chat in DB)
│       ├── create-guest/route.ts (API to register guest user)
│       ├── csrf/route.ts         (API to issue CSRF token cookie)
│       ├── update-chat-model/route.ts (API to change chat's model)
│       ├── models/route.ts       (API to list available models)
│       ├── user-key-status/route.ts   (API to get which user API keys exist)
│       └── user-preferences/
│            └── favorite-models/route.ts (API for user's favorite model list)
├── components/
│   ├── ui/ ...         (Shared UI components, e.g., modal, scroll area, toast)
│   ├── layout/ ...     (Layout components: AppSidebar, Header, etc.)
│   ├── chat/ ...       (Chat interface components: ChatContainer, Chat, Conversation, etc.)
│   ├── chat-input/ ... (Input box component and related logic)
│   ├── multi-chat/ ... (Components for multi-model chat mode, if enabled)
│   └── ... other component groupings (history, settings, feedback widget, etc.)
├── lib/
│   ├── config.ts             (Static configuration constants, e.g., default system prompt, limits)
│   ├── routes.ts             (Defines constant strings for routes like `/api/chat` etc. for reuse in fetch calls):contentReference[oaicite:52]{index=52}
│   ├── fetch.ts              (Custom fetch wrapper that attaches CSRF token):contentReference[oaicite:53]{index=53}
│   ├── csrf.ts               (CSRF token generation & validation logic):contentReference[oaicite:54]{index=54}
│   ├── openproviders/ ...    (Provider mapping for models; e.g., getProviderForModel, provider types)
│   ├── user-keys.ts          (Logic for BYOK: retrieving and decrypting user API keys):contentReference[oaicite:55]{index=55}:contentReference[oaicite:56]{index=56}
│   ├── encryption.ts         (Encryption helper for securing API keys)
│   ├── usage.ts              (Functions for usage limits: checkUsage, incrementUsage, etc.):contentReference[oaicite:57]{index=57}:contentReference[oaicite:58]{index=58}
│   ├── server/api.ts         (Server helpers for auth: validateUserIdentity):contentReference[oaicite:59]{index=59}:contentReference[oaicite:60]{index=60}
│   ├── supabase/
│   │    ├── client.ts        (Creates a Supabase browser client):contentReference[oaicite:61]{index=61}
│   │    ├── server.ts        (Creates a Supabase server client using cookies for SSR)
│   │    ├── server-guest.ts  (Creates a Supabase client with service role for guest ops):contentReference[oaicite:62]{index=62}:contentReference[oaicite:63]{index=63}
│   │    └── config.ts        (Checks if Supabase is enabled via env vars):contentReference[oaicite:64]{index=64}
│   ├── user/
│   │    ├── api.ts           (Server-side user data fetch, e.g., getUserProfile):contentReference[oaicite:65]{index=65}:contentReference[oaicite:66]{index=66}
│   │    └── types.ts         (Type definitions for UserProfile, etc.)
│   ├── user-store/
│   │    ├── provider.tsx     (React context for user state, manages login/out):contentReference[oaicite:67]{index=67}:contentReference[oaicite:68]{index=68}
│   │    ├── api.ts           (Client-side user API: fetch/update profile, sign out):contentReference[oaicite:69]{index=69}:contentReference[oaicite:70]{index=70}
│   │    └── ...              (perhaps additional user store utils)
│   ├── user-preference-store/
│   │    ├── provider.tsx     (Context for user UI preferences like layout mode, toggles)
│   │    ├── utils.ts         (Functions to convert preferences from API format)
│   │    └── ... 
│   ├── chat-store/
│   │    ├── chats/provider.tsx    (Context for list of chats):contentReference[oaicite:71]{index=71}:contentReference[oaicite:72]{index=72}
│   │    ├── chats/api.ts          (Functions to get/create/update chat records, with caching):contentReference[oaicite:73]{index=73}:contentReference[oaicite:74]{index=74}
│   │    ├── messages/provider.tsx (Context for messages in the current chat):contentReference[oaicite:75]{index=75}:contentReference[oaicite:76]{index=76}
│   │    ├── messages/api.ts       (Functions to fetch/insert messages from DB or cache):contentReference[oaicite:77]{index=77}:contentReference[oaicite:78]{index=78}
│   │    ├── persist.ts            (Wrapper around IndexedDB for caching chats/messages) 
│   │    └── types.ts              (Types for Chat and Message shapes used in context)
│   ├── model-store/
│   │    ├── provider.tsx     (Context for available models and user’s model preferences):contentReference[oaicite:79]{index=79}:contentReference[oaicite:80]{index=80}
│   │    └── types.ts         (Type definitions for ModelConfig, etc.)
│   └── utils.ts              (General utility functions, e.g., a `cn` classnames helper)
├── public/               (Static assets like images – contains cover image, icons, etc.)
├── .env.example          (Sample environment variables):contentReference[oaicite:81]{index=81}
├── Dockerfile            (Docker configuration for containerizing the app)
├── docker-compose.yml    (Docker compose for deploying Zola and required services)
├── docker-compose.ollama.yml (Compose file to run Zola alongside an Ollama instance for local models)
├── INSTALL.md            (Installation and setup guide with detailed steps):contentReference[oaicite:82]{index=82}:contentReference[oaicite:83]{index=83}
├── README.md             (README with overview, features, and quick start usage):contentReference[oaicite:84]{index=84}:contentReference[oaicite:85]{index=85}
└── ... (config files like tsconfig.json, eslint, etc.)
```

Let’s break down some of the most important files and their responsibilities:

### Next.js App Structure (Pages and Middleware)

* **`app/layout.tsx`**: This is the root layout component for the Next.js App Router. It wraps all pages. In Zola, the layout sets up global context providers and theming. It imports a host of providers: `UserProvider`, `UserPreferencesProvider`, `TanstackQueryProvider`, `ModelProvider`, `ChatSessionProvider`, `ChatsProvider`, etc., and composes them to make their context available app-wide. It also includes the theme provider (`next-themes`) and likely a `<Head>` with metadata (title "Zola"). Additionally, layout may include global UI elements like the <Toaster /> for toast notifications and the <TooltipProvider>. Essentially, `layout.tsx` establishes the environment in which all pages are rendered – user authentication state, theme, and the initial data fetch for chats/models via the providers.

* **`app/layout-client.tsx`**: This is a small companion component to the layout that is marked `"use client"` (ensuring it runs in the browser). Its job is to execute any client-side effects that need to happen once on startup. In Zola, `LayoutClient` uses React Query to call the CSRF token endpoint on mount. This triggers the server to set a CSRF cookie. By doing this in a client component that is included in the layout, Zola ensures every new user session obtains a CSRF token without requiring a full page reload. `LayoutClient` doesn’t render any visible UI (it returns `null`); it only performs this side effect.

* **`app/middleware.ts`**: This is a Next.js middleware that runs on every request (both for pages and API calls, unless excluded). In Zola, the middleware does two things:

  1. It calls `updateSession(request)` (from `@/utils/supabase/middleware`, not shown above but presumably similar to Supabase’s examples) to refresh or set the Supabase auth session cookie for SSR. This ensures that if a user is logged in, subsequent requests have an up-to-date session, and if they log out, the session is cleared.
  2. It implements CSRF protection and sets security headers. The code checks if the method is POST/PUT/DELETE and then verifies that the `x-csrf-token` header matches the cookie `csrf_token`. If not, it rejects the request. This helps prevent cross-site attacks on state-changing endpoints.
     It also sets a Content Security Policy (CSP) header on all responses, restricting the sources of scripts, styles, images, and connections. For example, in development it allows connections to localhost (for Vite HMR or AI provider APIs like OpenAI, Mistral, Supabase, GitHub API), and in production it allows the necessary domains (OpenAI, Mistral, Supabase, an analytics domain if any, etc.). The middleware’s `matcher` is configured to apply to all routes except Next.js static assets and image routes.

* **Pages (`app/page.tsx` and `app/c/[chatId]/page.tsx`):**

  * `app/page.tsx` – This might serve as a landing page. The README suggests Zola’s main interface is the chat, so the landing page could either redirect to a new chat or render an introduction. It’s common in such apps to use the root page to either show a “Start a new chat” button or immediately create a new chat. (If `app/page.tsx` is minimal, Zola might actually rely on the chat UI even for the root route by treating `chatId = null` as “no chat yet”. Indeed, in the Chat component, if there’s no `chatId` and no messages, it shows the onboarding prompt, which could be the behavior on the root page.)
  * `app/c/[chatId]/page.tsx` – This is the main chat page. It uses the dynamic `chatId` from the URL to determine which conversation to load. The page component likely fetches nothing on the server (except perhaps verifying the user). In Zola’s implementation, it checks if Supabase is enabled and if so, ensures the user is authenticated; if the user is not logged in, it will redirect them to the home (`/`). This is a server-side guard to prevent unauthorized access to specific chat URLs if authentication is required. After that, the page renders the chat UI. The JSX rendered is probably just a wrapper like `<LayoutApp> <ChatContainer/> </LayoutApp>`. Indeed, the code suggests it renders a `<LayoutApp>` component which includes the sidebar and header, and inside that, a `<MessagesProvider>` wrapping the chat content. The `MessagesProvider` is given the `chatId` (possibly via context from `ChatSessionProvider`) and loads the messages for that chat. The `ChatContainer` component inside decides whether to show a single-model chat or multi-chat UI. In summary, the chat page coordinates pulling in all the pieces: layout (sidebar/header), messages context for that chat, and the Chat component which contains the conversation view and input box.

* **API Routes (`app/api/*`):** Each API route corresponds to a file. We’ll detail key ones:

  * **`api/chat/route.ts`:** This is the heart of the application’s backend. It handles incoming chat completion requests. When the client calls this endpoint (via the `useChat` hook or a fetch), it expects a streaming response. The code flow is roughly:

    1. Parse the JSON body which contains `{ messages, chatId, userId, model, isAuthenticated, systemPrompt, enableSearch, message_group_id }`. Here, `messages` is the conversation history (an array of message objects with roles "user"/"assistant"), and `message_group_id` is an optional identifier if this user message is part of a group (for multi-part interactions, rarely used).
    2. Basic validation: if required fields are missing, return 400.
    3. Call `validateAndTrackUsage({ userId, model, isAuthenticated })`. This function (defined in `api/chat/api.ts`) checks if the user is allowed to query the model and updates usage counters:

       * It verifies the user’s identity via `validateUserIdentity`. This ensures the `userId` matches the session (or is a valid anon user). If Supabase is disabled, it returns `null` meaning no server tracking.
       * It then enforces model access rules: if the user is not authenticated and the model is not in an allowed set for guests, it throws an error telling them to log in. If the user is authenticated and the model requires an API key that the user hasn’t provided (and it’s not a free model), it also throws an error instructing them to add their key. These errors propagate back to the client (likely causing an error toast with the message).
       * Next, it calls `checkUsageByModel(supabase, userId, model, isAuthenticated)`. This function in `lib/usage.ts` will check the daily message limits. It distinguishes between “pro” models and normal models. If the model is considered “pro” (not in the FREE\_MODELS list), then it requires login and checks `daily_pro_message_count` (maybe a stricter limit). Otherwise, it checks `daily_message_count` for the user and ensures it’s under the limit (which is higher for authenticated users than for anonymous users). If the user exceeded the limit, `checkUsageByModel` throws a `UsageLimitError` with a message like “Daily message limit reached.”. Zola’s error handling will catch this and return a structured JSON error with code `DAILY_LIMIT_REACHED` (and the client will prompt accordingly, possibly opening a login dialog if the limit is zero for guests).
       * If all checks pass, `validateAndTrackUsage` returns a Supabase client instance (or `null` if none). A non-null return means usage is being tracked and DB operations can be done.
    4. If a Supabase client was returned, Zola immediately increments the user’s message count in the background by calling `incrementMessageCount` (which wraps `incrementUsage` to update the overall and daily counts). This effectively counts this request towards their quota.
    5. It then logs the user’s message to the database if possible: if Supabase is available and the last message in `messages` is a user message, it inserts that into the `messages` table via `logUserMessage`. The `logUserMessage` function sanitizes the content (to strip any malicious input) and stores the text along with any attachments the user had, the model used, etc..
    6. The server loads the model configuration via `getAllModels()` (which likely returns an array of ModelConfig objects, possibly from a combination of static definitions and dynamic discovery). It finds the entry matching the requested `model` ID. If not found or if it lacks an `apiSdk`, it errors out.
    7. It determines the **system prompt** to use: either the user-specified system prompt for this chat (stored in the chats table or passed from client) or a default. `SYSTEM_PROMPT_DEFAULT` is a constant (likely a general instruction like “You are an AI assistant…”).
    8. It retrieves an API key for the model if needed. For *authenticated* users, it tries to fetch their saved key: it calls `getProviderForModel(model)` to map the model to a provider name (like "openai", "anthropic", etc.), then calls `getEffectiveApiKey(userId, provider)`. `getEffectiveApiKey` (in `user-keys.ts`) will return the user’s own key for that provider if they have saved one, otherwise it falls back to the server’s global key from the environment. For anonymous users, `isAuthenticated` is false so this step is skipped (the server will use its global API keys for guests).
    9. **Calling the AI model:** The route then constructs the model client and calls the AI SDK to stream a response. It does:

       ```ts
       const result = streamText({
         model: modelConfig.apiSdk(apiKey, { enableSearch }),
         system: effectiveSystemPrompt,
         messages: messages,
         tools: {} as ToolSet,
         maxSteps: 10,
         onError: (err) => { ... },
         onFinish: async ({ response }) => { ... }
       });
       return result.toDataStreamResponse({ sendReasoning: true, sendSources: true, getErrorMessage });
       ```


Some notes on this:
\- `modelConfig.apiSdk(apiKey, { enableSearch })` creates the model integration. If `enableSearch` was true (perhaps the user toggled a “web search” option), this might enable an integrated web search tool for certain providers (Perplexity or others) – part of prompt-kit’s features. If false, the assistant will not use any web search even if it had the capability.
\- The `onFinish` callback: When the streaming completes, the `response` object contains the full conversation (including assistant’s final messages). Zola then calls `storeAssistantMessage` to save the assistant’s answer in the database. `storeAssistantMessage` will extract the final answer (with all its structured parts like text and any tool usage) and insert it into the `messages` table as one entry. This means every complete assistant reply becomes one row in the DB (even if it was streamed in chunks).
\- Error handling: If the model stream errors out (e.g. API error), the `onError` logs it. The final `toDataStreamResponse` call wraps the stream into an HTTP response and specifies `getErrorMessage` to format any error into a user-friendly message. The options `sendReasoning: true, sendSources: true` indicate the stream may include special message types for reasoning steps or source citations which the client can render (Zola likely uses these for advanced features or simply ignores them if not needed).
\- The function as a whole returns this streamed response, so the client will start receiving SSE events immediately.
10\. If any exception is thrown in the try block (e.g. from usage checks or during the model call), the catch will format it via `createErrorResponse` and return a JSON error with an HTTP error status. For example, a known `UsageLimitError` with code `DAILY_LIMIT_REACHED` will produce a 403 with an error code, which the frontend can detect (the code uses this to potentially prompt the user to sign in or just display the error).

In summary, the `/api/chat` route orchestrates input validation, permission/limit checks, logging of conversation, and interaction with the AI model. It’s one of the more complex parts of the codebase given it ties together Supabase and the AI SDK.

* **`api/create-chat/route.ts`:** This endpoint is called when a new conversation needs to be created (for example, when the user clicks “New Chat” or when the first message of a session is sent with no chatId). It simply parses `{ userId, title, model, isAuthenticated, projectId }` from the request and calls `createChatInDb` to insert a row in the `chats` table. The helper `createChatInDb` (in `api/create-chat/api.ts`) uses `validateUserIdentity` to get a Supabase client similarly to the chat route. If Supabase is disabled (i.e. running in a mode without DB), it falls back to returning a chat object with a random UUID (so that the app can still function offline or without persistence). If Supabase is present, it also calls `checkUsageByModel` to ensure the user is allowed to start a chat with the given model (e.g. if the model is a pro model and user isn’t auth, it will throw). Then it inserts a new row into `chats` (with user\_id, title, model, etc.) and returns the created chat record. The route sends back the chat data (or an error). The frontend, upon receiving the new chat, will update the chat list state and navigate to the new chat’s URL (done in `ensureChatExists` function). If the route returns an error (e.g. daily limit hit), `ensureChatExists` catches it and shows a toast with the error message.

* **`api/create-guest/route.ts`:** This route is used to create a new **guest user record** in the database. It accepts a `userId` (which is intended to be a Supabase Auth user’s UUID who is anonymous). On request:

  * It uses `createGuestServerClient()` to get a Supabase client with the service role key. This allows it to write to the DB without an auth token (guests have no privileges to write directly). If Supabase isn’t enabled, it logs and simply returns a dummy user object with `anonymous: true` for that ID (meaning in a no-database scenario, it won’t fail).
  * It then checks if a `users` table entry already exists for that ID (maybe the user hit this endpoint twice). If not, it inserts a new user row with that ID, a fake email like `{id}@anonymous.example`, `anonymous: true`, and some default fields like `message_count = 0`.
  * It returns the user record (either existing or newly created). This is done when a new anonymous Supabase auth user is created on the client. Essentially, the flow is: client calls `getOrCreateGuestUserId()`, which if no user exists, uses Supabase JS to `signInAnonymously()` (creating a new `auth.users` entry and logging the user in) and then calls this `/api/create-guest` route to ensure a profile row in the `users` table. The server side uses the service role for this insertion since the user’s own anon token would not have permission to insert into `users`.
  * This division ensures that every Supabase auth anonymous user has a corresponding entry in Zola’s `users` table with usage counters and settings. The route responds with `{ user: userData }` on success or an error JSON on failure.
  * Notably, if Supabase isn’t configured (e.g. user runs Zola without a database), the route just returns `{ user: { id: userId, anonymous: true }}` with status 200, effectively making the front-end treat the given ID as a valid guest. The rest of the app will then function in-memory only.

* **`api/update-chat-model/route.ts`:** This endpoint likely updates the model for an existing chat. The client calls it when the user switches the model from a dropdown in the UI. It probably expects `{ chatId, model }` in the request body. The implementation would find the chat in the DB (and ensure the user has rights to it via Supabase policies automatically) and update the `model` field in that row. In the code, the front-end doesn’t call Supabase directly for this update but uses this API route via `fetchClient(API_ROUTE_UPDATE_CHAT_MODEL, {...})`. The server route then performs the update and possibly returns the updated chat or a success message. If it fails (e.g. not authorized or invalid model), it returns an error. The client on success will update its local chat list state with the new model (which it already does optimistically).

  * The use of a route for this is possibly to apply **usage restrictions**: switching to a “pro” model might require login. On the server, they could enforce that via `validateUserIdentity` and `checkUsageByModel` again. The `updateChatModel` function on the front-end already calls the API and handles errors (showing a toast if failed).
  * Additionally, if a conversation is public (shared) or has ongoing context, switching model might have other implications; handling it on the server centralizes any needed logic (like stopping ongoing generation, but that likely is handled client-side by stopping the stream).

* **`api/models/route.ts`:** This GET route returns the list of all model configurations for the UI. In `ModelProvider`, `fetchModels()` calls it and stores `models` state. On the server, `GET /api/models` would compile a JSON array of models including fields like `id`, `name`, `description`, `provider`, and maybe tags (like `local`, `open-source`, etc.). Likely:

  * It loads a static list of known models (OpenAI GPT-3.5, GPT-4, Anthropic Claude v1/v2, Mistral 7B, etc.) – possibly defined in a JSON or TS file.
  * It then checks for local models via Ollama: possibly by making a request to `OLLAMA_BASE_URL/api/models` or similar to list installed models. If found, it adds them to the list with appropriate metadata (for example, categorize them by family and mark `provider = "ollama"`).
  * The model objects probably contain an `apiSdk` function or provider info, but the server might not send that function to the client (since it’s not serializable). Instead, it may send only descriptive info and some flags (like if it requires BYOK). The client doesn’t need the `apiSdk`; that’s used server-side.
  * The response might look like: `{ models: [ {id: "openai/gpt-4", name: "OpenAI GPT-4", provider: "openai", byokRequired: false, pro: true}, {...}, {id: "ollama/llama2-7b", name: "LLaMA2 7B (local)", provider: "ollama", local: true}, ... ] }`.
  * When the client gets this, it populates the model selection dropdown. The `ModelProvider` also immediately calls `user-key-status` and `favorite-models` endpoints to get user-specific info.

* **`api/user-key-status/route.ts`:** Returns which API providers the current user has provided a key for. The client uses this to mark in the UI if e.g. the user has set their OpenAI key, etc. The route likely checks the `user_keys` table for the current user and returns an object with booleans per provider. Indeed, `ModelProvider` initializes `userKeyStatus` with false for each and sets it based on this call. The response might be `{ openai: true/false, anthropic: false, ... }` indicating presence of an entry in `user_keys`. This helps the UI to, for example, show a warning icon next to models that require a key if the user hasn’t added one, or to pre-fill any toggles.

* **`api/user-preferences/favorite-models/route.ts`:** Likely returns the list of model IDs that the user marked as favorite. In the DB schema, `users.favorite_models` is a text array column. The UI might highlight or filter models based on favorites. The route probably does `SELECT favorite_models FROM users WHERE id = auth.uid()` and returns `{ favorite_models: [...] }`. The `ModelProvider` uses this to set the `favoriteModels` state on load.

* **`api/rate-limits/route.ts`:** The frontend calls this via `checkRateLimits(userId, isAuthenticated)` (see `lib/api.ts`) before sending a message, in order to implement a **client-side usage check**. This is interesting because the server already checks usage on each request (in `validateAndTrackUsage`). However, the client-side check is used to warn the user proactively. The function `checkLimitsAndNotify` waits for `checkRateLimits` API response:

  * Likely the route `GET /api/rate-limits?userId=...&isAuthenticated=...` uses the same logic as `checkUsageByModel` but general. Perhaps it returns something like `{ remaining: X, limit: Y, remainingPro: A, limitPro: B }`.
  * Zola’s `checkLimitsAndNotify` then uses this to decide if the user is out of free queries. If `remaining === 0` for a guest, it sets `setHasDialogAuth(true)` which triggers showing the login dialog (i.e., “you ran out of free messages, please sign up to continue”). It also checks if remaining equals a certain threshold (defined by `REMAINING_QUERY_ALERT_THRESHOLD`, maybe 5) and if so, shows a toast: e.g. “Only 5 queries remaining today.”. Similarly for `remainingPro` (for pro-tier model usage).
  * This is a nice UX feature: it warns users as they approach limits and stops guests from silently hitting a wall – instead it can immediately prompt them to sign in when free limit is exhausted.
  * The server route for rate-limits probably calls `checkUsage` and `checkProUsage` from `lib/usage.ts` for the user without incrementing, just to fetch current counts and compute remaining. The returned `remaining` might be `dailyLimit - dailyCount` from `checkUsage`, and similarly `remainingPro`. The implementation might not be explicitly in the text we have, but logically follows from the usage module.

* **Other API routes:** There might be other minor routes not detailed, e.g., `api/user-keys` to add a new API key (if implemented via a custom route; or the app might use Supabase directly for that). We see no direct mention, but possibly adding a key is done through Supabase JS from the client (using RPC or direct insert with service role). Also a route for feedback (`/api/feedback`) could exist since there’s a feedback table. The codebase references a FeedbackWidget component and a feedback table in the schema, implying users can send feedback. If implemented, an API route would insert a feedback entry.

### Frontend Components

Zola’s UI is composed of many React components, organized by feature. We will highlight core components and how they work together:

* **Layout and Navigation Components:**

  * **`LayoutApp` (`components/layout/layout-app.tsx`):** This component is the main app chrome, used inside the page to wrap the chat and sidebar. It is a client component controlling the **sidebar layout**. It uses the user’s layout preference (from context) to decide whether to render the sidebar or not. It likely always renders the top navigation (Header) and conditionally renders the `<AppSidebar>` on larger screens or if the user has chosen the “sidebar” layout. The children passed to LayoutApp will be the chat content. In code, if `hasSidebar` is true (meaning the user’s layout preference is “sidebar” view vs. “fullscreen”), it includes `<AppSidebar />` before the children. If false, it might still include a Header (though the snippet suggests it imported Header but didn’t show it being rendered—possibly an omission in the snippet). We can assume the `Header` is a top bar with maybe the app name/logo and some actions (like a link to GitHub, or user menu for login/logout).
  * **`Header` (`components/layout/header.tsx`):** Not explicitly shown in the text, but by convention, this would contain the app title “Zola”, maybe a theme toggle, and user profile controls (login button or avatar dropdown if logged in). It might also contain a “New Chat” button on small screens where the sidebar is hidden.
  * **`AppSidebar` (`components/layout/sidebar/app-sidebar.tsx`):** This is the side panel listing all chats and some controls. It’s a client component that uses various hooks:

    * `useChats()` to get the list of chats and loading state.
    * `useSidebar()` perhaps from a Sidebar context to control mobile sidebar state (like showing/hiding it).
    * It gets the current route params via `useParams<{ chatId: string }>()` to know which chat is currently active. It stores `currentChatId` to highlight the active chat in the list.
    * It groups chats by date for display (calls `groupChatsByDate(chats)` which likely returns an array of chat groups labeled by day).
    * The JSX (sketched from snippet):

      * A **SidebarHeader** with controls: If on mobile, it likely shows a close “X” button (which calls `setOpenMobile(false)` to hide the sidebar). Possibly, it also shows the app name or icon.
      * A button for **“New Chat”**: The code shows a router.push("/") call in onClick. On desktop, clicking “New Chat” might actually create a chat immediately (perhaps the act of going to `/` triggers ensureChatExists to create a new one). On mobile, maybe it closes the sidebar and starts a new chat. The keyboard shortcut is shown (Cmd+Shift+U) next to it.
      * A **Search** input or button: The snippet includes a `HistoryTrigger` and a search icon with shortcut Cmd+K. This implies there’s a command palette or search for chat history feature (possibly WIP or part of the “History” view). The HistoryTrigger could toggle an overlay showing all past chats or allow searching within chats.
      * **Chat List:** If `isLoading`, it might show a skeleton. If there are chats (`hasChats`), it maps through `groupedChats` and for each date group, renders a heading (date) and then a list of chat items. Each chat item likely is a clickable entry (maybe a `SidebarList` component) showing the chat title and maybe a preview. In snippet we see `SidebarList` and `SidebarProject` components:

        * `SidebarList` might render the list of chats for a date group.
        * `SidebarProject` might relate to project grouping (Zola has a `projects` table, meaning it can group chats into user-defined projects). Possibly the sidebar can show project sections with chats inside. If so, `SidebarProject` might handle rendering a collapsible section per project.
        * For each chat, when clicked, it navigates to `/c/[id]` by pushing a route (the code uses `router.push("/c/..."` somewhere).
        * The active chat might be highlighted (the component likely checks `currentChatId` to style the active one).
      * If `hasChats` is false (no conversations yet), it shows a placeholder: “No chats yet – Start a new conversation” message in the sidebar.
      * The **SidebarFooter** likely contains the app info or external links. In snippet, after the list, there’s a link encouraging to star the repo on GitHub. It likely also could show the current user’s name and a logout button or similar at the bottom.

    The sidebar is thus responsible for chat navigation and starting new chats. It listens to the Chats context; any time a chat is added or removed, it re-renders the list. It also toggles itself off on mobile when a chat is selected (to provide full screen for conversation).

* **Chat Components:**

  * **`ChatContainer` (`components/chat/chat-container.tsx`):** A simple wrapper that decides between single-model chat and multi-model chat. It reads the user preference `multiModelEnabled` from context. If multi-model is enabled, it renders a `<MultiChat>` component (which might allow side-by-side or simultaneous multi-agent conversation). If not, it renders the standard `<Chat>` component (single chat interface). This gives the option to introduce a UI where multiple models can respond in parallel or be compared (a feature on the roadmap, possibly using prompt-kit’s multi-chat block). The default is single model chat.

  * **`Chat` (`components/chat/chat.tsx`):** This is the primary component for a chat session UI. It is a client component that ties together the state contexts and the interactive subcomponents. Key parts of `Chat`:

    * It accesses the current `chatId` from `useChatSession()` context.

    * It gets chat operations from `useChats()`, specifically functions like `createNewChat`, `getChatById`, `updateChatModel`, `bumpChat`, and loading state. `currentChat` is derived using `getChatById(chatId)` – that gives the metadata of the active chat (title, model, etc.).

    * It gets `initialMessages` and `cacheAndAddMessage` from `useMessages()` context. `initialMessages` are the messages already loaded for this chat (from cache/DB), which will be passed to the chat hook as the starting point.

    * It gets the current user from `useUser()` (to know user ID, and any user-level info like whether they are authenticated, or their default system prompt).

    * It gets user preferences via `useUserPreferences()` (to check if prompt suggestions are enabled, etc.).

    * It uses a custom hook `useChatDraft(chatId)` to manage the draft input text (so that if you navigate away, the draft might persist).

    * It uses `useFileUpload()` to handle file attachments the user adds. This hook returns `files` state and handlers to upload or remove files, and to prepare optimistic attachment metadata for messages. If a user attaches files, `files` array holds them; `createOptimisticAttachments` generates objects with file name and a temporary URL to show in the message while upload is pending; `handleFileUploads` will actually upload files to Supabase Storage (likely returning an array of final attachment objects with permanent URLs).

    * It uses a `useModel()` hook to handle model selection. This likely provides `selectedModel` (the currently chosen model for this chat) and `handleModelChange` (function to switch model). It may use `currentChat.model` as initial, and sync changes by calling `updateChatModel` (which hits the API route to update DB and context).

    * It manages some local component state: `hasDialogAuth` (a boolean whether to show the login prompt dialog) and a setter for it. This will be set to true when the app wants to prompt the user to authenticate (for example, if they hit the guest message limit and need to log in).

    * It computes `isAuthenticated` as `!!user?.id` – note: for an anonymous guest, user.id exists but they might treat `anonymous: true` separately. In this context, `isAuthenticated` might simply mean “has a user session” (guest counts as a session too), but Zola often uses `isAuthenticated` to specifically distinguish a logged-in (non-anonymous) user. Here, since they derive it from existence of `user.id`, an anonymous user (who has an id from Supabase anon) will count as true. However, they often pair `isAuthenticated` with checking `user.anonymous` elsewhere. Possibly a slight inconsistency, but logic in operations hooks uses the `isAuthenticated` passed down from higher context (which likely sets it false for anonymous). We can assume for enabling certain features like pro models, a user with `anonymous: true` is considered not authenticated in that sense.

    * It builds the `systemPrompt` to use: if the user profile has a custom system prompt (users table has a `system_prompt` column), it will use that; otherwise the default. This `systemPrompt` is passed to the chat API so that each conversation can have a user-defined system instruction (some users may customize the assistant’s personality here).

    * Next, it initializes the **Chat Hooks**:

      * **`useChatOperations`**: called with parameters `{ isAuthenticated, chatId, messages: initialMessages, selectedModel, systemPrompt, createNewChat, setHasDialogAuth, setMessages: () => {}, setInput: () => {} }`. This returns utility functions:

        * `checkLimitsAndNotify` – a function to check usage limits & possibly trigger a login dialog or warning toasts.
        * `ensureChatExists` – ensures a chat session exists, possibly creating a new chat if none (as described).
        * `handleDelete` – to delete a message from the messages list (used when user deletes a message, not heavily highlighted).
        * `handleEdit` – to edit an existing message’s content in place (for example, if the user can correct a typo and regenerate).
        * We pass dummy `setMessages` and `setInput` here since at this point we haven't initialized the actual chat hook that holds messages. The reason is that `useChatOperations` doesn’t directly manipulate the `useChat` state; it’s more concerned with the above utilities which are independent. (It only uses `setMessages` in handleDelete/edit to update the local messages state, but initially we give it placeholders and later we might replace them if needed. Alternatively, `useChatOperations` might not need to set messages at this stage.)
      * **`useChatCore`**: This is the custom hook that wraps `useChat` from the AI SDK and ties everything together. It’s invoked with a large object of dependencies: `{ initialMessages, draftValue, cacheAndAddMessage, chatId, user, files, createOptimisticAttachments, setFiles, checkLimitsAndNotify, cleanupOptimisticAttachments, ensureChatExists, handleFileUploads, selectedModel, clearDraft, bumpChat }`. The result from `useChatCore` includes:

        * The `messages` state (this is the live messages including new ones as they stream in),
        * `input` state (the controlled input field value),
        * `status` (idle, streaming, etc.), `isSubmitting` (a boolean for form submission state),
        * Controls like `stop` (to cancel a streaming response),
        * and handler functions: `submit` (to send a new message), `handleSuggestion` (if prompt suggestions are enabled, send a suggestion quick-start), `handleReload` (to regenerate last answer), `handleInputChange` (for typing into the input box), etc. It also provides a `hasSentFirstMessageRef` which tracks if at least one message was sent in this session (used to avoid redirecting away prematurely).
        * The internals of `useChatCore` are important:

          * It calls `useChat` from the Vercel SDK to create a chat state. We see in code that it passes `onFinish: cacheAndAddMessage` to `useChat`. This means whenever the SDK finishes receiving a full assistant message, it will call `cacheAndAddMessage` (which writes that message to the MessagesContext and local cache). Also `onError: handleError` is passed to show error toasts.
          * It receives from `useChat` the functions `handleSubmit`, `append`, `reload`, etc.. These are used to control the stream.
          * The `submit` function in `useChatCore` is custom: it orchestrates what happens when the user hits send. It:

            * Sets `isSubmitting` to true (to disable input UI).
            * Determines a `uid` (user ID) to use. It calls `getOrCreateGuestUserId(user)`. This function will return the user’s own ID if they are logged in; if the user is an anonymous guest, it will attempt to ensure a Supabase anon user exists. Under the hood: if `user.id` exists and `user.anonymous` is false, returns it; if `user.id` exists and is anonymous, it checks localStorage if it already created a profile (flag `guestProfileAttempted_{id}`) – if not, it calls `createGuestUser` API to create the DB entry. If no anon user exists yet (i.e. `user` is null), it triggers `supabase.auth.signInAnonymously()` to create one and then calls `createGuestUser`. If any of these fail, it returns null, which would abort sending.
            * It creates an *optimistic user message* object with a temporary ID (like `"optimistic-<timestamp>"`), the `content` set to the current `input` text, role = "user", current timestamp. If there are files attached, it also creates `optimisticAttachments` for the message (using `createOptimisticAttachments`).
            * It immediately updates the local chat state: `setMessages(prev => [...prev, optimisticMessage])` to show the user message in the UI. It then clears the input field (`setInput("")`) and moves any files out of the attachment list (since they’re “attached” now).
            * It then performs pre-send checks:

              1. Calls `const allowed = await checkLimitsAndNotify(uid)`. If this returns false, it means the user hit a limit (the function already showed a login dialog or warning). In that case, it removes the optimistic message from the state (filtering it out by ID) and cleans up attachments (since we won’t actually send it). Then it aborts.
              2. Calls `const currentChatId = await ensureChatExists(uid, input)`. This ensures we have a `chatId`. If the user had no chat, this will create one (and if user is logged in, update the URL via pushState; if guest, store in localStorage). It returns the `chatId` to use for this message. If it returns null (something went wrong, e.g. DB error or user not allowed to create chat), then the optimistic message is removed and attachments cleaned up, and it aborts.
              3. It checks the input length vs. `MESSAGE_MAX_LENGTH` (likely a constant, perhaps 16k tokens or something). If too long, it shows an error toast telling the user to shorten their message, removes the optimistic message, and aborts.
            * Next, it handles file attachments if any were present. It calls `attachments = await handleFileUploads(uid, currentChatId)`. This will upload files to storage and return an array of attachment objects (with URLs) or return `null` on failure. If `attachments === null` (upload failed or was canceled), it removes the optimistic message and aborts.
            * If all checks passed, we now have `currentChatId` (ensured session), and possibly an `attachments` array. It constructs the payload for the AI request: `options = { body: { chatId: currentChatId, userId: uid, model: selectedModel, isAuthenticated, systemPrompt }, experimental_attachments: attachments || undefined }`. Here, `options.body` is what the API expects (all strings), and if attachments exist, they are passed under a key like `experimental_attachments`.
            * Finally, it calls `handleSubmit(undefined, options)`. This invokes the Vercel SDK’s `useChat` submission logic: it will send the POST to `/api/chat` with those options. (The first argument could be a specific prompt to override, but `undefined` means use the hook’s current `input` which we already cleared, so effectively it sends what’s in options only). The `handleSubmit` triggers the streaming response from the server.
            * Immediately after calling `handleSubmit`, Zola cleans up the optimistic echo: it removes the optimistic message from the hook’s `messages` state (since the SDK will append a user message anyway once the request starts, to avoid duplication). It also calls `cleanupOptimisticAttachments` to revoke any object URLs for files used in the optimistic message, since the real attachments (with final URLs) will come in the assistant’s response or elsewhere.
            * It then calls `cacheAndAddMessage(optimisticMessage)` to add that user message to the persistent MessagesContext and indexDB cache. This ensures the user’s message is saved to DB (note: actually, `cacheAndAddMessage` in MessagesContext only writes to IndexedDB and memory; however, earlier in `/api/chat`, the server already inserted the user message in the database via `logUserMessage`. But that happened slightly earlier in time. This double-write is a bit redundant but ensures local state is consistent).
            * It calls `clearDraft()` to clear the saved draft for this chat (since the message was sent).
            * If there were already messages in this chat (meaning not the first ever message), it calls `bumpChat(currentChatId)` to update the chat’s `updated_at` timestamp in the context and reorder the chat in the sidebar list to the top. If it’s the first message of a new chat, `messages.length > 0` would be false initially, so it might skip bumping (or maybe `messages` included the optimistic one so length was 1; this logic might be to avoid bumping if you haven't actually received a reply yet).
            * Wrap up: if any error was caught in this whole process, it removes the optimistic message and shows a toast “Failed to send message”. In `finally`, it sets `isSubmitting` back to false.
          * The `handleSuggestion` function in `useChatCore` does a similar thing for when the user clicks on a suggested prompt (if the app offers example prompts when the chat is empty). It creates an optimistic message for the suggestion and goes through checks, but instead of calling `handleSubmit`, it directly uses the `append` function from `useChat` to append the user message and start the request (since suggestions likely don’t involve attachments or multi-step checks beyond usage).
          * The `handleReload` function is for the “Regenerate response” action. It gets the `uid` (guest or user) and simply calls `reload(options)` which triggers the last user message to be sent again to the model. It passes along necessary body options (chatId, userId, model, etc.) similar to submit. This leverages the AI SDK’s ability to replay the last prompt and get a new answer.
          * `handleInputChange` is a wrapper that updates both the `useChat` hook’s input state and the draft in local storage via `setDraftValue`. This ensures when the user types, we remember it even if they navigate away or refresh (so drafts are not lost).
          * The `useChatCore` returns all these methods and state values to the Chat component.

    * After obtaining all these from `useChatCore`, the `Chat` component prepares props for the subcomponents:

      * **Conversation messages (`<Conversation />` component):** It memoizes an object with `{ messages, status, onDelete: handleDelete, onEdit: handleEdit, onReload: handleReload }` and passes that to `<Conversation {...conversationProps} />`. The `Conversation` component likely renders the list of messages (iterating over `messages`). Each message could be displayed via a Message component that handles different roles (user vs assistant vs system) and content (text vs code vs images). It also enables editing and deleting if those handlers are provided (for user messages, maybe you can long-press to edit, etc.). The `status` might be used to show a spinner or a “generating...” indicator on the latest assistant message if streaming.
      * **Chat input (`<ChatInput />` component):** It similarly memoizes `{ value: input, onSuggestion: handleSuggestion, onValueChange: handleInputChange, onSend: submit, isSubmitting, files, onFileUpload: handleFileUpload, onFileRemove: handleFileRemove, hasSuggestions: (preferences.promptSuggestions && !chatId && messages.length === 0), onSelectModel: handleModelChange, selectedModel, isUserAuthenticated: isAuthenticated, stop, status, setEnableSearch, enableSearch }` and passes these as props to `<ChatInput {...chatInputProps} />`. This is a large prop list:

        * `value` is the current input text.
        * `onValueChange` updates the input (bound to text input field).
        * `onSend` triggers the submit (bound to send button or Enter key).
        * `isSubmitting` disables the input while a request is in flight.
        * `files` is the list of files attached; `onFileUpload` and `onFileRemove` come from useFileUpload to manage attachment addition/removal.
        * `hasSuggestions` determines if the input should show suggestion chips or placeholder – true when no chat is loaded (new session) and user has prompt suggestions enabled.
        * `onSuggestion` is called when a suggestion is clicked, which uses handleSuggestion.
        * `onSelectModel` is for when the model selector is changed in the input area – it calls handleModelChange which updates context and triggers API route to update the chat’s model.
        * `selectedModel` is the currently active model ID (to show in a dropdown or label).
        * `isUserAuthenticated` helps the input UI decide if it should, for example, disable certain models or show a “login to use this model” prompt. (Zola might visually indicate models that require login).
        * `stop` is a function to cancel an ongoing generation (wired to a Stop button in the UI if an answer is streaming). It comes directly from `useChat` which manages the stream cancellation.
        * `status` indicates if an AI response is currently streaming (“streaming” status), which the input can use to perhaps show a “Stop” button or change the send button to a stop icon.
        * `setEnableSearch` and `enableSearch` are related to a feature where the user can allow the AI to do web searches. Zola provides a toggle in the UI (maybe a “Search the web” toggle for the query). These control a boolean that is passed to the backend (that `enableSearch` we saw goes into the model’s options and is used by some providers that can perform web searches). So the input UI includes a switch to set `enableSearch` in state, which is then sent with the next request.

      The Chat component also handles the **login dialog** if `hasDialogAuth` is true. In the JSX (not fully shown above, but indicated by `DialogAuth` component imported dynamically), it will render `<DialogAuth />` when `hasDialogAuth` state is true. `DialogAuth` likely shows a modal saying “Sign in to continue” with a Google login button. Since it’s dynamically imported with `ssr: false`, it only loads on the client when needed (saving bundle size).

      It also possibly handles showing an onboarding message. The code sets `showOnboarding = !chatId && messages.length === 0`. If true, it renders a simple placeholder (like a heading “What’s on your mind?”) instead of the conversation and input UI. This occurs when there is no active chat session and no messages – essentially the very first time a user (especially a guest) visits. This welcome prompt invites them to start chatting. Once they send a message, a chatId is created and the normal UI appears.

Overall, the Chat component brings together contexts and hooks to create a rich chat interface with streaming, model switching, file attachments, and usage limit handling. The separation into `useChatOperations` and `useChatCore` helps keep concerns separated (UI vs. side-effects).

* **`Conversation` Component:** This would render the list of messages (user and assistant messages). It likely uses the message role to align left/right or apply different styling. For assistant messages, it would render markdown content – using a Markdown renderer (with code highlighting and handling of special content like tool outputs). If the assistant is currently streaming (status “streaming”), it might show a typing indicator or partial content. The conversation also might allow selecting text for copy, and the user’s last message could have a “edit” or “delete” button (enabled via the handlers provided). Given `handleEdit` and `handleDelete` are passed, the UI for user messages might include an edit icon or delete icon on hover. If a user edits a message (maybe triggers a re-generation), Zola would likely clear subsequent assistant messages and reuse the API call. (The specifics of edit flow are not deeply detailed in our analysis, but hooks are prepared for it.)

* **`ChatInput` Component:** Responsible for the bottom input area. It contains:

  * A text textarea for the prompt (bound to `value` and `onValueChange`).

  * A send button (disabled when `isSubmitting` or if input is empty).

  * Possibly a file upload button (to attach files). If `files` array is non-empty, it might show a list of file names attached, each with a remove button (triggering `onFileRemove`).

  * Possibly a dropdown to select the model. Since Zola supports multi-model, the input area might have a model selector. The `selectedModel` and `onSelectModel` props indicate this. It likely renders the current model’s name and on click shows a list of available models (the `models` from ModelContext). If the user picks a new model:

    * If they are guest and the model requires login, maybe `onSelectModel` will still attempt to switch but the backend will throw an error (“You must log in to use this model.”) which then sets `hasDialogAuth` true and thus shows the login prompt.
    * Or the UI itself could pre-empt this: the `userKeyStatus` and model info might tell the component to show a lock icon next to models that need login, and if clicked, maybe directly prompt login or call `setHasDialogAuth(true)`.
    * But the current implementation defers to the backend for enforcement – so likely the UI just allows selection, and if it fails, a toast appears.

  * A toggle or button for enabling “Search”. The presence of `enableSearch` and `setEnableSearch` suggests the input UI includes a toggle (maybe an icon like a globe or magnifying glass) to allow the AI to do web searches (via integrated search agents). If turned on, `enableSearch` true will be sent along with the query. This likely only affects certain model providers (for example, if `selectedModel` is a provider that can handle web search when enabled, like Perplexity AI). If the model doesn’t support it, the flag might be ignored by the backend. The UI could also hide this toggle for models that can’t use it.

  * If `hasSuggestions` is true (meaning this is a fresh chat and suggestions are enabled), the ChatInput might render some preset prompt suggestions or example questions above the input. The `onSuggestion` handler will be used if the user clicks one. Possibly these suggestions come from a static list or from prompt-kit (prompt-kit might allow defining example prompts to show).

  * Additionally, if a response is streaming, the input might show a **“Stop Generating”** button. The props provide `status` and `stop`. If `status === "streaming"`, ChatInput could replace the send button with a stop button, calling `stop()` to abort the request. This would signal the backend to cancel (Vercel AI SDK’s streaming can be cancelled by aborting the request; `stop()` likely aborts the fetch/stream).

* **Providers and Contexts:** We have largely covered their logic above, but to summarize:

  * **UserProvider**: wraps the app to provide `user` object and methods to update it. It takes an `initialUser` (populated on server via `getUserProfile`). Inside, it manages `user` state and provides `updateUser` (calls Supabase to update profile fields like display\_name or system\_prompt), `signOut` (calls Supabase signOut and clears user), and subscribes to changes in the `users` table via Supabase’s real-time if the user is logged in (so if profile or usage counts update on server, it can update context). The `initialUser` comes from SSR – specifically, `layout.tsx` does `const userProfile = await getUserProfile()` and passes it to <UserProvider initialUser={userProfile}>. `getUserProfile` will have returned null if no logged-in user (or if it’s an anonymous user and they decided not to treat that as profile). If Supabase is disabled, `getUserProfile` returns a dummy Guest profile so that the app still has a user context (with id "guest"). This design allows the UI to not worry much – it always has a `user` object, either a real user, an anon user, or a placeholder "guest".

  * **UserPreferencesProvider**: likely similar, it might fetch the user’s preferences from Supabase (like layout mode, whether multi-model chat is enabled, whether to show prompt suggestions, etc.). The `user_preferences` table exists with columns such as `layout` (e.g. "sidebar" or "fullscreen"), `prompt_suggestions` (boolean), `show_tool_invocations`, etc.. These preferences are loaded (maybe via the `userProfileData.user_preferences` when user profile is fetched). `convertFromApiFormat` is called to translate DB format to a simpler context object. The provider then allows toggling these preferences in the UI (for instance, the user could toggle multiModelEnabled, which would update context and possibly call an API to update the DB).

    * We know multiModelEnabled is one preference (it’s read in ChatContainer). There is likely a settings UI (maybe in the user menu or a separate settings page) where users can choose layout mode or enable multi-model mode (if that feature is experimental).

  * **ChatsProvider**: Manages the list of user’s chats. On mount, it immediately loads chats from cache (IndexedDB) and then fetches fresh from DB, merging results. It provides functions to:

    * `createNewChat(userId, title?, model?, isAuth?, systemPrompt?)`: This calls the API `/api/create-chat` and updates the context state. It also does an optimistic update: it creates a temporary chat object (`optimisticChat` with a fake id "optimistic-...") and prepends it to the list so the UI feels responsive. Then it calls the API; if it returns a new chat record, it replaces the optimistic entry with the real one (patching in the real UUID). If it fails, it reverts the list and shows a toast error. This method is called by `ensureChatExists` when sending the first message, and by the UI if user manually hits a "new chat" button.
    * `deleteChat(id, currentChatId?, redirect?)`: Removes a chat. It optimistically filters it out of `chats` state and calls the API (or directly Supabase in `deleteChatFromDb`). If the deletion fails, it restores the list and toasts an error. If the deleted chat was the one currently open, it can call a `redirect()` callback to navigate the UI (likely to home or to another chat). The Chat page might pass a redirect function that navigates to `/` or to the next available chat if the current was deleted.
    * `updateTitle(id, newTitle)`: Optimistically update a chat’s title in state and sort the chats (since updated\_at changes). Then call API to update in DB; on failure, revert and toast. The conversation title can be edited by the user in the UI (maybe clicking the title in the header to rename).
    * `updateChatModel(id, model)`: Optimistically set a chat’s model field in state, call the API `/api/update-chat-model` to persist it, revert on failure with error toast. This is invoked via model selection in the ChatInput (calls handleModelChange → chatsContext.updateChatModel).
    * `bumpChat(id)`: This updates a chat’s `updated_at` timestamp to now in the context and re-sorts chats by recency. It’s used after sending a message to move that chat to top of the list.

    Internally, the ChatsProvider uses helper functions in `chats/api.ts` to talk to Supabase or the API routes. For instance, `fetchAndCacheChats(userId)` hits Supabase (if enabled) to get chats and writes them to IndexedDB for caching. If Supabase is not enabled (or offline), it just returns cached chats. It also has `getCachedChats()` which reads from IndexedDB and sorts by created\_at. All DB writes (create, delete, update) update IndexedDB as well to keep the cache consistent. This ensures a quick load next time.

  * **MessagesProvider**: Manages messages within the current chat. It uses `useChatSession` to know the active `chatId`. It keeps `messages` state and an `isLoading` flag. On `chatId` changes, it triggers data loading:

    * If `chatId` is null (no chat selected), it clears messages and sets loading false.
    * If a valid `chatId` exists, it starts loading: first get cached messages (`getCachedMessages(chatId)`) from IndexedDB, set those messages, then fetch fresh from DB (`getMessagesFromDb(chatId)`). Once fresh messages come in, replace the state and cache them in IndexedDB (`cacheMessages(chatId, fresh)`). It then set `isLoading=false`.
    * It provides functions:

      * `refresh()` to re-fetch from DB (used maybe when user manually refreshes or after an edit).
      * `cacheAndAddMessage(message)`: to append a new message to state and persist it to cache. It does `setMessages(prev => [...prev, message])` and writes updated list to IndexedDB. It’s used by the chat hook on receiving a new message (assistant’s final message triggers onFinish which calls this).
      * `saveAllMessages(newMessages)`: to overwrite the entire message list (for example, after an edit or if the assistant returns multiple parts). It calls a `saveMessages` function which in `messages/api.ts` inserts multiple messages to DB in one go, then sets state to the new list. This might be used if a conversation is being forked or something similar.
      * `deleteMessages()`: to clear all messages of current chat, both state and DB (calls `clearMessagesForChat` which deletes from DB and cache). Possibly used when deleting a conversation or to wipe history.
      * `resetMessages()`: just clears the state (used perhaps when switching chats to quickly remove old ones while new load comes in).

    Internally, `messages/api.ts` takes care of retrieving and storing messages:

    * `getMessagesFromDb(chatId)`: if Supabase disabled, returns cached; if enabled, it queries `messages` table for that chat, ordered by created\_at. It maps the data to the format expected by the UI (the DB may store `id` as integer, it converts to string; combine content parts if needed; parse timestamps).
    * It also has `insertMessageToDb` and `insertMessagesToDb` for adding messages (the latter used by `setMessages`). These wrap Supabase inserts. However, Zola doesn’t call `insertMessageToDb` directly except in `addMessage` which is not used by the context (they use API route for adding messages, not direct from client).
    * `clearMessagesForChat(chatId)`: deletes all messages of a chat from DB (with Supabase) and then clears cache.

    The MessagesProvider thus keeps the live message list in sync with DB and cache. Note that while streaming, the `useChat` hook manages messages internally; the final result or any user messages get mirrored via `cacheAndAddMessage` into this context. If the user refreshes or returns later, MessagesProvider will load all saved messages from DB.

  * **ModelProvider**: This context loads the list of available models and the user’s model preferences (favorites, key presence). On mount, it calls `refreshAll()` which concurrently fetches the models list, userKeyStatus, and favoriteModels. The `models` state is then available for any component that needs to list models (like the model selector dropdown). It likely also provides methods for the user to mark favorites or to refresh the lists (e.g. if the user adds a new API key, it might call `refreshUserKeyStatus` to update which providers are now available). Also, if the user toggles which models to hide, etc., those would update here.

    * The `ModelProvider` might also handle polling or real-time updates if local models change (though that’s less likely; local model changes would require re-fetching from Ollama maybe on demand).
    * With `userKeyStatus`, the UI can disable models for which no key is available. E.g., if the user tries to select Anthropic Claude but `anthropic: false` in key status, the app knows it will fail (because no API key). It might prompt them to add a key or route them to a settings modal.

* **Other UI Components:**

  * **FeedbackWidget**: Possibly a small button or form to send feedback (storing in the feedback table).

  * **DialogAuth**: The modal that appears for login. It presumably has a message like “Sign in to continue using advanced models or to increase your limit.” and a Google sign-in button. When the user clicks sign-in, it calls `signInWithGoogle` (from `lib/api.ts`) which uses Supabase’s OAuth flow. Supabase will handle the redirect to their domain and back to `/auth/callback`. The `auth/callback` route in Next.js should exist to finalize login:

    * Although we didn't see an explicit file for `app/auth/callback/route.ts`, the Supabase redirect URIs were set to `http://localhost:3000/auth/callback` in the setup instructions. This implies Zola might have a route or uses Next.js pages to handle it. Possibly, Supabase’s URL might directly handle the token, or Zola might rely on Supabase’s cookie to handle it.
    * Usually, one would have a Next.js route that uses `supabase.auth.exchangeCodeForSession` or something if not using the hosted callback. However, supabase also offers a built-in callback at their domain (the \[YOUR\_PROJECT\_REF].supabase.co callback) which can set the cookie via its domain and redirect back.
    * Given the configuration, likely the flow is: user clicks Google -> Supabase hosted page -> Google -> back to Supabase callback which sets a cookie and then redirects to `auth/callback` on our site. The `auth/callback` page on our site could simply call `updateSession()` or refresh the page. If Zola didn't implement it explicitly, the cookie might be already set so the middleware and `UserProvider` on refresh will pick up the session. Perhaps they have a simple page that just redirects to `/` or closes a popup.

  * **History and Search**: The presence of a HistoryTrigger and search functionality hints that Zola might have a “history” panel where you can search through your past conversations or browse by date (beyond the grouped list in sidebar). Possibly, pressing Cmd+K opens a command palette to jump to any chat by searching content (though that would require indexing messages, which may not be implemented yet). It might also be intended for searching within the active chat. The toggle of `enableSearch` is more about letting the AI use web search, not user searching content.

  * **Project support**: There is a `projects` table and a SidebarProject component. This suggests Zola allows organizing chats into user-defined projects (like folders). The UI might show projects in the sidebar as collapsible sections, and when creating a new chat you could assign it to a project. The createNewChat function accepts `projectId` (optional), and passes it to the API which inserts it. So if the user has multiple projects (maybe “Personal” vs “Work”), they can filter chats by project. The `SidebarProject` likely handles rendering each project’s name and its chats (using `SidebarList`). Without more UI detail, suffice to say projects are an organizational feature not crucial for single-user usage, but good for power users.

  * **Multi-model / Multi-chat UI**: If `multiModelEnabled` is true (a user preference), ChatContainer renders `<MultiChat>` instead of `<Chat>`. This could be an interface where the user’s single prompt is sent to multiple models and responses are shown side by side or sequentially (for comparison). The existence of such component suggests Zola is exploring features where you can get answers from different models (e.g., GPT-4 vs Claude) for the same question. Implementing that would require sending requests to multiple models on one prompt. Possibly prompt-kit or the AI SDK could handle it by treating different models as “agents” in one environment. However, without digging deeper, one can assume MultiChat would create multiple `useChat` instances or call the chat API multiple times. It’s likely experimental – flagged off by default.

  * **Tool usage and MCP**: The README mentions “Full MCP support (WIP)” and agent features like `@agent` mentions. While not fully active, code exists:

    * The chat input could allow invoking an agent by typing `@agent` in a message, which the backend might interpret differently (e.g., route it to a tool agent rather than the main assistant).
    * The chat utils have `cleanMessagesForTools` which strips out tool invocation messages if the next model cannot handle them. This is used possibly when switching from a model that supports tools to one that doesn’t – it cleans the conversation memory.
    * If in the future, Zola integrates an agent (like an OpenAI function-calling or tools via MCP), then the messages might include special roles or content (like messages with role "tool" or "system" that include instructions to use a tool). Already the `messages` table schema’s `role` allows 'data' (maybe used if a data retrieval from a tool is inserted). The `parts` JSONB field in messages stores structured content – the assistant’s message parts including reasoning, tool calls, etc. The saving function `saveFinalAssistantMessage` merges those parts and stores them.
    * The Content Security Policy allows connections to `api.github.com`, suggesting one tool might be a GitHub content fetcher (the X posts mention “GitHub agents are live on Zola, using MCP servers (git-mcp) you can chat with any repo” – so presumably Zola can connect to an MCP server that provides repository access). This could allow the assistant to fetch code from GitHub if you mention an `@repo` agent. The CSP also allows the domain `api.openai.com`, `api.mistral.ai`, and interestingly `api.supabase.com` (perhaps for vector embedding endpoints) and `api.openrouter.ai` if it was listed (though not explicitly seen above). It's prepared for multi-model network calls.
    * The bottom line: while agent and tool features exist in code, they require enabling MCP and hooking up an MCP server. That’s beyond the default use-case, but the architecture has placeholders to integrate these without major refactoring.

## Database Schema and Persistence

Zola’s data model is built on the following tables (in Supabase/Postgres):

* **users:** Stores each user’s profile and usage stats. Key fields:

  * `id` (UUID, primary key, matches Supabase Auth user ID).
  * `email` – either the real email for registered users or a dummy for guests (like `anon@example.com`).
  * `anonymous` (bool) – true if the user is a guest account.
  * `premium` (bool) – reserved to mark paying users (for future use, to maybe allow higher limits or pro model access).
  * Usage counters: `message_count` (total messages sent), `daily_message_count` and `daily_reset` (count and last reset time for daily free messages). Similarly `daily_pro_message_count` and `daily_pro_reset` for pro-tier model usage.
  * `system_prompt` (TEXT) – the user’s custom system prompt for chats (if they set one in their settings).
  * `favorite_models` (TEXT\[]) – list of model IDs the user marked as favorite.
  * `display_name` and `profile_image` – possibly populated from OAuth (Google name/avatar) or manually.
  * `last_active_at` and `created_at` timestamps.
  * Relations: It references `auth.users` (the Supabase auth table) via foreign key. If a user is deleted from auth, cascade delete their profile.

* **projects:** Optional grouping of chats.

  * `id` UUID PK, `name` (project name), `user_id` (owner). One user to many projects.
  * A chat can belong to a project (see chats.project\_id). Deleting a project would ideally delete or reassign chats (though cascade is set to delete chats on project deletion).

* **chats:** Each chat conversation.

  * `id` UUID PK (generated via uuid\_generate\_v4).
  * `user_id` (owner, FK to users).
  * `project_id` (optional FK to projects table).
  * `title` – the name of the conversation (defaults to something like "New Chat" until renamed).
  * `model` – the model ID used for this chat (e.g. "openai/gpt-3.5-turbo"). The model can change if user switches it mid-conversation (the current model is stored).
  * `system_prompt` – possibly a custom system prompt set for this specific chat (if not, maybe null and fall back to user’s default or global default).
  * `public` (bool) – if true, this chat is shared publicly (perhaps future feature to share a link to a conversation).
  * Timestamps: `created_at`, `updated_at` (the latter updated whenever a new message arrives or title changes).
  * Foreign keys: user\_id (cascade delete chats if user is deleted), project\_id (cascade if project deleted).

* **messages:** Stores messages within chats.

  * `id` SERIAL PK (auto-increment integer). This is unique per message and used as primary key.
  * `chat_id` (FK to chats, cascade delete on chat deletion).
  * `user_id` (FK to users, nullable because system or assistant messages might have no user).
  * `role` (TEXT) – one of `'system' | 'user' | 'assistant' | 'data'`. The 'data' role might indicate a message that is data retrieved by a tool (MCP uses role 'data' for retrieved information). There's also mention of a 'tool' role usage in code (they check for `(message as {role}).role === "tool"` in cleaning) which suggests they might intermix tool messages or use 'data' similarly. The schema CHECK ensures role is one of the four specified.
  * `content` (TEXT) – The main content of the message. For assistant messages that contain complex structured output, this might be a simplified or plain text version (the schema allows it to be nullable, since they also store structured parts).
  * `parts` (JSONB) – This is a JSON blob storing the detailed content parts of assistant messages. For example, an assistant’s answer might be stored as an array of segments like: `[{type: "text", text: "Hello"}, {type: "tool-invocation", toolInvocation: {...}}, {type: "tool-result", ...}, {type: "text", text: "final answer"}]`. Zola’s `saveFinalAssistantMessage` function builds this JSON (merging reasoning, tool results, etc.) before saving. The presence of this field allows the UI to reconstruct rich content (with intermediate steps, citations, etc.).
  * `experimental_attachments` (JSONB) – If the message had file attachments (for user messages), they store an array of attachments here. Each attachment might have `file_url`, `file_name`, `file_type`, etc. Actually, attachments are also tracked in a separate `chat_attachments` table for persistent storage; this JSON is more to quickly retrieve which attachments were referenced in a particular message.
  * `message_group_id` (TEXT) – possibly used to group messages that were part of one multi-turn exchange. For instance, if the assistant needed to ask a follow-up question, or in the future if they allow multi-step reasoning, a group ID could tie messages together.
  * `model` (TEXT) – records which model produced this message (for assistant, or which model user prompt was meant for). If user switched models mid-chat, the model field marks which model the message belongs to. This helps in analysis or filtering.
  * `created_at` timestamp.
  * Foreign keys: chat\_id and user\_id as mentioned.
  * There is no direct `updated_at` on messages; they are immutable logs.

* **chat\_attachments:** Stores metadata for files uploaded in chats.

  * `id` UUID PK.
  * `chat_id` (FK to chats) and `user_id` (FK to users) – identifies who uploaded and where.
  * `file_url` (TEXT) – the URL or path in Supabase Storage where the file is accessible.
  * `file_name`, `file_type`, `file_size` – metadata for display (name, MIME type, size in bytes).
  * `created_at` timestamp.
  * On chat deletion, these are cascade deleted; on user deletion, likely cascade as well (since user\_id FK).
  * The app likely uses Supabase Storage buckets (as mentioned, one named `chat-attachments` and another `avatars` for user images). Files get uploaded to `chat-attachments` bucket with perhaps a path for each user or chat. The `file_url` is probably a public URL or requires a signed URL if the bucket is private. (They mention configuring public access for the bucket in the install guide, which might mean attachments are publicly accessible if one has the URL. Alternatively, they could use Supabase’s auth token to fetch.)

* **feedback:** A simple table for user feedback submissions.

  * `id` UUID PK.
  * `user_id` (FK to users), `message` (TEXT feedback content), `created_at`.
  * This would be populated if the user uses a “Send Feedback” form in the UI (maybe the FeedbackWidget).
  * Possibly if user is anonymous, they still fill user\_id with the anon id (so we know which session gave feedback).

* **user\_keys:** Stores the encrypted API keys that users add (BYOK for providers).

  * Composite primary key (user\_id, provider) – each user can have at most one key per provider.
  * Fields: `encrypted_key` (TEXT) – the base64 encrypted API key, `iv` (TEXT) – initialization vector used for encryption, and timestamps (likely created\_at/updated\_at but not shown explicitly, they might rely on default triggers or not needed since we update in place).
  * The app uses a 32-byte encryption key (stored in `ENCRYPTION_KEY` env) to encrypt user API keys before saving. The `decryptKey` function will decrypt using the same key on demand.
  * `provider` is a short code like "openai", "anthropic", etc.. Only non-ollama providers are stored (no need for local model keys).
  * When a user enters a key in the settings UI, the app likely calls a protected Supabase function or direct insert (maybe using Supabase client with service key in a secure context) to save it. The user\_keys are then used by `getUserKey` on the server to retrieve and decrypt the key when needed.

**Data access patterns:**

* On login or app load, the server (via getUserProfile) selects the user row along with their preferences (join on user\_preferences). This gives initial data like daily counts, which might not be all used in UI but could be used to decide if to show something. The context doesn’t explicitly show usage, but they could e.g. show “x remaining” somewhere. Actually, they use toasts and DialogAuth to notify limits rather than a persistent counter on screen.
* Each chat page load triggers fetching chats and messages as described. The design aims to minimize calls: the initial `ChatsProvider` load gets all chats in one query; `MessagesProvider` loads per chat on demand. The model list and key status are loaded once at app start via `ModelProvider`.
* Real-time updates: They subscribe to user updates (so if daily\_message\_count changes on the server, user context could update – though currently they increment on the server and not necessarily pushing it to client, unless they set up a Postgres subscription on users.id, which they did in UserProvider using supabase channel for user updates). They do use `subscribeToUserUpdates` which listens for UPDATE on `users` for that user. If the server increments daily\_message\_count, that triggers and user context could update usage count if they stored it. However, the current user context code only merges `...newData` on user – if newData includes daily\_message\_count, it would update user. But `UserProfile` type might include those fields or not. Possibly they do this to update `last_active_at` or others.
* They aren’t explicitly using Supabase real-time for messages or chats (which they could to see messages from another device, etc., but not necessary in single-user scenario). They rely on direct queries and local caching for those.

**Environment and Deployment:**

To run Zola, certain environment variables must be set (either in `.env.local` for development or as Vercel project vars):

* **Supabase config:** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for frontend, plus `SUPABASE_SERVICE_ROLE` (private key) for server functions that need full DB access. These are needed if using Supabase. If they are absent, Zola treats “Supabase not enabled” and will operate in a limited mode (no auth or persistence beyond local browser).
* **API keys:** `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `MISTRAL_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` (for Gemini), `XAI_API_KEY` (for xAI’s model), `OPENROUTER_API_KEY` (if using OpenRouter to proxy model calls), etc.. These keys are used as default keys for each provider (so the app can function out-of-the-box if provided). If a key is missing for a certain provider, that provider’s models might be disabled or require the user to input their own. For example, if the developer doesn’t provide an Anthropic key, the Anthropic models will only work if the user supplies one in BYOK (or not at all for guests).
* **Ollama URL:** `OLLAMA_BASE_URL` (default `http://localhost:11434`). Used to point to a local or remote Ollama instance for local model inference. In dev, you’d run Ollama locally. In production, by default, Zola disables Ollama (the middleware in `middleware.ts` sets `DISABLE_OLLAMA=true` in production by default, or rather the code snippet suggests “in production, Ollama is disabled by default”, and they allow enabling it with an env var `DISABLE_OLLAMA`).
* **CSRF Secret:** `CSRF_SECRET` is a random string secret used to sign CSRF tokens. Must be set to enable CSRF protection.
* **Encryption Key:** `ENCRYPTION_KEY` is the base64 32-byte key for BYOK encryption. If BYOK is not needed, they might still require a dummy value or simply not allow key storing.
* **NEXT\_PUBLIC\_VERCEL\_URL:** Used only if you need to explicitly set the production URL (Vercel auto sets this). They commented it as optional.

**Deployment:**
Zola provides a Dockerfile and compose files to ease deployment. The Dockerfile is a multi-stage build that installs dependencies, builds the Next.js app (Production mode), and then runs it with `next start` on Node 18 alpine. It includes a healthcheck and runs as a non-root user. Environment variables are passed at runtime (e.g. Supabase keys, API keys). The `docker-compose.yml` shows how to run Zola in one service, or `docker-compose.ollama.yml` runs two services: Zola and an Ollama container (with a volume to store models and an environment variable `OLLAMA_MODELS` to auto-pull some models on startup).

For a **Vercel deployment**, the easiest path is using the provided “Deploy with Vercel” button (in README). Zola is part of the Vercel OSS program, so presumably it runs fine on Vercel hosting. You’d supply the env vars in Vercel’s dashboard. Vercel will auto-detect it’s a Next.js app and deploy accordingly. The Next.js config may mark some routes to run on Edge (maybe not, since they use Node crypto – likely they run all on default Node serverless). The `middleware.ts` sets `runtime: "nodejs"` explicitly (so it doesn’t run on the Edge, because it uses crypto and needs Node APIs). This means all API routes and middleware run in a Node.js environment (Vercel serverless functions), not the Edge runtime.

**Scalability:** Each chat request is a stateless call hitting external AI APIs. They can scale horizontally with Vercel function instances. Supabase handles concurrency for the DB operations. The app must consider rate limits of each model API (OpenAI etc.), but it doesn’t implement special queueing except returning errors if rate limited (they parse 429 and return a user-friendly error “Rate limit exceeded. Please try again later.”).
Because streaming responses keep connections open potentially up to 60 seconds (they set `maxDuration = 60` in chat route), each request could tie up a serverless function for up to 60 seconds streaming. Vercel’s default function timeout is 10s for standard, but they must be on the Pro plan or using edge streaming (Edge can stream longer). Actually, Vercel now supports streamed responses beyond 10s. They might also buffer and flush. They set `maxDuration = 60` presumably to ensure if a model call takes longer than a minute it times out.

**Security Considerations:**

* All sensitive keys are kept server-side (the Next.js API uses them; the public client only has the anon Supabase key which is safe).
* CSRF and content security policies are in place as discussed.
* They sanitize user input when saving to DB (using `sanitizeUserInput` in `logUserMessage` to remove any disallowed HTML or control chars).
* Attachments files are scanned for type using `file-type` to reject dangerous files if needed. Also, attachments are likely not executed by anything, just stored.
* Supabase RLS ensures one user cannot read another’s data even if they manipulate the client.

**Extensibility:**
Developers looking to extend Zola can do so in several ways:

* **Adding new AI model providers:** One can integrate a new model by adding its configuration in `lib/models.ts` and including the appropriate provider SDK package. For example, to add a “Cohere” model, import `@ai-sdk/cohere`, add an entry with an `id`, `name`, and `apiSdk: (apiKey, opts) => new Cohere(apiKey)`. Also define if it’s free or requires login in config lists (FREE\_MODELS\_IDS, etc.). The frontend will automatically include it in the model list. One must ensure to provide an API key in env or the user will have to BYOK for it.
* **Custom tools or agents:** If implementing an agent that can use tools (like a web search agent), one could integrate with the MCP (Model Context Protocol) by connecting an MCP server. Zola mentions MCP servers and has placeholders for tool messages. A developer could run an MCP server (for example, a GitHub agent server) and configure Zola to use it. The integration would involve mapping a model or agent name to that server. As of now, this is advanced and experimental, but the structure supports it.
* **UI/UX changes:** Because Zola uses standard React and Tailwind, customizing the interface (colors, layout, adding new components) is straightforward. Developers can modify components in `components/` to add features. For instance, one could add a “Clear chat” button that calls `deleteMessages()` from MessagesContext, or add a feature to export a conversation to Markdown/PDF by iterating messages.
* **Storage and vector databases:** Currently, Zola does not implement a vector store for long-term memory or document Q\&A. However, one could integrate one by, say, using Supabase’s pgvector or Weaviate/Pinecone. For example, on file upload, you could embed the file’s text and store vectors, then modify the prompt to include relevant snippets. The open architecture allows inserting such steps in the chain (for instance, using Vercel AI SDK’s middleware concept or directly in the chat route before calling `streamText`). If one were to integrate that, they might do it as a “Search tool” so the assistant can query the vector DB via a tool invocation.
* **Authentication and roles:** Zola uses Supabase Auth; one could expand with more providers or add role-based features (the `premium` flag in users suggests a plan to offer premium accounts with higher limits or special models).
* **Contributing:** The project is on GitHub and already has contributions. Developers should follow the style (TypeScript with proper types, using context providers for state). The README notes it's beta, so things may change – contributors should check issues for planned features like improving agent support or multi-chat.

## Prompt/Response Lifecycle Walkthrough

To illustrate end-to-end, let’s walk through a sample user interaction and how Zola handles it:

**User starts a new conversation as a guest:** When they open the app, `UserProvider` finds no Supabase session (so `userProfile` returns a dummy Guest user with id "guest" and `anonymous: true`). The app loads with this guest context. The user sees the home screen with no chats (“No chats yet”). They type a question "What is the capital of France?" in the input and hit Send.

* The Chat component’s `submit` function runs. It calls `getOrCreateGuestUserId`. Since our user context had id "guest" which is not a real Supabase anon ID, `createClient` returns null because no Supabase URL (meaning supabase is not actually enabled or user is not authed). Actually, if Supabase is configured but the user is not authed, `existingGuestSessionUser = await supabase.auth.getUser()` would likely return null because they haven't called `signInAnonymously()` yet. So it proceeds to do `supabase.auth.signInAnonymously()`. Provided Supabase’s allow anonymous sign-ins is toggled on, this will succeed and yield a new anon user (say ID = `UUID1`). It then calls `createGuestUser(UUID1)` via the /api/create-guest route to make a profile row. The server inserts the users entry with id=UUID1, anonymous=true. The client stores `guestProfileAttempted_UUID1 = "true"` in localStorage to not repeat profile creation.

* Now `uid = UUID1`. The draft message "What is the capital of France?" is turned into an optimistic message and appended to the UI.

* `checkLimitsAndNotify(UUID1)` runs. The server route /api/rate-limits checks the `users` table for user=UUID1. It’s a new user, daily\_message\_count likely 0, daily limit for anonymous might be (say) 5 by default. It returns remaining = 5. The function sees remaining != 0 (and maybe not at threshold), so allowed = true. Nothing to notify.

* `ensureChatExists(UUID1, "What is...")`: There is no current chat (chatId null, messages.length 0), user is not authenticated (false, since user.anonymous true was passed). It checks localStorage for `guestChatId`. None yet. So it proceeds to create a chat: calls `createNewChat(UUID1, title="What is the capital of France?", model= (selectedModel, say default GPT-3.5), isAuthenticated=false, systemPrompt=default)`.

  * In ChatsProvider, `createNewChat` makes an optimistic chat with id "optimistic-..." and adds to chats state with title "New Chat" (or maybe first user message as default title). Then calls `/api/create-chat`. The server `createChatInDb` sees supabase enabled and isAuthenticated false, it calls `checkUsageByModel` to see if guest can use that model. If the model is allowed for guests (GPT-3.5 likely is allowed, since they allow some free models), it inserts the chat row with given title and model. The new chat record is returned with a real UUID (say ChatID = `UUIDchat1`). The route returns `{ chat: {id: UUIDchat1, ...} }`. `createNewChat` receives it, updates the chat list (replacing the optimistic id with real UUID1), and returns the chat object.
  * Back in ensureChatExists, for anonymous user, it stores `localStorage.setItem("guestChatId", newChat.id)` to remember the chat id because it does not pushState the URL (they decided not to change route for guests). Then returns `UUIDchat1`.

* Now `currentChatId = UUIDchat1`.

* It checks message length vs MESSAGE\_MAX\_LENGTH – presumably fine.

* No attachments here.

* Now it calls `handleSubmit(undefined, options)` where options contain the body: `{ chatId: UUIDchat1, userId: UUID1, model: "openai/gpt-3.5-turbo", isAuthenticated: false, systemPrompt: default, enableSearch: false }`.

* The `useChat` hook now sends a POST to `/api/chat` with that JSON body.

* **On the server (/api/chat)**:

  * It validates JSON, sees `messages` includes the conversation history. Likely the `useChat` hook included the user’s message in the payload automatically (the `handleSubmit` from SDK probably packaged the last user message along with prior messages). But in our case, prior messages list included our user message (and maybe no assistant messages yet). If the hook's `messages` state was empty at time of sending, it might rely on the `options.body.messages` we provide. Actually, by calling `handleSubmit(undefined, options)`, we override the body – likely meaning we manually manage messages. The code might treat `messages` in the payload as whatever we specify. We passed no `messages` in options explicitly. Possibly the `useChat` hook automatically attaches the conversation from its state. We appended the user message optimistically and then removed it from hook state before calling handleSubmit. So the hook's internal `messages` might have been empty (since we removed the user msg). But we also called `append(userMsg, options)` in handleSuggestion code, so handleSubmit might similarly append if it sees a user message in options (not sure).

    * It's a bit intricate: The SDK’s `handleSubmit` likely takes `input` (which we left empty) and `options.body.messages` (which we provided starting from scratch). Given we passed the chatId, userId, etc., but not explicitly the content of the user message in the body, the SDK might send an empty message array or might include the user message it had prior to clearing. To avoid confusion: It could be that we should have used `append` rather than `handleSubmit` to send the user message in the payload properly. The code calls `cacheAndAddMessage(optimisticMessage)` after handleSubmit, which might have been better placed before to keep it in state. Possibly a slight logic complexity. Let’s assume the user message is included properly: either the server had it via `logUserMessage` call because we called that just after increment usage. Actually yes: in the API code, after usage validation, it does:

    ```js
    const userMessage = messages[messages.length - 1];
    if (supabase && userMessage?.role === "user") {
       await logUserMessage(...);
    }
    ```

    So if the payload had the user's message in `messages`, the server logs it. If our payload didn't include it, then the conversation would appear empty, which doesn't make sense. So likely `useChat` automatically included the message. Possibly the `useChat` internal state still had the user message because when we removed it, we then immediately called `cacheAndAddMessage`, but that affected our context, not the hook. Actually, no, we did `setMessages(prev => prev.filter(id !== optimisticId))` to remove it from hook state, and then `cacheAndAddMessage` only updated context. So if we truly removed it from hook state, the hook might send no messages. This suggests maybe the better approach would be to not remove it until after `handleSubmit`. The code as written might rely on the server catching the message from context? That wouldn't happen. Perhaps the Vercel AI SDK’s `handleSubmit` automatically uses the `input` value if provided, but we set `input` to "". Maybe the intended behavior: The user message was captured via `optimisticMessage`, but then they call handleSubmit with no input, so how does server get it? Possibly an oversight. Or maybe `handleSubmit(undefined, options)` still uses the last known input (which might have been the user's message content if not cleared *before* calling handleSubmit).

    * Actually, see that they clear input (`setInput("")`) after adding optimistic message but *before* sending. That likely removed it from hook's `input` because `useChat`’s input state is bound to our `input` variable. So indeed, there's a risk the server call is missing the user content. However, then they do `cacheAndAddMessage(optimisticMessage)` which calls `setMessages` in context. But context messages aren't automatically passed to server.
    * Perhaps the key is that they call `onFinish: cacheAndAddMessage` in useChat, meaning the user message is not inserted by the hook on send, but we manually inserted it in context. But the server should still receive the message content from somewhere.
    * Given testing would have caught an empty prompt, I suspect the `useChat` hook might have buffered the input before we cleared it, or the message remained in hook’s messages until handleSubmit started (maybe we should have removed it *after* handleSubmit, not before).
    * The code actually does: `handleSubmit(undefined, options); setMessages(prev => prev.filter(optId)); ... cacheAndAddMessage(optimisticMessage)`. So they call handleSubmit *before* actually removing the optimistic from the hook state? No, they remove after calling handleSubmit. So they do:

      1. `handleSubmit(undefined, options)` (sends request, presumably with the current hook state including the optimistic message).
      2. Immediately after, remove the optimistic from hook state.
      3. Then add it to persistent context.
    * If that is the order, then yes, the hook did include the user message in the API call. Good. So the server gets `messages = [{ role: "user", content: "What is the capital of France?", ...}]`.
  * On server: `validateAndTrackUsage` returns supabase client (since we validated user and usage earlier for checkLimits, but the chat route does it too for robustness).

    * It increments usage (message\_count++ etc.).
    * Logs the user message to DB via `logUserMessage` inserting into messages table (with content sanitized).
  * It fetches model config for GPT-3.5, gets the API key (maybe from env OPENAI\_API\_KEY since user didn't have their own).
  * Calls `streamText` with OpenAI provider. The assistant’s answer begins streaming.
  * `onFinish`: it will call `storeAssistantMessage` which inserts the assistant's full message into messages table and logs "Assistant message saved successfully".
  * The SSE stream is sent to client.

* **Client receiving stream:** The `useChat` hook on client receives tokens and updates `messages` state for the assistant message as it comes in. So in the UI, the conversation shows:

  * User: "What is the capital of France?" (we already had it rendered via optimistic add and then perhaps re-rendered by hook as well).
  * Assistant: streaming "The capital of France is Paris." token by token.

* Once stream finishes, the `onFinish: cacheAndAddMessage` we passed is called with the final assistant message. That calls `MessagesProvider.cacheAndAddMessage` to add the assistant message to context and IndexedDB. So now the persistent state knows about it.

* The Chat UI stays open. The user’s `hasSentFirstMessageRef` is set, so it won’t redirect away erroneously.

* The user can now continue the conversation: if they type again, the context now has an existing `chatId` (UUIDchat1) and messages. The second message send will skip creating chat (ensureChatExists will just return current chatId because messages.length > 0, so it doesn't create new). It will perform usage check, then proceed to call handleSubmit with the new message in context. The backend will see existing chat with previous assistant message, and include it in the conversation sent to model.

* If at any time the guest hits daily limit (e.g., after 5 messages), `checkLimitsAndNotify` will find remaining 0 and set `setHasDialogAuth(true)` causing `DialogAuth` to pop up. The user then can sign in via Google. After sign-in, `UserProvider` will get a new `user` (anonymous false now). The context likely resets (if they refresh or maybe if Supabase’s redirect came through the /auth/callback and triggered an update). The chat might then re-render with user now authenticated. They can continue using pro models etc.

This lifecycle shows how the pieces interact to manage conversation seamlessly. Despite being a complex system, the modular contexts and hooks maintain a clear separation of concerns, making it easier to extend and debug.

## Deployment and Configuration

To deploy Zola in a production environment, consider the following:

* **Vercel Deployment:** Zola is well-suited to deploy on Vercel (▲). By using the Vercel CLI or the GitHub integration, you can import the repository. Ensure you set all required environment variables in the Vercel Dashboard (Project Settings → Environment Variables). Particularly, provide the Supabase keys and at least one model API key (OpenAI key is highly recommended to have). After deploying, use the Vercel URL or your custom domain to access it. The “Deploy to Vercel” button in the README streamlines this. Vercel will handle building the Next.js app and setting up serverless function endpoints for the API routes.

* **Self-Hosting (Docker):** If you prefer self-hosting, use the provided `Dockerfile`. You may build it:

  ```bash
  docker build -t zola:latest .
  docker run -p 3000:3000 --env NEXT_PUBLIC_SUPABASE_URL=... --env NEXT_PUBLIC_SUPABASE_ANON_KEY=... (and all other envs) zola:latest
  ```

  Or use the `docker-compose.yml` which expects you to fill the environment variables in the compose or via a `.env` file. For local use with Ollama, the `docker-compose.ollama.yml` can launch both services; it also can auto-pull a default model (by setting `OLLAMA_MODELS` environment to a comma-separated list of models to download).

  Ensure that the Supabase URL in env uses the correct format (`https://xyz.supabase.co`) and not have a trailing slash. Also, if you run Supabase locally (with supabase CLI), you could point Zola to that (update the URL and anon/service keys accordingly).

* **Supabase Setup:** If you enable features like auth or file uploads, you need a Supabase project. In Supabase:

  * Enable Google OAuth (or others if you want) under Authentication providers, and configure redirect URLs (as per INSTALL.md, add `http://localhost:3000/auth/callback` for dev, and your production URL for prod).
  * If you want guests, toggle “Allow anonymous sign-ins” in the Authentication settings.
  * Use the SQL snippet from INSTALL.md to create the necessary tables (you can run it in Supabase SQL editor). This sets up all the needed tables and relationships. Make sure to also enable Row Level Security and create appropriate policies:

    * For `messages`: maybe allow a user to select messages where `chat.user_id = auth.uid()` (joined through chat).
    * For `chats`: allow select/update for `user_id = auth.uid()`.
    * The provided snippet in INSTALL.md hints at some example policies commented out, which you should adapt:

      ```sql
      ALTER TABLE users ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "Users can view their own data." ON users FOR SELECT USING (auth.uid() = id);
      CREATE POLICY "Users can update their own data." ON users FOR UPDATE USING (auth.uid() = id);
      -- similarly for chats, messages, etc.
      ```
    * Alternatively, since the app mostly calls Supabase from the server with service role (for critical writes), and uses the anon key on client only for the channels and possibly model list, you might rely on service calls. But it’s safer to enforce RLS for any client-side reads (like model favorites or keys – though user\_keys should never be sent to client).
    * Also, ensure `auth.uid()` matches the `id` in users for all relevant tables in policies (chats, messages, attachments should all check the user relationship).
  * Create the storage buckets `chat-attachments` and `avatars` in Supabase Storage, and mark them as public if you want to serve files directly (the guide suggests enabling public access). If not public, you’d need to generate signed URLs via Supabase for attachments (the app doesn’t currently do that, it assumes either public or uses supabase’s embedded auth on link – likely they set `public` to true in DB meaning they considered making shared chats accessible publicly).
  * Add a Row Level Security policy to `user_keys` table such that only the user can insert/select their keys and no one else (again, service role is used to decrypt, but for extra safety if any client call did happen).

* **Configuring Model Providers:** The `.env.local` or environment variables allow toggling providers. If you don’t have a key for a certain provider, leaving it blank effectively disables those models (the UI might still list them but BYOK would be required). The “FREE\_MODELS\_IDS” in config (likely includes open models like Mistral 7B or local ones like Llama2) are allowed for guests, whereas others are marked as pro. If you want to adjust which models are free vs. require login, you can edit `FREE_MODELS_IDS` in `lib/config.ts`. Similarly, `DAILY_LIMIT_PRO_MODELS` constant in config might define how many pro uses a user can do (it’s likely configured to a small number by default, maybe 0 for guests meaning guests cannot use pro models at all).

* **Analytics or Logging:** The CSP in production allowed `https://analytics.umami.is` which suggests an integration with Umami (open-source analytics) might be present. If you deploy and use it, you may set an `NEXT_PUBLIC_UMAMI_ID` or similar if they included a Script for analytics in layout (perhaps the `LayoutApp` or somewhere includes a tracking script if an env is set). Check `next.config.ts` if it rewrites anything or includes any particular domain.

* **Maintenance:** Zola is in beta, meaning updates may come frequently. If you deploy it in production, keep an eye on the repository for bug fixes (especially around usage limits and memory, since those might evolve). With Supabase, periodically clean out old chat data if necessary (no automatic pruning yet – if a user uses it heavily, their messages accumulate; though each message is small text, so not too bad).

* **Contribution for Developers:** If you’re extending the project:

  * Follow the code style (Prettier config is provided, ESLint config too).
  * Write TypeScript definitions for any new contexts or API handlers.
  * Add any new environment keys to `.env.example` so others know.
  * Ensure any new features respect existing patterns (for instance, if adding a new AI provider or tool, integrate it in `lib/models` or via the hook system rather than hacking it in one-off).
  * Use the existing components as references (e.g., how ChatInput manages state and calls up to context).

Zola’s design demonstrates a thoughtful integration of numerous technologies to create a flexible AI chat platform. By dissecting its architecture and code, we see how frontend interactivity, backend logic, and third-party services come together. Whether one wants to self-host a personal AI assistant or build upon Zola for a bigger project, this documentation should serve as a guide to its inner workings and a roadmap for future enhancement.

**References:** This documentation is based on the Zola repository by ibelick and the code within, including the installation guide and inline code comments for context. All code citations refer to Zola’s codebase (as of mid-2025) for accuracy on implementation details.
