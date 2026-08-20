import admin from 'firebase-admin';

// Člen IV: poverilnice so izključno montirana datoteka, naslovljena prek
// GOOGLE_APPLICATION_CREDENTIALS — nikoli literal v kodi. `applicationDefault()` jih
// prebere iz te spremenljivke sam; ta datoteka nima nobenega ključa vpisanega vase.
let app: admin.app.App | undefined;

function getApp(): admin.app.App {
  if (!app) {
    app = admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
  return app;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Pot v aplikaciji, ki naj se odpre ob tapkanju (FR-033). */
  deepLink?: string;
}

export interface SendResult {
  success: boolean;
  errorCode?: string;
}

export async function sendPush(token: string, payload: PushPayload): Promise<SendResult> {
  try {
    await getApp()
      .messaging()
      .send({
        token,
        notification: { title: payload.title, body: payload.body },
        data: payload.deepLink ? { deepLink: payload.deepLink } : undefined,
      });
    return { success: true };
  } catch (err) {
    const code = (err as { code?: string }).code;
    return { success: false, errorCode: code };
  }
}

// FR-034: te dve kodi pomenijo, da žeton ni več veljaven — ponudnik ga je zavrnil trajno,
// ne prehodno. Vse ostalo (omrežje, kvota, ...) je prehodna napaka.
const UNREGISTERED_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument',
]);

export function isUnregisteredError(errorCode: string | undefined): boolean {
  return errorCode !== undefined && UNREGISTERED_ERROR_CODES.has(errorCode);
}
