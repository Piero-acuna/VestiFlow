# Supabase — guía de instalación desde cero

Esto te deja el backend de VestiFlow corriendo en Supabase. Se hace una sola
vez por proyecto (o dos: una para desarrollo, otra para producción — ver
nota al final).

## 1. Crear la cuenta y el proyecto

1. Entra a **[supabase.com](https://supabase.com)** → **Start your project** → crea una cuenta (con GitHub es lo más rápido).
2. **New Project** → elige una organización (o crea una) → nombre del proyecto: `invenxio` (o el que prefieras) → genera una **contraseña de base de datos** y guárdala en un lugar seguro (la necesitas si alguna vez te conectas por `psql` directo, no la vuelves a ver en el dashboard) → elige la región más cercana a tus usuarios (`South America (São Paulo)` es la más cercana a Perú) → **Create new project**.
3. Espera 1-2 minutos mientras Supabase aprovisiona la base de datos.

## 2. Correr el esquema (tablas, seguridad, funciones)

1. En el menú lateral del proyecto → **SQL Editor** → **New query**.
2. Abre el archivo `supabase/schema.sql` de este proyecto, copia **todo** el contenido, pégalo en el editor.
3. **Run** (o `Ctrl/Cmd + Enter`). Debería terminar en un par de segundos sin errores en rojo.
4. Verifica: menú lateral → **Table Editor** → deberías ver `companies`, `profiles`, `garments`, `garment_variants`, `transactions`, `warehouse_locations`, `warehouse_stock`, `warehouse_movements`, `subscriptions`.
5. Verifica el bucket de fotos: menú lateral → **Storage** → debería existir `garment-photos` (público).

Si necesitas volver a correrlo (por ejemplo, después de que te pase una versión más nueva de `schema.sql`), es seguro — el archivo está escrito para poder ejecutarse varias veces sin duplicar nada.

## 3. Configurar Auth

1. Menú lateral → **Authentication** → **Providers** → confirma que **Email** esté habilitado (lo está por defecto).
2. **Authentication** → **URL Configuration** → en **Site URL** pon la URL donde vas a correr la app:
   - En desarrollo: `http://localhost:5173`
   - En producción: la URL real (ej. `https://tu-tienda.vercel.app`) — la actualizas cuando despliegues.
3. (Opcional pero recomendado) **Authentication** → **Email Templates** → personaliza el correo de "Invite user" y "Confirm signup" con el nombre de tu tienda — es el correo que le llega a cada empleado nuevo.
4. Por ahora deja **"Confirm email"** activado (Authentication → Providers → Email) — así nadie puede registrarse con un correo que no le pertenece.

## 4. Obtener tus llaves de API

Menú lateral → **Project Settings** (ícono de engranaje) → **API**. Vas a necesitar 3 valores:

| Ahí dice… | Es esto… | Dónde va |
|---|---|---|
| **Project URL** | `https://xxxxx.supabase.co` | `VITE_SUPABASE_URL` |
| **anon / public** | una key larga que empieza distinto a la de abajo | `VITE_SUPABASE_ANON_KEY` |
| **service_role** | otra key larga — **⚠️ esta es secreta** | `SUPABASE_SERVICE_ROLE_KEY` |

**La `service_role` key puede saltarse TODA la seguridad de RLS — nunca la pongas en una variable que empiece con `VITE_`, nunca la subas a git, nunca la pegues en el código del navegador.** Solo la usan las funciones serverless en `/api` (las de pagos), que corren en el servidor, no en el navegador.

## 5. Variables de entorno

Copia `.env.local.example` a `.env.local` (si no lo hiciste ya) y completa:

```bash
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...          # la "anon / public"
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...       # la "service_role" — SIN prefijo VITE_
```

Las variables de Culqi y Mercado Pago (`CULQI_SECRET_KEY`, `MP_ACCESS_TOKEN`, etc.) no cambian — siguen igual que antes, solo se les suman las de arriba.

## 6. Instalar dependencias y correr

```bash
npm install
npm run dev
```

`npm install` va a traer `@supabase/supabase-js` (ya está en `package.json`). Si en algún momento ves un error de "Missing Supabase environment variables" en la consola del navegador, revisa el paso 5.

## 7. Probar que el alta de usuario funciona

1. Abre la app → pantalla de registro → crea tu cuenta de Dueño (nombre de tienda, país, etc).
2. En Supabase → **Table Editor** → `companies`: debería aparecer tu empresa nueva. → `profiles`: debería aparecer tu perfil con `role = owner`. → `subscriptions`: debería aparecer con `status = trial`.

Si algo de esto no aparece, el trigger `handle_new_user()` no corrió — revisa **Database** → **Functions** → `handle_new_user` en el dashboard de Supabase para ver el error exacto, o pégame el mensaje.

## 8. Ir a producción

- Crea un **segundo proyecto de Supabase** solo para producción (mismo `schema.sql`, no reutilices el de desarrollo) — así las pruebas no ensucian datos reales.
- En tu plataforma de hosting (Vercel, etc.) configura las mismas variables de entorno del paso 5, pero con las llaves del proyecto de **producción**.
- Actualiza **Site URL** en Auth (paso 3) al dominio real de producción.
- Revisa **Project Settings → Billing**: el plan gratuito de Supabase alcanza para arrancar, pero tiene límites de tamaño de base de datos y de "proyectos pausados por inactividad" — para una tienda en producción real conviene el plan Pro apenas tengas tráfico constante.

---

**Siguiente paso** una vez que esto esté funcionando: voy a reemplazar `AuthContext.jsx` (login/registro) y cada uno de los `services/mock/*.js` por las llamadas reales a Supabase — este archivo y `schema.sql` ya quedaron listos para que ese cambio sea, literalmente, reemplazar el contenido de esos archivos sin tocar ningún componente de la interfaz.
