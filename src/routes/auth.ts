import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { supabase } from '../config/supabase';
import { logger } from '../config/logger';
import { authLimiter } from '../middleware/rateLimiter';
import { requireAuth } from '../middleware/auth';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = '30d';

// ──────────────────────────────────────────────
// POST /auth/register
// ──────────────────────────────────────────────
const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(2),
  role: z.enum(['client', 'pro']),
});

router.post('/register', authLimiter, async (req: Request, res: Response): Promise<void> => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Données invalides.', details: parsed.error.flatten() });
    return;
  }

  const { email, password, full_name, role } = parsed.data;

  // Vérifier si l'email est déjà pris
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .single();

  if (existing) {
    res.status(409).json({ error: 'Cet email est déjà utilisé.' });
    return;
  }

  // Hasher le mot de passe
  const password_hash = await bcrypt.hash(password, 12);

  // Créer l'utilisateur
  const { data: user, error } = await supabase
    .from('users')
    .insert({
      email: email.toLowerCase(),
      password_hash,
      full_name,
      role,
    })
    .select('id, email, full_name, avatar_url, role')
    .single();

  if (error || !user) {
    logger.error('Erreur création utilisateur', { error });
    res.status(500).json({ error: 'Impossible de créer le compte.' });
    return;
  }

  // Si pro, créer un profil pro vide
  if (role === 'pro') {
    await supabase.from('pro_profiles').insert({
      user_id: user.id,
      business_name: full_name,
      location: '',
      price_range_min: 0,
      price_range_max: 0,
    });
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  logger.info('Nouvel utilisateur créé', { userId: user.id, role });

  res.status(201).json({
    data: {
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        avatar_url: user.avatar_url,
        role: user.role,
      },
    },
  });
});

// ──────────────────────────────────────────────
// POST /auth/login
// ──────────────────────────────────────────────
const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', authLimiter, async (req: Request, res: Response): Promise<void> => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Email ou mot de passe invalide.' });
    return;
  }

  const { email, password } = parsed.data;

  const { data: user } = await supabase
    .from('users')
    .select('id, email, full_name, avatar_url, role, password_hash')
    .eq('email', email.toLowerCase())
    .single();

  if (!user || !user.password_hash) {
    res.status(401).json({ error: 'Identifiants incorrects.' });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Identifiants incorrects.' });
    return;
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  res.json({
    data: {
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        avatar_url: user.avatar_url,
        role: user.role,
      },
    },
  });
});

// ──────────────────────────────────────────────
// GET /auth/me — profil de l'utilisateur connecté
// ──────────────────────────────────────────────
router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, full_name, avatar_url, role')
    .eq('id', req.auth!.userId)
    .single();

  if (error || !user) {
    res.status(404).json({ error: 'Utilisateur introuvable.' });
    return;
  }

  res.json({ data: user });
});

export default router;
