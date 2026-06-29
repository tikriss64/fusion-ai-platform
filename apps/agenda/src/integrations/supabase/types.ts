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
      appointments: {
        Row: {
          cliente_id: string | null
          created_at: string
          estado: Database["public"]["Enums"]["appointment_status"]
          fecha: string
          hora_fin: string
          hora_inicio: string
          id: string
          magic_link_token: string
          notas: string | null
          pago_id: string | null
          profesional_id: string | null
          resource_id: string | null
          servicio_id: string | null
          tenant_id: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["appointment_status"]
          fecha: string
          hora_fin: string
          hora_inicio: string
          id?: string
          magic_link_token?: string
          notas?: string | null
          pago_id?: string | null
          profesional_id?: string | null
          resource_id?: string | null
          servicio_id?: string | null
          tenant_id: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["appointment_status"]
          fecha?: string
          hora_fin?: string
          hora_inicio?: string
          id?: string
          magic_link_token?: string
          notas?: string | null
          pago_id?: string | null
          profesional_id?: string | null
          resource_id?: string | null
          servicio_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nombre: string
          notas_internas: string | null
          rgpd_consent: boolean
          rgpd_consent_date: string | null
          telefono: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          nombre: string
          notas_internas?: string | null
          rgpd_consent?: boolean
          rgpd_consent_date?: string | null
          telefono?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nombre?: string
          notas_internas?: string | null
          rgpd_consent?: boolean
          rgpd_consent_date?: string | null
          telefono?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_counters: {
        Row: {
          last_number: number
          tenant_id: string
          year: number
        }
        Insert: {
          last_number?: number
          tenant_id: string
          year: number
        }
        Update: {
          last_number?: number
          tenant_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_counters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          cliente_email: string | null
          cliente_nombre: string | null
          created_at: string
          fecha: string
          id: string
          importe_iva: number
          importe_neto: number
          importe_total: number
          iva_porcentaje: number
          numero_factura: string
          payment_id: string | null
          pdf_url: string | null
          tenant_id: string
        }
        Insert: {
          cliente_email?: string | null
          cliente_nombre?: string | null
          created_at?: string
          fecha?: string
          id?: string
          importe_iva?: number
          importe_neto?: number
          importe_total?: number
          iva_porcentaje?: number
          numero_factura: string
          payment_id?: string | null
          pdf_url?: string | null
          tenant_id: string
        }
        Update: {
          cliente_email?: string | null
          cliente_nombre?: string | null
          created_at?: string
          fecha?: string
          id?: string
          importe_iva?: number
          importe_neto?: number
          importe_total?: number
          iva_porcentaje?: number
          numero_factura?: string
          payment_id?: string | null
          pdf_url?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          appointment_id: string | null
          created_at: string
          error: string | null
          estado: Database["public"]["Enums"]["notification_status"]
          id: string
          kind: string | null
          sent_at: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          error?: string | null
          estado?: Database["public"]["Enums"]["notification_status"]
          id?: string
          kind?: string | null
          sent_at?: string | null
          tenant_id: string
          tipo: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          error?: string | null
          estado?: Database["public"]["Enums"]["notification_status"]
          id?: string
          kind?: string | null
          sent_at?: string | null
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          appointment_id: string | null
          created_at: string
          estado: Database["public"]["Enums"]["payment_status"]
          expires_at: string | null
          id: string
          importe: number
          invoice_pdf_url: string | null
          moneda: string
          stripe_payment_intent_id: string | null
          tenant_id: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["payment_status"]
          expires_at?: string | null
          id?: string
          importe?: number
          invoice_pdf_url?: string | null
          moneda?: string
          stripe_payment_intent_id?: string | null
          tenant_id: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["payment_status"]
          expires_at?: string | null
          id?: string
          importe?: number
          invoice_pdf_url?: string | null
          moneda?: string
          stripe_payment_intent_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          created_at: string
          email: string | null
          horarios: Json
          id: string
          nombre: string
          servicios_asignados: string[]
          tenant_id: string
          user_id: string | null
          vacation_mode: boolean
        }
        Insert: {
          created_at?: string
          email?: string | null
          horarios?: Json
          id?: string
          nombre: string
          servicios_asignados?: string[]
          tenant_id: string
          user_id?: string | null
          vacation_mode?: boolean
        }
        Update: {
          created_at?: string
          email?: string | null
          horarios?: Json
          id?: string
          nombre?: string
          servicios_asignados?: string[]
          tenant_id?: string
          user_id?: string | null
          vacation_mode?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "professionals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          capacidad: number
          created_at: string
          id: string
          nombre: string
          tenant_id: string
          tipo: Database["public"]["Enums"]["resource_type"]
        }
        Insert: {
          capacidad?: number
          created_at?: string
          id?: string
          nombre: string
          tenant_id: string
          tipo?: Database["public"]["Enums"]["resource_type"]
        }
        Update: {
          capacidad?: number
          created_at?: string
          id?: string
          nombre?: string
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["resource_type"]
        }
        Relationships: [
          {
            foreignKeyName: "resources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          buffer_after_min: number
          buffer_before_min: number
          categoria: string | null
          color: string | null
          created_at: string
          duracion_min: number
          id: string
          nombre: string
          precio: number
          tenant_id: string
        }
        Insert: {
          buffer_after_min?: number
          buffer_before_min?: number
          categoria?: string | null
          color?: string | null
          created_at?: string
          duracion_min?: number
          id?: string
          nombre: string
          precio?: number
          tenant_id: string
        }
        Update: {
          buffer_after_min?: number
          buffer_before_min?: number
          categoria?: string | null
          color?: string | null
          created_at?: string
          duracion_min?: number
          id?: string
          nombre?: string
          precio?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          business_hours: Json
          color_primario: string | null
          color_secundario: string | null
          created_at: string
          exceptions: Json
          id: string
          idioma: string
          idioma_panel: string
          iva_porcentaje: number
          logo_url: string | null
          politica_cancelacion_horas: number
          politica_cancelacion_penalizacion: number
          reminder_1h: boolean
          reminder_24h: boolean
          sms_enabled: boolean
          tenant_id: string
        }
        Insert: {
          business_hours?: Json
          color_primario?: string | null
          color_secundario?: string | null
          created_at?: string
          exceptions?: Json
          id?: string
          idioma?: string
          idioma_panel?: string
          iva_porcentaje?: number
          logo_url?: string | null
          politica_cancelacion_horas?: number
          politica_cancelacion_penalizacion?: number
          reminder_1h?: boolean
          reminder_24h?: boolean
          sms_enabled?: boolean
          tenant_id: string
        }
        Update: {
          business_hours?: Json
          color_primario?: string | null
          color_secundario?: string | null
          created_at?: string
          exceptions?: Json
          id?: string
          idioma?: string
          idioma_panel?: string
          iva_porcentaje?: number
          logo_url?: string | null
          politica_cancelacion_horas?: number
          politica_cancelacion_penalizacion?: number
          reminder_1h?: boolean
          reminder_24h?: boolean
          sms_enabled?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          estado: Database["public"]["Enums"]["subscription_status"]
          id: string
          plan: Database["public"]["Enums"]["tenant_plan"]
          renewal_date: string | null
          stripe_subscription_id: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          estado?: Database["public"]["Enums"]["subscription_status"]
          id?: string
          plan?: Database["public"]["Enums"]["tenant_plan"]
          renewal_date?: string | null
          stripe_subscription_id?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          estado?: Database["public"]["Enums"]["subscription_status"]
          id?: string
          plan?: Database["public"]["Enums"]["tenant_plan"]
          renewal_date?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          ciudad: string | null
          created_at: string
          id: string
          moneda: string
          nombre: string
          onboarding_completed: boolean
          onboarding_step: number
          plan: Database["public"]["Enums"]["tenant_plan"]
          slug: string
          tipo_negocio: string | null
          trial_ends_at: string
          zona_horaria: string
        }
        Insert: {
          ciudad?: string | null
          created_at?: string
          id?: string
          moneda?: string
          nombre: string
          onboarding_completed?: boolean
          onboarding_step?: number
          plan?: Database["public"]["Enums"]["tenant_plan"]
          slug: string
          tipo_negocio?: string | null
          trial_ends_at?: string
          zona_horaria?: string
        }
        Update: {
          ciudad?: string | null
          created_at?: string
          id?: string
          moneda?: string
          nombre?: string
          onboarding_completed?: boolean
          onboarding_step?: number
          plan?: Database["public"]["Enums"]["tenant_plan"]
          slug?: string
          tipo_negocio?: string | null
          trial_ends_at?: string
          zona_horaria?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          cliente_email: string | null
          cliente_nombre: string
          cliente_telefono: string | null
          confirm_token: string
          created_at: string
          estado: string
          id: string
          notas: string | null
          notified_at: string | null
          servicio_id: string | null
          tenant_id: string
        }
        Insert: {
          cliente_email?: string | null
          cliente_nombre: string
          cliente_telefono?: string | null
          confirm_token?: string
          created_at?: string
          estado?: string
          id?: string
          notas?: string | null
          notified_at?: string | null
          servicio_id?: string | null
          tenant_id: string
        }
        Update: {
          cliente_email?: string | null
          cliente_nombre?: string
          cliente_telefono?: string | null
          confirm_token?: string
          created_at?: string
          estado?: string
          id?: string
          notas?: string | null
          notified_at?: string | null
          servicio_id?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_tenant_id: { Args: never; Returns: string }
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      next_invoice_number: { Args: { _tenant_id: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "staff"
      appointment_status:
        | "pending"
        | "confirmed"
        | "cancelled"
        | "completed"
        | "no_show"
      notification_status: "queued" | "sent" | "failed"
      notification_type: "email" | "sms"
      payment_status: "pending" | "paid" | "failed" | "refunded"
      resource_type: "sala" | "equipo"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "incomplete"
      tenant_plan: "trial" | "starter" | "pro" | "business"
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
      app_role: ["admin", "staff"],
      appointment_status: [
        "pending",
        "confirmed",
        "cancelled",
        "completed",
        "no_show",
      ],
      notification_status: ["queued", "sent", "failed"],
      notification_type: ["email", "sms"],
      payment_status: ["pending", "paid", "failed", "refunded"],
      resource_type: ["sala", "equipo"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "incomplete",
      ],
      tenant_plan: ["trial", "starter", "pro", "business"],
    },
  },
} as const
