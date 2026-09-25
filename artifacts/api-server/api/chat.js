export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method!== 'POST') return res.status(405).json({ error: 'Use POST' });

  try {
    const { message, language = 'en' } = req.body || {};
    if (!message) return res.status(400).json({ error: 'message required' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

    const langMap = {
      en: 'English',
      ha: 'Hausa',
      yo: 'Yoruba',
      ig: 'Igbo',
      pcm: 'Nigerian Pidgin',
      fr: 'French',
      ar: 'Arabic'
    };
    const targetLang = langMap[language] || 'English';

    const prompt = `You are a multilingual healthcare assistant for Nigeria and Africa.
    Respond in ${targetLang}.
    User message: "${message}"
    Be helpful, safe, concise, under 150 words. If emergency, advise hospital immediately.`;

    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview :generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const data = await r.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, could not generate reply.';

    return res.status(200).json({ reply, language, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'chat failed', details: err.message });
  }
}