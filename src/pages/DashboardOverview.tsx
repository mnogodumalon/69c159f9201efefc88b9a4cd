import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichDienstleisterbuchungen, enrichEinladungenRsvp } from '@/lib/enrich';
import type { EnrichedEinladungenRsvp } from '@/types/enriched';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { extractRecordId } from '@/services/livingAppsService';
import {
  IconAlertCircle,
  IconCalendarEvent,
  IconUsers,
  IconClockHour4,
  IconBuildingCommunity,
  IconArrowRight,
  IconUserPlus,
  IconBriefcase,
  IconCheck,
  IconX,
  IconQuestionMark,
  IconMail,
} from '@tabler/icons-react';

export default function DashboardOverview() {
  const {
    dienstleisterbuchungen,
    gaesteverzeichnis,
    eventplanung,
    dienstleisterverzeichnisMap,
    einladungenRsvp,
    eventplanungMap,
    gaesteverzeichnisMap,
    loading,
    error,
    fetchAll,
  } = useDashboardData();

  const enrichedDienstleisterbuchungen = useMemo(
    () => enrichDienstleisterbuchungen(dienstleisterbuchungen, { eventplanungMap, dienstleisterverzeichnisMap }),
    [dienstleisterbuchungen, eventplanungMap, dienstleisterverzeichnisMap]
  );

  const enrichedEinladungenRsvp = useMemo(
    () => enrichEinladungenRsvp(einladungenRsvp, { eventplanungMap, gaesteverzeichnisMap }),
    [einladungenRsvp, eventplanungMap, gaesteverzeichnisMap]
  );

  const navigate = useNavigate();

  const activeStatuses = new Set(['in_planung', 'einladungen_versendet', 'bestaetigt']);

  const totalEvents = eventplanung.length;

  const activeEvents = useMemo(
    () => eventplanung.filter(e => activeStatuses.has(e.fields.event_status?.key ?? '')).length,
    [eventplanung]
  );

  const totalGuests = gaesteverzeichnis.length;

  const pendingRsvps = useMemo(
    () => einladungenRsvp.filter(r => r.fields.rsvp_status?.key === 'ausstehend').length,
    [einladungenRsvp]
  );

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    return [...eventplanung]
      .filter(e => {
        const d = e.fields.event_datum ? new Date(e.fields.event_datum) : null;
        return d && d >= now;
      })
      .sort((a, b) => {
        const da = new Date(a.fields.event_datum ?? '').getTime();
        const db = new Date(b.fields.event_datum ?? '').getTime();
        return da - db;
      })
      .slice(0, 3);
  }, [eventplanung]);

  const recentRsvps = useMemo<EnrichedEinladungenRsvp[]>(() => {
    return [...enrichedEinladungenRsvp]
      .filter(r => r.fields.rsvp_status?.key !== 'ausstehend')
      .sort((a, b) => {
        const da = new Date(a.fields.rsvp_datum ?? a.updatedat ?? a.createdat).getTime();
        const db = new Date(b.fields.rsvp_datum ?? b.updatedat ?? b.createdat).getTime();
        return db - da;
      })
      .slice(0, 5);
  }, [enrichedEinladungenRsvp]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  function getEventRsvpCounts(eventId: string) {
    const invitations = einladungenRsvp.filter(
      r => extractRecordId(r.fields.einladung_event ?? '') === eventId
    );
    const confirmed = invitations.filter(r => r.fields.rsvp_status?.key === 'zugesagt').length;
    return { total: invitations.length, confirmed };
  }

  function getEventBookingTotal(eventId: string): number {
    return enrichedDienstleisterbuchungen
      .filter(b => extractRecordId(b.fields.buchung_event ?? '') === eventId)
      .reduce((sum, b) => sum + (b.fields.buchung_preis ?? 0), 0);
  }

  function statusBadgeVariant(key: string): 'default' | 'secondary' | 'destructive' | 'outline' {
    switch (key) {
      case 'bestaetigt': return 'default';
      case 'abgesagt': return 'destructive';
      case 'abgeschlossen': return 'secondary';
      default: return 'outline';
    }
  }

  function rsvpIcon(key: string) {
    switch (key) {
      case 'zugesagt': return <IconCheck size={14} className="text-green-600" />;
      case 'abgesagt': return <IconX size={14} className="text-destructive" />;
      case 'vielleicht': return <IconQuestionMark size={14} className="text-yellow-600" />;
      default: return <IconClockHour4 size={14} className="text-muted-foreground" />;
    }
  }

  return (
    <div className="space-y-8">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Firmenevent-Manager</h1>
          <p className="text-sm text-muted-foreground mt-1">Planen, einladen und koordinieren Sie Ihre Firmenevents.</p>
        </div>
        <a href="#/intents/event-vorbereiten">
          <Button className="w-full sm:w-auto gap-2">
            <IconCalendarEvent size={16} />
            Neues Event planen
          </Button>
        </a>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Events gesamt"
          value={totalEvents}
          description="Alle Events"
          icon={<IconCalendarEvent size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Aktive Events"
          value={activeEvents}
          description="In Planung / Bestätigt"
          icon={<IconBuildingCommunity size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Gäste"
          value={totalGuests}
          description="Im Verzeichnis"
          icon={<IconUsers size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Offene RSVPs"
          value={pendingRsvps}
          description="Antwort ausstehend"
          icon={<IconClockHour4 size={18} className="text-muted-foreground" />}
        />
      </div>

      {/* Upcoming Events */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Bevorstehende Events</h2>
          <button
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            onClick={() => navigate('/eventplanung')}
          >
            Alle Events <IconArrowRight size={14} />
          </button>
        </div>

        {upcomingEvents.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <IconCalendarEvent size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Keine bevorstehenden Events gefunden.</p>
              <a href="#/intents/event-vorbereiten">
                <Button variant="outline" size="sm" className="mt-4 gap-2">
                  <IconCalendarEvent size={14} />
                  Erstes Event planen
                </Button>
              </a>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {upcomingEvents.map(event => {
              const { total: rsvpTotal, confirmed } = getEventRsvpCounts(event.record_id);
              const bookingTotal = getEventBookingTotal(event.record_id);
              const budget = event.fields.event_budget ?? 0;
              const budgetPct = budget > 0 ? Math.min(100, Math.round((bookingTotal / budget) * 100)) : 0;
              const statusKey = event.fields.event_status?.key ?? '';
              const statusLabel = event.fields.event_status?.label ?? 'Unbekannt';

              return (
                <Card key={event.record_id} className="overflow-hidden flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-tight min-w-0 truncate">
                        {event.fields.event_name ?? 'Unbenanntes Event'}
                      </CardTitle>
                      <Badge variant={statusBadgeVariant(statusKey)} className="shrink-0 text-xs">
                        {statusLabel}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {event.fields.event_datum ? formatDate(event.fields.event_datum) : 'Datum unbekannt'}
                      {event.fields.event_location_name && (
                        <> &middot; {event.fields.event_location_name}</>
                      )}
                      {event.fields.event_stadt && (
                        <>, {event.fields.event_stadt}</>
                      )}
                    </p>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-3 pt-0">
                    {/* Guests */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <IconUsers size={14} />
                        Gäste
                      </span>
                      <span className="font-medium">
                        {confirmed} zugesagt
                        {event.fields.event_gaestezahl ? ` / ${event.fields.event_gaestezahl} geplant` : ''}
                        {rsvpTotal > 0 && ` (${rsvpTotal} eingeladen)`}
                      </span>
                    </div>

                    {/* Budget */}
                    {budget > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <IconBriefcase size={14} />
                            Budget
                          </span>
                          <span className="font-medium">
                            {formatCurrency(bookingTotal)} / {formatCurrency(budget)}
                          </span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${budgetPct >= 90 ? 'bg-destructive' : budgetPct >= 70 ? 'bg-yellow-500' : 'bg-primary'}`}
                            style={{ width: `${budgetPct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <a
                        href={`#/intents/event-vorbereiten?eventId=${event.record_id}`}
                        className="flex-1"
                      >
                        <Button variant="outline" size="sm" className="w-full gap-1 text-xs">
                          <IconCalendarEvent size={13} />
                          Vorbereiten
                        </Button>
                      </a>
                      <a
                        href={`#/intents/event-abschliessen?eventId=${event.record_id}`}
                        className="flex-1"
                      >
                        <Button variant="default" size="sm" className="w-full gap-1 text-xs">
                          <IconCheck size={13} />
                          Abschliessen
                        </Button>
                      </a>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Schnellaktionen</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <a href="#/intents/event-vorbereiten?step=2" className="block">
            <Card className="overflow-hidden hover:border-primary/50 transition-colors cursor-pointer h-full">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <IconUserPlus size={22} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm">Gäste einladen</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    Wählen Sie ein Event und laden Sie Gäste direkt ein.
                  </p>
                </div>
                <IconArrowRight size={16} className="text-muted-foreground shrink-0 ml-auto" />
              </CardContent>
            </Card>
          </a>
          <a href="#/intents/event-vorbereiten?step=3" className="block">
            <Card className="overflow-hidden hover:border-primary/50 transition-colors cursor-pointer h-full">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <IconBriefcase size={22} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm">Dienstleister buchen</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    Buchen Sie Catering, Technik, Location und mehr.
                  </p>
                </div>
                <IconArrowRight size={16} className="text-muted-foreground shrink-0 ml-auto" />
              </CardContent>
            </Card>
          </a>
        </div>
      </div>

      {/* Recent RSVP Activity */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Letzte RSVP-Antworten</h2>
        <Card className="overflow-hidden">
          {recentRsvps.length === 0 ? (
            <CardContent className="py-10 text-center text-muted-foreground">
              <IconMail size={28} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Noch keine RSVP-Antworten eingegangen.</p>
            </CardContent>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Gast</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Event</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Datum</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRsvps.map(rsvp => (
                    <tr key={rsvp.record_id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium truncate max-w-[140px]">
                        {rsvp.einladung_gastName || '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground truncate max-w-[160px]">
                        {rsvp.einladung_eventName || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5">
                          {rsvpIcon(rsvp.fields.rsvp_status?.key ?? '')}
                          <span>{rsvp.fields.rsvp_status?.label ?? '—'}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                        {rsvp.fields.rsvp_datum ? formatDate(rsvp.fields.rsvp_datum) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
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
