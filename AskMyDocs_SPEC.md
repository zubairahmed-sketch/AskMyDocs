# AskMyDocs — RAG Pipeline with Citations — Build Spec (v1, scoped for a 3–4 week solo build)

**Working name:** AskMyDocs
**One-liner:** Upload PDFs or notes, ask questions in plain language, and get answers grounded in your own documents — every claim traceable to a specific chunk and page, with a built-in refusal path when the documents simply don't contain the answer.

**A note on the stack before you read further:** your original brief listed Next.js/FastAPI, pgvector or Pinecone, LangChain, and OpenAI/Gemini. This spec picks one option from each choice and explains why in section 8 — short version: Next.js API routes only (no separate Python backend), pgvector inside the Supabase Postgres you already use (no new vendor), raw OpenAI API calls instead of LangChain (so you can explain every step of retrieval in an interview without gesturing at a framework), and OpenAI as the primary provider with Gemini noted as an easy swap. If a specific job posting wants LangChain or Pinecone experience specifically, section 11 covers porting either piece over later — it's a clean swap, not a rebuild.

---

## 1. The Problem This Solves

Everyone who lists "RAG" as a skill has read about chunking and vector search. Almost nobody who lists it has had to answer the actual hard question in an interview: **what does your system do when the retrieved context doesn't actually contain the answer?**

Most toy RAG demos skip this entirely — they always generate an answer, whether or not the retrieval step found anything useful, which means they hallucinate confidently exactly when it matters most. This project's entire reason for existing is to have a real, working answer to that question: a similarity threshold that gates whether generation even runs, and a generation prompt that's instructed — and structurally supported by citations — to say "I don't know" when the evidence isn't there.

That single design decision is the thesis of this project, the same way "overwrite the summary, don't append it" was the thesis of the Memory Engine. Everything below serves it.

---

## 2. Target Use Case

A personal document Q&A tool: upload lecture notes, contracts, research papers, or your own writing, then ask questions and get answers with inline citation markers — `[1]`, `[2]` — that map to the exact document and page they came from. A **Sources panel** sits next to every answer, showing exactly which chunks were retrieved, their similarity scores, and which ones the model actually cited. This panel is your best demo screen, the same way the Memory Engine's "Context used in this reply" panel was its best screen.

---

## 3. Core Features (MVP Scope)

| # | Feature | Notes |
|---|---|---|
| 1 | Auth | Email/password + Google OAuth via Supabase Auth |
| 2 | Document upload | PDF, TXT, and Markdown; stored in Supabase Storage |
| 3 | Text extraction | Page-aware extraction for PDFs (page number preserved per chunk) |
| 4 | Chunking | Paragraph-aware splitting, ~500 tokens per chunk, ~75 token overlap, tracked with `chunk_index` and `page_number` |
| 5 | Embedding | Batched calls to `text-embedding-3-small`, stored as `pgvector` rows |
| 6 | Document library | List of uploads with processing status (processing / ready / failed), delete with cascade |
| 7 | Scoped querying | Ask across all documents or restrict to specific ones |
| 8 | Retrieval with threshold | Cosine similarity search via pgvector, top-K, filtered by a minimum similarity score |
| 9 | Grounded generation | Answer generated only from retrieved chunks, with inline `[n]` citation markers |
| 10 | Refusal path | If no chunk clears the threshold, skip generation and return a direct "not found in your documents" response |
| 11 | Sources panel | Shows every retrieved chunk (score, excerpt, doc, page), highlights which were actually cited |
| 12 | Conversation history | Saved Q&A sessions, revisitable |
| 13 | Token usage dashboard | Tracks embedding + generation cost over time |
| 14 | Settings | Export data (JSON), delete account |

**Explicitly out of scope for v1** (see section 11 — Future Work): DOCX/URL ingestion, OCR for scanned PDFs, semantic/topic-based chunking, hybrid search (BM25 + vector), re-ranking models, streaming token-by-token responses, multi-turn query reformulation for follow-up questions, Pinecone, LangChain, Gemini provider abstraction.

---

## 4. Retrieval & Grounding Architecture (this is the part that matters)

### Flow — Ingestion

```
Upload (PDF / TXT / MD)
     |
     v
Store file in Supabase Storage, insert `documents` row, status = 'processing'
     |  (respond to the client immediately — don't block on the pipeline below)
     v
[Extract] page-aware text extraction (pdfjs-dist for PDFs; page_number = null for TXT/MD)
     |
     v
[Chunk] paragraph-aware split, ~500 tokens/chunk, ~75 token overlap
     |   each chunk keeps: document_id, chunk_index, page_number, content, token_count
     v
[Embed] batch call to text-embedding-3-small (50-100 chunks per call, not one call per chunk)
     |
     v
Insert into document_chunks (content + embedding vector), update documents.status = 'ready'
```

### Flow — Query

```
User question + scope (all docs, or specific document_ids)
     |
     v
[Call 1: Embed the question] text-embedding-3-small -> log tokens
     |
     v
[Retrieve] pure SQL: pgvector cosine distance (<=>) against document_chunks
     |         WHERE user_id = auth.uid() AND document_id scoped as requested
     |         ORDER BY distance LIMIT 8
     v
Filter: drop any chunk with similarity < 0.7 (i.e. cosine distance > 0.3)
     |
     +---- zero chunks survive ----> return "not found in your documents" directly, skip Call 2
     |
     v (at least one chunk survives)
[Call 2: Generate] chunks formatted as numbered sources -> gpt-4o-mini
     |    instructed: answer ONLY from provided sources, cite inline as [n],
     |    say so directly if sources don't fully cover the question
     v
Parse [n] markers in the response -> map back to chunk metadata
     |
     v
Save to messages (content + citations jsonb), log tokens (call_type: 'generation')
     |
     v
Return answer + full retrieved-chunk list to frontend for the Sources panel
```

### Why this matters technically

- **The threshold check is a hard gate, not a suggestion.** Retrieval and generation are two separate steps precisely so the system can decide, in code, whether generation should even run — this is impossible if you let one big prompt do embedding-adjacent reasoning and answer generation together.
- **Retrieval is SQL, not an LLM call.** Only the question itself needs embedding (one small API call); ranking the chunks against it is a plain cosine-distance query against Postgres. This is the same principle as "context assembly is a DB query" from the ProposalForge project — the intelligence lives in the query and the schema, not in asking a model to guess what's relevant.
- **Citations are structural, not decorative.** Because every chunk carries `document_id`, `chunk_index`, and `page_number` from the moment it's created, mapping a `[n]` marker back to "Contract.pdf, page 4" is a lookup, not a best-effort guess. This is what makes the citations trustworthy enough to click through and verify — the actual bar for "citation-grounded," not just naming chunks that sound plausible.
- **Batched embeddings matter at real-document scale.** A 40-page PDF might produce 150+ chunks; embedding them one at a time is 150 API round trips for no benefit, since the embeddings endpoint accepts an array natively.

---

## 5. Database Schema (Supabase / Postgres)

```sql
-- enable the vector extension once per project
create extension if not exists vector;

-- documents: one row per upload
documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  filename text not null,
  file_type text not null,           -- 'pdf' | 'txt' | 'md'
  storage_path text not null,        -- Supabase Storage object path
  status text default 'processing',  -- 'processing' | 'ready' | 'failed'
  page_count int,
  error_message text,
  created_at timestamptz default now()
);

-- document_chunks: the retrievable unit, one row per chunk
document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  user_id uuid references auth.users,
  content text not null,
  chunk_index int not null,
  page_number int,                   -- null for txt/md
  token_count int,
  embedding vector(1536),            -- text-embedding-3-small dimension
  created_at timestamptz default now()
);

-- HNSW index for cosine similarity search (fine to add even at small scale — good practice)
create index on document_chunks using hnsw (embedding vector_cosine_ops);

-- conversations: a saved Q&A session
conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  title text,                        -- derived from the first question asked
  scope_document_ids uuid[],         -- null/empty = search across all documents
  created_at timestamptz default now()
);

-- messages: each question and answer, with full citation data
messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  role text not null,                -- 'user' | 'assistant'
  content text not null,
  citations jsonb,                   -- [{marker, chunk_id, document_id, filename, page_number, similarity, excerpt}]
  retrieved_chunks jsonb,             -- full retrieved set (even uncited ones), for the Sources panel
  created_at timestamptz default now()
);

-- token_usage_logs: powers the cost dashboard
token_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  call_type text not null,           -- 'embedding_document' | 'embedding_query' | 'generation'
  tokens_used int not null,
  created_at timestamptz default now()
);
```

Enable Row Level Security on every table — `user_id = auth.uid()`. `document_chunks` inherits access indirectly through `document_id`, but give it its own `user_id` column and policy too rather than joining through `documents` on every query — simpler policies, and the column is nearly free to keep in sync at insert time.

---

## 6. Backend Architecture

### Folder Structure (Next.js App Router — one runtime, one deploy target)

```
/app
  /api
    /documents/route.ts                 -> POST upload (multipart), GET list
    /documents/[id]/route.ts            -> GET status, DELETE (cascades chunks + storage object)
    /conversations/route.ts             -> GET list, POST create
    /conversations/[id]/route.ts        -> GET messages, DELETE
    /chat/route.ts                      -> POST ask a question
    /usage/route.ts                     -> GET token usage logs
    /settings/export/route.ts           -> GET full data export (JSON)
  /documents/page.tsx
  /chat/page.tsx
  /history/page.tsx
  /settings/page.tsx
/lib
  /supabase/client.ts, server.ts, storage.ts
  /openai/client.ts
  /rag/extractText.ts        -> pdfjs-dist page-by-page extraction; plain read for txt/md
  /rag/chunkText.ts          -> paragraph-aware chunking, ~500 tokens, ~75 token overlap, js-tiktoken for counting
  /rag/embedChunks.ts        -> batched embedding calls, inserts document_chunks
  /rag/retrieveChunks.ts     -> embed query (1 call) + pgvector SQL search + threshold filter — NO generation call here
  /rag/generateAnswer.ts     -> builds numbered-source prompt, calls gpt-4o-mini, parses [n] citations
  /tokenTracking.ts          -> logs token_usage_logs after every OpenAI call
/components
  /documents/UploadZone.tsx, DocumentCard.tsx, DocumentList.tsx, StatusBadge.tsx
  /chat/ChatWindow.tsx, MessageBubble.tsx, CitationMarker.tsx, SourcesPanel.tsx, ScopeSelector.tsx
  /history/ConversationList.tsx
  /dashboard/UsageChart.tsx
  /ui/ (shadcn components)
```

### API Routes

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/documents` | Upload file → store → insert `documents` row → kick off ingestion pipeline |
| GET | `/api/documents` | List documents + status |
| DELETE | `/api/documents/[id]` | Delete document, cascades to chunks and storage |
| POST | `/api/conversations` | Create a new conversation |
| GET | `/api/conversations/[id]` | Fetch messages for a conversation |
| POST | `/api/chat` | Embed question → retrieve → threshold check → generate (or refuse) → save |
| GET | `/api/usage` | Token usage for the cost chart |
| GET | `/api/settings/export` | Full data export |

### Data Flow — "User uploads a document"

1. `UploadZone` POSTs the file to `/api/documents` (multipart).
2. Handler stores the file in Supabase Storage, inserts a `documents` row with `status = 'processing'`, and returns immediately — the client shouldn't wait on parsing a 40-page PDF.
3. `extractText()` runs (awaited server-side or fired async): page-by-page for PDFs via `pdfjs-dist`, whole-file read for TXT/MD.
4. `chunkText()` splits into ~500-token chunks with ~75-token overlap, preserving `page_number` and `chunk_index` per chunk.
5. `embedChunks()` batches all chunks into groups of ~50–100 and calls the embeddings endpoint per batch, not per chunk — inserts rows into `document_chunks`, logs tokens (`call_type: 'embedding_document'`).
6. `documents.status` updates to `'ready'` (or `'failed'` with `error_message` if extraction or embedding throws).
7. Frontend refetches document status to show processing → ready.

### Data Flow — "User asks a question"

1. Frontend POSTs `{conversation_id, question, scope_document_ids}` to `/api/chat`.
2. `retrieveChunks()`: embeds the question (Call 1, logs `'embedding_query'`), then runs a single SQL query — cosine distance `<=>` against `document_chunks`, filtered by `user_id` and optional `document_id` scope, ordered by distance, `LIMIT 8`. **No LLM call in the ranking step itself.**
3. Filter out any chunk with similarity below `0.7` (constant, tunable in one place).
4. If nothing survives the filter: skip `generateAnswer()` entirely, save and return a direct "I couldn't find anything in your documents that answers this" message. This path is a first-class outcome, not an error case.
5. Otherwise: `generateAnswer()` formats the surviving chunks as numbered sources, calls `gpt-4o-mini` with the grounding prompt (section 9), logs tokens (`'generation'`).
6. Parse `[n]` markers from the response, map each back to its chunk's `document_id`/`filename`/`page_number`, save as `citations` on the message — save the *full* retrieved set (cited or not) as `retrieved_chunks` for the Sources panel.
7. Return the answer plus the full retrieved-chunk list. `SourcesPanel` renders every retrieved chunk with its similarity score, highlighting the ones actually referenced in the answer.

---

## 7. Frontend UI / UX Design

### Design System
- **Tone:** precise and technical — this is a research/reference tool, not a personal journal or a sales-facing product. A "workbench," not a "diary."
- **Palette:** clean white or near-white background (`#FFFFFF` / light mode, `#0F172A` dark mode if you add a toggle), one accent — blue (`#2563EB`) or emerald (`#059669`) — slate text (`#1E293B`).
- **Typography:** "Inter" for UI and body text; a monospace face ("IBM Plex Mono" or "JetBrains Mono") specifically for citation markers, page numbers, and similarity scores — small detail, but it visually reinforces "this number is precise and checkable," which is the entire point of the project.
- **Components:** shadcn/ui (Button, Card, Dialog, Tabs, Badge, Progress, Accordion, Tooltip).

### Pages

**`/documents`** — drag-and-drop upload zone at the top; below it, a grid of document cards (filename, page count, status badge, upload date, delete button). Processing documents show a progress indicator, not just a static "processing" label.

**`/chat`** — the main screen. Scope selector at the top (All Documents / choose specific ones via checkboxes). Chat thread in the main column: question bubbles, answer bubbles with inline `[n]` citation markers rendered as small clickable badges. A right-hand **Sources panel** (collapsible on desktop, bottom sheet on mobile) lists every retrieved chunk — similarity score as a small bar or percentage, excerpt text, document name, page number — with cited chunks visually distinguished (highlighted border) from retrieved-but-unused ones. Clicking a `[n]` badge in the answer scrolls the panel to and highlights that exact chunk.

**`/history`** — list of past conversations (title derived from the first question), click to reopen the full thread with its original citations intact.

**`/settings`** — account, export data (JSON), delete account.

### Mobile
Single column below 768px. Sources panel becomes a bottom sheet triggered by tapping a citation badge, rather than a persistent sidebar. Bottom tab nav: Documents / Chat / History / Settings.

---

## 8. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 14+ (App Router), TypeScript | Same stack as your other two AI projects — consistent, reusable setup |
| Styling | TailwindCSS + shadcn/ui | Fast, professional, consistent component language across your projects |
| Backend | Next.js API Route Handlers only | **Deviation from your brief:** no separate FastAPI service. PDF parsing and embedding calls are both fine in Node — one runtime, one Vercel deploy, no cross-service auth to manage. Bring in Python later only if a job specifically wants a Python RAG sample. |
| Vector DB | pgvector inside Supabase Postgres | **Deviation from your brief:** Pinecone is a fine product, but it's a new vendor and a new mental model for something Postgres already does well at portfolio scale. You already run Supabase for the other two projects — this reuses that investment. Pinecone swap is a clean Future Work item if a job wants it specifically. |
| AI framework | Raw OpenAI API calls, no LangChain | **Deviation from your brief:** at this scope, LangChain's text splitters and retrievers wrap logic you can write yourself in less code — and in an interview, "I built the chunking and retrieval myself" is a stronger answer than "the framework did it." Your CV already lists LangChain as a skill from other exposure; this project's job is to prove you understand RAG mechanics directly. |
| AI provider | OpenAI — `text-embedding-3-small` for embeddings, `gpt-4o-mini` for generation | Cheap, fast, sufficient for structured extraction and grounded QA at this scope |
| PDF parsing | `pdfjs-dist` | Gives real page-by-page text extraction, which page-number citations depend on entirely — `pdf-parse` concatenates pages by default and needs extra work to avoid losing page boundaries |
| Token counting | `js-tiktoken` | Accurate chunk sizing against OpenAI's actual tokenizer, not a character-count approximation |
| Charts | Recharts | Token usage/cost chart |
| Deployment | Vercel + Supabase Cloud | Same deploy setup as your other two projects, zero hosting cost |

---

## 9. Prompts

**Generation (grounded answer with citations) — system prompt:**
> Answer the user's question using ONLY the numbered source excerpts below. When you use information from a source, cite it inline with its number in square brackets, like [1] or [2]. You may cite multiple sources for one sentence if needed. If the excerpts do not contain enough information to answer the question, say so directly and do not guess or use outside knowledge.
>
> Sources:
> [1] (Document: {filename}, Page {page_number}): {chunk_content}
> [2] (Document: {filename}, Page {page_number}): {chunk_content}
> ...
>
> Question: {user_question}

Keep this instruction — "say so directly and do not guess" — even though the numeric threshold already filters out clearly irrelevant chunks. The two checks catch different failure modes: the threshold catches "nothing came back that's even topically close," while the prompt instruction catches "the closest chunks are topically related but don't actually answer this specific question."

**Refusal response (no LLM call, just a template)** when zero chunks clear the threshold:
> "I couldn't find anything in the documents you've shared that addresses this question. You could try rephrasing it, or check that the relevant document has been uploaded and finished processing."

---

## 10. Build Phases

| Phase | Scope | Est. time |
|---|---|---|
| 1 | Auth, document upload + storage, page-aware text extraction, RLS | 3–4 days |
| 2 | Chunking (`chunkText.ts`) with token counting and overlap, chunk storage | 2–3 days |
| 3 | Batched embedding pipeline, `document_chunks` population, processing status | 3–4 days |
| 4 | Query embedding + pgvector similarity search + threshold filter (retrieval only, no generation yet — verify this stage in isolation before adding generation) | 3–4 days |
| 5 | Grounded generation, citation parsing, chat UI, Sources panel | 4–5 days |
| 6 | Conversation history, scope selector, token usage chart, settings, deploy | 3–4 days |

~3–4 weeks part-time. Phase 4 is worth pausing on deliberately — if retrieval quality is weak, no amount of prompt engineering in Phase 5 will fix it, so confirm the right chunks come back before writing a single line of the generation prompt.

---

## 11. Future Work (real ideas, deliberately not v1)

- **Pinecone as a swappable vector store** — implement a second `retrieveChunks` variant against Pinecone behind the same interface, and be able to talk through the tradeoffs (managed scaling and metadata filtering vs. one less service to run) instead of just naming both options.
- **LangChain implementation as a comparison branch** — rebuild `chunkText`/`retrieveChunks` using LangChain's text splitters and retrievers in a separate branch. Doing it *after* you've built it raw means you can genuinely compare them in an interview, rather than only having used the framework.
- **Multi-turn query reformulation** — condense the last few turns of conversation into a standalone query before embedding, so "what about the second one?" retrieves correctly. Real production RAG systems need this; v1 deliberately treats each question independently to keep retrieval behavior easy to reason about and debug.
- **Hybrid search** — combine keyword (BM25 / Postgres full-text search) with vector similarity, useful for exact terms (names, IDs, numbers) that embeddings alone sometimes miss.
- **Re-ranking model** — a lightweight cross-encoder re-rank of the top-20 retrieved chunks down to the final top-5, to squeeze out retrieval quality beyond raw cosine similarity.
- **OCR for scanned PDFs** and **DOCX/URL ingestion** — broaden input formats beyond text-native PDFs.
- **Streaming responses** — token-by-token output instead of waiting for the full generation call to complete.
- **Gemini provider swap** — abstract the embedding/generation calls behind a provider interface so OpenAI and Gemini are interchangeable.

---

## 12. CV Bullet & Interview Talking Points

**CV bullet:**
> Built a RAG pipeline — page-aware chunking, batched embeddings, pgvector similarity retrieval with a similarity threshold, and citation-grounded generation that declines to answer when retrieved context is insufficient — preventing hallucinated responses over user-uploaded documents.

**Be ready to answer:**
1. Why a similarity threshold instead of always returning the top-K chunks? *(Top-K alone always returns something, even when nothing is actually relevant — the model then either hallucinates or has to be trusted to notice on its own. A numeric gate makes "insufficient evidence" a first-class code path instead of hoping the prompt catches it.)*
2. Why chunk by paragraph with overlap instead of fixed character windows? *(Fixed windows can slice a sentence in half at a chunk boundary, losing meaning right where it matters; paragraph-aware splitting with overlap keeps semantic units mostly intact and still bounds chunk size.)*
3. Why track page number and chunk index from the very first ingestion step? *(Citations are only trustworthy if they're a lookup, not a guess — that requires the metadata to exist before generation ever runs, not reconstructed after the fact.)*
4. Why didn't you use LangChain? *(At this scope, hand-writing chunking and retrieval means I can explain every step precisely — including why the threshold sits where it does — rather than pointing at a framework default.)*
5. How would this scale to thousands of documents per user? *(The HNSW index already anticipates that; the main added cost is embedding storage and re-embedding on document updates, not the query pattern itself.)*

---

## 13. How to Use This With Copilot

Save this as `SPEC.md` at your repo root. In Copilot Chat:

> Using SPEC.md as the reference, scaffold a Next.js 14 App Router project with TypeScript, TailwindCSS, and Supabase auth. Start with Phase 1: auth, document upload with Supabase Storage, and page-aware text extraction using pdfjs-dist. Set up the database schema from section 5 first, including the vector extension and HNSW index.

Reference sections explicitly each session — "per SPEC.md section 4, the threshold filter has to reject the request before generateAnswer() is ever called, not inside the prompt" — since that exact detail is the one most likely to get quietly dropped if you're not explicit about it.
