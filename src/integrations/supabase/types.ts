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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      companies: {
        Row: {
          archived: boolean
          config: Json
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          config?: Json
          created_at?: string
          id: string
          name: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          config?: Json
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      demo_requests: {
        Row: {
          company: string | null
          created_at: string
          email: string
          id: string
          message: string | null
          name: string
          role: string | null
          source_page: string | null
          user_agent: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          id?: string
          message?: string | null
          name: string
          role?: string | null
          source_page?: string | null
          user_agent?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          message?: string | null
          name?: string
          role?: string | null
          source_page?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      licensee_companies: {
        Row: {
          assigned_at: string
          company_id: string
          licensee_id: string
          role: string
        }
        Insert: {
          assigned_at?: string
          company_id: string
          licensee_id: string
          role?: string
        }
        Update: {
          assigned_at?: string
          company_id?: string
          licensee_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "licensee_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensee_companies_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
        ]
      }
      licensees: {
        Row: {
          created_at: string
          id: string
          name: string
          pending_org_role: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          pending_org_role?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          pending_org_role?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_super_admin: boolean
          role: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          is_super_admin?: boolean
          role?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_super_admin?: boolean
          role?: string | null
        }
        Relationships: []
      }
      referral_activity: {
        Row: {
          author_id: string | null
          body: string | null
          company_id: string
          created_at: string
          id: string
          kind: string
          referral_id: string
        }
        Insert: {
          author_id?: string | null
          body?: string | null
          company_id: string
          created_at?: string
          id?: string
          kind?: string
          referral_id: string
        }
        Update: {
          author_id?: string | null
          body?: string | null
          company_id?: string
          created_at?: string
          id?: string
          kind?: string
          referral_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_activity_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_activity_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_activity_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          company_id: string | null
          created_at: string
          detail: Json | null
          field: string | null
          id: string
          referral_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          company_id?: string | null
          created_at?: string
          detail?: Json | null
          field?: string | null
          id?: string
          referral_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          company_id?: string | null
          created_at?: string
          detail?: Json | null
          field?: string | null
          id?: string
          referral_id?: string | null
        }
        Relationships: []
      }
      referral_contacts: {
        Row: {
          address: string | null
          company_id: string
          created_at: string
          email: string | null
          id: string
          is_primary: boolean
          kind: string
          name: string | null
          ok_to_share: boolean
          phone: string | null
          referral_id: string
          relationship: string | null
        }
        Insert: {
          address?: string | null
          company_id: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          kind?: string
          name?: string | null
          ok_to_share?: boolean
          phone?: string | null
          referral_id: string
          relationship?: string | null
        }
        Update: {
          address?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          kind?: string
          name?: string | null
          ok_to_share?: boolean
          phone?: string | null
          referral_id?: string
          relationship?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_contacts_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_ssn: {
        Row: {
          referral_id: string
          ssn_encrypted: string
          updated_at: string
        }
        Insert: {
          referral_id: string
          ssn_encrypted: string
          updated_at?: string
        }
        Update: {
          referral_id?: string
          ssn_encrypted?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_ssn_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: true
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          company_id: string
          from_stage: string | null
          id: string
          referral_id: string
          to_stage: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          company_id: string
          from_stage?: string | null
          id?: string
          referral_id: string
          to_stage?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          company_id?: string
          from_stage?: string | null
          id?: string
          referral_id?: string
          to_stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_status_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_status_history_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          assigned_to: string | null
          city: string | null
          client_record_link: string | null
          company_id: string
          county: string | null
          created_at: string
          created_by: string | null
          date_received: string | null
          decision_date: string | null
          details: Json
          display_label: string | null
          dob: string | null
          first_name: string | null
          id: string
          intake_method: string | null
          is_minor: boolean | null
          last_activity_at: string
          last_name: string | null
          next_followup_date: string | null
          next_followup_owner: string | null
          outcome: string | null
          outcome_reason: string | null
          pay_source: string | null
          preferred_name: string | null
          priority: string
          referring_party: Json | null
          region: string | null
          service_level: string | null
          source_type: string | null
          ssn_last4: string | null
          stage: string
          stage_entered_at: string
          state: string | null
          tsc: Json | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          city?: string | null
          client_record_link?: string | null
          company_id: string
          county?: string | null
          created_at?: string
          created_by?: string | null
          date_received?: string | null
          decision_date?: string | null
          details?: Json
          display_label?: string | null
          dob?: string | null
          first_name?: string | null
          id?: string
          intake_method?: string | null
          is_minor?: boolean | null
          last_activity_at?: string
          last_name?: string | null
          next_followup_date?: string | null
          next_followup_owner?: string | null
          outcome?: string | null
          outcome_reason?: string | null
          pay_source?: string | null
          preferred_name?: string | null
          priority?: string
          referring_party?: Json | null
          region?: string | null
          service_level?: string | null
          source_type?: string | null
          ssn_last4?: string | null
          stage?: string
          stage_entered_at?: string
          state?: string | null
          tsc?: Json | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          city?: string | null
          client_record_link?: string | null
          company_id?: string
          county?: string | null
          created_at?: string
          created_by?: string | null
          date_received?: string | null
          decision_date?: string | null
          details?: Json
          display_label?: string | null
          dob?: string | null
          first_name?: string | null
          id?: string
          intake_method?: string | null
          is_minor?: boolean | null
          last_activity_at?: string
          last_name?: string | null
          next_followup_date?: string | null
          next_followup_owner?: string | null
          outcome?: string | null
          outcome_reason?: string | null
          pay_source?: string | null
          preferred_name?: string | null
          priority?: string
          referring_party?: Json | null
          region?: string | null
          service_level?: string | null
          source_type?: string | null
          ssn_last4?: string | null
          stage?: string
          stage_entered_at?: string
          state?: string | null
          tsc?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_next_followup_owner_fkey"
            columns: ["next_followup_owner"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_company_member: {
        Args: { p_company_id: string; p_email: string; p_role: string }
        Returns: undefined
      }
      can_edit_company: { Args: { p_company_id: string }; Returns: boolean }
      get_company_member_org_roles: {
        Args: { p_company_id: string }
        Returns: {
          email: string
          role: string
        }[]
      }
      get_company_member_status: {
        Args: { p_company_id: string }
        Returns: {
          confirmed_at: string
          email: string
          has_account: boolean
          last_sign_in_at: string
          org_role: string
          pending_org_role: string
        }[]
      }
      has_company_access: { Args: { p_company_id: string }; Returns: boolean }
      is_company_admin: { Args: { p_company_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      postgres_fdw_disconnect: { Args: { "": string }; Returns: boolean }
      postgres_fdw_disconnect_all: { Args: never; Returns: boolean }
      postgres_fdw_get_connections: {
        Args: never
        Returns: Record<string, unknown>[]
      }
      postgres_fdw_handler: { Args: never; Returns: unknown }
      profile_role_tier: { Args: never; Returns: number }
      referral_reveal_ssn: { Args: { p_referral_id: string }; Returns: string }
      referral_set_ssn: {
        Args: { p_referral_id: string; p_ssn: string }
        Returns: undefined
      }
      set_member_org_role: {
        Args: { p_company_id: string; p_role: string; p_target_email: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
