import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../config/supabase';
import { requireAuth, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

router.use(requireAuth, requireRole('client'));

// GET /favorites — favoris du client connecté
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('favorites')
      .select(`
        id, created_at,
        pro_profiles!favorites_pro_id_fkey(
          id, business_name, location, rating, review_count, badge,
          users!inner(full_name, avatar_url)
        )
      `)
      .eq('client_id', req.auth!.userId)
      .order('created_at', { ascending: false });

    if (error) throw new AppError(500, 'Erreur récupération favoris.');

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /favorites/:proId — ajouter un favori
router.post('/:proId', async (req, res, next) => {
  try {
    const { success, data: proId } = z.string().uuid().safeParse(req.params.proId);
    if (!success) {
      res.status(400).json({ error: 'ID invalide.' });
      return;
    }

    const { data, error } = await supabase
      .from('favorites')
      .insert({ client_id: req.auth!.userId, pro_id: proId })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        res.status(409).json({ error: 'Ce pro est déjà dans vos favoris.' });
        return;
      }
      throw new AppError(400, error.message);
    }

    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
});

// DELETE /favorites/:proId — retirer un favori
router.delete('/:proId', async (req, res, next) => {
  try {
    const { success, data: proId } = z.string().uuid().safeParse(req.params.proId);
    if (!success) {
      res.status(400).json({ error: 'ID invalide.' });
      return;
    }

    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('client_id', req.auth!.userId)  // ownership check
      .eq('pro_id', proId);

    if (error) throw new AppError(404, 'Favori introuvable.');

    res.json({ message: 'Retiré des favoris.' });
  } catch (err) {
    next(err);
  }
});

export default router;
