/**
 * Minimal hand-written types for the four public tables.
 *
 * Columns that the browser is allowed to omit (because they default in
 * Postgres, e.g. `user_id` from auth.uid() and ids from gen_random_uuid())
 * are optional in `Insert`.
 */
export interface Database {
  public: {
    Tables: {
      accounts: {
        Row: {
          id: string
          user_id: string
          name: string
          opening_balance: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          name: string
          opening_balance?: number
        }
        Update: {
          name?: string
          opening_balance?: number
        }
        Relationships: []
      }
      categories: {
        Row: {
          id: string
          user_id: string
          name: string
          kind: 'income' | 'expense'
          color: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          name: string
          kind: 'income' | 'expense'
          color?: string
        }
        Update: {
          name?: string
          kind?: 'income' | 'expense'
          color?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          id: string
          user_id: string
          occurred_on: string
          type: 'income' | 'expense' | 'transfer'
          amount: number
          category_id: string | null
          account_id: string
          to_account_id: string | null
          note: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          occurred_on: string
          type: 'income' | 'expense' | 'transfer'
          amount: number
          category_id?: string | null
          account_id: string
          to_account_id?: string | null
          note?: string
        }
        Update: {
          occurred_on?: string
          type?: 'income' | 'expense' | 'transfer'
          amount?: number
          category_id?: string | null
          account_id?: string
          to_account_id?: string | null
          note?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          id: string
          user_id: string
          category_id: string
          monthly_limit: number
          month: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          category_id: string
          monthly_limit: number
          month: string
        }
        Update: {
          category_id?: string
          monthly_limit?: number
          month?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
