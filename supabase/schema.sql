-- Run this in Supabase SQL Editor.
-- This schema enforces "user can only access own data" using RLS.

create extension if not exists pgcrypto;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  source_lang text not null default '自动检测',
  target_lang text not null default '简体中文',
  source_file_name text,
  source_file_path text,
  exported_file_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  page_number integer not null,
  width double precision not null default 0,
  height double precision not null default 0,
  original_image_url text,
  blocks_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, page_number)
);

create table if not exists public.annotations (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  page_number integer not null,
  block_id text not null,
  start_offset integer not null,
  end_offset integer not null,
  selected_text text not null,
  note text not null default '',
  color text not null default '#fde68a',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  scope_kind text not null check (scope_kind in ('document', 'page', 'selection')),
  scope_key text not null,
  page_number integer,
  block_id text,
  selected_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, scope_key)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  role text not null check (role in ('user', 'model')),
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_documents_user_id on public.documents(user_id);
create index if not exists idx_document_pages_document on public.document_pages(document_id, page_number);
create index if not exists idx_annotations_document on public.annotations(document_id, page_number);
create index if not exists idx_chat_threads_document on public.chat_threads(document_id, scope_key);
create index if not exists idx_chat_messages_thread on public.chat_messages(thread_id, created_at);

alter table public.documents enable row level security;
alter table public.document_pages enable row level security;
alter table public.annotations enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists documents_owner_select on public.documents;
drop policy if exists documents_owner_insert on public.documents;
drop policy if exists documents_owner_update on public.documents;
drop policy if exists documents_owner_delete on public.documents;

create policy documents_owner_select on public.documents
for select using (auth.uid() = user_id);

create policy documents_owner_insert on public.documents
for insert with check (auth.uid() = user_id);

create policy documents_owner_update on public.documents
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy documents_owner_delete on public.documents
for delete using (auth.uid() = user_id);

drop policy if exists pages_owner_all on public.document_pages;
create policy pages_owner_all on public.document_pages
for all using (
  exists (
    select 1 from public.documents d
    where d.id = document_id and d.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.documents d
    where d.id = document_id and d.user_id = auth.uid()
  )
);

drop policy if exists annotations_owner_all on public.annotations;
create policy annotations_owner_all on public.annotations
for all using (
  exists (
    select 1 from public.documents d
    where d.id = document_id and d.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.documents d
    where d.id = document_id and d.user_id = auth.uid()
  )
);

drop policy if exists chat_threads_owner_all on public.chat_threads;
create policy chat_threads_owner_all on public.chat_threads
for all using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists chat_messages_owner_all on public.chat_messages;
create policy chat_messages_owner_all on public.chat_messages
for all using (
  exists (
    select 1 from public.chat_threads t
    where t.id = thread_id and t.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.chat_threads t
    where t.id = thread_id and t.user_id = auth.uid()
  )
);

insert into storage.buckets (id, name, public)
values ('user-documents', 'user-documents', false)
on conflict (id) do nothing;

drop policy if exists storage_user_documents_select on storage.objects;
drop policy if exists storage_user_documents_insert on storage.objects;
drop policy if exists storage_user_documents_update on storage.objects;
drop policy if exists storage_user_documents_delete on storage.objects;

create policy storage_user_documents_select on storage.objects
for select using (
  bucket_id = 'user-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy storage_user_documents_insert on storage.objects
for insert with check (
  bucket_id = 'user-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy storage_user_documents_update on storage.objects
for update using (
  bucket_id = 'user-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'user-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy storage_user_documents_delete on storage.objects
for delete using (
  bucket_id = 'user-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);
