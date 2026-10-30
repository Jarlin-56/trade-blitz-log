import { describe, expect, it } from 'vitest';
import { isSafeExternalUrl, isDataImage, validateConfig } from '../../electron/security';

const defaults = { shortcutToggle: 'CommandOrControl+Shift+Space', shortcutCapture: 'CommandOrControl+Shift+X', autoHide: true, prefillAsset: '', prefillRisk: '' };
describe('Electron boundary validation', () => {
  it('only permits the configured authentication endpoint and project links', () => {
    const origin = 'https://project.supabase.co';
    expect(isSafeExternalUrl(`${origin}/auth/v1/authorize?provider=google`, origin)).toBe(true);
    for (const url of ['file:///C:/Windows', 'https://evil.supabase.co/auth/v1/authorize', `${origin}/storage/v1/object`, 'https://user:pass@project.supabase.co/auth/v1/authorize', 'javascript:alert(1)']) {
      expect(isSafeExternalUrl(url, origin)).toBe(false);
    }
  });
  it('rejects invalid or conflicting widget settings', () => {
    expect(validateConfig({ autoHide: false }, defaults).autoHide).toBe(false);
    expect(() => validateConfig({ shortcutCapture: defaults.shortcutToggle }, defaults)).toThrow();
    expect(() => validateConfig({ shortcutCapture: 'not-a-shortcut' }, defaults)).toThrow();
    expect(() => validateConfig({ prefillRisk: '-1' }, defaults)).toThrow();
    expect(() => validateConfig({ unexpected: true }, defaults)).toThrow();
  });
  it('rejects arbitrary or oversized screenshot payloads', () => {
    expect(isDataImage('data:image/png;base64,iVBORw0KGgoAAA==')).toBe(true);
    expect(isDataImage('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
    expect(isDataImage('data:image/png;base64,' + 'A'.repeat(13 * 1024 * 1024))).toBe(false);
  });
});
