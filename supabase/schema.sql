-- GeoComply deal platform demo: database
-- Everything the model learns from lives in past_deals. The live demo deal goes in deals.

-- 1. What the model learns from ------------------------------------------------
create table public.past_deals (
  id text primary key,                 -- opportunity number from the pipeline extract
  name text not null,                  -- short name used in the platform
  vertical text not null,
  industry_group text not null,        -- used for matching
  regions text[] not null default '{}',
  products text[] not null default '{}',
  source_type text not null,           -- first word of the lead source, used for matching
  source text,
  problem text not null,               -- the prospect's own words
  last_note text,                      -- last rep note
  status text,
  furthest_stage text,
  sticking_points text[] not null default '{}',  -- what it got stuck on, tagged by hand from the notes and transcripts
  held_out boolean not null default false        -- true for the demo deal, so the model never sees its answer
);

create table public.sticking_points (
  tag text primary key,
  label text not null,
  issue_id text,          -- links to a fix in the platform, if there is one
  topic_id text,          -- links to a marketing topic, if there is one
  keywords text,          -- if a logged call matches this pattern, the sticking point is happening now
  product text,           -- known product issue from support calls
  region text             -- ...only in this region
);

create table public.verticals (
  vertical text primary key,
  industry_group text not null
);

-- 2. The live demo deal and everything that happens to it ----------------------
create table public.deals (
  id text primary key,
  name text not null,
  account text,
  vertical text,
  profile text,
  regions text[] not null default '{}',
  products text[] not null default '{}',
  source text,
  acv text,
  problem text,
  stage text not null default 'Discovery',
  days_open int not null default 0,
  owner text not null default 'Lena Ortiz',
  eng_requested boolean not null default false,
  engineer text,
  closed_won boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.activities (
  id bigint generated always as identity primary key,
  deal_id text not null references public.deals(id) on delete cascade,
  kind text not null default 'call',
  subject text,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.model_runs (
  id bigint generated always as identity primary key,
  deal_id text not null references public.deals(id) on delete cascade,
  run_no int not null,
  compared int not null,
  neighbours jsonb not null,           -- every past deal with its match score, best first
  created_at timestamptz not null default now()
);

create table public.predictions (
  id bigint generated always as identity primary key,
  run_id bigint not null references public.model_runs(id) on delete cascade,
  deal_id text not null references public.deals(id) on delete cascade,
  tag text not null references public.sticking_points(tag),
  status text not null,                -- likely (potential stick) or now (stuck now)
  kind text not null,                  -- similar (from similar deals) or product (known product issue)
  raised boolean not null default false,  -- the buyer raised it on a logged call
  share numeric not null default 0,    -- share of the 5 closest deals' weight that hit this
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index on public.activities (deal_id);
create index on public.model_runs (deal_id);
create index on public.predictions (deal_id);

-- keep updated_at fresh
create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;
create trigger deals_touch before update on public.deals for each row execute function public.touch_updated_at();

-- 3. Reset button for rehearsals -------------------------------------------------
create function public.reset_demo() returns void language sql security definer set search_path = '' as $$
  delete from public.deals where id = 'NV-083';
$$;
grant execute on function public.reset_demo() to anon;

-- 4. Access: demo data only, so the public key may read everything and edit the demo deal
alter table public.past_deals enable row level security;
alter table public.sticking_points enable row level security;
alter table public.verticals enable row level security;
alter table public.deals enable row level security;
alter table public.activities enable row level security;
alter table public.model_runs enable row level security;
alter table public.predictions enable row level security;

create policy "read past deals" on public.past_deals for select to anon using (true);
create policy "read sticking points" on public.sticking_points for select to anon using (true);
create policy "read verticals" on public.verticals for select to anon using (true);
create policy "read deals" on public.deals for select to anon using (true);
create policy "create the demo deal" on public.deals for insert to anon with check (id = 'NV-083');
create policy "update the demo deal" on public.deals for update to anon using (id = 'NV-083') with check (id = 'NV-083');
create policy "read activities" on public.activities for select to anon using (true);
create policy "log calls on the demo deal" on public.activities for insert to anon with check (deal_id = 'NV-083');
create policy "read model runs" on public.model_runs for select to anon using (true);
create policy "read predictions" on public.predictions for select to anon using (true);
-- model_runs and predictions are written only by the predict function (service role)

-- 5. Live updates between the two sites
alter publication supabase_realtime add table public.deals, public.activities, public.model_runs, public.predictions;

-- 6. Seed data --------------------------------------------------------------------
insert into public.sticking_points (tag, label, issue_id, topic_id, keywords, product, region) values
  ('prompt', 'Permission prompt', 'prompt', 'notice', 'prompt|notic|without the user|without ever showing', null, null),
  ('oneapi', 'One API', 'oneapi', null, 'one api|integration doc', null, null),
  ('browser', 'Locked browser', 'browser', null, 'locked.?down browser', null, null),
  ('security', 'Security review', null, 'security', 'security review|questionnaire|vendor risk', null, null),
  ('price', 'Price against IP-only checks', null, 'ip', 'tenth of|cheaper|ip database', null, null),
  ('bots', 'Not seen as anti-bot', null, 'bots', 'anti-bot|bot-mitigation', null, null),
  ('selfserve', 'Wants self-serve', null, 'selfserve', 'self-serve|pay for by card', null, null),
  ('budget', 'No clear budget owner', null, null, 'who.?s paying|budget owner', null, null),
  ('legal', 'Legal review', null, null, 'legal wants|their legal', null, null),
  ('procurement', 'Approved vendor list', null, null, 'approved list', null, null),
  ('partial', 'Staging partials', 'partial', null, null, 'IDComply', null),
  ('dates', 'UK date format', 'dates', null, null, 'IDComply', 'UK');

insert into public.verticals (vertical, industry_group) values
  ('Online marketplace', 'Consumer apps'), ('Dating & social', 'Consumer apps'), ('Gig economy', 'Consumer apps'),
  ('Healthcare', 'Health'), ('Digital banking', 'Fintech'), ('Media & streaming', 'Media & events'),
  ('Government services', 'Government'), ('Charity & donations', 'Charity');

insert into public.past_deals (id, name, vertical, industry_group, regions, products, source_type, source, problem, last_note, status, furthest_stage, sticking_points, held_out) values
  ('NV-014', 'Neobank', 'Digital banking', 'Fintech', '{"CA"}', '{"Core","GeoGuard"}', 'Inbound', 'Inbound (webinar)', 'We''re seeing logins from three countries in an hour on the same account. Our fraud team finds out after the money''s gone.', 'Internal champion still loves it. Vendor risk questionnaire is on round 4.', 'Open, stalled', 'Security review', '{"security"}', false),
  ('NV-015', 'Crypto exchange', 'Crypto exchange', 'Fintech', '{"EU"}', '{"GeoGuard"}', 'Referral', 'Partner referral', 'New rules mean we have to prove we''re blocking users from restricted jurisdictions, not just say we are.', 'Bought for one market. Says expansion is ''next year''. Said the same thing last year.', 'Closed, won (single market)', 'Closed', '{}', false),
  ('NV-022', 'Sports broadcaster', 'Media & streaming', 'Media & events', '{"LATAM"}', '{"GeoGuard"}', 'Outbound', 'Outbound', 'Viewers outside our rights territory are watching our matches through VPNs and our rights holders are noticing.', 'Went with a basic IP database at roughly a tenth of our price. Their words: ''good enough for now.''', 'Closed, lost', 'Pricing', '{"price"}', false),
  ('NV-031', 'Dating app', 'Dating & social', 'Consumer apps', '{"US"}', '{"Core","IDComply"}', 'Inbound', 'Inbound (website form)', 'People lie about where they are. Some of them are running romance scams from overseas. We need to know who''s real without slowing down sign-up.', 'Product lead asked if it can run without the user ever noticing. Waiting on their legal and ours.', 'Open, stalled', 'Technical scoping', '{"prompt","legal"}', false),
  ('NV-041', 'Telehealth platform', 'Healthcare', 'Health', '{"US"}', '{"Core"}', 'Conference', 'Conference (HLTH)', 'Our doctors can only prescribe to patients physically in states where they''re licensed. Right now we trust a dropdown.', 'Third meeting, third stakeholder. Compliance thinks Product is paying; Product thinks Compliance is.', 'Open, stalled', 'Business case', '{"budget"}', false),
  ('NV-083', 'Resale marketplace', 'Online marketplace', 'Consumer apps', '{"US"}', '{"Core","IDComply"}', 'AEO', 'AEO (head of trust cited an AI-generated location compliance vendor list)', 'Sellers overseas pose as local sellers to get around our fees and our rules. Buyers only find out when the parcel arrives.', 'Wants to know if location can be checked without ever showing users a permission prompt.', 'Open, active', 'Technical scoping', '{"prompt"}', true),
  ('NV-099', 'Ticketing company', 'Ticketing & live events', 'Media & events', '{"US"}', '{"Core","GeoGuard"}', 'Referral', 'Inbound (referral from gaming client)', 'Presales for local fans get wiped out by bots and resellers in minutes.', 'Lost to a bot-mitigation vendor. They didn''t think of us as an anti-bot company.', 'Closed, lost', 'Proposal', '{"bots"}', false),
  ('NV-109', 'Youth social app', 'Social platform / online safety', 'Consumer apps', '{"UK","US"}', '{"IDComply","Core"}', 'Exec intro', 'Exec intro', 'New age-assurance laws are coming in both our markets and we have adults trying to get into spaces built for teenagers.', 'CEO joined the second call. Customer success asking who owns it post-pilot.', 'Closed, won (pilot)', 'Pilot', '{}', false),
  ('NV-123', 'Exam proctoring', 'Education', 'Education', '{"Global"}', '{"Core"}', 'Inbound', 'Inbound (website form)', 'Test-takers are sitting exams from countries where the credential isn''t valid, or using someone else in another room.', 'Their app runs inside a locked-down browser. Eng estimate is ~6 weeks to support it.', 'Open, stalled', 'Technical scoping', '{"browser"}', false),
  ('NV-134', 'Prediction market', 'Prediction markets', 'Fintech', '{"US"}', '{"Core","GeoGuard","IDComply"}', 'Inbound', 'Inbound (direct to CEO)', 'We''re launching in new states fast and the rules change month to month. We need to know where every trader is, every time.', 'Fastest inbound of the year. Legal wants a conversation before we send pricing.', 'Open, active', 'Pricing', '{"legal"}', false),
  ('NV-141', 'Cross-border payments', 'Payments', 'Fintech', '{"UK","EU"}', '{"GeoGuard","Core"}', 'AEO', 'AEO (asked an AI assistant how to stop VPN users opening accounts)', 'Our sanctions screening checks the IP address and that''s it. Our auditors have started asking whether that''s enough.', 'Arrived having already compared three vendors with an AI assistant.', 'Open, active', 'Discovery', '{}', false),
  ('NV-152', 'Crypto exchange, expansion', 'Crypto exchange', 'Fintech', '{"EU"}', '{"GeoGuard","IDComply"}', 'Existing', 'Existing customer', 'Our regulator in the next two markets is asking the same question, and now they want proof of who the user is too.', 'Expanded to two more markets and added identity. Signed five weeks after first call.', 'Closed, won (expansion)', 'Closed', '{}', false),
  ('NV-158', 'Consumer lender', 'Online lending', 'Fintech', '{"US"}', '{"IDComply","Core"}', 'Referral', 'Inbound (referral from fintech customer)', 'Synthetic identities are getting through our onboarding and defaulting on the first payment.', 'Started as an identity deal. Location added in month two once their fraud team saw the device signals.', 'Closed, won', 'Closed', '{}', false),
  ('NV-166', 'Sports streaming', 'Media & streaming', 'Media & events', '{"EU"}', '{"Core","GeoGuard"}', 'Inbound', 'Inbound (their legal team)', 'Our new league contract says we have to prove viewers are in-territory, not just try to block VPNs.', 'The rights contract did the selling. Moved from IP-only checks to Core.', 'Closed, won', 'Closed', '{}', false),
  ('NV-172', 'Benefits administrator', 'Health & benefits', 'Health', '{"US"}', '{"Core","IDComply"}', 'Referral', 'Referral from existing health customer', 'Members can only move large sums from states where we''re licensed, and we need an audit trail for it.', 'Second customer in the sector. Asked to copy the existing health customer''s setup.', 'Closed, won', 'Closed', '{}', false),
  ('NV-180', 'Licence renewals', 'Government services', 'Government', '{"CA"}', '{"Core","IDComply"}', 'AEO', 'AEO (procurement officer found us through an AI assistant)', 'Residents can renew online only while they live in the province. We have no way to check that today.', 'Formal RFP expected next quarter. Procurement says vendors must be named on a public approved list first.', 'Open, active', 'Discovery', '{"procurement"}', false),
  ('NV-184', 'Delivery platform', 'Gig economy', 'Consumer apps', '{"US","CA"}', '{"IDComply","Core","GeoGuard"}', 'Outbound', 'Outbound', 'Verified couriers are renting their accounts to people we''ve never checked. We need to know the person on the shift is the person we approved.', 'They asked for ''one API.'' We sent four integration docs. No reply in 6 weeks.', 'Open, stalled', 'Solution design', '{"oneapi"}', false),
  ('NV-191', 'Donation platform', 'Charity & donations', 'Charity', '{"US","UK"}', '{"GeoGuard"}', 'AEO', 'AEO (AI assistant answer to ''how to stop card testing on a donation form'')', 'Overseas fraudsters test stolen cards with tiny donations. Our processor is threatening to raise our fees.', 'Wanted a self-serve plan they could pay for by card that day. Went with a vendor that offers one.', 'Open, active', 'Proposal', '{"selfserve"}', false);
