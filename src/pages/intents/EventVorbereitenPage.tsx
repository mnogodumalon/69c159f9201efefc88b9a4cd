import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { IntentWizardShell } from '@/components/IntentWizardShell';
import { EntitySelectStep } from '@/components/EntitySelectStep';
import { BudgetTracker } from '@/components/BudgetTracker';
import { StatusBadge } from '@/components/StatusBadge';
import { GaesteverzeichnisDialog } from '@/components/dialogs/GaesteverzeichnisDialog';
import { DienstleisterbuchungenDialog } from '@/components/dialogs/DienstleisterbuchungenDialog';
import { DienstleisterverzeichnisDialog } from '@/components/dialogs/DienstleisterverzeichnisDialog';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { APP_IDS } from '@/types/app';
import type { Eventplanung, Gaesteverzeichnis, Dienstleisterverzeichnis, Dienstleisterbuchungen, EinladungenRsvp } from '@/types/app';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import {
  IconCalendar,
  IconMapPin,
  IconUsers,
  IconPlus,
  IconCheck,
  IconBuildingStore,
  IconArrowLeft,
  IconSend,
  IconCurrencyEuro,
  IconLoader2,
} from '@tabler/icons-react';

const WIZARD_STEPS = [
  { label: 'Event wählen' },
  { label: 'Gäste einladen' },
  { label: 'Dienstleister buchen' },
  { label: 'Zusammenfassung' },
];

export default function EventVorbereitenPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // All state BEFORE any early returns
  const [currentStep, setCurrentStep] = useState<number>(() => {
    const urlStep = parseInt(searchParams.get('step') ?? '', 10);
    const urlEventId = searchParams.get('eventId');
    if (urlEventId && urlStep >= 2 && urlStep <= 4) return urlStep;
    if (urlEventId) return 2;
    return 1;
  });

  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    () => searchParams.get('eventId')
  );

  const [selectedGuestIds, setSelectedGuestIds] = useState<Set<string>>(new Set());
  const [sendingInvitations, setSendingInvitations] = useState(false);

  const [guestDialogOpen, setGuestDialogOpen] = useState(false);
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [bookingForProviderId, setBookingForProviderId] = useState<string | null>(null);

  const {
    eventplanung,
    gaesteverzeichnis,
    dienstleisterverzeichnis,
    einladungenRsvp,
    dienstleisterbuchungen,
    loading,
    error,
    fetchAll,
  } = useDashboardData();

  // Sync eventId and step to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (selectedEventId) {
      params.set('eventId', selectedEventId);
    } else {
      params.delete('eventId');
    }
    if (currentStep > 1) {
      params.set('step', String(currentStep));
    } else {
      params.delete('step');
    }
    setSearchParams(params, { replace: true });
  }, [selectedEventId, currentStep, setSearchParams, searchParams]);

  // Derived data
  const selectedEvent = useMemo<Eventplanung | undefined>(
    () => eventplanung.find(e => e.record_id === selectedEventId),
    [eventplanung, selectedEventId]
  );

  const eventInvitations = useMemo<EinladungenRsvp[]>(() => {
    if (!selectedEventId) return [];
    return einladungenRsvp.filter(inv => {
      const id = extractRecordId(inv.fields.einladung_event);
      return id === selectedEventId;
    });
  }, [einladungenRsvp, selectedEventId]);

  const alreadyInvitedGuestIds = useMemo<Set<string>>(() => {
    const ids = new Set<string>();
    eventInvitations.forEach(inv => {
      const id = extractRecordId(inv.fields.einladung_gast);
      if (id) ids.add(id);
    });
    return ids;
  }, [eventInvitations]);

  const eventBookings = useMemo<Dienstleisterbuchungen[]>(() => {
    if (!selectedEventId) return [];
    return dienstleisterbuchungen.filter(b => {
      const id = extractRecordId(b.fields.buchung_event);
      return id === selectedEventId;
    });
  }, [dienstleisterbuchungen, selectedEventId]);

  const totalBooked = useMemo<number>(
    () => eventBookings.reduce((sum, b) => sum + (b.fields.buchung_preis ?? 0), 0),
    [eventBookings]
  );

  const bookedProviderIds = useMemo<Set<string>>(() => {
    const ids = new Set<string>();
    eventBookings.forEach(b => {
      const id = extractRecordId(b.fields.buchung_dienstleister);
      if (id) ids.add(id);
    });
    return ids;
  }, [eventBookings]);

  // Handlers
  function handleSelectEvent(id: string) {
    setSelectedEventId(id);
    setSelectedGuestIds(new Set());
    setCurrentStep(2);
  }

  function toggleGuestSelection(guestId: string) {
    if (alreadyInvitedGuestIds.has(guestId)) return;
    setSelectedGuestIds(prev => {
      const next = new Set(prev);
      if (next.has(guestId)) {
        next.delete(guestId);
      } else {
        next.add(guestId);
      }
      return next;
    });
  }

  async function handleSendInvitations() {
    if (!selectedEventId || selectedGuestIds.size === 0) return;
    setSendingInvitations(true);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const creates = Array.from(selectedGuestIds).map(guestId =>
        LivingAppsService.createEinladungenRsvpEntry({
          einladung_event: createRecordUrl(APP_IDS.EVENTPLANUNG, selectedEventId),
          einladung_gast: createRecordUrl(APP_IDS.GAESTEVERZEICHNIS, guestId),
          einladung_datum: today,
          rsvp_status: 'ausstehend',
        })
      );
      await Promise.all(creates);
      await fetchAll();
      setSelectedGuestIds(new Set());
      setCurrentStep(3);
    } finally {
      setSendingInvitations(false);
    }
  }

  function handleOpenBookingForProvider(providerId: string) {
    setBookingForProviderId(providerId);
    setBookingDialogOpen(true);
  }

  async function handleCreateGuest(fields: Gaesteverzeichnis['fields']) {
    await LivingAppsService.createGaesteverzeichni(fields);
    await fetchAll();
  }

  async function handleCreateProvider(fields: Dienstleisterverzeichnis['fields']) {
    await LivingAppsService.createDienstleisterverzeichni(fields);
    await fetchAll();
  }

  async function handleCreateBooking(fields: Dienstleisterbuchungen['fields']) {
    await LivingAppsService.createDienstleisterbuchungenEntry(fields);
    await fetchAll();
    setBookingDialogOpen(false);
    setBookingForProviderId(null);
  }

  // RSVP breakdown
  const rsvpBreakdown = useMemo(() => {
    const zugesagt = eventInvitations.filter(i => {
      const key = typeof i.fields.rsvp_status === 'object' && i.fields.rsvp_status
        ? (i.fields.rsvp_status as { key: string }).key
        : i.fields.rsvp_status;
      return key === 'zugesagt';
    }).length;
    const abgesagt = eventInvitations.filter(i => {
      const key = typeof i.fields.rsvp_status === 'object' && i.fields.rsvp_status
        ? (i.fields.rsvp_status as { key: string }).key
        : i.fields.rsvp_status;
      return key === 'abgesagt';
    }).length;
    const ausstehend = eventInvitations.filter(i => {
      const key = typeof i.fields.rsvp_status === 'object' && i.fields.rsvp_status
        ? (i.fields.rsvp_status as { key: string }).key
        : i.fields.rsvp_status;
      return key === 'ausstehend' || !key;
    }).length;
    return { zugesagt, abgesagt, ausstehend };
  }, [eventInvitations]);

  // Booking default values when opening dialog for a specific provider
  const bookingDefaultValues = useMemo(() => {
    if (!bookingForProviderId || !selectedEventId) return undefined;
    return {
      buchung_event: createRecordUrl(APP_IDS.EVENTPLANUNG, selectedEventId),
      buchung_dienstleister: createRecordUrl(APP_IDS.DIENSTLEISTERVERZEICHNIS, bookingForProviderId),
    };
  }, [bookingForProviderId, selectedEventId]);

  const newGuestDialogNode = (
    <GaesteverzeichnisDialog
      open={guestDialogOpen}
      onClose={() => setGuestDialogOpen(false)}
      onSubmit={handleCreateGuest}
    />
  );

  const newProviderDialogNode = (
    <DienstleisterverzeichnisDialog
      open={providerDialogOpen}
      onClose={() => setProviderDialogOpen(false)}
      onSubmit={handleCreateProvider}
    />
  );

  const bookingDialogNode = (
    <DienstleisterbuchungenDialog
      open={bookingDialogOpen}
      onClose={() => { setBookingDialogOpen(false); setBookingForProviderId(null); }}
      onSubmit={handleCreateBooking}
      defaultValues={bookingDefaultValues}
      eventplanungList={eventplanung}
      dienstleisterverzeichnisList={dienstleisterverzeichnis}
    />
  );

  return (
    <IntentWizardShell
      title="Event vorbereiten"
      subtitle="Gaste einladen und Dienstleister buchen"
      steps={WIZARD_STEPS}
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Select Event */}
      {currentStep === 1 && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <h2 className="font-semibold text-base mb-1">Event auswahlen</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Wahlen Sie das Event aus, das Sie vorbereiten mochten.
            </p>
            <EntitySelectStep
              items={eventplanung.map(e => ({
                id: e.record_id,
                title: e.fields.event_name ?? '(kein Name)',
                subtitle: [
                  e.fields.event_datum ? formatDate(e.fields.event_datum) : null,
                  e.fields.event_location_name,
                ].filter(Boolean).join(' · '),
                status: e.fields.event_status
                  ? { key: (e.fields.event_status as { key: string }).key, label: (e.fields.event_status as { label: string }).label }
                  : undefined,
                stats: [
                  ...(e.fields.event_gaestezahl != null
                    ? [{ label: 'Gaste', value: e.fields.event_gaestezahl }]
                    : []),
                  ...(e.fields.event_budget != null
                    ? [{ label: 'Budget', value: formatCurrency(e.fields.event_budget) }]
                    : []),
                ],
                icon: <IconCalendar size={18} className="text-primary" stroke={1.5} />,
              }))}
              onSelect={handleSelectEvent}
              searchPlaceholder="Event suchen..."
              emptyIcon={<IconCalendar size={32} />}
              emptyText="Keine Events gefunden."
            />
          </div>
        </div>
      )}

      {/* Step 2: Invite Guests */}
      {currentStep === 2 && selectedEvent && (
        <div className="space-y-4">
          {/* Event Info Card */}
          <div className="rounded-xl border bg-card p-4 overflow-hidden">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <IconCalendar size={18} className="text-primary" stroke={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-base truncate">{selectedEvent.fields.event_name}</h2>
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
                      <span className="truncate max-w-[200px]">{selectedEvent.fields.event_location_name}</span>
                    </span>
                  )}
                </div>
              </div>
              {selectedEvent.fields.event_status && (
                <StatusBadge statusKey={(selectedEvent.fields.event_status as { key: string }).key} label={(selectedEvent.fields.event_status as { label?: string }).label} />
              )}
            </div>
          </div>

          {/* Guest count summary */}
          <div className="flex items-center gap-3 px-1">
            <div className="flex items-center gap-2 text-sm">
              <IconUsers size={16} className="text-muted-foreground" stroke={1.5} />
              <span className="text-muted-foreground">Bereits eingeladen:</span>
              <span className="font-semibold">{alreadyInvitedGuestIds.size}</span>
            </div>
            {selectedGuestIds.size > 0 && (
              <span className="text-sm font-medium text-primary">
                + {selectedGuestIds.size} neu ausgewahlt
              </span>
            )}
          </div>

          {/* Counter */}
          <div className="rounded-xl border bg-muted/30 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {selectedGuestIds.size} von {gaesteverzeichnis.length - alreadyInvitedGuestIds.size} verfugbaren Gasten ausgewahlt
            </span>
            <span className="text-xs text-muted-foreground">
              {gaesteverzeichnis.length} Gaste gesamt
            </span>
          </div>

          {/* Guest list with checkboxes */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="p-3 border-b bg-muted/20 flex items-center justify-between">
              <h3 className="text-sm font-medium">Gasteverzeichnis</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setGuestDialogOpen(true)}
                className="gap-1.5"
              >
                <IconPlus size={14} stroke={1.5} />
                Neuen Gast erstellen
              </Button>
            </div>
            {newGuestDialogNode}
            <div className="divide-y max-h-80 overflow-y-auto">
              {gaesteverzeichnis.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  Noch keine Gaste vorhanden.
                </div>
              ) : (
                gaesteverzeichnis.map(guest => {
                  const isInvited = alreadyInvitedGuestIds.has(guest.record_id);
                  const isSelected = selectedGuestIds.has(guest.record_id);
                  const fullName = [guest.fields.vorname, guest.fields.nachname].filter(Boolean).join(' ') || '(kein Name)';
                  return (
                    <button
                      key={guest.record_id}
                      onClick={() => toggleGuestSelection(guest.record_id)}
                      disabled={isInvited}
                      className={`w-full text-left flex items-center gap-3 px-4 py-3 transition-colors ${
                        isInvited
                          ? 'opacity-50 cursor-not-allowed bg-muted/20'
                          : isSelected
                          ? 'bg-primary/5 border-l-2 border-l-primary'
                          : 'hover:bg-accent'
                      }`}
                    >
                      {/* Checkbox indicator */}
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isInvited
                          ? 'bg-muted border-muted-foreground/30'
                          : isSelected
                          ? 'bg-primary border-primary'
                          : 'border-border'
                      }`}>
                        {(isInvited || isSelected) && (
                          <IconCheck size={12} stroke={2.5} className="text-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{fullName}</span>
                          {isInvited && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full shrink-0">
                              Eingeladen
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                          {guest.fields.firma && <span className="truncate">{guest.fields.firma}</span>}
                          {guest.fields.email && <span className="truncate">{guest.fields.email}</span>}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-3 pt-2">
            <Button variant="outline" onClick={() => setCurrentStep(1)} className="gap-1.5">
              <IconArrowLeft size={15} stroke={1.5} />
              Zuruck
            </Button>
            <div className="flex-1" />
            <Button
              variant="outline"
              onClick={() => setCurrentStep(3)}
            >
              Uberspringen
            </Button>
            <Button
              onClick={handleSendInvitations}
              disabled={selectedGuestIds.size === 0 || sendingInvitations}
              className="gap-1.5"
            >
              {sendingInvitations ? (
                <IconLoader2 size={15} stroke={1.5} className="animate-spin" />
              ) : (
                <IconSend size={15} stroke={1.5} />
              )}
              {sendingInvitations
                ? 'Sende...'
                : `${selectedGuestIds.size} Einladung${selectedGuestIds.size !== 1 ? 'en' : ''} senden`}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Book Service Providers */}
      {currentStep === 3 && selectedEvent && (
        <div className="space-y-4">
          {/* Event Info */}
          <div className="rounded-xl border bg-card p-4 overflow-hidden">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <IconCalendar size={18} className="text-primary" stroke={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-base truncate">{selectedEvent.fields.event_name}</h2>
                {selectedEvent.fields.event_datum && (
                  <p className="text-xs text-muted-foreground mt-0.5">{formatDate(selectedEvent.fields.event_datum)}</p>
                )}
              </div>
            </div>
          </div>

          {/* Budget Tracker */}
          <BudgetTracker
            budget={selectedEvent.fields.event_budget ?? 0}
            booked={totalBooked}
            label="Eventbudget"
          />

          {/* Already booked summary */}
          {eventBookings.length > 0 && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="p-3 border-b bg-muted/20">
                <h3 className="text-sm font-medium">Bereits gebucht ({eventBookings.length})</h3>
              </div>
              <div className="divide-y">
                {eventBookings.map(booking => {
                  const provider = dienstleisterverzeichnis.find(
                    p => p.record_id === extractRecordId(booking.fields.buchung_dienstleister)
                  );
                  return (
                    <div key={booking.record_id} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                        <IconCheck size={14} stroke={2} className="text-emerald-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {provider?.fields.dl_firmenname ?? 'Unbekannter Dienstleister'}
                        </p>
                        {booking.fields.buchung_leistung && (
                          <p className="text-xs text-muted-foreground truncate">{booking.fields.buchung_leistung}</p>
                        )}
                      </div>
                      {booking.fields.buchung_preis != null && (
                        <span className="text-sm font-semibold shrink-0">
                          {formatCurrency(booking.fields.buchung_preis)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Provider list */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="p-3 border-b bg-muted/20 flex items-center justify-between">
              <h3 className="text-sm font-medium">Dienstleisterverzeichnis</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setProviderDialogOpen(true)}
                className="gap-1.5"
              >
                <IconPlus size={14} stroke={1.5} />
                Neuer Dienstleister
              </Button>
            </div>
            {newProviderDialogNode}
            {bookingDialogNode}
            <div className="divide-y max-h-96 overflow-y-auto">
              {dienstleisterverzeichnis.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  Noch keine Dienstleister vorhanden.
                </div>
              ) : (
                dienstleisterverzeichnis.map(provider => {
                  const isBooked = bookedProviderIds.has(provider.record_id);
                  const kategorie = provider.fields.dl_kategorie
                    ? (provider.fields.dl_kategorie as { label: string }).label
                    : null;
                  return (
                    <div
                      key={provider.record_id}
                      className={`flex items-center gap-3 px-4 py-3 ${isBooked ? 'bg-muted/20' : ''}`}
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isBooked ? 'bg-emerald-100' : 'bg-primary/10'
                      }`}>
                        {isBooked
                          ? <IconCheck size={16} stroke={2} className="text-emerald-700" />
                          : <IconBuildingStore size={16} stroke={1.5} className="text-primary" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {provider.fields.dl_firmenname ?? '(kein Name)'}
                        </p>
                        <div className="flex gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                          {kategorie && <span>{kategorie}</span>}
                          {provider.fields.dl_email && <span className="truncate">{provider.fields.dl_email}</span>}
                        </div>
                      </div>
                      {isBooked ? (
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full shrink-0 font-medium">
                          Gebucht
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenBookingForProvider(provider.record_id)}
                          className="shrink-0 gap-1"
                        >
                          <IconCurrencyEuro size={13} stroke={1.5} />
                          Buchen
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-3 pt-2">
            <Button variant="outline" onClick={() => setCurrentStep(2)} className="gap-1.5">
              <IconArrowLeft size={15} stroke={1.5} />
              Zuruck
            </Button>
            <div className="flex-1" />
            <Button onClick={() => setCurrentStep(4)}>
              Weiter zur Zusammenfassung
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Summary */}
      {currentStep === 4 && selectedEvent && (
        <div className="space-y-4">
          {/* Event summary card */}
          <div className="rounded-xl border bg-card p-4 overflow-hidden">
            <h2 className="font-semibold text-base mb-3">Event-Ubersicht</h2>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <IconCalendar size={15} stroke={1.5} className="text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{selectedEvent.fields.event_name}</p>
                  {selectedEvent.fields.event_datum && (
                    <p className="text-xs text-muted-foreground">{formatDate(selectedEvent.fields.event_datum)}</p>
                  )}
                </div>
                {selectedEvent.fields.event_status && (
                  <div className="ml-auto shrink-0">
                    <StatusBadge statusKey={(selectedEvent.fields.event_status as { key: string }).key} label={(selectedEvent.fields.event_status as { label?: string }).label} />
                  </div>
                )}
              </div>
              {selectedEvent.fields.event_location_name && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <IconMapPin size={15} stroke={1.5} className="shrink-0" />
                  <span className="truncate">{selectedEvent.fields.event_location_name}</span>
                </div>
              )}
            </div>
          </div>

          {/* Guest stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <IconUsers size={16} stroke={1.5} className="text-muted-foreground" />
                <h3 className="text-sm font-semibold">Einladungen</h3>
              </div>
              <p className="text-2xl font-bold">{eventInvitations.length}</p>
              <p className="text-xs text-muted-foreground mb-3">Einladungen versendet</p>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                    Zugesagt
                  </span>
                  <span className="font-semibold">{rsvpBreakdown.zugesagt}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
                    Ausstehend
                  </span>
                  <span className="font-semibold">{rsvpBreakdown.ausstehend}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                    Abgesagt
                  </span>
                  <span className="font-semibold">{rsvpBreakdown.abgesagt}</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <IconBuildingStore size={16} stroke={1.5} className="text-muted-foreground" />
                <h3 className="text-sm font-semibold">Dienstleister</h3>
              </div>
              <p className="text-2xl font-bold">{eventBookings.length}</p>
              <p className="text-xs text-muted-foreground mb-3">Buchungen gesamt</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Gesamtkosten</span>
                  <span className="font-semibold">{formatCurrency(totalBooked)}</span>
                </div>
                {selectedEvent.fields.event_budget != null && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Budget</span>
                    <span className="font-semibold">{formatCurrency(selectedEvent.fields.event_budget)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Budget tracker */}
          <BudgetTracker
            budget={selectedEvent.fields.event_budget ?? 0}
            booked={totalBooked}
            label="Budget-Ubersicht"
          />

          {/* Booked providers list */}
          {eventBookings.length > 0 && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="p-3 border-b bg-muted/20">
                <h3 className="text-sm font-medium">Gebuchte Dienstleister</h3>
              </div>
              <div className="divide-y overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/10">
                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Dienstleister</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">Leistung</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Preis</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {eventBookings.map(booking => {
                      const provider = dienstleisterverzeichnis.find(
                        p => p.record_id === extractRecordId(booking.fields.buchung_dienstleister)
                      );
                      return (
                        <tr key={booking.record_id}>
                          <td className="px-4 py-3">
                            <p className="font-medium truncate max-w-[160px]">
                              {provider?.fields.dl_firmenname ?? '—'}
                            </p>
                            {provider?.fields.dl_kategorie && (
                              <p className="text-xs text-muted-foreground">
                                {(provider.fields.dl_kategorie as { label: string }).label}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs hidden sm:table-cell">
                            <span className="line-clamp-2">{booking.fields.buchung_leistung ?? '—'}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {formatCurrency(booking.fields.buchung_preis)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center gap-3 pt-2">
            <Button variant="outline" onClick={() => setCurrentStep(3)} className="gap-1.5">
              <IconArrowLeft size={15} stroke={1.5} />
              Weitere Buchung
            </Button>
            <div className="flex-1" />
            <Button onClick={() => navigate('/')}>
              Fertig
            </Button>
          </div>
        </div>
      )}

      {/* Fallback: step 2/3/4 but no event selected */}
      {currentStep > 1 && !selectedEvent && (
        <div className="text-center py-12 space-y-3">
          <p className="text-sm text-muted-foreground">Kein Event ausgewahlt.</p>
          <Button variant="outline" onClick={() => setCurrentStep(1)}>
            Zuruck zu Event-Auswahl
          </Button>
        </div>
      )}
    </IntentWizardShell>
  );
}
