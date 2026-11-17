import { AppSettings, SiteProfile } from '../types';
import { buildUrl, proxyFetch, describeError, hasRealValue } from './onestockClient';
import { activeProfiles, resolveUrl, tokenOf } from './apiProfiles';
import { settingsStore } from './appStores';

export const hasCredentials = (site?: SiteProfile) => !!site?.userId?.trim() && !!site?.password;

// API URL of a site: the selected URL entry rebuilt for this site, else the current API URL.
const baseUrlOf = (settings: AppSettings, site: SiteProfile) => {
  const { url } = activeProfiles(settings);
  return url ? resolveUrl(url.url, site.siteId) : (settings.apiUrl || '').trim().replace(/\/+$/, '');
};

// POST /login {site_id, user_id, password} → token.
export const loginSite = async (settings: AppSettings, site: SiteProfile): Promise<string> => {
  if (!hasRealValue(site.siteId)) throw new Error('No site ID.');
  if (!hasCredentials(site)) throw new Error('User and password required.');
  const baseUrl = baseUrlOf(settings, site);
  if (!/^https:\/\/[^/\s{}]+/i.test(baseUrl)) throw new Error(`No usable API URL (${baseUrl || 'empty'}).`);
  const envelope = await proxyFetch(buildUrl({ baseUrl, version: settings.apiVersion || 'v3' }, '/login'), 'POST', {
    site_id: site.siteId.trim(),
    user_id: site.userId!.trim(),
    password: site.password,
  });
  if (!envelope.ok) throw new Error(`POST /login: ${describeError(envelope)}`);
  const body: any = envelope.body;
  const token = typeof body === 'string' ? body : body?.token ?? body?.access_token ?? body?.data?.token;
  if (!token || typeof token !== 'string') throw new Error(`POST /login: no token in the answer (${JSON.stringify(body).slice(0, 200)}).`);
  return token;
};

// Settings patch storing a new token for a site: in its shared token when it uses one (all its sites get it),
// else in its own token; the current token too when the site is selected.
export const withSiteToken = (settings: AppSettings, siteId: string, token: string): Partial<AppSettings> => {
  const { sites, urls, tokens, site: active } = activeProfiles(settings);
  const site = sites.find(s => s.id === siteId);
  if (!site) return {};
  const nextTokens = site.tokenId ? tokens.map(t => (t.id === site.tokenId ? { ...t, token } : t)) : tokens;
  const nextSites = site.tokenId ? sites : sites.map(s => (s.id === siteId ? { ...s, token } : s));
  const patch: Partial<AppSettings> = { sites: nextSites, tokens: nextTokens, apiUrls: urls };
  const activeSite = active && nextSites.find(s => s.id === active.id);
  if (activeSite) patch.token = tokenOf(activeSite, nextTokens);
  return patch;
};

// Logs in again with the credentials of the selected site (token rejected); true when a new token is stored.
let pending: Promise<boolean> | null = null;
export const refreshActiveToken = (): Promise<boolean> => {
  if (pending) return pending;
  pending = (async () => {
    const settings = settingsStore.get();
    const { site } = activeProfiles(settings);
    if (!site || !hasCredentials(site)) return false;
    try {
      const token = await loginSite(settings, site);
      settingsStore.set(prev => ({ ...prev, ...withSiteToken(prev, site.id, token) }));
      return true;
    } catch {
      return false;
    }
  })().finally(() => { setTimeout(() => { pending = null; }, 0); });
  return pending;
};
