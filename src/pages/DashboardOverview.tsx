import { useState, useMemo } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichDienstleisterbuchungen, enrichEinladungenRsvp } from '@/lib/enrich';
import type { EnrichedDienstleisterbuchungen, EnrichedEinladungenRsvp } from '@/types/enriched';
import type { Eventplanung } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/StatCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EventplanungDialog } from '@/components/dialogs/EventplanungDialog';
import { DienstleisterbuchungenDialog } from '@/components/dialogs/DienstleisterbuchungenDialog';
import { EinladungenRsvpDialog } from '@/components/dialogs/EinladungenRsvpDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import {
  IconAlertCircle,
  IconCalendarEvent,
  IconPlus,
  IconPencil,
  IconTrash,
  IconUsers,
  IconBuildingStore,
  IconMapPin,
  IconCurrencyEuro,
  IconCheck,
  IconChevronRight,
  IconCalendar,
  IconRocket,
  IconClipboardCheck,
} from '@tabler/icons-react';

// ── Status helpers ──────────────────────────────────────────────────────────

const EVENT_STATUS_COLORS: Record<string, string> = {
  in_planung: 'bg-blue-100 text-blue-700',
  einladungen_versendet: 'bg-purple-100 text-purple-700',
  bestaetigt: 'bg-green-100 text-green-700',
  abgeschlossen: 'bg-gray-100 text-gray-600',
  abgesagt: 'bg-red-100 text-red-700',
};

const BUCHUNG_STATUS_COLORS: Record<string, string> = {
  angefragt: 'bg-yellow-100 text-yellow-700',
  angebot_erhalten: 'bg-blue-100 text-blue-700',
  gebucht: 'bg-purple-100 text-purple-700',
  bestaetigt: 'bg-green-100 text-green-700',
  storniert: 'bg-red-100 text-red-600',
};

const RSVP_COLORS: Record<string, string> = {
  ausstehend: 'bg-yellow-100 text-yellow-700',
  zugesagt: 'bg-green-100 text-green-700',
  abgesagt: 'bg-red-100 text-red-700',
  vielleicht: 'bg-blue-100 text-blue-700',
};

function statusBadge(key: string | undefined, label: string | undefined, map: Record<string, string>) {
  const cls = key ? (map[key] ?? 'bg-gray-100 text-gray-600') : 'bg-gray-100 text-gray-600';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label ?? '—'}</span>;
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function DashboardOverview() {
  const {
    dienstleisterbuchungen, eventplanung, dienstleisterverzeichnis, einladungenRsvp, gaesteverzeichnis,
    eventplanungMap, dienstleisterverzeichnisMap, gaesteverzeichnisMap,
    loading, error, fetchAll,
  } = useDashboardData();

  // All hooks before any early return
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Event dialog state
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<Eventplanung | null>(null);
  const [deleteEventTarget, setDeleteEventTarget] = useState<Eventplanung | null>(null);

  // Booking dialog state
  const [buchungDialogOpen, setBuchungDialogOpen] = useState(false);
  const [editBuchung, setEditBuchung] = useState<EnrichedDienstleisterbuchungen | null>(null);
  const [deleteBuchungTarget, setDeleteBuchungTarget] = useState<EnrichedDienstleisterbuchungen | null>(null);

  // RSVP dialog state
  const [rsvpDialogOpen, setRsvpDialogOpen] = useState(false);
  const [editRsvp, setEditRsvp] = useState<EnrichedEinladungenRsvp | null>(null);
  const [deleteRsvpTarget, setDeleteRsvpTarget] = useState<EnrichedEinladungenRsvp | null>(null);

  const enrichedBuchungen = useMemo(
    () => enrichDienstleisterbuchungen(dienstleisterbuchungen, { eventplanungMap, dienstleisterverzeichnisMap }),
    [dienstleisterbuchungen, eventplanungMap, dienstleisterverzeichnisMap]
  );

  const enrichedRsvp = useMemo(
    () => enrichEinladungenRsvp(einladungenRsvp, { eventplanungMap, gaesteverzeichnisMap }),
    [einladungenRsvp, eventplanungMap, gaesteverzeichnisMap]
  );

  // Sort events: upcoming first, then by date
  const sortedEvents = useMemo(() => {
    return [...eventplanung].sort((a, b) => {
      const da = a.fields.event_datum ?? '';
      const db = b.fields.event_datum ?? '';
      return da.localeCompare(db);
    });
  }, [eventplanung]);

  const selectedEvent = useMemo(
    () => selectedEventId ? eventplanungMap.get(selectedEventId) ?? null : null,
    [selectedEventId, eventplanungMap]
  );

  // Auto-select first event
  const effectiveSelected = selectedEvent ?? (sortedEvents.length > 0 ? sortedEvents[0] : null);
  const effectiveSelectedId = effectiveSelected?.record_id ?? null;

  const eventBuchungen = useMemo(
    () => enrichedBuchungen.filter(b => extractRecordId(b.fields.buchung_event) === effectiveSelectedId),
    [enrichedBuchungen, effectiveSelectedId]
  );

  const eventRsvp = useMemo(
    () => enrichedRsvp.filter(r => extractRecordId(r.fields.einladung_event) === effectiveSelectedId),
    [enrichedRsvp, effectiveSelectedId]
  );

  // KPI stats
  const totalEvents = eventplanung.length;
  const totalGuests = gaesteverzeichnis.length;
  const totalBuchungen = dienstleisterbuchungen.length;
  const totalBestaetigte = eventplanung.filter(e => e.fields.event_status?.key === 'bestaetigt').length;

  const rsvpZugesagt = eventRsvp.filter(r => r.fields.rsvp_status?.key === 'zugesagt').length;
  const rsvpAbgesagt = eventRsvp.filter(r => r.fields.rsvp_status?.key === 'abgesagt').length;
  const rsvpAusstehend = eventRsvp.filter(r => r.fields.rsvp_status?.key === 'ausstehend').length;

  const totalBuchungKosten = eventBuchungen.reduce((s, b) => s + (b.fields.buchung_preis ?? 0), 0);
  const budget = effectiveSelected?.fields.event_budget ?? 0;

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  return (
    <div className="space-y-6">
      {/* ── Workflows ───────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <IconRocket size={18} className="text-primary" />
          <h2 className="font-semibold text-sm text-foreground">Workflows</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a href="#/intents/event-vorbereiten" className="bg-card border border-border border-l-4 border-l-primary rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow flex items-center gap-3 min-w-0">
            <IconCalendarEvent size={20} className="text-primary shrink-0" stroke={1.5} />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">Event vorbereiten</p>
              <p className="text-xs text-muted-foreground truncate">Gäste einladen &amp; Dienstleister buchen</p>
            </div>
            <IconChevronRight size={16} className="text-muted-foreground shrink-0" />
          </a>
          <a href="#/intents/event-abschliessen" className="bg-card border border-border border-l-4 border-l-primary rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow flex items-center gap-3 min-w-0">
            <IconClipboardCheck size={20} className="text-primary shrink-0" stroke={1.5} />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">Event abschliessen</p>
              <p className="text-xs text-muted-foreground truncate">RSVPs prüfen, Zahlungen bestätigen &amp; abschliessen</p>
            </div>
            <IconChevronRight size={16} className="text-muted-foreground shrink-0" />
          </a>
        </div>
      </div>

      {/* ── KPI Row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Events"
          value={String(totalEvents)}
          description="Gesamt angelegt"
          icon={<IconCalendarEvent size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Bestätigt"
          value={String(totalBestaetigte)}
          description="Events bestätigt"
          icon={<IconCheck size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Gäste"
          value={String(totalGuests)}
          description="Im Verzeichnis"
          icon={<IconUsers size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Buchungen"
          value={String(totalBuchungen)}
          description="Dienstleister gebucht"
          icon={<IconBuildingStore size={18} className="text-muted-foreground" />}
        />
      </div>

      {/* ── Main Workspace ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 items-start">

        {/* ── Event List ──────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="font-semibold text-sm text-foreground">Events</h2>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              onClick={() => { setEditEvent(null); setEventDialogOpen(true); }}
            >
              <IconPlus size={14} className="shrink-0" />
              Neu
            </Button>
          </div>

          {sortedEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 gap-2">
              <IconCalendarEvent size={36} className="text-muted-foreground" stroke={1.5} />
              <p className="text-sm text-muted-foreground text-center">Noch keine Events angelegt</p>
              <Button size="sm" variant="outline" onClick={() => { setEditEvent(null); setEventDialogOpen(true); }}>
                <IconPlus size={14} className="shrink-0 mr-1" />
                Event erstellen
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border max-h-[520px] overflow-y-auto">
              {sortedEvents.map(event => {
                const isActive = event.record_id === effectiveSelectedId;
                const statusKey = event.fields.event_status?.key;
                const statusLabel = event.fields.event_status?.label;
                return (
                  <button
                    key={event.record_id}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${isActive ? 'bg-accent' : 'hover:bg-accent/50'}`}
                    onClick={() => setSelectedEventId(event.record_id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="font-medium text-sm truncate">{event.fields.event_name ?? '—'}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {event.fields.event_datum && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <IconCalendar size={12} className="shrink-0" />
                            {formatDate(event.fields.event_datum)}
                          </span>
                        )}
                        {event.fields.event_stadt && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <IconMapPin size={12} className="shrink-0" />
                            {event.fields.event_stadt}
                          </span>
                        )}
                      </div>
                      {statusKey && (
                        <div className="mt-1.5">
                          {statusBadge(statusKey, statusLabel, EVENT_STATUS_COLORS)}
                        </div>
                      )}
                    </div>
                    <IconChevronRight size={16} className={`shrink-0 mt-0.5 transition-colors ${isActive ? 'text-foreground' : 'text-muted-foreground'}`} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Event Detail Panel ──────────────────────────────── */}
        {effectiveSelected ? (
          <div className="space-y-4 min-w-0">
            {/* Event header */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-5 py-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold text-lg truncate">{effectiveSelected.fields.event_name ?? '—'}</h2>
                    {effectiveSelected.fields.event_status && statusBadge(
                      effectiveSelected.fields.event_status.key,
                      effectiveSelected.fields.event_status.label,
                      EVENT_STATUS_COLORS
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                    {effectiveSelected.fields.event_datum && (
                      <span className="flex items-center gap-1">
                        <IconCalendar size={14} className="shrink-0" />
                        {formatDate(effectiveSelected.fields.event_datum)}
                      </span>
                    )}
                    {(effectiveSelected.fields.event_location_name || effectiveSelected.fields.event_stadt) && (
                      <span className="flex items-center gap-1">
                        <IconMapPin size={14} className="shrink-0" />
                        {[effectiveSelected.fields.event_location_name, effectiveSelected.fields.event_stadt].filter(Boolean).join(', ')}
                      </span>
                    )}
                    {effectiveSelected.fields.event_gaestezahl != null && (
                      <span className="flex items-center gap-1">
                        <IconUsers size={14} className="shrink-0" />
                        {effectiveSelected.fields.event_gaestezahl} Gäste geplant
                      </span>
                    )}
                    {effectiveSelected.fields.event_budget != null && (
                      <span className="flex items-center gap-1">
                        <IconCurrencyEuro size={14} className="shrink-0" />
                        Budget: {formatCurrency(effectiveSelected.fields.event_budget)}
                      </span>
                    )}
                  </div>
                  {effectiveSelected.fields.event_beschreibung && (
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{effectiveSelected.fields.event_beschreibung}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => { setEditEvent(effectiveSelected); setEventDialogOpen(true); }}
                  >
                    <IconPencil size={15} />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    onClick={() => setDeleteEventTarget(effectiveSelected)}
                  >
                    <IconTrash size={15} />
                  </Button>
                </div>
              </div>

              {/* Budget bar */}
              {budget > 0 && totalBuchungKosten > 0 && (
                <div className="px-5 pb-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>Budgetverbrauch</span>
                    <span>{formatCurrency(totalBuchungKosten)} / {formatCurrency(budget)}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${totalBuchungKosten > budget ? 'bg-destructive' : 'bg-primary'}`}
                      style={{ width: `${Math.min(100, (totalBuchungKosten / budget) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* RSVP Panel */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm">Einladungen & RSVP</h3>
                  <span className="text-xs text-muted-foreground">({eventRsvp.length})</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                      {rsvpZugesagt} Zugesagt
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                      {rsvpAbgesagt} Abgesagt
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />
                      {rsvpAusstehend} Ausstehend
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={() => { setEditRsvp(null); setRsvpDialogOpen(true); }}
                  >
                    <IconPlus size={14} className="shrink-0" />
                    Einladen
                  </Button>
                </div>
              </div>

              {eventRsvp.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <IconUsers size={32} className="text-muted-foreground" stroke={1.5} />
                  <p className="text-sm text-muted-foreground">Noch keine Einladungen für dieses Event</p>
                </div>
              ) : (
                <div className="divide-y divide-border max-h-56 overflow-y-auto">
                  {eventRsvp.map(rsvp => {
                    const statusKey = rsvp.fields.rsvp_status?.key;
                    const statusLabel = rsvp.fields.rsvp_status?.label;
                    return (
                      <div key={rsvp.record_id} className="flex items-center gap-3 px-5 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{rsvp.einladung_gastName || '—'}</p>
                          {rsvp.fields.rsvp_datum && (
                            <p className="text-xs text-muted-foreground">Rückmeldung: {formatDate(rsvp.fields.rsvp_datum)}</p>
                          )}
                        </div>
                        {statusBadge(statusKey, statusLabel, RSVP_COLORS)}
                        <div className="flex gap-1 shrink-0">
                          <button
                            className="p-1 rounded hover:bg-accent transition-colors"
                            onClick={() => { setEditRsvp(rsvp); setRsvpDialogOpen(true); }}
                          >
                            <IconPencil size={14} className="text-muted-foreground" />
                          </button>
                          <button
                            className="p-1 rounded hover:bg-accent transition-colors"
                            onClick={() => setDeleteRsvpTarget(rsvp)}
                          >
                            <IconTrash size={14} className="text-destructive/70" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Service Bookings Panel */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm">Dienstleisterbuchungen</h3>
                  <span className="text-xs text-muted-foreground">({eventBuchungen.length})</span>
                </div>
                <div className="flex items-center gap-3">
                  {totalBuchungKosten > 0 && (
                    <span className="hidden sm:block text-xs text-muted-foreground">{formatCurrency(totalBuchungKosten)} gesamt</span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={() => { setEditBuchung(null); setBuchungDialogOpen(true); }}
                  >
                    <IconPlus size={14} className="shrink-0" />
                    Buchen
                  </Button>
                </div>
              </div>

              {eventBuchungen.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <IconBuildingStore size={32} className="text-muted-foreground" stroke={1.5} />
                  <p className="text-sm text-muted-foreground">Noch keine Buchungen für dieses Event</p>
                </div>
              ) : (
                <div className="divide-y divide-border max-h-56 overflow-y-auto">
                  {eventBuchungen.map(buchung => {
                    const statusKey = buchung.fields.buchung_status?.key;
                    const statusLabel = buchung.fields.buchung_status?.label;
                    return (
                      <div key={buchung.record_id} className="flex items-center gap-3 px-5 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{buchung.buchung_dienstleisterName || buchung.fields.buchung_leistung || '—'}</p>
                          {buchung.fields.buchung_leistung && buchung.buchung_dienstleisterName && (
                            <p className="text-xs text-muted-foreground truncate">{buchung.fields.buchung_leistung}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {buchung.fields.buchung_preis != null && (
                            <span className="text-sm font-medium tabular-nums">{formatCurrency(buchung.fields.buchung_preis)}</span>
                          )}
                          {statusBadge(statusKey, statusLabel, BUCHUNG_STATUS_COLORS)}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            className="p-1 rounded hover:bg-accent transition-colors"
                            onClick={() => { setEditBuchung(buchung); setBuchungDialogOpen(true); }}
                          >
                            <IconPencil size={14} className="text-muted-foreground" />
                          </button>
                          <button
                            className="p-1 rounded hover:bg-accent transition-colors"
                            onClick={() => setDeleteBuchungTarget(buchung)}
                          >
                            <IconTrash size={14} className="text-destructive/70" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl flex flex-col items-center justify-center py-20 gap-3">
            <IconCalendarEvent size={48} className="text-muted-foreground" stroke={1.5} />
            <p className="text-muted-foreground text-sm">Event auswählen oder erstellen</p>
            <Button variant="outline" size="sm" onClick={() => { setEditEvent(null); setEventDialogOpen(true); }}>
              <IconPlus size={14} className="shrink-0 mr-1" />
              Neues Event
            </Button>
          </div>
        )}
      </div>

      {/* ── Dialogs ─────────────────────────────────────────── */}

      <EventplanungDialog
        open={eventDialogOpen}
        onClose={() => { setEventDialogOpen(false); setEditEvent(null); }}
        onSubmit={async (fields) => {
          if (editEvent) {
            await LivingAppsService.updateEventplanungEntry(editEvent.record_id, fields);
          } else {
            await LivingAppsService.createEventplanungEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editEvent?.fields}
        enablePhotoScan={AI_PHOTO_SCAN['Eventplanung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Eventplanung']}
      />

      <DienstleisterbuchungenDialog
        open={buchungDialogOpen}
        onClose={() => { setBuchungDialogOpen(false); setEditBuchung(null); }}
        onSubmit={async (fields) => {
          if (editBuchung) {
            await LivingAppsService.updateDienstleisterbuchungenEntry(editBuchung.record_id, fields);
          } else {
            const defaultFields = effectiveSelectedId
              ? { ...fields, buchung_event: createRecordUrl(APP_IDS.EVENTPLANUNG, effectiveSelectedId) }
              : fields;
            await LivingAppsService.createDienstleisterbuchungenEntry(defaultFields);
          }
          fetchAll();
        }}
        defaultValues={editBuchung
          ? editBuchung.fields
          : effectiveSelectedId
            ? { buchung_event: createRecordUrl(APP_IDS.EVENTPLANUNG, effectiveSelectedId) }
            : undefined
        }
        eventplanungList={eventplanung}
        dienstleisterverzeichnisList={dienstleisterverzeichnis}
        enablePhotoScan={AI_PHOTO_SCAN['Dienstleisterbuchungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Dienstleisterbuchungen']}
      />

      <EinladungenRsvpDialog
        open={rsvpDialogOpen}
        onClose={() => { setRsvpDialogOpen(false); setEditRsvp(null); }}
        onSubmit={async (fields) => {
          if (editRsvp) {
            await LivingAppsService.updateEinladungenRsvpEntry(editRsvp.record_id, fields);
          } else {
            const defaultFields = effectiveSelectedId
              ? { ...fields, einladung_event: createRecordUrl(APP_IDS.EVENTPLANUNG, effectiveSelectedId) }
              : fields;
            await LivingAppsService.createEinladungenRsvpEntry(defaultFields);
          }
          fetchAll();
        }}
        defaultValues={editRsvp
          ? editRsvp.fields
          : effectiveSelectedId
            ? { einladung_event: createRecordUrl(APP_IDS.EVENTPLANUNG, effectiveSelectedId) }
            : undefined
        }
        eventplanungList={eventplanung}
        gaesteverzeichnisList={gaesteverzeichnis}
        enablePhotoScan={AI_PHOTO_SCAN['EinladungenRsvp']}
        enablePhotoLocation={AI_PHOTO_LOCATION['EinladungenRsvp']}
      />

      {/* Delete Confirms */}
      <ConfirmDialog
        open={!!deleteEventTarget}
        title="Event löschen"
        description={`„${deleteEventTarget?.fields.event_name ?? 'Event'}" wirklich löschen? Alle zugehörigen Daten bleiben erhalten.`}
        onConfirm={async () => {
          if (!deleteEventTarget) return;
          await LivingAppsService.deleteEventplanungEntry(deleteEventTarget.record_id);
          setDeleteEventTarget(null);
          if (selectedEventId === deleteEventTarget.record_id) setSelectedEventId(null);
          fetchAll();
        }}
        onClose={() => setDeleteEventTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteBuchungTarget}
        title="Buchung löschen"
        description={`Buchung für „${(deleteBuchungTarget?.buchung_dienstleisterName || deleteBuchungTarget?.fields.buchung_leistung) ?? '—'}" wirklich löschen?`}
        onConfirm={async () => {
          if (!deleteBuchungTarget) return;
          await LivingAppsService.deleteDienstleisterbuchungenEntry(deleteBuchungTarget.record_id);
          setDeleteBuchungTarget(null);
          fetchAll();
        }}
        onClose={() => setDeleteBuchungTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteRsvpTarget}
        title="Einladung löschen"
        description={`Einladung von „${deleteRsvpTarget?.einladung_gastName ?? '—'}" wirklich löschen?`}
        onConfirm={async () => {
          if (!deleteRsvpTarget) return;
          await LivingAppsService.deleteEinladungenRsvpEntry(deleteRsvpTarget.record_id);
          setDeleteRsvpTarget(null);
          fetchAll();
        }}
        onClose={() => setDeleteRsvpTarget(null)}
      />
    </div>
  );
}

// ── Skeleton & Error ─────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        <Skeleton className="h-80 rounded-2xl" />
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
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
