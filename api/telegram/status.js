export default async function handler(req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(500).json({ ok: false, stage: 'config', error: 'TELEGRAM_BOT_TOKEN is missing' });

  if (req.method === 'POST') {
    const webhookUrl = 'https://kayuk-bet-miniapp-9nfa.vercel.app/api/telegram/webhook';
    const payload = {
      url: webhookUrl,
      allowed_updates: ['message', 'edited_message'],
      drop_pending_updates: false
    };
    if (process.env.TELEGRAM_WEBHOOK_SECRET) payload.secret_token = process.env.TELEGRAM_WEBHOOK_SECRET;
    try {
      const response = await fetch('https://api.telegram.org/bot' + token + '/setWebhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const raw = await response.text();
      let data;
      try { data = JSON.parse(raw); } catch {
        return res.status(502).json({ ok: false, stage: 'setWebhook', http_status: response.status, error: 'Telegram returned non-JSON' });
      }
      if (!response.ok || !data.ok) {
        return res.status(502).json({
          ok: false, stage: 'setWebhook', http_status: response.status,
          error_code: data.error_code || null,
          description: data.description || 'Telegram API error'
        });
      }
      return res.status(200).json({ ok: true, webhook_set: true, url: webhookUrl, pending_updates_preserved: true });
    } catch (error) {
      return res.status(500).json({ ok: false, error: String(error && error.message || error) });
    }
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  async function call(method) {
    const response = await fetch('https://api.telegram.org/bot' + token + '/' + method);
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch {
      return { ok: false, http_status: response.status, description: 'Non-JSON response' };
    }
    if (!response.ok || !data.ok) {
      return { ok: false, http_status: response.status, error_code: data.error_code || null, description: data.description || 'Telegram API error' };
    }
    return { ok: true, result: data.result };
  }

  try {
    const [me, webhook] = await Promise.all([call('getMe'), call('getWebhookInfo')]);
    return res.status(200).json({
      me: me.ok ? { ok: true, username: me.result.username, first_name: me.result.first_name, can_join_groups: me.result.can_join_groups } : me,
      webhook: webhook.ok ? {
        ok: true, url: webhook.result.url,
        pending_update_count: webhook.result.pending_update_count,
        last_error_date: webhook.result.last_error_date || null,
        last_error_message: webhook.result.last_error_message || null,
        allowed_updates: webhook.result.allowed_updates || null
      } : webhook
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error && error.message || error) });
  }
}
