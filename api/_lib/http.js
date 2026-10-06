// Works with Vercel (which pre-parses req.body) and with the plain Node request
// the Vite dev server hands us (which does not).
export async function readJson(req) {
  let raw = req.body;
  if (raw === undefined) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    raw = Buffer.concat(chunks).toString('utf8');
  } else if (Buffer.isBuffer(raw)) {
    raw = raw.toString('utf8');
  }
  if (raw && typeof raw === 'object') return raw;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
