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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      match_events: {
        Row: {
          created_at: string
          delta: number
          event_type: string
          id: string
          match_id: string
          match_time: string
          player_id: string | null
          player_name: string
          score_at_event: string | null
          team_id: string
          tournament_id: string
        }
        Insert: {
          created_at?: string
          delta?: number
          event_type: string
          id?: string
          match_id: string
          match_time: string
          player_id?: string | null
          player_name: string
          score_at_event?: string | null
          team_id: string
          tournament_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          event_type?: string
          id?: string
          match_id?: string
          match_time?: string
          player_id?: string | null
          player_name?: string
          score_at_event?: string | null
          team_id?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_events_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      match_referees: {
        Row: {
          created_at: string
          id: string
          match_id: string
          referee_team_id: string
          status: string
          tournament_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          referee_team_id: string
          status?: string
          tournament_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          referee_team_id?: string
          status?: string
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_referees_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_referees_referee_team_id_fkey"
            columns: ["referee_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_referees_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          created_at: string
          field_number: number | null
          id: string
          is_golden_goal: boolean
          is_third_place_match: boolean
          match_date: string | null
          phase: Database["public"]["Enums"]["tournament_phase"]
          round_number: number
          sort_order: number | null
          team1_id: string
          team1_score: number | null
          team2_id: string
          team2_score: number | null
          tournament_id: string | null
          tournament_team1_id: string | null
          tournament_team2_id: string | null
          updated_at: string
          winner_id: string | null
        }
        Insert: {
          created_at?: string
          field_number?: number | null
          id?: string
          is_golden_goal?: boolean
          is_third_place_match?: boolean
          match_date?: string | null
          phase: Database["public"]["Enums"]["tournament_phase"]
          round_number: number
          sort_order?: number | null
          team1_id: string
          team1_score?: number | null
          team2_id: string
          team2_score?: number | null
          tournament_id?: string | null
          tournament_team1_id?: string | null
          tournament_team2_id?: string | null
          updated_at?: string
          winner_id?: string | null
        }
        Update: {
          created_at?: string
          field_number?: number | null
          id?: string
          is_golden_goal?: boolean
          is_third_place_match?: boolean
          match_date?: string | null
          phase?: Database["public"]["Enums"]["tournament_phase"]
          round_number?: number
          sort_order?: number | null
          team1_id?: string
          team1_score?: number | null
          team2_id?: string
          team2_score?: number | null
          tournament_id?: string | null
          tournament_team1_id?: string | null
          tournament_team2_id?: string | null
          updated_at?: string
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_team1_id_fkey"
            columns: ["team1_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team2_id_fkey"
            columns: ["team2_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_team1_id_fkey"
            columns: ["tournament_team1_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_team2_id_fkey"
            columns: ["tournament_team2_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      player_stats: {
        Row: {
          assists: number
          created_at: string
          fouls: number
          goals: number
          id: string
          match_id: string | null
          penalty_1m: number
          penalty_2m: number
          penalty_30s: number
          player_id: string | null
          tournament_id: string | null
          tournament_team_player_id: string | null
          updated_at: string
        }
        Insert: {
          assists?: number
          created_at?: string
          fouls?: number
          goals?: number
          id?: string
          match_id?: string | null
          penalty_1m?: number
          penalty_2m?: number
          penalty_30s?: number
          player_id?: string | null
          tournament_id?: string | null
          tournament_team_player_id?: string | null
          updated_at?: string
        }
        Update: {
          assists?: number
          created_at?: string
          fouls?: number
          goals?: number
          id?: string
          match_id?: string | null
          penalty_1m?: number
          penalty_2m?: number
          penalty_30s?: number
          player_id?: string | null
          tournament_id?: string | null
          tournament_team_player_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_stats_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_stats_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_stats_tournament_team_player_id_fkey"
            columns: ["tournament_team_player_id"]
            isOneToOne: false
            referencedRelation: "tournament_team_players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          created_at: string
          id: string
          name: string
          team_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          team_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          linked_player_id: string | null
          nickname: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          linked_player_id?: string | null
          nickname?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          linked_player_id?: string | null
          nickname?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_linked_player_id_fkey"
            columns: ["linked_player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      referee_stations: {
        Row: {
          created_at: string
          current_match_id: string | null
          id: string
          is_active: boolean
          station_name: string
          station_number: number
          timer_duration_seconds: number | null
          timer_elapsed_when_paused: number | null
          timer_paused_at: string | null
          timer_started_at: string | null
          timer_total_adjusted: number | null
          tournament_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_match_id?: string | null
          id?: string
          is_active?: boolean
          station_name?: string
          station_number: number
          timer_duration_seconds?: number | null
          timer_elapsed_when_paused?: number | null
          timer_paused_at?: string | null
          timer_started_at?: string | null
          timer_total_adjusted?: number | null
          tournament_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_match_id?: string | null
          id?: string
          is_active?: boolean
          station_name?: string
          station_number?: number
          timer_duration_seconds?: number | null
          timer_elapsed_when_paused?: number | null
          timer_paused_at?: string | null
          timer_started_at?: string | null
          timer_total_adjusted?: number | null
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referee_stations_current_match_id_fkey"
            columns: ["current_match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referee_stations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      team_stats: {
        Row: {
          draws: number
          goals_against: number
          goals_for: number
          id: string
          losses: number
          points: number
          team_id: string | null
          tournament_id: string | null
          tournament_team_id: string | null
          updated_at: string
          wins: number
        }
        Insert: {
          draws?: number
          goals_against?: number
          goals_for?: number
          id?: string
          losses?: number
          points?: number
          team_id?: string | null
          tournament_id?: string | null
          tournament_team_id?: string | null
          updated_at?: string
          wins?: number
        }
        Update: {
          draws?: number
          goals_against?: number
          goals_for?: number
          id?: string
          losses?: number
          points?: number
          team_id?: string | null
          tournament_id?: string | null
          tournament_team_id?: string | null
          updated_at?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "team_stats_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_stats_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_stats_tournament_team_id_fkey"
            columns: ["tournament_team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      tournament_team_players: {
        Row: {
          created_at: string
          id: string
          player_id: string
          tournament_team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          player_id: string
          tournament_team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          player_id?: string
          tournament_team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_team_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_team_players_tournament_team_id_fkey"
            columns: ["tournament_team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_teams: {
        Row: {
          created_at: string
          group_name: string | null
          id: string
          team_id: string
          tournament_id: string
        }
        Insert: {
          created_at?: string
          group_name?: string | null
          id?: string
          team_id: string
          tournament_id: string
        }
        Update: {
          created_at?: string
          group_name?: string | null
          id?: string
          team_id?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_teams_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          auto_closed_at: string | null
          break_duration_minutes: number | null
          created_at: string
          created_by: string
          current_phase: Database["public"]["Enums"]["tournament_phase"]
          elimination_type:
            | Database["public"]["Enums"]["elimination_type"]
            | null
          end_date: string
          id: string
          initial_phase: Database["public"]["Enums"]["tournament_phase"] | null
          is_closed: boolean
          is_manually_closed: boolean
          match_duration_minutes: number | null
          name: string
          number_of_fields: number | null
          number_of_groups: number | null
          schedule_start_time: string | null
          start_date: string
          teams_for_elimination: number | null
          updated_at: string
        }
        Insert: {
          auto_closed_at?: string | null
          break_duration_minutes?: number | null
          created_at?: string
          created_by: string
          current_phase?: Database["public"]["Enums"]["tournament_phase"]
          elimination_type?:
            | Database["public"]["Enums"]["elimination_type"]
            | null
          end_date: string
          id?: string
          initial_phase?: Database["public"]["Enums"]["tournament_phase"] | null
          is_closed?: boolean
          is_manually_closed?: boolean
          match_duration_minutes?: number | null
          name: string
          number_of_fields?: number | null
          number_of_groups?: number | null
          schedule_start_time?: string | null
          start_date: string
          teams_for_elimination?: number | null
          updated_at?: string
        }
        Update: {
          auto_closed_at?: string | null
          break_duration_minutes?: number | null
          created_at?: string
          created_by?: string
          current_phase?: Database["public"]["Enums"]["tournament_phase"]
          elimination_type?:
            | Database["public"]["Enums"]["elimination_type"]
            | null
          end_date?: string
          id?: string
          initial_phase?: Database["public"]["Enums"]["tournament_phase"] | null
          is_closed?: boolean
          is_manually_closed?: boolean
          match_duration_minutes?: number | null
          name?: string
          number_of_fields?: number | null
          number_of_groups?: number | null
          schedule_start_time?: string | null
          start_date?: string
          teams_for_elimination?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_server_time: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      elimination_type: "single" | "double"
      match_result: "win" | "loss" | "draw"
      tournament_phase:
        | "round_robin"
        | "elimination"
        | "swiss"
        | "single_elimination"
        | "double_elimination"
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
      app_role: ["admin", "user"],
      elimination_type: ["single", "double"],
      match_result: ["win", "loss", "draw"],
      tournament_phase: [
        "round_robin",
        "elimination",
        "swiss",
        "single_elimination",
        "double_elimination",
      ],
    },
  },
} as const
