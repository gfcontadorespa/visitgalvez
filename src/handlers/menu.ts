import { InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';

export interface MenuContext {
  reply(text: string, other?: object): Promise<unknown>;
}

// Menú principal del bot (botones).
export async function showMainMenu(
  ctx: Context
): Promise<void> {
  const keyboard = new InlineKeyboard()
    .text('🔐 Registrar visita', 'visit')
    .row()
    .text('🛑 Registrar salida', 'departure')
    .row()
    .text('📋 Menú', 'menu');

  await ctx.reply(
    'Bienvenido a tu propiedad horizontal 🏢\n\n' +
      'Elige una opción:',
    { reply_markup: keyboard }
  );
}
