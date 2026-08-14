-- ═══════════════════════════════════════════════════════════════════════════
-- supabase/schema.sql — VestiFlow (tienda de ropa)
--
-- Esquema completo para Supabase: tablas, políticas de RLS (Row Level
-- Security) y funciones. Reemplaza a firestore.rules + toda la lógica de
-- runTransaction() que antes vivía en services/firestore/*.js.
--
-- CÓMO EJECUTARLO: Supabase Dashboard → tu proyecto → SQL Editor → pega este
-- archivo completo → Run. Es seguro volver a correrlo (usa IF NOT EXISTS /
-- OR REPLACE / DROP POLICY IF EXISTS en todos lados).
--
-- Orden de las secciones (cada una depende de la anterior):
--   1. Extensiones
--   2. Tablas
--   3. Funciones auxiliares para RLS (auth_company_id, has_permission, is_owner)
--   4. Row Level Security (una política por operación, no reglas genéricas)
--   5. Trigger de alta de usuario (auth.users → public.profiles [+ companies])
--   6. Funciones de negocio transaccionales (venta, ajuste de stock, almacén)
--   7. Storage (bucket de fotos + políticas)
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. EXTENSIONES
-- ───────────────────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ───────────────────────────────────────────────────────────────────────────
-- 2. TABLAS
-- ───────────────────────────────────────────────────────────────────────────

-- Empresa (tenant). Equivalente a companies/{id} en Firestore.
create table if not exists public.companies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  country         text not null default 'PE',
  currency_symbol text not null default 'S/',
  billing         jsonb not null default '{}'::jsonb,   -- razón social, RUC/tax id, dirección…
  invoice_counter integer not null default 0,
  created_at      timestamptz not null default now()
);

-- Suscripción/pago — tabla APARTE de companies a propósito: el usuario
-- autenticado puede LEER su fila, pero solo el backend de pagos (service_role,
-- que salta RLS) puede escribir. Mismo criterio que "meta/subscription
-- bloqueada para escritura del cliente" en firestore.rules.
create table if not exists public.subscriptions (
  company_id     uuid primary key references public.companies(id) on delete cascade,
  status         text not null default 'trial' check (status in ('trial','active','expired','cancelled')),
  plan           text,
  trial_ends_at  timestamptz,
  paid_until     timestamptz,
  last_charge_id text,               -- guarda el ID del último pago aplicado — evita que un
                                      -- reintento del webhook de Mercado Pago sume 30 días de más
                                      -- (bug real que quedó anotado en el análisis inicial del código).
  updated_at     timestamptz not null default now()
);

-- Perfil de cada usuario (dueño o empleado). id = auth.users.id (1:1).
-- Equivalente a users/{uid} en Firestore, pero acá vive en Postgres normal
-- en vez de en el propio sistema de Auth.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  email       text,
  role        text not null default 'empleado' check (role in ('owner','empleado')),
  permissions jsonb not null default '{}'::jsonb,   -- claves = ALL_PERMISSION_KEYS de permissions.js
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists profiles_company_id_idx on public.profiles(company_id);

-- Catálogo — una fila por prenda.
create table if not exists public.garments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  brand       text,
  sku         text not null,
  category    text not null,
  description text,
  price       numeric(10,2) not null default 0,
  cost        numeric(10,2) not null default 0,
  images      jsonb not null default '[]'::jsonb,  -- [{ id, url }] — url = Supabase Storage pública
  status      text not null default 'Agotado' check (status in ('En Stock','Stock Bajo','Agotado')),
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists garments_company_id_idx on public.garments(company_id);

-- Variantes — una fila por combinación talla+color, con su propio SKU y stock.
create table if not exists public.garment_variants (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  garment_id uuid not null references public.garments(id) on delete cascade,
  talla      text not null,
  color      text not null,
  sku        text not null,
  stock      integer not null default 0 check (stock >= 0),
  min_stock  integer not null default 2,
  created_at timestamptz not null default now(),
  unique (company_id, sku)
);
create index if not exists garment_variants_garment_id_idx on public.garment_variants(garment_id);
create index if not exists garment_variants_company_id_idx on public.garment_variants(company_id);

-- Historial de una prenda (altas, ajustes, ventas, recibos de almacén).
-- Tabla propia — ya NO embebida en la prenda como en la versión mock, así
-- puede crecer sin límite y se puede paginar/filtrar con SQL de verdad.
create table if not exists public.garment_history (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  garment_id  uuid not null references public.garments(id) on delete cascade,
  variant_sku text,
  action      text not null,
  type        text not null check (type in ('add','remove')),
  qty         integer not null default 0,
  detail      text,
  user_name   text,
  created_at  timestamptz not null default now()
);
create index if not exists garment_history_garment_id_idx on public.garment_history(garment_id);

-- Log de transacciones (ventas y compras) — INMUTABLE: solo INSERT, nunca
-- UPDATE/DELETE (ver sección de RLS). Mismo criterio que transactions.js.
create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  type        text not null check (type in ('venta','compra')),
  date        date not null default current_date,
  time        text,
  product     text not null,
  sku         text,
  description text,
  qty         integer not null default 0,
  unit_price  numeric(10,2) not null default 0,
  total       numeric(10,2) not null default 0,
  client      text,
  supplier    text,
  note        text,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists transactions_company_id_idx on public.transactions(company_id);
create index if not exists transactions_date_idx on public.transactions(company_id, date);

-- Ubicaciones físicas de almacén.
create table if not exists public.warehouse_locations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  type        text,
  code        text,
  description text,
  created_at  timestamptz not null default now()
);
create index if not exists warehouse_locations_company_id_idx on public.warehouse_locations(company_id);

-- Stock de almacén — una fila por variante × ubicación. Referencia DIRECTO
-- las variantes del catálogo (ver conversación: ya no hay catálogo de
-- almacén separado).
create table if not exists public.warehouse_stock (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  variant_sku   text not null,
  garment_id    uuid not null references public.garments(id) on delete cascade,
  garment_name  text,
  talla         text,
  color         text,
  location_id   uuid not null references public.warehouse_locations(id) on delete cascade,
  qty           integer not null default 0 check (qty >= 0),
  updated_at    timestamptz not null default now(),
  unique (variant_sku, location_id)
);
create index if not exists warehouse_stock_company_id_idx on public.warehouse_stock(company_id);
create index if not exists warehouse_stock_location_idx on public.warehouse_stock(location_id);

-- Movimientos de almacén — INMUTABLE, mismo criterio que transactions.
create table if not exists public.warehouse_movements (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies(id) on delete cascade,
  type               text not null check (type in ('entrada','salida','traslado','envio_venta')),
  variant_sku        text,
  garment_id         uuid references public.garments(id) on delete set null,
  garment_name       text,
  talla              text,
  color              text,
  qty                integer not null default 0,
  from_location_id   uuid references public.warehouse_locations(id) on delete set null,
  from_location_name text,
  to_location_id     uuid references public.warehouse_locations(id) on delete set null,
  to_location_name   text,
  reason             text,
  user_name          text,
  date               date not null default current_date,
  time               text,
  created_at         timestamptz not null default now()
);
create index if not exists warehouse_movements_company_id_idx on public.warehouse_movements(company_id);

-- Proveedores — quiénes te venden telas, prendas ya confeccionadas,
-- calzado, insumos, etc.
create table if not exists public.suppliers (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name       text not null,
  ruc        text,
  category   text not null default 'Otro' check (category in ('Telas','Confección/Maquila','Calzado','Accesorios','Insumos y Avíos','Otro')),
  contact    text,
  phone      text,
  address    text,
  status     text not null default 'Activo' check (status in ('Activo','Inactivo')),
  created_at timestamptz not null default now()
);
create index if not exists suppliers_company_id_idx on public.suppliers(company_id);

-- Compras a proveedor — SIEMPRE entra a una variante concreta del catálogo,
-- en una ubicación de almacén. Se aplica de inmediato (a diferencia de las
-- devoluciones, acá no hay estado pendiente: la mercadería ya llegó).
create table if not exists public.supplier_purchases (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  supplier_id    uuid references public.suppliers(id) on delete set null,
  supplier_name  text not null,
  variant_sku    text not null,
  garment_id     uuid references public.garments(id) on delete set null,
  garment_name   text,
  talla          text,
  color          text,
  location_id    uuid references public.warehouse_locations(id) on delete set null,
  location_name  text,
  qty            integer not null,
  unit_cost      numeric(10,2) not null,
  total          numeric(10,2) not null,
  note           text,
  user_name      text,
  date           date not null default current_date,
  time           text,
  created_at     timestamptz not null default now()
);
create index if not exists supplier_purchases_company_id_idx on public.supplier_purchases(company_id);
create index if not exists supplier_purchases_supplier_id_idx on public.supplier_purchases(supplier_id);

-- Devoluciones a proveedor — mercadería que sale de vuelta (defectuosa,
-- sobrestock de temporada, etc). El stock del almacén recién se descuenta
-- cuando se CONFIRMA la devolución (el proveedor ya se la llevó), no al
-- crearla — así "Pendiente" no compromete stock que todavía está en tu
-- almacén.
create table if not exists public.supplier_returns (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  supplier_id    uuid references public.suppliers(id) on delete set null,
  supplier_name  text not null,
  variant_sku    text not null,
  garment_id     uuid references public.garments(id) on delete set null,
  garment_name   text,
  talla          text,
  color          text,
  location_id    uuid references public.warehouse_locations(id) on delete set null,
  location_name  text,
  qty            integer not null,
  unit_price     numeric(10,2) not null,
  total          numeric(10,2) not null,
  status         text not null default 'Pendiente' check (status in ('Pendiente','Confirmado','Cancelado')),
  note           text,
  user_name      text,
  date           date not null default current_date,
  time           text,
  created_at     timestamptz not null default now()
);
create index if not exists supplier_returns_company_id_idx on public.supplier_returns(company_id);
create index if not exists supplier_returns_supplier_id_idx on public.supplier_returns(supplier_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. FUNCIONES AUXILIARES PARA RLS
-- ───────────────────────────────────────────────────────────────────────────
-- `security definer` + `set search_path` para que corran con permisos fijos
-- y no puedan ser engañadas cambiando el search_path — buena práctica
-- estándar de Supabase para funciones usadas dentro de políticas de RLS.

create or replace function public.auth_company_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select role = 'owner' from public.profiles where id = auth.uid()), false);
$$;

-- El Dueño tiene TODOS los permisos implícitamente (igual que
-- getEffectivePermissions() en permissions.js) — un empleado necesita la
-- clave puntual en `permissions` en true.
create or replace function public.has_permission(perm text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'owner' or (permissions->>perm)::boolean is true
     from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY
-- ───────────────────────────────────────────────────────────────────────────
alter table public.companies           enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.profiles            enable row level security;
alter table public.garments            enable row level security;
alter table public.garment_variants    enable row level security;
alter table public.garment_history     enable row level security;
alter table public.transactions        enable row level security;
alter table public.warehouse_locations enable row level security;
alter table public.warehouse_stock     enable row level security;
alter table public.warehouse_movements enable row level security;

-- companies — cualquier miembro puede leer su empresa; solo el Dueño edita
-- (facturación, país). No hay policy de INSERT: las empresas se crean desde
-- el trigger handle_new_user() con privilegios de sistema, nunca a mano.
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies for select
  using (id = auth_company_id());

drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies for update
  using (id = auth_company_id() and is_owner());

-- subscriptions — SOLO lectura para el cliente. Nunca hay policy de INSERT/
-- UPDATE/DELETE a propósito: solo el backend de pagos, usando la
-- service_role key (que ignora RLS por diseño de Supabase), puede escribir
-- acá. Exactamente el mismo criterio que "meta/subscription bloqueada para
-- escritura del cliente" del firestore.rules original.
drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions for select
  using (company_id = auth_company_id());

-- profiles — cada quien ve a sus compañeros de empresa; el Dueño administra
-- permisos y estado activo/inactivo (mismo criterio que "solo el Dueño
-- registra/gestiona empleados" en InventorySystem.jsx). Nadie inserta perfiles
-- a mano: los crea el trigger de alta de usuario.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (company_id = auth_company_id());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists profiles_update_owner on public.profiles;
create policy profiles_update_owner on public.profiles for update
  using (company_id = auth_company_id() and is_owner());

-- garments — lectura con ver_inventario; alta con crear_productos; edición
-- con editar_productos; borrado con eliminar_registros. Mismos nombres que
-- PERMISSION_GROUPS en permissions.js.
drop policy if exists garments_select on public.garments;
create policy garments_select on public.garments for select
  using (company_id = auth_company_id() and has_permission('ver_inventario'));

drop policy if exists garments_insert on public.garments;
create policy garments_insert on public.garments for insert
  with check (company_id = auth_company_id() and has_permission('crear_productos'));

drop policy if exists garments_update on public.garments;
create policy garments_update on public.garments for update
  using (company_id = auth_company_id() and has_permission('editar_productos'));

drop policy if exists garments_delete on public.garments;
create policy garments_delete on public.garments for delete
  using (company_id = auth_company_id() and has_permission('eliminar_registros'));

-- garment_variants — mismos permisos que su prenda dueña.
drop policy if exists garment_variants_select on public.garment_variants;
create policy garment_variants_select on public.garment_variants for select
  using (company_id = auth_company_id() and has_permission('ver_inventario'));

drop policy if exists garment_variants_insert on public.garment_variants;
create policy garment_variants_insert on public.garment_variants for insert
  with check (company_id = auth_company_id() and has_permission('crear_productos'));

drop policy if exists garment_variants_update on public.garment_variants;
create policy garment_variants_update on public.garment_variants for update
  using (company_id = auth_company_id() and has_permission('editar_productos'));

drop policy if exists garment_variants_delete on public.garment_variants;
create policy garment_variants_delete on public.garment_variants for delete
  using (company_id = auth_company_id() and has_permission('eliminar_registros'));

-- garment_history — INMUTABLE: se lee y se inserta (vía las funciones de la
-- sección 6), pero nunca se actualiza ni se borra a mano.
drop policy if exists garment_history_select on public.garment_history;
create policy garment_history_select on public.garment_history for select
  using (company_id = auth_company_id() and has_permission('ver_inventario'));

drop policy if exists garment_history_insert on public.garment_history;
create policy garment_history_insert on public.garment_history for insert
  with check (company_id = auth_company_id());

-- transactions — INMUTABLE. Ver ventas requiere registrar_ventas, ver
-- compras requiere registrar_compras (igual que TransactionHistory.jsx ya
-- filtraba). Simplificado a nivel de fila: cualquiera de los dos permisos
-- deja ver toda la tabla, y el filtrado por tipo se sigue haciendo en el
-- cliente como ya hacía TransactionHistory — replicar el filtro por tipo
-- adentro de la policy no vale la complejidad para este tamaño de equipo.
drop policy if exists transactions_select on public.transactions;
create policy transactions_select on public.transactions for select
  using (company_id = auth_company_id() and (has_permission('registrar_ventas') or has_permission('registrar_compras')));

drop policy if exists transactions_insert on public.transactions;
create policy transactions_insert on public.transactions for insert
  with check (
    company_id = auth_company_id() and (
      (type = 'venta'  and has_permission('registrar_ventas')) or
      (type = 'compra' and has_permission('registrar_compras'))
    )
  );

-- warehouse_locations — ver con ver_almacen, administrar con gestionar_almacen.
drop policy if exists warehouse_locations_select on public.warehouse_locations;
create policy warehouse_locations_select on public.warehouse_locations for select
  using (company_id = auth_company_id() and has_permission('ver_almacen'));

drop policy if exists warehouse_locations_insert on public.warehouse_locations;
create policy warehouse_locations_insert on public.warehouse_locations for insert
  with check (company_id = auth_company_id() and has_permission('gestionar_almacen'));

drop policy if exists warehouse_locations_update on public.warehouse_locations;
create policy warehouse_locations_update on public.warehouse_locations for update
  using (company_id = auth_company_id() and has_permission('gestionar_almacen'));

drop policy if exists warehouse_locations_delete on public.warehouse_locations;
create policy warehouse_locations_delete on public.warehouse_locations for delete
  using (company_id = auth_company_id() and has_permission('gestionar_almacen'));

-- warehouse_stock — se lee con ver_almacen. Las ESCRITURAS pasan siempre por
-- las funciones transaccionales de la sección 6 (nunca INSERT/UPDATE directo
-- desde el cliente), para que el stock nunca quede inconsistente entre
-- ubicaciones — por eso no hay policy de insert/update acá.
drop policy if exists warehouse_stock_select on public.warehouse_stock;
create policy warehouse_stock_select on public.warehouse_stock for select
  using (company_id = auth_company_id() and has_permission('ver_almacen'));

-- warehouse_movements — INMUTABLE, se inserta solo vía las funciones de la
-- sección 6.
drop policy if exists warehouse_movements_select on public.warehouse_movements;
create policy warehouse_movements_select on public.warehouse_movements for select
  using (company_id = auth_company_id() and has_permission('ver_almacen'));

-- suppliers — ver con ver_proveedores, administrar con gestionar_proveedores.
drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers for select
  using (company_id = auth_company_id() and has_permission('ver_proveedores'));

drop policy if exists suppliers_insert on public.suppliers;
create policy suppliers_insert on public.suppliers for insert
  with check (company_id = auth_company_id() and has_permission('gestionar_proveedores'));

drop policy if exists suppliers_update on public.suppliers;
create policy suppliers_update on public.suppliers for update
  using (company_id = auth_company_id() and has_permission('gestionar_proveedores'));

drop policy if exists suppliers_delete on public.suppliers;
create policy suppliers_delete on public.suppliers for delete
  using (company_id = auth_company_id() and has_permission('eliminar_registros'));

-- supplier_purchases / supplier_returns — INMUTABLES a nivel de fila (los
-- cambios de estado de una devolución pasan por las funciones de la
-- sección 6, nunca por UPDATE directo del cliente).
drop policy if exists supplier_purchases_select on public.supplier_purchases;
create policy supplier_purchases_select on public.supplier_purchases for select
  using (company_id = auth_company_id() and has_permission('ver_proveedores'));

drop policy if exists supplier_returns_select on public.supplier_returns;
create policy supplier_returns_select on public.supplier_returns for select
  using (company_id = auth_company_id() and has_permission('ver_proveedores'));

-- ───────────────────────────────────────────────────────────────────────────
-- 5. ALTA DE USUARIO — auth.users → public.profiles [+ companies]
-- ───────────────────────────────────────────────────────────────────────────
-- Dos caminos, distinguidos por si `raw_user_meta_data` trae `company_id`
-- (lo que el cliente manda en `options.data` de signUp(), o el admin API en
-- auth.admin.createUser()):
--
--   a) SIN company_id → Dueño registrándose con empresa nueva. Cubre tanto
--      el registro normal por correo+contraseña (trae company_name, country)
--      COMO el primer login con Google (trae name/full_name de Google, sin
--      metadata de la app) — en ambos casos se crea empresa nueva, igual
--      que hacía loadProfile() en el AuthContext de Firebase. Clave: NO se
--      distingue por una bandera `is_new_company` porque un login de Google
--      nunca la trae, y quedaría intentando insertar company_id = NULL,
--      violando el NOT NULL de profiles.company_id.
--
--   b) CON company_id → empleado invitado (registerEmployee) o que se unió
--      a una empresa existente (joinCompany) — la empresa YA existe.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  meta jsonb := new.raw_user_meta_data;
  new_company_id uuid;
  v_name text;
begin
  if meta->>'company_id' is not null then
    insert into public.profiles (id, company_id, name, email, role, permissions, active)
    values (
      new.id,
      (meta->>'company_id')::uuid,
      coalesce(meta->>'name', new.email),
      new.email,
      coalesce(meta->>'role', 'empleado'),
      coalesce(meta->'permissions', '{}'::jsonb),
      true
    );
  else
    v_name := coalesce(meta->>'name', meta->>'full_name', split_part(new.email, '@', 1));

    insert into public.companies (name, country, currency_symbol)
    values (
      coalesce(meta->>'company_name', 'Empresa de ' || v_name),
      coalesce(meta->>'country', 'PE'),
      coalesce(meta->>'currency_symbol', 'S/')
    )
    returning id into new_company_id;

    insert into public.subscriptions (company_id, status, trial_ends_at)
    values (new_company_id, 'trial', now() + interval '14 days');

    insert into public.profiles (id, company_id, name, email, role, permissions, active)
    values (new.id, new_company_id, v_name, new.email, 'owner', '{}'::jsonb, true);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────────────────────────────────────────────────────────
-- 6. FUNCIONES DE NEGOCIO TRANSACCIONALES
-- ───────────────────────────────────────────────────────────────────────────
-- Todo lo que antes era runTransaction() en Firestore (validar stock ANTES
-- de escribir nada, y que todo el movimiento se aplique junto o nada) ahora
-- es una transacción real de Postgres — cada función corre completa o no
-- corre nada, sin que el cliente tenga que orquestar el orden de escrituras.

-- Recalcula el status agregado de una prenda a partir de sus variantes
-- (mismo criterio que garmentStatus() en utils/variants.js). SECURITY
-- DEFINER + validación propia de empresa/permiso adentro: aunque hoy solo
-- la llaman otras funciones ya validadas, queda segura también si en el
-- futuro se llama directo desde el cliente.
create or replace function public.recompute_garment_status(p_garment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_company_id uuid := auth_company_id();
begin
  if not exists (select 1 from public.garments where id = p_garment_id and company_id = v_company_id) then
    raise exception 'Prenda no encontrada.';
  end if;

  select case
    when count(*) filter (where stock > 0) = 0 then 'Agotado'
    when count(*) filter (where stock = 0 or stock <= min_stock) > 0 then 'Stock Bajo'
    else 'En Stock'
  end into v_status
  from public.garment_variants where garment_id = p_garment_id;

  update public.garments set status = coalesce(v_status, 'Agotado'), updated_at = now()
  where id = p_garment_id;
end;
$$;

-- Ajuste manual de stock de UNA variante (equivalente a adjustVariantStock()
-- del store mock). type: 'add' | 'remove'. Busca la variante por SKU (no
-- por su uuid interno) para que el cliente pueda seguir trabajando solo con
-- SKUs, igual que ya hacía la versión mock.
create or replace function public.adjust_variant_stock(
  p_variant_sku text, p_type text, p_qty integer, p_user_name text,
  p_action text default null, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_variant public.garment_variants%rowtype;
  v_company_id uuid := auth_company_id();
begin
  if not has_permission('editar_productos') then
    raise exception 'No tienes permiso para ajustar stock.';
  end if;

  select * into v_variant from public.garment_variants
    where sku = p_variant_sku and company_id = v_company_id for update;
  if not found then raise exception 'Variante no encontrada.'; end if;

  if p_type = 'remove' and v_variant.stock < p_qty then
    raise exception 'Stock insuficiente: quedan %, se intentó quitar %.', v_variant.stock, p_qty;
  end if;

  update public.garment_variants
    set stock = case when p_type = 'add' then stock + p_qty else stock - p_qty end
    where id = v_variant.id;

  insert into public.garment_history (company_id, garment_id, variant_sku, action, type, qty, detail, user_name)
  values (
    v_company_id, v_variant.garment_id, v_variant.sku,
    coalesce(p_action, case when p_type = 'add' then 'Ajuste +' else 'Ajuste -' end),
    p_type, p_qty,
    coalesce(p_note, 'Talla ' || v_variant.talla || ' · ' || v_variant.color),
    p_user_name
  );

  perform public.recompute_garment_status(v_variant.garment_id);
end;
$$;

-- Registra una venta completa (uno o más ítems del carrito) de forma
-- atómica: valida TODO el stock antes de descontar nada, igual que
-- recordGarmentSale() del store mock / recordSale() de Firestore.
-- p_items: jsonb array de { sku, qty } — SOLO eso. Nombre, talla, color y
-- precio se leen de la base de datos adentro de la función, nunca se
-- confía en lo que mande el cliente — así nadie puede vender a un precio
-- manipulado abriendo la consola del navegador (mismo criterio que ya
-- tenía recordSale() en services/firestore/transactions.js).
create or replace function public.record_garment_sale(
  p_items jsonb, p_user_name text, p_client_name text default 'Cliente'
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := auth_company_id();
  v_item jsonb;
  v_variant public.garment_variants%rowtype;
  v_garment public.garments%rowtype;
  v_today date := current_date;
  v_time text := to_char(now(), 'HH24:MI');
begin
  if not has_permission('registrar_ventas') then
    raise exception 'No tienes permiso para registrar ventas.';
  end if;

  -- 1) Validar TODO primero (bloquea las filas con FOR UPDATE para que dos
  --    ventas simultáneas del mismo SKU no se pisen).
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_variant from public.garment_variants
      where sku = (v_item->>'sku') and company_id = v_company_id for update;
    if not found then
      raise exception 'La variante con SKU "%" ya no existe.', v_item->>'sku';
    end if;
    if v_variant.stock < (v_item->>'qty')::integer then
      raise exception 'Stock insuficiente para el SKU "%" (talla %, %): quedan %, se intentó vender %.',
        v_item->>'sku', v_variant.talla, v_variant.color, v_variant.stock, v_item->>'qty';
    end if;
  end loop;

  -- 2) Aplicar: descontar stock + insertar historial + insertar transacción,
  --    usando siempre el nombre/precio ACTUAL de la prenda en la base de
  --    datos, no lo que haya mandado el cliente.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_variant from public.garment_variants where sku = (v_item->>'sku') and company_id = v_company_id;
    select * into v_garment from public.garments where id = v_variant.garment_id;

    update public.garment_variants set stock = stock - (v_item->>'qty')::integer where id = v_variant.id;

    insert into public.garment_history (company_id, garment_id, variant_sku, action, type, qty, detail, user_name)
    values (
      v_company_id, v_variant.garment_id, v_variant.sku, 'Venta', 'remove',
      (v_item->>'qty')::integer,
      'Talla ' || v_variant.talla || ' · ' || v_variant.color,
      p_user_name
    );

    insert into public.transactions (company_id, type, date, time, product, sku, description, qty, unit_price, total, client, created_by)
    values (
      v_company_id, 'venta', v_today, v_time, v_garment.name, v_variant.sku,
      'Talla ' || v_variant.talla || ' · ' || v_variant.color,
      (v_item->>'qty')::integer, v_garment.price,
      v_garment.price * (v_item->>'qty')::integer,
      p_client_name, p_user_name
    );

    perform public.recompute_garment_status(v_variant.garment_id);
  end loop;
end;
$$;

-- Entrada/salida/traslado de almacén — ajusta warehouse_stock en una o dos
-- ubicaciones y deja el registro en warehouse_movements, todo junto.
create or replace function public.add_warehouse_movement(
  p_type text, p_variant_sku text, p_garment_id uuid, p_garment_name text,
  p_talla text, p_color text, p_qty integer,
  p_from_location_id uuid, p_from_location_name text,
  p_to_location_id uuid, p_to_location_name text,
  p_reason text, p_user_name text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := auth_company_id();
  v_current integer;
begin
  if not has_permission('gestionar_almacen') then
    raise exception 'No tienes permiso para registrar movimientos de almacén.';
  end if;

  if p_type in ('salida','traslado') then
    select qty into v_current from public.warehouse_stock
      where variant_sku = p_variant_sku and location_id = p_from_location_id for update;
    if coalesce(v_current, 0) < p_qty then
      raise exception 'Solo hay % unidades en esa ubicación.', coalesce(v_current, 0);
    end if;
    update public.warehouse_stock set qty = qty - p_qty, updated_at = now()
      where variant_sku = p_variant_sku and location_id = p_from_location_id;
  end if;

  if p_type in ('entrada','traslado') then
    insert into public.warehouse_stock (company_id, variant_sku, garment_id, garment_name, talla, color, location_id, qty)
    values (v_company_id, p_variant_sku, p_garment_id, p_garment_name, p_talla, p_color, p_to_location_id, p_qty)
    on conflict (variant_sku, location_id) do update
      set qty = public.warehouse_stock.qty + excluded.qty, updated_at = now();
  end if;

  insert into public.warehouse_movements (
    company_id, type, variant_sku, garment_id, garment_name, talla, color, qty,
    from_location_id, from_location_name, to_location_id, to_location_name, reason, user_name, time
  ) values (
    v_company_id, p_type, p_variant_sku, p_garment_id, p_garment_name, p_talla, p_color, p_qty,
    p_from_location_id, p_from_location_name, p_to_location_id, p_to_location_name, p_reason, p_user_name,
    to_char(now(), 'HH24:MI')
  );
end;
$$;

-- "Enviar a Venta" — descuenta de warehouse_stock y suma al stock vendible
-- de la variante (garment_variants.stock), todo en una sola transacción.
-- Igual que adjust_variant_stock, trabaja por SKU — no hace falta que el
-- cliente conozca el uuid interno de la variante.
create or replace function public.send_to_sales_floor(
  p_variant_sku text, p_garment_id uuid, p_garment_name text,
  p_talla text, p_color text, p_location_id uuid, p_location_name text,
  p_qty integer, p_user_name text, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := auth_company_id();
  v_current integer;
begin
  if not has_permission('gestionar_almacen') then
    raise exception 'No tienes permiso para enviar stock a venta.';
  end if;

  select qty into v_current from public.warehouse_stock
    where variant_sku = p_variant_sku and location_id = p_location_id for update;
  if coalesce(v_current, 0) < p_qty then
    raise exception 'Solo hay % unidades de "%" (talla %) en esa ubicación.', coalesce(v_current, 0), p_garment_name, p_talla;
  end if;

  update public.warehouse_stock set qty = qty - p_qty, updated_at = now()
    where variant_sku = p_variant_sku and location_id = p_location_id;

  update public.garment_variants set stock = stock + p_qty where sku = p_variant_sku and company_id = v_company_id;

  insert into public.garment_history (company_id, garment_id, variant_sku, action, type, qty, detail, user_name)
  values (
    v_company_id, p_garment_id, p_variant_sku, 'Recibido de Almacén', 'add', p_qty,
    'Desde ' || p_location_name || coalesce(' · ' || nullif(p_reason, ''), ''),
    p_user_name
  );

  insert into public.warehouse_movements (
    company_id, type, variant_sku, garment_id, garment_name, talla, color, qty,
    from_location_id, from_location_name, reason, user_name, time
  ) values (
    v_company_id, 'envio_venta', p_variant_sku, p_garment_id, p_garment_name, p_talla, p_color, p_qty,
    p_location_id, p_location_name, p_reason, p_user_name, to_char(now(), 'HH24:MI')
  );

  perform public.recompute_garment_status(p_garment_id);
end;
$$;

-- Correlativo de comprobante — reemplaza a getNextInvoiceNumber() de
-- services/firestore/companies.js. `for update` evita que dos ventas
-- simultáneas se lleven el mismo número.
create or replace function public.next_invoice_number()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := auth_company_id();
  v_next integer;
begin
  update public.companies set invoice_counter = invoice_counter + 1
    where id = v_company_id
    returning invoice_counter into v_next;
  return v_next;
end;
$$;

-- Compra a proveedor — entra stock a una ubicación de almacén (variante ya
-- existente en el catálogo), deja el movimiento, la transacción de
-- "compra" y el registro propio de supplier_purchases, todo junto.
create or replace function public.record_supplier_purchase(
  p_supplier_id uuid, p_supplier_name text,
  p_variant_sku text, p_garment_id uuid, p_garment_name text, p_talla text, p_color text,
  p_location_id uuid, p_location_name text,
  p_qty integer, p_unit_cost numeric, p_note text, p_user_name text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := auth_company_id();
  v_total numeric := p_qty * p_unit_cost;
  v_today date := current_date;
  v_time text := to_char(now(), 'HH24:MI');
begin
  if not has_permission('gestionar_proveedores') then
    raise exception 'No tienes permiso para registrar compras a proveedor.';
  end if;

  insert into public.warehouse_stock (company_id, variant_sku, garment_id, garment_name, talla, color, location_id, qty)
  values (v_company_id, p_variant_sku, p_garment_id, p_garment_name, p_talla, p_color, p_location_id, p_qty)
  on conflict (variant_sku, location_id) do update
    set qty = public.warehouse_stock.qty + excluded.qty, updated_at = now();

  insert into public.warehouse_movements (
    company_id, type, variant_sku, garment_id, garment_name, talla, color, qty,
    to_location_id, to_location_name, reason, user_name, time
  ) values (
    v_company_id, 'entrada', p_variant_sku, p_garment_id, p_garment_name, p_talla, p_color, p_qty,
    p_location_id, p_location_name, 'Compra a ' || p_supplier_name, p_user_name, v_time
  );

  insert into public.transactions (company_id, type, date, time, product, sku, description, qty, unit_price, total, supplier, note, created_by)
  values (
    v_company_id, 'compra', v_today, v_time, p_garment_name, p_variant_sku,
    'Talla ' || p_talla || ' · ' || p_color, p_qty, p_unit_cost, v_total,
    p_supplier_name, p_note, p_user_name
  );

  insert into public.supplier_purchases (
    company_id, supplier_id, supplier_name, variant_sku, garment_id, garment_name, talla, color,
    location_id, location_name, qty, unit_cost, total, note, user_name, date, time
  ) values (
    v_company_id, p_supplier_id, p_supplier_name, p_variant_sku, p_garment_id, p_garment_name, p_talla, p_color,
    p_location_id, p_location_name, p_qty, p_unit_cost, v_total, p_note, p_user_name, v_today, v_time
  );
end;
$$;

-- Devolución a proveedor — se crea en 'Pendiente' SIN tocar stock todavía
-- (la mercadería sigue físicamente en tu almacén hasta que el proveedor la
-- recoja). confirm_supplier_return() recién ahí descuenta stock de verdad.
create or replace function public.record_supplier_return(
  p_supplier_id uuid, p_supplier_name text,
  p_variant_sku text, p_garment_id uuid, p_garment_name text, p_talla text, p_color text,
  p_location_id uuid, p_location_name text,
  p_qty integer, p_unit_price numeric, p_note text, p_user_name text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := auth_company_id();
  v_current integer;
begin
  if not has_permission('gestionar_proveedores') then
    raise exception 'No tienes permiso para registrar devoluciones a proveedor.';
  end if;

  select qty into v_current from public.warehouse_stock
    where variant_sku = p_variant_sku and location_id = p_location_id;
  if coalesce(v_current, 0) < p_qty then
    raise exception 'Solo hay % unidades de "%" (talla %) en esa ubicación.', coalesce(v_current, 0), p_garment_name, p_talla;
  end if;

  insert into public.supplier_returns (
    company_id, supplier_id, supplier_name, variant_sku, garment_id, garment_name, talla, color,
    location_id, location_name, qty, unit_price, total, status, note, user_name
  ) values (
    v_company_id, p_supplier_id, p_supplier_name, p_variant_sku, p_garment_id, p_garment_name, p_talla, p_color,
    p_location_id, p_location_name, p_qty, p_unit_price, p_qty * p_unit_price, 'Pendiente', p_note, p_user_name
  );
end;
$$;

-- El proveedor ya se llevó la mercadería: recién ahora se descuenta stock
-- de verdad y queda el movimiento en el historial de almacén.
create or replace function public.confirm_supplier_return(p_return_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_return public.supplier_returns%rowtype;
  v_company_id uuid := auth_company_id();
  v_current integer;
begin
  if not has_permission('gestionar_proveedores') then
    raise exception 'No tienes permiso para confirmar devoluciones a proveedor.';
  end if;

  select * into v_return from public.supplier_returns
    where id = p_return_id and company_id = v_company_id for update;
  if not found then raise exception 'Devolución no encontrada.'; end if;
  if v_return.status <> 'Pendiente' then raise exception 'Esta devolución ya fue procesada.'; end if;

  select qty into v_current from public.warehouse_stock
    where variant_sku = v_return.variant_sku and location_id = v_return.location_id for update;
  if coalesce(v_current, 0) < v_return.qty then
    raise exception 'Solo hay % unidades disponibles — no se puede confirmar la devolución completa.', coalesce(v_current, 0);
  end if;

  update public.warehouse_stock set qty = qty - v_return.qty, updated_at = now()
    where variant_sku = v_return.variant_sku and location_id = v_return.location_id;

  insert into public.warehouse_movements (
    company_id, type, variant_sku, garment_id, garment_name, talla, color, qty,
    from_location_id, from_location_name, reason, user_name, time
  ) values (
    v_company_id, 'salida', v_return.variant_sku, v_return.garment_id, v_return.garment_name, v_return.talla, v_return.color, v_return.qty,
    v_return.location_id, v_return.location_name, 'Devolución a ' || v_return.supplier_name, v_return.user_name, to_char(now(), 'HH24:MI')
  );

  update public.supplier_returns set status = 'Confirmado' where id = p_return_id;
end;
$$;

-- Cancelar una devolución pendiente — como todavía no se tocó stock (recién
-- se descuenta al confirmar), cancelar es simplemente marcarla, sin
-- necesidad de "devolver" nada.
create or replace function public.cancel_supplier_return(p_return_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid := auth_company_id();
  v_status text;
begin
  if not has_permission('gestionar_proveedores') then
    raise exception 'No tienes permiso para cancelar devoluciones a proveedor.';
  end if;

  select status into v_status from public.supplier_returns where id = p_return_id and company_id = v_company_id;
  if v_status is null then raise exception 'Devolución no encontrada.'; end if;
  if v_status <> 'Pendiente' then raise exception 'Solo se pueden cancelar devoluciones pendientes.'; end if;

  update public.supplier_returns set status = 'Cancelado' where id = p_return_id;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. STORAGE — fotos de prendas
-- ───────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('garment-photos', 'garment-photos', true)
on conflict (id) do nothing;

-- Lectura pública (son fotos de catálogo, se muestran sin login en el POS
-- y en el catálogo — igual de "públicas" que ya eran las imágenes de
-- picsum.photos que usaba el seed de datos de ejemplo).
drop policy if exists garment_photos_public_read on storage.objects;
create policy garment_photos_public_read on storage.objects for select
  using (bucket_id = 'garment-photos');

-- Solo usuarios autenticados con permiso de crear/editar productos pueden
-- subir o reemplazar fotos, y solo dentro de la carpeta de SU empresa
-- (primer segmento de la ruta = company_id) — así un empleado de la empresa
-- A no puede subir ni pisar fotos de la empresa B aunque adivine la URL.
drop policy if exists garment_photos_upload on storage.objects;
create policy garment_photos_upload on storage.objects for insert
  with check (
    bucket_id = 'garment-photos'
    and (storage.foldername(name))[1] = auth_company_id()::text
    and has_permission('crear_productos')
  );

drop policy if exists garment_photos_delete on storage.objects;
create policy garment_photos_delete on storage.objects for delete
  using (
    bucket_id = 'garment-photos'
    and (storage.foldername(name))[1] = auth_company_id()::text
    and has_permission('editar_productos')
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- Fin. Después de correr esto: Storage → garment-photos ya debería existir.
-- Siguiente paso: supabase/SETUP.md.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 8. REALTIME — necesario para que supabase.channel(...).on('postgres_changes', …)
--    reciba avisos en vivo (equivalente a onSnapshot() de Firestore). Sin
--    esto, subscribeToEmployees/subscribeToCompany/etc. igual funcionan en
--    la carga inicial, pero nunca se enteran de cambios hechos en otra
--    pestaña/dispositivo hasta que se recarga la página.
--
-- Se recrea la publicación completa (drop + create) en vez de "alter
-- publication ... add table", porque ADD TABLE no tiene un IF NOT EXISTS y
-- fallaría si vuelves a correr este archivo — así sigue siendo seguro
-- re-ejecutar schema.sql las veces que haga falta.
-- ───────────────────────────────────────────────────────────────────────────
drop publication if exists supabase_realtime;
create publication supabase_realtime for table
  public.profiles,
  public.companies,
  public.subscriptions,
  public.garments,
  public.garment_variants,
  public.garment_history,
  public.transactions,
  public.warehouse_locations,
  public.warehouse_stock,
  public.warehouse_movements,
  public.suppliers,
  public.supplier_purchases,
  public.supplier_returns;


