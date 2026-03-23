import { useState, useMemo, useCallback } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichEinladungenRsvp } from '@/lib/enrich';
import type { EnrichedEinladungenRsvp } from '@/types/enriched';
import { EinladungenRsvpDialog } from '@/components/dialogs/EinladungenRsvpDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageShell } from '@/components/PageShell';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { APP_IDS } from '@/types/app';
import { formatDate } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import {
  IconPlus,
  IconTrash,
  IconCalendar,
  IconUsers,
  IconCheck,
  IconX,
  IconClock,
  IconQuestionMark,
  IconChevronDown,
  IconBuildingStore,
  IconMail,
} from '@tabler/icons-react';

const RSVP_STATUS_OPTIONS = [
  { key: 'ausstehend', label: 'Ausstehend' },
  { key: 'zugesagt', label: 'Zugesagt' },
  { key: 'abgesagt', label: 'Abgesagt' },
  { key: 'vielleicht', label: 'Vielleicht' },
];

function getRsvpStyle(key: string | undefined) {
  switch (key) {
    case 'zugesagt':
      return {
        badge: 'bg-green-100 text-green-800 border border-green-200',
        dot: 'bg-green-500',
        icon: <IconCheck size={12} stroke={2.5} />,
      };
    case 'abgesagt':
      return {
        badge: 'bg-red-100 text-red-800 border border-red-200',
        dot: 'bg-red-500',
        icon: <IconX size={12} stroke={2.5} />,
      };
    case 'vielleicht':
      return {
        badge: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
        dot: 'bg-yellow-500',
        icon: <IconQuestionMark size={12} stroke={2.5} />,
      };
    default:
      return {
        badge: 'bg-gray-100 text-gray-700 border border-gray-200',
        dot: 'bg-gray-400',
        icon: <IconClock size={12} stroke={2} />,
      };
  }
}

export default function GaestelIsteRsvpPage() {
  const {
    eventplanung,
    gaesteverzeichnis,
    einladungenRsvp,
    eventplanungMap,
    gaesteverzeichnisMap,
    fetchAll,
    loading,
    error,
  } = useDashboardData();

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<EnrichedEinladungenRsvp | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EnrichedEinladungenRsvp | null>(null);
  const [openStatusPopover, setOpenStatusPopover] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  const enrichedInvitations = useMemo(
    () => enrichEinladungenRsvp(einladungenRsvp, { eventplanungMap, gaesteverzeichnisMap }),
    [einladungenRsvp, eventplanungMap, gaesteverzeichnisMap]
  );

  const filteredInvitations = useMemo(() => {
    if (!selectedEventId) return [];
    return enrichedInvitations.filter(
      (inv) => extractRecordId(inv.fields.einladung_event) === selectedEventId
    );
  }, [enrichedInvitations, selectedEventId]);

  const stats = useMemo(() => {
    const total = filteredInvitations.length;
    const zugesagt = filteredInvitations.filter((i) => i.fields.rsvp_status?.key === 'zugesagt').length;
    const abgesagt = filteredInvitations.filter((i) => i.fields.rsvp_status?.key === 'abgesagt').length;
    const vielleicht = filteredInvitations.filter((i) => i.fields.rsvp_status?.key === 'vielleicht').length;
    const ausstehend = filteredInvitations.filter(
      (i) => !i.fields.rsvp_status || i.fields.rsvp_status.key === 'ausstehend'
    ).length;
    return { total, zugesagt, abgesagt, vielleicht, ausstehend };
  }, [filteredInvitations]);

  const handleOpenCreate = useCallback(() => {
    setEditRecord(null);
    setDialogOpen(true);
  }, []);

  const handleOpenEdit = useCallback((record: EnrichedEinladungenRsvp) => {
    setEditRecord(record);
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await LivingAppsService.deleteEinladungenRsvpEntry(deleteTarget.record_id);
    setDeleteTarget(null);
    fetchAll();
  }, [deleteTarget, fetchAll]);

  const handleStatusUpdate = useCallback(
    async (record: EnrichedEinladungenRsvp, statusKey: string) => {
      const opt = RSVP_STATUS_OPTIONS.find((o) => o.key === statusKey);
      if (!opt) return;
      setUpdatingStatus(record.record_id);
      setOpenStatusPopover(null);
      try {
        await LivingAppsService.updateEinladungenRsvpEntry(record.record_id, {
          rsvp_status: { key: opt.key, label: opt.label },
        });
        fetchAll();
      } finally {
        setUpdatingStatus(null);
      }
    },
    [fetchAll]
  );

  const selectedEvent = selectedEventId ? eventplanungMap.get(selectedEventId) : null;

  if (loading) {
    return (
      <PageShell title="Gästeliste & RSVP" subtitle="Einladungen und Rückmeldungen verwalten">
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <span className="text-sm">Daten werden geladen...</span>
          </div>
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell title="Gästeliste & RSVP" subtitle="Einladungen und Rückmeldungen verwalten">
        <div className="flex items-center justify-center py-24">
          <div className="text-center space-y-2">
            <p className="text-destructive font-medium">Fehler beim Laden</p>
            <p className="text-sm text-muted-foreground">{error.message}</p>
            <Button variant="outline" onClick={fetchAll} className="mt-4">
              Erneut versuchen
            </Button>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Gästeliste & RSVP"
      subtitle="Einladungen verwalten und RSVP-Status nachverfolgen"
      action={
        selectedEventId ? (
          <Button onClick={handleOpenCreate} className="shrink-0">
            <IconPlus size={16} stroke={2} className="mr-1.5" />
            Einladung hinzufügen
          </Button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">
        {/* Left: Event Selector */}
        <div className="bg-card rounded-2xl border overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b bg-secondary/30">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Events
            </p>
          </div>
          <div className="divide-y max-h-[70vh] overflow-y-auto">
            {eventplanung.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">
                Keine Events vorhanden
              </p>
            ) : (
              eventplanung.map((ev) => {
                const isSelected = selectedEventId === ev.record_id;
                const invCount = enrichedInvitations.filter(
                  (i) => extractRecordId(i.fields.einladung_event) === ev.record_id
                ).length;
                return (
                  <button
                    key={ev.record_id}
                    onClick={() => setSelectedEventId(ev.record_id)}
                    className={`w-full text-left px-4 py-3 transition-colors hover:bg-secondary/50 ${
                      isSelected ? 'bg-primary/8 border-l-2 border-l-primary' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm font-medium truncate ${
                            isSelected ? 'text-primary' : 'text-foreground'
                          }`}
                        >
                          {ev.fields.event_name ?? 'Unbenanntes Event'}
                        </p>
                        {ev.fields.event_datum && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <IconCalendar size={11} stroke={1.8} />
                            {formatDate(ev.fields.event_datum)}
                          </p>
                        )}
                        {ev.fields.event_status && (
                          <span className="inline-block mt-1 text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                            {ev.fields.event_status.label}
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 text-xs bg-secondary rounded-full px-2 py-0.5 text-muted-foreground">
                        {invCount}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Guest List */}
        <div className="space-y-4">
          {!selectedEventId ? (
            <div className="bg-card rounded-2xl border shadow-sm flex flex-col items-center justify-center py-20 text-center gap-3">
              <div className="h-14 w-14 rounded-full bg-secondary flex items-center justify-center">
                <IconUsers size={28} stroke={1.5} className="text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-foreground">Event auswählen</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Wähle links ein Event aus, um die Gästeliste anzuzeigen
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Event Header */}
              <div className="bg-card rounded-2xl border shadow-sm px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold truncate">
                      {selectedEvent?.fields.event_name ?? 'Event'}
                    </h2>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
                      {selectedEvent?.fields.event_datum && (
                        <span className="flex items-center gap-1">
                          <IconCalendar size={14} stroke={1.8} />
                          {formatDate(selectedEvent.fields.event_datum)}
                        </span>
                      )}
                      {selectedEvent?.fields.event_location_name && (
                        <span className="flex items-center gap-1">
                          <IconBuildingStore size={14} stroke={1.8} />
                          {selectedEvent.fields.event_location_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button onClick={handleOpenCreate} size="sm">
                    <IconPlus size={15} stroke={2} className="mr-1" />
                    Einladung
                  </Button>
                </div>
              </div>

              {/* Stats Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { label: 'Eingeladen', value: stats.total, color: 'text-foreground', bg: 'bg-secondary/50' },
                  { label: 'Zugesagt', value: stats.zugesagt, color: 'text-green-700', bg: 'bg-green-50' },
                  { label: 'Abgesagt', value: stats.abgesagt, color: 'text-red-700', bg: 'bg-red-50' },
                  { label: 'Vielleicht', value: stats.vielleicht, color: 'text-yellow-700', bg: 'bg-yellow-50' },
                  { label: 'Ausstehend', value: stats.ausstehend, color: 'text-gray-600', bg: 'bg-gray-50' },
                ].map((s) => (
                  <div
                    key={s.label}
                    className={`rounded-xl border px-4 py-3 text-center ${s.bg}`}
                  >
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Guest List */}
              <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
                {filteredInvitations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                    <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center">
                      <IconUsers size={24} stroke={1.5} className="text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">Noch keine Gäste eingeladen</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Füge die erste Einladung hinzu
                      </p>
                    </div>
                    <Button onClick={handleOpenCreate} className="mt-2">
                      <IconPlus size={15} stroke={2} className="mr-1.5" />
                      Einladung hinzufügen
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-secondary/30">
                          <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Gast
                          </th>
                          <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">
                            Firma / E-Mail
                          </th>
                          <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            RSVP Status
                          </th>
                          <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell">
                            Eingeladen
                          </th>
                          <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell">
                            Rückmeldung
                          </th>
                          <th className="px-4 py-3 w-10" />
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredInvitations.map((inv) => {
                          const gastId = extractRecordId(inv.fields.einladung_gast);
                          const gast = gastId ? gaesteverzeichnisMap.get(gastId) : null;
                          const statusKey = inv.fields.rsvp_status?.key;
                          const style = getRsvpStyle(statusKey);
                          const isUpdating = updatingStatus === inv.record_id;
                          const isPopoverOpen = openStatusPopover === inv.record_id;

                          return (
                            <tr
                              key={inv.record_id}
                              className="hover:bg-secondary/20 transition-colors"
                            >
                              {/* Guest Name */}
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div
                                    className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${style.badge}`}
                                  >
                                    {inv.einladung_gastName
                                      ? inv.einladung_gastName.charAt(0).toUpperCase()
                                      : '?'}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">
                                      {inv.einladung_gastName || 'Unbekannt'}
                                    </p>
                                    {gast?.fields.position && (
                                      <p className="text-xs text-muted-foreground truncate">
                                        {gast.fields.position}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* Firma / Email */}
                              <td className="px-4 py-3 hidden sm:table-cell">
                                <div className="min-w-0 space-y-0.5">
                                  {gast?.fields.firma && (
                                    <p className="text-sm text-foreground truncate max-w-[180px]">
                                      {gast.fields.firma}
                                    </p>
                                  )}
                                  {gast?.fields.email && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 truncate max-w-[180px]">
                                      <IconMail size={11} stroke={1.8} className="shrink-0" />
                                      {gast.fields.email}
                                    </p>
                                  )}
                                  {!gast?.fields.firma && !gast?.fields.email && (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </div>
                              </td>

                              {/* RSVP Status — inline update */}
                              <td className="px-4 py-3">
                                <div className="relative">
                                  <button
                                    onClick={() =>
                                      setOpenStatusPopover(isPopoverOpen ? null : inv.record_id)
                                    }
                                    disabled={isUpdating}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-opacity cursor-pointer ${style.badge} ${isUpdating ? 'opacity-50' : 'hover:opacity-80'}`}
                                  >
                                    {isUpdating ? (
                                      <span className="h-3 w-3 rounded-full border border-current border-t-transparent animate-spin" />
                                    ) : (
                                      style.icon
                                    )}
                                    <span>
                                      {inv.fields.rsvp_status?.label ?? 'Ausstehend'}
                                    </span>
                                    <IconChevronDown size={11} stroke={2} />
                                  </button>

                                  {/* Status Dropdown Popover */}
                                  {isPopoverOpen && (
                                    <>
                                      <div
                                        className="fixed inset-0 z-10"
                                        onClick={() => setOpenStatusPopover(null)}
                                      />
                                      <div className="absolute left-0 top-full mt-1 z-20 bg-card border rounded-xl shadow-lg overflow-hidden min-w-[150px]">
                                        {RSVP_STATUS_OPTIONS.map((opt) => {
                                          const optStyle = getRsvpStyle(opt.key);
                                          const isCurrent = statusKey === opt.key;
                                          return (
                                            <button
                                              key={opt.key}
                                              onClick={() => handleStatusUpdate(inv, opt.key)}
                                              className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-secondary/50 text-left ${
                                                isCurrent ? 'bg-secondary/70 font-medium' : ''
                                              }`}
                                            >
                                              <span
                                                className={`h-2 w-2 rounded-full shrink-0 ${optStyle.dot}`}
                                              />
                                              {opt.label}
                                              {isCurrent && (
                                                <IconCheck size={13} stroke={2.5} className="ml-auto text-primary" />
                                              )}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </>
                                  )}
                                </div>
                              </td>

                              {/* Einladungsdatum */}
                              <td className="px-4 py-3 hidden md:table-cell">
                                <span className="text-sm text-muted-foreground">
                                  {inv.fields.einladung_datum
                                    ? formatDate(inv.fields.einladung_datum)
                                    : '—'}
                                </span>
                              </td>

                              {/* RSVP Datum */}
                              <td className="px-4 py-3 hidden md:table-cell">
                                <span className="text-sm text-muted-foreground">
                                  {inv.fields.rsvp_datum
                                    ? formatDate(inv.fields.rsvp_datum)
                                    : '—'}
                                </span>
                              </td>

                              {/* Actions */}
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleOpenEdit(inv)}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                    title="Bearbeiten"
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => setDeleteTarget(inv)}
                                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                    title="Löschen"
                                  >
                                    <IconTrash size={14} stroke={2} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create / Edit Dialog */}
      <EinladungenRsvpDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditRecord(null);
        }}
        onSubmit={async (fields) => {
          if (editRecord) {
            await LivingAppsService.updateEinladungenRsvpEntry(editRecord.record_id, fields);
          } else {
            await LivingAppsService.createEinladungenRsvpEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={
          editRecord
            ? editRecord.fields
            : selectedEventId
            ? { einladung_event: createRecordUrl(APP_IDS.EVENTPLANUNG, selectedEventId) }
            : undefined
        }
        eventplanungList={eventplanung}
        gaesteverzeichnisList={gaesteverzeichnis}
        enablePhotoScan={false}
      />

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Einladung löschen"
        description={`Soll die Einladung von "${deleteTarget?.einladung_gastName ?? 'diesem Gast'}" wirklich gelöscht werden?`}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </PageShell>
  );
}
