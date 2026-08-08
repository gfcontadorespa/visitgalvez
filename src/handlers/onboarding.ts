import {
  getUserByTelegram,
  createUser,
  updateUserProfile,
  listTowers,
  listUnitsByTower,
  linkUserToUnit,
  getUserUnits,
} from '../db';
import type { MyConversation, MyContext } from '../index';

// Normaliza un número de WhatsApp: deja solo dígitos, agrega 507 si falta.
export function normalizeWhatsApp(raw: string): string {
  let digits = (raw || '').replace(/[^\d]/g, '');
  if (digits.startsWith('5075')) {
    digits = digits.slice(3);
  }
  if (!digits.startsWith('507')) {
    digits = '507' + digits;
  }
  return digits;
}

export async function registerOnboardingConversation(
  conversation: MyConversation,
  ctx: MyContext
): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  const telegramId = from.id;

  const existing = await conversation.external(async () =>
    getUserByTelegram(telegramId)
  );

  if (existing) {
    const units = await conversation.external(async () =>
      getUserUnits(existing.id)
    );
    const unitLabels = units.map((u) => `${u.tower} ${u.unit}`).join(', ');
    await ctx.reply(
      `Ya estás registrado ✅\n\n` +
        `Unidades: ${unitLabels || '—'}\n` +
        `Rol: ${existing.role === 'guard' ? 'Guardia' : 'Propietario'}\n\n` +
        `Usa /menu para empezar.`
    );
    return;
  }

  // ---------- Paso 0: Rol ----------
  await ctx.reply(
    '¿Eres propietario o guardia?\n\n' +
      'Escribe "propietario" o "guardia":'
  );
  let role: 'owner' | 'guard' = 'owner';
  for (let i = 0; i < 5; i++) {
    const rolRes = await conversation.waitFor('message:text');
    const txt = (rolRes.message.text ?? '').trim().toLowerCase();
    if (txt === 'guardia' || txt === 'guard') {
      role = 'guard';
      await ctx.reply('Perfil de guardia 🛡️');
      break;
    }
    if (txt === 'propietario' || txt === 'prop' || txt === 'owner') {
      role = 'owner';
      await ctx.reply('Perfil de propietario 🏠');
      break;
    }
    if (i >= 4) {
      await ctx.reply('Asumimos propietario por defecto.');
      break;
    }
  }

  // Guardia: sin unidad, pasa directo a WhatsApp + correo
  if (role === 'guard') {
    await ctx.reply('Escribe tu número de WhatsApp (con indicativo, ej. 50761234567):');
    const wa = await conversation.waitFor('message:text');
    const whatsapp = normalizeWhatsApp(wa.message.text ?? '');

    await ctx.reply('Escribe tu correo electrónico (opcional; escribe "omitir" para pasar):');
    const emailRes = await conversation.waitFor('message:text');
    const emailRaw = (emailRes.message.text ?? '').trim();
    const email = emailRaw.toLowerCase() === 'omitir' || !emailRaw ? null : emailRaw;

    const user = await conversation.external(async () =>
      createUser(telegramId, 'guard', from.first_name ?? null, from.username ?? null)
    );
    if (!user) {
      await ctx.reply('⚠️ No se pudo crear el perfil. Inténtalo de nuevo.');
      return;
    }
    await conversation.external(async () =>
      updateUserProfile(telegramId, { whatsapp, email })
    );
    await ctx.reply(
      '✅ Perfil de guardia completado.\n\nUsa /menu para empezar.'
    );
    return;
  }

  // ---------- Propietario: elige torre ----------
  const towers = await conversation.external(async () => listTowers());
  if (towers.length === 0) {
    await ctx.reply('No hay torres configuradas. Ejecuta el seed de unidades.');
    return;
  }

  await ctx.reply(
    `Escribe la torre: ${towers.join(' o ')}:`
  );
  let towerText = '';
  for (let i = 0; i < 5; i++) {
    const tor = await conversation.waitFor('message:text');
    let cand = (tor.message.text ?? '').trim().toUpperCase();
    if (!cand.startsWith('T')) cand = 'T' + cand;
    if (towers.includes(cand as 'T100' | 'T200')) {
      towerText = cand;
      break;
    }
    if (i >= 4) {
      await ctx.reply('Torre no válida. Inténtalo de nuevo con /start.');
      return;
    }
  }

  // ---------- Propietario: elige unidad ----------
  const units = await conversation.external(async () =>
    listUnitsByTower(towerText)
  );
  await ctx.reply(
    `Apartamentos en torre ${towerText}: ` +
      units.map((u) => u.unit).join(', ') +
      '\n\nEscribe tu apartamento (ej: 4A):'
  );

  let chosenUnit: string | null = null;
  for (let i = 0; i < 5 && !chosenUnit; i++) {
    const res = await conversation.waitFor('message:text');
    const cand = (res.message.text ?? '').trim().toUpperCase();
    const match = units.find((u) => u.unit.toUpperCase() === cand);
    if (match) {
      chosenUnit = match.unit;
    } else if (i >= 4) {
      await ctx.reply('No reconocí la unidad. Inténtalo de nuevo con /start.');
      return;
    }
  }

  // ---------- WhatsApp ----------
  await ctx.reply('Escribe tu número de WhatsApp (con indicativo, ej. 50761234567):');
  const wa = await conversation.waitFor('message:text');
  const whatsapp = normalizeWhatsApp(wa.message.text ?? '');

  // ---------- Correo (opcional) ----------
  await ctx.reply('Escribe tu correo electrónico (opcional; escribe "omitir" para pasar):');
  const emailRes = await conversation.waitFor('message:text');
  const emailRaw = (emailRes.message.text ?? '').trim();
  const email = emailRaw.toLowerCase() === 'omitir' || !emailRaw ? null : emailRaw;

  // ---------- Persistir ----------
  const user = await conversation.external(async () =>
    createUser(telegramId, 'owner', from.first_name ?? null, from.username ?? null)
  );
  if (!user) {
    await ctx.reply('⚠️ No se pudo crear el perfil. Inténtalo de nuevo.');
    return;
  }
  await conversation.external(async () =>
    updateUserProfile(telegramId, { whatsapp, email })
  );

  const unit = units.find((u) => u.unit.toUpperCase() === (chosenUnit ?? '').toUpperCase());
  if (unit) {
    await conversation.external(async () => linkUserToUnit(user.id, unit.id));
  }

  await ctx.reply(
    `✅ Perfil completado\n\n` +
      `Torre: ${towerText}\n` +
      `Unidad: ${chosenUnit}\n` +
      `WhatsApp: +${whatsapp}\n` +
      (email ? `Email: ${email}\n` : '') +
      `\nUsa /menu para empezar.`
  );
}
