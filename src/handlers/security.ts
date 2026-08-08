import { InlineKeyboard } from 'grammy';
import {
  getUserByTelegram,
  getVisitByConfirmCode,
  markVisitArrived,
  markVisitLeft,
  listPendingArrivals,
  getActiveVisitsForOwner,
} from '../db';
import type { MyConversation, MyContext } from '../index';
import type { Visit, Unit } from '../types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../supabase';

// ---------- Llegada (deep-link /start visita_XXXX) ----------

async function getUnitForVisit(visit: Visit): Promise<Unit | null> {
  const { data } = await (supabase as SupabaseClient)
    .from('units')
    .select('*')
    .eq('id', visit.unit_id)
    .maybeSingle();
  return (data as Unit) || null;
}

// Se llama desde index.ts cuando el id del start empieza con "visita_".
export async function registerArrival(
  ctx: MyContext,
  code: string
): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = await getUserByTelegram(from.id);
  const visit = await getVisitByConfirmCode(code);

  if (!visit) {
    await ctx.reply(
      '⚠️ No encontré esa visita. El código es inválido o ya fue usado.'
    );
    return;
  }

  const unit = await getUnitForVisit(visit);
  const unitText = unit ? `${unit.tower} ${unit.unit}` : '—';
  const info =
    `🚪 Visita encontrada\n\n` +
    `🏠 Unidad: ${unitText}\n` +
    `👤 Visitante: ${visit.visitor_name}\n` +
    `🚗 Tipo: ${visit.visit_type === 'car' ? 'Auto' : 'A pie'}\n` +
    (visit.plate ? `🔢 Placa: ${visit.plate}\n` : '') +
    `🕒 Registrada: ${new Date(visit.registered_at).toLocaleString('es-PA')}`;

  if (visit.status === 'left') {
    await ctx.reply(info + '\n\n⚠️ Esta visita ya fue marcada como SALIDA.');
    return;
  }

  if (visit.status === 'arrived') {
    await ctx.reply(info + '\n\n⏱️ Esta visita ya tiene la LLEGADA confirmada.');
    return;
  }

  // Solo guardia puede confirmar llegada.
  const role = user?.role === 'guard' ? 'guard' : 'owner';

  if (role !== 'guard') {
    await ctx.reply(
      info +
        '\n\n🔒 Solo el guardia puede confirmar la llegada de una visita. ' +
        'Escanea el QR desde la cuenta del guardia de la PH.'
    );
    return;
  }

  const keyboard = new InlineKeyboard().text(
    '✅ Confirmar llegada',
    `arrive_${code}`
  );
  await ctx.reply(info + '\n\n¿Confirmas la llegada de este visitante?', {
    reply_markup: keyboard,
  });

  // Cablear el botón: definimos callback global en index.ts.
}

// ---------- Salida (conversación) ----------

export async function registerDeparture(
  conversation: MyConversation,
  ctx: MyContext
): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = await conversation.external(async () =>
    getUserByTelegram(from.id)
  );
  if (!user) {
    await ctx.reply('⚠️ Primero regístrate con /start.');
    return;
  }

  // Guardia: lista de visitas activas para dar salida a cualquier una.
  // Propietario: sus visitas activas.
  let actives: Visit[];
  if (user.role === 'guard') {
    actives = await conversation.external(async () => listPendingArrivals());
  } else {
    actives = await conversation.external(async () =>
      getActiveVisitsForOwner(user.id)
    );
  }

  const open = actives.filter((v) => v.status !== 'left');
  if (open.length === 0) {
    await ctx.reply(
      'No hay visitas activas para marcar salida. Registra una visita nueva o espera llegada.'
    );
    return;
  }

  // Mostrar opciones como texto (el usuario escribe el código interno).
  const listText = open
    .map((v, i) => `${i + 1}. ${v.visitor_name} — código: ${v.confirm_code}`)
    .join('\n');

  await ctx.reply(
    'Visitas activas:\n' + listText +
    '\n\nEscribe el código interno de la visita que quieres marcar como SALIDA (ej: ABC12345):'
  );

  for (let i = 0; i < 5; i++) {
    const res = await conversation.waitFor('message:text');
    const code = (res.message.text ?? '').trim().toUpperCase();
    const found = open.find((v) => v.confirm_code.toUpperCase() === code);
    if (found) {
      const ok = await conversation.external(async () =>
        markVisitLeft(found.id)
      );
      await ctx.reply(
        ok
          ? `✅ Salida registrada para ${found.visitor_name}.`
          : '⚠️ No se pudo registrar la salida.'
      );
      return;
    }
    if (i === 4) {
      await ctx.reply('No reconocí el código. Usa un código de la lista.');
      return;
    }
  }
}
