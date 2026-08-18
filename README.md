# AskMyDocs

> Upload PDFs or notes, ask questions in plain language, and get answers grounded in your own documents — every claim traceable to a specific chunk and page.

🔗 **Live Demo:** [https://ask-my-docs-chi.vercel.app](https://ask-my-docs-chi.vercel.app/)

---

## Features

- **Document Upload** — Drag & drop PDFs, TXT, or Markdown files (up to 20MB)
- **Page-Aware Extraction** — Real page numbers from PDFs via `pdfjs-dist`
- **Smart Chunking** — ~500-token chunks with ~75-token overlap using `js-tiktoken`
- **Semantic Search** — `text-embedding-3-small` + pgvector cosine similarity
- **Hard Similarity Threshold** — 0.7 gate: if no chunks qualify, the system refuses rather than guessing
- **Grounded Answers** — `gpt-4o-mini` generates answers citing only retrieved chunks
- **Inline Citations** — `[1]`, `[2]` markers mapped programmatically to real chunk metadata
- **Sources Panel** — View all retrieved chunks (cited and uncited) with similarity scores
- **Document Scope Selector** — Restrict queries to specific documents
- **Conversation History** — Revisit past Q&A sessions with original citations
- **Token Usage Dashboard** — Track embedding and generation costs by type
- **Data Export** — Download all your data as JSON

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Auth | Supabase Auth (Email/Password + Google OAuth) |
| Database | Supabase PostgreSQL + pgvector |
| Storage | Supabase Storage (private bucket) |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dimensions) |
| Generation | OpenAI `gpt-4o-mini` |
| UI | shadcn/ui + Tailwind CSS v4 |
| PDF Parsing | pdfjs-dist (page-aware extraction) |
| Tokenizer | js-tiktoken (cl100k_base) |

## Architecture

```
Upload → Extract Text → Chunk (~500 tokens) → Embed (batched) → Store in pgvector
                                                                        ↓
Question → Embed Query → Cosine Search → Threshold Gate (≥ 0.7) → Generate Answer
                                              ↓ (if no chunks pass)
                                         Refusal Message (no generation call)
```

**Key design decisions:**
- Retrieval and generation are **two separate steps**, never one call
- The similarity threshold is a **hard gate in code**, not a prompt instruction
- Citation markers `[n]` are **parsed programmatically** and mapped to chunk metadata
- Document processing runs **after the upload response** via `next/server after()`
- **No LangChain, no Pinecone** — raw OpenAI API + pgvector in Supabase

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase project (free tier works)
- OpenAI API key

### Setup

1. **Clone and install:**
   ```bash
   git clone https://github.com/your-username/AskMyDocs.git
   cd AskMyDocs
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.local.example .env.local
   ```
   Fill in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   OPENAI_API_KEY=your-openai-key
   ```

3. **Set up database:**
   - Run `lib/supabase/schema.sql` in Supabase SQL Editor
   - Run `lib/supabase/match_chunks.sql` in Supabase SQL Editor

4. **Create storage bucket:**
   - Supabase Dashboard → Storage → New bucket named `documents` (private)

5. **Run:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
app/
├── api/
│   ├── chat/route.ts          # Query pipeline (retrieve → generate)
│   ├── conversations/         # CRUD for Q&A sessions
│   ├── documents/             # Upload + list + delete
│   └── usage/route.ts         # Token usage stats
├── auth/callback/route.ts     # OAuth code exchange
├── chat/page.tsx              # Chat interface
├── documents/page.tsx         # Upload + document library
├── history/page.tsx           # Past conversations
├── login/page.tsx             # Email/password + Google
├── settings/page.tsx          # Usage chart + export
└── signup/page.tsx            # Registration

components/
├── chat/                      # ChatWindow, MessageBubble, SourcesPanel, ScopeSelector
├── documents/                 # UploadZone, DocumentCard, DocumentList, StatusBadge
├── layout/AppShell.tsx        # Sidebar + mobile nav
└── ui/                        # shadcn/ui primitives

lib/
├── openai/client.ts           # Singleton OpenAI client
├── rag/
│   ├── chunkText.ts           # Paragraph-aware chunking
│   ├── embedChunks.ts         # Batched embedding
│   ├── extractText.ts         # PDF/TXT/MD extraction
│   ├── generateAnswer.ts      # Grounded generation + citation parsing
│   ├── processDocument.ts     # Ingestion orchestrator
│   └── retrieveChunks.ts      # pgvector search + threshold
├── supabase/                  # Client, server, storage helpers + SQL
└── tokenTracking.ts           # Usage logging
```

## License

MIT
