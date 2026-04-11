export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_activity: {
        Row: {
          amount_usdc: number | null
          blend_success: boolean | null
          blend_tx_hash: string | null
          created_at: string | null
          error_message: string | null
          event_type: string
          id: string
          tx_hash: string | null
          user_id: string | null
          vault_breakdown: Json | null
        }
        Insert: {
          amount_usdc?: number | null
          blend_success?: boolean | null
          blend_tx_hash?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          tx_hash?: string | null
          user_id?: string | null
          vault_breakdown?: Json | null
        }
        Update: {
          amount_usdc?: number | null
          blend_success?: boolean | null
          blend_tx_hash?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          tx_hash?: string | null
          user_id?: string | null
          vault_breakdown?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_status: {
        Row: {
          id: string
          is_active: boolean | null
          last_heartbeat: string | null
          last_split_at: string | null
          total_splits: number | null
          total_yield_usdc: number | null
          updated_at: string | null
          user_id: string | null
          watched_account: string | null
        }
        Insert: {
          id?: string
          is_active?: boolean | null
          last_heartbeat?: string | null
          last_split_at?: string | null
          total_splits?: number | null
          total_yield_usdc?: number | null
          updated_at?: string | null
          user_id?: string | null
          watched_account?: string | null
        }
        Update: {
          id?: string
          is_active?: boolean | null
          last_heartbeat?: string | null
          last_split_at?: string | null
          total_splits?: number | null
          total_yield_usdc?: number | null
          updated_at?: string | null
          user_id?: string | null
          watched_account?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_status_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      users_profile: {
        Row: {
          created_at: string | null
          id: string
          name: string | null
          onboarding_complete: boolean | null
          profile_type: Database["public"]["Enums"]["profile_type"] | null
          stellar_funded: boolean | null
          stellar_public_key: string | null
          stellar_secret_encrypted: string | null
          voice_enabled: boolean | null
        }
        Insert: {
          created_at?: string | null
          id: string
          name?: string | null
          onboarding_complete?: boolean | null
          profile_type?: Database["public"]["Enums"]["profile_type"] | null
          stellar_funded?: boolean | null
          stellar_public_key?: string | null
          stellar_secret_encrypted?: string | null
          voice_enabled?: boolean | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string | null
          onboarding_complete?: boolean | null
          profile_type?: Database["public"]["Enums"]["profile_type"] | null
          stellar_funded?: boolean | null
          stellar_public_key?: string | null
          stellar_secret_encrypted?: string | null
          voice_enabled?: boolean | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      profile_type: "jefa_hogar" | "emprendedora" | "trabajadora" | "freelancer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      profile_type: ["jefa_hogar", "emprendedora", "trabajadora", "freelancer"],
    },
  },
} as const
