import type { EnrichedDienstleisterbuchungen, EnrichedEinladungenRsvp, EnrichedSchnelleinladung } from '@/types/enriched';
import type { Dienstleisterbuchungen, Dienstleisterverzeichnis, EinladungenRsvp, Eventplanung, Gaesteverzeichnis, Schnelleinladung } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDisplay(url: unknown, map: Map<string, any>, ...fields: string[]): string {
  if (!url) return '';
  const id = extractRecordId(url);
  if (!id) return '';
  const r = map.get(id);
  if (!r) return '';
  return fields.map(f => String(r.fields[f] ?? '')).join(' ').trim();
}

interface EinladungenRsvpMaps {
  eventplanungMap: Map<string, Eventplanung>;
  gaesteverzeichnisMap: Map<string, Gaesteverzeichnis>;
}

export function enrichEinladungenRsvp(
  einladungenRsvp: EinladungenRsvp[],
  maps: EinladungenRsvpMaps
): EnrichedEinladungenRsvp[] {
  return einladungenRsvp.map(r => ({
    ...r,
    einladung_eventName: resolveDisplay(r.fields.einladung_event, maps.eventplanungMap, 'event_name'),
    einladung_gastName: resolveDisplay(r.fields.einladung_gast, maps.gaesteverzeichnisMap, 'vorname', 'nachname'),
  }));
}

interface DienstleisterbuchungenMaps {
  eventplanungMap: Map<string, Eventplanung>;
  dienstleisterverzeichnisMap: Map<string, Dienstleisterverzeichnis>;
}

export function enrichDienstleisterbuchungen(
  dienstleisterbuchungen: Dienstleisterbuchungen[],
  maps: DienstleisterbuchungenMaps
): EnrichedDienstleisterbuchungen[] {
  return dienstleisterbuchungen.map(r => ({
    ...r,
    buchung_eventName: resolveDisplay(r.fields.buchung_event, maps.eventplanungMap, 'event_name'),
    buchung_dienstleisterName: resolveDisplay(r.fields.buchung_dienstleister, maps.dienstleisterverzeichnisMap, 'dl_firmenname'),
  }));
}

interface SchnelleinladungMaps {
  eventplanungMap: Map<string, Eventplanung>;
  gaesteverzeichnisMap: Map<string, Gaesteverzeichnis>;
}

export function enrichSchnelleinladung(
  schnelleinladung: Schnelleinladung[],
  maps: SchnelleinladungMaps
): EnrichedSchnelleinladung[] {
  return schnelleinladung.map(r => ({
    ...r,
    schnell_eventName: resolveDisplay(r.fields.schnell_event, maps.eventplanungMap, 'event_name'),
    schnell_gastName: resolveDisplay(r.fields.schnell_gast, maps.gaesteverzeichnisMap, 'vorname', 'nachname'),
  }));
}
