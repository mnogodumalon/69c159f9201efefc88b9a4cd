import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Gaesteverzeichnis, Dienstleisterverzeichnis, Eventplanung, EinladungenRsvp, Dienstleisterbuchungen, Schnelleinladung } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';

export function useDashboardData() {
  const [gaesteverzeichnis, setGaesteverzeichnis] = useState<Gaesteverzeichnis[]>([]);
  const [dienstleisterverzeichnis, setDienstleisterverzeichnis] = useState<Dienstleisterverzeichnis[]>([]);
  const [eventplanung, setEventplanung] = useState<Eventplanung[]>([]);
  const [einladungenRsvp, setEinladungenRsvp] = useState<EinladungenRsvp[]>([]);
  const [dienstleisterbuchungen, setDienstleisterbuchungen] = useState<Dienstleisterbuchungen[]>([]);
  const [schnelleinladung, setSchnelleinladung] = useState<Schnelleinladung[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [gaesteverzeichnisData, dienstleisterverzeichnisData, eventplanungData, einladungenRsvpData, dienstleisterbuchungenData, schnelleinladungData] = await Promise.all([
        LivingAppsService.getGaesteverzeichnis(),
        LivingAppsService.getDienstleisterverzeichnis(),
        LivingAppsService.getEventplanung(),
        LivingAppsService.getEinladungenRsvp(),
        LivingAppsService.getDienstleisterbuchungen(),
        LivingAppsService.getSchnelleinladung(),
      ]);
      setGaesteverzeichnis(gaesteverzeichnisData);
      setDienstleisterverzeichnis(dienstleisterverzeichnisData);
      setEventplanung(eventplanungData);
      setEinladungenRsvp(einladungenRsvpData);
      setDienstleisterbuchungen(dienstleisterbuchungenData);
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
        const [gaesteverzeichnisData, dienstleisterverzeichnisData, eventplanungData, einladungenRsvpData, dienstleisterbuchungenData, schnelleinladungData] = await Promise.all([
          LivingAppsService.getGaesteverzeichnis(),
          LivingAppsService.getDienstleisterverzeichnis(),
          LivingAppsService.getEventplanung(),
          LivingAppsService.getEinladungenRsvp(),
          LivingAppsService.getDienstleisterbuchungen(),
          LivingAppsService.getSchnelleinladung(),
        ]);
        setGaesteverzeichnis(gaesteverzeichnisData);
        setDienstleisterverzeichnis(dienstleisterverzeichnisData);
        setEventplanung(eventplanungData);
        setEinladungenRsvp(einladungenRsvpData);
        setDienstleisterbuchungen(dienstleisterbuchungenData);
        setSchnelleinladung(schnelleinladungData);
      } catch {
        // silently ignore — stale data is better than no data
      }
    }
    function handleRefresh() { void silentRefresh(); }
    window.addEventListener('dashboard-refresh', handleRefresh);
    return () => window.removeEventListener('dashboard-refresh', handleRefresh);
  }, []);

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

  const eventplanungMap = useMemo(() => {
    const m = new Map<string, Eventplanung>();
    eventplanung.forEach(r => m.set(r.record_id, r));
    return m;
  }, [eventplanung]);

  return { gaesteverzeichnis, setGaesteverzeichnis, dienstleisterverzeichnis, setDienstleisterverzeichnis, eventplanung, setEventplanung, einladungenRsvp, setEinladungenRsvp, dienstleisterbuchungen, setDienstleisterbuchungen, schnelleinladung, setSchnelleinladung, loading, error, fetchAll, gaesteverzeichnisMap, dienstleisterverzeichnisMap, eventplanungMap };
}