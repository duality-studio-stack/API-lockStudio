import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../config/supabase';
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

router.use(requireAuth);

// GET /notifications
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', req.auth!.userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw new AppError(500, 'Erreur récupération notifications.');

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// PATCH /notifications/:id/read
router.patch('/:id/read', async (req, res, next) => {
  try {
    const { success, data: id } = z.string().uuid().safeParse(req.params.id);
    if (!success) {
      res.status(400).json({ error: 'ID invalide.' });
      return;
    }

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('user_id', req.auth!.userId);  // ownership check

    if (error) throw new AppError(404, 'Notification introuvable.');

    res.json({ message: 'Marquée comme lue.' });
  } catch (err) {
    next(err);
  }
});

// PATCH /notifications/read-all
router.patch('/read-all', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', req.auth!.userId)
      .eq('is_read', false);

    if (error) throw new AppError(500, 'Erreur mise à jour notifications.');

    res.json({ message: 'Toutes les notifications marquées comme lues.' });
  } catch (err) {
    next(err);
  }
});

export default router;
