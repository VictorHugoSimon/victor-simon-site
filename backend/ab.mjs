export function selectVariant(visitorId, enabled = false) {
  if (!enabled) return 'control';
  let hash = 0;
  for (const char of String(visitorId || 'anonymous')) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 2 === 0 ? 'control' : 'variant-b';
}
