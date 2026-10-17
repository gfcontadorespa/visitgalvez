import { supabase } from './supabase';
import type { User, Unit, Visit, AppRole, VisitType } from './types';

// ---------- Users ----------

export async function getUserByTelegram(telegramId: number): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .maybeSingle();
  if (error) {
    console.error('getUserByTelegram error:', error.message);
    return null;
  }
  return data as User | null;
}

export async function createUser(
  telegramId: number,
  role: AppRole,
  firstName: string | null,
  username: string | null
): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .insert({
      telegram_id: telegramId,
      role,
      first_name: firstName,
      username,
    })
    .select('*')
    .single();
  if (error) {
    console.error('createUser error:', error.message);
    return null;
  }
  return data as User;
}

export async function updateUserProfile(
  telegramId: number,
  patch: { whatsapp?: string; email?: string | null; role?: AppRole }
): Promise<boolean> {
  const { error } = await supabase
    .from('users')
    .update(patch)
    .eq('telegram_id', telegramId);
  if (error) {
    console.error('updateUserProfile error:', error.message);
    return false;
  }
  return true;
}

// ---------- Units ----------

export async function listTowers(): Promise<('T100' | 'T200')[]> {
  const { data, error } = await supabase
    .from('units')
    .select('tower')
    .order('tower');
  if (error || !data) return [];
  const set = new Set(data.map((r) => r.tower as 'T100' | 'T200'));
  return Array.from(set).sort();
}

export async function listUnitsByTower(tower: string): Promise<Unit[]> {
  const { data, error } = await supabase
    .from('units')
    .select('*')
    .eq('tower', tower)
    .order('unit');
  if (error) {
    console.error('listUnitsByTower error:', error.message);
    return [];
  }
  return (data as Unit[]).sort((a, b) => a.unit.localeCompare(b.unit, undefined, { numeric: true }));
}

// ---------- user_units ----------

export async function linkUserToUnit(userId: number, unitId: number): Promise<boolean> {
  const { error } = await supabase
    .from('user_units')
    .insert({ user_id: userId, unit_id: unitId })
    .single();
  if (error) {
    console.error('linkUserToUnit error:', error.message);
    return false;
  }
  return true;
}

export async function getUserUnits(userId: number): Promise<(Unit & { user_unit_id: number })[]> {
  const { data, error } = await supabase
    .from('user_units')
    .select('id, unit_id, units(*)')
    .eq('user_id', userId);
  if (error || !data) return [];
  return data.map((r) => {
    const unit = (r.units as unknown as Unit[])?.[0] ?? (r.units as unknown as Unit);
    return {
      ...unit,
      user_unit_id: r.id,
    };
  });
}

// ---------- Visits ----------

export async function getVisitByConfirmCode(code: string): Promise<Visit | null> {
  const { data, error } = await supabase
    .from('visits')
    .select('*')
    .eq('confirm_code', code)
    .maybeSingle();
  if (error) {
    console.error('getVisitByConfirmCode error:', error.message);
    return null;
  }
  return data as Visit | null;
}

export async function createVisit(input: {
  confirm_code: string;
  unit_id: number;
  owner_user_id: number | null;
  visitor_name: string;
  visit_type: VisitType;
  plate: string | null;
  registered_by_user_id: number | null;
}): Promise<Visit | null> {
  const { data, error } = await supabase
    .from('visits')
    .insert(input)
    .select('*')
    .single();
  if (error) {
    console.error('createVisit error:', error.message);
    return null;
  }
  return data as Visit;
}

export async function markVisitArrived(code: string): Promise<boolean> {
  // Solo confirma visitas en estado 'registered' (evita re-confirmar o revivir una 'left')
  const { data, error } = await supabase
    .from('visits')
    .update({ status: 'arrived', confirmed_at: new Date().toISOString(), arrived_at: new Date().toISOString() })
    .eq('confirm_code', code)
    .eq('status', 'registered')
    .select('id');
  if (error) {
    console.error('markVisitArrived error:', error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

export async function markVisitLeft(id: number): Promise<boolean> {
  const { error } = await supabase
    .from('visits')
    .update({ status: 'left', exited_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    console.error('markVisitLeft error:', error.message);
    return false;
  }
  return true;
}

export async function listPendingArrivals(): Promise<Visit[]> {
  const { data, error } = await supabase
    .from('visits')
    .select('*')
    .in('status', ['registered', 'arrived'])
    .order('registered_at', { ascending: false });
  if (error) {
    console.error('listPendingArrivals error:', error.message);
    return [];
  }
  return data as Visit[];
}

export async function getActiveVisitsForOwner(userId: number): Promise<Visit[]> {
  const { data, error } = await supabase
    .from('visits')
    .select('*')
    .eq('owner_user_id', userId)
    .in('status', ['registered', 'arrived'])
    .order('registered_at', { ascending: false });
  if (error) {
    console.error('getActiveVisitsForOwner error:', error.message);
    return [];
  }
  return data as Visit[];
}
