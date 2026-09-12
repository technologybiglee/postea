# API Post - Arquitectura Multiempresa

## Descripcion General

La API soporta multiples empresas (tenants) dentro de una misma instancia. Cada empresa posee sus propios posts, categorias, tags y usuarios administradores, con aislamiento completo de datos entre tenants.

La resolucion del tenant se hace por **path** en la API publica y por **JWT** en la API privada (admin).

## Modelo de Datos

```
Company 1──* User
Company 1──* Post
Company 1──* Category
Company 1──* Tag
Company 1──1 CompanySettings
Post    *──1 Category
Post    *──1 User (author)
Post    *──* Tag  (via PostTag)
```

### Entidades principales

| Modelo | Descripcion | Aislamiento |
|--------|-------------|-------------|
| `Company` | Tenant raiz. Tiene `name` y `slug` (unico global). | -- |
| `CompanySettings` | Configuracion operativa por empresa (1:1 con Company). | Por empresa |
| `User` | Administrador. Pertenece a una sola empresa via `companyId`. Email unico global. | Por empresa |
| `Post` | Articulo. Slug unico dentro de la empresa (`@@unique([companyId, slug])`). | Por empresa |
| `Category` | Clasificacion. Nombre unico dentro de la empresa (`@@unique([companyId, name])`). | Por empresa |
| `Tag` | Etiqueta. Nombre unico dentro de la empresa (`@@unique([companyId, name])`). | Por empresa |

### CompanySettings

Campos configurables por empresa almacenados en base de datos:

| Campo | Tipo | Default | Descripcion |
|-------|------|---------|-------------|
| `allowedOrigins` | `String[]` | `[]` | Reservado para restringir origenes CORS por empresa. Aun no aplicado por el codigo (el CORS publico sigue siendo `*` y el admin usa solo `CORS_ALLOWED_ORIGINS`); no implementarlo por ahora dado que un preflight de CORS ocurre antes de poder resolver la empresa via JWT. |
| `defaultPostStatus` | `PostStatus` | `draft` | Estado usado al crear un post cuando el body no especifica `status` (ver `createPost`). |

La configuracion de infraestructura (`DATABASE_URL`, `JWT_SECRET`, `PORT`, `NODE_ENV`, `CORS_ALLOWED_ORIGINS`) permanece en variables de entorno y aplica de forma global a toda la plataforma.

## Flujo de Requests

### API Publica

Los consumidores externos acceden a los posts de una empresa usando el `companySlug` en la URL:

```
GET /api/public/companies/:companySlug/posts
GET /api/public/companies/:companySlug/posts/:slug
```

1. El middleware `resolveCompany` busca la empresa por `slug`.
2. Si no existe, responde `404`.
3. Los queries filtran por `companyId` y `status = 'published'`.

**Query params opcionales** (listado):
- `category` - filtrar por nombre de categoria.
- `tag` - filtrar por nombre de tag.
- `page` - numero de pagina (default: 1).
- `limit` - items por pagina (default: 10, max: 50).

### API Admin (privada)

Los usuarios autenticados operan siempre dentro del contexto de su empresa:

```
POST   /api/auth/register          (requiere companyId en body)
POST   /api/auth/login

GET    /api/posts
GET    /api/posts/:id
POST   /api/posts
PUT    /api/posts/:id
DELETE /api/posts/:id

GET    /api/categories
GET    /api/categories/:id
POST   /api/categories
PUT    /api/categories/:id
DELETE /api/categories/:id

GET    /api/tags
GET    /api/tags/:id
POST   /api/tags
PUT    /api/tags/:id
DELETE /api/tags/:id
```

1. El usuario se autentica con `POST /api/auth/login`.
2. El JWT contiene `userId`, `email` y `companyId`.
3. Cada endpoint admin extrae `companyId` del token y filtra todas las queries.
4. Las operaciones de lectura usan `findFirst({ where: { id, companyId } })` para verificar pertenencia.
5. Las operaciones de escritura asocian el recurso a la empresa del usuario.

### Gestion de Empresa

```
POST   /api/companies              (sin auth — flujo de onboarding)
GET    /api/companies/me            (auth requerida)
PUT    /api/companies/me            (auth requerida)
GET    /api/companies/me/settings   (auth requerida)
PUT    /api/companies/me/settings   (auth requerida)
```

- `POST /api/companies` crea una nueva empresa con su `CompanySettings` inicial. No requiere autenticacion para permitir el flujo de alta.
- Los endpoints `/me` operan sobre la empresa del usuario autenticado.

## Reglas de Aislamiento

1. **Datos**: todas las tablas de contenido (`Post`, `Category`, `Tag`) tienen `company_id` NOT NULL con FK a `companies`.
2. **Unicidades**: slugs de posts, nombres de categorias y nombres de tags son unicos dentro de cada empresa, no globalmente.
3. **Lectura admin**: `findFirst({ where: { id, companyId } })` asegura que un usuario no pueda leer recursos de otra empresa por ID.
4. **Escritura admin**: `companyId` se inyecta desde el JWT, no desde el body. El cliente no puede elegir a que empresa escribir.
5. **Relaciones al crear/actualizar posts**: `categoryId` y `tagIds` se validan contra `companyId` antes de conectarlos (`checkOwnership` en `posts.controller.ts`), para que un post no pueda enlazarse a una categoria o tag de otra empresa.
6. **API publica**: solo expone posts con `status = 'published'` de la empresa indicada por `companySlug`.

## Rate limiting

Los endpoints de autenticacion (`/api/auth/register`, `/api/auth/login`) y el alta de empresas (`POST /api/companies`, publico) usan un limitador simple en memoria por IP (`src/middlewares/rateLimit.middleware.ts`) para frenar fuerza bruta y spam de registros. Es apto para una sola instancia; si la API llega a correr en varias replicas, hay que moverlo a un store compartido (Redis).

## Estrategia de Migracion

La migracion `20260409000000_add_multi_tenant_company` realiza los siguientes pasos en orden:

1. Crea las tablas `companies` y `company_settings`.
2. Inserta una empresa por defecto (`id=1`, slug `default`) para asociar los datos existentes.
3. Agrega `company_id` a `users`, `categories`, `tags` y `posts` como columna nullable.
4. Asigna `company_id = 1` a todos los registros existentes.
5. Cambia las columnas a NOT NULL.
6. Elimina los indices unicos globales (`posts_slug_key`, `categories_name_key`, `tags_name_key`).
7. Crea las foreign keys hacia `companies`.
8. Crea los nuevos indices unicos compuestos (`company_id + slug/name`).

### Aplicar la migracion

La base es un proyecto Supabase (Postgres administrado) compartido por el equipo, no un contenedor local descartable, asi que se usa siempre `migrate deploy` (no `migrate dev`, que genera migraciones nuevas):

```bash
npx prisma migrate deploy
```

### Verificar estado post-migracion

- Todos los registros existentes deben tener `company_id = 1`.
- La empresa "Default Company" debe existir con slug `default`.
- Los slugs de posts deben seguir funcionando bajo la empresa default.

## Flujo de Onboarding (nueva empresa)

1. Crear empresa: `POST /api/companies` con `{ "name": "Mi Empresa" }`.
   - Opcionalmente se puede pasar `"slug": "mi-empresa"`.
   - Retorna la empresa con su `id` y `settings`.
2. Registrar primer usuario: `POST /api/auth/register` con `{ "email": "...", "password": "...", "name": "...", "companyId": <id> }`.
3. Login: `POST /api/auth/login` con `{ "email": "...", "password": "..." }`.
   - Retorna token JWT con `companyId` incluido.
4. Usar el token para gestionar posts, categorias, tags y settings de la empresa.

## Variables de Entorno

| Variable | Alcance | Descripcion |
|----------|---------|-------------|
| `DATABASE_URL` | Global | Conexion al Postgres de Supabase (Session Pooler, puerto 5432). Se obtiene del dashboard del proyecto Supabase, boton "Connect". |
| `JWT_SECRET` | Global | Clave para firmar tokens JWT. |
| `JWT_EXPIRES_IN` | Global | Tiempo de expiracion del token (default: `7d`). |
| `PORT` | Global | Puerto del servidor (default: `3000`). |
| `NODE_ENV` | Global | Entorno (`development` / `production`). |
| `CORS_ALLOWED_ORIGINS` | Global | Origenes permitidos para rutas admin (separados por coma). |

## Base de datos: Supabase

La base de datos de `api-post` es un proyecto Supabase dedicado (organizacion Biglee, proyecto `api-post`, plan Free, region `us-east-1`) en vez de un Postgres corriendo en Docker. Solo se usa como Postgres administrado — la app sigue con su propia autenticacion JWT y su propia API REST, no se usa Auth/Storage/Realtime/Data API de Supabase.

Puntos importantes:

- **Rol de conexion**: se creo un rol `prisma` dedicado (no el superusuario `postgres` por defecto) con privilegios acotados al schema `public`, para limitar el dano si la credencial se filtra. El usuario en `DATABASE_URL` es `prisma.[project-ref]`, no `postgres.[project-ref]`.
- **Data API (PostgREST) deshabilitada**: como Prisma es el unico acceso a la base, hay que apagar la Data API desde el dashboard del proyecto (Settings > API > Data API > desactivar). Esto es lo que evita que las tablas queden expuestas via el API publica de Supabase con la anon key — la alternativa (dejarla prendida y agregar políticas de Row Level Security a las 8 tablas) es mas trabajo para el mismo resultado en una app que no la necesita.
- **RLS**: por eso mismo, no hace falta habilitar Row Level Security en las tablas — el aislamiento multi-tenant ya lo hace la app via `companyId`, y con la Data API apagada no hay otra via de acceso a la base mas que Prisma.
- **Migraciones**: las 4 migraciones existentes (`init`, `add_author_to_post`, `add_post_status`, `add_multi_tenant_company`) ya estan aplicadas en el proyecto Supabase de `api-post`. Migraciones nuevas se aplican con `npx prisma migrate deploy` contra ese mismo `DATABASE_URL`.
