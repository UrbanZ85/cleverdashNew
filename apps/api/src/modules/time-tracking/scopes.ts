// research.md §7: isti mehanizem obsegov kot 001 (platform/auth/scopes.ts, prosti nizi,
// preverjeni z requireScopes(...)) — ta modul samo poimenuje svoje vrednosti na enem
// mestu, da se v ~20 endpointih ne tipka isti niz na roko. `platform/auth/scopes.ts` se ne
// spreminja: mehanizem je generičen, imena obsegov so besedišče modula, ne skupne
// infrastrukture (člen I).
export const TIME_TRACKING_SCOPES = {
  stateRead: 'state:read',
  actionWrite: 'action:write',
  scheduleRead: 'schedule:read',
  scheduleWrite: 'schedule:write',
  calendarRead: 'calendar:read',
  calendarWrite: 'calendar:write',
  historyRead: 'history:read',
  webhooksWrite: 'webhooks:write',
} as const;
