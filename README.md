# VestiFlow

Inventario, ventas y almacén para tiendas de ropa — catálogo con variantes de talla y color, punto de venta, control de almacén multi-ubicación y proveedores, todo con fotos reales de cada prenda.

## Stack

- **Frontend**: React 19 + Vite + Tailwind
- **Backend**: [Supabase](https://supabase.com) (Postgres + Auth + Storage + Realtime)
- **Pagos**: Culqi / Mercado Pago (según país)

## Primeros pasos

1. `npm install`
2. Sigue [`supabase/SETUP.md`](./supabase/SETUP.md) para crear tu proyecto de Supabase, correr el esquema (`supabase/schema.sql`) y obtener tus llaves.
3. Copia `.env.local.example` a `.env.local` y completa las variables.
4. `npm run dev`

## Estructura

```
src/
  modules/            Catálogo, Movimientos (POS), Dashboard, Proveedores
  WarehouseModule.jsx Almacén
  components/         UI por dominio (inventory/, warehouse/, suppliers/, shared/)
  services/supabase/  Toda la lectura/escritura a Supabase — mismos nombres
                       de función en cada store, para que cambiar lo de
                       adentro nunca obligue a tocar un componente
  config/             Categorías de prenda, tallas, colores, permisos, países
supabase/
  schema.sql           Tablas, RLS, triggers y funciones transaccionales
  SETUP.md             Guía paso a paso desde cero
api/
  *.js                 Funciones serverless (pagos, alta de empleados) —
                        las únicas que usan la service_role key de Supabase
```
