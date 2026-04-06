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
import authRouter from './routes/auth';
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
app.set('trust proxy', 1);
app.use(removePoweredBy);
app.use(helmetMiddleware);
app.use(corsMiddleware);

// ──────────────────────────────────────────────
// Parsing
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
// Health check
// ──────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ──────────────────────────────────────────────
// Routes API
// ──────────────────────────────────────────────
app.use('/api/auth', authRouter);
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
