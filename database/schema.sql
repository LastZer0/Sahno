-- Sahno MVP schema draft. Apply only to a dedicated Sahno Supabase project after review.
-- All monetary amounts are integer IRR. No demo event rows are inserted here.
create extension if not exists pgcrypto;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  created_at timestamptz not null default now()
);
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'pending' check(status in ('pending','verified','suspended')),
  created_at timestamptz not null default now()
);
create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('owner','manager','sales','entry')),
  primary key (organization_id,user_id)
);
create table public.staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check(role in ('admin','reviewer','finance','support'))
);
create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  address text not null,
  latitude numeric(9,6), longitude numeric(9,6)
);
create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  venue_id uuid not null references public.venues(id),
  title text not null,
  description text not null default '',
  hero_url text,
  status text not null default 'draft' check(status in ('draft','review','changes_requested','approved','published','cancelled')),
  created_at timestamptz not null default now()
);
create table public.event_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  starts_at timestamptz not null,
  sales_open boolean not null default false,
  unique(event_id,starts_at)
);
create table public.seat_sections (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  name text not null,
  unique(venue_id,name)
);
create table public.session_seats (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.event_sessions(id) on delete cascade,
  section_id uuid not null references public.seat_sections(id),
  seat_label text not null,
  price_irr bigint not null check(price_irr >= 10000),
  state text not null default 'available' check(state in ('available','held','sold','blocked')),
  hold_order_id uuid,
  hold_expires_at timestamptz,
  unique(session_id,seat_label)
);
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users(id),
  session_id uuid not null references public.event_sessions(id),
  amount_irr bigint not null check(amount_irr > 0),
  state text not null default 'awaiting_payment' check(state in ('awaiting_payment','paid','expired','cancelled','needs_reconciliation')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.session_seats add constraint hold_order_fk foreign key(hold_order_id) references public.orders(id);
create table public.order_seats (
  order_id uuid not null references public.orders(id),
  seat_id uuid not null references public.session_seats(id),
  price_irr bigint not null check(price_irr > 0),
  primary key(order_id,seat_id)
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  provider text not null,
  authority text not null unique,
  amount_irr bigint not null check(amount_irr > 0),
  state text not null default 'initiated' check(state in ('initiated','verified','failed','needs_reconciliation','refunded')),
  ref_id text unique,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  unique(order_id,provider)
);
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  seat_id uuid not null unique references public.session_seats(id),
  state text not null default 'valid' check(state in ('valid','used','cancelled')),
  issued_at timestamptz not null default now(),
  checked_in_at timestamptz,
  unique(order_id,seat_id)
);
create index on public.events(status);
create index on public.event_sessions(event_id,starts_at);
create index on public.session_seats(session_id,state,hold_expires_at);
create index on public.orders(buyer_id,created_at desc);
create index on public.payments(order_id,state);
create index on public.events(organization_id);
create index on public.events(venue_id);
create index on public.order_seats(seat_id);
create index on public.orders(session_id);
create index on public.organization_members(user_id);
create index on public.session_seats(hold_order_id) where hold_order_id is not null;
create index on public.session_seats(section_id);

-- All public tables have RLS and explicit grants. Writes use server-only functions.
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.staff_members enable row level security;
alter table public.venues enable row level security;
alter table public.events enable row level security;
alter table public.event_sessions enable row level security;
alter table public.seat_sections enable row level security;
alter table public.session_seats enable row level security;
alter table public.orders enable row level security;
alter table public.order_seats enable row level security;
alter table public.payments enable row level security;
alter table public.tickets enable row level security;
revoke all on public.profiles, public.organizations, public.organization_members, public.staff_members,
  public.venues, public.events, public.event_sessions, public.seat_sections, public.session_seats,
  public.orders, public.order_seats, public.payments, public.tickets from anon, authenticated;
grant select on public.venues, public.events, public.event_sessions, public.seat_sections to anon,authenticated;
grant select(id,session_id,section_id,seat_label,price_irr,state,hold_expires_at) on public.session_seats to anon,authenticated;
grant select on public.profiles, public.organizations, public.organization_members, public.staff_members,
  public.orders, public.order_seats, public.payments, public.tickets to authenticated;

create policy "published event catalog" on public.events for select to anon using (status='published');
create policy "authenticated event catalog" on public.events for select to authenticated using (
  status='published' or (select auth.uid()) in
  (select m.user_id from public.organization_members m where m.organization_id=events.organization_id)
);
create policy "venue catalog" on public.venues for select to anon,authenticated using (
  exists(select 1 from public.events e where e.venue_id=venues.id and e.status='published')
);
create policy "session catalog" on public.event_sessions for select to anon,authenticated using (
  exists(select 1 from public.events e where e.id=event_sessions.event_id and e.status='published')
);
create policy "section catalog" on public.seat_sections for select to anon,authenticated using (
  exists(select 1 from public.events e where e.venue_id=seat_sections.venue_id and e.status='published')
);
create policy "seat catalog" on public.session_seats for select to anon,authenticated using (
  exists(select 1 from public.event_sessions s join public.events e on e.id=s.event_id
  where s.id=session_seats.session_id and e.status='published')
);
create policy "own profile" on public.profiles for select to authenticated using (user_id=(select auth.uid()));
create policy "own membership" on public.organization_members for select to authenticated using (user_id=(select auth.uid()));
create policy "member organization" on public.organizations for select to authenticated using (
  exists(select 1 from public.organization_members m where m.organization_id=organizations.id and m.user_id=(select auth.uid()))
);
create policy "own staff role" on public.staff_members for select to authenticated using (user_id=(select auth.uid()));
create policy "own order" on public.orders for select to authenticated using (buyer_id=(select auth.uid()));
create policy "own order seats" on public.order_seats for select to authenticated using (
  exists(select 1 from public.orders o where o.id=order_seats.order_id and o.buyer_id=(select auth.uid()))
);
create policy "own payment" on public.payments for select to authenticated using (
  exists(select 1 from public.orders o where o.id=payments.order_id and o.buyer_id=(select auth.uid()))
);
create policy "own tickets" on public.tickets for select to authenticated using (
  exists(select 1 from public.orders o where o.id=tickets.order_id and o.buyer_id=(select auth.uid()))
);

-- Atomic server-side reservation. Execute only with the server secret key.
create function public.reserve_seats(p_buyer uuid,p_session uuid,p_seats uuid[])
returns public.orders language plpgsql security invoker set search_path='' as $$
declare v_event_status text; v_sales_open boolean; v_start timestamptz; v_order public.orders; v_seat public.session_seats; v_total bigint:=0; v_id uuid;
begin
  if p_buyer is null or p_seats is null or cardinality(p_seats) not between 1 and 6
    or cardinality(p_seats)<>(select count(distinct x) from unnest(p_seats) x) then
    raise exception 'invalid_seat_request';
  end if;
  select e.status,s.sales_open,s.starts_at into v_event_status,v_sales_open,v_start
  from public.event_sessions s join public.events e on e.id=s.event_id where s.id=p_session;
  if v_event_status is distinct from 'published' or not coalesce(v_sales_open,false) or v_start<=now() then
    raise exception 'sales_closed';
  end if;
  -- Lock in deterministic order. Competing purchases serialize on each seat.
  for v_id in select distinct x from unnest(p_seats) x order by x loop
    select * into v_seat from public.session_seats where id=v_id and session_id=p_session for update;
    if not found or v_seat.state in ('sold','blocked') or
       (v_seat.state='held' and v_seat.hold_expires_at>now()) then
      raise exception 'seat_unavailable';
    end if;
    v_total:=v_total+v_seat.price_irr;
  end loop;
  insert into public.orders(buyer_id,session_id,amount_irr,expires_at)
    values(p_buyer,p_session,v_total,now()+interval '10 minutes') returning * into v_order;
  for v_id in select distinct x from unnest(p_seats) x order by x loop
    update public.session_seats set state='held',hold_order_id=v_order.id,hold_expires_at=v_order.expires_at where id=v_id;
    insert into public.order_seats(order_id,seat_id,price_irr)
    select v_order.id,id,price_irr from public.session_seats where id=v_id;
  end loop;
  return v_order;
end $$;
revoke all on function public.reserve_seats(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.reserve_seats(uuid,uuid,uuid[]) to service_role;

-- Record a verified payment and issue one ticket per seat in the SAME database transaction.
-- Caller MUST verify authority and the exact stored amount with the payment provider first.
create function public.complete_verified_payment(p_authority text,p_ref_id text)
returns public.orders language plpgsql security invoker set search_path='' as $$
declare v_payment public.payments; v_order public.orders; v_seat_id uuid;
begin
  select * into v_payment from public.payments where authority=p_authority for update;
  if not found then raise exception 'unknown_authority'; end if;
  select * into v_order from public.orders where id=v_payment.order_id for update;
  if v_payment.state='verified' and v_order.state='paid' then return v_order; end if;
  if v_payment.state<>'initiated' or v_order.state<>'awaiting_payment' or
     v_payment.amount_irr<>v_order.amount_irr or p_ref_id is null or length(p_ref_id)<1 then
    raise exception 'payment_reconciliation_required';
  end if;
  if not exists(select 1 from public.order_seats where order_id=v_order.id) then
    raise exception 'empty_order';
  end if;
  for v_seat_id in select seat_id from public.order_seats where order_id=v_order.id order by seat_id loop
    perform 1 from public.session_seats where id=v_seat_id and state='held' and hold_order_id=v_order.id for update;
    if not found then raise exception 'seat_reconciliation_required'; end if;
    insert into public.tickets(order_id,seat_id) values(v_order.id,v_seat_id);
    update public.session_seats set state='sold',hold_expires_at=null where id=v_seat_id;
  end loop;
  update public.payments set state='verified',ref_id=p_ref_id,verified_at=now() where id=v_payment.id;
  update public.orders set state='paid' where id=v_order.id returning * into v_order;
  return v_order;
end $$;
revoke all on function public.complete_verified_payment(text,text) from public,anon,authenticated;
grant execute on function public.complete_verified_payment(text,text) to service_role;
