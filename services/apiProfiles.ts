import { AppSettings, ApiUrlProfile, SiteProfile } from '../types';
import { QUALIF_URL_TEMPLATE, PROD_URL_TEMPLATE, hasRealValue } from './onestockClient';

export const newProfileId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const DEFAULT_API_URLS: ApiUrlProfile[] = [
  { id: 'qualif', label: 'Qualif', url: QUALIF_URL_TEMPLATE },
  { id: 'prod', label: 'Production', url: PROD_URL_TEMPLATE },
];

export const resolveUrl = (url: string, siteId: string) =>
  url.trim().replace(/\{site_id\}/g, hasRealValue(siteId) ? siteId.trim() : '{site_id}').replace(/\/+$/, '');

// Sites and URLs of the settings; before they were defined, the current site / URL become the first entries.
export const profilesOf = (settings: AppSettings): { sites: SiteProfile[]; urls: ApiUrlProfile[] } => {
  const sites = settings.sites ?? (hasRealValue(settings.siteId)
    ? [{ id: 'current', label: settings.apiName && settings.apiName !== 'Default' ? settings.apiName : settings.siteId, siteId: settings.siteId, token: settings.token }]
    : []);
  let urls = settings.apiUrls ?? DEFAULT_API_URLS;
  if (!settings.apiUrls && settings.apiUrl && !urls.some(u => resolveUrl(u.url, settings.siteId) === settings.apiUrl.replace(/\/+$/, ''))) {
    urls = [{ id: 'current', label: 'Current', url: settings.apiUrl }, ...urls];
  }
  return { sites, urls };
};

// Active entries: the stored ids, else the entries matching the current site / URL.
export const activeProfiles = (settings: AppSettings) => {
  const { sites, urls } = profilesOf(settings);
  const site = sites.find(s => s.id === settings.activeSiteId) || sites.find(s => s.siteId === settings.siteId && s.token === settings.token)
    || sites.find(s => s.siteId === settings.siteId);
  const url = urls.find(u => u.id === settings.activeUrlId && resolveUrl(u.url, settings.siteId) === (settings.apiUrl || '').replace(/\/+$/, ''))
    || urls.find(u => resolveUrl(u.url, settings.siteId) === (settings.apiUrl || '').replace(/\/+$/, ''));
  return { sites, urls, site, url };
};

// Settings patch selecting a site: its id / token, and the selected URL rebuilt for this site.
export const selectSite = (settings: AppSettings, id: string): Partial<AppSettings> => {
  const { sites, urls, url } = activeProfiles(settings);
  const site = sites.find(s => s.id === id);
  if (!site) return {};
  const urlEntry = url || urls.find(u => u.id === settings.activeUrlId);
  return {
    sites, apiUrls: urls,
    activeSiteId: site.id, siteId: site.siteId, token: site.token,
    ...(urlEntry ? { apiUrl: resolveUrl(urlEntry.url, site.siteId), activeUrlId: urlEntry.id } : {}),
  };
};

export const selectUrl = (settings: AppSettings, id: string): Partial<AppSettings> => {
  const { sites, urls } = profilesOf(settings);
  const u = urls.find(x => x.id === id);
  return u ? { sites, apiUrls: urls, activeUrlId: u.id, apiUrl: resolveUrl(u.url, settings.siteId) } : {};
};
