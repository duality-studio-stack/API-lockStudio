import { ZodSchema, ZodError } from 'zod';
import type { Request, Response, NextFunction } from 'express';

// ──────────────────────────────────────────────
// validate — middleware de validation Zod
// Protège contre les injections et données malformées
// Usage : router.post('/', validate(mySchema), handler)
// ──────────────────────────────────────────────
export const validate =
  (schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const errors = (result.error as ZodError).errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      res.status(422).json({ error: 'Données invalides.', details: errors });
      return;
    }

    // Remplace les données brutes par les données validées et sanitisées
    req[source] = result.data;
    next();
  };
