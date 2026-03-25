import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { IntentWizardShell } from '@/components/IntentWizardShell';
import { EntitySelectStep } from '@/components/EntitySelectStep';
import { BudgetTracker } from '@/components/BudgetTracker';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import type { Eventplanung, EinladungenRsvp, Dienstleisterbuchungen, Gaesteverzeichnis, Dienstleisterverzeichnis } from '@/types/app';
import { formatDate, formatCurrency, lookupKey } from '@/lib/formatters';
import {
  IconCalendar,
  IconMapPin,
  IconUsers,
  IconCurrencyEuro,
  IconCheck,
  IconX,
  IconAlertTriangle,
  IconCircleCheck,
  IconClock,
  IconBuildingStore,
  IconArrowLeft,
  IconChevronRight,
} from '@tabler/icons-react';

const WIZARD_STEPS = [
  { label: 'Event wählen' },
  { label: 'RSVPs prüfen' },
  { label: 'Zahlungen prüfen' },
  { label: 'Abschliessen' },
];

export default function EventAbschliessenPage() {
  const [searchParams] = useSearchParams();
  const { eventplanung, einladungenRsvp, dienstleisterbuchungen, gaesteverzeichnis, dienstleisterverzeichnis, loading, error, fetchAll } = useDashboardData();

  // Determine initial step from URL
  const urlStep = parseInt(searchParams.get('step') ?? '', 10);
  const urlEventId = searchParams.get('eventId') ?? null;
  const initialStep = urlEventId && urlStep >= 2 && urlStep <= 4 ? urlStep : urlEventId ? 2 : 1;

  const [currentStep, setCurrentStep] = useState(initialStep);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(urlEventId);

  // Local copies of invitation + booking records so we can update them optimistically
  const [localInvitations, setLocalInvitations] = useState<EinladungenRsvp[]>([]);
  const [localBookings, setLocalBookings] = useState<Dienstleisterbuchungen[]>([]);

  // Track in-progress updates
  const [updatingRsvp, setUpdatingRsvp] = useState<Set<string>>(new Set());
  const [updatingPayment, setUpdatingPayment] = useState<Set<string>>(new Set());

  // Step 4 completion state
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  // Build lookup maps from raw data
  const guestMap = useMemo(() => {
    const m = new Map<string, Gaesteverzeichnis>();
    gaesteverzeichnis.forEach(g => m.set(g.record_id, g));
    return m;
  }, [gaesteverzeichnis]);

  const providerMap = useMemo(() => {
    const m = new Map<string, Dienstleisterverzeichnis>();
    dienstleisterverzeichnis.forEach(d => m.set(d.record_id, d));
    return m;
  }, [dienstleisterverzeichnis]);

  // Sync local copies when global data arrives or event changes
  useEffect(() => {
    if (!selectedEventId) return;
    const filtered = einladungenRsvp.filter(
      inv => extractRecordId(inv.fields.einladung_event) === selectedEventId
    );
    setLocalInvitations(filtered);
  }, [einladungenRsvp, selectedEventId]);

  useEffect(() => {
    if (!selectedEventId) return;
    const filtered = dienstleisterbuchungen.filter(
      b => extractRecordId(b.fields.buchung_event) === selectedEventId
    );
    setLocalBookings(filtered);
  }, [dienstleisterbuchungen, selectedEventId]);

  const selectedEvent = useMemo(
    () => eventplanung.find(e => e.record_id === selectedEventId) ?? null,
    [eventplanung, selectedEventId]
  );

  // RSVP counts (live, derived from localInvitations)
  const rsvpCounts = useMemo(() => {
    const total = localInvitations.length;
    const zugesagt = localInvitations.filter(i => lookupKey(i.fields.rsvp_status) === 'zugesagt').length;
    const abgesagt = localInvitations.filter(i => lookupKey(i.fields.rsvp_status) === 'abgesagt').length;
    const ausstehend = localInvitations.filter(i => lookupKey(i.fields.rsvp_status) === 'ausstehend').length;
    return { total, zugesagt, abgesagt, ausstehend };
  }, [localInvitations]);

  // Payment totals (live, derived from localBookings)
  const paymentSummary = useMemo(() => {
    const total = localBookings.length;
    const totalCost = localBookings.reduce((sum, b) => sum + (b.fields.buchung_preis ?? 0), 0);
    const bezahlt = localBookings.filter(b => lookupKey(b.fields.buchung_zahlungsstatus) === 'bezahlt').length;
    const paidCost = localBookings
      .filter(b => lookupKey(b.fields.buchung_zahlungsstatus) === 'bezahlt')
      .reduce((sum, b) => sum + (b.fields.buchung_preis ?? 0), 0);
    const unpaid = total - bezahlt;
    return { total, totalCost, bezahlt, paidCost, unpaid };
  }, [localBookings]);

  // Handlers
  const handleSelectEvent = useCallback((id: string) => {
    setSelectedEventId(id);
    setCompleted(false);
    setCompleteError(null);
    setCurrentStep(2);
  }, []);

  const handleUpdateRsvp = useCallback(async (recordId: string, status: 'zugesagt' | 'abgesagt') => {
    setUpdatingRsvp(prev => new Set(prev).add(recordId));
    const todayStr = new Date().toISOString().slice(0, 10);
    try {
      await LivingAppsService.updateEinladungenRsvpEntry(recordId, {
        rsvp_status: status,
        rsvp_datum: todayStr,
      });
      // Optimistic update
      setLocalInvitations(prev =>
        prev.map(inv =>
          inv.record_id === recordId
            ? {
                ...inv,
                fields: {
                  ...inv.fields,
                  rsvp_status: { key: status, label: status === 'zugesagt' ? 'Zugesagt' : 'Abgesagt' },
                  rsvp_datum: todayStr,
                },
              }
            : inv
        )
      );
    } finally {
      setUpdatingRsvp(prev => {
        const next = new Set(prev);
        next.delete(recordId);
        return next;
      });
    }
  }, []);

  const handleMarkPaid = useCallback(async (recordId: string) => {
    setUpdatingPayment(prev => new Set(prev).add(recordId));
    try {
      await LivingAppsService.updateDienstleisterbuchungenEntry(recordId, {
        buchung_zahlungsstatus: 'bezahlt',
      });
      // Optimistic update
      setLocalBookings(prev =>
        prev.map(b =>
          b.record_id === recordId
            ? {
                ...b,
                fields: {
                  ...b.fields,
                  buchung_zahlungsstatus: { key: 'bezahlt', label: 'Vollständig bezahlt' },
                },
              }
            : b
        )
      );
    } finally {
      setUpdatingPayment(prev => {
        const next = new Set(prev);
        next.delete(recordId);
        return next;
      });
    }
  }, []);

  const handleCompleteEvent = useCallback(async () => {
    if (!selectedEventId) return;
    setCompleting(true);
    setCompleteError(null);
    try {
      await LivingAppsService.updateEventplanungEntry(selectedEventId, {
        event_status: 'abgeschlossen',
      });
      await fetchAll();
      setCompleted(true);
    } catch (err) {
      setCompleteError(err instanceof Error ? err.message : 'Fehler beim Abschliessen des Events');
    } finally {
      setCompleting(false);
    }
  }, [selectedEventId, fetchAll]);

  // Helper: guest display name from invitation
  const getGuestName = useCallback(
    (inv: EinladungenRsvp): string => {
      const guestId = extractRecordId(inv.fields.einladung_gast);
      if (!guestId) return 'Unbekannter Gast';
      const guest = guestMap.get(guestId);
      if (!guest) return 'Unbekannter Gast';
      const parts = [guest.fields.vorname, guest.fields.nachname].filter(Boolean);
      return parts.length > 0 ? parts.join(' ') : 'Gast';
    },
    [guestMap]
  );

  // Helper: provider name from booking
  const getProviderName = useCallback(
    (booking: Dienstleisterbuchungen): string => {
      const providerId = extractRecordId(booking.fields.buchung_dienstleister);
      if (!providerId) return 'Unbekannter Dienstleister';
      const provider = providerMap.get(providerId);
      return provider?.fields.dl_firmenname ?? 'Unbekannter Dienstleister';
    },
    [providerMap]
  );

  // Format event subtitle for EntitySelectStep
  const eventSelectItems = useMemo(
    () =>
      eventplanung.map((e: Eventplanung) => ({
        id: e.record_id,
        title: e.fields.event_name ?? '(Kein Name)',
        subtitle: [
          e.fields.event_datum ? formatDate(e.fields.event_datum) : null,
          e.fields.event_location_name ?? null,
        ]
          .filter(Boolean)
          .join(' · '),
        status: e.fields.event_status
          ? { key: lookupKey(e.fields.event_status) ?? '', label: (e.fields.event_status as { label: string }).label }
          : undefined,
        stats: [
          ...(e.fields.event_gaestezahl != null ? [{ label: 'Geplante Gäste', value: e.fields.event_gaestezahl }] : []),
          ...(e.fields.event_budget != null ? [{ label: 'Budget', value: formatCurrency(e.fields.event_budget) }] : []),
        ],
        icon: <IconCalendar size={18} className="text-primary" stroke={1.5} />,
      })),
    [eventplanung]
  );

  return (
    <IntentWizardShell
      title="Event abschliessen"
      subtitle="Prüfe RSVPs und Zahlungen, dann markiere das Event als abgeschlossen."
      steps={WIZARD_STEPS}
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ------------------------------------------------------------------ */}
      {/* STEP 1: Event auswählen                                             */}
      {/* ------------------------------------------------------------------ */}
      {currentStep === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Wähle das Event aus, das du abschliessen möchtest.
          </p>
          <EntitySelectStep
            items={eventSelectItems}
            onSelect={handleSelectEvent}
            searchPlaceholder="Event suchen..."
            emptyIcon={<IconCalendar size={40} stroke={1} />}
            emptyText="Keine Events gefunden."
          />
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* STEP 2: RSVP-Status prüfen                                         */}
      {/* ------------------------------------------------------------------ */}
      {currentStep === 2 && selectedEvent && (
        <div className="space-y-5">
          {/* Event context card */}
          <div className="rounded-xl border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-semibold text-base truncate">
                  {selectedEvent.fields.event_name ?? '(Kein Name)'}
                </h2>
                {selectedEvent.fields.event_status && (
                  <StatusBadge
                    statusKey={lookupKey(selectedEvent.fields.event_status)}
                    label={(selectedEvent.fields.event_status as { label: string }).label}
                  />
                )}
              </div>
              <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                {selectedEvent.fields.event_datum && (
                  <span className="flex items-center gap-1">
                    <IconCalendar size={12} stroke={1.5} />
                    {formatDate(selectedEvent.fields.event_datum)}
                  </span>
                )}
                {selectedEvent.fields.event_location_name && (
                  <span className="flex items-center gap-1">
                    <IconMapPin size={12} stroke={1.5} />
                    {selectedEvent.fields.event_location_name}
                  </span>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentStep(1)}
              className="shrink-0 gap-1.5 text-muted-foreground"
            >
              <IconArrowLeft size={14} stroke={2} />
              Anderes Event
            </Button>
          </div>

          {/* RSVP summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border bg-card p-3 text-center">
              <div className="text-2xl font-bold">{rsvpCounts.total}</div>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                <IconUsers size={12} stroke={1.5} />
                Eingeladen
              </div>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{rsvpCounts.zugesagt}</div>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                <IconCheck size={12} stroke={2} />
                Zugesagt
              </div>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <div className="text-2xl font-bold text-red-600">{rsvpCounts.abgesagt}</div>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                <IconX size={12} stroke={2} />
                Abgesagt
              </div>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <div className="text-2xl font-bold text-amber-600">{rsvpCounts.ausstehend}</div>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                <IconClock size={12} stroke={1.5} />
                Ausstehend
              </div>
            </div>
          </div>

          {/* Guest list */}
          {localInvitations.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <IconUsers size={36} className="mx-auto mb-3 opacity-30" stroke={1} />
              <p className="text-sm">Keine Einladungen für dieses Event gefunden.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {localInvitations.map(inv => {
                const statusKey = lookupKey(inv.fields.rsvp_status);
                const statusLabel = (inv.fields.rsvp_status as { label?: string } | undefined)?.label ?? statusKey ?? '—';
                const isPending = statusKey === 'ausstehend';
                const isUpdating = updatingRsvp.has(inv.record_id);
                return (
                  <div
                    key={inv.record_id}
                    className="rounded-xl border bg-card p-3 flex flex-col sm:flex-row sm:items-center gap-3 overflow-hidden"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{getGuestName(inv)}</span>
                        <StatusBadge statusKey={statusKey} label={statusLabel} />
                      </div>
                      {inv.fields.rsvp_datum && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          RSVP am {formatDate(inv.fields.rsvp_datum)}
                        </p>
                      )}
                    </div>
                    {isPending && (
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isUpdating}
                          onClick={() => handleUpdateRsvp(inv.record_id, 'zugesagt')}
                          className="gap-1.5 text-green-700 border-green-200 hover:bg-green-50"
                        >
                          <IconCheck size={14} stroke={2} />
                          Zugesagt
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isUpdating}
                          onClick={() => handleUpdateRsvp(inv.record_id, 'abgesagt')}
                          className="gap-1.5 text-red-700 border-red-200 hover:bg-red-50"
                        >
                          <IconX size={14} stroke={2} />
                          Abgesagt
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={() => setCurrentStep(3)} className="gap-1.5">
              Weiter zu Zahlungen
              <IconChevronRight size={16} stroke={2} />
            </Button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* STEP 3: Zahlungen prüfen                                            */}
      {/* ------------------------------------------------------------------ */}
      {currentStep === 3 && selectedEvent && (
        <div className="space-y-5">
          {/* Event context */}
          <div className="rounded-xl border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-base truncate">
                {selectedEvent.fields.event_name ?? '(Kein Name)'}
              </h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentStep(2)}
              className="shrink-0 gap-1.5 text-muted-foreground"
            >
              <IconArrowLeft size={14} stroke={2} />
              RSVPs
            </Button>
          </div>

          {/* Payment summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border bg-card p-3 text-center">
              <div className="text-2xl font-bold">{paymentSummary.total}</div>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                <IconBuildingStore size={12} stroke={1.5} />
                Buchungen
              </div>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <div className="text-2xl font-bold text-foreground">{formatCurrency(paymentSummary.totalCost)}</div>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                <IconCurrencyEuro size={12} stroke={1.5} />
                Gesamtkosten
              </div>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{paymentSummary.bezahlt}</div>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                <IconCheck size={12} stroke={2} />
                Bezahlt
              </div>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <div className="text-2xl font-bold text-amber-600">{paymentSummary.unpaid}</div>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                <IconClock size={12} stroke={1.5} />
                Ausstehend
              </div>
            </div>
          </div>

          {/* Budget tracker */}
          <BudgetTracker
            budget={selectedEvent.fields.event_budget ?? 0}
            booked={paymentSummary.totalCost}
            label="Eventbudget"
          />

          {/* Booking list */}
          {localBookings.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <IconBuildingStore size={36} className="mx-auto mb-3 opacity-30" stroke={1} />
              <p className="text-sm">Keine Buchungen für dieses Event gefunden.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Dienstleister</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Leistung</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Preis</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Zahlung</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {localBookings.map(booking => {
                    const zahlungKey = lookupKey(booking.fields.buchung_zahlungsstatus);
                    const zahlungLabel = (booking.fields.buchung_zahlungsstatus as { label?: string } | undefined)?.label ?? zahlungKey ?? '—';
                    const buchungStatusKey = lookupKey(booking.fields.buchung_status);
                    const buchungStatusLabel = (booking.fields.buchung_status as { label?: string } | undefined)?.label ?? buchungStatusKey ?? '—';
                    const isPaid = zahlungKey === 'bezahlt';
                    const isUpdating = updatingPayment.has(booking.record_id);
                    return (
                      <tr key={booking.record_id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-medium truncate max-w-[140px] block">{getProviderName(booking)}</span>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="text-muted-foreground truncate max-w-[160px] block">
                            {booking.fields.buchung_leistung ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                          {formatCurrency(booking.fields.buchung_preis)}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <StatusBadge statusKey={buchungStatusKey} label={buchungStatusLabel} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge statusKey={zahlungKey} label={zahlungLabel} />
                        </td>
                        <td className="px-4 py-3">
                          {!isPaid && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isUpdating}
                              onClick={() => handleMarkPaid(booking.record_id)}
                              className="gap-1.5 whitespace-nowrap text-green-700 border-green-200 hover:bg-green-50"
                            >
                              <IconCheck size={13} stroke={2} />
                              Als bezahlt
                            </Button>
                          )}
                          {isPaid && (
                            <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                              <IconCircleCheck size={13} stroke={2} />
                              Bezahlt
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setCurrentStep(2)} className="gap-1.5">
              <IconArrowLeft size={16} stroke={2} />
              Zurück
            </Button>
            <Button onClick={() => setCurrentStep(4)} className="gap-1.5">
              Weiter
              <IconChevronRight size={16} stroke={2} />
            </Button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* STEP 4: Event abschliessen                                          */}
      {/* ------------------------------------------------------------------ */}
      {currentStep === 4 && selectedEvent && (
        <div className="space-y-5">
          {completed ? (
            /* Success state */
            <div className="flex flex-col items-center justify-center py-16 gap-5 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <IconCircleCheck size={36} className="text-green-600" stroke={2} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-green-700">Event abgeschlossen!</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  "{selectedEvent.fields.event_name}" wurde erfolgreich als abgeschlossen markiert.
                </p>
              </div>
              <Link to="/">
                <Button variant="outline" className="gap-1.5">
                  <IconArrowLeft size={16} stroke={2} />
                  Zum Dashboard
                </Button>
              </Link>
            </div>
          ) : (
            <>
              {/* Final summary */}
              <div className="rounded-xl border bg-card p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <IconCalendar size={18} className="text-primary" stroke={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-base truncate">
                      {selectedEvent.fields.event_name ?? '(Kein Name)'}
                    </h2>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                      {selectedEvent.fields.event_datum && (
                        <span className="flex items-center gap-1">
                          <IconCalendar size={12} stroke={1.5} />
                          {formatDate(selectedEvent.fields.event_datum)}
                        </span>
                      )}
                      {selectedEvent.fields.event_location_name && (
                        <span className="flex items-center gap-1">
                          <IconMapPin size={12} stroke={1.5} />
                          {selectedEvent.fields.event_location_name}
                        </span>
                      )}
                    </div>
                  </div>
                  {selectedEvent.fields.event_status && (
                    <StatusBadge
                      statusKey={lookupKey(selectedEvent.fields.event_status)}
                      label={(selectedEvent.fields.event_status as { label: string }).label}
                    />
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <div className="text-xl font-bold text-green-600">{rsvpCounts.zugesagt}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Zugesagt</div>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <div className="text-xl font-bold text-red-600">{rsvpCounts.abgesagt}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Abgesagt</div>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center col-span-2 sm:col-span-1">
                    <div className="text-xl font-bold text-amber-600">{rsvpCounts.ausstehend}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">RSVP ausstehend</div>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <div className="text-xl font-bold text-green-600">{paymentSummary.bezahlt}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Bezahlt</div>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center col-span-2 sm:col-span-1">
                    <div className="text-xl font-bold text-amber-600">{paymentSummary.unpaid}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Zahlung ausstehend</div>
                  </div>
                </div>
              </div>

              {/* Budget tracker */}
              <BudgetTracker
                budget={selectedEvent.fields.event_budget ?? 0}
                booked={paymentSummary.totalCost}
                label="Eventbudget – Gesamtübersicht"
              />

              {/* Warnings */}
              {(rsvpCounts.ausstehend > 0 || paymentSummary.unpaid > 0) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3">
                  <IconAlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" stroke={2} />
                  <div className="text-sm text-amber-800 space-y-1">
                    {rsvpCounts.ausstehend > 0 && (
                      <p>
                        <span className="font-medium">{rsvpCounts.ausstehend} RSVP</span> noch ausstehend — du kannst das Event trotzdem abschliessen.
                      </p>
                    )}
                    {paymentSummary.unpaid > 0 && (
                      <p>
                        <span className="font-medium">{paymentSummary.unpaid} Buchung{paymentSummary.unpaid > 1 ? 'en' : ''}</span> noch nicht bezahlt.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {completeError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex gap-3">
                  <IconAlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" stroke={2} />
                  <p className="text-sm text-red-800">{completeError}</p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row justify-between gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setCurrentStep(3)}
                  className="gap-1.5"
                  disabled={completing}
                >
                  <IconArrowLeft size={16} stroke={2} />
                  Zurück
                </Button>
                <Button
                  size="lg"
                  disabled={completing}
                  onClick={handleCompleteEvent}
                  className="gap-2"
                >
                  <IconCircleCheck size={18} stroke={2} />
                  {completing ? 'Wird abgeschlossen...' : 'Event als abgeschlossen markieren'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </IntentWizardShell>
  );
}
