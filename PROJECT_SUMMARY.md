# AskMyDocs — Project Summary & Documentation

## What Is AskMyDocs?

AskMyDocs is a **full-stack AI-powered document Q&A application**. Users upload their documents (PDFs, text files, Markdown), and the app processes them so users can **ask questions in natural language and get accurate, cited answers** drawn only from their uploaded content.

Think of it like having a personal ChatGPT that *only* answers from your own documents and always tells you exactly where it found the information (page number, document name).

---

## Core Features

### 1. Document Management
- **Upload** PDF, TXT, and Markdown files (up to 20MB)
- **Drag-and-drop** or click-to-upload interface
- **Real-time status tracking** — shows Processing → Ready or Failed
- **Delete documents** with inline confirmation (no ugly browser popups)
- Files stored securely in **Supabase Storage** with per-user isolation

### 2. AI-Powered Chat (RAG)
- Ask questions about your documents in plain English
- Answers are **grounded only in your documents** — the AI never uses outside knowledge
- **Inline citations** like `[1]`, `[2]` link back to specific source chunks
- **Sources panel** shows which documents and pages were referenced
- If the answer isn't in your documents, it **refuses honestly** instead of guessing
- Supports **scoping** — ask questions about specific documents only

### 3. Conversation History
- All Q&A sessions are saved automatically
- Browse and revisit past conversations
- Conversation titles auto-generated from the first question

### 4. User Profile Management
- **Display name** — editable, saved to Supabase auth metadata
- **Avatar** with initials shown in sidebar
- **Email** displayed (read-only, managed by auth provider)
- **Member since** date

### 5. Session & Security
- **30-minute idle timeout** — warning dialog appears 2 minutes before auto-logout
- **"Stay Signed In"** button resets the timer
- **Sign out this device** — revokes current session JWT
- **Sign out all devices** — revokes ALL sessions globally (every device)
- **Server-side session refresh** — proxy refreshes tokens on every request
- **Client-side auth listener** — auto-redirects to login on session expiry

### 6. Data & Usage
- **Token usage dashboard** — shows embeddings, queries, and generation token counts
- **Data export** — download all documents, conversations, and usage as JSON

---

## How It Works — The RAG Pipeline

RAG stands for **Retrieval-Augmented Generation**. Instead of the AI making things up, it first *retrieves* relevant information from your documents, then *generates* an answer using only that information.

### Document Upload & Processing Flow

```
User uploads file
       │
       ▼
┌──────────────────┐
│  Supabase Storage │  ← File stored securely
└────────┬─────────┘
         │  (async, non-blocking)
         ▼
┌──────────────────┐
│   Extract Text   │  ← pdfjs-dist (PDF) or plain read (TXT/MD)
│   (Page-aware)   │
└────────┬─────────┘
         ▼
┌──────────────────┐
│   Chunk Text     │  ← ~500 tokens per chunk, ~75 token overlap
│   (Paragraph-    │     Uses js-tiktoken for accurate counting
│    aware)        │
└────────┬─────────┘
         ▼
┌──────────────────┐
│  Generate Vector │  ← OpenAI text-embedding-3-small
│  Embeddings      │     Batched (50 chunks per API call)
└────────┬─────────┘
         ▼
┌──────────────────┐
│  Store in        │  ← Supabase pgvector (1536-dimensional vectors)
│  document_chunks │     Each chunk: content + embedding + page_number
└──────────────────┘
         │
    Status → "Ready"
```

### Chat / Question-Answering Flow

```
User asks: "What is machine learning?"
         │
         ▼
┌──────────────────┐
│  Embed Question  │  ← Same model: text-embedding-3-small
│  (Query Vector)  │
└────────┬─────────┘
         ▼
┌──────────────────┐
│  Vector Search   │  ← pgvector cosine similarity search
│  (Top 8 chunks)  │     SQL: match_chunks RPC function
└────────┬─────────┘
         ▼
┌──────────────────┐
│  Threshold Gate  │  ← similarity ≥ 0.7 required (HARD rule)
│  (Filter)        │     If 0 chunks pass → return refusal, NO AI call
└────────┬─────────┘
         ▼
┌──────────────────┐
│  Generate Answer │  ← GPT-4o-mini with numbered sources in prompt
│  with Citations  │     Temperature: 0.3 (focused, factual)
└────────┬─────────┘
         ▼
┌──────────────────┐
│  Parse Citations │  ← Regex extracts [1], [2] markers from response
│  Map to Metadata │     Maps to real chunk IDs, filenames, page numbers
└──────────────────┘
         │
    Answer displayed with clickable source references
```

---

## AI Integration — Detailed Breakdown

### What AI Models Are Used?

| Model | Provider | Purpose | Where Used |
|---|---|---|---|
| `text-embedding-3-small` | OpenAI | Convert text → 1536-dim vectors | Document processing + Query embedding |
| `gpt-4o-mini` | OpenAI | Generate answers from context | Chat answer generation |

### How AI Is Integrated

#### 1. Document Embeddings (Ingestion)
- **File**: `lib/rag/embedChunks.ts`
- **What it does**: Takes text chunks and calls OpenAI's embedding API to convert each chunk into a 1536-dimensional vector (array of numbers that represents the meaning of the text)
- **Batching**: Processes 50 chunks per API call to minimize network overhead
- **Storage**: Vectors stored in Supabase `document_chunks` table using `pgvector` extension
- **Token tracking**: Every API call logs tokens used for the usage dashboard

#### 2. Query Embedding (At Chat Time)
- **File**: `lib/rag/retrieveChunks.ts`
- **What it does**: When a user asks a question, it converts the question into the same 1536-dim vector using the same embedding model
- **Why same model**: Embeddings are only comparable if generated by the same model — the question vector must be in the same "space" as the document vectors

#### 3. Vector Similarity Search
- **File**: `lib/supabase/match_chunks.sql` (PostgreSQL RPC)
- **What it does**: Uses pgvector's cosine distance operator (`<=>`) to find the 8 most similar document chunks to the question
- **Threshold**: Only chunks with similarity ≥ 0.7 (70%) pass through — this prevents irrelevant content from being used
- **Hard gate**: If zero chunks pass the threshold, the AI is NEVER called — a fixed refusal message is returned instead

#### 4. Answer Generation
- **File**: `lib/rag/generateAnswer.ts`
- **What it does**: Sends the question + retrieved chunks to GPT-4o-mini with a strict system prompt
- **System prompt** instructs the model to:
  - Use ONLY the provided source excerpts
  - Cite sources with `[1]`, `[2]` markers
  - Never use outside knowledge
  - Say "I don't know" if sources are insufficient
- **Temperature 0.3**: Low temperature = more deterministic, factual responses
- **Citation parsing**: After the AI responds, regex extracts all `[n]` markers and maps them to real chunk metadata (document name, page number, chunk ID)

#### 5. Token Usage Tracking
- **File**: `lib/tokenTracking.ts`
- Every OpenAI API call logs its token consumption to a `token_usage` table
- Three categories tracked: `embedding_document`, `embedding_query`, `generation`
- Displayed in the Settings page as a visual bar chart

### Key AI Design Decisions

| Decision | Why |
|---|---|
| **Retrieval before Generation** | The AI only sees relevant document chunks, not the entire document — this improves accuracy and reduces cost |
| **Similarity threshold (0.7)** | Prevents the AI from generating answers from marginally related content |
| **Hard refusal gate** | If no chunks are relevant enough, the AI is never called — no hallucinated answers |
| **Citation parsing (not AI-generated)** | Citation markers `[n]` are parsed programmatically and mapped to real metadata — the AI doesn't generate the links |
| **Paragraph-aware chunking** | Chunks respect paragraph boundaries so context isn't split mid-sentence |
| **75-token overlap** | Adjacent chunks share ~75 tokens of context to prevent information loss at boundaries |
| **Batched embeddings** | 50 chunks per API call instead of 1-by-1, reducing latency and cost |

---

## Technology Stack

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| **Next.js** | 16.2.10 | Full-stack React framework (App Router) |
| **React** | 19.2.4 | UI library |
| **TypeScript** | 5.x | Type safety |
| **Tailwind CSS** | 4.x | Utility-first styling |
| **shadcn/ui** | 4.16.1 | Accessible UI components (Card, Button, etc.) |
| **Recharts** | 3.9.2 | Token usage charts |
| **Lucide React** | 1.28.0 | Icon library |

### Backend (all serverless via Next.js API routes)
| Technology | Purpose |
|---|---|
| **Next.js API Routes** | RESTful endpoints (`/api/documents`, `/api/chat`, etc.) |
| **Next.js Proxy** | Session refresh + route protection (replaces middleware in v16) |
| **Zod** | Request validation schemas |

### Database & Storage
| Technology | Purpose |
|---|---|
| **Supabase** (PostgreSQL) | Database for users, documents, chunks, conversations, messages |
| **Supabase pgvector** | Vector similarity search for document chunk retrieval |
| **Supabase Storage** | Secure file storage with per-user RLS policies |
| **Supabase Auth** | Email/password authentication with JWT sessions |
| **Row Level Security (RLS)** | Every table has policies ensuring users only see their own data |

### AI / ML
| Technology | Purpose |
|---|---|
| **OpenAI API** | Embedding generation + answer generation |
| **text-embedding-3-small** | 1536-dim embeddings for semantic search |
| **GPT-4o-mini** | Fast, cost-effective answer generation with citations |
| **js-tiktoken** | Accurate token counting for chunk sizing |
| **pdfjs-dist** | PDF text extraction (page-aware) |

### Deployment
| Technology | Purpose |
|---|---|
| **Vercel** | Hosting, serverless functions, automatic deploys from GitHub |
| **GitHub** | Source code repository, triggers Vercel builds on push |

---

## Project File Structure

```
AskMyDocs/
├── app/                          # Next.js App Router pages
│   ├── api/
│   │   ├── chat/route.ts         # POST — ask questions, get cited answers
│   │   ├── conversations/        # GET list, POST create, GET/DELETE by ID
│   │   ├── documents/            # GET list, POST upload, DELETE by ID
│   │   └── usage/route.ts        # GET — token usage stats
│   ├── auth/callback/route.ts    # OAuth callback handler
│   ├── chat/page.tsx             # Chat interface
│   ├── documents/page.tsx        # Document upload & list
│   ├── history/page.tsx          # Conversation history
│   ├── login/page.tsx            # Login form
│   ├── settings/page.tsx         # Profile, usage, session management
│   ├── signup/page.tsx           # Registration form
│   └── page.tsx                  # Landing page
│
├── components/
│   ├── layout/AppShell.tsx       # Sidebar, nav, user profile, idle timeout
│   ├── chat/                     # ChatPanel, MessageBubble, SourcesPanel
│   └── documents/                # DocumentCard, DocumentList, StatusBadge
│
├── lib/
│   ├── rag/                      # The RAG pipeline
│   │   ├── extractText.ts        # PDF/TXT/MD text extraction
│   │   ├── chunkText.ts          # Paragraph-aware chunking (~500 tokens)
│   │   ├── embedChunks.ts        # Batched OpenAI embedding + DB insert
│   │   ├── retrieveChunks.ts     # Query embedding + pgvector search
│   │   ├── generateAnswer.ts     # GPT-4o-mini generation + citation parsing
│   │   └── processDocument.ts    # Orchestrator: extract → chunk → embed
│   │
│   ├── supabase/
│   │   ├── client.ts             # Browser-side Supabase client
│   │   ├── server.ts             # Server-side client + service role client
│   │   ├── storage.ts            # Upload/download/delete from Storage
│   │   ├── schema.sql            # Full database schema
│   │   └── match_chunks.sql      # pgvector similarity search function
│   │
│   ├── openai/client.ts          # OpenAI client singleton
│   └── tokenTracking.ts          # Token usage logging
│
├── proxy.ts                      # Next.js 16 proxy (session refresh + auth guard)
└── package.json
```

---

## Database Schema (Key Tables)

| Table | Purpose | Key Columns |
|---|---|---|
| `documents` | Uploaded file metadata | `id`, `user_id`, `filename`, `file_type`, `status`, `storage_path`, `page_count` |
| `document_chunks` | Processed text chunks with embeddings | `id`, `document_id`, `content`, `chunk_index`, `page_number`, `token_count`, `embedding` (vector 1536) |
| `conversations` | Chat session metadata | `id`, `user_id`, `title`, `created_at` |
| `messages` | Individual chat messages | `id`, `conversation_id`, `role`, `content`, `citations`, `retrieved_chunks` |
| `token_usage` | API token consumption logs | `id`, `user_id`, `usage_type`, `token_count` |

All tables have **Row Level Security (RLS)** enabled — users can only access their own data.

---

## Security Features

1. **Authentication**: Supabase Auth with email/password, JWT tokens
2. **Row Level Security**: Every database table isolated per user
3. **Storage Policies**: Files stored in user-scoped folders, RLS enforced
4. **Server-side Route Protection**: Proxy redirects unauthenticated requests
5. **Idle Session Timeout**: 30 min inactivity → auto sign-out
6. **Global Sign Out**: Revoke all sessions across all devices
7. **Input Validation**: Zod schemas validate all API request bodies
8. **Service Role Isolation**: Admin operations use a separate Supabase client that bypasses RLS, never exposed to the frontend
