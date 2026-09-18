export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  try {
    const { message, language = 'en' } = req.body || {};
    
    if (!message) {
      return res.status(400).json({ error: 'message required' });
    }

    // TODO: Plug your real AI here
    // For now, mock reply to prove it works
    const reply = `[${language}] I received: "${message}". Healthcare assistant is ready. (Connect LLM here)`;

    return res.status(200).json({
      reply,
      language,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('chat error:', err);
    return res.status(500).json({ error: 'chat failed', details: err.message });
  }
}