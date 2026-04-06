import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../config/supabase';
import { requireAuth, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// Toutes les routes RDV nécessitent une authentification
router.use(requireAuth);

// ── Schémas ───────────────────────────────────────────────

const createAppointmentSchema = z.object({
  pro_id: z.string().uuid(),
  service_id: z.string().uuid(),
  scheduled_at: z.string().datetime({ offset: true }),
  notes: z.string().max(500).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['confirmed', 'cancelled', 'completed', 'no_show']),
});

// ── Routes ─────────────────────────────────────────────────

// GET /appointments — liste des RDV de l'utilisateur connecté
router.get('/', async (req, res, next) => {
  try {
    const { userId, role } = req.auth!;

    let query = supabase
      .from('appointments')
      .select(`
        *,
        services(name, duration_minutes, price),
        pro_profiles!appointments_pro_id_fkey(business_name, location),
        users!appointments_client_id_fkey(full_name, avatar_url)
      `)
      .order('scheduled_at', { ascending: false });

    // Filtre selon le rôle — l'utilisateur ne voit que ses propres RDV
    if (role === 'client') {
      query = query.eq('client_id', userId);
    } else {
      // Pro : récupère son pro_id d'abord
      const { data: proProfile } = await supabase
        .from('pro_profiles')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (!proProfile) {
        res.status(404).json({ error: 'Profil pro introuvable.' });
        return;
      }
      query = query.eq('pro_id', proProfile.id);
    }

    const { data, error } = await query;
    if (error) throw new AppError(500, 'Erreur lors de la récupération des rendez-vous.');

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /appointments/:id — détail d'un RDV
router.get('/:id', async (req, res, next) => {
  try {
    const idSchema = z.string().uuid();
    const { success, data: id } = idSchema.safeParse(req.params.id);
    if (!success) {
      res.status(400).json({ error: 'ID invalide.' });
      return;
    }

    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Rendez-vous introuvable.' });
      return;
    }

    // Vérification d'appartenance : le RDV doit appartenir à l'utilisateur connecté
    const { userId, role } = req.auth!;
    let authorized = data.client_id === userId;

    if (!authorized && role === 'pro') {
      const { data: proProfile } = await supabase
        .from('pro_profiles')
        .select('id')
        .eq('user_id', userId)
        .single();

      authorized = proProfile?.id === data.pro_id;
    }

    if (!authorized) {
      res.status(403).json({ error: 'Accès refusé.' });
      return;
    }

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /appointments — créer un RDV (client uniquement)
router.post(
  '/',
  requireRole('client'),
  validate(createAppointmentSchema),
  async (req, res, next) => {
    try {
      const { pro_id, service_id, scheduled_at, notes } = req.body as z.infer<typeof createAppointmentSchema>;

      // Récupère le service pour avoir prix et durée (snapshot anti-manipulation)
      const { data: service, error: serviceError } = await supabase
        .from('services')
        .select('price, duration_minutes, pro_id')
        .eq('id', service_id)
        .eq('is_active', true)
        .single();

      if (serviceError || !service) {
        res.status(404).json({ error: 'Service introuvable ou inactif.' });
        return;
      }

      // Vérification cohérence pro_id ↔ service
      if (service.pro_id !== pro_id) {
        res.status(400).json({ error: 'Ce service n\'appartient pas à ce pro.' });
        return;
      }

      const { data, error } = await supabase
        .from('appointments')
        .insert({
          pro_id,
          client_id: req.auth!.userId,
          service_id,
          scheduled_at,
          duration_minutes: service.duration_minutes,
          price: service.price,         // prix snapshot — pas modifiable après
          notes: notes ?? null,
          status: 'pending',
          payment_status: 'pending',
        })
        .select()
        .single();

      if (error) {
        // Gestion double réservation (contrainte EXCLUDE de PostgreSQL)
        if (error.code === 'P0001' || error.message.includes('overlaps')) {
          res.status(409).json({ error: 'Ce créneau est déjà pris.' });
          return;
        }
        throw new AppError(400, error.message);
      }

      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /appointments/:id/status — changer le statut (pro uniquement)
router.patch(
  '/:id/status',
  requireRole('pro'),
  validate(updateStatusSchema),
  async (req, res, next) => {
    try {
      const idSchema = z.string().uuid();
      const { success, data: id } = idSchema.safeParse(req.params.id);
      if (!success) {
        res.status(400).json({ error: 'ID invalide.' });
        return;
      }

      // Vérifie que le RDV appartient bien à ce pro
      const { data: proProfile } = await supabase
        .from('pro_profiles')
        .select('id')
        .eq('user_id', req.auth!.userId)
        .single();

      const { data, error } = await supabase
        .from('appointments')
        .update({ status: req.body.status })
        .eq('id', id)
        .eq('pro_id', proProfile?.id ?? '')   // impossible de modifier le RDV d'un autre pro
        .select()
        .single();

      if (error || !data) {
        res.status(404).json({ error: 'Rendez-vous introuvable ou accès refusé.' });
        return;
      }

      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /appointments/:id — annulation (client ou pro)
router.delete('/:id', async (req, res, next) => {
  try {
    const idSchema = z.string().uuid();
    const { success, data: id } = idSchema.safeParse(req.params.id);
    if (!success) {
      res.status(400).json({ error: 'ID invalide.' });
      return;
    }

    const { userId, role } = req.auth!;

    let query = supabase.from('appointments').update({ status: 'cancelled' }).eq('id', id);

    if (role === 'client') {
      query = query.eq('client_id', userId);
    } else {
      const { data: proProfile } = await supabase
        .from('pro_profiles').select('id').eq('user_id', userId).single();
      query = query.eq('pro_id', proProfile?.id ?? '');
    }

    const { data, error } = await query.select().single();

    if (error || !data) {
      res.status(404).json({ error: 'Rendez-vous introuvable ou accès refusé.' });
      return;
    }

    res.json({ message: 'Rendez-vous annulé.', data });
  } catch (err) {
    next(err);
  }
});

export default router;
