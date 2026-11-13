export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(500).json({ ok: false, error: 'TELEGRAM_BOT_TOKEN is missing' });

  const webhookUrl = 'https://kayuk-bet-miniapp-9nfa.vercel.app/api/telegram/webhook';
  const payload = {
    url: webhookUrl,
    allowed_updates: ['message', 'edited_message'],
    drop_pending_updates: false
  };
  if (process.env.TELEGRAM_WEBHOOK_SECRET) {
    payload.secret_token = process.env.TELEGRAM_WEBHOOK_SECRET;
  }

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
        ok: false,
        stage: 'setWebhook',
        http_status: response.status,
        error_code: data.error_code || null,
        description: data.description || 'Telegram API error'
      });
    }
    return res.status(200).json({ ok: true, webhook_set: true, url: webhookUrl, pending_updates_preserved: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error && error.message || error) });
  }
}
