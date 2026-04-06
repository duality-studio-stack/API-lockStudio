// Types générés depuis le schéma Supabase
// En prod : utiliser `supabase gen types typescript` pour les maintenir à jour

export type UserRole = 'client' | 'pro';
export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'failed';
export type OrdonnanceStatus = 'draft' | 'sent' | 'accepted' | 'rejected';

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;                  // UUID généré automatiquement
          email: string;
          password_hash: string;
          full_name: string;
          avatar_url: string | null;
          role: UserRole;
          phone: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'id' | 'created_at' | 'updated_at' | 'phone' | 'avatar_url'> & { phone?: string | null; avatar_url?: string | null };
        Update: Partial<Omit<Database['public']['Tables']['users']['Row'], 'id' | 'created_at'>>;
        Relationships: [];
      };

      pro_profiles: {
        Row: {
          id: string;
          user_id: string;
          business_name: string;
          description: string | null;
          location: string;
          lat: number | null;
          lng: number | null;
          price_range_min: number;
          price_range_max: number;
          badge: string | null;          // 'certified', 'top_rated', etc.
          is_at_home: boolean;           // se déplace à domicile
          is_in_salon: boolean;
          stripe_account_id: string | null;
          is_stripe_onboarded: boolean;
          rating: number;
          review_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Pick<Database['public']['Tables']['pro_profiles']['Row'], 'user_id' | 'business_name' | 'location'> & Partial<Omit<Database['public']['Tables']['pro_profiles']['Row'], 'id' | 'user_id' | 'business_name' | 'location' | 'rating' | 'review_count' | 'created_at' | 'updated_at'>>;
        Update: Partial<Database['public']['Tables']['pro_profiles']['Insert']>;
        Relationships: [];
      };

      pro_specialties: {
        Row: {
          id: string;
          pro_id: string;
          category: string;
        };
        Insert: Omit<Database['public']['Tables']['pro_specialties']['Row'], 'id'>;
        Update: never;
        Relationships: [];
      };

      services: {
        Row: {
          id: string;
          pro_id: string;
          name: string;
          description: string | null;
          duration_minutes: number;
          price: number;
          category: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['services']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['services']['Insert']>;
        Relationships: [];
      };

      appointments: {
        Row: {
          id: string;
          pro_id: string;
          client_id: string;
          service_id: string;
          status: AppointmentStatus;
          scheduled_at: string;
          ends_at: string;
          duration_minutes: number;
          price: number;
          notes: string | null;
          payment_status: PaymentStatus;
          payment_intent_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['appointments']['Row'], 'id' | 'created_at' | 'updated_at' | 'payment_intent_id'> & { payment_intent_id?: string | null };
        Update: Partial<Database['public']['Tables']['appointments']['Insert']>;
        Relationships: [];
      };

      reviews: {
        Row: {
          id: string;
          appointment_id: string;
          pro_id: string;
          client_id: string;
          rating: number;             // 1–5
          comment: string | null;
          is_visible: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['reviews']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['reviews']['Insert']>;
        Relationships: [];
      };

      favorites: {
        Row: {
          id: string;
          client_id: string;
          pro_id: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['favorites']['Row'], 'id' | 'created_at'>;
        Update: never;
        Relationships: [];
      };

      ordonnances: {
        Row: {
          id: string;
          pro_id: string;
          client_id: string;
          title: string;
          content: string;            // texte du soin recommandé
          status: OrdonnanceStatus;
          sent_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['ordonnances']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['ordonnances']['Insert']>;
        Relationships: [];
      };

      notifications: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          body: string;
          type: string;               // 'appointment', 'review', 'payment', 'system'
          is_read: boolean;
          data: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['notifications']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
