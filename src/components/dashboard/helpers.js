// Shared helpers for the dashboard cards

// Stable gradient per name, like the colored initials in the design
const GRADIENTS = [
  'linear-gradient(135deg, #3b82f6, #2563eb)',
  'linear-gradient(135deg, #8b5cf6, #6d28d9)',
  'linear-gradient(135deg, #06b6d4, #0e7490)',
  'linear-gradient(135deg, #ec4899, #be185d)',
  'linear-gradient(135deg, #10b981, #047857)',
  'linear-gradient(135deg, #f59e0b, #b45309)',
  'linear-gradient(135deg, #6366f1, #4338ca)',
];

export function avatarColor(name) {
  let h = 0;
  for (const ch of String(name || '?')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

// What the code box would do with the current text
export function classifyInput(text) {
  const raw = String(text || '').trim();
  const compact = raw.replace(/[\s-]/g, '');
  if (/^\d{6}$/.test(compact)) return { kind: 'room', value: compact };
  if (/^[a-z0-9]{8}$/i.test(compact)) return { kind: 'friendCode', value: compact.toUpperCase() };
  if (raw) return { kind: 'search', value: raw.toLowerCase() };
  return { kind: 'empty' };
}
