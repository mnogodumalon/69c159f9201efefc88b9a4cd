import { useState, useMemo } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichEinladungenRsvp, enrichDienstleisterbuchungen } from '@/lib/enrich';
import type { EnrichedEinladungenRsvp, EnrichedDienstleisterbuchungen } from '@/types/enriched';
import type { Eventplanung, EinladungenRsvp, Dienstleisterbuchungen } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/StatCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EventplanungDialog } from '@/components/dialogs/EventplanungDialog';
import { EinladungenRsvpDialog } from '@/components/dialogs/EinladungenRsvpDialog';
import { DienstleisterbuchungenDialog } from '@/components/dialogs/DienstleisterbuchungenDialog';
import {
  IconAlertCircle, IconPlus, IconPencil, IconTrash, IconCalendar,
  IconUsers, IconBuildingStore, IconCurrencyEuro, IconChevronRight,
  IconX, IconCheck, IconClock, IconMapPin, IconUserPlus, IconToolsKitchen2,
} from '@tabler/icons-react';

// ─── Status helpers ──────────────────────────────────────────────────────────

const EVENT_STATUS_COLORS: Record<string, string> = {
  in_planung: 'bg-amber-100 text-amber-800 border-amber-200',
  einladungen_versendet: 'bg-blue-100 text-blue-800 border-blue-200',
  bestaetigt: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  abgeschlossen: 'bg-slate-100 text-slate-700 border-slate-200',
  abgesagt: 'bg-red-100 text-red-800 border-red-200',
};

const RSVP_COLORS: Record<string, string> = {
  zugesagt: 'bg-emerald-100 text-emerald-800',
  abgesagt: 'bg-red-100 text-red-800',
  ausstehend: 'bg-amber-100 text-amber-800',
  vielleicht: 'bg-blue-100 text-blue-800',
};

const BUCHUNG_STATUS_COLORS: Record<string, string> = {
  angefragt: 'bg-amber-100 text-amber-800',
  angebot_erhalten: 'bg-blue-100 text-blue-800',
  gebucht: 'bg-indigo-100 text-indigo-800',
  bestaetigt: 'bg-emerald-100 text-emerald-800',
  storniert: 'bg-red-100 text-red-800',
};

function eventStatusClass(key: string | undefined) {
  return EVENT_STATUS_COLORS[key ?? ''] ?? 'bg-slate-100 text-slate-600 border-slate-200';
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DashboardOverview() {
  const {
    gaesteverzeichnis, dienstleisterverzeichnis, eventplanung,
    einladungenRsvp, dienstleisterbuchungen,
    gaesteverzeichnisMap, dienstleisterverzeichnisMap, eventplanungMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const enrichedEinladungen = useMemo(
    () => enrichEinladungenRsvp(einladungenRsvp, { eventplanungMap, gaesteverzeichnisMap }),
    [einladungenRsvp, eventplanungMap, gaesteverzeichnisMap]
  );
  const enrichedBuchungen = useMemo(
    () => enrichDienstleisterbuchungen(dienstleisterbuchungen, { eventplanungMap, dienstleisterverzeichnisMap }),
    [dienstleisterbuchungen, eventplanungMap, dienstleisterverzeichnisMap]
  );

  // ── Selected event for detail panel ──
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // ── Event dialog state ──
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<Eventplanung | null>(null);
  const [deleteEventTarget, setDeleteEventTarget] = useState<Eventplanung | null>(null);

  // ── RSVP dialog state ──
  const [rsvpDialogOpen, setRsvpDialogOpen] = useState(false);
  const [editRsvp, setEditRsvp] = useState<EnrichedEinladungenRsvp | null>(null);
  const [deleteRsvpTarget, setDeleteRsvpTarget] = useState<EnrichedEinladungenRsvp | null>(null);

  // ── Buchung dialog state ──
  const [buchungDialogOpen, setBuchungDialogOpen] = useState(false);
  const [editBuchung, setEditBuchung] = useState<EnrichedDienstleisterbuchungen | null>(null);
  const [deleteBuchungTarget, setDeleteBuchungTarget] = useState<EnrichedDienstleisterbuchungen | null>(null);

  // ── Derived data ──
  const selectedEvent = useMemo(
    () => eventplanung.find(e => e.record_id === selectedEventId) ?? null,
    [eventplanung, selectedEventId]
  );

  const eventEinladungen = useMemo(
    () => enrichedEinladungen.filter(e => extractRecordId(e.fields.einladung_event) === selectedEventId),
    [enrichedEinladungen, selectedEventId]
  );

  const eventBuchungen = useMemo(
    () => enrichedBuchungen.filter(b => extractRecordId(b.fields.buchung_event) === selectedEventId),
    [enrichedBuchungen, selectedEventId]
  );

  // ── KPIs ──
  const totalGuests = gaesteverzeichnis.length;
  const upcomingEvents = useMemo(
    () => eventplanung.filter(e => {
      const key = e.fields.event_status?.key;
      return key === 'in_planung' || key === 'einladungen_versendet' || key === 'bestaetigt';
    }).length,
    [eventplanung]
  );
  const confirmedRsvp = useMemo(
    () => einladungenRsvp.filter(e => e.fields.rsvp_status?.key === 'zugesagt').length,
    [einladungenRsvp]
  );
  const totalBuchungskosten = useMemo(
    () => dienstleisterbuchungen.reduce((sum, b) => sum + (b.fields.buchung_preis ?? 0), 0),
    [dienstleisterbuchungen]
  );

  // ── Handlers ──
  const handleCreateEvent = async (fields: Eventplanung['fields']) => {
    await LivingAppsService.createEventplanungEntry(fields);
    fetchAll();
  };
  const handleUpdateEvent = async (fields: Eventplanung['fields']) => {
    if (!editEvent) return;
    await LivingAppsService.updateEventplanungEntry(editEvent.record_id, fields);
    fetchAll();
  };
  const handleDeleteEvent = async () => {
    if (!deleteEventTarget) return;
    await LivingAppsService.deleteEventplanungEntry(deleteEventTarget.record_id);
    if (selectedEventId === deleteEventTarget.record_id) setSelectedEventId(null);
    setDeleteEventTarget(null);
    fetchAll();
  };

  const handleCreateRsvp = async (fields: EinladungenRsvp['fields']) => {
    await LivingAppsService.createEinladungenRsvpEntry(fields);
    fetchAll();
  };
  const handleUpdateRsvp = async (fields: EinladungenRsvp['fields']) => {
    if (!editRsvp) return;
    await LivingAppsService.updateEinladungenRsvpEntry(editRsvp.record_id, fields);
    fetchAll();
  };
  const handleDeleteRsvp = async () => {
    if (!deleteRsvpTarget) return;
    await LivingAppsService.deleteEinladungenRsvpEntry(deleteRsvpTarget.record_id);
    setDeleteRsvpTarget(null);
    fetchAll();
  };

  const handleCreateBuchung = async (fields: Dienstleisterbuchungen['fields']) => {
    await LivingAppsService.createDienstleisterbuchungenEntry(fields);
    fetchAll();
  };
  const handleUpdateBuchung = async (fields: Dienstleisterbuchungen['fields']) => {
    if (!editBuchung) return;
    await LivingAppsService.updateDienstleisterbuchungenEntry(editBuchung.record_id, fields);
    fetchAll();
  };
  const handleDeleteBuchung = async () => {
    if (!deleteBuchungTarget) return;
    await LivingAppsService.deleteDienstleisterbuchungenEntry(deleteBuchungTarget.record_id);
    setDeleteBuchungTarget(null);
    fetchAll();
  };

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Events aktiv"
          value={String(upcomingEvents)}
          description="In Planung / Bestätigt"
          icon={<IconCalendar size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Gästeliste"
          value={String(totalGuests)}
          description="Registrierte Gäste"
          icon={<IconUsers size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Zusagen"
          value={String(confirmedRsvp)}
          description="Bestätigte RSVPs"
          icon={<IconCheck size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Buchungskosten"
          value={formatCurrency(totalBuchungskosten)}
          description="Dienstleister gesamt"
          icon={<IconCurrencyEuro size={18} className="text-muted-foreground" />}
        />
      </div>

      {/* Main workspace: event list + detail panel */}
      <div className="flex flex-col lg:flex-row gap-4 min-h-0">
        {/* Event cards list */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground text-base">Events</h2>
            <Button
              size="sm"
              onClick={() => { setEditEvent(null); setEventDialogOpen(true); }}
              className="shrink-0"
            >
              <IconPlus size={16} className="shrink-0" />
              <span className="hidden sm:inline ml-1">Neues Event</span>
            </Button>
          </div>

          {eventplanung.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-2xl border border-dashed border-border bg-muted/30">
              <IconCalendar size={40} stroke={1.5} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Noch keine Events angelegt</p>
              <Button variant="outline" size="sm" onClick={() => { setEditEvent(null); setEventDialogOpen(true); }}>
                <IconPlus size={14} className="mr-1 shrink-0" /> Erstes Event erstellen
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {eventplanung
                .slice()
                .sort((a, b) => {
                  const da = a.fields.event_datum ?? '';
                  const db = b.fields.event_datum ?? '';
                  return da < db ? -1 : da > db ? 1 : 0;
                })
                .map(event => {
                  const einl = enrichedEinladungen.filter(e => extractRecordId(e.fields.einladung_event) === event.record_id);
                  const buch = enrichedBuchungen.filter(b => extractRecordId(b.fields.buchung_event) === event.record_id);
                  const confirmed = einl.filter(e => e.fields.rsvp_status?.key === 'zugesagt').length;
                  const statusKey = event.fields.event_status?.key ?? '';
                  const isSelected = selectedEventId === event.record_id;

                  return (
                    <div
                      key={event.record_id}
                      onClick={() => setSelectedEventId(isSelected ? null : event.record_id)}
                      className={`rounded-xl border p-4 cursor-pointer transition-all ${isSelected
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border bg-card hover:border-primary/40 hover:bg-muted/20'
                        }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-foreground truncate text-sm">
                              {event.fields.event_name ?? '(Kein Name)'}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${eventStatusClass(statusKey)}`}>
                              {event.fields.event_status?.label ?? 'Kein Status'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                            {event.fields.event_datum && (
                              <span className="flex items-center gap-1">
                                <IconClock size={12} className="shrink-0" />
                                {formatDate(event.fields.event_datum)}
                              </span>
                            )}
                            {event.fields.event_location_name && (
                              <span className="flex items-center gap-1 truncate max-w-[140px]">
                                <IconMapPin size={12} className="shrink-0" />
                                {event.fields.event_location_name}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <IconUsers size={12} className="shrink-0" />
                              {confirmed}/{einl.length} Zusagen
                            </span>
                            {buch.length > 0 && (
                              <span className="flex items-center gap-1">
                                <IconBuildingStore size={12} className="shrink-0" />
                                {buch.length} Buchung{buch.length !== 1 ? 'en' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={e => { e.stopPropagation(); setEditEvent(event); setEventDialogOpen(true); }}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            <IconPencil size={14} />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setDeleteEventTarget(event); }}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <IconTrash size={14} />
                          </button>
                          <IconChevronRight size={14} className={`transition-transform text-muted-foreground ${isSelected ? 'rotate-90' : ''}`} />
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedEvent && (
          <div className="lg:w-96 shrink-0 space-y-4">
            {/* Event header */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-bold text-foreground text-base leading-tight truncate">
                    {selectedEvent.fields.event_name ?? '(Kein Name)'}
                  </h3>
                  {selectedEvent.fields.event_datum && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(selectedEvent.fields.event_datum)}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setSelectedEventId(null)}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                >
                  <IconX size={14} />
                </button>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {selectedEvent.fields.event_location_name && (
                  <span className="flex items-center gap-1">
                    <IconMapPin size={12} className="shrink-0" />
                    {selectedEvent.fields.event_location_name}
                    {selectedEvent.fields.event_stadt ? `, ${selectedEvent.fields.event_stadt}` : ''}
                  </span>
                )}
                {selectedEvent.fields.event_gaestezahl != null && (
                  <span className="flex items-center gap-1">
                    <IconUsers size={12} className="shrink-0" />
                    {selectedEvent.fields.event_gaestezahl} geplant
                  </span>
                )}
                {selectedEvent.fields.event_budget != null && (
                  <span className="flex items-center gap-1">
                    <IconCurrencyEuro size={12} className="shrink-0" />
                    Budget: {formatCurrency(selectedEvent.fields.event_budget)}
                  </span>
                )}
              </div>

              {selectedEvent.fields.event_beschreibung && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {selectedEvent.fields.event_beschreibung}
                </p>
              )}
            </div>

            {/* RSVP section */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  <IconUsers size={14} className="text-muted-foreground shrink-0" />
                  <span className="font-semibold text-sm">Einladungen & RSVP</span>
                  <Badge variant="secondary" className="text-xs">{eventEinladungen.length}</Badge>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setEditRsvp(null);
                    setRsvpDialogOpen(true);
                  }}
                >
                  <IconUserPlus size={13} className="shrink-0 mr-1" />
                  Hinzufügen
                </Button>
              </div>

              <div className="divide-y divide-border max-h-52 overflow-y-auto">
                {eventEinladungen.length === 0 ? (
                  <div className="py-8 flex flex-col items-center gap-2 text-muted-foreground">
                    <IconUsers size={28} stroke={1.5} />
                    <p className="text-xs">Noch keine Einladungen</p>
                  </div>
                ) : (
                  eventEinladungen.map(inv => (
                    <div key={inv.record_id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{inv.einladung_gastName || '—'}</p>
                        {inv.fields.einladung_datum && (
                          <p className="text-xs text-muted-foreground">{formatDate(inv.fields.einladung_datum)}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RSVP_COLORS[inv.fields.rsvp_status?.key ?? ''] ?? 'bg-muted text-muted-foreground'}`}>
                          {inv.fields.rsvp_status?.label ?? 'Ausstehend'}
                        </span>
                        <button
                          onClick={() => { setEditRsvp(inv); setRsvpDialogOpen(true); }}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                        >
                          <IconPencil size={12} />
                        </button>
                        <button
                          onClick={() => setDeleteRsvpTarget(inv)}
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          <IconTrash size={12} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* RSVP summary bar */}
              {eventEinladungen.length > 0 && (
                <div className="px-4 py-2 bg-muted/20 border-t border-border flex gap-3 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                    {eventEinladungen.filter(e => e.fields.rsvp_status?.key === 'zugesagt').length} Zusagen
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                    {eventEinladungen.filter(e => e.fields.rsvp_status?.key === 'abgesagt').length} Absagen
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                    {eventEinladungen.filter(e => e.fields.rsvp_status?.key === 'ausstehend').length} Offen
                  </span>
                </div>
              )}
            </div>

            {/* Buchungen section */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  <IconToolsKitchen2 size={14} className="text-muted-foreground shrink-0" />
                  <span className="font-semibold text-sm">Dienstleister</span>
                  <Badge variant="secondary" className="text-xs">{eventBuchungen.length}</Badge>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setEditBuchung(null);
                    setBuchungDialogOpen(true);
                  }}
                >
                  <IconPlus size={13} className="shrink-0 mr-1" />
                  Buchen
                </Button>
              </div>

              <div className="divide-y divide-border max-h-52 overflow-y-auto">
                {eventBuchungen.length === 0 ? (
                  <div className="py-8 flex flex-col items-center gap-2 text-muted-foreground">
                    <IconBuildingStore size={28} stroke={1.5} />
                    <p className="text-xs">Keine Buchungen vorhanden</p>
                  </div>
                ) : (
                  eventBuchungen.map(b => (
                    <div key={b.record_id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{b.buchung_dienstleisterName || '—'}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {b.fields.buchung_preis != null && (
                            <p className="text-xs text-muted-foreground">{formatCurrency(b.fields.buchung_preis)}</p>
                          )}
                          {b.fields.buchung_leistung && (
                            <p className="text-xs text-muted-foreground truncate max-w-[120px]">{b.fields.buchung_leistung}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BUCHUNG_STATUS_COLORS[b.fields.buchung_status?.key ?? ''] ?? 'bg-muted text-muted-foreground'}`}>
                          {b.fields.buchung_status?.label ?? '—'}
                        </span>
                        <button
                          onClick={() => { setEditBuchung(b); setBuchungDialogOpen(true); }}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                        >
                          <IconPencil size={12} />
                        </button>
                        <button
                          onClick={() => setDeleteBuchungTarget(b)}
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          <IconTrash size={12} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Budget summary */}
              {eventBuchungen.length > 0 && (
                <div className="px-4 py-2 bg-muted/20 border-t border-border flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
                  <span>Buchungskosten gesamt</span>
                  <span className="font-semibold text-foreground">
                    {formatCurrency(eventBuchungen.reduce((s, b) => s + (b.fields.buchung_preis ?? 0), 0))}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Dialogs ─────────────────────────────────────────── */}

      <EventplanungDialog
        open={eventDialogOpen}
        onClose={() => { setEventDialogOpen(false); setEditEvent(null); }}
        onSubmit={editEvent ? handleUpdateEvent : handleCreateEvent}
        defaultValues={editEvent?.fields}
        enablePhotoScan={AI_PHOTO_SCAN['Eventplanung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Eventplanung']}
      />

      <EinladungenRsvpDialog
        open={rsvpDialogOpen}
        onClose={() => { setRsvpDialogOpen(false); setEditRsvp(null); }}
        onSubmit={editRsvp ? handleUpdateRsvp : handleCreateRsvp}
        defaultValues={editRsvp
          ? editRsvp.fields
          : selectedEventId
            ? { einladung_event: createRecordUrl(APP_IDS.EVENTPLANUNG, selectedEventId) }
            : undefined
        }
        eventplanungList={eventplanung}
        gaesteverzeichnisList={gaesteverzeichnis}
        enablePhotoScan={AI_PHOTO_SCAN['EinladungenRsvp']}
        enablePhotoLocation={AI_PHOTO_LOCATION['EinladungenRsvp']}
      />

      <DienstleisterbuchungenDialog
        open={buchungDialogOpen}
        onClose={() => { setBuchungDialogOpen(false); setEditBuchung(null); }}
        onSubmit={editBuchung ? handleUpdateBuchung : handleCreateBuchung}
        defaultValues={editBuchung
          ? editBuchung.fields
          : selectedEventId
            ? { buchung_event: createRecordUrl(APP_IDS.EVENTPLANUNG, selectedEventId) }
            : undefined
        }
        eventplanungList={eventplanung}
        dienstleisterverzeichnisList={dienstleisterverzeichnis}
        enablePhotoScan={AI_PHOTO_SCAN['Dienstleisterbuchungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Dienstleisterbuchungen']}
      />

      {/* Confirm delete: Event */}
      <ConfirmDialog
        open={!!deleteEventTarget}
        title="Event löschen"
        description={`"${deleteEventTarget?.fields.event_name ?? 'Dieses Event'}" wirklich löschen? Alle zugehörigen Daten bleiben erhalten.`}
        onConfirm={handleDeleteEvent}
        onClose={() => setDeleteEventTarget(null)}
      />

      {/* Confirm delete: RSVP */}
      <ConfirmDialog
        open={!!deleteRsvpTarget}
        title="Einladung löschen"
        description={`Einladung von "${deleteRsvpTarget?.einladung_gastName ?? 'diesem Gast'}" wirklich löschen?`}
        onConfirm={handleDeleteRsvp}
        onClose={() => setDeleteRsvpTarget(null)}
      />

      {/* Confirm delete: Buchung */}
      <ConfirmDialog
        open={!!deleteBuchungTarget}
        title="Buchung löschen"
        description={`Buchung bei "${deleteBuchungTarget?.buchung_dienstleisterName ?? 'diesem Dienstleister'}" wirklich löschen?`}
        onConfirm={handleDeleteBuchung}
        onClose={() => setDeleteBuchungTarget(null)}
      />
    </div>
  );
}

// ─── Skeleton & Error ─────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <div className="flex gap-4">
        <div className="flex-1 space-y-3">
          <Skeleton className="h-8 w-40" />
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="hidden lg:block w-96 h-80 rounded-2xl" />
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
