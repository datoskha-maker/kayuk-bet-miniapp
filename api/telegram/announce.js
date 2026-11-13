export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const expectedKey = process.env.CHATGPT_ANNOUNCE_KEY;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID;

  if (!expectedKey || !token || !groupChatId) {
    return res.status(500).json({ ok: false, error: 'Announcement service is not configured' });
  }

  const authorization = String(req.headers.authorization || '');
  const suppliedKey = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!suppliedKey || suppliedKey !== expectedKey) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return res.status(400).json({ ok: false, error: 'Message is required' });
  }
  if (message.length > 4000) {
    return res.status(400).json({ ok: false, error: 'Message must be 4000 characters or fewer' });
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: groupChatId,
        text: message,
        disable_web_page_preview: true
      })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      console.error('Telegram announce failed:', result?.error_code || response.status);
      return res.status(502).json({ ok: false, error: 'Telegram could not send the message' });
    }
    return res.status(200).json({ ok: true, message_id: result.result?.message_id });
  } catch (error) {
    console.error('Telegram announce request failed:', error?.message || 'unknown error');
    return res.status(502).json({ ok: false, error: 'Telegram request failed' });
  }
}
