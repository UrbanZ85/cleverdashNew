import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { RemoteSessionModel } from '../../../src/modules/time-tracking/models/remote-session.model.js';
import { TrackingLocationModel } from '../../../src/modules/time-tracking/models/tracking-location.model.js';
import { loginAndUnlock, defaultTestUserId, seedProfileFixture } from './_helpers.js';

// Pogodbeni test proti specs/002-time-tracking/contracts/openapi.yaml:
// /time-tracking/sessions (GET, POST), /sessions/{id} (PUT, DELETE), /locations/{id} (PUT, DELETE).
//
// Zakaj ločena datoteka in ne dopolnitev profiles.spec.ts: to je pot, po kateri se sistem
// PRVIČ postavi (prazna baza → seja → lokacija). Staro okolje je imelo štiri obvezne
// spremenljivke piškotka (`cookie_property_name`, `_value`, `_domain`, `_expires` —
// docs/env-reference.md §1); če je iz Nastavitev nastavljiva samo vrednost, sistem ni
// uporaben in to mora pokazati test, ne šele prvi zagon na VPS-u.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterEach(clearTestDb);
afterAll(stopTestDb);

describe('/time-tracking/sessions pogodba', () => {
  it('ustvari sejo z vsemi štirimi lastnostmi piškotka in vrne maskirano vrednost', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const res = await request(app)
      .post('/api/v1/time-tracking/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Agenda — e-računi',
        cookieName: 'ItcClientID',
        cookieValue: 'AbCdEfGhIjKlMnOpQrStUvWx_1234567890',
        cookieDomain: 'e-racuni.com',
        expiresAt: '2099-01-24T12:00:00.000Z',
      });

    expect(res.status).toBe(201);
    expect(res.body.cookieName).toBe('ItcClientID');
    expect(res.body.cookieDomain).toBe('e-racuni.com');
    // FR-092: cela vrednost se ne vrne nikoli, niti ob ustvarjanju.
    expect(JSON.stringify(res.body)).not.toContain('AbCdEfGhIjKlMnOpQrStUvWx_1234567890');
    expect(res.body.cookieValueMasked).toMatch(/…/);
    // Izpeljana velikost = bajti imena + vrednosti; brez nje je odrezano lepljenje nevidno.
    expect(res.body.cookieSize).toBe('ItcClientID'.length + 'AbCdEfGhIjKlMnOpQrStUvWx_1234567890'.length);
    // Nova seja ni "deluje", dokler je preizkusno branje ne potrdi.
    expect(res.body.status).toBe('unknown');
  });

  it('ime piškotka je privzeto ItcClientID, kadar ni poslano', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const res = await request(app)
      .post('/api/v1/time-tracking/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Brez imena piškotka', cookieValue: 'vrednost-piskotka', cookieDomain: 'e-racuni.com' });

    expect(res.status).toBe(201);
    expect(res.body.cookieName).toBe('ItcClientID');
    expect(res.body.expiresAt).toBeNull();
    expect(res.body.daysUntilExpiry).toBeNull();
  });

  it('rok veljavnosti v unix SEKUNDAH (oblika starega .env) je sprejet', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const res = await request(app)
      .post('/api/v1/time-tracking/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Iz starega okolja',
        cookieValue: 'vrednost-piskotka',
        cookieDomain: 'e-racuni.com',
        // cookie_property_expires=1737717074 → 24. 1. 2025, torej že pretekel.
        expiresAt: 1737717074,
      });

    expect(res.status).toBe(201);
    expect(new Date(res.body.expiresAt).getUTCFullYear()).toBe(2025);
    expect(res.body.status).toBe('expired');
  });

  it('neveljaven rok veljavnosti vrne 400, ne tihe napačne vrednosti', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const res = await request(app)
      .post('/api/v1/time-tracking/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Seja', cookieValue: 'v', cookieDomain: 'e-racuni.com', expiresAt: 'včeraj' });

    expect(res.status).toBe(400);
  });

  it('GET vrne seznam brez cele vrednosti piškotka (FR-092)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const userId = await defaultTestUserId();
    await RemoteSessionModel.create({
      userId,
      name: 'Seja',
      cookieName: 'ItcClientID',
      cookieValue: 'skrivnost-ki-ne-sme-uiti',
      cookieDomain: 'e-racuni.com',
    });

    const res = await request(app).get('/api/v1/time-tracking/sessions').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain('skrivnost-ki-ne-sme-uiti');
    expect(res.body[0].cookieSize).toBeGreaterThan(0);
  });

  it('PUT popravi ime piškotka in domeno brez ponovnega vpisa vrednosti (FR-091)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { session } = await seedProfileFixture();

    const res = await request(app)
      .put(`/api/v1/time-tracking/sessions/${String(session._id)}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cookieName: 'DrugoIme', cookieDomain: 'e-racuni.si' });

    expect(res.status).toBe(200);
    expect(res.body.session.cookieName).toBe('DrugoIme');
    expect(res.body.session.cookieDomain).toBe('e-racuni.si');

    // Vrednost je ostala nespremenjena — popravek imena je ne sme izbrisati.
    const stored = await RemoteSessionModel.findById(session._id);
    expect(stored!.cookieValue).toBe('test-cookie-value');
  });

  it('PUT z rokom v prihodnosti izračuna dneve do izteka', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { session } = await seedProfileFixture();
    const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .put(`/api/v1/time-tracking/sessions/${String(session._id)}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ expiresAt: inThreeDays });

    expect(res.status).toBe(200);
    expect(res.body.session.daysUntilExpiry).toBeLessThanOrEqual(3);
    // Manj kot 7 dni → seja se izteka; enak prag kot dnevni pregled (FR-063).
    expect(res.body.session.status).toBe('expiring');
  });

  it('PUT brez enega samega polja vrne 400', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { session } = await seedProfileFixture();

    const res = await request(app)
      .put(`/api/v1/time-tracking/sessions/${String(session._id)}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('DELETE zavrne sejo, ki jo uporablja lokacija, s 409', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { session } = await seedProfileFixture();

    const res = await request(app)
      .delete(`/api/v1/time-tracking/sessions/${String(session._id)}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(await RemoteSessionModel.countDocuments()).toBe(1);
  });

  it('DELETE izbriše nerabljeno sejo', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const userId = await defaultTestUserId();
    const session = await RemoteSessionModel.create({
      userId,
      name: 'Nerabljena',
      cookieName: 'ItcClientID',
      cookieValue: 'vrednost',
      cookieDomain: 'e-racuni.com',
    });

    const res = await request(app)
      .delete(`/api/v1/time-tracking/sessions/${String(session._id)}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
    expect(await RemoteSessionModel.countDocuments()).toBe(0);
  });

  it('seja tujega uporabnika ni vidna niti popravljiva', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const foreign = await RemoteSessionModel.create({
      userId: '000000000000000000000001',
      name: 'Tuja seja',
      cookieName: 'ItcClientID',
      cookieValue: 'tuja-vrednost',
      cookieDomain: 'e-racuni.com',
    });

    const list = await request(app).get('/api/v1/time-tracking/sessions').set('Authorization', `Bearer ${token}`);
    expect(list.body).toHaveLength(0);

    const put = await request(app)
      .put(`/api/v1/time-tracking/sessions/${String(foreign._id)}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cookieDomain: 'napad.example' });
    expect(put.status).toBe(404);
  });
});

describe('/time-tracking/locations/{id} pogodba', () => {
  it('vsaka lokacija ima svoj par koordinat — tri lokacije, tri različne koordinate', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { session } = await seedProfileFixture();
    const sessionId = String(session._id);

    const kraji = [
      { name: 'Služba', latitude: '46.0629_6', longitude: '14.5602_9' },
      { name: 'Doma', latitude: '45.9611_0', longitude: '14.2978_7' },
      { name: 'Terén', latitude: '46.2397_1', longitude: '15.2677_3' },
    ];

    for (const kraj of kraji) {
      const res = await request(app)
        .post('/api/v1/time-tracking/locations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: kraj.name,
          url: 'https://e-racuni.com/S6a/Clockin-0BD5119EC3F00D00AFEED55901C42A1D',
          sessionId,
          coordinateTemplate: { latitude: kraj.latitude, longitude: kraj.longitude },
        });
      expect(res.status).toBe(201);
      expect(res.body.coordinateTemplate.latitude).toBe(kraj.latitude);
    }

    const list = await request(app).get('/api/v1/time-tracking/locations').set('Authorization', `Bearer ${token}`);
    // Tri nove + ena iz seedProfileFixture().
    expect(list.body).toHaveLength(4);
  });

  it('PUT popravi naslov in koordinati, ne da bi povozil raztros in aktivnost', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { location } = await seedProfileFixture({ location: { jitterMeters: 25, active: false } });

    const res = await request(app)
      .put(`/api/v1/time-tracking/locations/${String(location._id)}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        url: 'https://e-racuni.com/S6a/Clockin-5CDC57BC6ACA0D008A4D4EC5051A2B32',
        coordinateTemplate: { latitude: '45.9611_0', longitude: '14.2978_7' },
      });

    expect(res.status).toBe(200);
    expect(res.body.url).toContain('Clockin-5CDC57BC6ACA0D008A4D4EC5051A2B32');
    expect(res.body.coordinateTemplate.longitude).toBe('14.2978_7');
    // Polji, ki nista bili poslani, ostaneta — `.partial()` na shemi s privzetki bi ju povozil.
    expect(res.body.jitterMeters).toBe(25);
    expect(res.body.active).toBe(false);
  });

  it('lokacija nosi gumb za začetek dela — privzeto "Prijava na delo", izbira je del vnosa', async () => {
    // FR-090: gumbi "Prijava na delo" / "Prihod na delo" / "Delo od doma" / "Delo na terenu"
    // pomenijo isto stanje, razlikuje jih kraj — zato je izbira lastnost lokacije in ne
    // urnika (sicer bi bilo treba za delo od doma podvojiti cel profil).
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { session } = await seedProfileFixture();

    const privzeta = await request(app)
      .post('/api/v1/time-tracking/locations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Služba',
        url: 'https://e-racuni.com/S6a/Clockin-0BD5119EC3F00D00AFEED55901C42A1D',
        sessionId: String(session._id),
        coordinateTemplate: { latitude: '46.0629_6', longitude: '14.5602_9' },
      });
    expect(privzeta.status).toBe(201);
    expect(privzeta.body.startAction).toBe('Prijava na delo');

    const doma = await request(app)
      .post('/api/v1/time-tracking/locations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Doma',
        url: 'https://e-racuni.com/S6a/Clockin-0BD5119EC3F00D00AFEED55901C42A1D',
        sessionId: String(session._id),
        startAction: 'Delo od doma',
        coordinateTemplate: { latitude: '45.9611_0', longitude: '14.2978_7' },
      });
    expect(doma.status).toBe(201);
    expect(doma.body.startAction).toBe('Delo od doma');

    const teren = await request(app)
      .put(`/api/v1/time-tracking/locations/${doma.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ startAction: 'Delo na terenu' });
    expect(teren.status).toBe(200);
    expect(teren.body.startAction).toBe('Delo na terenu');

    // Ime gumba, ki ga stran ne ponuja, je zavrnjeno — tipkarska napaka bi sicer pomenila
    // akcijo, ki je portal nikoli ne najde, in tiho zamujen vpis.
    const napacna = await request(app)
      .put(`/api/v1/time-tracking/locations/${doma.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ startAction: 'Prijava v službo' });
    expect(napacna.status).toBe(400);
  });

  it('pošiljanje lokacije je izklopljivo — brez njega koordinati nista obvezni', async () => {
    // FR-094: stikalo pove, ali brskalnik strani sploh pove, kje je naprava. Lokacija, ki
    // lege ne pošilja, koordinat nima kje dobiti — zahtevati ju je pomenilo siliti uporabnika
    // v izmišljeno vrednost.
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { session } = await seedProfileFixture();
    const sessionId = String(session._id);
    const url = 'https://e-racuni.com/S6a/Clockin-0BD5119EC3F00D00AFEED55901C42A1D';

    const brezLege = await request(app)
      .post('/api/v1/time-tracking/locations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Doma brez lege', url, sessionId, sendGeolocation: false });
    expect(brezLege.status).toBe(201);
    expect(brezLege.body.sendGeolocation).toBe(false);
    expect(brezLege.body.coordinateTemplate).toBeUndefined();

    // Privzetek ostaja "pošiljaj" — dosedanje vedenje se s tem stikalom ne spremeni.
    const privzeto = await request(app)
      .post('/api/v1/time-tracking/locations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Služba',
        url,
        sessionId,
        coordinateTemplate: { latitude: '46.0629_6', longitude: '14.5602_9' },
      });
    expect(privzeto.status).toBe(201);
    expect(privzeto.body.sendGeolocation).toBe(true);

    // Pošiljanje brez koordinat je nesmisel in je zavrnjeno.
    const brezKoordinat = await request(app)
      .post('/api/v1/time-tracking/locations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nemogoča', url, sessionId, sendGeolocation: true });
    expect(brezKoordinat.status).toBe(400);

    // Izklop na obstoječi lokaciji koordinat NE izbriše — stikalo je preklop, ne brisanje.
    const izklop = await request(app)
      .put(`/api/v1/time-tracking/locations/${privzeto.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sendGeolocation: false });
    expect(izklop.status).toBe(200);
    expect(izklop.body.sendGeolocation).toBe(false);
    expect(izklop.body.coordinateTemplate.latitude).toBe('46.0629_6');

    // Vklop na lokaciji, ki koordinat nima, je zavrnjen s pojasnilom, ne s tihim zapisom.
    const vklopBrezKoordinat = await request(app)
      .put(`/api/v1/time-tracking/locations/${brezLege.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sendGeolocation: true });
    expect(vklopBrezKoordinat.status).toBe(400);

    const vklopSKoordinatama = await request(app)
      .put(`/api/v1/time-tracking/locations/${brezLege.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sendGeolocation: true, coordinateTemplate: { latitude: '45.9611_0', longitude: '14.2978_7' } });
    expect(vklopSKoordinatama.status).toBe(200);
    expect(vklopSKoordinatama.body.sendGeolocation).toBe(true);
  });

  it('DELETE zavrne lokacijo, ki jo uporablja profil, s 409', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { location } = await seedProfileFixture();

    const res = await request(app)
      .delete(`/api/v1/time-tracking/locations/${String(location._id)}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(await TrackingLocationModel.countDocuments()).toBe(1);
  });
});
