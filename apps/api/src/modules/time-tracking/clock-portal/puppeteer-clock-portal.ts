import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer, { type Browser, type BrowserContext } from 'puppeteer';
import { deriveClockState, expectedStateAfter } from '../../../domain/clock-state.js';
import type { Env } from '../../../platform/config/env.js';
import type { Logger } from '../../../platform/logging/logger.js';
import type {
  ActionOutcome,
  ClockPortal,
  Diagnostics,
  ResolvedLocation,
  StateReading,
} from './clock-portal.interface.js';

// docs/legacy-engine.md §1, research.md §1-§2: edini kraj, ki dejansko poganja Chromium.
// Vse odločanje (kdaj, kaj, katero stanje pričakujemo) je v domain/ — ta razred samo
// izvede korake na strani in prevede DOM v StateReading/ActionOutcome.

const CLOCKIN_SELECTOR = 'a.clockin-button';
const HOME_SCREEN_PROMPT_ID = 'addHomeScreenDiv';

/**
 * Ključ v `localStorage` strani delodajalca, s katerim si ta zapomni, da geolokacija na tej
 * napravi ne dela.
 *
 * Zakaj ga postavljamo sami: gumb za registracijo ni povezava, ampak
 * `ERClockin.sendRequestWithPositionPosition(url)`, ki najprej pokliče
 * `navigator.geolocation.getCurrentPosition`. Ob zavrnjenem dovoljenju (FR-094, lokacija
 * izklopljena) gre stran v `showLocationErrorDialog`, ta pa akcijo BREZ koordinat pošlje samo
 * takrat, kadar je pod tem ključem zapisana največ 5 dni stara napaka; prvič zgolj zapiše
 * zastavico in odpre opozorilo, akcije pa NE izvede. Ker portal za vsako operacijo odpre svež
 * kontekst (`withContext`), je `localStorage` vedno prazen in vsak klik brez lokacije je
 * obtičal na tem opozorilu — klik se je zgodil, stanje strani se ni premaknilo in izid je bil
 * `not_verified` do izčrpanja poskusov. Zastavica je torej pogoj, da rezervna pot STRANI (ne
 * naša) akcijo res pošlje.
 */
const GPS_ERROR_FLAG_KEY = 'clockinGPSErrorDate';

/**
 * Zahtevek, s katerim stran izvede registracijo (ali odpre opozorilo) — `ajaxGetStartLunch`,
 * `ajaxGetFinishWork` in podobni. Znak, da je klik dosegel strežnik in da je ponovno branje
 * smiselno; glej čakanje v `performAction`.
 *
 * Vzorec je namenoma širok in ne seznam znanih imen: ime, ki bi ga spregledal, bi pomenilo
 * vrnitev v 30-sekundno čakanje. Napačen zadetek (kak drug `ajaxGet…` iz življenjskega cikla
 * strani) pa ne more povzročiti lažnega uspeha — po njem sledi `reload` in SVEŽE branje
 * stanja, in samo to branje odloči o `verified`.
 */
const AJAX_ACTION_URL = /[?&]action=ajaxGet/i;

export class PuppeteerClockPortal implements ClockPortal {
  private browser: Browser | null = null;

  constructor(
    private readonly env: Pick<
      Env,
      | 'PUPPETEER_EXECUTABLE_PATH'
      | 'BROWSER_HEADLESS'
      | 'BROWSER_TIMEOUT_MS'
      | 'BROWSER_PROTOCOL_TIMEOUT_MS'
      | 'BROWSER_NO_SANDBOX'
      | 'BROWSER_USER_AGENT'
      | 'SCREENSHOT_DIR'
    >,
    private readonly logger: Logger,
  ) {}

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser?.connected) return this.browser;
    // Dolgo živeč brskalnik, kratkoživi konteksti (research.md §2) — zagon je najdražji in
    // najpogosteje odpovedujoč del, zato se ne ponavlja za vsako operacijo.
    this.browser = await puppeteer.launch({
      headless: this.env.BROWSER_HEADLESS,
      executablePath: this.env.PUPPETEER_EXECUTABLE_PATH,
      protocolTimeout: this.env.BROWSER_PROTOCOL_TIMEOUT_MS,
      args: this.env.BROWSER_NO_SANDBOX ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
    });
    return this.browser;
  }

  private async withContext<T>(fn: (context: BrowserContext) => Promise<T>): Promise<T> {
    const browser = await this.ensureBrowser();
    const context = await browser.createBrowserContext(); // Puppeteer v22+ ime; glej docs/legacy-engine.md §1
    try {
      return await fn(context);
    } finally {
      // Vedno zapri, tudi ob vrženi napaki — stari sistem zapira samo na uspešni poti
      // (docs/legacy-engine.md §4.7), zato se konteksti kopičijo.
      await context.close().catch(() => undefined);
    }
  }

  private async openPage(context: BrowserContext, location: ResolvedLocation) {
    const page = await context.newPage();
    page.setDefaultTimeout(this.env.BROWSER_TIMEOUT_MS);
    // FR-094: brez koordinat brskalniku ne povemo, kje je. `overridePermissions` s praznim
    // seznamom dovoljenje IZRECNO zavrne — stran dobi `PERMISSION_DENIED` takoj, namesto da
    // bi čakala na poziv, ki ga v brskalniku brez človeka nikoli nihče ne potrdi.
    if (location.latitude !== undefined && location.longitude !== undefined) {
      await context.overridePermissions(location.url, ['geolocation']);
      await page.setGeolocation({ latitude: location.latitude, longitude: location.longitude });
    } else {
      await context.overridePermissions(location.url, []);
      // Zastavica mora biti zapisana, PREDEN se skripte strani izvedejo, zato
      // `evaluateOnNewDocument` in ne `evaluate` po nalaganju. Na `about:blank` dostop do
      // `localStorage` vrže — zato `try`, ne pogoj: napaka tu ne sme podreti operacije.
      await page.evaluateOnNewDocument((key: string) => {
        try {
          localStorage.setItem(key, String(Date.now()));
        } catch {
          /* prazen izvor (about:blank) — na pravi strani se skript izvede še enkrat */
        }
      }, GPS_ERROR_FLAG_KEY);
    }
    await page.setUserAgent(this.env.BROWSER_USER_AGENT);
    await page.setCookie({
      name: location.cookieName,
      value: location.cookieValue,
      domain: location.cookieDomain,
      // `expires` samo, če je rok znan — Puppeteer brez njega nastavi sejni piškotek, kar je
      // bilo doslej edino vedenje. Stare skripte so ga pošiljale
      // (`expires: +process.env.cookie_property_expires`), zato ga ohranjamo kot možnost.
      ...(location.cookieExpiresAt ? { expires: location.cookieExpiresAt } : {}),
    });
    await page.goto(location.url, { waitUntil: 'networkidle0' });
    // Poziv "Dodaj na začetni zaslon" prekriva gumbe (docs/legacy-engine.md §1).
    await page
      .evaluate((id) => document.getElementById(id)?.remove(), HOME_SCREEN_PROMPT_ID)
      .catch(() => undefined);
    return page;
  }

  private async readAvailableActions(page: import('puppeteer').Page): Promise<string[]> {
    const links = await page.$$(CLOCKIN_SELECTOR);
    const texts = await Promise.all(links.map((el) => el.evaluate((node) => node.textContent?.trim() ?? '')));
    return texts.filter((t) => t.length > 0);
  }

  async readState(location: ResolvedLocation): Promise<StateReading> {
    const readAt = new Date();
    try {
      return await this.withContext(async (context) => {
        const page = await this.openPage(context, location);
        const availableActions = await this.readAvailableActions(page);
        const diagnostics = diagnoseEmptyActions(availableActions);
        return {
          state: deriveClockState(availableActions),
          availableActions,
          readAt,
          diagnostics,
        };
      });
    } catch (err) {
      this.logger.warn({ err }, 'readState je spodletel');
      return {
        state: 'UNKNOWN',
        availableActions: [],
        readAt,
        diagnostics: classifyError(err),
      };
    }
  }

  async performAction(location: ResolvedLocation, actionName: string): Promise<ActionOutcome> {
    const startedAt = Date.now();
    try {
      return await this.withContext(async (context) => {
        const page = await this.openPage(context, location);
        const availableActionsBefore = await this.readAvailableActions(page);
        const stateBefore = deriveClockState(availableActionsBefore);

        const links = await page.$$(CLOCKIN_SELECTOR);
        let clicked = false;
        for (const el of links) {
          const text = await el.evaluate((node) => node.textContent?.trim() ?? '');
          if (text === actionName) {
            // Gumb ni povezava, ampak AJAX (`onclick` → `ERClockin…` → `ajaxGetRequest`):
            // navigacije praviloma NI, zato je čakanje samo nanjo pomenilo cel
            // `BROWSER_TIMEOUT_MS` (30 s) mrtvega teka na VSAKEM poskusu. Čakamo torej na
            // prvo od obojega — na odgovor zahtevka `action=ajaxGet…`, ki ga sproži klik, ali
            // na navigacijo, če se stran vseeno premakne.
            //
            // `Promise.any` in ne `race`: iztek enega od obeh ne sme prekiniti drugega.
            // Poslušalca je treba prižgati PRED klikom, sicer nam hiter odgovor uide.
            const acted = Promise.any([
              page.waitForNavigation({ waitUntil: 'networkidle0' }),
              page.waitForResponse((res) => AJAX_ACTION_URL.test(res.url())),
            ]).catch(() => undefined);
            await Promise.all([acted, el.click()]);
            clicked = true;
            break;
          }
        }

        // Verifikacija je SAMOSTOJNO branje po ponovnem nalaganju strani —
        // docs/legacy-engine.md §4.6: brati zastarel DOM brez reload/navigacije je hrošč.
        await page.reload({ waitUntil: 'networkidle0' });
        const availableActionsAfter = await this.readAvailableActions(page);
        const stateAfter = deriveClockState(availableActionsAfter);
        const verified = clicked && expectedStateAfter(actionName) === stateAfter;

        let screenshotPath: string | undefined;
        if (!verified) {
          screenshotPath = await this.captureScreenshot(page, actionName);
        }

        return {
          clicked,
          stateBefore,
          stateAfter,
          availableActionsBefore,
          availableActionsAfter,
          verified,
          durationMs: Date.now() - startedAt,
          screenshotPath,
          errorMessage: clicked ? undefined : `Gumb "${actionName}" ni bil najden med razpoložljivimi akcijami`,
          diagnostics: diagnoseEmptyActions(availableActionsAfter),
        };
      });
    } catch (err) {
      this.logger.error({ err, actionName }, 'performAction je spodletel');
      return {
        clicked: false,
        stateBefore: 'UNKNOWN',
        stateAfter: 'UNKNOWN',
        availableActionsBefore: [],
        availableActionsAfter: [],
        verified: false,
        durationMs: Date.now() - startedAt,
        errorMessage: err instanceof Error ? err.message : String(err),
        diagnostics: classifyError(err),
      };
    }
  }

  private async captureScreenshot(page: import('puppeteer').Page, actionName: string): Promise<string | undefined> {
    try {
      await mkdir(this.env.SCREENSHOT_DIR, { recursive: true });
      const filename = `${Date.now()}-${actionName.replace(/[^a-z0-9]+/gi, '-')}.png`;
      const path = join(this.env.SCREENSHOT_DIR, filename);
      const buffer = await page.screenshot();
      await writeFile(path, buffer);
      return path;
    } catch (err) {
      this.logger.warn({ err }, 'Snemanje posnetka zaslona ob napaki je spodletelo');
      return undefined;
    }
  }

  /** Za čist zaustavitev v testih/ob izklopu procesa. */
  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }
}

export function diagnoseEmptyActions(availableActions: string[]): Diagnostics {
  if (availableActions.length > 0) return { reason: 'ok' };
  return {
    reason: 'selector_not_found',
    message: 'Stran ni vrnila nobene razpoložljive akcije.',
    hint: 'Preveri veljavnost seje v Nastavitvah — glej Diagnostiko za natančnejši vzrok.',
  };
}

export function classifyError(err: unknown): Diagnostics {
  const message = err instanceof Error ? err.message : String(err);
  // Najpogostejša napaka ob prvem zagonu na razvojnem računalniku: `PUPPETEER_EXECUTABLE_PATH`
  // je privzeto `/usr/bin/chromium` (pot v vsebniku), ki na Windowsu ali macOS ne obstaja.
  // Brez tega namiga je videti kot okvara Chromiuma, čeprav je napačna nastavitev poti.
  if (/executablePath|Could not find Chrome|Browser was not found/i.test(message)) {
    return {
      reason: 'browser_launch_failed',
      message,
      hint: 'Brskalnika na nastavljeni poti ni. Popravi PUPPETEER_EXECUTABLE_PATH (v vsebniku /usr/bin/chromium, na razvojnem računalniku pot do nameščenega Chroma) ali za razvoj brez brskalnika nastavi CLOCK_PORTAL=fake.',
    };
  }
  if (/timeout/i.test(message)) {
    return { reason: 'timeout', message, hint: 'Stran se ni odzvala v pričakovanem času.' };
  }
  if (/net::|ERR_/i.test(message)) {
    return { reason: 'page_unreachable', message, hint: 'Stran delodajalca ni dosegljiva.' };
  }
  if (/geolocation/i.test(message)) {
    return { reason: 'geolocation_denied', message };
  }
  return { reason: 'browser_launch_failed', message };
}
