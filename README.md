# Postea — REST API con Node.js, Express, Prisma y PostgreSQL

API REST lista para producción para gestionar posts de blog con autenticación JWT, categorías, tags y endpoints públicos para incrustar contenido en sitios externos.

## Stack


| Tecnología       | Versión                               |
| ---------------- | ------------------------------------- |
| Node.js          | 20                                    |
| TypeScript       | 5.x                                   |
| Express          | 4.x                                   |
| Prisma ORM       | 5.x                                   |
| PostgreSQL       | Supabase (Postgres 17 administrado)   |
| Docker / Compose | — (opcional, solo para correr la API) |


---

## Estructura de carpetas

```
api-post/
├── prisma/
│   └── schema.prisma          # Esquema de la BD y relaciones
├── src/
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── posts.controller.ts
│   │   ├── categories.controller.ts
│   │   ├── tags.controller.ts
│   │   └── public.controller.ts
│   ├── middlewares/
│   │   ├── auth.middleware.ts  # Validación JWT
│   │   └── error.middleware.ts # Manejador global de errores
│   ├── prisma/
│   │   └── client.ts           # Singleton de PrismaClient
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── posts.routes.ts
│   │   ├── categories.routes.ts
│   │   ├── tags.routes.ts
│   │   └── public.routes.ts
│   ├── types/
│   │   └── index.ts            # Tipos compartidos (AuthRequest, etc.)
│   ├── utils/
│   │   └── slug.ts             # Generador de slugs
│   └── index.ts                # Punto de entrada de la app
├── .env.example
├── docker-compose.yml
├── Dockerfile
└── tsconfig.json
```

---



## Puesta en marcha

La base de datos vive en Supabase (Postgres administrado) — ya no hace falta levantar Postgres localmente. El repo ya trae un proyecto Supabase creado y migrado (`api-post`, org Biglee); para apuntar a él o a uno propio:

```bash
# 1. Copia las variables de entorno
cp .env.example .env

# 2. Completa DATABASE_URL con el connection string de Supabase
#    Dashboard del proyecto > botón "Connect" > Session pooler.
#    Usar el rol "prisma" (no el superusuario "postgres" por defecto) — ver docs/README.md.
```



### Con Docker (opcional, solo para correr la API)

```bash
docker compose up -d
docker compose exec api npx prisma migrate deploy

# La API estará disponible en http://localhost:3000
```



### Sin Docker (desarrollo local)

```bash
npm install
npx prisma migrate deploy   # aplica migraciones pendientes contra Supabase
npm run dev
```

`prisma migrate deploy` (no `migrate dev`) porque las migraciones ya están escritas y versionadas en el repo — contra una base compartida no se generan migraciones nuevas al vuelo.

### Crear el primer super admin (una sola vez)

```bash
# Completa SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD / SUPER_ADMIN_NAME en .env
npx prisma db seed
```

Es idempotente: si ya existe un usuario con ese email, no hace nada. Sin este paso, nadie puede crear empresas (`POST /api/companies` requiere ser super admin).

---



## Variables de entorno


| Variable                                                          | Descripción                                                                                           | Ejemplo                                                                                           |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                    | Cadena de conexión al Postgres de Supabase (Session Pooler)                                           | `postgres://prisma.[ref]:[pass]@aws-0-[region].pooler.supabase.com:5432/postgres?sslmode=require` |
| `JWT_SECRET`                                                      | Clave secreta para firmar tokens                                                                      | cadena larga y aleatoria                                                                          |
| `JWT_EXPIRES_IN`                                                  | Duración del token                                                                                    | `7d`                                                                                              |
| `PORT`                                                            | Puerto del servidor                                                                                   | `3000`                                                                                            |
| `CORS_ALLOWED_ORIGINS`                                            | Orígenes permitidos para rutas privadas                                                               | `http://localhost:3000`                                                                           |
| `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` / `SUPER_ADMIN_NAME` | Credenciales para crear el primer super admin (`npx prisma db seed`). Opcional, se puede dejar vacío. | ver `.env.example`                                                                                |


---



## Documentación interactiva (Swagger)

Con el servidor corriendo (`npm run dev` o `npm start`), la API expone su spec OpenAPI 3 y una UI para explorar y ejecutar cada endpoint directamente desde el navegador:

- **Swagger UI**: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)
- **Spec JSON** (para importar en Postman/Insomnia): [http://localhost:3000/api/docs.json](http://localhost:3000/api/docs.json)

Para probar endpoints privados desde la UI: hacé login en `POST /api/auth/login`, copiá el `token` de la respuesta y pegalo en el botón **Authorize** (arriba a la derecha) como `Bearer <token>`.

El spec vive en `[src/docs/openapi.json](src/docs/openapi.json)` y se actualiza a mano junto con las rutas/controladores.

---



## Endpoints



### Autenticación


| Método | Ruta                 | Descripción                  |
| ------ | -------------------- | ---------------------------- |
| POST   | `/api/auth/register` | Registrar nuevo usuario      |
| POST   | `/api/auth/login`    | Iniciar sesión y obtener JWT |




#### Ejemplos

```bash
# Registro
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@example.com","password":"secreto123"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"secreto123"}'
```

---



### Gestión de empresas y super admin


| Método | Ruta                         | Descripción                                                            |
| ------ | ---------------------------- | ---------------------------------------------------------------------- |
| POST   | `/api/companies`             | Crear empresa — **requiere token de super admin**                      |
| GET    | `/api/companies/me`          | Obtener la empresa del usuario autenticado                             |
| PUT    | `/api/companies/me`          | Actualizar la empresa del usuario autenticado                          |
| GET    | `/api/companies/me/settings` | Obtener configuración de la empresa                                    |
| PUT    | `/api/companies/me/settings` | Actualizar configuración de la empresa                                 |
| GET    | `/api/admin/companies`       | Listar **todas** las empresas — solo super admin                       |
| GET    | `/api/admin/companies/:id`   | Ver una empresa — solo super admin                                     |
| GET    | `/api/admin/users`           | Listar **todos** los usuarios de todas las empresas — solo super admin |
| GET    | `/api/admin/users/:id`       | Ver un usuario — solo super admin                                      |
| GET    | `/api/admin/posts`           | Listar **todos** los posts de todas las empresas — solo super admin    |
| GET    | `/api/admin/posts/:id`       | Ver un post — solo super admin                                         |


El rol `super_admin` no se puede auto-asignar por registro público: el primer super admin se crea con `npx prisma db seed` (ver `[docs/README.md](docs/README.md#bootstrap-del-super-admin)` para el detalle). Una vez logueado, su JWT trae `role: "super_admin"` y `companyId: null`.

---



### Rutas privadas (requieren `Authorization: Bearer <token>`)



#### Posts


| Método | Ruta             | Descripción            |
| ------ | ---------------- | ---------------------- |
| GET    | `/api/posts`     | Listar todos los posts |
| GET    | `/api/posts/:id` | Obtener post por ID    |
| POST   | `/api/posts`     | Crear post             |
| PUT    | `/api/posts/:id` | Actualizar post        |
| DELETE | `/api/posts/:id` | Eliminar post          |


**Crear post** — body de ejemplo:

```json
{
  "title": "Mi primer post",
  "cover": "https://example.com/imagen.jpg",
  "body": "<p>Contenido del post en HTML o texto.</p>",
  "categoryId": 1,
  "tagIds": [1, 2, 3]
}
```



#### Categorías


| Método | Ruta                  | Descripción          |
| ------ | --------------------- | -------------------- |
| GET    | `/api/categories`     | Listar categorías    |
| GET    | `/api/categories/:id` | Obtener categoría    |
| POST   | `/api/categories`     | Crear categoría      |
| PUT    | `/api/categories/:id` | Actualizar categoría |
| DELETE | `/api/categories/:id` | Eliminar categoría   |




#### Tags


| Método | Ruta            | Descripción    |
| ------ | --------------- | -------------- |
| GET    | `/api/tags`     | Listar tags    |
| GET    | `/api/tags/:id` | Obtener tag    |
| POST   | `/api/tags`     | Crear tag      |
| PUT    | `/api/tags/:id` | Actualizar tag |
| DELETE | `/api/tags/:id` | Eliminar tag   |


---



### Rutas públicas (sin autenticación, CORS: `*`)


| Método | Ruta                      | Descripción                         |
| ------ | ------------------------- | ----------------------------------- |
| GET    | `/api/public/posts`       | Listar posts con filtros opcionales |
| GET    | `/api/public/posts/:slug` | Obtener post por slug               |




#### Filtros disponibles

```
GET /api/public/posts?category=javascript
GET /api/public/posts?tag=node
GET /api/public/posts?page=2&limit=5
GET /api/public/posts?category=javascript&tag=backend&page=1&limit=10
```



#### Respuesta paginada

```json
{
  "success": true,
  "data": [...],
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 10,
    "totalPages": 5
  }
}
```

---



## Incrustar posts en otro sitio

Dado que `/api/public/*` tiene CORS abierto (`*`), puedes consumirlo desde cualquier frontend:

```javascript
// Fetch del listado de posts con tag "node"
const res = await fetch('http://tu-api.com/api/public/posts?tag=node');
const { data, meta } = await res.json();

// Fetch de un post por slug
const post = await fetch('http://tu-api.com/api/public/posts/mi-primer-post-1709123456789');
const { data } = await post.json();
```

---



## Tests

```bash
npm test
```

Corre con el test runner nativo de Node (`node --test`), sin dependencias extra: compila `src/**/*.test.ts` junto al resto del código (vía `tsconfig.test.json`) y ejecuta los `.js` resultantes desde `dist`.

Por ahora son tests unitarios (middlewares y utils) que no requieren la base de datos: `generateSlug`, el middleware `authenticate` (JWT) y `rateLimit`. Los controllers que dependen de Prisma (`checkOwnership`, CRUD de posts/categorías/tags) todavía no tienen cobertura — la opción natural para eso es un test de integración contra un proyecto Supabase de test dedicado (nunca contra el de desarrollo/producción, porque un test que hace `prisma migrate reset` borra datos reales).

## Comandos útiles de Prisma

```bash
# Ver y editar datos en el navegador
npx prisma studio

# Crear una nueva migración tras cambiar el schema
npx prisma migrate dev --name nombre_migracion

# Regenerar el cliente de TypeScript
npx prisma generate

# Resetear la BD (¡cuidado! contra Supabase esto borra datos reales, no un contenedor descartable)
npx prisma migrate reset
```

