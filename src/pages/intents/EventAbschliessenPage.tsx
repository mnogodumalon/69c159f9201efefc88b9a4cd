import { useState, useMemo } from 'react';
import type { Eventplanung, EinladungenRsvp, Gaesteverzeichnis, Dienstleisterbuchungen, Dienstleisterverzeichnis } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/IntentWizardShell';
import { EntitySelectStep } from '@/components/EntitySelectStep';
import { BudgetTracker } from '@/components/BudgetTracker';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconCircleCheck, IconAlertTriangle, IconLoader2, IconCalendarEvent } from '@tabler/icons-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { formatCurrency } from '@/lib/formatters';

const WIZARD_STEPS = [
  { label: 'Event wählen' },
  { label: 'RSVP-Übersicht' },
  { label: 'Zahlungen abrechnen' },
  { label: 'Abschliessen' },
];

export default function EventAbschliessenPage() {
  const {
    eventplanung,
    einladungenRsvp,
    gaesteverzeichnis,
    dienstleisterbuchungen,
    dienstleisterverzeichnis,
    loading,
    error,
    fetchAll,
  } = useDashboardData();

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [finalized, setFinalized] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  // Build lookup maps
  const guestMap = useMemo(() => {
    const m = new Map<string, Gaesteverzeichnis>();
    gaesteverzeichnis.forEach(g => m.set(g.record_id, g));
    return m;
  }, [gaesteverzeichnis]);

  const vendorMap = useMemo(() => {
    const m = new Map<string, Dienstleisterverzeichnis>();
    dienstleisterverzeichnis.forEach(v => m.set(v.record_id, v));
    return m;
  }, [dienstleisterverzeichnis]);

  // Filter out already-closed events
  const openEvents = useMemo(() => {
    return eventplanung.filter(e => e.fields.event_status?.key !== 'abgeschlossen');
  }, [eventplanung]);

  // Count invitations per event
  const invitationCountByEvent = useMemo(() => {
    const counts = new Map<string, number>();
    einladungenRsvp.forEach(inv => {
      const eventId = extractRecordId(inv.fields.einladung_event);
      if (eventId) counts.set(eventId, (counts.get(eventId) ?? 0) + 1);
    });
    return counts;
  }, [einladungenRsvp]);

  const confirmedCountByEvent = useMemo(() => {
    const counts = new Map<string, number>();
    einladungenRsvp.forEach(inv => {
      if (inv.fields.rsvp_status?.key === 'zugesagt') {
        const eventId = extractRecordId(inv.fields.einladung_event);
        if (eventId) counts.set(eventId, (counts.get(eventId) ?? 0) + 1);
      }
    });
    return counts;
  }, [einladungenRsvp]);

  // Selected event object
  const selectedEvent = useMemo<Eventplanung | null>(() => {
    return openEvents.find(e => e.record_id === selectedEventId) ?? null;
  }, [openEvents, selectedEventId]);

  // Invitations for selected event
  const eventInvitations = useMemo<EinladungenRsvp[]>(() => {
    if (!selectedEventId) return [];
    return einladungenRsvp.filter(
      inv => extractRecordId(inv.fields.einladung_event) === selectedEventId
    );
  }, [einladungenRsvp, selectedEventId]);

  // Bookings for selected event
  const eventBookings = useMemo<Dienstleisterbuchungen[]>(() => {
    if (!selectedEventId) return [];
    return dienstleisterbuchungen.filter(
      b => extractRecordId(b.fields.buchung_event) === selectedEventId
    );
  }, [dienstleisterbuchungen, selectedEventId]);

  // RSVP stats
  const rsvpStats = useMemo(() => {
    const total = eventInvitations.length;
    const zugesagt = eventInvitations.filter(i => i.fields.rsvp_status?.key === 'zugesagt').length;
    const abgesagt = eventInvitations.filter(i => i.fields.rsvp_status?.key === 'abgesagt').length;
    const vielleicht = eventInvitations.filter(i => i.fields.rsvp_status?.key === 'vielleicht').length;
    const ausstehend = eventInvitations.filter(i => i.fields.rsvp_status?.key === 'ausstehend' || !i.fields.rsvp_status).length;
    return { total, zugesagt, abgesagt, vielleicht, ausstehend };
  }, [eventInvitations]);

  // Booking total
  const totalBooked = useMemo(() => {
    return eventBookings.reduce((sum, b) => sum + (b.fields.buchung_preis ?? 0), 0);
  }, [eventBookings]);

  // Unbezahlt vendors
  const unpaidBookings = useMemo(() => {
    return eventBookings.filter(b => b.fields.buchung_zahlungsstatus?.key !== 'bezahlt');
  }, [eventBookings]);

  function formatEventDate(dateStr?: string): string {
    if (!dateStr) return '';
    try {
      return format(new Date(dateStr), 'dd.MM.yyyy HH:mm', { locale: de });
    } catch {
      return dateStr;
    }
  }

  function getGuestName(inv: EinladungenRsvp): string {
    const guestId = extractRecordId(inv.fields.einladung_gast);
    if (!guestId) return 'Unbekannt';
    const guest = guestMap.get(guestId);
    if (!guest) return 'Unbekannt';
    return [guest.fields.vorname, guest.fields.nachname].filter(Boolean).join(' ') || 'Unbekannt';
  }

  function getVendorName(booking: Dienstleisterbuchungen): string {
    const vendorId = extractRecordId(booking.fields.buchung_dienstleister);
    if (!vendorId) return 'Unbekannt';
    const vendor = vendorMap.get(vendorId);
    if (!vendor) return 'Unbekannt';
    return vendor.fields.dl_firmenname ?? 'Unbekannt';
  }

  async function handleRsvpStatusChange(recordId: string, newStatus: string) {
    try {
      await LivingAppsService.updateEinladungenRsvpEntry(recordId, { rsvp_status: newStatus });
      await fetchAll();
    } catch {
      // silently handle — user can retry
    }
  }

  async function handleZahlungsstatusChange(recordId: string, newStatus: string) {
    try {
      await LivingAppsService.updateDienstleisterbuchungenEntry(recordId, { buchung_zahlungsstatus: newStatus });
      await fetchAll();
    } catch {
      // silently handle — user can retry
    }
  }

  async function handleFinalizeEvent() {
    if (!selectedEvent) return;
    setSaving(true);
    setFinalizeError(null);
    try {
      await LivingAppsService.updateEventplanungEntry(selectedEvent.record_id, { event_status: 'abgeschlossen' });
      await fetchAll();
      setFinalized(true);
    } catch (err) {
      setFinalizeError(err instanceof Error ? err.message : 'Fehler beim Abschliessen des Events');
    } finally {
      setSaving(false);
    }
  }

  return (
    <IntentWizardShell
      title="Event abschliessen"
      subtitle="Abschluss-Workflow: RSVP-Auswertung, Zahlungen und Finalabschluss"
      steps={WIZARD_STEPS}
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Event wählen */}
      {currentStep === 1 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold mb-1">Event auswählen</h2>
            <p className="text-sm text-muted-foreground">
              Wähle das Event, das du abschliessen möchtest. Bereits abgeschlossene Events werden nicht angezeigt.
            </p>
          </div>
          <EntitySelectStep
            items={openEvents.map(e => ({
              id: e.record_id,
              title: e.fields.event_name ?? 'Unbekannt',
              subtitle: e.fields.event_datum
                ? formatEventDate(e.fields.event_datum) + (e.fields.event_location_name ? ' • ' + e.fields.event_location_name : '')
                : e.fields.event_location_name ?? '',
              status: e.fields.event_status
                ? { key: e.fields.event_status.key, label: e.fields.event_status.label }
                : undefined,
              stats: [
                { label: 'Eingeladen', value: String(invitationCountByEvent.get(e.record_id) ?? 0) },
                { label: 'Zugesagt', value: String(confirmedCountByEvent.get(e.record_id) ?? 0) },
              ],
              icon: <IconCalendarEvent size={20} className="text-primary" />,
            }))}
            onSelect={(id) => {
              setSelectedEventId(id);
              setCurrentStep(2);
            }}
            searchPlaceholder="Event suchen..."
            emptyText="Keine offenen Events gefunden."
          />
        </div>
      )}

      {/* Step 2: RSVP-Übersicht */}
      {currentStep === 2 && selectedEvent && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-lg font-semibold">{selectedEvent.fields.event_name}</h2>
              <p className="text-sm text-muted-foreground">RSVP-Übersicht & Status aktualisieren</p>
            </div>
            <StatusBadge statusKey={selectedEvent.fields.event_status?.key} label={selectedEvent.fields.event_status?.label} />
          </div>

          {/* RSVP Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Eingeladen', value: rsvpStats.total, color: 'bg-blue-50 border-blue-200' },
              { label: 'Zugesagt', value: rsvpStats.zugesagt, color: 'bg-green-50 border-green-200' },
              { label: 'Abgesagt', value: rsvpStats.abgesagt, color: 'bg-red-50 border-red-200' },
              { label: 'Ausstehend', value: rsvpStats.ausstehend, color: 'bg-gray-50 border-gray-200' },
            ].map(stat => (
              <div key={stat.label} className={`rounded-xl border p-3 text-center ${stat.color} overflow-hidden`}>
                <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* RSVP List */}
          {eventInvitations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Keine Einladungen für dieses Event gefunden.</p>
            </div>
          ) : (
            <div className="space-y-2 overflow-x-auto">
              {eventInvitations.map(inv => (
                <div
                  key={inv.record_id}
                  className="flex items-center gap-3 p-3 rounded-xl border bg-card overflow-hidden flex-wrap sm:flex-nowrap"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{getGuestName(inv)}</p>
                    {inv.fields.einladung_datum && (
                      <p className="text-xs text-muted-foreground">
                        Eingeladen: {format(new Date(inv.fields.einladung_datum), 'dd.MM.yyyy', { locale: de })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge
                      statusKey={inv.fields.rsvp_status?.key}
                      label={inv.fields.rsvp_status?.label}
                    />
                    <Select
                      value={inv.fields.rsvp_status?.key ?? 'ausstehend'}
                      onValueChange={(val) => handleRsvpStatusChange(inv.record_id, val)}
                    >
                      <SelectTrigger className="w-36 h-8 text-xs">
                        <SelectValue placeholder="Status wählen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ausstehend">Ausstehend</SelectItem>
                        <SelectItem value="zugesagt">Zugesagt</SelectItem>
                        <SelectItem value="abgesagt">Abgesagt</SelectItem>
                        <SelectItem value="vielleicht">Vielleicht</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setCurrentStep(1)}>
              Zurück
            </Button>
            <Button onClick={() => setCurrentStep(3)} className="flex-1 sm:flex-none">
              Weiter zu Zahlungen
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Zahlungen abrechnen */}
      {currentStep === 3 && selectedEvent && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{selectedEvent.fields.event_name}</h2>
            <p className="text-sm text-muted-foreground">Dienstleisterzahlungen prüfen und abrechnen</p>
          </div>

          {/* Budget Tracker */}
          <BudgetTracker
            budget={selectedEvent.fields.event_budget ?? 0}
            booked={totalBooked}
          />

          {/* Bookings list */}
          {eventBookings.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Keine Dienstleisterbuchungen für dieses Event gefunden.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {eventBookings.map(booking => (
                <div
                  key={booking.record_id}
                  className="rounded-xl border bg-card p-4 space-y-2 overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{getVendorName(booking)}</p>
                      {booking.fields.buchung_leistung && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {booking.fields.buchung_leistung}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-sm">
                        {formatCurrency(booking.fields.buchung_preis ?? 0)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge
                      statusKey={booking.fields.buchung_status?.key}
                      label={booking.fields.buchung_status?.label}
                    />
                    <StatusBadge
                      statusKey={booking.fields.buchung_zahlungsstatus?.key}
                      label={booking.fields.buchung_zahlungsstatus?.label}
                    />
                    <Select
                      value={booking.fields.buchung_zahlungsstatus?.key ?? 'offen'}
                      onValueChange={(val) => handleZahlungsstatusChange(booking.record_id, val)}
                    >
                      <SelectTrigger className="w-44 h-8 text-xs">
                        <SelectValue placeholder="Zahlungsstatus" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="offen">Offen</SelectItem>
                        <SelectItem value="anzahlung">Anzahlung geleistet</SelectItem>
                        <SelectItem value="bezahlt">Vollständig bezahlt</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Total summary */}
          {eventBookings.length > 0 && (
            <div className="rounded-xl border bg-secondary/50 p-4 flex items-center justify-between">
              <span className="font-medium text-sm">Gesamtbuchungen</span>
              <span className="font-bold text-base">{formatCurrency(totalBooked)}</span>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setCurrentStep(2)}>
              Zurück
            </Button>
            <Button onClick={() => setCurrentStep(4)} className="flex-1 sm:flex-none">
              Weiter zum Abschluss
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Event abschliessen */}
      {currentStep === 4 && selectedEvent && (
        <div className="space-y-4">
          {finalized ? (
            /* Success state */
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center">
                <IconCircleCheck size={32} className="text-green-600" stroke={1.5} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">Event erfolgreich abgeschlossen!</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  "{selectedEvent.fields.event_name}" wurde als abgeschlossen markiert.
                </p>
              </div>
              <a href="#/eventplanung">
                <Button variant="outline">Zurück zur Übersicht</Button>
              </a>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-lg font-semibold">Event abschliessen</h2>
                <p className="text-sm text-muted-foreground">Bitte überprüfe die Zusammenfassung und schliesse das Event ab.</p>
              </div>

              {/* Event details card */}
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Event-Details</h3>
                <div className="space-y-1">
                  <p className="font-bold text-base">{selectedEvent.fields.event_name ?? '—'}</p>
                  {selectedEvent.fields.event_datum && (
                    <p className="text-sm text-muted-foreground">{formatEventDate(selectedEvent.fields.event_datum)}</p>
                  )}
                  {selectedEvent.fields.event_location_name && (
                    <p className="text-sm text-muted-foreground">{selectedEvent.fields.event_location_name}</p>
                  )}
                </div>
              </div>

              {/* RSVP summary */}
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">RSVP-Zusammenfassung</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Eingeladen</span>
                    <span className="font-semibold">{rsvpStats.total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Zugesagt</span>
                    <span className="font-semibold text-green-600">{rsvpStats.zugesagt}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Abgesagt</span>
                    <span className="font-semibold text-red-600">{rsvpStats.abgesagt}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ausstehend</span>
                    <span className="font-semibold text-amber-600">{rsvpStats.ausstehend}</span>
                  </div>
                </div>
              </div>

              {/* Budget summary */}
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Budget-Zusammenfassung</h3>
                <BudgetTracker
                  budget={selectedEvent.fields.event_budget ?? 0}
                  booked={totalBooked}
                />
              </div>

              {/* Unpaid vendors warning */}
              {unpaidBookings.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <IconAlertTriangle size={18} className="text-amber-600 shrink-0" stroke={2} />
                    <p className="font-semibold text-sm text-amber-800">
                      {unpaidBookings.length} Buchung{unpaidBookings.length !== 1 ? 'en' : ''} noch nicht vollständig bezahlt
                    </p>
                  </div>
                  <ul className="space-y-1">
                    {unpaidBookings.map(b => (
                      <li key={b.record_id} className="flex items-center justify-between text-sm text-amber-700">
                        <span className="truncate min-w-0">{getVendorName(b)}</span>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <StatusBadge
                            statusKey={b.fields.buchung_zahlungsstatus?.key}
                            label={b.fields.buchung_zahlungsstatus?.label}
                          />
                          <span className="font-semibold">{formatCurrency(b.fields.buchung_preis ?? 0)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Error message */}
              {finalizeError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {finalizeError}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setCurrentStep(3)} disabled={saving}>
                  Zurück
                </Button>
                <Button
                  onClick={handleFinalizeEvent}
                  disabled={saving}
                  className="flex-1 sm:flex-none gap-2"
                >
                  {saving ? (
                    <>
                      <IconLoader2 size={16} className="animate-spin" stroke={2} />
                      Wird abgeschlossen...
                    </>
                  ) : (
                    <>
                      <IconCircleCheck size={16} stroke={2} />
                      Event abschliessen
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </IntentWizardShell>
  );
}
