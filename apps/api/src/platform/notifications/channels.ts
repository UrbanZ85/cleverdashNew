// FR-032, research.md §10: kanali so ločeni po vrsti, da jih je mogoče ugašati posamično.
// Kanala na Androidu ni mogoče pozneje razdeliti brez novega imena — to je torej
// odločitev, ki mora biti sprejeta zdaj, ne "kadarkoli pozneje".
export const NOTIFICATION_CHANNELS = {
  /** Zdravje sistema — vedno vklopljen privzeto. */
  SYSTEM: 'system',
  /** 002, FR-071 "opozorilo na zamujeno": zamujene/neuspele akcije IN opozorilo o poteku
   * seje (FR-063) — obe sta "moraš nekaj storiti" opozorili. Visoka pomembnost, zvok
   * (research.md §6). Rezervirano že v 001, da imajo naprave kanal na voljo vnaprej. */
  REMINDERS: 'reminders',
  /** 002, FR-071 "potrditev": uspešna samodejna akcija. Nizka pomembnost. */
  CONFIRMATION: 'confirmation',
  /** 002, FR-071 "napaka": izčrpani poskusi v AUTO (FR-043) — ločeno od REMINDERS, ker
   * FR-071 zahteva štiri neodvisno preklopljive vrste, ne tri. */
  FAILURE: 'failure',
} as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[keyof typeof NOTIFICATION_CHANNELS];

export const DEFAULT_CHANNELS: NotificationChannel[] = [NOTIFICATION_CHANNELS.SYSTEM];

const KNOWN_CHANNELS: readonly NotificationChannel[] = Object.values(NOTIFICATION_CHANNELS);

export function isKnownChannel(value: unknown): value is NotificationChannel {
  return KNOWN_CHANNELS.includes(value as NotificationChannel);
}

/** `NotificationRecord.type` → Android kanal uporabnika. `session` deli kanal z
 * `reminder`, ker sta obe "moraš nekaj storiti zdaj" opozorili — FR-071 zahteva štiri
 * preklopljive vrste, ne pet. */
export function channelForNotificationType(
  type: 'reminder' | 'confirmation' | 'failure' | 'health' | 'session',
): NotificationChannel {
  switch (type) {
    case 'reminder':
    case 'session':
      return NOTIFICATION_CHANNELS.REMINDERS;
    case 'confirmation':
      return NOTIFICATION_CHANNELS.CONFIRMATION;
    case 'failure':
      return NOTIFICATION_CHANNELS.FAILURE;
    case 'health':
      return NOTIFICATION_CHANNELS.SYSTEM;
  }
}
