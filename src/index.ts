import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { prisma } from './prisma/client';
import authRoutes from './routes/auth.routes';
import postsRoutes from './routes/posts.routes';
import categoriesRoutes from './routes/categories.routes';
import tagsRoutes from './routes/tags.routes';
import companiesRoutes from './routes/companies.routes';
import adminRoutes from './routes/admin.routes';
import publicRoutes from './routes/public.routes';
import { errorHandler, notFound } from './middlewares/error.middleware';
import openapiDocument from './docs/openapi.json';

const app = express();
const PORT = process.env.PORT ?? 3000;

// URL pública base para el "server" del OpenAPI/Swagger: explícita > la que
// inyecta Render automáticamente > localhost (dev).
const apiBaseUrl = process.env.API_BASE_URL ?? process.env.RENDER_EXTERNAL_URL ?? `http://localhost:${PORT}`;
const resolvedOpenapiDocument = {
  ...openapiDocument,
  servers: [
    { url: apiBaseUrl, description: process.env.NODE_ENV === 'production' ? 'Production' : 'development' },
  ],
};

// ─── CORS configuration ───────────────────────────────────────────────────────
// Public routes allow any origin so that external sites can embed posts freely.
// Private (admin) routes are restricted to the origins listed in .env.
const allowedAdminOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:4200')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

const publicCors = cors({ origin: '*' });

const adminCors = cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedAdminOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`Origin ${origin} not allowed by CORS policy.`));
  },
  credentials: true,
});

// ─── Global middleware ────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Routes ───────────────────────────────────────────────────────────────────

// Public routes: open to any origin
app.use('/api/public', publicCors, publicRoutes);

// Auth routes: apply admin CORS (login from the admin panel only)
app.use('/api/auth', adminCors, authRoutes);

// Company management (POST / requires super admin; /me/* requires auth)
app.use('/api/companies', adminCors, companiesRoutes);

// Super admin: cross-tenant read access to companies, users and posts
app.use('/api/admin', adminCors, adminRoutes);

// Private admin routes
app.use('/api/posts', adminCors, postsRoutes);
app.use('/api/categories', adminCors, categoriesRoutes);
app.use('/api/tags', adminCors, tagsRoutes);

// Health check endpoint (useful for Docker/load-balancer probes)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API documentation (Swagger UI over the OpenAPI 3 spec) ──────────────────
// Served same-origin, so "Try it out" requests hit this API directly without CORS issues.
app.get('/api/docs.json', (_req, res) => res.json(resolvedOpenapiDocument));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(resolvedOpenapiDocument));

// ─── Error handling ───────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Start server ─────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`\n🚀  Server running on http://localhost:${PORT}`);
  console.log(`📖  Environment: ${process.env.NODE_ENV ?? 'development'}\n`);
});

// Graceful shutdown: close Prisma connection on process exit
const shutdown = async () => {
  console.log('\nShutting down gracefully...');
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
