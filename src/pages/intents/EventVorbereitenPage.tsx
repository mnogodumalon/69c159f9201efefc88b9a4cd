import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import type { Eventplanung, Gaesteverzeichnis, Dienstleisterverzeichnis } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/IntentWizardShell';
import { EntitySelectStep } from '@/components/EntitySelectStep';
import { BudgetTracker } from '@/components/BudgetTracker';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { EventplanungDialog } from '@/components/dialogs/EventplanungDialog';
import { GaesteverzeichnisDialog } from '@/components/dialogs/GaesteverzeichnisDialog';
import { DienstleisterbuchungenDialog } from '@/components/dialogs/DienstleisterbuchungenDialog';
import { DienstleisterverzeichnisDialog } from '@/components/dialogs/DienstleisterverzeichnisDialog';
import { IconUserPlus, IconBuildingStore, IconCheck, IconChevronRight, IconLoader2, IconCalendarEvent, IconUsers, IconCurrencyEuro } from '@tabler/icons-react';

const WIZARD_STEPS = [
  { label: 'Event wählen' },
  { label: 'Gäste einladen' },
  { label: 'Dienstleister buchen' },
  { label: 'Zusammenfassung' },
];

export default function EventVorbereitenPage() {
  const [searchParams, setSearchParams] = useSearchParams();

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

  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState<Eventplanung | null>(null);

  // Step 2: Guest invitation state
  const [checkedGuests, setCheckedGuests] = useState<Set<string>>(new Set());
  const [sendingInvitations, setSendingInvitations] = useState(false);
  const [invitationResult, setInvitationResult] = useState<{ sent: number; skipped: number } | null>(null);

  // Dialog open states
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [guestDialogOpen, setGuestDialogOpen] = useState(false);
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [bookingDefaultValues, setBookingDefaultValues] = useState<{ buchung_event?: string; buchung_dienstleister?: string } | undefined>(undefined);

  // Deep-link: read ?eventId and ?step from URL on mount
  useEffect(() => {
    const eventId = searchParams.get('eventId');
    const stepParam = parseInt(searchParams.get('step') ?? '', 10);

    if (eventId && eventplanung.length > 0) {
      const found = eventplanung.find(e => e.record_id === eventId);
      if (found) {
        setSelectedEvent(found);
        if (stepParam >= 2 && stepParam <= 4) {
          setCurrentStep(stepParam);
        } else {
          setCurrentStep(2);
        }
      }
    } else if (stepParam >= 1 && stepParam <= 4) {
      setCurrentStep(stepParam);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventplanung]);

  // Sync step and eventId to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (currentStep > 1) {
      params.set('step', String(currentStep));
    } else {
      params.delete('step');
    }
    if (selectedEvent) {
      params.set('eventId', selectedEvent.record_id);
    } else {
      params.delete('eventId');
    }
    setSearchParams(params, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, selectedEvent]);

  // Initialize checked guests when entering step 2
  useEffect(() => {
    if (currentStep === 2 && selectedEvent) {
      const alreadyInvited = new Set<string>();
      einladungenRsvp.forEach(inv => {
        const eventId = extractRecordId(inv.fields.einladung_event);
        if (eventId === selectedEvent.record_id) {
          const guestId = extractRecordId(inv.fields.einladung_gast);
          if (guestId) alreadyInvited.add(guestId);
        }
      });
      setCheckedGuests(alreadyInvited);
      setInvitationResult(null);
    }
  }, [currentStep, selectedEvent, einladungenRsvp]);

  // Derived data
  const invitationsForEvent = selectedEvent
    ? einladungenRsvp.filter(inv => extractRecordId(inv.fields.einladung_event) === selectedEvent.record_id)
    : [];

  const alreadyInvitedGuestIds = new Set(
    invitationsForEvent.map(inv => extractRecordId(inv.fields.einladung_gast)).filter(Boolean) as string[]
  );

  const bookingsForEvent = selectedEvent
    ? dienstleisterbuchungen.filter(b => extractRecordId(b.fields.buchung_event) === selectedEvent.record_id)
    : [];

  const totalBookedCost = bookingsForEvent.reduce((sum, b) => sum + (b.fields.buchung_preis ?? 0), 0);

  // Vendor grouping by category
  const vendorsByCategory = dienstleisterverzeichnis.reduce<Record<string, Dienstleisterverzeichnis[]>>((acc, vendor) => {
    const cat = vendor.fields.dl_kategorie?.label ?? 'Sonstiges';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(vendor);
    return acc;
  }, {});

  // Step 2 handlers
  const handleToggleGuest = (guestId: string) => {
    setCheckedGuests(prev => {
      const next = new Set(prev);
      if (next.has(guestId)) {
        // Only allow unchecking guests not yet invited (already-invited ones stay checked)
        if (!alreadyInvitedGuestIds.has(guestId)) {
          next.delete(guestId);
        }
      } else {
        next.add(guestId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setCheckedGuests(new Set(gaesteverzeichnis.map(g => g.record_id)));
  };

  const handleDeselectAll = () => {
    // Keep already-invited guests checked
    setCheckedGuests(new Set(alreadyInvitedGuestIds));
  };

  const newInvitationCount = [...checkedGuests].filter(id => !alreadyInvitedGuestIds.has(id)).length;

  const handleSendInvitations = async () => {
    if (!selectedEvent) return;
    setSendingInvitations(true);
    const guestsToInvite = [...checkedGuests].filter(id => !alreadyInvitedGuestIds.has(id));
    let sent = 0;
    const today = format(new Date(), 'yyyy-MM-dd');

    for (const guestId of guestsToInvite) {
      try {
        await LivingAppsService.createEinladungenRsvpEntry({
          einladung_event: createRecordUrl(APP_IDS.EVENTPLANUNG, selectedEvent.record_id),
          einladung_gast: createRecordUrl(APP_IDS.GAESTEVERZEICHNIS, guestId),
          einladung_datum: today,
          rsvp_status: 'ausstehend',
        });
        sent++;
      } catch (err) {
        console.error('Fehler beim Erstellen der Einladung:', err);
      }
    }

    await fetchAll();
    setSendingInvitations(false);
    setInvitationResult({ sent, skipped: guestsToInvite.length - sent });
  };

  const handleSelectEvent = (id: string) => {
    const event = eventplanung.find(e => e.record_id === id);
    if (event) {
      setSelectedEvent(event);
      setCurrentStep(2);
    }
  };

  const formatEventDate = (datum?: string) => {
    if (!datum) return '';
    try {
      return format(new Date(datum), 'dd.MM.yyyy HH:mm', { locale: de });
    } catch {
      return datum;
    }
  };

  // RSVP status counts for summary
  const rsvpCounts = {
    total: invitationsForEvent.length,
    zugesagt: invitationsForEvent.filter(i => i.fields.rsvp_status?.key === 'zugesagt').length,
    abgesagt: invitationsForEvent.filter(i => i.fields.rsvp_status?.key === 'abgesagt').length,
    ausstehend: invitationsForEvent.filter(i => i.fields.rsvp_status?.key === 'ausstehend').length,
    vielleicht: invitationsForEvent.filter(i => i.fields.rsvp_status?.key === 'vielleicht').length,
  };

  return (
    <IntentWizardShell
      title="Event vorbereiten"
      subtitle="Schritt-fur-Schritt zum perfekten Event"
      steps={WIZARD_STEPS}
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* STEP 1: Event wählen */}
      {currentStep === 1 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Event auswählen</h2>
            <p className="text-sm text-muted-foreground mt-1">Wähle das Event aus, das du vorbereiten möchtest.</p>
          </div>

          <EntitySelectStep
            items={eventplanung.map(e => ({
              id: e.record_id,
              title: e.fields.event_name ?? 'Unbekannt',
              subtitle: e.fields.event_datum
                ? formatEventDate(e.fields.event_datum) + (e.fields.event_location_name ? ' • ' + e.fields.event_location_name : '')
                : (e.fields.event_location_name ?? ''),
              status: e.fields.event_status
                ? { key: e.fields.event_status.key, label: e.fields.event_status.label }
                : undefined,
              stats: [
                {
                  label: 'Budget',
                  value: e.fields.event_budget ? '€' + e.fields.event_budget.toLocaleString('de-DE') : '–',
                },
                {
                  label: 'Gäste geplant',
                  value: String(e.fields.event_gaestezahl ?? '–'),
                },
              ],
              icon: <IconCalendarEvent size={20} className="text-primary" />,
            }))}
            onSelect={handleSelectEvent}
            searchPlaceholder="Event suchen..."
            emptyText="Noch keine Events vorhanden."
            createLabel="Neues Event erstellen"
            onCreateNew={() => setEventDialogOpen(true)}
            createDialog={
              <EventplanungDialog
                open={eventDialogOpen}
                onClose={() => setEventDialogOpen(false)}
                onSubmit={async (fields) => {
                  await LivingAppsService.createEventplanungEntry(fields);
                  await fetchAll();
                }}
              />
            }
          />
        </div>
      )}

      {/* STEP 2: Gäste einladen */}
      {currentStep === 2 && selectedEvent && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold">Gäste einladen</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Event: <span className="font-medium text-foreground">{selectedEvent.fields.event_name}</span>
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setCurrentStep(1)}>
              Event wechseln
            </Button>
          </div>

          {/* Guest count counter */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-2 text-sm">
              <IconUsers size={16} className="text-primary" />
              <span className="font-medium">
                {newInvitationCount > 0
                  ? `${newInvitationCount} ${newInvitationCount === 1 ? 'Gast wird' : 'Gäste werden'} eingeladen`
                  : 'Keine neuen Einladungen ausgewählt'}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleSelectAll} className="text-xs h-7">
                Alle auswählen
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDeselectAll} className="text-xs h-7">
                Alle abwählen
              </Button>
            </div>
          </div>

          {/* Guest list */}
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {gaesteverzeichnis.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <p className="text-sm">Noch keine Gäste im Verzeichnis.</p>
              </div>
            ) : (
              gaesteverzeichnis.map((guest: Gaesteverzeichnis) => {
                const isAlreadyInvited = alreadyInvitedGuestIds.has(guest.record_id);
                const isChecked = checkedGuests.has(guest.record_id);
                const invitation = isAlreadyInvited
                  ? invitationsForEvent.find(inv => extractRecordId(inv.fields.einladung_gast) === guest.record_id)
                  : null;
                const fullName = [guest.fields.vorname, guest.fields.nachname].filter(Boolean).join(' ') || 'Unbekannt';

                return (
                  <div
                    key={guest.record_id}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                      isChecked ? 'bg-primary/5 border-primary/30' : 'bg-card border-border'
                    }`}
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => handleToggleGuest(guest.record_id)}
                      disabled={isAlreadyInvited}
                      className="shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{fullName}</span>
                        {isAlreadyInvited && invitation && (
                          <StatusBadge
                            statusKey={invitation.fields.rsvp_status?.key}
                            label={invitation.fields.rsvp_status?.label}
                          />
                        )}
                        {isAlreadyInvited && !invitation?.fields.rsvp_status && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                            Eingeladen
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                        {guest.fields.firma && <span>{guest.fields.firma}</span>}
                        {guest.fields.email && <span className="truncate">{guest.fields.email}</span>}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Add new guest button */}
          <div className="flex items-center gap-2 pt-1">
            <Button variant="outline" onClick={() => setGuestDialogOpen(true)} className="gap-2">
              <IconUserPlus size={16} />
              Neuen Gast erstellen
            </Button>
          </div>

          <GaesteverzeichnisDialog
            open={guestDialogOpen}
            onClose={() => setGuestDialogOpen(false)}
            onSubmit={async (fields) => {
              await LivingAppsService.createGaesteverzeichni(fields);
              await fetchAll();
            }}
          />

          {/* Invitation result feedback */}
          {invitationResult && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm">
              <IconCheck size={16} className="shrink-0" />
              <span>
                {invitationResult.sent} {invitationResult.sent === 1 ? 'Einladung wurde' : 'Einladungen wurden'} erfolgreich versendet.
                {invitationResult.skipped > 0 && ` ${invitationResult.skipped} fehlgeschlagen.`}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 flex-wrap gap-3">
            <Button variant="outline" onClick={() => setCurrentStep(1)}>
              Zurück
            </Button>
            <div className="flex gap-2">
              {newInvitationCount > 0 && !invitationResult && (
                <Button
                  onClick={handleSendInvitations}
                  disabled={sendingInvitations}
                  className="gap-2"
                >
                  {sendingInvitations ? (
                    <>
                      <IconLoader2 size={16} className="animate-spin" />
                      Einladungen werden versendet...
                    </>
                  ) : (
                    <>
                      <IconUserPlus size={16} />
                      {newInvitationCount} {newInvitationCount === 1 ? 'Einladung senden' : 'Einladungen senden'}
                    </>
                  )}
                </Button>
              )}
              <Button
                variant={invitationResult || newInvitationCount === 0 ? 'default' : 'outline'}
                onClick={() => setCurrentStep(3)}
                className="gap-2"
              >
                Weiter zu Dienstleistern
                <IconChevronRight size={16} />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Dienstleister buchen */}
      {currentStep === 3 && selectedEvent && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold">Dienstleister buchen</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Event: <span className="font-medium text-foreground">{selectedEvent.fields.event_name}</span>
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setCurrentStep(1)}>
              Event wechseln
            </Button>
          </div>

          {/* Budget tracker */}
          <BudgetTracker
            budget={selectedEvent.fields.event_budget ?? 0}
            booked={totalBookedCost}
            label="Buchungsbudget"
          />

          {/* Vendor list by category */}
          {dienstleisterverzeichnis.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <p className="text-sm">Noch keine Dienstleister im Verzeichnis.</p>
            </div>
          ) : (
            Object.entries(vendorsByCategory).map(([category, vendors]) => (
              <div key={category} className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{category}</h3>
                {vendors.map((vendor: Dienstleisterverzeichnis) => {
                  const isBooked = bookingsForEvent.some(
                    b => extractRecordId(b.fields.buchung_dienstleister) === vendor.record_id
                  );
                  const booking = isBooked
                    ? bookingsForEvent.find(b => extractRecordId(b.fields.buchung_dienstleister) === vendor.record_id)
                    : null;
                  const contactName = [vendor.fields.dl_ansprechpartner_vorname, vendor.fields.dl_ansprechpartner_nachname]
                    .filter(Boolean)
                    .join(' ');

                  return (
                    <div
                      key={vendor.record_id}
                      className={`flex items-center gap-3 p-4 rounded-xl border overflow-hidden transition-colors ${
                        isBooked ? 'bg-green-50/50 border-green-200' : 'bg-card border-border'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <IconBuildingStore size={18} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">
                            {vendor.fields.dl_firmenname ?? 'Unbekannt'}
                          </span>
                          {vendor.fields.dl_kategorie && (
                            <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full font-medium shrink-0">
                              {vendor.fields.dl_kategorie.label}
                            </span>
                          )}
                          {isBooked && (
                            <StatusBadge
                              statusKey={booking?.fields.buchung_status?.key}
                              label={booking?.fields.buchung_status?.label ?? 'Gebucht'}
                            />
                          )}
                        </div>
                        <div className="flex gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                          {contactName && <span>{contactName}</span>}
                          {vendor.fields.dl_email && <span className="truncate">{vendor.fields.dl_email}</span>}
                          {vendor.fields.dl_telefon && <span>{vendor.fields.dl_telefon}</span>}
                          {isBooked && booking?.fields.buchung_preis != null && (
                            <span className="text-foreground font-medium">
                              €{booking.fields.buchung_preis.toLocaleString('de-DE')}
                            </span>
                          )}
                        </div>
                      </div>
                      {!isBooked && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          onClick={() => {
                            setBookingDefaultValues({
                              buchung_event: createRecordUrl(APP_IDS.EVENTPLANUNG, selectedEvent.record_id),
                              buchung_dienstleister: createRecordUrl(APP_IDS.DIENSTLEISTERVERZEICHNIS, vendor.record_id),
                            });
                            setBookingDialogOpen(true);
                          }}
                        >
                          Buchen
                        </Button>
                      )}
                      {isBooked && (
                        <div className="shrink-0 w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                          <IconCheck size={12} className="text-green-600" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}

          {/* Add new vendor / new booking buttons */}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <Button variant="outline" onClick={() => setVendorDialogOpen(true)} className="gap-2">
              <IconBuildingStore size={16} />
              Neuen Dienstleister erfassen
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setBookingDefaultValues({
                  buchung_event: createRecordUrl(APP_IDS.EVENTPLANUNG, selectedEvent.record_id),
                });
                setBookingDialogOpen(true);
              }}
              className="gap-2"
            >
              <IconCurrencyEuro size={16} />
              Neues Angebot buchen
            </Button>
          </div>

          <DienstleisterverzeichnisDialog
            open={vendorDialogOpen}
            onClose={() => setVendorDialogOpen(false)}
            onSubmit={async (fields) => {
              await LivingAppsService.createDienstleisterverzeichni(fields);
              await fetchAll();
            }}
          />

          <DienstleisterbuchungenDialog
            open={bookingDialogOpen}
            onClose={() => {
              setBookingDialogOpen(false);
              setBookingDefaultValues(undefined);
            }}
            onSubmit={async (fields) => {
              await LivingAppsService.createDienstleisterbuchungenEntry(fields);
              await fetchAll();
            }}
            defaultValues={bookingDefaultValues}
            eventplanungList={eventplanung}
            dienstleisterverzeichnisList={dienstleisterverzeichnis}
          />

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2 flex-wrap gap-3">
            <Button variant="outline" onClick={() => setCurrentStep(2)}>
              Zurück
            </Button>
            <Button onClick={() => setCurrentStep(4)} className="gap-2">
              Weiter zur Zusammenfassung
              <IconChevronRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4: Zusammenfassung */}
      {currentStep === 4 && selectedEvent && (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold">Zusammenfassung</h2>
            <p className="text-sm text-muted-foreground mt-1">Übersicht der Event-Vorbereitung</p>
          </div>

          {/* Event card */}
          <div className="rounded-xl border bg-card p-4 space-y-3 overflow-hidden">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <IconCalendarEvent size={18} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold truncate">{selectedEvent.fields.event_name ?? 'Unbekannt'}</h3>
                  {selectedEvent.fields.event_status && (
                    <StatusBadge
                      statusKey={selectedEvent.fields.event_status.key}
                      label={selectedEvent.fields.event_status.label}
                    />
                  )}
                </div>
                {selectedEvent.fields.event_datum && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {formatEventDate(selectedEvent.fields.event_datum)}
                    {selectedEvent.fields.event_location_name && ` • ${selectedEvent.fields.event_location_name}`}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Guest stats */}
          <div className="rounded-xl border bg-card p-4 space-y-3 overflow-hidden">
            <div className="flex items-center gap-2">
              <IconUsers size={16} className="text-primary" />
              <h3 className="font-semibold text-sm">Gäste</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-secondary p-3 text-center">
                <div className="text-2xl font-bold">{rsvpCounts.total}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Eingeladen</div>
              </div>
              <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-3 text-center">
                <div className="text-2xl font-bold text-green-700 dark:text-green-400">{rsvpCounts.zugesagt}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Zugesagt</div>
              </div>
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-3 text-center">
                <div className="text-2xl font-bold text-red-700 dark:text-red-400">{rsvpCounts.abgesagt}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Abgesagt</div>
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-gray-950/30 p-3 text-center">
                <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">{rsvpCounts.ausstehend}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Ausstehend</div>
              </div>
            </div>
            {rsvpCounts.vielleicht > 0 && (
              <p className="text-xs text-muted-foreground">
                Vielleicht: {rsvpCounts.vielleicht}
              </p>
            )}
          </div>

          {/* Vendor stats */}
          <div className="rounded-xl border bg-card p-4 space-y-3 overflow-hidden">
            <div className="flex items-center gap-2">
              <IconBuildingStore size={16} className="text-primary" />
              <h3 className="font-semibold text-sm">Dienstleister</h3>
            </div>
            <div className="flex gap-4 text-sm flex-wrap">
              <div>
                <span className="text-muted-foreground">Gebucht: </span>
                <span className="font-semibold">{bookingsForEvent.length}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Gesamtkosten: </span>
                <span className="font-semibold">€{totalBookedCost.toLocaleString('de-DE')}</span>
              </div>
            </div>
          </div>

          {/* Budget tracker */}
          <BudgetTracker
            budget={selectedEvent.fields.event_budget ?? 0}
            booked={totalBookedCost}
            label="Budget gesamt"
          />

          {/* Bookings list */}
          {bookingsForEvent.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Gebuchte Dienstleister</h3>
              <div className="space-y-2">
                {bookingsForEvent.map(booking => {
                  const vendorId = extractRecordId(booking.fields.buchung_dienstleister);
                  const vendor = vendorId ? dienstleisterverzeichnis.find(v => v.record_id === vendorId) : null;
                  return (
                    <div key={booking.record_id} className="flex items-center gap-3 p-3 rounded-xl border bg-card overflow-hidden">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">
                            {vendor?.fields.dl_firmenname ?? 'Unbekannt'}
                          </span>
                          {booking.fields.buchung_status && (
                            <StatusBadge
                              statusKey={booking.fields.buchung_status.key}
                              label={booking.fields.buchung_status.label}
                            />
                          )}
                        </div>
                        {booking.fields.buchung_leistung && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{booking.fields.buchung_leistung}</p>
                        )}
                      </div>
                      {booking.fields.buchung_preis != null && (
                        <span className="text-sm font-semibold shrink-0">
                          €{booking.fields.buchung_preis.toLocaleString('de-DE')}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 flex-wrap gap-3">
            <Button variant="outline" onClick={() => setCurrentStep(3)}>
              Zurück
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCurrentStep(2)} className="gap-2">
                <IconUserPlus size={16} />
                Gäste bearbeiten
              </Button>
              <a href="#/eventplanung">
                <Button className="gap-2">
                  <IconCheck size={16} />
                  Fertig
                </Button>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Fallback if no event selected but on step > 1 */}
      {currentStep > 1 && !selectedEvent && (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground mb-4">Kein Event ausgewählt.</p>
          <Button onClick={() => setCurrentStep(1)}>Zurück zur Event-Auswahl</Button>
        </div>
      )}
    </IntentWizardShell>
  );
}
