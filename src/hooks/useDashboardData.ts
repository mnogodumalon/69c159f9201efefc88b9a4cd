import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Eventplanung, EinladungenRsvp, Gaesteverzeichnis, Dienstleisterbuchungen, Dienstleisterverzeichnis, Schnelleinladung } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';

export function useDashboardData() {
  const [eventplanung, setEventplanung] = useState<Eventplanung[]>([]);
  const [einladungenRsvp, setEinladungenRsvp] = useState<EinladungenRsvp[]>([]);
  const [gaesteverzeichnis, setGaesteverzeichnis] = useState<Gaesteverzeichnis[]>([]);
  const [dienstleisterbuchungen, setDienstleisterbuchungen] = useState<Dienstleisterbuchungen[]>([]);
  const [dienstleisterverzeichnis, setDienstleisterverzeichnis] = useState<Dienstleisterverzeichnis[]>([]);
  const [schnelleinladung, setSchnelleinladung] = useState<Schnelleinladung[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [eventplanungData, einladungenRsvpData, gaesteverzeichnisData, dienstleisterbuchungenData, dienstleisterverzeichnisData, schnelleinladungData] = await Promise.all([
        LivingAppsService.getEventplanung(),
        LivingAppsService.getEinladungenRsvp(),
        LivingAppsService.getGaesteverzeichnis(),
        LivingAppsService.getDienstleisterbuchungen(),
        LivingAppsService.getDienstleisterverzeichnis(),
        LivingAppsService.getSchnelleinladung(),
      ]);
      setEventplanung(eventplanungData);
      setEinladungenRsvp(einladungenRsvpData);
      setGaesteverzeichnis(gaesteverzeichnisData);
      setDienstleisterbuchungen(dienstleisterbuchungenData);
      setDienstleisterverzeichnis(dienstleisterverzeichnisData);
      setSchnelleinladung(schnelleinladungData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Fehler beim Laden der Daten'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Silent background refresh (no loading state change → no flicker)
  useEffect(() => {
    async function silentRefresh() {
      try {
        const [eventplanungData, einladungenRsvpData, gaesteverzeichnisData, dienstleisterbuchungenData, dienstleisterverzeichnisData, schnelleinladungData] = await Promise.all([
          LivingAppsService.getEventplanung(),
          LivingAppsService.getEinladungenRsvp(),
          LivingAppsService.getGaesteverzeichnis(),
          LivingAppsService.getDienstleisterbuchungen(),
          LivingAppsService.getDienstleisterverzeichnis(),
          LivingAppsService.getSchnelleinladung(),
        ]);
        setEventplanung(eventplanungData);
        setEinladungenRsvp(einladungenRsvpData);
        setGaesteverzeichnis(gaesteverzeichnisData);
        setDienstleisterbuchungen(dienstleisterbuchungenData);
        setDienstleisterverzeichnis(dienstleisterverzeichnisData);
        setSchnelleinladung(schnelleinladungData);
      } catch {
        // silently ignore — stale data is better than no data
      }
    }
    function handleRefresh() { void silentRefresh(); }
    window.addEventListener('dashboard-refresh', handleRefresh);
    return () => window.removeEventListener('dashboard-refresh', handleRefresh);
  }, []);

  const eventplanungMap = useMemo(() => {
    const m = new Map<string, Eventplanung>();
    eventplanung.forEach(r => m.set(r.record_id, r));
    return m;
  }, [eventplanung]);

  const gaesteverzeichnisMap = useMemo(() => {
    const m = new Map<string, Gaesteverzeichnis>();
    gaesteverzeichnis.forEach(r => m.set(r.record_id, r));
    return m;
  }, [gaesteverzeichnis]);

  const dienstleisterverzeichnisMap = useMemo(() => {
    const m = new Map<string, Dienstleisterverzeichnis>();
    dienstleisterverzeichnis.forEach(r => m.set(r.record_id, r));
    return m;
  }, [dienstleisterverzeichnis]);

  return { eventplanung, setEventplanung, einladungenRsvp, setEinladungenRsvp, gaesteverzeichnis, setGaesteverzeichnis, dienstleisterbuchungen, setDienstleisterbuchungen, dienstleisterverzeichnis, setDienstleisterverzeichnis, schnelleinladung, setSchnelleinladung, loading, error, fetchAll, eventplanungMap, gaesteverzeichnisMap, dienstleisterverzeichnisMap };
}