-- Enable vector extension
create extension if not exists vector;

-- Collections (group documents by project)
create table collections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  icon text default '📁',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Documents (uploaded files)
create table documents (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid references collections(id) on delete cascade,
  name text not null,
  file_path text,
  file_type text,
  file_size bigint,
  content text,
  metadata jsonb default '{}',
  status text default 'processing' check (status in ('processing', 'ready', 'error')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Document chunks with embeddings
create table document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding vector(1536),
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- Create index for vector similarity search
create index on document_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Memory entries (synced from MEMORY.md and daily files)
create table memory_entries (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  content text not null,
  entry_date date,
  tags text[] default '{}',
  pinned boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Chat history
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- RLS policies
alter table collections enable row level security;
alter table documents enable row level security;
alter table document_chunks enable row level security;
alter table memory_entries enable row level security;
alter table chat_messages enable row level security;

-- For now, allow all access (single user app)
create policy "Allow all" on collections for all using (true);
create policy "Allow all" on documents for all using (true);
create policy "Allow all" on document_chunks for all using (true);
create policy "Allow all" on memory_entries for all using (true);
create policy "Allow all" on chat_messages for all using (true);

-- Function for semantic search
create or replace function match_document_chunks(
  query_embedding vector(1536),
  match_count int default 5,
  filter_collection_id uuid default null
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    dc.id,
    dc.document_id,
    dc.content,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  join documents d on d.id = dc.document_id
  where (filter_collection_id is null or d.collection_id = filter_collection_id)
  order by dc.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Create storage bucket for uploaded files
insert into storage.buckets (id, name, public) values ('documents', 'documents', false);
