-- AskMyDocs Database Schema
-- Run this in the Supabase SQL Editor
-- Order matters: create tables in dependency order

-- 1. Enable the vector extension
create extension if not exists vector;

-- 2. Documents table: one row per upload
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  filename text not null,
  file_type text not null,           -- 'pdf' | 'txt' | 'md'
  storage_path text not null,        -- Supabase Storage object path
  status text default 'processing',  -- 'processing' | 'ready' | 'failed'
  page_count int,
  error_message text,
  created_at timestamptz default now()
);

alter table documents enable row level security;

create policy "Users can view their own documents"
  on documents for select
  using (user_id = auth.uid());

create policy "Users can insert their own documents"
  on documents for insert
  with check (user_id = auth.uid());

create policy "Users can update their own documents"
  on documents for update
  using (user_id = auth.uid());

create policy "Users can delete their own documents"
  on documents for delete
  using (user_id = auth.uid());


-- 3. Document chunks table: the retrievable unit, one row per chunk
create table if not exists document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade not null,
  user_id uuid references auth.users not null,
  content text not null,
  chunk_index int not null,
  page_number int,                   -- null for txt/md
  token_count int,
  embedding vector(1536),            -- text-embedding-3-small dimension
  created_at timestamptz default now()
);

-- HNSW index for cosine similarity search
create index on document_chunks using hnsw (embedding vector_cosine_ops);

alter table document_chunks enable row level security;

create policy "Users can view their own chunks"
  on document_chunks for select
  using (user_id = auth.uid());

create policy "Users can insert their own chunks"
  on document_chunks for insert
  with check (user_id = auth.uid());

create policy "Users can delete their own chunks"
  on document_chunks for delete
  using (user_id = auth.uid());


-- 4. Conversations table: a saved Q&A session
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text,                        -- derived from the first question asked
  scope_document_ids uuid[],         -- null/empty = search across all documents
  created_at timestamptz default now()
);

alter table conversations enable row level security;

create policy "Users can view their own conversations"
  on conversations for select
  using (user_id = auth.uid());

create policy "Users can insert their own conversations"
  on conversations for insert
  with check (user_id = auth.uid());

create policy "Users can update their own conversations"
  on conversations for update
  using (user_id = auth.uid());

create policy "Users can delete their own conversations"
  on conversations for delete
  using (user_id = auth.uid());


-- 5. Messages table: each question and answer, with full citation data
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade not null,
  role text not null,                -- 'user' | 'assistant'
  content text not null,
  citations jsonb,                   -- [{marker, chunk_id, document_id, filename, page_number, similarity, excerpt}]
  retrieved_chunks jsonb,            -- full retrieved set (even uncited ones), for the Sources panel
  created_at timestamptz default now()
);

alter table messages enable row level security;

-- Messages inherit access through conversation ownership
create policy "Users can view messages in their conversations"
  on messages for select
  using (
    exists (
      select 1 from conversations
      where conversations.id = messages.conversation_id
      and conversations.user_id = auth.uid()
    )
  );

create policy "Users can insert messages in their conversations"
  on messages for insert
  with check (
    exists (
      select 1 from conversations
      where conversations.id = messages.conversation_id
      and conversations.user_id = auth.uid()
    )
  );


-- 6. Token usage logs: powers the cost dashboard
create table if not exists token_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  call_type text not null,           -- 'embedding_document' | 'embedding_query' | 'generation'
  tokens_used int not null,
  created_at timestamptz default now()
);

alter table token_usage_logs enable row level security;

create policy "Users can view their own usage logs"
  on token_usage_logs for select
  using (user_id = auth.uid());

create policy "Users can insert their own usage logs"
  on token_usage_logs for insert
  with check (user_id = auth.uid());


-- 7. Create the documents storage bucket (run separately if needed)
-- In Supabase Dashboard: Storage > Create bucket named "documents" (private)
-- Then add RLS policies for the storage bucket:
-- insert: (bucket_id = 'documents') AND (auth.uid()::text = (storage.foldername(name))[1])
-- select: (bucket_id = 'documents') AND (auth.uid()::text = (storage.foldername(name))[1])
-- delete: (bucket_id = 'documents') AND (auth.uid()::text = (storage.foldername(name))[1])
