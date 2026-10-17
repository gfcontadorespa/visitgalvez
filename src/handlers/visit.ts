import { InputFile } from 'grammy';
import { randomBytes } from 'node:crypto';
import { botUsername } from '../bot-info';
import { generateQrDeepLink, qrPngBuffer } from '../qr';
import {
  getUserByTelegram,
  getUserUnits,
  getVisitByConfirmCode,
  createVisit,
  listTowers,
  listUnitsByTower,
} from '../db';
import type { MyConversation, MyContext } from '../index';
import type { Unit, Visit } from '../types';

// Código interno criptográficamente seguro (8 caracteres hex)
function randomCode(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

// Registra una visita guiada (propietario o guardia).
export async function registerVisitConversation(
  conversation: MyConversation,
  ctx: MyContext
): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = await conversation.external(async () =>
    getUserByTelegram(from.id)
  );
  if (!user) {
    await ctx.reply(
      '⚠️ Primero debes registrarte con /start.'
    );
    return;
  }

  // Elegir la unidad de la visita.
  // 🛡️ GUARDIA: no tiene unidad propia → elige torre + unidad de la PH.
  // 🏠 PROPIETARIO: sus unidades (si tiene varias, elige).
  let ownerUnit: Unit | null = null;
  const units = await conversation.external(async () => getUserUnits(user.id));

  if (user.role === 'guard') {
    const towers = await conversation.external(async () => listTowers());
    if (towers.length === 0) {
      await ctx.reply('No hay torres configuradas. Ejecuta el seed de unidades.');
      return;
    }
    await ctx.reply(`¿Torre de la visita? ${towers.join(' o ')}:`);
    let towerText = '';
    for (let i = 0; i < 5; i++) {
      const tor = await conversation.waitFor('message:text');
      let cand = (tor.message.text ?? '').trim().toUpperCase();
      if (!cand.startsWith('T')) cand = 'T' + cand;
      if (towers.includes(cand as 'T100' | 'T200')) {
        towerText = cand;
        break;
      }
      if (i === 4) {
        await ctx.reply('Torre no válida. Cancela con /cancel e intenta de nuevo.');
        return;
      }
    }
    const towerUnits = await conversation.external(async () => listUnitsByTower(towerText));
    await ctx.reply(
      `Apartamentos en ${towerText}: ${towerUnits.map((u) => u.unit).join(', ')}\n\n` +
        'Escribe la unidad de la visita (ej: 4A):'
    );
    for (let i = 0; i < 5 && !ownerUnit; i++) {
      const res = await conversation.waitFor('message:text');
      const cand = (res.message.text ?? '').trim().toUpperCase();
      const match = towerUnits.find((u) => u.unit.toUpperCase() === cand);
      if (match) ownerUnit = match;
      else if (i === 4) {
        await ctx.reply('Unidad no reconocida. Cancela con /cancel e intenta de nuevo.');
        return;
      }
    }
  } else {
    if (units.length === 0) {
      await ctx.reply('⚠️ No tienes una unidad asignada. Regístrate con /start.');
      return;
    }
    ownerUnit = units[0];
    if (units.length > 1) {
      await ctx.reply('¿A qué unidad pertenece la visita? Escribe el número, ej: 4A');
      let chosen: Unit | null = null;
      for (let i = 0; i < 5 && !chosen; i++) {
        const res = await conversation.waitFor('message:text');
        const cand = (res.message.text ?? '').trim().toUpperCase();
        chosen = units.find((u) => u.unit.toUpperCase() === cand) || null;
        if (!chosen && i === 4) {
          await ctx.reply('Unidad no reconocida. Cancela con /cancel e intenta de nuevo.');
          return;
        }
      }
      ownerUnit = chosen;
    }
  }

  if (!ownerUnit) {
    await ctx.reply('No se pudo determinar la unidad. Usa /cancel y vuelve a empezar.');
    return;
  }

  // ¿A pie o en auto?
  await ctx.reply('¿El visitante viene a pie o en auto?\nEscribe "pie" o "auto":');
  let visitType: 'walk' | 'car' | null = null;
  for (let i = 0; i < 5 && !visitType; i++) {
    const res = await conversation.waitFor('message:text');
    const txt = (res.message.text ?? '').trim().toLowerCase();
    if (txt === 'pie' || txt === 'a pie' || txt === 'walk') visitType = 'walk';
    else if (txt === 'auto' || txt === 'carro' || txt === 'car') visitType = 'car';
    if (!visitType && i === 4) {
      await ctx.reply('No entendí. Escribe "pie" o "auto".');
      return;
    }
  }

  // Nombre del visitante.
  await ctx.reply('Escribe el nombre del visitante:');
  const nameRes = await conversation.waitFor('message:text');
  const visitorName = (nameRes.message.text ?? '').trim();

  // Placa si es en auto.
  let plate: string | null = null;
  if (visitType === 'car') {
    await ctx.reply('Escribe la placa del vehículo (ej: 6ABC123 o PA-123):');
    const plateRes = await conversation.waitFor('message:text');
    plate = (plateRes.message.text ?? '').trim();
  }

  // Confirmar resumen (el código seguro se genera al guardar).
  const summary =
    `📋 Resumen de la visita\n\n` +
    `🏠 Unidad: ${ownerUnit.tower} ${ownerUnit.unit}\n` +
    `👤 Visitante: ${visitorName}\n` +
    `🚗 Tipo: ${visitType === 'car' ? 'Auto' : 'A pie'}\n` +
    (plate ? `🔢 Placa: ${plate}\n` : '');

  const sent = await ctx.reply(summary + '\n¿Confirmo el registro?\nEscribe "confirmar" o "cancelar".');
  void sent;

  // Espera confirmación (texto).
  let ok = false;
  for (let i = 0; i < 5 && !ok; i++) {
    const res = await conversation.waitFor('message:text');
    const txt = (res.message.text ?? '').trim().toLowerCase();
    if (txt === 'confirmar' || txt === 'si' || txt === 'confirm_yes') ok = true;
    if (txt === 'no' || txt === 'cancelar') {
      await ctx.reply('Registro cancelado. ‼️');
      return;
    }
  }
  if (!ok) {
    await ctx.reply('No se confirmó la visita. Inténtalo de nuevo.');
    return;
  }

  // Guardar en base de datos — código SEGURO y con reintento si choca (unique)
  let visit: Visit | null = null;
  let confirmCode = '';
  for (let attempt = 0; attempt < 5 && !visit; attempt++) {
    confirmCode = randomCode();
    const yaExiste = await conversation.external(async () =>
      getVisitByConfirmCode(confirmCode)
    );
    if (yaExiste) continue;
    visit = await conversation.external(async () =>
      createVisit({
        confirm_code: confirmCode,
        unit_id: ownerUnit!.id,
        owner_user_id: user.id,
        visitor_name: visitorName,
        visit_type: visitType as 'walk' | 'car',
        plate,
        registered_by_user_id: user.id,
      })
    );
  }

  if (!visit) {
    await ctx.reply('⚠️ Ocurrió un error guardando la visita. Inténtalo de nuevo.');
    return;
  }

  const username = botUsername.get();
  const deepLink = await generateQrDeepLink(username, confirmCode);
  const qrBuffer = await qrPngBuffer(deepLink);

  // Enviar mensaje de confirmación + QR.
  await ctx.reply(
    `✅ Visita registrada con éxito.\n\n` +
      `Código interno: ${confirmCode}\n\n` +
      `El guardia puede escanear el QR (o abrir el enlace) para confirmar la llegada.`
  );

  try {
    await ctx.replyWithPhoto(new InputFile(qrBuffer), {
      caption:
        `🔗 Escanea para cargar la visita en el bot del guardia.\n` +
        `⚠️ No compartas el QR si no es con el guardia de la PH.`,
    });
  } catch (e) {
    await ctx.reply(`QR falló al generar. Enlace manual: ${deepLink}`);
  }

  // NOTA: la llegada se confirma cuando el guardia la procesa, no aquí.
}
