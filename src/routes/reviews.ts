import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../config/supabase';
import { requireAuth, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';

const router = Router();

const reviewSchema = z.object({
  appointment_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

// GET /reviews?pro_id=xxx
router.get('/', async (req, res, next) => {
  try {
    const proIdSchema = z.string().uuid();
    const { success, data: proId } = proIdSchema.safeParse(req.query.pro_id);
    if (!success) {
      res.status(400).json({ error: 'pro_id invalide.' });
      return;
    }

    const { data, error } = await supabase
      .from('reviews')
      .select(`
        id, rating, comment, created_at,
        users!reviews_client_id_fkey(full_name, avatar_url)
      `)
      .eq('pro_id', proId)
      .eq('is_visible', true)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw new AppError(500, 'Erreur récupération avis.');

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /reviews — laisser un avis (client uniquement, après RDV complété)
router.post('/', requireAuth, requireRole('client'), validate(reviewSchema), async (req, res, next) => {
  try {
    const { appointment_id, rating, comment } = req.body as z.infer<typeof reviewSchema>;

    // Vérifie que le RDV appartient au client ET est complété
    const { data: appointment, error: apptError } = await supabase
      .from('appointments')
      .select('id, pro_id, status, client_id')
      .eq('id', appointment_id)
      .eq('client_id', req.auth!.userId)
      .eq('status', 'completed')
      .single();

    if (apptError || !appointment) {
      res.status(403).json({
        error: 'Rendez-vous introuvable, non complété, ou n\'appartient pas à ce compte.',
      });
      return;
    }

    const { data, error } = await supabase
      .from('reviews')
      .insert({
        appointment_id,
        pro_id: appointment.pro_id,
        client_id: req.auth!.userId,
        rating,
        comment: comment ?? null,
        is_visible: true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        res.status(409).json({ error: 'Vous avez déjà laissé un avis pour ce rendez-vous.' });
        return;
      }
      throw new AppError(400, error.message);
    }

    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
