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
      conditions: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          is_active: boolean
          trading_style: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          trading_style?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          trading_style?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quick_notes: {
        Row: {
          asset: string | null
          converted_trade_id: string | null
          created_at: string
          direction: string | null
          id: string
          image_url: string | null
          note: string | null
          profile_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          asset?: string | null
          converted_trade_id?: string | null
          created_at?: string
          direction?: string | null
          id?: string
          image_url?: string | null
          note?: string | null
          profile_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          asset?: string | null
          converted_trade_id?: string | null
          created_at?: string
          direction?: string | null
          id?: string
          image_url?: string | null
          note?: string | null
          profile_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_notes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recap_quiz_attempts: {
        Row: {
          created_at: string
          direction_correct: boolean
          enter_correct: boolean
          guess_direction: string | null
          guess_enter: boolean
          id: string
          profile_id: string | null
          score: number
          trade_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          direction_correct?: boolean
          enter_correct?: boolean
          guess_direction?: string | null
          guess_enter: boolean
          id?: string
          profile_id?: string | null
          score?: number
          trade_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          direction_correct?: boolean
          enter_correct?: boolean
          guess_direction?: string | null
          guess_enter?: boolean
          id?: string
          profile_id?: string | null
          score?: number
          trade_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recap_quiz_attempts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recap_quiz_attempts_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      recap_quiz_condition_results: {
        Row: {
          actual: boolean
          attempt_id: string
          condition_name: string
          created_at: string
          guessed: boolean
          id: string
          profile_id: string | null
          user_id: string
        }
        Insert: {
          actual?: boolean
          attempt_id: string
          condition_name: string
          created_at?: string
          guessed?: boolean
          id?: string
          profile_id?: string | null
          user_id: string
        }
        Update: {
          actual?: boolean
          attempt_id?: string
          condition_name?: string
          created_at?: string
          guessed?: boolean
          id?: string
          profile_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recap_quiz_condition_results_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "recap_quiz_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recap_quiz_condition_results_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      trade_conditions: {
        Row: {
          condition_id: string
          id: string
          trade_id: string
        }
        Insert: {
          condition_id: string
          id?: string
          trade_id: string
        }
        Update: {
          condition_id?: string
          id?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_conditions_condition_id_fkey"
            columns: ["condition_id"]
            isOneToOne: false
            referencedRelation: "conditions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_conditions_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_metric_values: {
        Row: {
          created_at: string
          id: string
          metric_id: string
          trade_id: string
          updated_at: string
          user_id: string
          value: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          metric_id: string
          trade_id: string
          updated_at?: string
          user_id: string
          value?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          metric_id?: string
          trade_id?: string
          updated_at?: string
          user_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trade_metric_values_metric_id_fkey"
            columns: ["metric_id"]
            isOneToOne: false
            referencedRelation: "trade_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_metric_values_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_metrics: {
        Row: {
          created_at: string
          decimals: number
          id: string
          is_active: boolean
          max_value: number | null
          min_value: number | null
          name: string
          profile_id: string | null
          sort_order: number
          unit: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decimals?: number
          id?: string
          is_active?: boolean
          max_value?: number | null
          min_value?: number | null
          name: string
          profile_id?: string | null
          sort_order?: number
          unit?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decimals?: number
          id?: string
          is_active?: boolean
          max_value?: number | null
          min_value?: number | null
          name?: string
          profile_id?: string | null
          sort_order?: number
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_metrics_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_tags: {
        Row: {
          id: string
          tag_id: string
          trade_id: string
        }
        Insert: {
          id?: string
          tag_id: string
          trade_id: string
        }
        Update: {
          id?: string
          tag_id?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_tags_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          asset: string
          created_at: string
          direction: Database["public"]["Enums"]["trade_direction"]
          duration_minutes: number | null
          earned_r: number
          entry_date: string
          id: string
          image_url: string | null
          missed_r: number
          profile_id: string | null
          recap_text: string | null
          result: Database["public"]["Enums"]["trade_result"]
          updated_at: string
          user_id: string
        }
        Insert: {
          asset: string
          created_at?: string
          direction: Database["public"]["Enums"]["trade_direction"]
          duration_minutes?: number | null
          earned_r?: number
          entry_date?: string
          id?: string
          image_url?: string | null
          missed_r?: number
          profile_id?: string | null
          recap_text?: string | null
          result: Database["public"]["Enums"]["trade_result"]
          updated_at?: string
          user_id: string
        }
        Update: {
          asset?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["trade_direction"]
          duration_minutes?: number | null
          earned_r?: number
          entry_date?: string
          id?: string
          image_url?: string | null
          missed_r?: number
          profile_id?: string | null
          recap_text?: string | null
          result?: Database["public"]["Enums"]["trade_result"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_profile_id_fkey"
            columns: ["profile_id"]
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
      import_trades_with_relations: {
        Args: { p_profile_id: string; p_rows: Json }
        Returns: string[]
      }
      create_trade_with_relations: {
        Args: {
          p_profile_id: string
          p_trade: Json
          p_condition_ids?: string[]
          p_tag_ids?: string[]
          p_metric_values?: Json
        }
        Returns: string
      }
      update_trade_with_relations: {
        Args: {
          p_trade_id: string
          p_profile_id: string
          p_trade: Json
          p_condition_ids?: string[]
          p_tag_ids?: string[]
          p_metric_values?: Json
        }
        Returns: string
      }
    }
    Enums: {
      trade_direction: "Long" | "Short"
      trade_result: "Win" | "Loss" | "Break-even" | "Missed" | "Canceled"
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
      trade_direction: ["Long", "Short"],
      trade_result: ["Win", "Loss", "Break-even", "Missed", "Canceled"],
    },
  },
} as const
