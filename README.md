# Jacob Command Center

AI Assistant Dashboard built with Next.js 14, Supabase, and OpenAI.

## Features

- 💬 **Chat Interface** — Converse with Jacob (OpenClaw AI assistant)
- 📚 **Knowledge Base** — Upload documents, auto-chunk & embed with OpenAI, semantic search
- 🧠 **Memory** — Long-term memory management with tags and pinning
- 📊 **Dashboard** — Overview of services, recent activity, quick actions
- 🎨 **Dark Glassmorphism UI** — Beautiful dark mode with backdrop-blur effects

## Tech Stack

- **Framework:** Next.js 14 (App Router, TypeScript)
- **UI:** Tailwind CSS, shadcn/ui, Framer Motion, Lucide Icons
- **Database:** Supabase (PostgreSQL + pgvector)
- **Embeddings:** OpenAI text-embedding-3-small
- **Storage:** Supabase Storage

## Setup

1. Clone the repo
2. Copy `.env.local.example` to `.env.local` and fill in your keys
3. Run the Supabase migration: `supabase/migrations/001_initial.sql`
4. Install dependencies: `npm install`
5. Run dev server: `npm run dev`

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server only) |
| `OPENAI_API_KEY` | OpenAI API key for embeddings |
| `OPENCLAW_GATEWAY_URL` | OpenClaw Gateway URL |
| `OPENCLAW_GATEWAY_TOKEN` | OpenClaw Gateway auth token |

## Deploy

Deploy to Vercel:

```bash
vercel
```

## License

Private project.
