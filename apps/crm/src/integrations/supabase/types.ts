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
      clients: {
        Row: {
          created_at: string
          direccion: string | null
          email: string | null
          id: string
          nif_cif: string | null
          nombre: string
          notas: string | null
          num_trabajos: number
          poblacion: string | null
          primera_fecha: string | null
          recurrente: boolean
          rgpd_consent: boolean
          tags: string[]
          telefono: string | null
          ultima_fecha: string | null
          updated_at: string
          user_id: string
          valoracion: number | null
        }
        Insert: {
          created_at?: string
          direccion?: string | null
          email?: string | null
          id?: string
          nif_cif?: string | null
          nombre: string
          notas?: string | null
          num_trabajos?: number
          poblacion?: string | null
          primera_fecha?: string | null
          recurrente?: boolean
          rgpd_consent?: boolean
          tags?: string[]
          telefono?: string | null
          ultima_fecha?: string | null
          updated_at?: string
          user_id: string
          valoracion?: number | null
        }
        Update: {
          created_at?: string
          direccion?: string | null
          email?: string | null
          id?: string
          nif_cif?: string | null
          nombre?: string
          notas?: string | null
          num_trabajos?: number
          poblacion?: string | null
          primera_fecha?: string | null
          recurrente?: boolean
          rgpd_consent?: boolean
          tags?: string[]
          telefono?: string | null
          ultima_fecha?: string | null
          updated_at?: string
          user_id?: string
          valoracion?: number | null
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          address: string | null
          bank_name: string | null
          city: string | null
          country: string | null
          created_at: string
          default_vat: number | null
          email: string | null
          google_reviews_url: string | null
          iban: string | null
          id: string
          legal_name: string | null
          logo_url: string | null
          phone: string | null
          postal_code: string | null
          province: string | null
          singleton: boolean
          tax_id: string | null
          trade_name: string | null
          trustpilot_url: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          bank_name?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          default_vat?: number | null
          email?: string | null
          google_reviews_url?: string | null
          iban?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          singleton?: boolean
          tax_id?: string | null
          trade_name?: string | null
          trustpilot_url?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          bank_name?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          default_vat?: number | null
          email?: string | null
          google_reviews_url?: string | null
          iban?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          singleton?: boolean
          tax_id?: string | null
          trade_name?: string | null
          trustpilot_url?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          id: string
          created_at: string
          nombre: string
          telefono: string | null
          email: string | null
          servicio: string | null
          ubicacion: string | null
          ciudad: string | null
          mensaje: string | null
          origen_pagina: string | null
          estado: 'nuevo' | 'contactado' | 'convertido' | 'descartado'
          notas_internas: string | null
          client_id: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          nombre: string
          telefono?: string | null
          email?: string | null
          servicio?: string | null
          ubicacion?: string | null
          ciudad?: string | null
          mensaje?: string | null
          origen_pagina?: string | null
          estado?: 'nuevo' | 'contactado' | 'convertido' | 'descartado'
          notas_internas?: string | null
          client_id?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          nombre?: string
          telefono?: string | null
          email?: string | null
          servicio?: string | null
          ubicacion?: string | null
          ciudad?: string | null
          mensaje?: string | null
          origen_pagina?: string | null
          estado?: 'nuevo' | 'contactado' | 'convertido' | 'descartado'
          notas_internas?: string | null
          client_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          cantidad: number
          created_at: string
          descripcion: string
          id: string
          invoice_id: string
          iva_aplicable: number
          orden: number
          precio_unit: number
        }
        Insert: {
          cantidad?: number
          created_at?: string
          descripcion: string
          id?: string
          invoice_id: string
          iva_aplicable?: number
          orden?: number
          precio_unit?: number
        }
        Update: {
          cantidad?: number
          created_at?: string
          descripcion?: string
          id?: string
          invoice_id?: string
          iva_aplicable?: number
          orden?: number
          precio_unit?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          created_at: string
          fecha: string
          id: string
          importe: number
          invoice_id: string
          notas: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          fecha?: string
          id?: string
          importe: number
          invoice_id: string
          notas?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          fecha?: string
          id?: string
          importe?: number
          invoice_id?: string
          notas?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          client_id: string | null
          created_at: string
          estado: Database["public"]["Enums"]["invoice_status"]
          fecha_emision: string
          id: string
          iva: number
          notas_legales: string | null
          numero: string
          quote_id: string | null
          serie: string
          subtotal: number
          total: number
          updated_at: string
          user_id: string
          vencimiento: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["invoice_status"]
          fecha_emision?: string
          id?: string
          iva?: number
          notas_legales?: string | null
          numero: string
          quote_id?: string | null
          serie?: string
          subtotal?: number
          total?: number
          updated_at?: string
          user_id: string
          vencimiento?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["invoice_status"]
          fecha_emision?: string
          id?: string
          iva?: number
          notas_legales?: string | null
          numero?: string
          quote_id?: string | null
          serie?: string
          subtotal?: number
          total?: number
          updated_at?: string
          user_id?: string
          vencimiento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          cantidad: number
          created_at: string
          descripcion: string
          id: string
          iva_aplicable: number
          orden: number
          precio_unit: number
          quote_id: string
        }
        Insert: {
          cantidad?: number
          created_at?: string
          descripcion: string
          id?: string
          iva_aplicable?: number
          orden?: number
          precio_unit?: number
          quote_id: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          descripcion?: string
          id?: string
          iva_aplicable?: number
          orden?: number
          precio_unit?: number
          quote_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          ascensor: boolean | null
          client_id: string | null
          created_at: string
          dificultad_acceso: string | null
          estado: Database["public"]["Enums"]["quote_status"]
          fecha: string
          id: string
          is_template: boolean
          iva: number
          metros_cuadrados_estimados: number | null
          notas_operativas: string | null
          numero: string | null
          objetos_recuperables: string | null
          parking: boolean | null
          planta: string | null
          subtotal: number
          template_name: string | null
          tipo_servicio: Database["public"]["Enums"]["service_type"] | null
          tipo_vivienda: string | null
          total: number
          updated_at: string
          urgencia: string | null
          user_id: string
          valido_hasta: string | null
        }
        Insert: {
          ascensor?: boolean | null
          client_id?: string | null
          created_at?: string
          dificultad_acceso?: string | null
          estado?: Database["public"]["Enums"]["quote_status"]
          fecha?: string
          id?: string
          is_template?: boolean
          iva?: number
          metros_cuadrados_estimados?: number | null
          notas_operativas?: string | null
          numero?: string | null
          objetos_recuperables?: string | null
          parking?: boolean | null
          planta?: string | null
          subtotal?: number
          template_name?: string | null
          tipo_servicio?: Database["public"]["Enums"]["service_type"] | null
          tipo_vivienda?: string | null
          total?: number
          updated_at?: string
          urgencia?: string | null
          user_id: string
          valido_hasta?: string | null
        }
        Update: {
          ascensor?: boolean | null
          client_id?: string | null
          created_at?: string
          dificultad_acceso?: string | null
          estado?: Database["public"]["Enums"]["quote_status"]
          fecha?: string
          id?: string
          is_template?: boolean
          iva?: number
          metros_cuadrados_estimados?: number | null
          notas_operativas?: string | null
          numero?: string | null
          objetos_recuperables?: string | null
          parking?: boolean | null
          planta?: string | null
          subtotal?: number
          template_name?: string | null
          tipo_servicio?: Database["public"]["Enums"]["service_type"] | null
          tipo_vivienda?: string | null
          total?: number
          updated_at?: string
          urgencia?: string | null
          user_id?: string
          valido_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      trabajos: {
        Row: {
          id: string
          user_id: string
          quote_id: string | null
          client_id: string | null
          fecha: string | null
          hora: string | null
          direccion: string | null
          tipo_servicio: Database["public"]["Enums"]["service_type"] | null
          notas: string | null
          estado: Database["public"]["Enums"]["trabajo_status"]
          fotos_antes: string[]
          fotos_despues: string[]
          carpeta_fotos_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          quote_id?: string | null
          client_id?: string | null
          fecha?: string | null
          hora?: string | null
          direccion?: string | null
          tipo_servicio?: Database["public"]["Enums"]["service_type"] | null
          notas?: string | null
          estado?: Database["public"]["Enums"]["trabajo_status"]
          fotos_antes?: string[]
          fotos_despues?: string[]
          carpeta_fotos_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          quote_id?: string | null
          client_id?: string | null
          fecha?: string | null
          hora?: string | null
          direccion?: string | null
          tipo_servicio?: Database["public"]["Enums"]["service_type"] | null
          notas?: string | null
          estado?: Database["public"]["Enums"]["trabajo_status"]
          fotos_antes?: string[]
          fotos_despues?: string[]
          carpeta_fotos_url?: string | null
          created_at?: string
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
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      next_invoice_number: {
        Args: { _serie: string; _year: number }
        Returns: string
      }
      next_quote_number: { Args: { _year: number }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "manager" | "employee"
      invoice_status: "pendiente" | "pagada" | "parcial" | "vencida"
      quote_status:
        | "borrador"
        | "enviado"
        | "aceptado"
        | "rechazado"
        | "facturado"
      service_type: "vaciado" | "limpieza" | "retirada_muebles" | "mixto"
      trabajo_status:
        | "pendiente"
        | "confirmado"
        | "en_curso"
        | "completado"
        | "cancelado"
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
      app_role: ["admin", "manager", "employee"],
      invoice_status: ["pendiente", "pagada", "parcial", "vencida"],
      quote_status: [
        "borrador",
        "enviado",
        "aceptado",
        "rechazado",
        "facturado",
      ],
      service_type: ["vaciado", "limpieza", "retirada_muebles", "mixto"],
      trabajo_status: [
        "pendiente",
        "confirmado",
        "en_curso",
        "completado",
        "cancelado",
      ],
    },
  },
} as const
