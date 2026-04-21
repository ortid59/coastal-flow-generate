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
      allowed_users: {
        Row: {
          created_at: string | null
          email: string
          note: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          note?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          note?: string | null
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          campaign_date: string | null
          campaign_name: string
          canva_design_url: string | null
          client_logo_url: string | null
          client_name: string
          cover_image_url: string | null
          created_at: string | null
          flight_end: string | null
          flight_start: string | null
          id: string
          margin_pct: number | null
          markets: string[] | null
          portal_password_hash: string | null
          portal_password_set_at: string | null
          portal_token: string | null
          proposal_name: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          campaign_date?: string | null
          campaign_name: string
          canva_design_url?: string | null
          client_logo_url?: string | null
          client_name: string
          cover_image_url?: string | null
          created_at?: string | null
          flight_end?: string | null
          flight_start?: string | null
          id?: string
          margin_pct?: number | null
          markets?: string[] | null
          portal_password_hash?: string | null
          portal_password_set_at?: string | null
          portal_token?: string | null
          proposal_name?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          campaign_date?: string | null
          campaign_name?: string
          canva_design_url?: string | null
          client_logo_url?: string | null
          client_name?: string
          cover_image_url?: string | null
          created_at?: string | null
          flight_end?: string | null
          flight_start?: string | null
          id?: string
          margin_pct?: number | null
          markets?: string[] | null
          portal_password_hash?: string | null
          portal_password_set_at?: string | null
          portal_token?: string | null
          proposal_name?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          campaign_id: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          kind: string | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          campaign_id?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          kind?: string | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          campaign_id?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          kind?: string | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          artwork_due_date: string | null
          billboard_photo_url: string | null
          campaign_id: string | null
          city: string | null
          cpm: number | null
          created_at: string | null
          current_advertisers: number | null
          end_date: string | null
          facing: string | null
          format: string | null
          four_week_impressions: number | null
          four_week_periods: number | null
          geopath_id: string | null
          highlights: string | null
          id: string
          included: boolean | null
          inset_map_url: string | null
          insight_bullets: string[] | null
          install_cost: number | null
          latitude: number | null
          location_description: string | null
          longitude: number | null
          loop_length: string | null
          low_res_flag: boolean | null
          market: string | null
          media_type: string | null
          minimap_url: string | null
          negotiated_rate_4wk: number | null
          notes: string | null
          production_cost: number | null
          rate_4week: number | null
          rate_card_4wk: number | null
          read_direction: string | null
          recommended: boolean | null
          size: string | null
          sov_pct: number | null
          spot_length: string | null
          start_date: string | null
          total_cost: number | null
          unit_count: number | null
          unit_number: string
          vendor: string | null
          weekly_impressions: number | null
          zip: string | null
        }
        Insert: {
          artwork_due_date?: string | null
          billboard_photo_url?: string | null
          campaign_id?: string | null
          city?: string | null
          cpm?: number | null
          created_at?: string | null
          current_advertisers?: number | null
          end_date?: string | null
          facing?: string | null
          format?: string | null
          four_week_impressions?: number | null
          four_week_periods?: number | null
          geopath_id?: string | null
          highlights?: string | null
          id?: string
          included?: boolean | null
          inset_map_url?: string | null
          insight_bullets?: string[] | null
          install_cost?: number | null
          latitude?: number | null
          location_description?: string | null
          longitude?: number | null
          loop_length?: string | null
          low_res_flag?: boolean | null
          market?: string | null
          media_type?: string | null
          minimap_url?: string | null
          negotiated_rate_4wk?: number | null
          notes?: string | null
          production_cost?: number | null
          rate_4week?: number | null
          rate_card_4wk?: number | null
          read_direction?: string | null
          recommended?: boolean | null
          size?: string | null
          sov_pct?: number | null
          spot_length?: string | null
          start_date?: string | null
          total_cost?: number | null
          unit_count?: number | null
          unit_number: string
          vendor?: string | null
          weekly_impressions?: number | null
          zip?: string | null
        }
        Update: {
          artwork_due_date?: string | null
          billboard_photo_url?: string | null
          campaign_id?: string | null
          city?: string | null
          cpm?: number | null
          created_at?: string | null
          current_advertisers?: number | null
          end_date?: string | null
          facing?: string | null
          format?: string | null
          four_week_impressions?: number | null
          four_week_periods?: number | null
          geopath_id?: string | null
          highlights?: string | null
          id?: string
          included?: boolean | null
          inset_map_url?: string | null
          insight_bullets?: string[] | null
          install_cost?: number | null
          latitude?: number | null
          location_description?: string | null
          longitude?: number | null
          loop_length?: string | null
          low_res_flag?: boolean | null
          market?: string | null
          media_type?: string | null
          minimap_url?: string | null
          negotiated_rate_4wk?: number | null
          notes?: string | null
          production_cost?: number | null
          rate_4week?: number | null
          rate_card_4wk?: number | null
          read_direction?: string | null
          recommended?: boolean | null
          size?: string | null
          sov_pct?: number | null
          spot_length?: string | null
          start_date?: string | null
          total_cost?: number | null
          unit_count?: number | null
          unit_number?: string
          vendor?: string | null
          weekly_impressions?: number | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_files: {
        Row: {
          campaign_id: string | null
          created_at: string | null
          id: string
          kind: string | null
          original_name: string | null
          storage_path: string
          vendor: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string | null
          id?: string
          kind?: string | null
          original_name?: string | null
          storage_path: string
          vendor?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string | null
          id?: string
          kind?: string | null
          original_name?: string | null
          storage_path?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_files_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_add_allowed_user: {
        Args: { _email: string; _note?: string }
        Returns: undefined
      }
      admin_remove_allowed_user: {
        Args: { _email: string }
        Returns: undefined
      }
      is_allowed_admin: { Args: never; Returns: boolean }
      revoke_campaign_portal: {
        Args: { _campaign_id: string }
        Returns: undefined
      }
      set_campaign_portal_password: {
        Args: { _campaign_id: string; _password: string }
        Returns: string
      }
      verify_portal_password: {
        Args: { _password: string; _token: string }
        Returns: string
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
