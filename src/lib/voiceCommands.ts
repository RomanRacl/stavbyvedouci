import { fold } from './search';

/**
 * Hlasové povely pro mobil party – „začít“, „konec“, „přestávka“… bez sundávání rukavic.
 * Rozpoznání řeči dělá prohlížeč, tady jen převádíme větu na povel. Funguje česky, anglicky i ukrajinsky.
 */
export type VoiceCommand =
  | { kind: 'start' }
  | { kind: 'stop' }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'photo' }
  | { kind: 'material' }
  | { kind: 'note'; text: string }
  | { kind: 'unknown'; heard: string };

/** Pořadí je důležité: „konec přestávky“ je pokračování, ne konec práce. */
/** Slovo jako celek i v azbuce (\b v JS zná jen latinku). `*` za kmenem = libovolná koncovka. */
const words = (alts: string) => new RegExp(`(?:^|[^\\p{L}])(?:${alts.replace(/\*/g, '\\p{L}*')})(?![\\p{L}])`, 'u');

/** Pořadí je důležité: „konec přestávky“ je pokračování, ne konec práce. */
const RULES: Array<[VoiceCommand['kind'], RegExp]> = [
  ['resume', words('konec prestavky|pokracuj*|zpet do prace|resume|continue|back to work|end of break|продовж*|кінець перерви')],
  ['pause', words('prestavk*|pauz*|svacin*|obed|break|pause|lunch|перерв*|пауз*|обід')],
  ['photo', words('fot*|vyfot*|photo*|picture|camera|фото*|сфотограф*')],
  ['material', words('material*|матеріал*')],
  ['stop', words('konec|koncim|skonc*|ukonc*|stop|hotovo|finish*|end|done|стоп|кінець|закінч*|заверш*')],
  ['start', words('zacit|zacni|zacinam|zacnu|start*|spust*|begin|почат*|почни|старт*|розпоч*')],
];

const NOTE = new RegExp(`^(?:poznamk|zapis|napis|note|write|нотатк|запиш|напиш)\\p{L}*[\\s,:]+`, 'u');

export function parseVoice(heard: string): VoiceCommand {
  const raw = heard.trim();
  // Ukrajinská slova `fold` nemění (azbuka nemá diakritiku v NFD), latinka přijde o háčky a čárky.
  const f = fold(raw).replace(/[.!?]+$/, '');
  const note = NOTE.exec(f);
  if (note) {
    // Text poznámky bereme z originálu (s diakritikou), jen bez úvodního slova.
    const words = note[0].trim().split(/\s+/).length;
    const text = raw.split(/\s+/).slice(words).join(' ').trim();
    return text ? { kind: 'note', text: text[0].toUpperCase() + text.slice(1) } : { kind: 'unknown', heard: raw };
  }
  for (const [kind, re] of RULES) if (re.test(f)) return { kind } as VoiceCommand;
  return { kind: 'unknown', heard: raw };
}
