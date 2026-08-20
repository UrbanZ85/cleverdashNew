// FR-032, research.md §10: kanali so ločeni po vrsti, da jih je mogoče ugašati posamično.
// Kanala na Androidu ni mogoče pozneje razdeliti brez novega imena — to je torej
// odločitev, ki mora biti sprejeta zdaj, ne "kadarkoli pozneje".
export const NOTIFICATION_CHANNELS = {
  /** Zdravje sistema, potek seje — vedno vklopljen privzeto. */
  SYSTEM: 'system',
  /** Rezerviran za 002 (opomniki beleženja časa) — 001 ga ne uporablja, a ga registrira
   * zdaj, da imajo naprave, registrirane v 001, kanal že na voljo. */
  REMINDERS: 'reminders',
} as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[keyof typeof NOTIFICATION_CHANNELS];

export const DEFAULT_CHANNELS: NotificationChannel[] = [NOTIFICATION_CHANNELS.SYSTEM];

export function isKnownChannel(value: unknown): value is NotificationChannel {
  return value === NOTIFICATION_CHANNELS.SYSTEM || value === NOTIFICATION_CHANNELS.REMINDERS;
}
