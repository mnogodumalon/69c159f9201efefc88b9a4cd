import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Eventplanung, Dienstleisterbuchungen, Dienstleisterverzeichnis, Schnelleinladung, EinladungenRsvp, Gaesteverzeichnis } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';

export function useDashboardData() {
  const [eventplanung, setEventplanung] = useState<Eventplanung[]>([]);
  const [dienstleisterbuchungen, setDienstleisterbuchungen] = useState<Dienstleisterbuchungen[]>([]);
  const [dienstleisterverzeichnis, setDienstleisterverzeichnis] = useState<Dienstleisterverzeichnis[]>([]);
  const [schnelleinladung, setSchnelleinladung] = useState<Schnelleinladung[]>([]);
  const [einladungenRsvp, setEinladungenRsvp] = useState<EinladungenRsvp[]>([]);
  const [gaesteverzeichnis, setGaesteverzeichnis] = useState<Gaesteverzeichnis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [eventplanungData, dienstleisterbuchungenData, dienstleisterverzeichnisData, schnelleinladungData, einladungenRsvpData, gaesteverzeichnisData] = await Promise.all([
        LivingAppsService.getEventplanung(),
        LivingAppsService.getDienstleisterbuchungen(),
        LivingAppsService.getDienstleisterverzeichnis(),
        LivingAppsService.getSchnelleinladung(),
        LivingAppsService.getEinladungenRsvp(),
        LivingAppsService.getGaesteverzeichnis(),
      ]);
      setEventplanung(eventplanungData);
      setDienstleisterbuchungen(dienstleisterbuchungenData);
      setDienstleisterverzeichnis(dienstleisterverzeichnisData);
      setSchnelleinladung(schnelleinladungData);
      setEinladungenRsvp(einladungenRsvpData);
      setGaesteverzeichnis(gaesteverzeichnisData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Fehler beim Laden der Daten'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const eventplanungMap = useMemo(() => {
    const m = new Map<string, Eventplanung>();
    eventplanung.forEach(r => m.set(r.record_id, r));
    return m;
  }, [eventplanung]);

  const dienstleisterverzeichnisMap = useMemo(() => {
    const m = new Map<string, Dienstleisterverzeichnis>();
    dienstleisterverzeichnis.forEach(r => m.set(r.record_id, r));
    return m;
  }, [dienstleisterverzeichnis]);

  const gaesteverzeichnisMap = useMemo(() => {
    const m = new Map<string, Gaesteverzeichnis>();
    gaesteverzeichnis.forEach(r => m.set(r.record_id, r));
    return m;
  }, [gaesteverzeichnis]);

  return { eventplanung, setEventplanung, dienstleisterbuchungen, setDienstleisterbuchungen, dienstleisterverzeichnis, setDienstleisterverzeichnis, schnelleinladung, setSchnelleinladung, einladungenRsvp, setEinladungenRsvp, gaesteverzeichnis, setGaesteverzeichnis, loading, error, fetchAll, eventplanungMap, dienstleisterverzeichnisMap, gaesteverzeichnisMap };
}