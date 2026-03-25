import { useState, useMemo } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichEinladungenRsvp, enrichDienstleisterbuchungen } from '@/lib/enrich';
import type { EnrichedEinladungenRsvp, EnrichedDienstleisterbuchungen } from '@/types/enriched';
import type { Eventplanung } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/StatCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EventplanungDialog } from '@/components/dialogs/EventplanungDialog';
import { EinladungenRsvpDialog } from '@/components/dialogs/EinladungenRsvpDialog';
import { DienstleisterbuchungenDialog } from '@/components/dialogs/DienstleisterbuchungenDialog';
import { AI_PHOTO_SCAN } from '@/config/ai-features';
import {
  IconAlertCircle,
  IconPlus,
  IconCalendarEvent,
  IconUsers,
  IconBriefcase,
  IconCurrencyEuro,
  IconPencil,
  IconTrash,
  IconChevronDown,
  IconChevronUp,
  IconCircleCheck,
  IconClock,
  IconBan,
  IconStar,
  IconMapPin,
  IconMail,
  IconRocket,
  IconChevronRight,
  IconListCheck,
} from '@tabler/icons-react';

// ─── Status helpers ────────────────────────────────────────────────────────────

const EVENT_STATUS_ORDER = [
  'In Planung',
  'Einladungen versendet',
  'Bestätigt',
  'Abgeschlossen',
  'Abgesagt',
];

function eventStatusColor(status: string | undefined): string {
  switch (status) {
    case 'In Planung': return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'Einladungen versendet': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'Bestätigt': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
    case 'Abgeschlossen': return 'bg-green-100 text-green-800 border-green-200';
    case 'Abgesagt': return 'bg-red-100 text-red-800 border-red-200';
    default: return 'bg-muted text-muted-foreground border-border';
  }
}

function eventStatusIcon(status: string | undefined) {
  switch (status) {
    case 'In Planung': return <IconClock size={12} className="shrink-0" />;
    case 'Einladungen versendet': return <IconMail size={12} className="shrink-0" />;
    case 'Bestätigt': return <IconCircleCheck size={12} className="shrink-0" />;
    case 'Abgeschlossen': return <IconStar size={12} className="shrink-0" />;
    case 'Abgesagt': return <IconBan size={12} className="shrink-0" />;
    default: return null;
  }
}

function rsvpBadge(status: string | undefined): string {
  switch (status) {
    case 'Zugesagt': return 'bg-green-100 text-green-800';
    case 'Abgesagt': return 'bg-red-100 text-red-800';
    case 'Vielleicht': return 'bg-amber-100 text-amber-800';
    default: return 'bg-muted text-muted-foreground';
  }
}

function buchungBadge(status: string | undefined): string {
  switch (status) {
    case 'Gebucht':
    case 'Bestätigt': return 'bg-green-100 text-green-800';
    case 'Storniert': return 'bg-red-100 text-red-800';
    case 'Angefragt': return 'bg-amber-100 text-amber-800';
    case 'Angebot erhalten': return 'bg-blue-100 text-blue-800';
    default: return 'bg-muted text-muted-foreground';
  }
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function DashboardOverview() {
  const {
    eventplanung, einladungenRsvp, gaesteverzeichnis, dienstleisterbuchungen, dienstleisterverzeichnis,
    eventplanungMap, gaesteverzeichnisMap, dienstleisterverzeichnisMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const enrichedEinladungenRsvp = enrichEinladungenRsvp(einladungenRsvp, { eventplanungMap, gaesteverzeichnisMap });
  const enrichedDienstleisterbuchungen = enrichDienstleisterbuchungen(dienstleisterbuchungen, { eventplanungMap, dienstleisterverzeichnisMap });

  // Dialog state
  const [eventDialog, setEventDialog] = useState(false);
  const [editEvent, setEditEvent] = useState<Eventplanung | null>(null);
  const [deleteEvent, setDeleteEvent] = useState<Eventplanung | null>(null);

  const [rsvpDialog, setRsvpDialog] = useState(false);
  const [editRsvp, setEditRsvp] = useState<EnrichedEinladungenRsvp | null>(null);
  const [deleteRsvp, setDeleteRsvp] = useState<EnrichedEinladungenRsvp | null>(null);
  const [rsvpForEvent, setRsvpForEvent] = useState<string | null>(null);

  const [buchungDialog, setBuchungDialog] = useState(false);
  const [editBuchung, setEditBuchung] = useState<EnrichedDienstleisterbuchungen | null>(null);
  const [deleteBuchung, setDeleteBuchung] = useState<EnrichedDienstleisterbuchungen | null>(null);
  const [buchungForEvent, setBuchungForEvent] = useState<string | null>(null);

  // Active event for detail panel
  const [activeEventId, setActiveEventId] = useState<string | null>(null);

  // Status filter
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Computed values
  const sortedEvents = useMemo(() => {
    return [...eventplanung].sort((a, b) => {
      const dateA = a.fields.event_datum ? new Date(a.fields.event_datum).getTime() : 0;
      const dateB = b.fields.event_datum ? new Date(b.fields.event_datum).getTime() : 0;
      return dateA - dateB;
    });
  }, [eventplanung]);

  const filteredEvents = useMemo(() => {
    if (!statusFilter) return sortedEvents;
    return sortedEvents.filter(e => e.fields.event_status?.key === statusFilter || e.fields.event_status?.label === statusFilter);
  }, [sortedEvents, statusFilter]);

  const activeEvent = useMemo(() => {
    return eventplanung.find(e => e.record_id === activeEventId) ?? null;
  }, [eventplanung, activeEventId]);

  const eventRsvps = useMemo(() => {
    if (!activeEventId) return [];
    return enrichedEinladungenRsvp.filter(r => {
      const eid = extractRecordId(r.fields.einladung_event);
      return eid === activeEventId;
    });
  }, [enrichedEinladungenRsvp, activeEventId]);

  const eventBuchungen = useMemo(() => {
    if (!activeEventId) return [];
    return enrichedDienstleisterbuchungen.filter(b => {
      const eid = extractRecordId(b.fields.buchung_event);
      return eid === activeEventId;
    });
  }, [enrichedDienstleisterbuchungen, activeEventId]);

  // Stats
  const stats = useMemo(() => {
    const upcoming = eventplanung.filter(e => {
      const status = e.fields.event_status?.key ?? e.fields.event_status?.label;
      return status !== 'Abgeschlossen' && status !== 'Abgesagt';
    }).length;
    const zugesagt = einladungenRsvp.filter(r => r.fields.rsvp_status?.label === 'Zugesagt').length;
    const gebuchtBuchungen = dienstleisterbuchungen.filter(b => {
      const s = b.fields.buchung_status?.label;
      return s === 'Gebucht' || s === 'Bestätigt';
    });
    const totalBudget = eventplanung.reduce((sum, e) => sum + (e.fields.event_budget ?? 0), 0);
    const totalBuchungKosten = gebuchtBuchungen.reduce((sum, b) => sum + (b.fields.buchung_preis ?? 0), 0);
    return { upcoming, zugesagt, gesamtGaeste: gaesteverzeichnis.length, totalBudget, totalBuchungKosten };
  }, [eventplanung, einladungenRsvp, dienstleisterbuchungen, gaesteverzeichnis]);

  // Status pipeline counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of EVENT_STATUS_ORDER) counts[s] = 0;
    for (const e of eventplanung) {
      const s = e.fields.event_status?.label ?? e.fields.event_status?.key;
      if (s && s in counts) counts[s]++;
    }
    return counts;
  }, [eventplanung]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  return (
    <div className="space-y-6 pb-8">
      {/* ── Workflows ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <IconRocket size={18} className="text-primary shrink-0" />
          <h2 className="text-base font-semibold text-foreground">Workflows</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a href="#/intents/event-vorbereiten" className="block bg-card border border-border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow overflow-hidden border-l-4 border-l-primary">
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <IconCalendarEvent size={18} className="text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm text-foreground truncate">Event vorbereiten</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">Gäste einladen & Dienstleister buchen</p>
              </div>
              <IconChevronRight size={16} className="shrink-0 text-muted-foreground" />
            </div>
          </a>
          <a href="#/intents/event-abschliessen" className="block bg-card border border-border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow overflow-hidden border-l-4 border-l-primary">
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <IconListCheck size={18} className="text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm text-foreground truncate">Event abschliessen</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">RSVPs finalisieren & Zahlungen abrechnen</p>
              </div>
              <IconChevronRight size={16} className="shrink-0 text-muted-foreground" />
            </div>
          </a>
        </div>
      </div>

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Events</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{eventplanung.length} Events · {gaesteverzeichnis.length} Gäste</p>
        </div>
        <Button onClick={() => { setEditEvent(null); setEventDialog(true); }} className="shrink-0">
          <IconPlus size={16} className="shrink-0 mr-1.5" />
          Neues Event
        </Button>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Aktive Events"
          value={String(stats.upcoming)}
          description="Nicht abgeschlossen"
          icon={<IconCalendarEvent size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Zusagen"
          value={String(stats.zugesagt)}
          description={`von ${einladungenRsvp.length} Einladungen`}
          icon={<IconCircleCheck size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Gästeverzeichnis"
          value={String(stats.gesamtGaeste)}
          description="Gesamt"
          icon={<IconUsers size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Gesamtbudget"
          value={formatCurrency(stats.totalBudget)}
          description={`${formatCurrency(stats.totalBuchungKosten)} gebuchte DL`}
          icon={<IconCurrencyEuro size={18} className="text-muted-foreground" />}
        />
      </div>

      {/* ── Status Pipeline ── */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter(null)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            statusFilter === null
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-muted-foreground border-border hover:border-primary/50'
          }`}
        >
          Alle ({eventplanung.length})
        </button>
        {EVENT_STATUS_ORDER.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? null : s)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === s
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:border-primary/50'
            }`}
          >
            {s} ({statusCounts[s]})
          </button>
        ))}
      </div>

      {/* ── Main Layout: Event List + Detail Panel ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Event List */}
        <div className="lg:col-span-2 space-y-2 overflow-hidden">
          {filteredEvents.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-2xl border border-dashed border-border bg-muted/30">
              <IconCalendarEvent size={40} stroke={1.5} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Noch keine Events</p>
              <Button size="sm" variant="outline" onClick={() => { setEditEvent(null); setEventDialog(true); }}>
                <IconPlus size={14} className="mr-1.5 shrink-0" /> Event erstellen
              </Button>
            </div>
          )}
          {filteredEvents.map(event => {
            const isActive = activeEventId === event.record_id;
            const status = event.fields.event_status?.label ?? event.fields.event_status?.key;
            const rsvpCount = enrichedEinladungenRsvp.filter(r => extractRecordId(r.fields.einladung_event) === event.record_id).length;
            const zugesagtCount = enrichedEinladungenRsvp.filter(r =>
              extractRecordId(r.fields.einladung_event) === event.record_id &&
              r.fields.rsvp_status?.label === 'Zugesagt'
            ).length;

            return (
              <div
                key={event.record_id}
                onClick={() => setActiveEventId(isActive ? null : event.record_id)}
                className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                  isActive
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border bg-card hover:border-primary/40 hover:shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-foreground truncate">{event.fields.event_name ?? '(kein Name)'}</p>
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground flex-wrap">
                      {event.fields.event_datum && (
                        <span className="flex items-center gap-0.5">
                          <IconCalendarEvent size={11} className="shrink-0" />
                          {formatDate(event.fields.event_datum)}
                        </span>
                      )}
                      {event.fields.event_location_name && (
                        <span className="flex items-center gap-0.5">
                          <IconMapPin size={11} className="shrink-0" />
                          <span className="truncate max-w-[120px]">{event.fields.event_location_name}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${eventStatusColor(status)}`}>
                      {eventStatusIcon(status)}
                      {status ?? '—'}
                    </span>
                    {rsvpCount > 0 && (
                      <span className="text-[11px] text-muted-foreground">{zugesagtCount}/{rsvpCount} Zusagen</span>
                    )}
                  </div>
                </div>

                {/* Inline actions */}
                <div className="flex items-center gap-2 mt-3 border-t border-border pt-2.5">
                  <button
                    onClick={e => { e.stopPropagation(); setEditEvent(event); setEventDialog(true); }}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <IconPencil size={13} className="shrink-0" /> Bearbeiten
                  </button>
                  <span className="text-border">·</span>
                  <button
                    onClick={e => { e.stopPropagation(); setRsvpForEvent(event.record_id); setEditRsvp(null); setRsvpDialog(true); }}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <IconPlus size={13} className="shrink-0" /> Einladung
                  </button>
                  <span className="text-border">·</span>
                  <button
                    onClick={e => { e.stopPropagation(); setBuchungForEvent(event.record_id); setEditBuchung(null); setBuchungDialog(true); }}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <IconPlus size={13} className="shrink-0" /> Buchung
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteEvent(event); }}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <IconTrash size={13} className="shrink-0" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail Panel */}
        <div className="lg:col-span-3">
          {!activeEvent ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[260px] rounded-2xl border border-dashed border-border bg-muted/20 gap-3">
              <IconCalendarEvent size={40} stroke={1.5} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Event auswählen für Details</p>
            </div>
          ) : (
            <EventDetailPanel
              event={activeEvent}
              rsvps={eventRsvps}
              buchungen={eventBuchungen}
              onEditEvent={() => { setEditEvent(activeEvent); setEventDialog(true); }}
              onAddRsvp={() => { setRsvpForEvent(activeEvent.record_id); setEditRsvp(null); setRsvpDialog(true); }}
              onEditRsvp={r => { setEditRsvp(r); setRsvpForEvent(null); setRsvpDialog(true); }}
              onDeleteRsvp={r => setDeleteRsvp(r)}
              onAddBuchung={() => { setBuchungForEvent(activeEvent.record_id); setEditBuchung(null); setBuchungDialog(true); }}
              onEditBuchung={b => { setEditBuchung(b); setBuchungForEvent(null); setBuchungDialog(true); }}
              onDeleteBuchung={b => setDeleteBuchung(b)}
            />
          )}
        </div>
      </div>

      {/* ── Dialogs ── */}
      <EventplanungDialog
        open={eventDialog}
        onClose={() => { setEventDialog(false); setEditEvent(null); }}
        onSubmit={async fields => {
          if (editEvent) {
            await LivingAppsService.updateEventplanungEntry(editEvent.record_id, fields);
          } else {
            await LivingAppsService.createEventplanungEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editEvent?.fields}
        enablePhotoScan={AI_PHOTO_SCAN['Eventplanung']}
      />

      <EinladungenRsvpDialog
        open={rsvpDialog}
        onClose={() => { setRsvpDialog(false); setEditRsvp(null); setRsvpForEvent(null); }}
        onSubmit={async fields => {
          if (editRsvp) {
            await LivingAppsService.updateEinladungenRsvpEntry(editRsvp.record_id, fields);
          } else {
            await LivingAppsService.createEinladungenRsvpEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editRsvp
          ? editRsvp.fields
          : rsvpForEvent
            ? { einladung_event: createRecordUrl(APP_IDS.EVENTPLANUNG, rsvpForEvent) }
            : undefined
        }
        eventplanungList={eventplanung}
        gaesteverzeichnisList={gaesteverzeichnis}
        enablePhotoScan={AI_PHOTO_SCAN['EinladungenRsvp']}
      />

      <DienstleisterbuchungenDialog
        open={buchungDialog}
        onClose={() => { setBuchungDialog(false); setEditBuchung(null); setBuchungForEvent(null); }}
        onSubmit={async fields => {
          if (editBuchung) {
            await LivingAppsService.updateDienstleisterbuchungenEntry(editBuchung.record_id, fields);
          } else {
            await LivingAppsService.createDienstleisterbuchungenEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editBuchung
          ? editBuchung.fields
          : buchungForEvent
            ? { buchung_event: createRecordUrl(APP_IDS.EVENTPLANUNG, buchungForEvent) }
            : undefined
        }
        eventplanungList={eventplanung}
        dienstleisterverzeichnisList={dienstleisterverzeichnis}
        enablePhotoScan={AI_PHOTO_SCAN['Dienstleisterbuchungen']}
      />

      <ConfirmDialog
        open={!!deleteEvent}
        title="Event löschen"
        description={`„${deleteEvent?.fields.event_name}" wirklich löschen? Alle zugehörigen Daten bleiben bestehen.`}
        onConfirm={async () => {
          if (!deleteEvent) return;
          await LivingAppsService.deleteEventplanungEntry(deleteEvent.record_id);
          if (activeEventId === deleteEvent.record_id) setActiveEventId(null);
          setDeleteEvent(null);
          fetchAll();
        }}
        onClose={() => setDeleteEvent(null)}
      />

      <ConfirmDialog
        open={!!deleteRsvp}
        title="Einladung löschen"
        description="Diese Einladung wirklich löschen?"
        onConfirm={async () => {
          if (!deleteRsvp) return;
          await LivingAppsService.deleteEinladungenRsvpEntry(deleteRsvp.record_id);
          setDeleteRsvp(null);
          fetchAll();
        }}
        onClose={() => setDeleteRsvp(null)}
      />

      <ConfirmDialog
        open={!!deleteBuchung}
        title="Buchung löschen"
        description="Diese Dienstleisterbuchung wirklich löschen?"
        onConfirm={async () => {
          if (!deleteBuchung) return;
          await LivingAppsService.deleteDienstleisterbuchungenEntry(deleteBuchung.record_id);
          setDeleteBuchung(null);
          fetchAll();
        }}
        onClose={() => setDeleteBuchung(null)}
      />
    </div>
  );
}

// ─── Event Detail Panel ────────────────────────────────────────────────────────

interface EventDetailPanelProps {
  event: Eventplanung;
  rsvps: EnrichedEinladungenRsvp[];
  buchungen: EnrichedDienstleisterbuchungen[];
  onEditEvent: () => void;
  onAddRsvp: () => void;
  onEditRsvp: (r: EnrichedEinladungenRsvp) => void;
  onDeleteRsvp: (r: EnrichedEinladungenRsvp) => void;
  onAddBuchung: () => void;
  onEditBuchung: (b: EnrichedDienstleisterbuchungen) => void;
  onDeleteBuchung: (b: EnrichedDienstleisterbuchungen) => void;
}

function EventDetailPanel({
  event,
  rsvps,
  buchungen,
  onEditEvent,
  onAddRsvp,
  onEditRsvp,
  onDeleteRsvp,
  onAddBuchung,
  onEditBuchung,
  onDeleteBuchung,
}: EventDetailPanelProps) {
  const [tab, setTab] = useState<'rsvp' | 'buchungen'>('rsvp');
  const [rsvpExpanded, setRsvpExpanded] = useState(true);

  const status = event.fields.event_status?.label ?? event.fields.event_status?.key;

  const rsvpStats = useMemo(() => {
    const counts: Record<string, number> = { Zugesagt: 0, Abgesagt: 0, Vielleicht: 0, Ausstehend: 0 };
    for (const r of rsvps) {
      const s = r.fields.rsvp_status?.label ?? 'Ausstehend';
      if (s in counts) counts[s]++;
    }
    return counts;
  }, [rsvps]);

  const buchungTotal = useMemo(() => {
    return buchungen.reduce((sum, b) => sum + (b.fields.buchung_preis ?? 0), 0);
  }, [buchungen]);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
      {/* Event Header */}
      <div className="p-5 border-b border-border bg-gradient-to-br from-primary/5 to-transparent">
        <div className="flex items-start justify-between gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground truncate">{event.fields.event_name ?? '(kein Name)'}</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-sm text-muted-foreground">
              {event.fields.event_datum && (
                <span className="flex items-center gap-1">
                  <IconCalendarEvent size={14} className="shrink-0" />
                  {formatDate(event.fields.event_datum)}
                </span>
              )}
              {event.fields.event_location_name && (
                <span className="flex items-center gap-1">
                  <IconMapPin size={14} className="shrink-0" />
                  <span className="truncate max-w-[180px]">{event.fields.event_location_name}</span>
                </span>
              )}
              {event.fields.event_gaestezahl != null && (
                <span className="flex items-center gap-1">
                  <IconUsers size={14} className="shrink-0" />
                  {event.fields.event_gaestezahl} geplant
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${eventStatusColor(status)}`}>
              {eventStatusIcon(status)} {status ?? '—'}
            </span>
            <button onClick={onEditEvent} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <IconPencil size={15} className="text-muted-foreground shrink-0" />
            </button>
          </div>
        </div>

        {/* Budget bar */}
        {event.fields.event_budget != null && (
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">Budget</span>
                <span className="font-medium text-foreground">
                  {formatCurrency(buchungTotal)} / {formatCurrency(event.fields.event_budget)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${Math.min(100, event.fields.event_budget > 0 ? (buchungTotal / event.fields.event_budget) * 100 : 0)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {event.fields.event_beschreibung && (
          <p className="mt-3 text-xs text-muted-foreground line-clamp-2">{event.fields.event_beschreibung}</p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setTab('rsvp')}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            tab === 'rsvp' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Einladungen ({rsvps.length})
        </button>
        <button
          onClick={() => setTab('buchungen')}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            tab === 'buchungen' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Dienstleister ({buchungen.length})
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto max-h-[420px]">
        {tab === 'rsvp' && (
          <div className="p-4 space-y-3">
            {/* RSVP Summary */}
            {rsvps.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {Object.entries(rsvpStats).filter(([, v]) => v > 0).map(([s, count]) => (
                  <span key={s} className={`px-2.5 py-1 rounded-full text-xs font-medium ${rsvpBadge(s)}`}>
                    {s}: {count}
                  </span>
                ))}
                <button
                  onClick={() => setRsvpExpanded(x => !x)}
                  className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {rsvpExpanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                </button>
              </div>
            )}

            <Button size="sm" variant="outline" onClick={onAddRsvp} className="w-full">
              <IconPlus size={14} className="mr-1.5 shrink-0" /> Einladung hinzufügen
            </Button>

            {rsvpExpanded && rsvps.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">Noch keine Einladungen</p>
            )}

            {rsvpExpanded && rsvps.map(r => {
              const gastName = r.einladung_gastName ?? '(unbekannt)';
              const status = r.fields.rsvp_status?.label;
              return (
                <div key={r.record_id} className="flex items-center justify-between gap-2 p-3 rounded-xl border border-border bg-background">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{gastName}</p>
                    {r.fields.einladung_datum && (
                      <p className="text-xs text-muted-foreground">{formatDate(r.fields.einladung_datum)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${rsvpBadge(status)}`}>
                      {status ?? 'Ausstehend'}
                    </span>
                    <button onClick={() => onEditRsvp(r)} className="text-muted-foreground hover:text-foreground transition-colors">
                      <IconPencil size={13} className="shrink-0" />
                    </button>
                    <button onClick={() => onDeleteRsvp(r)} className="text-muted-foreground hover:text-destructive transition-colors">
                      <IconTrash size={13} className="shrink-0" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'buchungen' && (
          <div className="p-4 space-y-3">
            <Button size="sm" variant="outline" onClick={onAddBuchung} className="w-full">
              <IconPlus size={14} className="mr-1.5 shrink-0" /> Dienstleister buchen
            </Button>

            {buchungen.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">Noch keine Buchungen</p>
            )}

            {buchungen.map(b => {
              const dlName = b.buchung_dienstleisterName ?? '(unbekannt)';
              const bStatus = b.fields.buchung_status?.label;
              return (
                <div key={b.record_id} className="p-3 rounded-xl border border-border bg-background">
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{dlName}</p>
                      {b.fields.buchung_leistung && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{b.fields.buchung_leistung}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${buchungBadge(bStatus)}`}>
                        {bStatus ?? '—'}
                      </span>
                      <button onClick={() => onEditBuchung(b)} className="text-muted-foreground hover:text-foreground transition-colors">
                        <IconPencil size={13} className="shrink-0" />
                      </button>
                      <button onClick={() => onDeleteBuchung(b)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <IconTrash size={13} className="shrink-0" />
                      </button>
                    </div>
                  </div>
                  {b.fields.buchung_preis != null && (
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Preis</span>
                      <span className="text-sm font-semibold text-foreground">{formatCurrency(b.fields.buchung_preis)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer totals */}
      {tab === 'buchungen' && buchungen.length > 0 && (
        <div className="px-4 py-3 border-t border-border bg-muted/30 flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <IconBriefcase size={13} className="shrink-0" /> {buchungen.length} Buchungen
          </span>
          <span className="text-sm font-bold text-foreground">{formatCurrency(buchungTotal)}</span>
        </div>
      )}
    </div>
  );
}

// ─── Skeleton / Error ─────────────────────────────────────────────────────────

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
      <div className="flex gap-2">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-7 w-24 rounded-full" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <div className="lg:col-span-3">
          <Skeleton className="h-[400px] rounded-2xl" />
        </div>
      </div>
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
