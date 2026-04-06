import helmet from 'helmet';
import cors from 'cors';
import hpp from 'hpp';
import xss from 'xss';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

// ──────────────────────────────────────────────
// Helmet — HTTP security headers
// ──────────────────────────────────────────────
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: true,
  hsts: {
    maxAge: 31536000, // 1 an
    includeSubDomains: true,
    preload: true,
  },
});

// ──────────────────────────────────────────────
// CORS — origines autorisées uniquement
// ──────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Autoriser les requêtes sans origin (Postman, mobile natif)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS bloqué pour l'origine : ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400, // 24h — cache preflight
});

// ──────────────────────────────────────────────
// Protection HTTP Parameter Pollution
// ──────────────────────────────────────────────
export const hppMiddleware: RequestHandler = hpp();

// ──────────────────────────────────────────────
// Nettoyage XSS — sanitise récursivement req.body, req.query, req.params
// ──────────────────────────────────────────────
function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') return xss(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, sanitizeValue(v)])
    );
  }
  return value;
}

export const xssMiddleware: RequestHandler = (req: Request, _res: Response, next: NextFunction): void => {
  req.body = sanitizeValue(req.body);
  req.query = sanitizeValue(req.query) as typeof req.query;
  next();
};

// ──────────────────────────────────────────────
// Taille max du body — évite les attaques par payload énorme
// (configurer dans app.use(express.json({ limit: '10kb' })))
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// Masquer l'en-tête X-Powered-By (déjà fait par helmet)
// ──────────────────────────────────────────────
export const removePoweredBy = (_req: Request, res: Response, next: NextFunction): void => {
  res.removeHeader('X-Powered-By');
  next();
};
