/**
 * Hands-free caddie using the device's built-in speech synthesis (Web Speech API; works offline
 * on iOS/Android). Phrases are built from the same numbers the HUD shows.
 */
const CLUB_WORDS: Record<string, string> = { Dr: 'driver', '3W': '3 wood', '5W': '5 wood', '7W': '7 wood', PW: 'pitching wedge', AW: 'approach wedge', GW: 'gap wedge', SW: 'sand wedge', Putter: 'putter' };

export function clubWords(label: string) {
  const base = label.replace(/^(\S+) [\d.]+°$/, '$1');
  if (CLUB_WORDS[base]) return CLUB_WORDS[base];
  if (/^\d+i$/.test(base)) return `${base.slice(0, -1)} iron`;
  if (base === 'Hy') return `${label.match(/[\d.]+/)?.[0] ?? ''} degree hybrid`.trim();
  if (/^[\d.]+°$/.test(base)) return `${parseFloat(base)} degree wedge`;
  return base;
}

export function caddiePhrase(o: { pin: number; line?: number; playsLike: number | null; club?: string; unit: 'yards' | 'meters'; lang: string }) {
  // When laying up, "plays like" refers to the layup target, so say that explicitly.
  const layup = o.line != null && o.line < o.pin - 1 ? o.line : null;
  const pl = o.playsLike != null && o.playsLike !== (layup ?? o.pin) ? o.playsLike : null;
  if (o.lang === 'es') {
    const uu = o.unit === 'meters' ? 'metros' : 'yardas';
    const head = `${o.pin} ${uu} a la bandera`;
    const rest = [layup != null ? `dejada a ${layup}` : '', pl != null ? `juega como ${pl}` : '', o.club ? `recomiendo ${clubWords(o.club)}` : ''].filter(Boolean).join(', ');
    return layup != null ? `${head}. ${rest[0].toUpperCase()}${rest.slice(1)}.` : [head, rest].filter(Boolean).join(', ') + '.';
  }
  const head = `${o.pin} ${o.unit === 'meters' ? 'meters ' : ''}to pin`;
  const rest = [layup != null ? `layup ${layup}` : '', pl != null ? `plays like ${pl}` : '', o.club ? `recommend ${clubWords(o.club)}` : ''].filter(Boolean).join(', ');
  return layup != null ? `${head}. ${rest[0].toUpperCase()}${rest.slice(1)}.` : [head, rest].filter(Boolean).join(', ') + '.';
}

export const speechAvailable = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function speak(text: string, lang: string) {
  if (!speechAvailable()) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === 'es' ? 'es-ES' : lang === 'fr' ? 'fr-FR' : lang === 'de' ? 'de-DE' : lang === 'pt' ? 'pt-PT' : 'en-US';
  u.rate = 1.02;
  window.speechSynthesis.speak(u);
  return true;
}
