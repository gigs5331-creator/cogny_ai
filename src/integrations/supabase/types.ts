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
      decks: {
        Row: {
          archived_at: string | null
          course_name: string | null
          created_at: string
          description: string | null
          id: string
          is_public: boolean
          last_studied_at: string | null
          shared_with_program: boolean
          source: string | null
          subject: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          course_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          last_studied_at?: string | null
          shared_with_program?: boolean
          source?: string | null
          subject?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          course_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          last_studied_at?: string | null
          shared_with_program?: boolean
          source?: string | null
          subject?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      flashcards: {
        Row: {
          answer: string
          created_at: string
          deck_id: string
          diagram: string | null
          difficulty: Database["public"]["Enums"]["difficulty"]
          distractors: Json | null
          explanation: string | null
          id: string
          options: Json | null
          position: number
          question: string
          question_type: string
          status: Database["public"]["Enums"]["review_status"]
          topic: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          answer: string
          created_at?: string
          deck_id: string
          diagram?: string | null
          difficulty?: Database["public"]["Enums"]["difficulty"]
          distractors?: Json | null
          explanation?: string | null
          id?: string
          options?: Json | null
          position?: number
          question: string
          question_type?: string
          status?: Database["public"]["Enums"]["review_status"]
          topic?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          answer?: string
          created_at?: string
          deck_id?: string
          diagram?: string | null
          difficulty?: Database["public"]["Enums"]["difficulty"]
          distractors?: Json | null
          explanation?: string | null
          id?: string
          options?: Json | null
          position?: number
          question?: string
          question_type?: string
          status?: Database["public"]["Enums"]["review_status"]
          topic?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          created_at: string
          display_name: string | null
          id: string
          program: string | null
          student_number: string | null
          subjects: string[] | null
          university: string | null
          updated_at: string
          year_part: string | null
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          created_at?: string
          display_name?: string | null
          id: string
          program?: string | null
          student_number?: string | null
          subjects?: string[] | null
          university?: string | null
          updated_at?: string
          year_part?: string | null
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          created_at?: string
          display_name?: string | null
          id?: string
          program?: string | null
          student_number?: string | null
          subjects?: string[] | null
          university?: string | null
          updated_at?: string
          year_part?: string | null
        }
        Relationships: []
      }
      program_messages: {
        Row: {
          body: string
          created_at: string
          display_name: string
          id: string
          program: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          display_name: string
          id?: string
          program: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          display_name?: string
          id?: string
          program?: string
          user_id?: string
        }
        Relationships: []
      }
      study_sessions: {
        Row: {
          completed_at: string
          deck_id: string
          id: string
          mode: string
          score: number
          total: number
          user_id: string
        }
        Insert: {
          completed_at?: string
          deck_id: string
          id?: string
          mode?: string
          score?: number
          total?: number
          user_id: string
        }
        Update: {
          completed_at?: string
          deck_id?: string
          id?: string
          mode?: string
          score?: number
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_sessions_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
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
          role: Database["public"]["Enums"]["app_role"]
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
      profiles_public: {
        Row: {
          display_name: string | null
          id: string | null
          university: string | null
        }
        Insert: {
          display_name?: string | null
          id?: string | null
          university?: string | null
        }
        Update: {
          display_name?: string | null
          id?: string | null
          university?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_leaderboard: {
        Args: never
        Returns: {
          avg_score: number
          display_name: string
          mastered_count: number
          university: string
          user_id: string
        }[]
      }
      get_program_shared_decks: {
        Args: never
        Returns: {
          card_count: number
          course_name: string
          created_at: string
          id: string
          sharer_name: string
          subject: string
          title: string
          user_id: string
        }[]
      }
      get_user_program: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      search_decks_by_program: {
        Args: { p_query: string }
        Returns: {
          card_count: number
          course_name: string
          created_at: string
          id: string
          program: string
          sharer_name: string
          subject: string
          title: string
          user_id: string
        }[]
      }
    }
    Enums: {
      account_type: "university" | "high_school"
      app_role: "admin" | "moderator" | "user"
      difficulty: "Easy" | "Medium" | "Hard"
      review_status: "new" | "got_it" | "missed" | "review_later"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      account_type: ["university", "high_school"],
      app_role: ["admin", "moderator", "user"],
      difficulty: ["Easy", "Medium", "Hard"],
      review_status: ["new", "got_it", "missed", "review_later"],
    },
  },
} as const
