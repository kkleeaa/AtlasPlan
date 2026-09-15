create extension if not exists pgcrypto;

create table if not exists public.cached_resources (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in ('flashcards', 'communication_board', 'sequence')),
  search_slug text not null unique,
  title text not null default '',
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists cached_resources_resource_type_idx
  on public.cached_resources (resource_type);

create index if not exists cached_resources_created_at_idx
  on public.cached_resources (created_at desc);
