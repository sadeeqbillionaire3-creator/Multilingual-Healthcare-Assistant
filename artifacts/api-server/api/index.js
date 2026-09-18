export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const url = req.url || '';
  
  if (url.includes('healthz') || url.includes('health')) {
    return res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  }
  
  return res.status(200).json({ ok: true, service: 'multilingual-healthcare-assistant' });
}