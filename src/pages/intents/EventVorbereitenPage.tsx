import { useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichEinladungenRsvp, enrichDienstleisterbuchungen } from '@/lib/enrich';
import { extractRecordId, LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Eventplanung, Gaesteverzeichnis, Dienstleisterverzeichnis } from '@/types/app';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconUsers,
  IconBuilding,
  IconCalendar,
  IconMapPin,
  IconCurrencyEuro,
  IconUser,
  IconPhone,
  IconTag,
  IconCircleCheck,
  IconLoader2,
  IconX,
  IconPlus,
} from '@tabler/icons-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type BookingFormState = {
  leistung: string;
  preis: string;
  status: string;
};

// ─── Helper: RSVP status badge ────────────────────────────────────────────────

function RsvpBadge({ statusKey }: { statusKey: string | undefined }) {
  if (!statusKey) return <Badge variant="secondary">Ausstehend</Badge>;
  const map: Record<string, { label: string; className: string }> = {
    zugesagt: { label: 'Zugesagt', className: 'bg-green-100 text-green-800 border-green-200' },
    abgesagt: { label: 'Abgesagt', className: 'bg-red-100 text-red-800 border-red-200' },
    vielleicht: { label: 'Vielleicht', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    ausstehend: { label: 'Ausstehend', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  };
  const entry = map[statusKey] ?? { label: statusKey, className: 'bg-gray-100 text-gray-700 border-gray-200' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${entry.className}`}>
      {entry.label}
    </span>
  );
}

// ─── Helper: Event status badge ───────────────────────────────────────────────

function EventStatusBadge({ statusKey }: { statusKey: string | undefined }) {
  if (!statusKey) return null;
  const map: Record<string, { label: string; className: string }> = {
    in_planung: { label: 'In Planung', className: 'bg-blue-100 text-blue-800 border-blue-200' },
    einladungen_versendet: { label: 'Einl. versendet', className: 'bg-purple-100 text-purple-800 border-purple-200' },
    bestaetigt: { label: 'Bestätigt', className: 'bg-green-100 text-green-800 border-green-200' },
    abgeschlossen: { label: 'Abgeschlossen', className: 'bg-gray-100 text-gray-600 border-gray-200' },
    abgesagt: { label: 'Abgesagt', className: 'bg-red-100 text-red-800 border-red-200' },
  };
  const entry = map[statusKey] ?? { label: statusKey, className: 'bg-gray-100 text-gray-700 border-gray-200' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${entry.className}`}>
      {entry.label}
    </span>
  );
}

// ─── Helper: Booking status badge ─────────────────────────────────────────────

function BuchungStatusBadge({ statusKey }: { statusKey: string | undefined }) {
  if (!statusKey) return null;
  const map: Record<string, { label: string; className: string }> = {
    angefragt: { label: 'Angefragt', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    angebot_erhalten: { label: 'Angebot', className: 'bg-blue-100 text-blue-800 border-blue-200' },
    gebucht: { label: 'Gebucht', className: 'bg-green-100 text-green-800 border-green-200' },
    bestaetigt: { label: 'Bestätigt', className: 'bg-green-100 text-green-800 border-green-200' },
    storniert: { label: 'Storniert', className: 'bg-red-100 text-red-800 border-red-200' },
  };
  const entry = map[statusKey] ?? { label: statusKey, className: 'bg-gray-100 text-gray-700 border-gray-200' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${entry.className}`}>
      {entry.label}
    </span>
  );
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  const steps = [
    { n: 1, label: 'Event' },
    { n: 2, label: 'Gäste' },
    { n: 3, label: 'Dienstleister' },
    { n: 4, label: 'Zusammenfassung' },
  ];
  return (
    <div className="flex items-center gap-1 sm:gap-2 mb-6">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center gap-1 sm:gap-2 min-w-0">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                s.n < current
                  ? 'bg-primary text-primary-foreground'
                  : s.n === current
                  ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {s.n < current ? <IconCheck size={14} stroke={2.5} /> : s.n}
            </div>
            <span className={`hidden sm:block text-xs font-medium truncate max-w-[70px] text-center ${s.n === current ? 'text-primary' : 'text-muted-foreground'}`}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`h-0.5 flex-1 min-w-[12px] rounded-full transition-colors mb-4 ${s.n < current ? 'bg-primary' : 'bg-muted'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EventVorbereitenPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const {
    eventplanung,
    gaesteverzeichnis,
    dienstleisterbuchungen,
    dienstleisterverzeichnis,
    einladungenRsvp,
    eventplanungMap,
    dienstleisterverzeichnisMap,
    gaesteverzeichnisMap,
    loading,
    error,
    fetchAll,
  } = useDashboardData();

  // ── Wizard state ──────────────────────────────────────────────────────────
  const initialEventId = searchParams.get('eventId');
  const [step, setStep] = useState<number>(initialEventId ? 2 : 1);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialEventId);

  // Step 2: guest selection
  const [selectedGuestIds, setSelectedGuestIds] = useState<Set<string>>(new Set());
  const [invitingGuests, setInvitingGuests] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Step 3: provider booking
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [bookingForms, setBookingForms] = useState<Record<string, BookingFormState>>({});
  const [openBookingForms, setOpenBookingForms] = useState<Set<string>>(new Set());
  const [submittingBooking, setSubmittingBooking] = useState<Set<string>>(new Set());

  // ── Derived data ──────────────────────────────────────────────────────────

  const selectedEvent: Eventplanung | null = useMemo(() => {
    if (!selectedEventId) return null;
    return eventplanungMap.get(selectedEventId) ?? null;
  }, [selectedEventId, eventplanungMap]);

  // Enriched invitations + bookings
  const enrichedInvitations = useMemo(
    () => enrichEinladungenRsvp(einladungenRsvp, { eventplanungMap, gaesteverzeichnisMap }),
    [einladungenRsvp, eventplanungMap, gaesteverzeichnisMap]
  );

  const enrichedBookings = useMemo(
    () => enrichDienstleisterbuchungen(dienstleisterbuchungen, { eventplanungMap, dienstleisterverzeichnisMap }),
    [dienstleisterbuchungen, eventplanungMap, dienstleisterverzeichnisMap]
  );

  // Events filtered for Step 1 (active events preferred)
  const filteredEvents = useMemo(() => {
    const activeStatuses = new Set(['in_planung', 'einladungen_versendet']);
    const active = eventplanung.filter(e => {
      const key = typeof e.fields.event_status === 'object' && e.fields.event_status
        ? (e.fields.event_status as { key: string }).key
        : e.fields.event_status;
      return activeStatuses.has(key as string);
    });
    return active.length > 0 ? active : [...eventplanung];
  }, [eventplanung]);

  // Invitations for the selected event
  const eventInvitations = useMemo(() => {
    if (!selectedEventId) return [];
    return enrichedInvitations.filter(inv => {
      const id = extractRecordId(inv.fields.einladung_event);
      return id === selectedEventId;
    });
  }, [enrichedInvitations, selectedEventId]);

  // Set of guest IDs already invited to this event
  const invitedGuestIdSet = useMemo(() => {
    const s = new Set<string>();
    eventInvitations.forEach(inv => {
      const gId = extractRecordId(inv.fields.einladung_gast);
      if (gId) s.add(gId);
    });
    return s;
  }, [eventInvitations]);

  // Guests NOT yet invited
  const uninvitedGuests: Gaesteverzeichnis[] = useMemo(
    () => gaesteverzeichnis.filter(g => !invitedGuestIdSet.has(g.record_id)),
    [gaesteverzeichnis, invitedGuestIdSet]
  );

  // Bookings for selected event
  const eventBookings = useMemo(() => {
    if (!selectedEventId) return [];
    return enrichedBookings.filter(b => {
      const id = extractRecordId(b.fields.buchung_event);
      return id === selectedEventId;
    });
  }, [enrichedBookings, selectedEventId]);

  // Booked provider IDs for this event
  const bookedProviderIdSet = useMemo(() => {
    const s = new Set<string>();
    eventBookings.forEach(b => {
      const pId = extractRecordId(b.fields.buchung_dienstleister);
      if (pId) s.add(pId);
    });
    return s;
  }, [eventBookings]);

  // Total booked cost
  const totalBookedCost = useMemo(
    () => eventBookings.reduce((sum, b) => sum + (b.fields.buchung_preis ?? 0), 0),
    [eventBookings]
  );

  const eventBudget = selectedEvent?.fields.event_budget ?? 0;
  const remainingBudget = eventBudget - totalBookedCost;

  // Filtered providers for Step 3
  const filteredProviders = useMemo(() => {
    if (categoryFilter === 'all') return dienstleisterverzeichnis;
    return dienstleisterverzeichnis.filter(p => {
      const key = typeof p.fields.dl_kategorie === 'object' && p.fields.dl_kategorie
        ? (p.fields.dl_kategorie as { key: string }).key
        : p.fields.dl_kategorie;
      return key === categoryFilter;
    });
  }, [dienstleisterverzeichnis, categoryFilter]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSelectEvent = useCallback((event: Eventplanung) => {
    setSelectedEventId(event.record_id);
    setSelectedGuestIds(new Set());
    setStep(2);
  }, []);

  const toggleGuestSelection = useCallback((guestId: string) => {
    setSelectedGuestIds(prev => {
      const next = new Set(prev);
      if (next.has(guestId)) next.delete(guestId);
      else next.add(guestId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedGuestIds(prev => {
      if (prev.size === uninvitedGuests.length) return new Set();
      return new Set(uninvitedGuests.map(g => g.record_id));
    });
  }, [uninvitedGuests]);

  const handleInviteGuests = useCallback(async () => {
    if (!selectedEventId || selectedGuestIds.size === 0) return;
    setInvitingGuests(true);
    setInviteError(null);
    const today = new Date().toISOString().slice(0, 10);
    const toInvite = [...selectedGuestIds].filter(id => !invitedGuestIdSet.has(id));
    try {
      await Promise.all(
        toInvite.map(guestId =>
          LivingAppsService.createEinladungenRsvpEntry({
            einladung_event: createRecordUrl(APP_IDS.EVENTPLANUNG, selectedEventId),
            einladung_gast: createRecordUrl(APP_IDS.GAESTEVERZEICHNIS, guestId),
            einladung_datum: today,
            rsvp_status: { key: 'ausstehend', label: 'Ausstehend' },
          })
        )
      );
      setSelectedGuestIds(new Set());
      await fetchAll();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Fehler beim Einladen');
    } finally {
      setInvitingGuests(false);
    }
  }, [selectedEventId, selectedGuestIds, invitedGuestIdSet, fetchAll]);

  const toggleBookingForm = useCallback((providerId: string) => {
    setOpenBookingForms(prev => {
      const next = new Set(prev);
      if (next.has(providerId)) next.delete(providerId);
      else {
        next.add(providerId);
        setBookingForms(f => ({
          ...f,
          [providerId]: f[providerId] ?? { leistung: '', preis: '', status: 'angefragt' },
        }));
      }
      return next;
    });
  }, []);

  const updateBookingForm = useCallback((providerId: string, field: keyof BookingFormState, value: string) => {
    setBookingForms(prev => ({
      ...prev,
      [providerId]: { ...prev[providerId], [field]: value },
    }));
  }, []);

  const handleCreateBooking = useCallback(async (provider: Dienstleisterverzeichnis) => {
    if (!selectedEventId) return;
    const form = bookingForms[provider.record_id];
    if (!form) return;
    setSubmittingBooking(prev => new Set(prev).add(provider.record_id));
    try {
      await LivingAppsService.createDienstleisterbuchungenEntry({
        buchung_event: createRecordUrl(APP_IDS.EVENTPLANUNG, selectedEventId),
        buchung_dienstleister: createRecordUrl(APP_IDS.DIENSTLEISTERVERZEICHNIS, provider.record_id),
        buchung_leistung: form.leistung,
        buchung_preis: form.preis ? parseFloat(form.preis) : undefined,
        buchung_status: { key: 'angefragt', label: 'Angefragt' },
      });
      setOpenBookingForms(prev => {
        const next = new Set(prev);
        next.delete(provider.record_id);
        return next;
      });
      await fetchAll();
    } catch (err) {
      console.error('Booking error', err);
    } finally {
      setSubmittingBooking(prev => {
        const next = new Set(prev);
        next.delete(provider.record_id);
        return next;
      });
    }
  }, [selectedEventId, bookingForms, fetchAll]);

  // ── Loading / Error ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-destructive/10 text-destructive rounded-2xl p-6 text-center">
          <p className="font-semibold">Fehler beim Laden der Daten</p>
          <p className="text-sm mt-1">{error.message}</p>
          <Button className="mt-4" onClick={fetchAll}>Erneut versuchen</Button>
        </div>
      </div>
    );
  }

  // ── Category pills for step 3 ─────────────────────────────────────────────

  const categories = [
    { key: 'all', label: 'Alle' },
    ...LOOKUP_OPTIONS.dienstleisterverzeichnis.dl_kategorie,
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/')}
          className="shrink-0"
          aria-label="Zurück zur Übersicht"
        >
          <IconArrowLeft size={18} />
        </Button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground truncate">Event vorbereiten</h1>
          <p className="text-sm text-muted-foreground">Schritt-für-Schritt zum perfekten Event</p>
        </div>
      </div>

      {/* Step Indicator */}
      <StepIndicator current={step} />

      {/* ── STEP 1: Event auswählen ──────────────────────────────────────── */}
      {step === 1 && (
        <div>
          <h2 className="text-lg font-semibold mb-1">Event auswählen</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Welches Event möchten Sie vorbereiten?
            {filteredEvents.length < eventplanung.length && (
              <span className="ml-1">Es werden aktive Events angezeigt.</span>
            )}
          </p>

          {filteredEvents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <IconCalendar size={40} className="mx-auto mb-3 opacity-30" />
              <p>Keine Events gefunden.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredEvents.map(event => {
                const statusKey = typeof event.fields.event_status === 'object' && event.fields.event_status
                  ? (event.fields.event_status as { key: string }).key
                  : undefined;
                return (
                  <button
                    key={event.record_id}
                    onClick={() => handleSelectEvent(event)}
                    className="text-left bg-card border border-border rounded-2xl p-5 shadow-sm hover:border-primary hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 group overflow-hidden"
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h3 className="font-semibold text-foreground text-base leading-tight min-w-0 truncate group-hover:text-primary transition-colors">
                        {event.fields.event_name ?? '(Kein Name)'}
                      </h3>
                      <EventStatusBadge statusKey={statusKey} />
                    </div>
                    <div className="space-y-1.5 text-sm text-muted-foreground">
                      {event.fields.event_datum && (
                        <div className="flex items-center gap-2">
                          <IconCalendar size={14} className="shrink-0" />
                          <span>{formatDate(event.fields.event_datum)}</span>
                        </div>
                      )}
                      {(event.fields.event_location_name || event.fields.event_stadt) && (
                        <div className="flex items-center gap-2">
                          <IconMapPin size={14} className="shrink-0" />
                          <span className="truncate">
                            {[event.fields.event_location_name, event.fields.event_stadt].filter(Boolean).join(', ')}
                          </span>
                        </div>
                      )}
                      {event.fields.event_budget != null && (
                        <div className="flex items-center gap-2">
                          <IconCurrencyEuro size={14} className="shrink-0" />
                          <span>Budget: {formatCurrency(event.fields.event_budget)}</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {einladungenRsvp.filter(inv => extractRecordId(inv.fields.einladung_event) === event.record_id).length} Einladungen
                      </span>
                      <span className="flex items-center gap-1 text-primary font-medium group-hover:gap-2 transition-all">
                        Auswählen <IconArrowRight size={13} />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── STEP 2: Gäste einladen ───────────────────────────────────────── */}
      {step === 2 && selectedEvent && (
        <div>
          {/* Event context header */}
          <div className="bg-card border border-border rounded-2xl px-5 py-4 mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground truncate">
                {selectedEvent.fields.event_name}
              </h2>
              <p className="text-sm text-muted-foreground">
                {selectedEvent.fields.event_datum ? formatDate(selectedEvent.fields.event_datum) : 'Kein Datum'}
                {selectedEvent.fields.event_location_name && ` · ${selectedEvent.fields.event_location_name}`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1.5 bg-primary/10 text-primary rounded-full px-3 py-1 text-sm font-medium">
                <IconUsers size={14} />
                <span>{eventInvitations.length} von {gaesteverzeichnis.length} eingeladen</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left: Uninvited guests */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Alle Gäste einladen</h3>
                <span className="text-sm text-muted-foreground">{uninvitedGuests.length} verfügbar</span>
              </div>

              {uninvitedGuests.length === 0 ? (
                <div className="px-5 py-10 text-center text-muted-foreground">
                  <IconCircleCheck size={36} className="mx-auto mb-2 text-green-500 opacity-70" />
                  <p className="text-sm font-medium">Alle Gäste sind bereits eingeladen!</p>
                </div>
              ) : (
                <>
                  {/* Select all row */}
                  <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="select-all"
                      className="w-4 h-4 rounded accent-primary cursor-pointer"
                      checked={selectedGuestIds.size === uninvitedGuests.length && uninvitedGuests.length > 0}
                      onChange={toggleSelectAll}
                    />
                    <label htmlFor="select-all" className="text-sm font-medium cursor-pointer select-none">
                      Alle auswählen ({uninvitedGuests.length})
                    </label>
                  </div>

                  {/* Guest list */}
                  <div className="divide-y divide-border max-h-72 overflow-y-auto">
                    {uninvitedGuests.map(guest => (
                      <div
                        key={guest.record_id}
                        className="px-5 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => toggleGuestSelection(guest.record_id)}
                      >
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded accent-primary cursor-pointer shrink-0"
                          checked={selectedGuestIds.has(guest.record_id)}
                          onChange={() => toggleGuestSelection(guest.record_id)}
                          onClick={e => e.stopPropagation()}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {[guest.fields.vorname, guest.fields.nachname].filter(Boolean).join(' ') || '(Kein Name)'}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {[guest.fields.position, guest.fields.firma].filter(Boolean).join(' · ') || '—'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Invite button */}
                  <div className="px-5 py-4 border-t border-border">
                    {inviteError && (
                      <p className="text-sm text-destructive mb-2">{inviteError}</p>
                    )}
                    <Button
                      className="w-full"
                      disabled={selectedGuestIds.size === 0 || invitingGuests}
                      onClick={handleInviteGuests}
                    >
                      {invitingGuests ? (
                        <>
                          <IconLoader2 size={16} className="mr-2 animate-spin" />
                          Einladungen werden erstellt…
                        </>
                      ) : (
                        <>
                          <IconPlus size={16} className="mr-2" />
                          {selectedGuestIds.size > 0
                            ? `${selectedGuestIds.size} Gäste einladen`
                            : 'Gäste auswählen'}
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* Right: Already invited */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Bereits eingeladen</h3>
                <span className="text-sm text-muted-foreground">{eventInvitations.length}</span>
              </div>

              {eventInvitations.length === 0 ? (
                <div className="px-5 py-10 text-center text-muted-foreground">
                  <IconUser size={36} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Noch keine Einladungen versendet</p>
                </div>
              ) : (
                <div className="divide-y divide-border max-h-96 overflow-y-auto">
                  {eventInvitations.map(inv => {
                    const statusKey = typeof inv.fields.rsvp_status === 'object' && inv.fields.rsvp_status
                      ? (inv.fields.rsvp_status as { key: string }).key
                      : undefined;
                    return (
                      <div key={inv.record_id} className="px-5 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{inv.einladung_gastName || '—'}</p>
                          <p className="text-xs text-muted-foreground">
                            {inv.fields.einladung_datum ? formatDate(inv.fields.einladung_datum) : ''}
                          </p>
                        </div>
                        <RsvpBadge statusKey={statusKey} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Navigation */}
          <div className="mt-5 flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              <IconArrowLeft size={16} className="mr-2" />
              Zurück
            </Button>
            <Button onClick={() => setStep(3)}>
              Weiter zu Dienstleistern
              <IconArrowRight size={16} className="ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Dienstleister buchen ─────────────────────────────────── */}
      {step === 3 && selectedEvent && (
        <div>
          {/* Budget header */}
          <div className="bg-card border border-border rounded-2xl px-5 py-4 mb-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-foreground truncate">
                  {selectedEvent.fields.event_name}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {selectedEvent.fields.event_datum ? formatDate(selectedEvent.fields.event_datum) : 'Kein Datum'}
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm shrink-0">
                {eventBudget > 0 && (
                  <div className="flex flex-col items-center bg-muted/50 rounded-xl px-3 py-2 min-w-[90px]">
                    <span className="text-xs text-muted-foreground">Budget</span>
                    <span className="font-semibold">{formatCurrency(eventBudget)}</span>
                  </div>
                )}
                <div className="flex flex-col items-center bg-primary/10 text-primary rounded-xl px-3 py-2 min-w-[90px]">
                  <span className="text-xs text-primary/70">Gebucht</span>
                  <span className="font-semibold">{formatCurrency(totalBookedCost)}</span>
                </div>
                {eventBudget > 0 && (
                  <div className={`flex flex-col items-center rounded-xl px-3 py-2 min-w-[90px] ${remainingBudget < 0 ? 'bg-destructive/10 text-destructive' : 'bg-green-50 text-green-700'}`}>
                    <span className="text-xs opacity-70">Verbleibend</span>
                    <span className="font-semibold">{formatCurrency(remainingBudget)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Category filter pills */}
          <div className="flex flex-wrap gap-2 mb-4">
            {categories.map(cat => (
              <button
                key={cat.key}
                onClick={() => setCategoryFilter(cat.key)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                  categoryFilter === cat.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-foreground border-border hover:border-primary hover:text-primary'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Provider cards */}
          {filteredProviders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <IconBuilding size={40} className="mx-auto mb-3 opacity-30" />
              <p>Keine Dienstleister in dieser Kategorie gefunden.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredProviders.map(provider => {
                const isBooked = bookedProviderIdSet.has(provider.record_id);
                const isFormOpen = openBookingForms.has(provider.record_id);
                const isSubmitting = submittingBooking.has(provider.record_id);
                const form = bookingForms[provider.record_id] ?? { leistung: '', preis: '', status: 'angefragt' };
                const categoryKey = typeof provider.fields.dl_kategorie === 'object' && provider.fields.dl_kategorie
                  ? (provider.fields.dl_kategorie as { key: string }).key
                  : undefined;
                const booking = isBooked
                  ? eventBookings.find(b => extractRecordId(b.fields.buchung_dienstleister) === provider.record_id)
                  : null;

                return (
                  <div
                    key={provider.record_id}
                    className={`bg-card border rounded-2xl overflow-hidden shadow-sm transition-colors ${isBooked ? 'border-green-200' : 'border-border'}`}
                  >
                    <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      {/* Provider info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-foreground truncate">
                            {provider.fields.dl_firmenname ?? '(Kein Name)'}
                          </h3>
                          {categoryKey && (
                            <span className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground border border-border">
                              <IconTag size={10} />
                              {(provider.fields.dl_kategorie as { label?: string })?.label ?? categoryKey}
                            </span>
                          )}
                          {isBooked && (
                            <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                              <IconCheck size={10} />
                              Gebucht
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                          {(provider.fields.dl_ansprechpartner_vorname || provider.fields.dl_ansprechpartner_nachname) && (
                            <span className="flex items-center gap-1">
                              <IconUser size={11} />
                              {[provider.fields.dl_ansprechpartner_vorname, provider.fields.dl_ansprechpartner_nachname].filter(Boolean).join(' ')}
                            </span>
                          )}
                          {provider.fields.dl_telefon && (
                            <span className="flex items-center gap-1">
                              <IconPhone size={11} />
                              {provider.fields.dl_telefon}
                            </span>
                          )}
                        </div>
                        {isBooked && booking && (
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                            {booking.fields.buchung_leistung && (
                              <span className="text-muted-foreground truncate max-w-[200px]">{booking.fields.buchung_leistung}</span>
                            )}
                            {booking.fields.buchung_preis != null && (
                              <span className="font-semibold text-foreground">{formatCurrency(booking.fields.buchung_preis)}</span>
                            )}
                            {booking.fields.buchung_status && (
                              <BuchungStatusBadge statusKey={typeof booking.fields.buchung_status === 'object'
                                ? (booking.fields.buchung_status as { key: string }).key
                                : undefined} />
                            )}
                          </div>
                        )}
                      </div>

                      {/* Action */}
                      {!isBooked && (
                        <Button
                          variant={isFormOpen ? 'outline' : 'default'}
                          size="sm"
                          onClick={() => toggleBookingForm(provider.record_id)}
                          className="shrink-0"
                        >
                          {isFormOpen ? (
                            <>
                              <IconX size={14} className="mr-1.5" />
                              Abbrechen
                            </>
                          ) : (
                            <>
                              <IconPlus size={14} className="mr-1.5" />
                              Buchen
                            </>
                          )}
                        </Button>
                      )}
                    </div>

                    {/* Inline booking form */}
                    {!isBooked && isFormOpen && (
                      <div className="px-5 pb-5 pt-0 border-t border-border bg-muted/20">
                        <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="sm:col-span-2">
                            <label className="text-xs font-medium text-foreground mb-1 block">
                              Leistungsbeschreibung
                            </label>
                            <input
                              type="text"
                              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                              placeholder="Was wird geleistet?"
                              value={form.leistung}
                              onChange={e => updateBookingForm(provider.record_id, 'leistung', e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-foreground mb-1 block">
                              Preis (€)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                              placeholder="0,00"
                              value={form.preis}
                              onChange={e => updateBookingForm(provider.record_id, 'preis', e.target.value)}
                            />
                          </div>
                          <div className="flex items-end">
                            <Button
                              className="w-full"
                              disabled={isSubmitting}
                              onClick={() => handleCreateBooking(provider)}
                            >
                              {isSubmitting ? (
                                <>
                                  <IconLoader2 size={14} className="mr-1.5 animate-spin" />
                                  Wird gebucht…
                                </>
                              ) : (
                                <>
                                  <IconCheck size={14} className="mr-1.5" />
                                  Buchung erstellen
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Navigation */}
          <div className="mt-5 flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              <IconArrowLeft size={16} className="mr-2" />
              Zurück
            </Button>
            <Button onClick={() => setStep(4)}>
              Zur Zusammenfassung
              <IconArrowRight size={16} className="ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Zusammenfassung ──────────────────────────────────────── */}
      {step === 4 && selectedEvent && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Zusammenfassung</h2>

          {/* Event details card */}
          <Card className="rounded-2xl shadow-sm mb-4 overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <IconCalendar size={18} className="text-primary shrink-0" />
                {selectedEvent.fields.event_name ?? '—'}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2 text-sm text-muted-foreground">
              {selectedEvent.fields.event_datum && (
                <div className="flex items-center gap-2">
                  <IconCalendar size={14} className="shrink-0" />
                  <span>{formatDate(selectedEvent.fields.event_datum)}</span>
                </div>
              )}
              {(selectedEvent.fields.event_location_name || selectedEvent.fields.event_stadt) && (
                <div className="flex items-center gap-2">
                  <IconMapPin size={14} className="shrink-0" />
                  <span>{[selectedEvent.fields.event_location_name, selectedEvent.fields.event_strasse, selectedEvent.fields.event_stadt].filter(Boolean).join(', ')}</span>
                </div>
              )}
              {selectedEvent.fields.event_beschreibung && (
                <p className="text-xs leading-relaxed pt-1">{selectedEvent.fields.event_beschreibung}</p>
              )}
            </CardContent>
          </Card>

          {/* Guest summary */}
          <Card className="rounded-2xl shadow-sm mb-4 overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <IconUsers size={18} className="text-primary shrink-0" />
                Gäste
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm mb-3">
                <span className="font-semibold text-foreground">{eventInvitations.length}</span>
                <span className="text-muted-foreground"> Gäste eingeladen</span>
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { key: 'zugesagt', label: 'Zugesagt', className: 'bg-green-50 text-green-700 border-green-200' },
                  { key: 'abgesagt', label: 'Abgesagt', className: 'bg-red-50 text-red-700 border-red-200' },
                  { key: 'vielleicht', label: 'Vielleicht', className: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
                  { key: 'ausstehend', label: 'Ausstehend', className: 'bg-gray-50 text-gray-600 border-gray-200' },
                ].map(({ key, label, className }) => {
                  const count = eventInvitations.filter(inv => {
                    const statusKey = typeof inv.fields.rsvp_status === 'object' && inv.fields.rsvp_status
                      ? (inv.fields.rsvp_status as { key: string }).key
                      : inv.fields.rsvp_status;
                    return statusKey === key;
                  }).length;
                  return (
                    <div key={key} className={`rounded-xl border px-3 py-2 text-center ${className}`}>
                      <div className="text-xl font-bold">{count}</div>
                      <div className="text-xs">{label}</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Services summary */}
          <Card className="rounded-2xl shadow-sm mb-4 overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <IconBuilding size={18} className="text-primary shrink-0" />
                Gebuchte Dienstleister
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {eventBookings.length === 0 ? (
                <p className="text-sm text-muted-foreground">Noch keine Dienstleister gebucht.</p>
              ) : (
                <div className="space-y-2">
                  {eventBookings.map(b => {
                    const statusKey = typeof b.fields.buchung_status === 'object' && b.fields.buchung_status
                      ? (b.fields.buchung_status as { key: string }).key
                      : undefined;
                    return (
                      <div key={b.record_id} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 py-2 border-b border-border last:border-0">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{b.buchung_dienstleisterName || '—'}</p>
                          {b.fields.buchung_leistung && (
                            <p className="text-xs text-muted-foreground truncate">{b.fields.buchung_leistung}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <BuchungStatusBadge statusKey={statusKey} />
                          {b.fields.buchung_preis != null && (
                            <span className="text-sm font-semibold">{formatCurrency(b.fields.buchung_preis)}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Budget total */}
                  <div className="pt-3 mt-1 flex items-center justify-between">
                    <span className="text-sm font-medium">Gesamt gebucht:</span>
                    <span className="font-bold text-base">{formatCurrency(totalBookedCost)}</span>
                  </div>
                  {eventBudget > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Verbleibendes Budget:</span>
                      <span className={`font-semibold ${remainingBudget < 0 ? 'text-destructive' : 'text-green-600'}`}>
                        {formatCurrency(remainingBudget)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep(3)}>
              <IconArrowLeft size={16} className="mr-2" />
              Zurück
            </Button>
            <Button onClick={() => navigate('/')} className="bg-green-600 hover:bg-green-700 text-white">
              <IconCheck size={16} className="mr-2" />
              Fertig
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
