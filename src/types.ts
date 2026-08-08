export type AppRole = 'owner' | 'guard';
export type VisitType = 'walk' | 'car';
export type VisitStatus = 'registered' | 'arrived' | 'left';

export interface User {
  id: number;
  telegram_id: number;
  first_name: string | null;
  username: string | null;
  role: AppRole;
  whatsapp: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export interface Unit {
  id: number;
  tower: 'T100' | 'T200';
  unit: string; // p.ej. "4A", "3B", "1D"
  floor: number;
  letter: string;
}

export interface Visit {
  id: number;
  confirm_code: string;
  unit_id: number;
  owner_user_id: number | null;
  visitor_name: string;
  visit_type: VisitType;
  plate: string | null;
  status: VisitStatus;
  registered_by_user_id: number | null;
  qr_enabled: boolean;
  registered_at: string;
  confirmed_at: string | null;
  arrived_at: string | null;
  exited_at: string | null;
}
