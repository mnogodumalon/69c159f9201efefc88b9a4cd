import { useState, useMemo, useCallback } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichEinladungenRsvp } from '@/lib/enrich';
import type { EnrichedEinladungenRsvp } from '@/types/enriched';
import type { Eventplanung } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { formatDate } from '@/lib/formatters';
import { PageShell } from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  IconCalendarEvent,
  IconArrowLeft,
  IconUsers,
  IconCheck,
  IconX,
  IconQuestionMark,
  IconClock,
  IconDeviceFloppy,
  IconAlertTriangle,
} from '@tabler/icons-react';

type RsvpStatusKey = 'zugesagt' | 'abgesagt' | 'vielleicht' | 'ausstehend';
type FilterTab = 'alle' | RsvpStatusKey;

interface OptimisticUpdate {
  record_id: string;
  rsvp_status: RsvpStatusKey;
  rsvp_datum: string;
}

export default function RsvpVerwaltungPage() {
  const { eventplanung, einladungenRsvp, gaesteverzeichnisMap, eventplanungMap, loading, error, fetchAll } = useDashboardData();

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>('alle');
  const [optimisticUpdates, setOptimisticUpdates] = useState<Map<string, OptimisticUpdate>>(new Map());
  const [pendingNotes, setPendingNotes] = useState<Map<string, string>>(new Map());
  const [savingNotes, setSavingNotes] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const enrichedRsvp = useMemo(() => {
    return enrichEinladungenRsvp(einladungenRsvp, { eventplanungMap, gaesteverzeichnisMap });
  }, [einladungenRsvp, eventplanungMap, gaesteverzeichnisMap]);

  const rsvpByEvent = useMemo(() => {
    const map = new Map<string, EnrichedEinladungenRsvp[]>();
    enrichedRsvp.forEach(r => {
      const eventId = extractRecordId(r.fields.einladung_event);
      if (!eventId) return;
      if (!map.has(eventId)) map.set(eventId, []);
      map.get(eventId)!.push(r);
    });
    return map;
  }, [enrichedRsvp]);

  const getEffectiveStatus = useCallback((record: EnrichedEinladungenRsvp): RsvpStatusKey => {
    const update = optimisticUpdates.get(record.record_id);
    if (update) return update.rsvp_status;
    return (record.fields.rsvp_status?.key as RsvpStatusKey) ?? 'ausstehend';
  }, [optimisticUpdates]);

  const selectedEventRsvp = useMemo(() => {
    if (!selectedEventId) return [];
    return rsvpByEvent.get(selectedEventId) ?? [];
  }, [selectedEventId, rsvpByEvent]);

  const rsvpCounts = useMemo(() => {
    const counts = { zugesagt: 0, abgesagt: 0, vielleicht: 0, ausstehend: 0 };
    selectedEventRsvp.forEach(r => {
      const status = getEffectiveStatus(r);
      if (status in counts) counts[status]++;
    });
    return counts;
  }, [selectedEventRsvp, getEffectiveStatus]);

  const filteredRsvp = useMemo(() => {
    if (filterTab === 'alle') return selectedEventRsvp;
    return selectedEventRsvp.filter(r => getEffectiveStatus(r) === filterTab);
  }, [selectedEventRsvp, filterTab, getEffectiveStatus]);

  const handleUpdateStatus = useCallback(async (record: EnrichedEinladungenRsvp, newStatus: RsvpStatusKey) => {
    const today = new Date().toISOString().slice(0, 10);
    setOptimisticUpdates(prev => {
      const next = new Map(prev);
      next.set(record.record_id, { record_id: record.record_id, rsvp_status: newStatus, rsvp_datum: today });
      return next;
    });
    try {
      await LivingAppsService.updateEinladungenRsvpEntry(record.record_id, {
        rsvp_status: { key: newStatus, label: newStatus },
        rsvp_datum: today,
      });
      fetchAll();
    } catch {
      setOptimisticUpdates(prev => {
        const next = new Map(prev);
        next.delete(record.record_id);
        return next;
      });
    }
  }, [fetchAll]);

  const handleSaveNote = useCallback(async (record: EnrichedEinladungenRsvp) => {
    const note = pendingNotes.get(record.record_id);
    if (note === undefined) return;
    setSavingNotes(prev => new Set(prev).add(record.record_id));
    try {
      await LivingAppsService.updateEinladungenRsvpEntry(record.record_id, {
        einladung_notizen: note,
      });
      fetchAll();
      setPendingNotes(prev => {
        const next = new Map(prev);
        next.delete(record.record_id);
        return next;
      });
    } finally {
      setSavingNotes(prev => {
        const next = new Set(prev);
        next.delete(record.record_id);
        return next;
      });
    }
  }, [pendingNotes, fetchAll]);

  const handleBulkAbsagen = useCallback(async () => {
    if (!selectedEventId) return;
    setBulkUpdating(true);
    const today = new Date().toISOString().slice(0, 10);
    const pending = selectedEventRsvp.filter(r => getEffectiveStatus(r) === 'ausstehend');
    setOptimisticUpdates(prev => {
      const next = new Map(prev);
      pending.forEach(r => {
        next.set(r.record_id, { record_id: r.record_id, rsvp_status: 'abgesagt', rsvp_datum: today });
      });
      return next;
    });
    try {
      await Promise.all(
        pending.map(r =>
          LivingAppsService.updateEinladungenRsvpEntry(r.record_id, {
            rsvp_status: { key: 'abgesagt', label: 'Abgesagt' },
            rsvp_datum: today,
          })
        )
      );
      fetchAll();
    } finally {
      setBulkUpdating(false);
    }
  }, [selectedEventId, selectedEventRsvp, getEffectiveStatus, fetchAll]);

  if (loading) {
    return (
      <PageShell title="RSVP verwalten" subtitle="Ladend...">
        <div className="flex items-center justify-center h-48 text-muted-foreground">
          Daten werden geladen...
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell title="RSVP verwalten" subtitle="Fehler beim Laden">
        <div className="flex items-center gap-2 text-destructive p-4 bg-destructive/10 rounded-lg">
          <IconAlertTriangle size={20} />
          <span>{error.message}</span>
        </div>
      </PageShell>
    );
  }

  const selectedEvent = selectedEventId ? eventplanungMap.get(selectedEventId) : null;

  return (
    <PageShell
      title="RSVP verwalten"
      subtitle={
        selectedEvent
          ? `${selectedEvent.fields.event_name ?? 'Event'} — Teilnahmestatus der Gäste`
          : 'Wählen Sie ein Event, um RSVP-Status zu verwalten'
      }
    >
      {!selectedEventId ? (
        <PhaseEventAuswahl
          eventplanung={eventplanung}
          rsvpByEvent={rsvpByEvent}
          onSelectEvent={setSelectedEventId}
        />
      ) : (
        <PhaseRsvpQueue
          selectedEvent={selectedEvent}
          filteredRsvp={filteredRsvp}
          rsvpCounts={rsvpCounts}
          filterTab={filterTab}
          onFilterChange={setFilterTab}
          onBack={() => {
            setSelectedEventId(null);
            setFilterTab('alle');
            setOptimisticUpdates(new Map());
            setPendingNotes(new Map());
          }}
          onUpdateStatus={handleUpdateStatus}
          onBulkAbsagen={handleBulkAbsagen}
          bulkUpdating={bulkUpdating}
          pendingNotes={pendingNotes}
          onNoteChange={(recordId, note) =>
            setPendingNotes(prev => new Map(prev).set(recordId, note))
          }
          onSaveNote={handleSaveNote}
          savingNotes={savingNotes}
          getEffectiveStatus={getEffectiveStatus}
          gaesteverzeichnisMap={gaesteverzeichnisMap}
          totalForEvent={selectedEventRsvp.length}
        />
      )}
    </PageShell>
  );
}

// ─── Phase 1: Event auswählen ──────────────────────────────────────────────

interface PhaseEventAuswahlProps {
  eventplanung: Eventplanung[];
  rsvpByEvent: Map<string, EnrichedEinladungenRsvp[]>;
  onSelectEvent: (id: string) => void;
}

function PhaseEventAuswahl({ eventplanung, rsvpByEvent, onSelectEvent }: PhaseEventAuswahlProps) {
  if (eventplanung.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-16">
        Keine Events vorhanden. Erstellen Sie zunächst ein Event.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {eventplanung.map(event => {
        const rsvpList = rsvpByEvent.get(event.record_id) ?? [];
        const pending = rsvpList.filter(r => (r.fields.rsvp_status?.key ?? 'ausstehend') === 'ausstehend').length;
        const zugesagt = rsvpList.filter(r => r.fields.rsvp_status?.key === 'zugesagt').length;

        return (
          <button
            key={event.record_id}
            onClick={() => onSelectEvent(event.record_id)}
            className="w-full text-left bg-card border border-border rounded-2xl p-4 hover:bg-secondary transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <div className="flex items-start justify-between gap-3 min-w-0">
              <div className="flex items-start gap-3 min-w-0">
                <div className="shrink-0 w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                  <IconCalendarEvent size={20} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-foreground truncate">
                    {event.fields.event_name ?? 'Unbekanntes Event'}
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    {event.fields.event_datum ? formatDate(event.fields.event_datum) : 'Kein Datum'}
                    {event.fields.event_location_name && ` · ${event.fields.event_location_name}`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {pending > 0 && (
                  <Badge className="bg-gray-100 text-gray-700 border-0 text-xs">
                    {pending} ausstehend
                  </Badge>
                )}
                <Badge className="bg-green-100 text-green-700 border-0 text-xs">
                  {zugesagt} zugesagt
                </Badge>
                <Badge variant="outline" className="text-xs">
                  <IconUsers size={12} className="mr-1" />
                  {rsvpList.length}
                </Badge>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Phase 2: RSVP Queue ───────────────────────────────────────────────────

type GaesteverzeichnisMap = ReturnType<typeof useDashboardData>['gaesteverzeichnisMap'];

interface PhaseRsvpQueueProps {
  selectedEvent: Eventplanung | null | undefined;
  filteredRsvp: EnrichedEinladungenRsvp[];
  rsvpCounts: { zugesagt: number; abgesagt: number; vielleicht: number; ausstehend: number };
  filterTab: FilterTab;
  onFilterChange: (tab: FilterTab) => void;
  onBack: () => void;
  onUpdateStatus: (record: EnrichedEinladungenRsvp, status: RsvpStatusKey) => void;
  onBulkAbsagen: () => void;
  bulkUpdating: boolean;
  pendingNotes: Map<string, string>;
  onNoteChange: (recordId: string, note: string) => void;
  onSaveNote: (record: EnrichedEinladungenRsvp) => void;
  savingNotes: Set<string>;
  getEffectiveStatus: (record: EnrichedEinladungenRsvp) => RsvpStatusKey;
  gaesteverzeichnisMap: GaesteverzeichnisMap;
  totalForEvent: number;
}

function PhaseRsvpQueue({
  selectedEvent,
  filteredRsvp,
  rsvpCounts,
  filterTab,
  onFilterChange,
  onBack,
  onUpdateStatus,
  onBulkAbsagen,
  bulkUpdating,
  pendingNotes,
  onNoteChange,
  onSaveNote,
  savingNotes,
  getEffectiveStatus,
  gaesteverzeichnisMap,
  totalForEvent,
}: PhaseRsvpQueueProps) {
  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: 'alle', label: 'Alle' },
    { key: 'ausstehend', label: 'Ausstehend' },
    { key: 'zugesagt', label: 'Zugesagt' },
    { key: 'abgesagt', label: 'Abgesagt' },
    { key: 'vielleicht', label: 'Vielleicht' },
  ];

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0">
            <IconArrowLeft size={16} className="mr-1" />
            Anderes Event
          </Button>
          <div className="text-right min-w-0">
            <div className="font-medium text-foreground truncate">
              {selectedEvent?.fields.event_name ?? 'Event'}
            </div>
            {selectedEvent?.fields.event_datum && (
              <div className="text-sm text-muted-foreground">
                {formatDate(selectedEvent.fields.event_datum)}
              </div>
            )}
          </div>
        </div>

        {/* Live counters */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <CounterBadge label="Zugesagt" count={rsvpCounts.zugesagt} color="green" />
          <CounterBadge label="Abgesagt" count={rsvpCounts.abgesagt} color="red" />
          <CounterBadge label="Vielleicht" count={rsvpCounts.vielleicht} color="yellow" />
          <CounterBadge label="Ausstehend" count={rsvpCounts.ausstehend} color="gray" />
          <CounterBadge label="Gesamt" count={totalForEvent} color="blue" />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {filterTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => onFilterChange(tab.key)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterTab === tab.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Guest list */}
      {filteredRsvp.length === 0 ? (
        <div className="text-center text-muted-foreground py-12 bg-card border border-border rounded-2xl">
          Keine Einladungen in dieser Kategorie.
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRsvp.map(rsvp => {
            const guestId = extractRecordId(rsvp.fields.einladung_gast);
            const guest = guestId ? gaesteverzeichnisMap.get(guestId) : null;
            const currentStatus = getEffectiveStatus(rsvp);
            const noteValue = pendingNotes.has(rsvp.record_id)
              ? pendingNotes.get(rsvp.record_id)!
              : (rsvp.fields.einladung_notizen ?? '');
            const noteChanged = pendingNotes.has(rsvp.record_id);

            return (
              <div
                key={rsvp.record_id}
                className="bg-card border border-border rounded-2xl p-4 space-y-3 overflow-hidden"
              >
                {/* Guest info + status */}
                <div className="flex items-start justify-between gap-3 min-w-0">
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">
                      {guest
                        ? `${guest.fields.vorname ?? ''} ${guest.fields.nachname ?? ''}`.trim() || rsvp.einladung_gastName
                        : rsvp.einladung_gastName || 'Unbekannter Gast'}
                    </div>
                    {guest && (guest.fields.firma || guest.fields.position) && (
                      <div className="text-sm text-muted-foreground truncate mt-0.5">
                        {[guest.fields.position, guest.fields.firma].filter(Boolean).join(' · ')}
                      </div>
                    )}
                    {rsvp.fields.rsvp_datum && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        RSVP: {formatDate(rsvp.fields.rsvp_datum)}
                      </div>
                    )}
                  </div>
                  <RsvpStatusBadge status={currentStatus} />
                </div>

                {/* Quick action buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  <StatusButton
                    label="Zugesagt"
                    targetStatus="zugesagt"
                    currentStatus={currentStatus}
                    color="green"
                    icon={<IconCheck size={14} />}
                    onClick={() => onUpdateStatus(rsvp, 'zugesagt')}
                  />
                  <StatusButton
                    label="Abgesagt"
                    targetStatus="abgesagt"
                    currentStatus={currentStatus}
                    color="red"
                    icon={<IconX size={14} />}
                    onClick={() => onUpdateStatus(rsvp, 'abgesagt')}
                  />
                  <StatusButton
                    label="Vielleicht"
                    targetStatus="vielleicht"
                    currentStatus={currentStatus}
                    color="yellow"
                    icon={<IconQuestionMark size={14} />}
                    onClick={() => onUpdateStatus(rsvp, 'vielleicht')}
                  />
                  <StatusButton
                    label="Ausstehend"
                    targetStatus="ausstehend"
                    currentStatus={currentStatus}
                    color="gray"
                    icon={<IconClock size={14} />}
                    onClick={() => onUpdateStatus(rsvp, 'ausstehend')}
                  />
                </div>

                {/* Notes field */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Notizen..."
                    value={noteValue}
                    onChange={e => onNoteChange(rsvp.record_id, e.target.value)}
                    className="text-sm h-8 flex-1 min-w-0"
                  />
                  {noteChanged && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 h-8 px-2"
                      onClick={() => onSaveNote(rsvp)}
                      disabled={savingNotes.has(rsvp.record_id)}
                    >
                      <IconDeviceFloppy size={14} className="mr-1" />
                      {savingNotes.has(rsvp.record_id) ? 'Speichern...' : 'Speichern'}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bulk action */}
      {rsvpCounts.ausstehend > 0 && (
        <div className="pt-2">
          <Button
            variant="outline"
            className="w-full border-red-200 text-red-700 hover:bg-red-50"
            onClick={onBulkAbsagen}
            disabled={bulkUpdating}
          >
            <IconX size={16} className="mr-2" />
            {bulkUpdating
              ? 'Wird aktualisiert...'
              : `Alle ${rsvpCounts.ausstehend} Ausstehenden auf Abgesagt setzen`}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function CounterBadge({ label, count, color }: { label: string; count: number; color: 'green' | 'red' | 'yellow' | 'gray' | 'blue' }) {
  const colorMap = {
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    gray: 'bg-gray-100 text-gray-600',
    blue: 'bg-blue-100 text-blue-700',
  };
  return (
    <div className={`rounded-xl px-3 py-2 text-center ${colorMap[color]}`}>
      <div className="text-lg font-semibold">{count}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}

function RsvpStatusBadge({ status }: { status: RsvpStatusKey }) {
  const map: Record<RsvpStatusKey, { label: string; cls: string }> = {
    zugesagt: { label: 'Zugesagt', cls: 'bg-green-100 text-green-700' },
    abgesagt: { label: 'Abgesagt', cls: 'bg-red-100 text-red-700' },
    vielleicht: { label: 'Vielleicht', cls: 'bg-yellow-100 text-yellow-700' },
    ausstehend: { label: 'Ausstehend', cls: 'bg-gray-100 text-gray-600' },
  };
  const { label, cls } = map[status] ?? map.ausstehend;
  return (
    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border-0 ${cls}`}>
      {label}
    </span>
  );
}

interface StatusButtonProps {
  label: string;
  targetStatus: RsvpStatusKey;
  currentStatus: RsvpStatusKey;
  color: 'green' | 'red' | 'yellow' | 'gray';
  icon: React.ReactNode;
  onClick: () => void;
}

function StatusButton({ label, targetStatus, currentStatus, color, icon, onClick }: StatusButtonProps) {
  const isActive = currentStatus === targetStatus;
  const activeMap = {
    green: 'bg-green-100 text-green-700 border-green-300',
    red: 'bg-red-100 text-red-700 border-red-300',
    yellow: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    gray: 'bg-gray-100 text-gray-600 border-gray-300',
  };
  const inactiveMap = {
    green: 'bg-card text-muted-foreground border-border hover:bg-green-50 hover:text-green-700',
    red: 'bg-card text-muted-foreground border-border hover:bg-red-50 hover:text-red-700',
    yellow: 'bg-card text-muted-foreground border-border hover:bg-yellow-50 hover:text-yellow-700',
    gray: 'bg-card text-muted-foreground border-border hover:bg-gray-50 hover:text-gray-700',
  };

  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
        isActive ? activeMap[color] : inactiveMap[color]
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
