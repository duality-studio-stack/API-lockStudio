import { Router, type Request, type Response } from 'express';
import { Webhook } from 'svix';
import { supabase } from '../config/supabase';
import { logger } from '../config/logger';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

// ──────────────────────────────────────────────
// POST /webhooks/clerk
// Reçoit les événements Clerk (user.created, user.updated, user.deleted)
// Synchronise les utilisateurs dans Supabase
// ──────────────────────────────────────────────
router.post('/clerk', authLimiter, async (req: Request, res: Response): Promise<void> => {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.error('CLERK_WEBHOOK_SECRET manquant');
    res.status(500).json({ error: 'Configuration serveur manquante.' });
    return;
  }

  // Vérification de la signature svix — indispensable pour éviter les requêtes forgées
  const svixId = req.headers['svix-id'] as string;
  const svixTimestamp = req.headers['svix-timestamp'] as string;
  const svixSignature = req.headers['svix-signature'] as string;

  if (!svixId || !svixTimestamp || !svixSignature) {
    res.status(400).json({ error: 'Headers svix manquants.' });
    return;
  }

  const wh = new Webhook(webhookSecret);
  let event: { type: string; data: Record<string, unknown> };

  try {
    // Le body doit être le raw Buffer — configuré dans app.ts
    event = wh.verify(req.body as Buffer, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as typeof event;
  } catch {
    logger.warn('Signature webhook Clerk invalide', { ip: req.ip });
    res.status(400).json({ error: 'Signature invalide.' });
    return;
  }

  const { type, data } = event;

  try {
    if (type === 'user.created') {
      const emailAddresses = data.email_addresses as Array<{ email_address: string }>;
      const firstName = data.first_name as string | null;
      const lastName = data.last_name as string | null;

      await supabase.from('users').insert({
        id: data.id as string,
        email: emailAddresses[0]?.email_address ?? '',
        full_name: [firstName, lastName].filter(Boolean).join(' ') || 'Utilisateur',
        avatar_url: (data.image_url as string) ?? null,
        role: 'client', // rôle défini via Clerk metadata ensuite
      });

      logger.info('Utilisateur créé via webhook Clerk', { userId: data.id });
    }

    if (type === 'user.updated') {
      const emailAddresses = data.email_addresses as Array<{ email_address: string }>;
      const firstName = data.first_name as string | null;
      const lastName = data.last_name as string | null;

      await supabase
        .from('users')
        .update({
          email: emailAddresses[0]?.email_address ?? '',
          full_name: [firstName, lastName].filter(Boolean).join(' ') || 'Utilisateur',
          avatar_url: (data.image_url as string) ?? null,
        })
        .eq('id', data.id as string);
    }

    if (type === 'user.deleted') {
      await supabase.from('users').delete().eq('id', data.id as string);
      logger.info('Utilisateur supprimé via webhook Clerk', { userId: data.id });
    }

    res.status(200).json({ received: true });
  } catch (err) {
    logger.error('Erreur traitement webhook Clerk', { error: err });
    res.status(500).json({ error: 'Erreur interne.' });
  }
});

export default router;
