import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';

const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000); // 15 min
const max = Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 100);

// ──────────────────────────────────────────────
// Limiteur général — toutes les routes API
// ──────────────────────────────────────────────
export const globalLimiter = rateLimit({
  windowMs,
  max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Trop de requêtes, veuillez réessayer dans quelques minutes.',
    retryAfter: Math.ceil(windowMs / 1000),
  },
  // Clé par IP + user-agent pour plus de granularité
  keyGenerator: (req) => `${req.ip}-${req.headers['user-agent'] ?? 'unknown'}`,
  skip: (req) => {
    // Ne pas limiter les health checks
    return req.path === '/health';
  },
});

// ──────────────────────────────────────────────
// Limiteur strict — routes auth (login, signup, webhook)
// 10 tentatives / 15 min par IP
// ──────────────────────────────────────────────
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: "Trop de tentatives d'authentification. Réessayez dans 15 minutes.",
  },
});

// ──────────────────────────────────────────────
// Limiteur recherche — évite le scraping
// 30 requêtes / min
// ──────────────────────────────────────────────
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Trop de recherches. Ralentissez.' },
});

// ──────────────────────────────────────────────
// Slow down progressif — ralentit avant de bloquer
// À partir de 50 requêtes : +100ms par requête supplémentaire
// ──────────────────────────────────────────────
export const speedLimiter = slowDown({
  windowMs,
  delayAfter: 50,
  delayMs: (used) => (used - 50) * 100,
});
