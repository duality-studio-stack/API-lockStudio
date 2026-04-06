import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../config/supabase';
import { requireAuth, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';

const router = Router();

const serviceSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  duration_minutes: z.number().int().min(15).max(720),
  price: z.number().int().min(0),  // en centimes (ex: 5000 = 50€)
  category: z.string().max(50),
  is_active: z.boolean().default(true),
});

// GET /services?pro_id=xxx — liste des services d'un pro
router.get('/', async (req, res, next) => {
  try {
    const proIdSchema = z.string().uuid();
    const { success, data: proId } = proIdSchema.safeParse(req.query.pro_id);

    if (!success) {
      res.status(400).json({ error: 'pro_id invalide.' });
      return;
    }

    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('pro_id', proId)
      .eq('is_active', true)
      .order('category');

    if (error) throw new AppError(500, 'Erreur récupération services.');

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /services — créer un service (pro uniquement)
router.post('/', requireAuth, requireRole('pro'), validate(serviceSchema), async (req, res, next) => {
  try {
    const { data: proProfile } = await supabase
      .from('pro_profiles')
      .select('id')
      .eq('user_id', req.auth!.userId)
      .single();

    if (!proProfile) {
      res.status(404).json({ error: 'Profil pro introuvable.' });
      return;
    }

    const { data, error } = await supabase
      .from('services')
      .insert({ ...req.body, pro_id: proProfile.id })
      .select()
      .single();

    if (error) throw new AppError(400, error.message);

    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// PATCH /services/:id — modifier un service
router.patch('/:id', requireAuth, requireRole('pro'), validate(serviceSchema.partial()), async (req, res, next) => {
  try {
    const idSchema = z.string().uuid();
    const { success, data: id } = idSchema.safeParse(req.params.id);
    if (!success) {
      res.status(400).json({ error: 'ID invalide.' });
      return;
    }

    const { data: proProfile } = await supabase
      .from('pro_profiles')
      .select('id')
      .eq('user_id', req.auth!.userId)
      .single();

    const { data, error } = await supabase
      .from('services')
      .update(req.body)
      .eq('id', id)
      .eq('pro_id', proProfile?.id ?? '')  // ownership check
      .select()
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Service introuvable ou accès refusé.' });
      return;
    }

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// DELETE /services/:id — désactiver (soft delete)
router.delete('/:id', requireAuth, requireRole('pro'), async (req, res, next) => {
  try {
    const idSchema = z.string().uuid();
    const { success, data: id } = idSchema.safeParse(req.params.id);
    if (!success) {
      res.status(400).json({ error: 'ID invalide.' });
      return;
    }

    const { data: proProfile } = await supabase
      .from('pro_profiles').select('id').eq('user_id', req.auth!.userId).single();

    const { error } = await supabase
      .from('services')
      .update({ is_active: false })
      .eq('id', id)
      .eq('pro_id', proProfile?.id ?? '');

    if (error) throw new AppError(404, 'Service introuvable ou accès refusé.');

    res.json({ message: 'Service désactivé.' });
  } catch (err) {
    next(err);
  }
});

export default router;
