import { useState, useMemo } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichDienstleisterbuchungen, enrichEinladungenRsvp } from '@/lib/enrich';
import { formatDate, formatCurrency, lookupKey } from '@/lib/formatters';
import { StatCard } from '@/components/StatCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { EventplanungDialog } from '@/components/dialogs/EventplanungDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { LivingAppsService } from '@/services/livingAppsService';
import type { Eventplanung } from '@/types/app';
import {
  IconAlertCircle,
  IconCalendarEvent,
  IconUsers,
  IconBuildingStore,
  IconClipboardList,
  IconMapPin,
  IconClock,
  IconPlus,
  IconChevronRight,
  IconCurrencyEuro,
  IconPencil,
  IconTrash,
  IconChevronDown,
  IconChevronUp,
  IconListCheck,
  IconPackage,
  IconCircleCheck,
  IconCircleX,
  IconCircleDashed,
  IconHelp,
} from '@tabler/icons-react';

// ─── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  in_planung:              { label: 'In Planung',             className: 'bg-blue-100 text-blue-700 border-blue-200' },
  einladungen_versendet:   { label: 'Einladungen versendet',  className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  bestaetigt:              { label: 'Bestätigt',              className: 'bg-green-100 text-green-700 border-green-200' },
  abgeschlossen:           { label: 'Abgeschlossen',          className: 'bg-gray-100 text-gray-600 border-gray-200' },
  abgesagt:                { label: 'Abgesagt',               className: 'bg-red-100 text-red-600 border-red-200' },
};

function StatusBadge({ status }: { status: string | undefined }) {
  if (!status) return null;
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: 'bg-muted text-muted-foreground border-border' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

const RSVP_ICON: Record<string, React.ReactNode> = {
  zugesagt:   <IconCircleCheck size={14} className="text-green-600" />,
  abgesagt:   <IconCircleX size={14} className="text-red-500" />,
  ausstehend: <IconCircleDashed size={14} className="text-yellow-500" />,
  vielleicht: <IconHelp size={14} className="text-blue-400" />,
};

// ─── Main dashboard ────────────────────────────────────────────────────────────

export default function DashboardOverview() {
  const {
    dienstleisterbuchungen,
    gaesteverzeichnis,
    einladungenRsvp,
    eventplanung,
    dienstleisterverzeichnis,
    gaesteverzeichnisMap,
    eventplanungMap,
    dienstleisterverzeichnisMap,
    loading,
    error,
    fetchAll,
  } = useDashboardData();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Eventplanung | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Eventplanung | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Enriched data
  const enrichedBuchungen = useMemo(
    () => enrichDienstleisterbuchungen(dienstleisterbuchungen, { eventplanungMap, dienstleisterverzeichnisMap }),
    [dienstleisterbuchungen, eventplanungMap, dienstleisterverzeichnisMap]
  );

  const enrichedRsvp = useMemo(
    () => enrichEinladungenRsvp(einladungenRsvp, { eventplanungMap, gaesteverzeichnisMap }),
    [einladungenRsvp, eventplanungMap, gaesteverzeichnisMap]
  );

  // KPI stats
  const totalEvents = eventplanung.length;

  const activeEvents = useMemo(
    () => eventplanung.filter(e => {
      const k = lookupKey(e.fields.event_status);
      return k === 'in_planung' || k === 'bestaetigt';
    }).length,
    [eventplanung]
  );

  const totalGuests = gaesteverzeichnis.length;

  const openBookings = useMemo(
    () => dienstleisterbuchungen.filter(b => {
      const k = lookupKey(b.fields.buchung_status);
      return k === 'angefragt' || k === 'angebot_erhalten';
    }).length,
    [dienstleisterbuchungen]
  );

  // Upcoming events — sorted ascending by event_datum, show future + ongoing
  const now = new Date();
  const upcomingEvents = useMemo(() => {
    return [...eventplanung]
      .filter(e => {
        if (!e.fields.event_datum) return true;
        const d = new Date(e.fields.event_datum);
        return d >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
      })
      .sort((a, b) => {
        const da = a.fields.event_datum ? new Date(a.fields.event_datum).getTime() : Infinity;
        const db = b.fields.event_datum ? new Date(b.fields.event_datum).getTime() : Infinity;
        return da - db;
      })
      .slice(0, 10);
  }, [eventplanung]); // eslint-disable-line react-hooks/exhaustive-deps

  // Past events (non-upcoming)
  const pastEvents = useMemo(() => {
    const upcomingIds = new Set(upcomingEvents.map(e => e.record_id));
    return [...eventplanung]
      .filter(e => !upcomingIds.has(e.record_id))
      .sort((a, b) => {
        const da = a.fields.event_datum ? new Date(a.fields.event_datum).getTime() : 0;
        const db = b.fields.event_datum ? new Date(b.fields.event_datum).getTime() : 0;
        return db - da;
      })
      .slice(0, 5);
  }, [eventplanung, upcomingEvents]);

  // Helper: get RSVP stats for an event
  function rsvpStatsForEvent(eventId: string) {
    const invites = enrichedRsvp.filter(r => {
      const eid = r.fields.einladung_event ? r.fields.einladung_event.match(/([a-f0-9]{24})$/i)?.[1] : null;
      return eid === eventId;
    });
    const zugesagt = invites.filter(r => lookupKey(r.fields.rsvp_status) === 'zugesagt').length;
    const abgesagt = invites.filter(r => lookupKey(r.fields.rsvp_status) === 'abgesagt').length;
    const ausstehend = invites.filter(r => lookupKey(r.fields.rsvp_status) === 'ausstehend').length;
    return { total: invites.length, zugesagt, abgesagt, ausstehend };
  }

  // Helper: get booking count for an event
  function bookingsForEvent(eventId: string) {
    return enrichedBuchungen.filter(b => {
      const eid = b.fields.buchung_event ? b.fields.buchung_event.match(/([a-f0-9]{24})$/i)?.[1] : null;
      return eid === eventId;
    }).length;
  }

  // Toggle expand
  function toggleExpand(id: string) {
    setExpandedId(prev => (prev === id ? null : id));
  }

  // CRUD handlers
  async function handleCreate(fields: Eventplanung['fields']) {
    await LivingAppsService.createEventplanungEntry(fields);
    fetchAll();
  }

  async function handleEdit(fields: Eventplanung['fields']) {
    if (!editTarget) return;
    await LivingAppsService.updateEventplanungEntry(editTarget.record_id, fields);
    setEditTarget(null);
    fetchAll();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await LivingAppsService.deleteEventplanungEntry(deleteTarget.record_id);
    setDeleteTarget(null);
    fetchAll();
  }

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Event-Cockpit</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Alle Firmenevents im Blick</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <IconPlus size={16} />
          Neues Event
        </Button>
      </div>

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Events gesamt"
          value={totalEvents}
          description="Alle erfassten Events"
          icon={<IconCalendarEvent size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Aktive Events"
          value={activeEvents}
          description="In Planung oder Bestätigt"
          icon={<IconClipboardList size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Gäste im Verzeichnis"
          value={totalGuests}
          description="Registrierte Kontakte"
          icon={<IconUsers size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Offene Buchungen"
          value={openBookings}
          description="Angefragt oder Angebot erhalten"
          icon={<IconBuildingStore size={18} className="text-muted-foreground" />}
        />
      </div>

      {/* ── Upcoming Events ── */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <IconClock size={18} className="text-primary" />
          Bevorstehende Events
        </h2>

        {upcomingEvents.length === 0 ? (
          <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground text-sm">
            Keine bevorstehenden Events gefunden.
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingEvents.map(event => {
              const status = lookupKey(event.fields.event_status);
              const rsvp = rsvpStatsForEvent(event.record_id);
              const bookingCount = bookingsForEvent(event.record_id);
              const isExpanded = expandedId === event.record_id;
              const guestTarget = event.fields.event_gaestezahl ?? 0;

              return (
                <div
                  key={event.record_id}
                  className="rounded-xl border bg-card overflow-hidden shadow-sm"
                >
                  {/* Card header — always visible */}
                  <button
                    type="button"
                    className="w-full text-left px-4 py-4 flex flex-wrap items-start gap-3"
                    onClick={() => toggleExpand(event.record_id)}
                  >
                    {/* Left: date column */}
                    <div className="min-w-[52px] flex flex-col items-center justify-center rounded-lg bg-primary/10 px-2 py-1.5">
                      {event.fields.event_datum ? (
                        <>
                          <span className="text-xs font-semibold text-primary leading-tight">
                            {new Date(event.fields.event_datum).toLocaleDateString('de-DE', { month: 'short' }).toUpperCase()}
                          </span>
                          <span className="text-2xl font-bold text-primary leading-tight">
                            {new Date(event.fields.event_datum).getDate()}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>

                    {/* Center: main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-semibold text-foreground truncate">
                          {event.fields.event_name ?? '(Kein Name)'}
                        </span>
                        <StatusBadge status={status ?? undefined} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {event.fields.event_datum && (
                          <span className="flex items-center gap-1">
                            <IconClock size={12} />
                            {formatDate(event.fields.event_datum)}
                          </span>
                        )}
                        {event.fields.event_location_name && (
                          <span className="flex items-center gap-1">
                            <IconMapPin size={12} />
                            {event.fields.event_location_name}
                            {event.fields.event_stadt ? `, ${event.fields.event_stadt}` : ''}
                          </span>
                        )}
                      </div>

                      {/* Quick stats row */}
                      <div className="flex flex-wrap items-center gap-3 mt-2">
                        {event.fields.event_budget != null && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground/80">
                            <IconCurrencyEuro size={13} />
                            {formatCurrency(event.fields.event_budget)}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <IconUsers size={13} />
                          {rsvp.zugesagt}/{guestTarget > 0 ? guestTarget : '?'} Gäste
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <IconPackage size={13} />
                          {bookingCount} Buchung{bookingCount !== 1 ? 'en' : ''}
                        </span>
                      </div>
                    </div>

                    {/* Right: actions + expand */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={e => { e.stopPropagation(); setEditTarget(event); }}
                        title="Bearbeiten"
                      >
                        <IconPencil size={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={e => { e.stopPropagation(); setDeleteTarget(event); }}
                        title="Löschen"
                      >
                        <IconTrash size={15} />
                      </Button>
                      <span className="text-muted-foreground">
                        {isExpanded ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
                      </span>
                    </div>
                  </button>

                  {/* Expanded detail panel */}
                  {isExpanded && (
                    <div className="border-t bg-muted/30 px-4 py-4 space-y-4">
                      {/* Description */}
                      {event.fields.event_beschreibung && (
                        <p className="text-sm text-muted-foreground">{event.fields.event_beschreibung}</p>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* RSVP breakdown */}
                        <div>
                          <p className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">RSVP-Übersicht</p>
                          {rsvp.total === 0 ? (
                            <p className="text-xs text-muted-foreground">Noch keine Einladungen versendet.</p>
                          ) : (
                            <div className="space-y-1">
                              {[
                                { key: 'zugesagt', label: 'Zugesagt', count: rsvp.zugesagt },
                                { key: 'abgesagt', label: 'Abgesagt', count: rsvp.abgesagt },
                                { key: 'ausstehend', label: 'Ausstehend', count: rsvp.ausstehend },
                              ].map(row => (
                                <div key={row.key} className="flex items-center gap-2 text-sm">
                                  {RSVP_ICON[row.key]}
                                  <span className="text-muted-foreground flex-1">{row.label}</span>
                                  <span className="font-medium">{row.count}</span>
                                </div>
                              ))}
                              <div className="flex items-center gap-2 text-sm pt-1 border-t mt-1">
                                <span className="text-muted-foreground flex-1">Gesamt eingeladen</span>
                                <span className="font-semibold">{rsvp.total}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Dienstleister bookings for this event */}
                        <div>
                          <p className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Dienstleister</p>
                          {bookingCount === 0 ? (
                            <p className="text-xs text-muted-foreground">Noch keine Dienstleister gebucht.</p>
                          ) : (
                            <div className="space-y-1">
                              {enrichedBuchungen
                                .filter(b => {
                                  const eid = b.fields.buchung_event?.match(/([a-f0-9]{24})$/i)?.[1];
                                  return eid === event.record_id;
                                })
                                .slice(0, 5)
                                .map(b => (
                                  <div key={b.record_id} className="flex items-center gap-2 text-sm">
                                    <span className="text-muted-foreground flex-1 truncate min-w-0">
                                      {b.buchung_dienstleisterName || '—'}
                                    </span>
                                    {b.fields.buchung_preis != null && (
                                      <span className="text-xs text-muted-foreground shrink-0">
                                        {formatCurrency(b.fields.buchung_preis)}
                                      </span>
                                    )}
                                    {b.fields.buchung_status && (
                                      <span className="text-xs bg-muted px-1.5 py-0.5 rounded shrink-0">
                                        {b.fields.buchung_status.label}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              {bookingCount > 5 && (
                                <p className="text-xs text-muted-foreground">+{bookingCount - 5} weitere</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Address if available */}
                      {(event.fields.event_strasse || event.fields.event_plz || event.fields.event_stadt) && (
                        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <IconMapPin size={13} className="mt-0.5 shrink-0" />
                          <span>
                            {[
                              event.fields.event_strasse,
                              event.fields.event_hausnummer,
                              event.fields.event_plz,
                              event.fields.event_stadt,
                            ].filter(Boolean).join(' ')}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Past Events (compact) ── */}
      {pastEvents.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
            <IconCalendarEvent size={18} className="text-muted-foreground" />
            Vergangene Events
          </h2>
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Event</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Datum</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Location</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Status</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Budget</th>
                  </tr>
                </thead>
                <tbody>
                  {pastEvents.map((event, i) => (
                    <tr key={event.record_id} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
                      <td className="px-4 py-2.5 font-medium truncate max-w-[180px]">
                        {event.fields.event_name ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                        {formatDate(event.fields.event_datum)}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[140px]">
                        {event.fields.event_location_name ?? '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={lookupKey(event.fields.event_status) ?? undefined} />
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">
                        {event.fields.event_budget != null ? formatCurrency(event.fields.event_budget) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ── Intent Navigation Cards ── */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-3">Schnellzugriff</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <a
            href="#/intents/gaesteliste-rsvp"
            className="group rounded-xl border bg-card p-5 flex flex-col gap-3 shadow-sm hover:shadow-md hover:border-primary/50 transition-all overflow-hidden"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <IconListCheck size={22} className="text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                Gästeliste &amp; RSVP
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                Einladungen verwalten und RSVP-Status pro Event verfolgen
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs text-primary font-medium">
              Öffnen <IconChevronRight size={14} />
            </div>
          </a>

          <a
            href="#/intents/dienstleister-buchen"
            className="group rounded-xl border bg-card p-5 flex flex-col gap-3 shadow-sm hover:shadow-md hover:border-primary/50 transition-all overflow-hidden"
          >
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <IconBuildingStore size={22} className="text-purple-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                Dienstleister buchen
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                Anbieter durchsuchen und direkt für Events buchen
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs text-primary font-medium">
              Öffnen <IconChevronRight size={14} />
            </div>
          </a>

          <a
            href="#/intents/budget-uebersicht"
            className="group rounded-xl border bg-card p-5 flex flex-col gap-3 shadow-sm hover:shadow-md hover:border-primary/50 transition-all overflow-hidden"
          >
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <IconCurrencyEuro size={22} className="text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                Budget-Übersicht
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                Event-Budget vs. tatsächliche Ausgaben für Dienstleister
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs text-primary font-medium">
              Öffnen <IconChevronRight size={14} />
            </div>
          </a>
        </div>
      </section>

      {/* ── Dialogs ── */}
      <EventplanungDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
        enablePhotoScan={AI_PHOTO_SCAN['Eventplanung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Eventplanung']}
      />

      <EventplanungDialog
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        onSubmit={handleEdit}
        defaultValues={editTarget?.fields}
        enablePhotoScan={AI_PHOTO_SCAN['Eventplanung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Eventplanung']}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Event löschen"
        description={`"${deleteTarget?.fields.event_name ?? 'Dieses Event'}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ─── Skeleton & Error ─────────────────────────────────────────────────────────

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
