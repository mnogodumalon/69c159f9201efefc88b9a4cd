import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { APP_IDS } from '@/types/app';
import type { Eventplanung, Gaesteverzeichnis, Dienstleisterverzeichnis, LookupValue } from '@/types/app';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { EventplanungDialog } from '@/components/dialogs/EventplanungDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  IconCalendarEvent,
  IconUsers,
  IconBuilding,
  IconCheck,
  IconChevronRight,
  IconChevronLeft,
  IconPlus,
  IconSearch,
  IconMapPin,
  IconCurrencyEuro,
  IconMail,
  IconPhone,
  IconArrowLeft,
  IconLoader2,
  IconCircleCheck,
} from '@tabler/icons-react';

const STEPS = [
  { id: 1, label: 'Event wählen' },
  { id: 2, label: 'Gäste einladen' },
  { id: 3, label: 'Dienstleister buchen' },
  { id: 4, label: 'Zusammenfassung' },
];

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  in_planung: { label: 'In Planung', variant: 'secondary' },
  einladungen_versendet: { label: 'Einladungen versendet', variant: 'default' },
  bestaetigt: { label: 'Bestätigt', variant: 'default' },
  abgeschlossen: { label: 'Abgeschlossen', variant: 'outline' },
  abgesagt: { label: 'Abgesagt', variant: 'destructive' },
};

export default function EventVorbereitenPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

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

  // Derive initial values from URL params
  const initialEventId = searchParams.get('eventId') ?? '';
  const initialStep = parseInt(searchParams.get('step') ?? '1', 10);

  const [currentStep, setCurrentStep] = useState<number>(
    initialEventId ? Math.max(initialStep, 1) : 1
  );
  const [selectedEventId, setSelectedEventId] = useState<string>(initialEventId);
  const [eventSearch, setEventSearch] = useState('');
  const [newEventDialogOpen, setNewEventDialogOpen] = useState(false);

  // Step 2: guest selection
  const [selectedGuestIds, setSelectedGuestIds] = useState<Set<string>>(new Set());
  const [guestSearch, setGuestSearch] = useState('');
  const [sendingInvites, setSendingInvites] = useState(false);

  // Step 3: booking state
  const [bookingVendorId, setBookingVendorId] = useState<string | null>(null);
  const [bookingLeistung, setBookingLeistung] = useState('');
  const [bookingPreis, setBookingPreis] = useState('');
  const [savingBooking, setSavingBooking] = useState(false);
  const [vendorSearch, setVendorSearch] = useState('');

  // Sync step to URL
  useEffect(() => {
    const params: Record<string, string> = {};
    if (selectedEventId) params.eventId = selectedEventId;
    if (currentStep > 1) params.step = String(currentStep);
    setSearchParams(params, { replace: true });
  }, [currentStep, selectedEventId, setSearchParams]);

  // Auto-select event from URL when data loads
  useEffect(() => {
    if (!loading && initialEventId && selectedEventId === initialEventId && initialStep >= 2) {
      const found = eventplanung.find(e => e.record_id === initialEventId);
      if (found) {
        setCurrentStep(Math.min(initialStep, 4));
      }
    }
  }, [loading, initialEventId, initialStep, eventplanung, selectedEventId]);

  // Pre-select already-invited guests for this event when step 2 opens
  useEffect(() => {
    if (currentStep === 2 && selectedEventId) {
      const alreadyInvited = einladungenRsvp
        .filter(r => extractRecordId(r.fields.einladung_event) === selectedEventId)
        .map(r => extractRecordId(r.fields.einladung_gast))
        .filter((id): id is string => id !== null);
      setSelectedGuestIds(new Set(alreadyInvited));
    }
  }, [currentStep, selectedEventId, einladungenRsvp]);

  const selectedEvent = useMemo<Eventplanung | undefined>(
    () => eventplanung.find(e => e.record_id === selectedEventId),
    [eventplanung, selectedEventId]
  );

  const filteredEvents = useMemo(() => {
    const q = eventSearch.toLowerCase();
    return eventplanung.filter(e =>
      !q ||
      (e.fields.event_name ?? '').toLowerCase().includes(q) ||
      (e.fields.event_location_name ?? '').toLowerCase().includes(q) ||
      (e.fields.event_stadt ?? '').toLowerCase().includes(q)
    );
  }, [eventplanung, eventSearch]);

  // Invited guests for selected event
  const invitedGuestIds = useMemo<Set<string>>(() => {
    if (!selectedEventId) return new Set();
    return new Set(
      einladungenRsvp
        .filter(r => extractRecordId(r.fields.einladung_event) === selectedEventId)
        .map(r => extractRecordId(r.fields.einladung_gast))
        .filter((id): id is string => id !== null)
    );
  }, [einladungenRsvp, selectedEventId]);

  const filteredGuests = useMemo(() => {
    const q = guestSearch.toLowerCase();
    return gaesteverzeichnis.filter(g =>
      !q ||
      `${g.fields.vorname ?? ''} ${g.fields.nachname ?? ''}`.toLowerCase().includes(q) ||
      (g.fields.firma ?? '').toLowerCase().includes(q) ||
      (g.fields.email ?? '').toLowerCase().includes(q)
    );
  }, [gaesteverzeichnis, guestSearch]);

  // Booked vendors for selected event
  const bookedVendorMap = useMemo<Map<string, { leistung?: string; preis?: number }>>(() => {
    const m = new Map<string, { leistung?: string; preis?: number }>();
    if (!selectedEventId) return m;
    dienstleisterbuchungen
      .filter(b => extractRecordId(b.fields.buchung_event) === selectedEventId)
      .forEach(b => {
        const vid = extractRecordId(b.fields.buchung_dienstleister);
        if (vid) m.set(vid, { leistung: b.fields.buchung_leistung, preis: b.fields.buchung_preis });
      });
    return m;
  }, [dienstleisterbuchungen, selectedEventId]);

  const filteredVendors = useMemo(() => {
    const q = vendorSearch.toLowerCase();
    return dienstleisterverzeichnis.filter(v =>
      !q ||
      (v.fields.dl_firmenname ?? '').toLowerCase().includes(q) ||
      (v.fields.dl_kategorie?.label ?? '').toLowerCase().includes(q) ||
      `${v.fields.dl_ansprechpartner_vorname ?? ''} ${v.fields.dl_ansprechpartner_nachname ?? ''}`.toLowerCase().includes(q)
    );
  }, [dienstleisterverzeichnis, vendorSearch]);

  // Group vendors by category
  const vendorsByCategory = useMemo(() => {
    const groups = new Map<string, Dienstleisterverzeichnis[]>();
    filteredVendors.forEach(v => {
      const cat = v.fields.dl_kategorie?.label ?? 'Sonstiges';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(v);
    });
    return groups;
  }, [filteredVendors]);

  // Budget calculation
  const totalVendorCost = useMemo(() => {
    if (!selectedEventId) return 0;
    return dienstleisterbuchungen
      .filter(b => extractRecordId(b.fields.buchung_event) === selectedEventId)
      .reduce((sum, b) => sum + (b.fields.buchung_preis ?? 0), 0);
  }, [dienstleisterbuchungen, selectedEventId]);

  // Summary stats
  const invitationCount = useMemo(() => {
    if (!selectedEventId) return 0;
    return einladungenRsvp.filter(r => extractRecordId(r.fields.einladung_event) === selectedEventId).length;
  }, [einladungenRsvp, selectedEventId]);

  const rsvpReceivedCount = useMemo(() => {
    if (!selectedEventId) return 0;
    return einladungenRsvp.filter(r =>
      extractRecordId(r.fields.einladung_event) === selectedEventId &&
      r.fields.rsvp_status?.key !== 'ausstehend'
    ).length;
  }, [einladungenRsvp, selectedEventId]);

  const bookedVendorCount = useMemo(() => bookedVendorMap.size, [bookedVendorMap]);

  const handleSelectEvent = useCallback((event: Eventplanung) => {
    setSelectedEventId(event.record_id);
    setCurrentStep(2);
  }, []);

  const handleSendInvites = useCallback(async () => {
    if (!selectedEventId) return;
    const newGuests = Array.from(selectedGuestIds).filter(id => !invitedGuestIds.has(id));
    if (newGuests.length === 0) {
      setCurrentStep(3);
      return;
    }
    setSendingInvites(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await Promise.all(
        newGuests.map(guestId =>
          LivingAppsService.createEinladungenRsvpEntry({
            einladung_event: createRecordUrl(APP_IDS.EVENTPLANUNG, selectedEventId),
            einladung_gast: createRecordUrl(APP_IDS.GAESTEVERZEICHNIS, guestId),
            einladung_datum: today,
            rsvp_status: 'ausstehend' as unknown as LookupValue,
          })
        )
      );
      // Update event status if still in_planung
      const event = eventplanung.find(e => e.record_id === selectedEventId);
      if (event && event.fields.event_status?.key === 'in_planung') {
        await LivingAppsService.updateEventplanungEntry(selectedEventId, {
          event_status: 'einladungen_versendet' as unknown as LookupValue,
        });
      }
      await fetchAll();
      setCurrentStep(3);
    } catch (err) {
      console.error('Fehler beim Versenden der Einladungen:', err);
    } finally {
      setSendingInvites(false);
    }
  }, [selectedEventId, selectedGuestIds, invitedGuestIds, eventplanung, fetchAll]);

  const handleBookVendor = useCallback(async (vendorId: string) => {
    if (!selectedEventId || !bookingLeistung) return;
    setSavingBooking(true);
    try {
      await LivingAppsService.createDienstleisterbuchungenEntry({
        buchung_event: createRecordUrl(APP_IDS.EVENTPLANUNG, selectedEventId),
        buchung_dienstleister: createRecordUrl(APP_IDS.DIENSTLEISTERVERZEICHNIS, vendorId),
        buchung_leistung: bookingLeistung,
        buchung_preis: bookingPreis ? parseFloat(bookingPreis) : undefined,
        buchung_status: 'angefragt' as unknown as LookupValue,
      });
      await fetchAll();
      setBookingVendorId(null);
      setBookingLeistung('');
      setBookingPreis('');
    } catch (err) {
      console.error('Fehler beim Buchen:', err);
    } finally {
      setSavingBooking(false);
    }
  }, [selectedEventId, bookingLeistung, bookingPreis, fetchAll]);

  const handleReset = useCallback(() => {
    setSelectedEventId('');
    setCurrentStep(1);
    setSelectedGuestIds(new Set());
    setGuestSearch('');
    setEventSearch('');
    setVendorSearch('');
    setBookingVendorId(null);
    setBookingLeistung('');
    setBookingPreis('');
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <IconLoader2 size={32} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-destructive">Fehler beim Laden: {error.message}</p>
      </div>
    );
  }

  const budget = selectedEvent?.fields.event_budget ?? 0;
  const budgetPercent = budget > 0 ? Math.min((totalVendorCost / budget) * 100, 100) : 0;
  const eventStatusKey = selectedEvent?.fields.event_status?.key ?? '';
  const eventStatusInfo = STATUS_BADGE[eventStatusKey] ?? { label: eventStatusKey, variant: 'outline' as const };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Step Indicator */}
      <div className="flex items-center gap-0">
        {STEPS.map((step, idx) => (
          <div key={step.id} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  currentStep > step.id
                    ? 'bg-primary text-primary-foreground'
                    : currentStep === step.id
                    ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {currentStep > step.id ? <IconCheck size={14} /> : step.id}
              </div>
              <span
                className={`text-xs mt-1 whitespace-nowrap hidden sm:block ${
                  currentStep === step.id ? 'text-primary font-medium' : 'text-muted-foreground'
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 mb-4 transition-colors ${
                  currentStep > step.id ? 'bg-primary' : 'bg-muted'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Event auswählen */}
      {currentStep === 1 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-xl font-semibold">Event auswählen</h2>
              <p className="text-muted-foreground text-sm">Wähle ein bestehendes Event oder erstelle ein neues.</p>
            </div>
            <Button onClick={() => setNewEventDialogOpen(true)} className="gap-2">
              <IconPlus size={16} />
              Neues Event erstellen
            </Button>
          </div>

          <div className="relative">
            <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Events durchsuchen..."
              value={eventSearch}
              onChange={e => setEventSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="space-y-2">
            {filteredEvents.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <IconCalendarEvent size={40} className="mx-auto mb-2 opacity-40" />
                <p>Keine Events gefunden</p>
              </div>
            )}
            {filteredEvents.map(event => {
              const statusKey = event.fields.event_status?.key ?? '';
              const statusInfo = STATUS_BADGE[statusKey] ?? { label: statusKey, variant: 'outline' as const };
              return (
                <div
                  key={event.record_id}
                  onClick={() => handleSelectEvent(event)}
                  className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent cursor-pointer transition-colors overflow-hidden"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <IconCalendarEvent size={20} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{event.fields.event_name ?? '—'}</span>
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5 flex-wrap">
                      {event.fields.event_datum && (
                        <span className="flex items-center gap-1">
                          <IconCalendarEvent size={12} />
                          {formatDate(event.fields.event_datum)}
                        </span>
                      )}
                      {event.fields.event_location_name && (
                        <span className="flex items-center gap-1">
                          <IconMapPin size={12} />
                          <span className="truncate max-w-[160px]">{event.fields.event_location_name}</span>
                        </span>
                      )}
                      {event.fields.event_budget != null && (
                        <span className="flex items-center gap-1">
                          <IconCurrencyEuro size={12} />
                          {formatCurrency(event.fields.event_budget)}
                        </span>
                      )}
                    </div>
                  </div>
                  <IconChevronRight size={18} className="text-muted-foreground shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 2: Gäste einladen */}
      {currentStep === 2 && selectedEvent && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCurrentStep(1)} className="gap-1 p-1">
              <IconArrowLeft size={16} />
            </Button>
            <div>
              <h2 className="text-xl font-semibold truncate">
                Gäste zu „{selectedEvent.fields.event_name}" einladen
              </h2>
              <p className="text-sm text-muted-foreground">Wähle die Gäste aus, die du einladen möchtest.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Guest list */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Gäste suchen..."
                    value={guestSearch}
                    onChange={e => setGuestSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedGuestIds(new Set(gaesteverzeichnis.map(g => g.record_id)))}
                  className="whitespace-nowrap"
                >
                  <IconUsers size={14} className="mr-1" />
                  Alle wählen
                </Button>
              </div>

              <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
                {filteredGuests.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <IconUsers size={32} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Keine Gäste gefunden</p>
                  </div>
                )}
                {filteredGuests.map((guest: Gaesteverzeichnis) => {
                  const isSelected = selectedGuestIds.has(guest.record_id);
                  const isAlreadyInvited = invitedGuestIds.has(guest.record_id);
                  return (
                    <div
                      key={guest.record_id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer overflow-hidden ${
                        isSelected ? 'bg-primary/5 border-primary/30' : 'bg-card hover:bg-accent'
                      }`}
                      onClick={() => {
                        const next = new Set(selectedGuestIds);
                        if (next.has(guest.record_id)) next.delete(guest.record_id);
                        else next.add(guest.record_id);
                        setSelectedGuestIds(next);
                      }}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          const next = new Set(selectedGuestIds);
                          if (checked) next.add(guest.record_id);
                          else next.delete(guest.record_id);
                          setSelectedGuestIds(next);
                        }}
                        onClick={e => e.stopPropagation()}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">
                            {guest.fields.vorname} {guest.fields.nachname}
                          </span>
                          {isAlreadyInvited && (
                            <Badge variant="secondary" className="text-xs shrink-0">bereits eingeladen</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                          {guest.fields.firma && <span className="truncate">{guest.fields.firma}</span>}
                          {guest.fields.email && (
                            <span className="flex items-center gap-0.5 truncate">
                              <IconMail size={10} />
                              {guest.fields.email}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Live feedback */}
            <div className="space-y-3">
              <Card className="overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Zusammenfassung</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Ausgewählt</span>
                    <span className="font-semibold">{selectedGuestIds.size}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Bereits eingeladen</span>
                    <span className="font-semibold">{invitedGuestIds.size}</span>
                  </div>
                  <div className="flex justify-between items-center border-t pt-2">
                    <span className="text-sm font-medium">Neu einzuladen</span>
                    <span className="font-bold text-primary">
                      {Array.from(selectedGuestIds).filter(id => !invitedGuestIds.has(id)).length}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-col gap-2">
                <Button
                  onClick={handleSendInvites}
                  disabled={sendingInvites || selectedGuestIds.size === 0}
                  className="w-full gap-2"
                >
                  {sendingInvites ? (
                    <IconLoader2 size={16} className="animate-spin" />
                  ) : (
                    <IconMail size={16} />
                  )}
                  {sendingInvites ? 'Wird gesendet...' : 'Einladungen versenden'}
                </Button>
                <Button variant="outline" onClick={() => setCurrentStep(3)} className="w-full gap-1">
                  Überspringen
                  <IconChevronRight size={16} />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Dienstleister buchen */}
      {currentStep === 3 && selectedEvent && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCurrentStep(2)} className="p-1">
              <IconArrowLeft size={16} />
            </Button>
            <div>
              <h2 className="text-xl font-semibold truncate">
                Dienstleister für „{selectedEvent.fields.event_name}" buchen
              </h2>
              <p className="text-sm text-muted-foreground">Buche Dienstleister und verfolge dein Budget.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Vendor list */}
            <div className="lg:col-span-2 space-y-3">
              <div className="relative">
                <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Dienstleister suchen..."
                  value={vendorSearch}
                  onChange={e => setVendorSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
                {filteredVendors.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <IconBuilding size={32} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Keine Dienstleister gefunden</p>
                  </div>
                )}
                {Array.from(vendorsByCategory.entries()).map(([category, vendors]) => (
                  <div key={category}>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                      {category}
                    </h3>
                    <div className="space-y-2">
                      {vendors.map((vendor: Dienstleisterverzeichnis) => {
                        const isBooked = bookedVendorMap.has(vendor.record_id);
                        const bookingInfo = bookedVendorMap.get(vendor.record_id);
                        const isExpanded = bookingVendorId === vendor.record_id;
                        return (
                          <div key={vendor.record_id} className="border rounded-lg overflow-hidden bg-card">
                            <div className="flex items-center gap-3 p-3">
                              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                                <IconBuilding size={16} className="text-muted-foreground" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm truncate">{vendor.fields.dl_firmenname}</span>
                                  {isBooked && (
                                    <Badge className="text-xs bg-green-100 text-green-700 border-green-200 shrink-0">
                                      <IconCircleCheck size={10} className="mr-1" />
                                      Gebucht
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                                  {(vendor.fields.dl_ansprechpartner_vorname || vendor.fields.dl_ansprechpartner_nachname) && (
                                    <div className="truncate">
                                      {vendor.fields.dl_ansprechpartner_vorname} {vendor.fields.dl_ansprechpartner_nachname}
                                    </div>
                                  )}
                                  <div className="flex items-center gap-3 flex-wrap">
                                    {vendor.fields.dl_email && (
                                      <span className="flex items-center gap-0.5">
                                        <IconMail size={10} />
                                        <span className="truncate max-w-[140px]">{vendor.fields.dl_email}</span>
                                      </span>
                                    )}
                                    {vendor.fields.dl_telefon && (
                                      <span className="flex items-center gap-0.5">
                                        <IconPhone size={10} />
                                        {vendor.fields.dl_telefon}
                                      </span>
                                    )}
                                  </div>
                                  {isBooked && bookingInfo?.leistung && (
                                    <div className="text-green-700 font-medium">{bookingInfo.leistung}</div>
                                  )}
                                </div>
                              </div>
                              {!isBooked && (
                                <Button
                                  size="sm"
                                  variant={isExpanded ? 'secondary' : 'outline'}
                                  onClick={() => {
                                    if (isExpanded) {
                                      setBookingVendorId(null);
                                    } else {
                                      setBookingVendorId(vendor.record_id);
                                      setBookingLeistung('');
                                      setBookingPreis('');
                                    }
                                  }}
                                  className="shrink-0"
                                >
                                  {isExpanded ? 'Abbrechen' : 'Buchen'}
                                </Button>
                              )}
                            </div>

                            {/* Inline booking form */}
                            {isExpanded && (
                              <div className="border-t bg-muted/30 p-3 space-y-3">
                                <div className="space-y-1">
                                  <Label htmlFor={`leistung-${vendor.record_id}`} className="text-xs">
                                    Welche Leistung?
                                  </Label>
                                  <Input
                                    id={`leistung-${vendor.record_id}`}
                                    placeholder="z.B. Catering für 100 Personen"
                                    value={bookingLeistung}
                                    onChange={e => setBookingLeistung(e.target.value)}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor={`preis-${vendor.record_id}`} className="text-xs">
                                    Preis in EUR
                                  </Label>
                                  <Input
                                    id={`preis-${vendor.record_id}`}
                                    type="number"
                                    placeholder="0.00"
                                    value={bookingPreis}
                                    onChange={e => setBookingPreis(e.target.value)}
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => handleBookVendor(vendor.record_id)}
                                    disabled={savingBooking || !bookingLeistung}
                                    className="gap-1"
                                  >
                                    {savingBooking ? (
                                      <IconLoader2 size={14} className="animate-spin" />
                                    ) : (
                                      <IconCheck size={14} />
                                    )}
                                    {savingBooking ? 'Wird gebucht...' : 'Bestätigen'}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setBookingVendorId(null)}
                                  >
                                    Abbrechen
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Budget widget */}
            <div className="space-y-3">
              <Card className="overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <IconCurrencyEuro size={16} />
                    Budget
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Gesamtbudget</span>
                      <span className="font-medium">{formatCurrency(budget || undefined)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Ausgegeben</span>
                      <span className="font-medium">{formatCurrency(totalVendorCost)}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t pt-2">
                      <span className="font-medium">Verbleibend</span>
                      <span className={`font-bold ${budget - totalVendorCost < 0 ? 'text-destructive' : 'text-green-600'}`}>
                        {formatCurrency(Math.max(budget - totalVendorCost, 0))}
                      </span>
                    </div>
                  </div>
                  {budget > 0 && (
                    <div className="space-y-1">
                      <Progress value={budgetPercent} className="h-2" />
                      <p className="text-xs text-muted-foreground text-right">
                        {Math.round(budgetPercent)}% verbraucht
                      </p>
                    </div>
                  )}
                  <div className="pt-1 border-t">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Dienstleister gebucht</span>
                      <span className="font-semibold">{bookedVendorCount}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Button onClick={() => setCurrentStep(4)} className="w-full gap-2">
                Weiter
                <IconChevronRight size={16} />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Zusammenfassung */}
      {currentStep === 4 && selectedEvent && (
        <div className="space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <IconCircleCheck size={32} className="text-green-600" />
            </div>
            <h2 className="text-2xl font-bold">Event bereit!</h2>
            <p className="text-muted-foreground mt-1">
              „{selectedEvent.fields.event_name}" ist vorbereitet.
            </p>
          </div>

          {/* Event card */}
          <Card className="overflow-hidden">
            <CardContent className="pt-4">
              <div className="flex items-start gap-4 flex-wrap">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <IconCalendarEvent size={24} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-lg truncate">{selectedEvent.fields.event_name}</h3>
                    <Badge variant={eventStatusInfo.variant}>{eventStatusInfo.label}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {selectedEvent.fields.event_datum && (
                      <span className="flex items-center gap-1">
                        <IconCalendarEvent size={13} />
                        {formatDate(selectedEvent.fields.event_datum)}
                      </span>
                    )}
                    {selectedEvent.fields.event_location_name && (
                      <span className="flex items-center gap-1">
                        <IconMapPin size={13} />
                        {selectedEvent.fields.event_location_name}
                        {selectedEvent.fields.event_stadt ? `, ${selectedEvent.fields.event_stadt}` : ''}
                      </span>
                    )}
                    {selectedEvent.fields.event_gaestezahl != null && (
                      <span className="flex items-center gap-1">
                        <IconUsers size={13} />
                        {selectedEvent.fields.event_gaestezahl} Gäste erwartet
                      </span>
                    )}
                    {selectedEvent.fields.event_budget != null && (
                      <span className="flex items-center gap-1">
                        <IconCurrencyEuro size={13} />
                        Budget: {formatCurrency(selectedEvent.fields.event_budget)}
                      </span>
                    )}
                  </div>
                  {selectedEvent.fields.event_beschreibung && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                      {selectedEvent.fields.event_beschreibung}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="overflow-hidden">
              <CardContent className="pt-4 text-center">
                <div className="text-2xl font-bold text-primary">{invitationCount}</div>
                <div className="text-xs text-muted-foreground mt-1">Einladungen versendet</div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden">
              <CardContent className="pt-4 text-center">
                <div className="text-2xl font-bold text-green-600">{rsvpReceivedCount}</div>
                <div className="text-xs text-muted-foreground mt-1">RSVPs erhalten</div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden">
              <CardContent className="pt-4 text-center">
                <div className="text-2xl font-bold text-blue-600">{bookedVendorCount}</div>
                <div className="text-xs text-muted-foreground mt-1">Dienstleister gebucht</div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden">
              <CardContent className="pt-4 text-center">
                <div className={`text-2xl font-bold ${budget > 0 && totalVendorCost > budget ? 'text-destructive' : 'text-foreground'}`}>
                  {formatCurrency(totalVendorCost)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {budget > 0 ? `von ${formatCurrency(budget)}` : 'Gesamtkosten'}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Budget bar on summary */}
          {budget > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Budgetauslastung</span>
                <span className={`font-medium ${totalVendorCost > budget ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {Math.round(budgetPercent)}%
                </span>
              </div>
              <Progress value={budgetPercent} className="h-3" />
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button onClick={() => navigate('/')} variant="outline" className="flex-1 gap-2">
              <IconArrowLeft size={16} />
              Dashboard
            </Button>
            <Button onClick={handleReset} className="flex-1 gap-2">
              <IconPlus size={16} />
              Weiteres Event vorbereiten
            </Button>
          </div>
        </div>
      )}

      {/* New Event Dialog */}
      <EventplanungDialog
        open={newEventDialogOpen}
        onClose={() => setNewEventDialogOpen(false)}
        onSubmit={async (fields) => {
          await LivingAppsService.createEventplanungEntry(fields);
          await fetchAll();
          setNewEventDialogOpen(false);
        }}
      />
    </div>
  );
}
