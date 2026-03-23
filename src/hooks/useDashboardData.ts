import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Dienstleisterbuchungen, Gaesteverzeichnis, Schnelleinladung, Eventplanung, Dienstleisterverzeichnis, EinladungenRsvp } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';

export function useDashboardData() {
  const [dienstleisterbuchungen, setDienstleisterbuchungen] = useState<Dienstleisterbuchungen[]>([]);
  const [gaesteverzeichnis, setGaesteverzeichnis] = useState<Gaesteverzeichnis[]>([]);
  const [schnelleinladung, setSchnelleinladung] = useState<Schnelleinladung[]>([]);
  const [eventplanung, setEventplanung] = useState<Eventplanung[]>([]);
  const [dienstleisterverzeichnis, setDienstleisterverzeichnis] = useState<Dienstleisterverzeichnis[]>([]);
  const [einladungenRsvp, setEinladungenRsvp] = useState<EinladungenRsvp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [dienstleisterbuchungenData, gaesteverzeichnisData, schnelleinladungData, eventplanungData, dienstleisterverzeichnisData, einladungenRsvpData] = await Promise.all([
        LivingAppsService.getDienstleisterbuchungen(),
        LivingAppsService.getGaesteverzeichnis(),
        LivingAppsService.getSchnelleinladung(),
        LivingAppsService.getEventplanung(),
        LivingAppsService.getDienstleisterverzeichnis(),
        LivingAppsService.getEinladungenRsvp(),
      ]);
      setDienstleisterbuchungen(dienstleisterbuchungenData);
      setGaesteverzeichnis(gaesteverzeichnisData);
      setSchnelleinladung(schnelleinladungData);
      setEventplanung(eventplanungData);
      setDienstleisterverzeichnis(dienstleisterverzeichnisData);
      setEinladungenRsvp(einladungenRsvpData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Fehler beim Laden der Daten'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const gaesteverzeichnisMap = useMemo(() => {
    const m = new Map<string, Gaesteverzeichnis>();
    gaesteverzeichnis.forEach(r => m.set(r.record_id, r));
    return m;
  }, [gaesteverzeichnis]);

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

  return { dienstleisterbuchungen, setDienstleisterbuchungen, gaesteverzeichnis, setGaesteverzeichnis, schnelleinladung, setSchnelleinladung, eventplanung, setEventplanung, dienstleisterverzeichnis, setDienstleisterverzeichnis, einladungenRsvp, setEinladungenRsvp, loading, error, fetchAll, gaesteverzeichnisMap, eventplanungMap, dienstleisterverzeichnisMap };
}