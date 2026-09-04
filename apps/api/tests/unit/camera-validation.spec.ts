import { describe, expect, it } from 'vitest';
import {
  validateCameraAddress,
  requiresProxy,
  isPrivateOrLocalHost,
} from '../../src/domain/camera-validation.js';

// quickstart.md §4, primeri 4-6. Efektivni seznam dovoljenih gostiteljev je tu preprost
// parameter — unijo z okoljem/bazo sestavi embed-allowlist.service.ts (glej njegov test).
const ALLOWED = ['youtube.com', 'ipcamlive.com'];

describe('validateCameraAddress — FR-034', () => {
  it('zavrne neveljaven URL predogleda', () => {
    const result = validateCameraAddress(
      { type: 'snapshot', previewUrl: 'ni-url', hasCredentials: false },
      ALLOWED,
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.field).toBe('previewUrl');
  });

  it('zavrne nedovoljen gostitelj za vdelavo (iframe)', () => {
    const result = validateCameraAddress(
      { type: 'iframe', previewUrl: 'https://evil.example.com/embed', hasCredentials: false },
      ALLOWED,
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.field).toBe('previewUrl');
      expect(result.reason).toContain('evil.example.com');
    }
  });

  it('sprejme poddomeno dovoljenega gostitelja (www.youtube.com pod youtube.com)', () => {
    const result = validateCameraAddress(
      { type: 'iframe', previewUrl: 'https://www.youtube.com/embed/xyz', hasCredentials: false },
      ALLOWED,
    );
    expect(result.valid).toBe(true);
  });

  it('zavrne shemo, ki ni http/https (npr. javascript:)', () => {
    const result = validateCameraAddress(
      { type: 'snapshot', previewUrl: 'javascript:alert(1)', hasCredentials: false },
      ALLOWED,
    );
    expect(result.valid).toBe(false);
  });

  it('sprejme http naslov s poverilnicami (obvezen proxy, ne zavrnitev — FR-020)', () => {
    const result = validateCameraAddress(
      { type: 'snapshot', previewUrl: 'http://kamera.lan/snapshot.jpg', hasCredentials: true },
      ALLOWED,
    );
    expect(result.valid).toBe(true);
  });

  it('snapshot+iframe preveri fullUrl (vdelava), ne previewUrl (posnetek)', () => {
    const result = validateCameraAddress(
      {
        type: 'snapshot+iframe',
        previewUrl: 'https://g0.ipcamlive.com/player/snapshot.php?alias=x',
        fullUrl: 'https://neznano.example.net/player.php?alias=x',
        hasCredentials: false,
      },
      ALLOWED,
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.field).toBe('fullUrl');
  });

  it('snapshot+iframe brez fullUrl preveri previewUrl kot vdelavo', () => {
    const result = validateCameraAddress(
      {
        type: 'snapshot+iframe',
        previewUrl: 'https://g0.ipcamlive.com/player/snapshot.php?alias=x',
        hasCredentials: false,
      },
      ALLOWED,
    );
    expect(result.valid).toBe(true);
  });

  it('type snapshot ne preverja gostitelja proti seznamu dovoljenih (ni vdelava)', () => {
    const result = validateCameraAddress(
      { type: 'snapshot', previewUrl: 'https://poljuben-vir.example.org/snapshot.jpg', hasCredentials: false },
      ALLOWED,
    );
    expect(result.valid).toBe(true);
  });
});

describe('isPrivateOrLocalHost', () => {
  it('prepozna zasebne razpone in localhost', () => {
    expect(isPrivateOrLocalHost('localhost')).toBe(true);
    expect(isPrivateOrLocalHost('127.0.0.1')).toBe(true);
    expect(isPrivateOrLocalHost('10.0.0.5')).toBe(true);
    expect(isPrivateOrLocalHost('192.168.1.1')).toBe(true);
    expect(isPrivateOrLocalHost('172.16.0.1')).toBe(true);
  });

  it('javnega gostitelja ne prepozna kot zasebnega', () => {
    expect(isPrivateOrLocalHost('youtube.com')).toBe(false);
    expect(isPrivateOrLocalHost('8.8.8.8')).toBe(false);
  });
});

describe('requiresProxy — FR-020', () => {
  it('http vir zahteva proxy', () => {
    expect(requiresProxy(new URL('http://example.com/a.jpg'), false)).toBe(true);
  });
  it('https vir s poverilnicami zahteva proxy', () => {
    expect(requiresProxy(new URL('https://example.com/a.jpg'), true)).toBe(true);
  });
  it('https vir v lokalnem omrežju zahteva proxy', () => {
    expect(requiresProxy(new URL('https://192.168.1.10/a.jpg'), false)).toBe(true);
  });
  it('https vir na javnem gostitelju brez poverilnic proxyja ne potrebuje', () => {
    expect(requiresProxy(new URL('https://example.com/a.jpg'), false)).toBe(false);
  });
});
