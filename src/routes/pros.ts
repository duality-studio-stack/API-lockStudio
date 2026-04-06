import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../config/supabase';
import { requireAuth, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { searchLimiter } from '../middleware/rateLimiter';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// ── Schémas de validation ──────────────────────────────────

const searchQuerySchema = z.object({
  category: z.string().max(50).optional(),
  location: z.string().max(100).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  isAtHome: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
});

const updateProfileSchema = z.object({
  business_name: z.string().min(2).max(100).optional(),
  description: z.string().max(1000).optional(),
  location: z.string().max(200).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  price_range_min: z.number().min(0).optional(),
  price_range_max: z.number().min(0).optional(),
  is_at_home: z.boolean().optional(),
  is_in_salon: z.boolean().optional(),
  badge: z.string().max(50).optional(),
});

const createProfileSchema = updateProfileSchema.extend({
  business_name: z.string().min(2).max(100),
  location: z.string().min(2).max(200),
  price_range_min: z.number().min(0),
  price_range_max: z.number().min(0),
});

// ── Routes publiques ───────────────────────────────────────

// GET /pros — liste paginée avec filtres
router.get('/', searchLimiter, validate(searchQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { category, minRating, maxPrice, isAtHome, page, limit } = req.query as unknown as z.infer<typeof searchQuerySchema>;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('pro_profiles')
      .select(`
        *,
        users!inner(full_name, avatar_url),
        pro_specialties(category)
      `, { count: 'exact' })
      .range(offset, offset + limit - 1);

    // Filtres — Supabase utilise des requêtes paramétrées : pas d'injection SQL possible
    if (minRating !== undefined) query = query.gte('rating', minRating);
    if (maxPrice !== undefined) query = query.lte('price_range_max', maxPrice);
    if (isAtHome === 'true') query = query.eq('is_at_home', true);
    if (category) {
      query = query.in('id',
        supabase.from('pro_specialties').select('pro_id').eq('category', category) as never
      );
    }

    const { data, error, count } = await query;

    if (error) throw new AppError(500, 'Erreur lors de la récupération des pros.');

    res.json({
      data,
      pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /pros/:id — fiche d'un pro
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validation UUID côté serveur — évite injection via param
    const uuidSchema = z.string().uuid();
    const parsed = uuidSchema.safeParse(id);
    if (!parsed.success) {
      res.status(400).json({ error: 'ID invalide.' });
      return;
    }

    const { data, error } = await supabase
      .from('pro_profiles')
      .select(`
        *,
        users!inner(full_name, avatar_url, phone),
        pro_specialties(category),
        services(id, name, description, duration_minutes, price, category)
      `)
      .eq('id', parsed.data)
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Pro introuvable.' });
      return;
    }

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// ── Routes protégées (pro uniquement) ─────────────────────

// POST /pros/profile — créer son profil pro
router.post(
  '/profile',
  requireAuth,
  requireRole('pro'),
  validate(createProfileSchema),
  async (req, res, next) => {
    try {
      const { data, error } = await supabase
        .from('pro_profiles')
        .insert({ ...req.body, user_id: req.auth!.userId })
        .select()
        .single();

      if (error) throw new AppError(400, error.message);

      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /pros/profile — modifier son profil
router.patch(
  '/profile',
  requireAuth,
  requireRole('pro'),
  validate(updateProfileSchema),
  async (req, res, next) => {
    try {
      const { data, error } = await supabase
        .from('pro_profiles')
        .update(req.body)
        .eq('user_id', req.auth!.userId)  // impossible de modifier le profil d'un autre
        .select()
        .single();

      if (error) throw new AppError(400, error.message);

      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
