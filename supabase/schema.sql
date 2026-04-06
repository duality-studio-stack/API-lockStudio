-- ============================================================
-- LockStudio — Schéma Supabase
-- Exécuter dans l'ordre dans l'éditeur SQL Supabase
-- ============================================================

-- Extensions utiles
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TYPES ENUM
-- ============================================================

CREATE TYPE user_role AS ENUM ('client', 'pro');
CREATE TYPE appointment_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed', 'no_show');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'refunded', 'failed');
CREATE TYPE ordonnance_status AS ENUM ('draft', 'sent', 'accepted', 'rejected');

-- ============================================================
-- TABLE : users
-- Synchronisée avec Clerk via webhook
-- ============================================================

CREATE TABLE public.users (
  id            TEXT PRIMARY KEY,           -- clerk_user_id (ex: user_2abc...)
  email         TEXT NOT NULL UNIQUE,
  full_name     TEXT NOT NULL,
  avatar_url    TEXT,
  role          user_role NOT NULL DEFAULT 'client',
  phone         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Contrainte : email valide (simple check, pas de regex complexe)
ALTER TABLE public.users
  ADD CONSTRAINT users_email_format CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- Contrainte : téléphone si fourni (format E.164 ou format FR)
ALTER TABLE public.users
  ADD CONSTRAINT users_phone_format CHECK (phone IS NULL OR phone ~* '^\+?[0-9\s\-]{7,20}$');

-- ============================================================
-- TABLE : pro_profiles
-- Profil étendu des locticiens
-- ============================================================

CREATE TABLE public.pro_profiles (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  business_name        TEXT NOT NULL,
  description          TEXT,
  location             TEXT NOT NULL,
  lat                  DOUBLE PRECISION,
  lng                  DOUBLE PRECISION,
  price_range_min      INTEGER NOT NULL DEFAULT 0 CHECK (price_range_min >= 0),
  price_range_max      INTEGER NOT NULL DEFAULT 0 CHECK (price_range_max >= price_range_min),
  badge                TEXT,
  is_at_home           BOOLEAN NOT NULL DEFAULT FALSE,
  is_in_salon          BOOLEAN NOT NULL DEFAULT TRUE,
  stripe_account_id    TEXT,
  is_stripe_onboarded  BOOLEAN NOT NULL DEFAULT FALSE,
  rating               NUMERIC(3, 2) NOT NULL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  review_count         INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

-- Contrainte : un seul profil pro par user
CREATE INDEX idx_pro_profiles_user_id ON public.pro_profiles(user_id);
CREATE INDEX idx_pro_profiles_location ON public.pro_profiles(lat, lng);

-- ============================================================
-- TABLE : pro_specialties
-- Catégories de services proposées par un pro
-- ============================================================

CREATE TABLE public.pro_specialties (
  id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pro_id  UUID NOT NULL REFERENCES public.pro_profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  UNIQUE (pro_id, category)
);

-- ============================================================
-- TABLE : services
-- Prestations proposées par un pro
-- ============================================================

CREATE TABLE public.services (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pro_id            UUID NOT NULL REFERENCES public.pro_profiles(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  duration_minutes  INTEGER NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 720), -- max 12h
  price             INTEGER NOT NULL CHECK (price >= 0),                                         -- en centimes
  category          TEXT NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_services_pro_id ON public.services(pro_id);
CREATE INDEX idx_services_category ON public.services(category);

-- ============================================================
-- TABLE : appointments
-- Rendez-vous entre un client et un pro
-- ============================================================

CREATE TABLE public.appointments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pro_id            UUID NOT NULL REFERENCES public.pro_profiles(id),
  client_id         TEXT NOT NULL REFERENCES public.users(id),
  service_id        UUID NOT NULL REFERENCES public.services(id),
  status            appointment_status NOT NULL DEFAULT 'pending',
  scheduled_at      TIMESTAMPTZ NOT NULL,
  duration_minutes  INTEGER NOT NULL,
  price             INTEGER NOT NULL CHECK (price >= 0),  -- snapshot au moment de la résa
  notes             TEXT,
  payment_status    payment_status NOT NULL DEFAULT 'pending',
  payment_intent_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Un client ne peut pas avoir deux RDV au même moment
  CONSTRAINT no_double_booking_client EXCLUDE USING gist (
    client_id WITH =,
    tstzrange(scheduled_at, scheduled_at + (duration_minutes * INTERVAL '1 minute')) WITH &&
  ),

  -- Un pro ne peut pas avoir deux RDV au même moment
  CONSTRAINT no_double_booking_pro EXCLUDE USING gist (
    pro_id WITH =,
    tstzrange(scheduled_at, scheduled_at + (duration_minutes * INTERVAL '1 minute')) WITH &&
  )
);

-- Activer l'extension pour les exclusions de plages (déjà installée sur Supabase)
CREATE EXTENSION IF NOT EXISTS "btree_gist";

CREATE INDEX idx_appointments_pro_id ON public.appointments(pro_id);
CREATE INDEX idx_appointments_client_id ON public.appointments(client_id);
CREATE INDEX idx_appointments_scheduled_at ON public.appointments(scheduled_at);
CREATE INDEX idx_appointments_status ON public.appointments(status);

-- ============================================================
-- TABLE : reviews
-- Avis laissés après un RDV complété
-- ============================================================

CREATE TABLE public.reviews (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  appointment_id  UUID NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
  pro_id          UUID NOT NULL REFERENCES public.pro_profiles(id),
  client_id       TEXT NOT NULL REFERENCES public.users(id),
  rating          SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment         TEXT CHECK (char_length(comment) <= 1000),  -- limite XSS côté BDD aussi
  is_visible      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Un avis par RDV (UNIQUE sur appointment_id déjà fait)
  CONSTRAINT one_review_per_appointment UNIQUE (appointment_id)
);

CREATE INDEX idx_reviews_pro_id ON public.reviews(pro_id);

-- ============================================================
-- TABLE : favorites
-- Pros favoris d'un client
-- ============================================================

CREATE TABLE public.favorites (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id   TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  pro_id      UUID NOT NULL REFERENCES public.pro_profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, pro_id)
);

CREATE INDEX idx_favorites_client_id ON public.favorites(client_id);

-- ============================================================
-- TABLE : ordonnances
-- Recommandations de soin envoyées par un pro à un client
-- ============================================================

CREATE TABLE public.ordonnances (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pro_id      UUID NOT NULL REFERENCES public.pro_profiles(id),
  client_id   TEXT NOT NULL REFERENCES public.users(id),
  title       TEXT NOT NULL CHECK (char_length(title) <= 200),
  content     TEXT NOT NULL CHECK (char_length(content) <= 5000),
  status      ordonnance_status NOT NULL DEFAULT 'draft',
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ordonnances_pro_id ON public.ordonnances(pro_id);
CREATE INDEX idx_ordonnances_client_id ON public.ordonnances(client_id);

-- ============================================================
-- TABLE : notifications
-- ============================================================

CREATE TABLE public.notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  type        TEXT NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  data        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_is_read ON public.notifications(user_id, is_read);

-- ============================================================
-- TRIGGERS : updated_at automatique
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER pro_profiles_updated_at
  BEFORE UPDATE ON public.pro_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TRIGGER : recalcul du rating du pro à chaque avis
-- ============================================================

CREATE OR REPLACE FUNCTION recalculate_pro_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.pro_profiles
  SET
    rating = (
      SELECT ROUND(AVG(rating)::numeric, 2)
      FROM public.reviews
      WHERE pro_id = NEW.pro_id AND is_visible = TRUE
    ),
    review_count = (
      SELECT COUNT(*)
      FROM public.reviews
      WHERE pro_id = NEW.pro_id AND is_visible = TRUE
    )
  WHERE id = NEW.pro_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reviews_update_pro_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION recalculate_pro_rating();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- CRITIQUE : protège les données même si l'API est compromise
-- Note : avec service_role_key côté serveur, RLS est bypassed
-- Activer RLS pour protéger l'accès direct (Supabase client)
-- ============================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pro_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordonnances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policies : lecture publique des pros et services
CREATE POLICY "pros publics" ON public.pro_profiles
  FOR SELECT USING (true);

CREATE POLICY "services publics" ON public.services
  FOR SELECT USING (is_active = true);

CREATE POLICY "reviews visibles" ON public.reviews
  FOR SELECT USING (is_visible = true);

-- Policies : un utilisateur ne voit que ses propres données
-- (utilisées si on expose directement Supabase au client — déconseillé)
CREATE POLICY "user voit son profil" ON public.users
  FOR ALL USING (auth.uid()::text = id);

CREATE POLICY "client voit ses rdv" ON public.appointments
  FOR SELECT USING (auth.uid()::text = client_id);

CREATE POLICY "client gère ses favoris" ON public.favorites
  FOR ALL USING (auth.uid()::text = client_id);

CREATE POLICY "user voit ses notifs" ON public.notifications
  FOR ALL USING (auth.uid()::text = user_id);
