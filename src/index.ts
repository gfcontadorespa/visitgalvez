import { Bot, session, type SessionFlavor, Context } from 'grammy';
import {
  conversations,
  createConversation,
  type Conversation,
  type ConversationFlavor,
} from '@grammyjs/conversations';
import { config } from './config';
import { botUsername } from './bot-info';
import { registerOnboardingConversation } from './handlers/onboarding';
import { registerVisitConversation } from './handlers/visit';
import { registerArrival, registerDeparture } from './handlers/security';
import { showMainMenu } from './handlers/menu';
import { markVisitArrived, getUserByTelegram } from './db';

// ---------- Tipos de contexto ----------
interface SessionData {
  // marcador para conversaciones
}

export type MyContext = Context & SessionFlavor<SessionData> & ConversationFlavor;
export type MyConversation = Conversation<MyContext>;

const bot = new Bot<MyContext>(config.botToken);

bot.use(
  session({
    initial: (): SessionData => ({}),
  })
);
bot.use(conversations());

// 🚪 /cancel — va REGISTRADO ANTES de las conversaciones: si no, la conversación
//    activa se "come" el update y el comando nunca corre.
//    exit() SIN id = mata TODAS las conversaciones activas de este chat.
bot.command('cancel', async (ctx) => {
  try {
    await ctx.conversation.exit();
  } catch {}
  await ctx.reply('✅ Listo — cancelado. Usa /menu para empezar de nuevo.');
  await showMainMenu(ctx);
});

// ---------- Comandos principales (ANTES de las conversaciones) ----------
// ⚠️ Un comando registrado DESPUÉS de las conversaciones se "come" el update
//    cuando hay una conversación activa — por eso /start y /menu viven acá.
bot.command('start', async (ctx) => {
  try {
    await ctx.conversation.exit();
  } catch {}
  const payload: string | undefined = (ctx as any).match ?? ctx.msg?.text?.split(' ')[1] ?? '';
  if (payload && payload.startsWith('visita_')) {
    const code = payload.slice('visita_'.length);
    await registerArrival(ctx, code);
    return;
  }
  // 🆕 Si el usuario NO está registrado → arranca el ONBOARDING
  //    (antes quedaba huérfano: /start solo mostraba el menú y nadie podía registrarse)
  const from = ctx.from;
  const existing = from ? await getUserByTelegram(from.id) : null;
  if (!existing) {
    await ctx.conversation.enter('onboarding');
    return;
  }
  await showMainMenu(ctx);
});

bot.command('menu', async (ctx) => {
  try {
    await ctx.conversation.exit();
  } catch {}
  await showMainMenu(ctx);
});

// ---------- Callbacks de botones ----------
// ⚠️ Siempre cerramos conversaciones activas antes de actuar: si no, se
// arrancaría una conversación PARALELA y los flujos se mezclarían.
bot.callbackQuery('menu', async (ctx) => {
  await ctx.answerCallbackQuery();
  try {
    await ctx.conversation.exit();
  } catch {}
  await showMainMenu(ctx);
});

bot.callbackQuery('visit', async (ctx) => {
  await ctx.answerCallbackQuery();
  try {
    await ctx.conversation.exit();
  } catch {}
  await ctx.conversation.enter('registerVisit');
});

bot.callbackQuery('departure', async (ctx) => {
  await ctx.answerCallbackQuery();
  try {
    await ctx.conversation.exit();
  } catch {}
  await ctx.conversation.enter('registerDeparture');
});

// Botón "Confirmar llegada" generado en el flujo de deep-link del guardia.
bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;
  if (data.startsWith('arrive_')) {
    const code = data.slice('arrive_'.length);
    const ok = await markVisitArrived(code);
    await ctx.answerCallbackQuery({
      text: ok ? '✅ Llegada confirmada' : '⚠️ No se pudo confirmar',
      show_alert: true,
    });
    try {
      await ctx.editMessageText(
        ok
          ? '✅ Llegada confirmada y registrada.'
          : '⚠️ No se pudo confirmar (puede que ya estuviera confirmada o la visita cambió de estado).'
      );
    } catch {}
    return;
  }
  await ctx.answerCallbackQuery();
});

// ---------- Conversaciones ----------
bot.use(
  createConversation(registerOnboardingConversation, {
    id: 'onboarding',
  })
);
bot.use(
  createConversation(registerVisitConversation, {
    id: 'registerVisit',
  })
);
bot.use(
  createConversation(registerDeparture, {
    id: 'registerDeparture',
  })
);

// ---------- Comandos (los principales ya están arriba, antes de las conversaciones) ----------
bot.on('message', async (ctx) => {
  await showMainMenu(ctx);
});

// ---------- Onboarding manual si no está registrado ----------
// Si el usuario escribe cualquier texto y no está registrado, se inicia el onboarding.
bot.on('message:text', async (ctx, next) => {
  // Si está en una conversación, no interferimos.
  await next();
});

// ---------- Documento de identidad del bot ----------
bot.api.getMe().then((me) => {
  botUsername.set(me.username ?? '');
  console.log(`Bot iniciado: @${me.username}`);
});

// ---------- Captura de errores ----------
bot.catch((err) => {
  console.error('Error en el bot:', err.error);
  try {
    err.ctx?.reply?.('⚠️ Ocurrió un error. Inténtalo de nuevo.');
  } catch {}
});

// ---------- Arranque ----------
bot.start({ drop_pending_updates: true });
console.log('Registro de Visitas PH — bot corriendo en polling.');
