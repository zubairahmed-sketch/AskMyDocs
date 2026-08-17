-- match_chunks: pgvector cosine similarity search RPC
-- Run this in the Supabase SQL Editor after schema.sql

create or replace function match_chunks(
  query_embedding text,
  match_count int default 8,
  filter_user_id uuid default null,
  filter_document_ids uuid[] default null
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  chunk_index int,
  page_number int,
  token_count int,
  similarity float,
  filename text
)
language plpgsql
as $$
begin
  return query
  select
    dc.id,
    dc.document_id,
    dc.content,
    dc.chunk_index,
    dc.page_number,
    dc.token_count,
    1 - (dc.embedding <=> query_embedding::vector) as similarity,
    d.filename
  from document_chunks dc
  join documents d on d.id = dc.document_id
  where dc.user_id = filter_user_id
    and (filter_document_ids is null or dc.document_id = any(filter_document_ids))
    and dc.embedding is not null
  order by dc.embedding <=> query_embedding::vector
  limit match_count;
end;
$$;
