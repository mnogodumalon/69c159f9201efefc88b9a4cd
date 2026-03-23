// AUTOMATICALLY GENERATED SERVICE
import { APP_IDS, LOOKUP_OPTIONS, FIELD_TYPES } from '@/types/app';
import type { Eventplanung, Dienstleisterbuchungen, Dienstleisterverzeichnis, Schnelleinladung, EinladungenRsvp, Gaesteverzeichnis } from '@/types/app';

// Base Configuration
const API_BASE_URL = 'https://my.living-apps.de/rest';

// --- HELPER FUNCTIONS ---
export function extractRecordId(url: unknown): string | null {
  if (!url) return null;
  if (typeof url !== 'string') return null;
  const match = url.match(/([a-f0-9]{24})$/i);
  return match ? match[1] : null;
}

export function createRecordUrl(appId: string, recordId: string): string {
  return `https://my.living-apps.de/rest/apps/${appId}/records/${recordId}`;
}

async function callApi(method: string, endpoint: string, data?: any) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',  // Nutze Session Cookies für Auth
    body: data ? JSON.stringify(data) : undefined
  });
  if (!response.ok) throw new Error(await response.text());
  // DELETE returns often empty body or simple status
  if (method === 'DELETE') return true;
  return response.json();
}

/** Upload a file to LivingApps. Returns the file URL for use in record fields. */
export async function uploadFile(file: File | Blob, filename?: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file, filename ?? (file instanceof File ? file.name : 'upload'));
  const res = await fetch(`${API_BASE_URL}/files`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  if (!res.ok) throw new Error(`File upload failed: ${res.status}`);
  const data = await res.json();
  return data.url;
}

function enrichLookupFields<T extends { fields: Record<string, unknown> }>(
  records: T[], entityKey: string
): T[] {
  const opts = LOOKUP_OPTIONS[entityKey];
  if (!opts) return records;
  return records.map(r => {
    const fields = { ...r.fields };
    for (const [fieldKey, options] of Object.entries(opts)) {
      const val = fields[fieldKey];
      if (typeof val === 'string') {
        const m = options.find(o => o.key === val);
        fields[fieldKey] = m ?? { key: val, label: val };
      } else if (Array.isArray(val)) {
        fields[fieldKey] = val.map(v => {
          if (typeof v === 'string') {
            const m = options.find(o => o.key === v);
            return m ?? { key: v, label: v };
          }
          return v;
        });
      }
    }
    return { ...r, fields } as T;
  });
}

/** Normalize fields for API writes: strip lookup objects to keys, fix date formats. */
export function cleanFieldsForApi(
  fields: Record<string, unknown>,
  entityKey: string
): Record<string, unknown> {
  const clean: Record<string, unknown> = { ...fields };
  for (const [k, v] of Object.entries(clean)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && 'key' in v) clean[k] = (v as any).key;
    if (Array.isArray(v)) clean[k] = v.map((item: any) => item && typeof item === 'object' && 'key' in item ? item.key : item);
  }
  const types = FIELD_TYPES[entityKey];
  if (types) {
    for (const [k, ft] of Object.entries(types)) {
      if (!(k in clean)) continue;
      const val = clean[k];
      // applookup fields: undefined → null (clear single reference)
      if ((ft === 'applookup/select' || ft === 'applookup/choice') && val === undefined) { clean[k] = null; continue; }
      // multipleapplookup fields: undefined/null → [] (clear multi reference)
      if ((ft === 'multipleapplookup/select' || ft === 'multipleapplookup/choice') && (val === undefined || val === null)) { clean[k] = []; continue; }
      // lookup fields: undefined → null (clear single lookup)
      if ((ft.startsWith('lookup/')) && val === undefined) { clean[k] = null; continue; }
      // multiplelookup fields: undefined/null → [] (clear multi lookup)
      if ((ft.startsWith('multiplelookup/')) && (val === undefined || val === null)) { clean[k] = []; continue; }
      if (typeof val !== 'string' || !val) continue;
      if (ft === 'date/datetimeminute') clean[k] = val.slice(0, 16);
      else if (ft === 'date/date') clean[k] = val.slice(0, 10);
    }
  }
  return clean;
}

let _cachedUserProfile: Record<string, unknown> | null = null;

export async function getUserProfile(): Promise<Record<string, unknown>> {
  if (_cachedUserProfile) return _cachedUserProfile;
  const raw = await callApi('GET', '/user');
  const skip = new Set(['id', 'image', 'lang', 'gender', 'title', 'fax', 'menus', 'initials']);
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v != null && !skip.has(k)) data[k] = v;
  }
  _cachedUserProfile = data;
  return data;
}

export interface HeaderProfile {
  firstname: string;
  surname: string;
  email: string;
  image: string | null;
  company: string | null;
}

let _cachedHeaderProfile: HeaderProfile | null = null;

export async function getHeaderProfile(): Promise<HeaderProfile> {
  if (_cachedHeaderProfile) return _cachedHeaderProfile;
  const raw = await callApi('GET', '/user');
  _cachedHeaderProfile = {
    firstname: raw.firstname ?? '',
    surname: raw.surname ?? '',
    email: raw.email ?? '',
    image: raw.image ?? null,
    company: raw.company ?? null,
  };
  return _cachedHeaderProfile;
}

export interface AppGroupInfo {
  id: string;
  name: string;
  image: string | null;
  createdat: string;
  /** Resolved link: /objects/{id}/ if the dashboard exists, otherwise /gateway/apps/{firstAppId}?template=list_page */
  href: string;
}

let _cachedAppGroups: AppGroupInfo[] | null = null;

export async function getAppGroups(): Promise<AppGroupInfo[]> {
  if (_cachedAppGroups) return _cachedAppGroups;
  const raw = await callApi('GET', '/appgroups?with=apps');
  const groups: AppGroupInfo[] = Object.values(raw)
    .map((g: any) => {
      const firstAppId = Object.keys(g.apps ?? {})[0] ?? g.id;
      return {
        id: g.id,
        name: g.name,
        image: g.image ?? null,
        createdat: g.createdat ?? '',
        href: `/gateway/apps/${firstAppId}?template=list_page`,
        _firstAppId: firstAppId,
      };
    })
    .sort((a, b) => b.createdat.localeCompare(a.createdat));

  // Check which appgroups have a working dashboard at /objects/{id}/
  const checks = await Promise.allSettled(
    groups.map(g => fetch(`/objects/${g.id}/`, { method: 'HEAD', credentials: 'include' }))
  );
  checks.forEach((result, i) => {
    if (result.status === 'fulfilled' && result.value.ok) {
      groups[i].href = `/objects/${groups[i].id}/`;
    }
  });

  // Clean up internal helper property
  groups.forEach(g => delete (g as any)._firstAppId);

  _cachedAppGroups = groups;
  return _cachedAppGroups;
}

export class LivingAppsService {
  // --- EVENTPLANUNG ---
  static async getEventplanung(): Promise<Eventplanung[]> {
    const data = await callApi('GET', `/apps/${APP_IDS.EVENTPLANUNG}/records`);
    const records = Object.entries(data).map(([id, rec]: [string, any]) => ({
      record_id: id, ...rec
    })) as Eventplanung[];
    return enrichLookupFields(records, 'eventplanung');
  }
  static async getEventplanungEntry(id: string): Promise<Eventplanung | undefined> {
    const data = await callApi('GET', `/apps/${APP_IDS.EVENTPLANUNG}/records/${id}`);
    const record = { record_id: data.id, ...data } as Eventplanung;
    return enrichLookupFields([record], 'eventplanung')[0];
  }
  static async createEventplanungEntry(fields: Eventplanung['fields']) {
    return callApi('POST', `/apps/${APP_IDS.EVENTPLANUNG}/records`, { fields });
  }
  static async updateEventplanungEntry(id: string, fields: Partial<Eventplanung['fields']>) {
    return callApi('PATCH', `/apps/${APP_IDS.EVENTPLANUNG}/records/${id}`, { fields });
  }
  static async deleteEventplanungEntry(id: string) {
    return callApi('DELETE', `/apps/${APP_IDS.EVENTPLANUNG}/records/${id}`);
  }

  // --- DIENSTLEISTERBUCHUNGEN ---
  static async getDienstleisterbuchungen(): Promise<Dienstleisterbuchungen[]> {
    const data = await callApi('GET', `/apps/${APP_IDS.DIENSTLEISTERBUCHUNGEN}/records`);
    const records = Object.entries(data).map(([id, rec]: [string, any]) => ({
      record_id: id, ...rec
    })) as Dienstleisterbuchungen[];
    return enrichLookupFields(records, 'dienstleisterbuchungen');
  }
  static async getDienstleisterbuchungenEntry(id: string): Promise<Dienstleisterbuchungen | undefined> {
    const data = await callApi('GET', `/apps/${APP_IDS.DIENSTLEISTERBUCHUNGEN}/records/${id}`);
    const record = { record_id: data.id, ...data } as Dienstleisterbuchungen;
    return enrichLookupFields([record], 'dienstleisterbuchungen')[0];
  }
  static async createDienstleisterbuchungenEntry(fields: Dienstleisterbuchungen['fields']) {
    return callApi('POST', `/apps/${APP_IDS.DIENSTLEISTERBUCHUNGEN}/records`, { fields });
  }
  static async updateDienstleisterbuchungenEntry(id: string, fields: Partial<Dienstleisterbuchungen['fields']>) {
    return callApi('PATCH', `/apps/${APP_IDS.DIENSTLEISTERBUCHUNGEN}/records/${id}`, { fields });
  }
  static async deleteDienstleisterbuchungenEntry(id: string) {
    return callApi('DELETE', `/apps/${APP_IDS.DIENSTLEISTERBUCHUNGEN}/records/${id}`);
  }

  // --- DIENSTLEISTERVERZEICHNIS ---
  static async getDienstleisterverzeichnis(): Promise<Dienstleisterverzeichnis[]> {
    const data = await callApi('GET', `/apps/${APP_IDS.DIENSTLEISTERVERZEICHNIS}/records`);
    const records = Object.entries(data).map(([id, rec]: [string, any]) => ({
      record_id: id, ...rec
    })) as Dienstleisterverzeichnis[];
    return enrichLookupFields(records, 'dienstleisterverzeichnis');
  }
  static async getDienstleisterverzeichni(id: string): Promise<Dienstleisterverzeichnis | undefined> {
    const data = await callApi('GET', `/apps/${APP_IDS.DIENSTLEISTERVERZEICHNIS}/records/${id}`);
    const record = { record_id: data.id, ...data } as Dienstleisterverzeichnis;
    return enrichLookupFields([record], 'dienstleisterverzeichnis')[0];
  }
  static async createDienstleisterverzeichni(fields: Dienstleisterverzeichnis['fields']) {
    return callApi('POST', `/apps/${APP_IDS.DIENSTLEISTERVERZEICHNIS}/records`, { fields });
  }
  static async updateDienstleisterverzeichni(id: string, fields: Partial<Dienstleisterverzeichnis['fields']>) {
    return callApi('PATCH', `/apps/${APP_IDS.DIENSTLEISTERVERZEICHNIS}/records/${id}`, { fields });
  }
  static async deleteDienstleisterverzeichni(id: string) {
    return callApi('DELETE', `/apps/${APP_IDS.DIENSTLEISTERVERZEICHNIS}/records/${id}`);
  }

  // --- SCHNELLEINLADUNG ---
  static async getSchnelleinladung(): Promise<Schnelleinladung[]> {
    const data = await callApi('GET', `/apps/${APP_IDS.SCHNELLEINLADUNG}/records`);
    const records = Object.entries(data).map(([id, rec]: [string, any]) => ({
      record_id: id, ...rec
    })) as Schnelleinladung[];
    return enrichLookupFields(records, 'schnelleinladung');
  }
  static async getSchnelleinladungEntry(id: string): Promise<Schnelleinladung | undefined> {
    const data = await callApi('GET', `/apps/${APP_IDS.SCHNELLEINLADUNG}/records/${id}`);
    const record = { record_id: data.id, ...data } as Schnelleinladung;
    return enrichLookupFields([record], 'schnelleinladung')[0];
  }
  static async createSchnelleinladungEntry(fields: Schnelleinladung['fields']) {
    return callApi('POST', `/apps/${APP_IDS.SCHNELLEINLADUNG}/records`, { fields });
  }
  static async updateSchnelleinladungEntry(id: string, fields: Partial<Schnelleinladung['fields']>) {
    return callApi('PATCH', `/apps/${APP_IDS.SCHNELLEINLADUNG}/records/${id}`, { fields });
  }
  static async deleteSchnelleinladungEntry(id: string) {
    return callApi('DELETE', `/apps/${APP_IDS.SCHNELLEINLADUNG}/records/${id}`);
  }

  // --- EINLADUNGEN_&_RSVP ---
  static async getEinladungenRsvp(): Promise<EinladungenRsvp[]> {
    const data = await callApi('GET', `/apps/${APP_IDS.EINLADUNGEN_RSVP}/records`);
    const records = Object.entries(data).map(([id, rec]: [string, any]) => ({
      record_id: id, ...rec
    })) as EinladungenRsvp[];
    return enrichLookupFields(records, 'einladungen_&_rsvp');
  }
  static async getEinladungenRsvpEntry(id: string): Promise<EinladungenRsvp | undefined> {
    const data = await callApi('GET', `/apps/${APP_IDS.EINLADUNGEN_RSVP}/records/${id}`);
    const record = { record_id: data.id, ...data } as EinladungenRsvp;
    return enrichLookupFields([record], 'einladungen_&_rsvp')[0];
  }
  static async createEinladungenRsvpEntry(fields: EinladungenRsvp['fields']) {
    return callApi('POST', `/apps/${APP_IDS.EINLADUNGEN_RSVP}/records`, { fields });
  }
  static async updateEinladungenRsvpEntry(id: string, fields: Partial<EinladungenRsvp['fields']>) {
    return callApi('PATCH', `/apps/${APP_IDS.EINLADUNGEN_RSVP}/records/${id}`, { fields });
  }
  static async deleteEinladungenRsvpEntry(id: string) {
    return callApi('DELETE', `/apps/${APP_IDS.EINLADUNGEN_RSVP}/records/${id}`);
  }

  // --- GAESTEVERZEICHNIS ---
  static async getGaesteverzeichnis(): Promise<Gaesteverzeichnis[]> {
    const data = await callApi('GET', `/apps/${APP_IDS.GAESTEVERZEICHNIS}/records`);
    const records = Object.entries(data).map(([id, rec]: [string, any]) => ({
      record_id: id, ...rec
    })) as Gaesteverzeichnis[];
    return enrichLookupFields(records, 'gaesteverzeichnis');
  }
  static async getGaesteverzeichni(id: string): Promise<Gaesteverzeichnis | undefined> {
    const data = await callApi('GET', `/apps/${APP_IDS.GAESTEVERZEICHNIS}/records/${id}`);
    const record = { record_id: data.id, ...data } as Gaesteverzeichnis;
    return enrichLookupFields([record], 'gaesteverzeichnis')[0];
  }
  static async createGaesteverzeichni(fields: Gaesteverzeichnis['fields']) {
    return callApi('POST', `/apps/${APP_IDS.GAESTEVERZEICHNIS}/records`, { fields });
  }
  static async updateGaesteverzeichni(id: string, fields: Partial<Gaesteverzeichnis['fields']>) {
    return callApi('PATCH', `/apps/${APP_IDS.GAESTEVERZEICHNIS}/records/${id}`, { fields });
  }
  static async deleteGaesteverzeichni(id: string) {
    return callApi('DELETE', `/apps/${APP_IDS.GAESTEVERZEICHNIS}/records/${id}`);
  }

}