import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';

import {
  helmetMiddleware,
  corsMiddleware,
  hppMiddleware,
  xssMiddleware,
  removePoweredBy,
} from './middleware/security';
import { globalLimiter, speedLimiter } from './middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { logger } from './config/logger';

// Routes
import webhookRouter from './routes/webhook';
import prosRouter from './routes/pros';
import appointmentsRouter from './routes/appointments';
import servicesRouter from './routes/services';
import reviewsRouter from './routes/reviews';
import favoritesRouter from './routes/favorites';
import notificationsRouter from './routes/notifications';

const app = express();

// ──────────────────────────────────────────────
// Sécurité — ordre critique
// ──────────────────────────────────────────────
app.set('trust proxy', 1);   // Nécessaire pour lire req.ip derrière un reverse proxy (Railway, Render, etc.)
app.use(removePoweredBy);
app.use(helmetMiddleware);
app.use(corsMiddleware);

// ──────────────────────────────────────────────
// Webhook Clerk : doit recevoir le body RAW (avant express.json)
// Important : svix vérifie la signature sur le body brut
// ──────────────────────────────────────────────
app.use('/webhooks', express.raw({ type: 'application/json' }), webhookRouter);

// ──────────────────────────────────────────────
// Parsing (limité à 10kb pour éviter les payloads XXL)
// ──────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ──────────────────────────────────────────────
// Protection XSS + HPP (après parsing)
// ──────────────────────────────────────────────
app.use(xssMiddleware);
app.use(hppMiddleware);

// ──────────────────────────────────────────────
// Rate limiting global + slow down
// ──────────────────────────────────────────────
app.use('/api', globalLimiter);
app.use('/api', speedLimiter);

// ──────────────────────────────────────────────
// Logging HTTP
// ──────────────────────────────────────────────
app.use(
  morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
    skip: (req) => req.path === '/health',
  })
);

// ──────────────────────────────────────────────
// Health check (pas de rate limit, pas de log)
// ──────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ──────────────────────────────────────────────
// Routes API
// ──────────────────────────────────────────────
app.use('/api/pros', prosRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/services', servicesRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/favorites', favoritesRouter);
app.use('/api/notifications', notificationsRouter);

// ──────────────────────────────────────────────
// Handlers finaux
// ──────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
