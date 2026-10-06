// Telegram: the webhook Telegram calls, account linking, and bot settings.
import { z } from 'zod';
import { requireRole } from '../auth.js';
import { badRequest, forbidden } from '../errors.js';
import { parse } from '../http.js';

export default async function telegramRoutes(app) {
  const { db, telegram, asUser, log } = app;
  const admin = { preHandler: requireRole('admin') };

  // Called by Telegram for each message the bot receives. Public, but only
  // accepted with the secret registered in setWebhook. Always answers 200 so
  // Telegram doesn't redeliver a message that failed.
  app.post('/telegram/webhook', async (req) => {
    if (!telegram.verifyWebhook(req.headers['x-telegram-bot-api-secret-token'])) throw forbidden();
    try {
      await telegram.handleUpdate(req.body || {}, asUser);
    } catch (err) {
      log.error({ err: { message: err.message, stack: err.stack } }, 'telegram update failed');
    }
    return { ok: true };
  });

  // The signed-in user's link, plus bot settings for administrators.
  app.get('/telegram', async (req) => {
    const { rows } = await db.query('select telegram_name from users where id = $1 and telegram_user_id is not null', [req.user.id]);
    const out = { enabled: telegram.enabled, linked: !!rows[0], telegram_name: rows[0]?.telegram_name ?? null };
    if (telegram.enabled) out.bot = (await telegram.botInfo().catch(() => null))?.username ?? null;
    if (req.user.role === 'admin') {
      out.status = await telegram.status();
      out.chats = (await db.query(`select c.chat_id::text, c.title, c.alerts, c.technical, c.created_at, u.full_name as added_by_name
        from telegram_chats c left join users u on u.id = c.added_by order by c.created_at`)).rows;
    }
    return out;
  });

  app.post('/telegram/link-code', async (req) => {
    if (!telegram.enabled) throw badRequest('The Telegram bot is not set up yet');
    return telegram.createLinkCode(req.user.id);
  });

  app.delete('/telegram/link', async (req) => {
    await db.tx(req.user.id, (t) => t.query('update users set telegram_user_id = null, telegram_name = null where id = $1', [req.user.id]));
    return { ok: true };
  });

  app.post('/telegram/connect', admin, async () => {
    if (!telegram.enabled) throw badRequest('Add the TELEGRAM_BOT_TOKEN secret first');
    try {
      return await telegram.connect();
    } catch (err) {
      throw badRequest(err.message);
    }
  });

  app.post('/telegram/test', admin, async (req) => {
    await telegram.alert(`👋 Test alert from SRD Utility Manager, sent by ${telegram.esc(req.user.fullName)}.`);
    return { ok: true };
  });

  app.patch('/telegram/chats/:chatId', admin, async (req) => {
    const { chatId } = parse(z.object({ chatId: z.string().regex(/^-?\d{1,20}$/) }), req.params);
    const b = parse(z.object({ alerts: z.boolean().optional(), technical: z.boolean().optional() }), req.body);
    await db.tx(req.user.id, (t) => t.query(
      'update telegram_chats set alerts = coalesce($2, alerts), technical = coalesce($3, technical) where chat_id = $1',
      [chatId, b.alerts ?? null, b.technical ?? null]));
    return { ok: true };
  });

  app.delete('/telegram/chats/:chatId', admin, async (req) => {
    const { chatId } = parse(z.object({ chatId: z.string().regex(/^-?\d{1,20}$/) }), req.params);
    await db.tx(req.user.id, (t) => t.query('delete from telegram_chats where chat_id = $1', [chatId]));
    return { ok: true };
  });
}
