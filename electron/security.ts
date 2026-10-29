export interface WidgetConfig {
  shortcutToggle: string;
  shortcutCapture: string;
  autoHide: boolean;
  prefillAsset: string;
  prefillRisk: string;
}

export function validateConfig(value: unknown, defaults: WidgetConfig): WidgetConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid widget configuration');
  if (Object.keys(value).some(key => !Object.prototype.hasOwnProperty.call(defaults, key))) throw new Error('Unknown widget setting');
  const candidate = { ...defaults, ...value };
  for (const key of ['shortcutToggle', 'shortcutCapture'] as const) {
    const shortcut = candidate[key];
    if (typeof shortcut !== 'string' || (shortcut !== '' && !/^(?:(?:CommandOrControl|Control|Command|Shift|Alt|Super)\+)+(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space|Enter|Escape|Tab|Backspace|Delete|Up|Down|Left|Right|Home|End|PageUp|PageDown)$/.test(shortcut))) {
      throw new Error('Invalid keyboard shortcut');
    }
  }
  if (candidate.shortcutToggle && candidate.shortcutToggle === candidate.shortcutCapture) throw new Error('Shortcuts must be different');
  if (typeof candidate.autoHide !== 'boolean') throw new Error('Invalid auto-hide setting');
  if (typeof candidate.prefillAsset !== 'string' || candidate.prefillAsset.length > 32) throw new Error('Invalid prefilled asset');
  if (typeof candidate.prefillRisk !== 'string' || candidate.prefillRisk.length > 32 || (candidate.prefillRisk !== '' && (!Number.isFinite(Number(candidate.prefillRisk)) || Number(candidate.prefillRisk) < 0))) throw new Error('Invalid prefilled risk');
  return candidate;
}

export function isSafeExternalUrl(value: unknown, authOrigin: string | undefined): value is string {
  if (typeof value !== 'string' || value.length > 8192) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    return (url.origin === authOrigin && url.pathname === '/auth/v1/authorize')
      || (url.hostname === 'github.com' && /^\/Jarlin-56\/trade-blitz-log(?:\/|$)/.test(url.pathname))
      || (url.hostname === 'www.mql5.com' && url.pathname === '/en/users/jarlaogao2310');
  } catch { return false; }
}

export function isDataImage(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 12 * 1024 * 1024
    && /^data:image\/png;base64,iVBORw0KGgo[a-z0-9+/=]+$/i.test(value);
}
