import { clerkClient } from '../config/clerk';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

// Étend le type Request pour y attacher l'utilisateur vérifié
declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: 'client' | 'pro';
        email: string;
      };
    }
  }
}

// ──────────────────────────────────────────────
// requireAuth — vérifie le token Clerk Bearer
// Attache req.auth si valide, rejette sinon
// ──────────────────────────────────────────────
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token manquant ou mal formé.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    // Vérifie et décode le JWT Clerk (sans appel réseau — vérification locale)
    const payload = await clerkClient.verifyToken(token);

    // Récupère les metadata pour le rôle
    const user = await clerkClient.users.getUser(payload.sub);
    const role = (user.publicMetadata?.role as 'client' | 'pro') ?? 'client';
    const email = user.emailAddresses[0]?.emailAddress ?? '';

    req.auth = {
      userId: payload.sub,
      role,
      email,
    };

    next();
  } catch (err) {
    logger.warn('Token Clerk invalide', { error: err, ip: req.ip });
    res.status(401).json({ error: 'Token invalide ou expiré.' });
  }
};

// ──────────────────────────────────────────────
// requireRole — vérifie le rôle de l'utilisateur
// Usage : router.get('/pro-only', requireAuth, requireRole('pro'), handler)
// ──────────────────────────────────────────────
export const requireRole =
  (role: 'client' | 'pro') =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Non authentifié.' });
      return;
    }
    if (req.auth.role !== role) {
      res.status(403).json({ error: 'Accès refusé.' });
      return;
    }
    next();
  };
