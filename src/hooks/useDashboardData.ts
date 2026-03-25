import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Dienstleisterbuchungen, Schnelleinladung, Eventplanung, Dienstleisterverzeichnis, EinladungenRsvp, Gaesteverzeichnis } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';

export function useDashboardData() {
  const [dienstleisterbuchungen, setDienstleisterbuchungen] = useState<Dienstleisterbuchungen[]>([]);
  const [schnelleinladung, setSchnelleinladung] = useState<Schnelleinladung[]>([]);
  const [eventplanung, setEventplanung] = useState<Eventplanung[]>([]);
  const [dienstleisterverzeichnis, setDienstleisterverzeichnis] = useState<Dienstleisterverzeichnis[]>([]);
  const [einladungenRsvp, setEinladungenRsvp] = useState<EinladungenRsvp[]>([]);
  const [gaesteverzeichnis, setGaesteverzeichnis] = useState<Gaesteverzeichnis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [dienstleisterbuchungenData, schnelleinladungData, eventplanungData, dienstleisterverzeichnisData, einladungenRsvpData, gaesteverzeichnisData] = await Promise.all([
        LivingAppsService.getDienstleisterbuchungen(),
        LivingAppsService.getSchnelleinladung(),
        LivingAppsService.getEventplanung(),
        LivingAppsService.getDienstleisterverzeichnis(),
        LivingAppsService.getEinladungenRsvp(),
        LivingAppsService.getGaesteverzeichnis(),
      ]);
      setDienstleisterbuchungen(dienstleisterbuchungenData);
      setSchnelleinladung(schnelleinladungData);
      setEventplanung(eventplanungData);
      setDienstleisterverzeichnis(dienstleisterverzeichnisData);
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

  return { dienstleisterbuchungen, setDienstleisterbuchungen, schnelleinladung, setSchnelleinladung, eventplanung, setEventplanung, dienstleisterverzeichnis, setDienstleisterverzeichnis, einladungenRsvp, setEinladungenRsvp, gaesteverzeichnis, setGaesteverzeichnis, loading, error, fetchAll, eventplanungMap, dienstleisterverzeichnisMap, gaesteverzeichnisMap };
}