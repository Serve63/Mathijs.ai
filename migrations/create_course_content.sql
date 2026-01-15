create table if not exists public.course_content (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz default now()
);

create or replace function public.set_course_content_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists course_content_updated_at on public.course_content;
create trigger course_content_updated_at
before update on public.course_content
for each row execute procedure public.set_course_content_updated_at();


