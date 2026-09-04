import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { signPayload, dispatchEvent } from '../../src/platform/webhooks/dispatcher.service.js';
import { WebhookEndpointModel, WebhookDeliveryModel } from '../../src/platform/webhooks/models.js';

// US11, research.md §7, FR-083: podpisan HMAC-SHA256 v X-CleverDash-Signature, s časovnim
// žigom proti ponovnemu predvajanju.

beforeAll(startTestDb);
afterAll(stopTestDb);
afterEach(() => {
  vi.unstubAllGlobals();
  return clearTestDb();
});

describe('signPayload', () => {
  it('je deterministična funkcija skrivnosti, časovnega žiga in telesa', () => {
    const sig1 = signPayload('skrivnost', '1700000000', '{"a":1}');
    const sig2 = signPayload('skrivnost', '1700000000', '{"a":1}');
    expect(sig1).toBe(sig2);
    expect(sig1).toMatch(/^[0-9a-f]{64}$/); // hex SHA-256
  });

  it('drugačna skrivnost da drugačen podpis (ne moreš ponarediti brez nje)', () => {
    const sig1 = signPayload('skrivnost-a', '1700000000', '{"a":1}');
    const sig2 = signPayload('skrivnost-b', '1700000000', '{"a":1}');
    expect(sig1).not.toBe(sig2);
  });

  it('drugačen časovni žig da drugačen podpis (proti ponovnemu predvajanju)', () => {
    const sig1 = signPayload('skrivnost', '1700000000', '{"a":1}');
    const sig2 = signPayload('skrivnost', '1700000001', '{"a":1}');
    expect(sig1).not.toBe(sig2);
  });
});

describe('dispatchEvent — podpiše in pošlje na naročene endpointe', () => {
  it('pošlje glavo X-CleverDash-Signature z obliko "t=...,v1=..."', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    const endpoint = await WebhookEndpointModel.create({
      url: 'https://example.test/webhook',
      events: ['action.succeeded'],
      secret: 'test-secret',
    });

    await dispatchEvent('action.succeeded', { actionName: 'Prijava na delo' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const call = mockFetch.mock.calls[0]!;
    const [url, init] = call as [string, { headers: Record<string, string> }];
    expect(url).toBe('https://example.test/webhook');
    const signatureHeader = init.headers['X-CleverDash-Signature'];
    expect(signatureHeader).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);

    const delivery = await WebhookDeliveryModel.findOne({ endpointId: endpoint._id }).lean();
    expect(delivery?.deliveredAt).not.toBeNull();
    expect(delivery?.responseStatus).toBe(200);
  });

  it('endpoint, ki ni naročen na dogodek, ne prejme klica', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    await WebhookEndpointModel.create({
      url: 'https://example.test/webhook',
      events: ['session.expiring'], // ni naročen na action.succeeded
      secret: 'test-secret',
    });

    await dispatchEvent('action.succeeded', {});

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('neuspel odgovor razporedi nextAttemptAt (eksponentni zamik)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', mockFetch);

    const endpoint = await WebhookEndpointModel.create({
      url: 'https://example.test/webhook',
      events: ['action.failed'],
      secret: 'test-secret',
    });

    await dispatchEvent('action.failed', {});

    const delivery = await WebhookDeliveryModel.findOne({ endpointId: endpoint._id }).lean();
    expect(delivery?.deliveredAt).toBeNull();
    expect(delivery?.nextAttemptAt).not.toBeNull();
    expect(delivery!.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
  });
});
