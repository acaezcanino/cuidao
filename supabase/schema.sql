-- Cuidao database (run once in Supabase → SQL Editor → New query → Run)
--
-- HACKATHON DEMO SETUP. These policies let anyone who has your publishable key
-- read and write rows. That's fine for a demo with FICTIONAL data, but NOT for
-- real patients. Next step after the hackathon: add Supabase Auth and
-- per-user policies (each senior sees their own rows, caregivers see only
-- linked seniors).

create table if not exists public.medications (
  id          uuid primary key default gen_random_uuid(),
  household   text not null,              -- groups a senior + their caregivers
  name        text not null,
  dose        text not null default '',
  strength    text not null default '',   -- e.g. "50 mg"
  time        text not null,              -- "HH:MM", 24-hour
  active      boolean not null default true, -- false = no longer taken (kept for the record)
  stopped_on  text,                       -- "YYYY-MM-DD" it became inactive
  stock       integer,                    -- pills on hand (null = not tracked)
  low_at      integer not null default 7, -- warn the caregiver at this many left
  per_dose    integer not null default 1, -- pills taken per dose
  created_at  timestamptz not null default now()
);

create table if not exists public.dose_events (
  id          uuid primary key default gen_random_uuid(),
  household   text not null,
  med_id      uuid not null references public.medications(id) on delete cascade,
  med_name    text not null,
  type        text not null check (type in ('due', 'started', 'completed', 'missed', 'snoozed', 'verified', 'skipped', 'lowstock')),
  date        text not null,              -- "YYYY-MM-DD"
  remaining   integer,                    -- lowstock only: pills left
  created_at  timestamptz not null default now()
);

-- Each step happens once per dose, except 'snoozed' (up to 2 per dose, enforced by the app).
create unique index if not exists dose_events_once_per_step
  on public.dose_events (med_id, date, type) where type <> 'snoozed';

alter table public.medications enable row level security;
alter table public.dose_events  enable row level security;

-- Demo-only policies (see warning above)
create policy "demo: read meds"    on public.medications for select to anon using (true);
create policy "demo: add meds"     on public.medications for insert to anon with check (true);
create policy "demo: delete meds"  on public.medications for delete to anon using (true);
create policy "demo: update meds"  on public.medications for update to anon using (true) with check (true);

create policy "demo: read events"   on public.dose_events for select to anon using (true);
create policy "demo: add events"    on public.dose_events for insert to anon with check (true);
create policy "demo: delete events" on public.dose_events for delete to anon using (true);

-- Turn on Realtime so the caregiver screen updates instantly
alter publication supabase_realtime add table public.medications, public.dose_events;

-- Fictional starter medications for the demo
insert into public.medications (household, name, strength, dose, time, stock, low_at, active, stopped_on) values
  ('demo-family', 'Losartán',     '50 mg',  '1 tableta',            '08:00', 30, 7, true,  null),
  ('demo-family', 'Metformina',   '500 mg', '1 tableta con comida', '13:00', 60, 7, true,  null),
  ('demo-family', 'Simvastatina', '20 mg',  '1 tableta',            '21:00',  8, 7, true,  null),
  ('demo-family', 'Amoxicilina',  '500 mg', '1 cápsula',            '14:00',  0, 0, false, to_char(now() - interval '20 days', 'YYYY-MM-DD'));

-- ---------------------------------------------------------------------------
-- MIGRATION (only if you created the tables before the camera check / snooze
-- existed). Run once in the SQL Editor:
--
--   alter table public.dose_events drop constraint if exists dose_events_type_check;
--   alter table public.dose_events add constraint dose_events_type_check
--     check (type in ('due', 'started', 'completed', 'missed', 'snoozed', 'verified', 'skipped', 'lowstock'));
--   alter table public.dose_events add column if not exists remaining integer;
--   alter table public.medications add column if not exists strength text not null default '';
--   alter table public.medications add column if not exists active boolean not null default true;
--   alter table public.medications add column if not exists stopped_on text;
--   alter table public.medications add column if not exists stock integer;
--   alter table public.medications add column if not exists low_at integer not null default 7;
--   alter table public.medications add column if not exists per_dose integer not null default 1;
--   create policy "demo: update meds" on public.medications for update to anon using (true) with check (true);
--   alter table public.dose_events drop constraint if exists dose_events_med_id_date_type_key;
--   create unique index if not exists dose_events_once_per_step
--     on public.dose_events (med_id, date, type) where type <> 'snoozed';
