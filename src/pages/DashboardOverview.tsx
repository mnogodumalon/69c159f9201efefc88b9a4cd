import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichDienstleisterbuchungen, enrichEinladungenRsvp } from '@/lib/enrich';
import type { EnrichedDienstleisterbuchungen, EnrichedEinladungenRsvp } from '@/types/enriched';
import { extractRecordId } from '@/services/livingAppsService';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { StatCard } from '@/components/StatCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  IconAlertCircle,
  IconCalendarPlus,
  IconUserCheck,
  IconBuildingStore,
  IconChevronRight,
  IconCalendar,
  IconUsers,
  IconMailOpened,
  IconCalendarEvent,
  IconMapPin,
  IconCurrencyEuro,
} from '@tabler/icons-react';

function getStatusColor(key: string | undefined): string {
  switch (key) {
    case 'abgeschlossen': return 'bg-green-100 text-green-800 border-green-200';
    case 'bestaetigt': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'einladungen_versendet': return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'in_planung': return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'abgesagt': return 'bg-red-100 text-red-800 border-red-200';
    default: return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

export default function DashboardOverview() {
  const navigate = useNavigate();

  const {
    eventplanung,
    dienstleisterbuchungen,
    einladungenRsvp,
    gaesteverzeichnis,
    eventplanungMap,
    dienstleisterverzeichnisMap,
    gaesteverzeichnisMap,
    loading,
    error,
    fetchAll,
  } = useDashboardData();

  const enrichedBookings: EnrichedDienstleisterbuchungen[] = useMemo(
    () => enrichDienstleisterbuchungen(dienstleisterbuchungen, { eventplanungMap, dienstleisterverzeichnisMap }),
    [dienstleisterbuchungen, eventplanungMap, dienstleisterverzeichnisMap]
  );

  const enrichedRsvp: EnrichedEinladungenRsvp[] = useMemo(
    () => enrichEinladungenRsvp(einladungenRsvp, { eventplanungMap, gaesteverzeichnisMap }),
    [einladungenRsvp, eventplanungMap, gaesteverzeichnisMap]
  );

  // KPI computations
  const now = new Date();

  const upcomingEvents = useMemo(() => {
    return eventplanung
      .filter((e) => {
        const d = e.fields.event_datum ? new Date(e.fields.event_datum) : null;
        return d && d > now;
      })
      .sort((a, b) => {
        const da = new Date(a.fields.event_datum!).getTime();
        const db = new Date(b.fields.event_datum!).getTime();
        return da - db;
      });
  }, [eventplanung]);

  const openRsvpCount = useMemo(
    () => enrichedRsvp.filter((r) => r.fields.rsvp_status?.key === 'ausstehend').length,
    [enrichedRsvp]
  );

  // Per-event booking cost map
  const bookingCostByEvent = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of enrichedBookings) {
      const eventId = b.fields.buchung_event ? extractRecordId(b.fields.buchung_event) : null;
      if (eventId) {
        map[eventId] = (map[eventId] ?? 0) + (b.fields.buchung_preis ?? 0);
      }
    }
    return map;
  }, [enrichedBookings]);

  // Per-event RSVP count map
  const rsvpCountByEvent = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of enrichedRsvp) {
      const eventId = r.fields.einladung_event ? extractRecordId(r.fields.einladung_event) : null;
      if (eventId) {
        map[eventId] = (map[eventId] ?? 0) + 1;
      }
    }
    return map;
  }, [enrichedRsvp]);

  // Budget overview
  const totalBudget = useMemo(
    () => eventplanung.reduce((s, e) => s + (e.fields.event_budget ?? 0), 0),
    [eventplanung]
  );

  const totalBooked = useMemo(
    () => enrichedBookings.reduce((s, b) => s + (b.fields.buchung_preis ?? 0), 0),
    [enrichedBookings]
  );

  // Top upcoming events for panel (next 5)
  const panelEvents = useMemo(() => upcomingEvents.slice(0, 5), [upcomingEvents]);

  // Per-event budget list (all events with budget)
  const budgetBreakdown = useMemo(() => {
    return eventplanung
      .filter((e) => (e.fields.event_budget ?? 0) > 0)
      .sort((a, b) => (b.fields.event_budget ?? 0) - (a.fields.event_budget ?? 0))
      .slice(0, 8);
  }, [eventplanung]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  const budgetPercent = totalBudget > 0 ? Math.min(100, Math.round((totalBooked / totalBudget) * 100)) : 0;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Firmenevent-Manager</h1>
        <p className="text-muted-foreground text-sm mt-1">Ubersicht uber alle Events, Gaste und Buchungen</p>
      </div>

      {/* KPI Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Alle Events"
          value={eventplanung.length}
          description="Gesamt im System"
          icon={<IconCalendarEvent size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Bevorstehend"
          value={upcomingEvents.length}
          description="Events in der Zukunft"
          icon={<IconCalendar size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Gasteverzeichnis"
          value={gaesteverzeichnis.length}
          description="Registrierte Gaste"
          icon={<IconUsers size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Offene RSVPs"
          value={openRsvpCount}
          description="Antwort ausstehend"
          icon={<IconMailOpened size={18} className="text-muted-foreground" />}
        />
      </div>

      {/* Intent Navigation Cards */}
      <div>
        <h2 className="text-base font-semibold mb-3">Schnellzugriff</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => navigate('/intents/event-vorbereiten')}
            className="group flex items-center gap-4 rounded-xl border bg-card p-5 shadow-sm hover:bg-accent hover:border-accent-foreground/20 transition-colors text-left w-full overflow-hidden"
          >
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <IconCalendarPlus size={24} className="text-blue-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">Event vorbereiten</p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">Gaste einladen, Dienstleister buchen, Budget tracken</p>
            </div>
            <IconChevronRight size={18} className="text-muted-foreground flex-shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => navigate('/intents/rsvp-verwaltung')}
            className="group flex items-center gap-4 rounded-xl border bg-card p-5 shadow-sm hover:bg-accent hover:border-accent-foreground/20 transition-colors text-left w-full overflow-hidden"
          >
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
              <IconUserCheck size={24} className="text-green-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">RSVP verwalten</p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">Gasteantworten pro Event uberblicken und pflegen</p>
            </div>
            <IconChevronRight size={18} className="text-muted-foreground flex-shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => navigate('/intents/dienstleister-buchen')}
            className="group flex items-center gap-4 rounded-xl border bg-card p-5 shadow-sm hover:bg-accent hover:border-accent-foreground/20 transition-colors text-left w-full overflow-hidden"
          >
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
              <IconBuildingStore size={24} className="text-purple-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">Dienstleister buchen</p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">Anbieter durchsuchen und fur Events buchen</p>
            </div>
            <IconChevronRight size={18} className="text-muted-foreground flex-shrink-0" />
          </button>
        </div>
      </div>

      {/* Two column layout: upcoming events + budget */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Upcoming Events Panel */}
        <div className="lg:col-span-3 rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-sm">Bevorstehende Events</h2>
            <span className="text-xs text-muted-foreground">{upcomingEvents.length} bevorstehend</span>
          </div>

          {panelEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <IconCalendar size={36} className="text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">Keine bevorstehenden Events</p>
            </div>
          ) : (
            <ul className="divide-y">
              {panelEvents.map((event) => {
                const booked = bookingCostByEvent[event.record_id] ?? 0;
                const budget = event.fields.event_budget ?? 0;
                const guestCount = rsvpCountByEvent[event.record_id] ?? 0;
                const plannedGuests = event.fields.event_gaestezahl ?? 0;
                const overBudget = budget > 0 && booked > budget;
                const budgetPct = budget > 0 ? Math.min(100, Math.round((booked / budget) * 100)) : 0;

                return (
                  <li key={event.record_id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm truncate max-w-full">{event.fields.event_name ?? '(Kein Name)'}</p>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusColor(event.fields.event_status?.key)}`}>
                            {event.fields.event_status?.label ?? 'Unbekannt'}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          {event.fields.event_datum && (
                            <span className="flex items-center gap-1">
                              <IconCalendar size={12} />
                              {formatDate(event.fields.event_datum)}
                            </span>
                          )}
                          {event.fields.event_location_name && (
                            <span className="flex items-center gap-1 truncate">
                              <IconMapPin size={12} />
                              <span className="truncate">{event.fields.event_location_name}</span>
                            </span>
                          )}
                        </div>

                        {/* Budget bar */}
                        {budget > 0 && (
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-muted-foreground flex items-center gap-1">
                                <IconCurrencyEuro size={11} />
                                Budget: {formatCurrency(budget)}
                              </span>
                              <span className={overBudget ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
                                Gebucht: {formatCurrency(booked)} ({budgetPct}%)
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${overBudget ? 'bg-red-500' : budgetPct > 80 ? 'bg-amber-500' : 'bg-blue-500'}`}
                                style={{ width: `${budgetPct}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Guest count */}
                        <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <IconUsers size={12} />
                          <span>{guestCount} von {plannedGuests > 0 ? plannedGuests : '?'} Gasten eingeladen</span>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-shrink-0 text-xs"
                        onClick={() => navigate(`/intents/event-vorbereiten?eventId=${event.record_id}`)}
                      >
                        Vorbereiten
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Budget Overview Panel */}
        <div className="lg:col-span-2 rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b">
            <h2 className="font-semibold text-sm">Budget-Ubersicht</h2>
          </div>

          {/* Summary */}
          <div className="px-5 py-4 border-b">
            <div className="flex items-end justify-between mb-2">
              <div>
                <p className="text-xs text-muted-foreground">Gesamtbudget</p>
                <p className="text-2xl font-bold">{formatCurrency(totalBudget)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Gebucht</p>
                <p className={`text-lg font-semibold ${totalBooked > totalBudget ? 'text-red-600' : 'text-blue-600'}`}>
                  {formatCurrency(totalBooked)}
                </p>
              </div>
            </div>
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${budgetPercent >= 100 ? 'bg-red-500' : budgetPercent >= 80 ? 'bg-amber-500' : 'bg-blue-500'}`}
                style={{ width: `${budgetPercent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 text-right">{budgetPercent}% verbraucht</p>
          </div>

          {/* Per-event breakdown */}
          <div className="flex-1 overflow-y-auto">
            {budgetBreakdown.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                Keine Budget-Daten
              </div>
            ) : (
              <ul className="divide-y">
                {budgetBreakdown.map((event) => {
                  const budget = event.fields.event_budget ?? 0;
                  const booked = bookingCostByEvent[event.record_id] ?? 0;
                  const pct = budget > 0 ? Math.min(100, Math.round((booked / budget) * 100)) : 0;
                  const over = booked > budget;

                  return (
                    <li key={event.record_id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-2 min-w-0 mb-1">
                        <p className="text-xs font-medium truncate min-w-0">{event.fields.event_name ?? '(Kein Name)'}</p>
                        <span className={`text-xs flex-shrink-0 ${over ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                          {pct}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${over ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-blue-400'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                        <span>{formatCurrency(booked)} gebucht</span>
                        <span>von {formatCurrency(budget)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

function DashboardError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <IconAlertCircle size={22} className="text-destructive" />
      </div>
      <div className="text-center">
        <h3 className="font-semibold text-foreground mb-1">Fehler beim Laden</h3>
        <p className="text-sm text-muted-foreground max-w-xs">{error.message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>Erneut versuchen</Button>
    </div>
  );
}
