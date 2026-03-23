import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichDienstleisterbuchungen } from '@/lib/enrich';
import type { EnrichedDienstleisterbuchungen } from '@/types/enriched';
import type { Eventplanung, Dienstleisterverzeichnis } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  IconBuildingStore,
  IconTrash,
  IconArrowLeft,
  IconSearch,
  IconPhone,
  IconMail,
  IconCheck,
  IconX,
  IconCalendar,
  IconMapPin,
  IconUsers,
  IconCurrencyEuro,
  IconChevronRight,
} from '@tabler/icons-react';

// ── Category config ────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'alle', label: 'Alle' },
  { key: 'catering', label: 'Catering' },
  { key: 'technik', label: 'Technik' },
  { key: 'location', label: 'Location' },
  { key: 'musik', label: 'Musik' },
  { key: 'fotografie', label: 'Fotografie' },
  { key: 'dekoration', label: 'Dekoration' },
  { key: 'transport', label: 'Transport' },
  { key: 'sonstiges', label: 'Sonstiges' },
];

const CATEGORY_COLORS: Record<string, string> = {
  catering: 'bg-orange-100 text-orange-800',
  technik: 'bg-blue-100 text-blue-800',
  location: 'bg-purple-100 text-purple-800',
  musik: 'bg-pink-100 text-pink-800',
  fotografie: 'bg-yellow-100 text-yellow-800',
  dekoration: 'bg-green-100 text-green-800',
  transport: 'bg-cyan-100 text-cyan-800',
  sonstiges: 'bg-gray-100 text-gray-700',
};

const STATUS_COLORS: Record<string, string> = {
  angefragt: 'bg-blue-100 text-blue-800',
  angebot_erhalten: 'bg-yellow-100 text-yellow-800',
  gebucht: 'bg-emerald-100 text-emerald-800',
  bestaetigt: 'bg-green-100 text-green-800',
  storniert: 'bg-red-100 text-red-800',
};

const EVENT_STATUS_COLORS: Record<string, string> = {
  in_planung: 'bg-blue-100 text-blue-800',
  einladungen_versendet: 'bg-purple-100 text-purple-800',
  bestaetigt: 'bg-emerald-100 text-emerald-800',
  abgeschlossen: 'bg-gray-100 text-gray-700',
  abgesagt: 'bg-red-100 text-red-800',
};

// ── Booking form state ─────────────────────────────────────────────────────────

interface BookingFormState {
  buchung_leistung: string;
  buchung_preis: string;
  buchung_status: string;
  buchung_notizen: string;
}

const emptyForm = (): BookingFormState => ({
  buchung_leistung: '',
  buchung_preis: '',
  buchung_status: 'angefragt',
  buchung_notizen: '',
});

// ── Main Component ─────────────────────────────────────────────────────────────

export default function DienstleisterBuchenPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { eventplanung, dienstleisterbuchungen, dienstleisterverzeichnis, eventplanungMap, dienstleisterverzeichnisMap, loading, error, fetchAll } = useDashboardData();

  // ── All state declared before any early returns ──────────────────────────────
  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    searchParams.get('eventId')
  );
  const [categoryFilter, setCategoryFilter] = useState<string>('alle');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [bookingForm, setBookingForm] = useState<BookingFormState>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // ── Derived data ─────────────────────────────────────────────────────────────

  const sortedEvents = useMemo(() => {
    return [...eventplanung].sort((a, b) => {
      const da = a.fields.event_datum ?? '';
      const db = b.fields.event_datum ?? '';
      return da < db ? -1 : da > db ? 1 : 0;
    });
  }, [eventplanung]);

  const enrichedBuchungen = useMemo(() => {
    return enrichDienstleisterbuchungen(dienstleisterbuchungen, { eventplanungMap, dienstleisterverzeichnisMap });
  }, [dienstleisterbuchungen, eventplanungMap, dienstleisterverzeichnisMap]);

  const bookingsPerEvent = useMemo(() => {
    const map = new Map<string, number>();
    enrichedBuchungen.forEach(b => {
      const eid = extractRecordId(b.fields.buchung_event);
      if (eid) map.set(eid, (map.get(eid) ?? 0) + 1);
    });
    return map;
  }, [enrichedBuchungen]);

  const selectedEvent = useMemo<Eventplanung | null>(() => {
    if (!selectedEventId) return null;
    return eventplanungMap.get(selectedEventId) ?? null;
  }, [selectedEventId, eventplanungMap]);

  const eventBookings = useMemo<EnrichedDienstleisterbuchungen[]>(() => {
    if (!selectedEventId) return [];
    return enrichedBuchungen.filter(b => extractRecordId(b.fields.buchung_event) === selectedEventId);
  }, [selectedEventId, enrichedBuchungen]);

  const bookedProviderIds = useMemo<Set<string>>(() => {
    const ids = new Set<string>();
    eventBookings.forEach(b => {
      const pid = extractRecordId(b.fields.buchung_dienstleister);
      if (pid) ids.add(pid);
    });
    return ids;
  }, [eventBookings]);

  const totalBooked = useMemo(() => {
    return eventBookings.reduce((sum, b) => sum + (b.fields.buchung_preis ?? 0), 0);
  }, [eventBookings]);

  const filteredProviders = useMemo<Dienstleisterverzeichnis[]>(() => {
    return dienstleisterverzeichnis.filter(p => {
      const matchesCategory =
        categoryFilter === 'alle' ||
        p.fields.dl_kategorie?.key === categoryFilter;
      const name = p.fields.dl_firmenname?.toLowerCase() ?? '';
      const contact = `${p.fields.dl_ansprechpartner_vorname ?? ''} ${p.fields.dl_ansprechpartner_nachname ?? ''}`.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        name.includes(searchQuery.toLowerCase()) ||
        contact.includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [dienstleisterverzeichnis, categoryFilter, searchQuery]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleSelectEvent = (eventId: string) => {
    setSelectedEventId(eventId);
    setSearchParams({ eventId });
    setExpandedProvider(null);
    setBookingForm(emptyForm());
    setCategoryFilter('alle');
    setSearchQuery('');
  };

  const handleBack = () => {
    setSelectedEventId(null);
    setSearchParams({});
    setExpandedProvider(null);
    setBookingForm(emptyForm());
  };

  const handleToggleProvider = (providerId: string) => {
    if (expandedProvider === providerId) {
      setExpandedProvider(null);
      setBookingForm(emptyForm());
    } else {
      setExpandedProvider(providerId);
      setBookingForm(emptyForm());
    }
  };

  const handleSubmitBooking = async (provider: Dienstleisterverzeichnis) => {
    if (!selectedEventId) return;
    if (!bookingForm.buchung_leistung.trim()) return;
    setSubmitting(true);
    try {
      await LivingAppsService.createDienstleisterbuchungenEntry({
        buchung_event: createRecordUrl(APP_IDS.EVENTPLANUNG, selectedEventId),
        buchung_dienstleister: createRecordUrl(APP_IDS.DIENSTLEISTERVERZEICHNIS, provider.record_id),
        buchung_leistung: bookingForm.buchung_leistung,
        buchung_preis: bookingForm.buchung_preis ? parseFloat(bookingForm.buchung_preis) : undefined,
        buchung_status: bookingForm.buchung_status ? { key: bookingForm.buchung_status, label: bookingForm.buchung_status } : undefined,
        buchung_notizen: bookingForm.buchung_notizen || undefined,
      });
      await fetchAll();
      setExpandedProvider(null);
      setBookingForm(emptyForm());
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteBooking = async (recordId: string) => {
    await LivingAppsService.deleteDienstleisterbuchungenEntry(recordId);
    await fetchAll();
    setDeleteConfirm(null);
  };

  // ── Budget bar ────────────────────────────────────────────────────────────────

  const budget = selectedEvent?.fields.event_budget ?? 0;
  const budgetPct = budget > 0 ? Math.min((totalBooked / budget) * 100, 100) : 0;
  const budgetOverflow = budget > 0 && totalBooked > budget;
  const budgetBarColor =
    budgetOverflow
      ? 'bg-red-500'
      : budgetPct >= 80
      ? 'bg-yellow-400'
      : 'bg-emerald-500';

  // ── Early returns ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground text-sm animate-pulse">Daten werden geladen…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-destructive text-sm">Fehler: {error.message}</div>
      </div>
    );
  }

  // ── Phase 1: Event auswählen ─────────────────────────────────────────────────

  if (!selectedEventId || !selectedEvent) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <IconBuildingStore size={24} className="text-primary" stroke={1.5} />
            <h1 className="text-2xl font-bold">Dienstleister buchen</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Wähle ein Event aus, um Dienstleister zu buchen und das Budget zu verwalten.
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex gap-2 mb-8">
          <div className="h-1.5 flex-1 rounded-full bg-primary" />
          <div className="h-1.5 flex-1 rounded-full bg-muted" />
        </div>

        {/* Event cards */}
        {sortedEvents.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            Noch keine Events vorhanden.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedEvents.map(event => {
              const bookingCount = bookingsPerEvent.get(event.record_id) ?? 0;
              const statusKey = event.fields.event_status?.key ?? '';
              const statusLabel = event.fields.event_status?.label ?? '';
              return (
                <button
                  key={event.record_id}
                  onClick={() => handleSelectEvent(event.record_id)}
                  className="text-left bg-card rounded-2xl shadow-sm border border-border p-5 hover:shadow-md hover:border-primary/40 transition-all group overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-semibold text-base leading-tight min-w-0 truncate flex-1">
                      {event.fields.event_name ?? '(Kein Name)'}
                    </h3>
                    <IconChevronRight size={18} className="text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-0.5" stroke={1.5} />
                  </div>

                  <div className="space-y-1.5 mb-4">
                    {event.fields.event_datum && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <IconCalendar size={14} stroke={1.5} />
                        <span>{formatDate(event.fields.event_datum)}</span>
                      </div>
                    )}
                    {event.fields.event_location_name && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <IconMapPin size={14} stroke={1.5} />
                        <span className="truncate">{event.fields.event_location_name}</span>
                      </div>
                    )}
                    {event.fields.event_gaestezahl != null && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <IconUsers size={14} stroke={1.5} />
                        <span>{event.fields.event_gaestezahl} Gäste</span>
                      </div>
                    )}
                    {event.fields.event_budget != null && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <IconCurrencyEuro size={14} stroke={1.5} />
                        <span>{formatCurrency(event.fields.event_budget)}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    {statusLabel ? (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${EVENT_STATUS_COLORS[statusKey] ?? 'bg-gray-100 text-gray-700'}`}>
                        {statusLabel}
                      </span>
                    ) : <span />}
                    {bookingCount > 0 && (
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        {bookingCount} Buchung{bookingCount !== 1 ? 'en' : ''}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Phase 2: Dienstleister buchen ────────────────────────────────────────────

  const statusOptions = LOOKUP_OPTIONS.dienstleisterbuchungen?.buchung_status ?? [];

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-4">
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors"
        >
          <IconArrowLeft size={16} stroke={1.5} />
          Alle Events
        </button>
        <div className="flex items-center gap-3">
          <IconBuildingStore size={22} className="text-primary" stroke={1.5} />
          <div>
            <h1 className="text-xl font-bold leading-tight">{selectedEvent.fields.event_name ?? 'Event'}</h1>
            <p className="text-muted-foreground text-sm">Dienstleister buchen</p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex gap-2 mt-4">
          <div className="h-1.5 flex-1 rounded-full bg-primary" />
          <div className="h-1.5 flex-1 rounded-full bg-primary" />
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-col lg:flex-row gap-5 mt-5">

        {/* ── LEFT: Event summary + existing bookings ──────────────────────── */}
        <div className="lg:w-80 xl:w-96 shrink-0 space-y-4">

          {/* Event info card */}
          <div className="bg-card rounded-2xl border border-border shadow-sm p-4 space-y-3">
            <div className="space-y-1.5">
              {selectedEvent.fields.event_datum && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <IconCalendar size={14} stroke={1.5} />
                  {formatDate(selectedEvent.fields.event_datum)}
                </div>
              )}
              {selectedEvent.fields.event_location_name && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <IconMapPin size={14} stroke={1.5} />
                  <span className="truncate">{selectedEvent.fields.event_location_name}</span>
                </div>
              )}
              {selectedEvent.fields.event_gaestezahl != null && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <IconUsers size={14} stroke={1.5} />
                  {selectedEvent.fields.event_gaestezahl} Gäste
                </div>
              )}
              {selectedEvent.fields.event_status && (
                <div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${EVENT_STATUS_COLORS[selectedEvent.fields.event_status.key] ?? 'bg-gray-100 text-gray-700'}`}>
                    {selectedEvent.fields.event_status.label}
                  </span>
                </div>
              )}
            </div>

            {/* Budget tracker */}
            {budget > 0 ? (
              <div className="pt-2 border-t border-border">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium text-sm">Budget</span>
                  <span className={`font-semibold text-sm ${budgetOverflow ? 'text-red-600' : budgetPct >= 80 ? 'text-yellow-600' : 'text-emerald-600'}`}>
                    {Math.round(budgetPct)}%
                  </span>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${budgetBarColor}`}
                    style={{ width: `${budgetPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5 text-xs text-muted-foreground">
                  <span>Gebucht: <span className="font-semibold text-foreground">{formatCurrency(totalBooked)}</span></span>
                  <span>von {formatCurrency(budget)}</span>
                </div>
                {budgetOverflow && (
                  <p className="text-xs text-red-600 font-medium mt-1">Budget überschritten!</p>
                )}
              </div>
            ) : (
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground">Kein Budget definiert</p>
                <p className="text-sm font-semibold mt-0.5">Gebucht: {formatCurrency(totalBooked)}</p>
              </div>
            )}
          </div>

          {/* Existing bookings */}
          <div className="bg-card rounded-2xl border border-border shadow-sm p-4">
            <h3 className="font-semibold text-sm mb-3">
              Buchungen{eventBookings.length > 0 && ` (${eventBookings.length})`}
            </h3>
            {eventBookings.length === 0 ? (
              <p className="text-muted-foreground text-xs text-center py-4">
                Noch keine Buchungen für dieses Event.
              </p>
            ) : (
              <div className="space-y-2">
                {eventBookings.map(booking => {
                  const bStatusKey = booking.fields.buchung_status?.key ?? '';
                  const bStatusLabel = booking.fields.buchung_status?.label ?? '';
                  return (
                    <div key={booking.record_id} className="rounded-xl border border-border p-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{booking.buchung_dienstleisterName || '(Unbekannt)'}</p>
                          {booking.fields.buchung_leistung && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{booking.fields.buchung_leistung}</p>
                          )}
                        </div>
                        {deleteConfirm === booking.record_id ? (
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => handleDeleteBooking(booking.record_id)}
                              className="p-1.5 rounded-lg bg-destructive/10 text-red-600 hover:bg-destructive/20 transition-colors"
                              title="Bestätigen"
                            >
                              <IconCheck size={14} stroke={1.5} />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-secondary transition-colors"
                              title="Abbrechen"
                            >
                              <IconX size={14} stroke={1.5} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(booking.record_id)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-destructive/10 transition-colors shrink-0"
                            title="Buchung löschen"
                          >
                            <IconTrash size={14} stroke={1.5} />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        {bStatusLabel && (
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${STATUS_COLORS[bStatusKey] ?? 'bg-gray-100 text-gray-700'}`}>
                            {bStatusLabel}
                          </span>
                        )}
                        {booking.fields.buchung_zahlungsstatus && (
                          <span className="text-xs text-muted-foreground">
                            {booking.fields.buchung_zahlungsstatus.label}
                          </span>
                        )}
                        {booking.fields.buchung_preis != null && (
                          <span className="text-xs font-semibold ml-auto">{formatCurrency(booking.fields.buchung_preis)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Provider directory ────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <div className="bg-card rounded-2xl border border-border shadow-sm p-4">
            <h3 className="font-semibold mb-4">Dienstleister-Verzeichnis</h3>

            {/* Search */}
            <div className="relative mb-3">
              <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" stroke={1.5} />
              <Input
                placeholder="Firmenname oder Ansprechpartner suchen…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 text-sm"
              />
            </div>

            {/* Category filter */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.key}
                  onClick={() => setCategoryFilter(cat.key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                    categoryFilter === cat.key
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted text-muted-foreground border-transparent hover:border-border'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Provider grid */}
            {filteredProviders.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Keine Dienstleister gefunden.
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {filteredProviders.map(provider => {
                  const isBooked = bookedProviderIds.has(provider.record_id);
                  const isExpanded = expandedProvider === provider.record_id;
                  const catKey = provider.fields.dl_kategorie?.key ?? 'sonstiges';
                  const catLabel = provider.fields.dl_kategorie?.label ?? 'Sonstiges';
                  const contactName = [provider.fields.dl_ansprechpartner_vorname, provider.fields.dl_ansprechpartner_nachname].filter(Boolean).join(' ');

                  return (
                    <div key={provider.record_id} className={`rounded-xl border transition-all overflow-hidden ${isExpanded ? 'border-primary/50 shadow-sm' : 'border-border'}`}>
                      {/* Provider card header */}
                      <div className="p-3 relative">
                        {/* Booked badge */}
                        {isBooked && (
                          <div className="absolute top-3 right-3">
                            <span className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                              <IconCheck size={11} stroke={2} />
                              Gebucht
                            </span>
                          </div>
                        )}

                        <div className="pr-16">
                          <p className="font-semibold text-sm leading-tight truncate">
                            {provider.fields.dl_firmenname ?? '(Kein Name)'}
                          </p>
                          <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-1 ${CATEGORY_COLORS[catKey] ?? 'bg-gray-100 text-gray-700'}`}>
                            {catLabel}
                          </span>
                        </div>

                        {contactName && (
                          <p className="text-xs text-muted-foreground mt-2 truncate">{contactName}</p>
                        )}

                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                          {provider.fields.dl_telefon && (
                            <a href={`tel:${provider.fields.dl_telefon}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                              <IconPhone size={11} stroke={1.5} />
                              {provider.fields.dl_telefon}
                            </a>
                          )}
                          {provider.fields.dl_email && (
                            <a href={`mailto:${provider.fields.dl_email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                              <IconMail size={11} stroke={1.5} />
                              <span className="truncate max-w-[160px]">{provider.fields.dl_email}</span>
                            </a>
                          )}
                        </div>

                        {/* Book button */}
                        <div className="mt-3">
                          <Button
                            size="sm"
                            variant={isExpanded ? 'outline' : 'default'}
                            onClick={() => handleToggleProvider(provider.record_id)}
                            className="w-full text-xs h-8"
                          >
                            {isExpanded ? 'Abbrechen' : isBooked ? 'Erneut buchen' : 'Buchen'}
                          </Button>
                        </div>
                      </div>

                      {/* Inline booking form */}
                      {isExpanded && (
                        <div className="border-t border-border bg-secondary/30 p-3 space-y-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Buchung anlegen</p>

                          {/* Leistungsbeschreibung */}
                          <div>
                            <label className="text-xs font-medium mb-1 block">Leistungsbeschreibung <span className="text-red-500">*</span></label>
                            <textarea
                              rows={2}
                              placeholder="Welche Leistung wird gebucht?"
                              value={bookingForm.buchung_leistung}
                              onChange={e => setBookingForm(f => ({ ...f, buchung_leistung: e.target.value }))}
                              className="w-full text-sm rounded-lg border border-border bg-card px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                          </div>

                          {/* Preis */}
                          <div>
                            <label className="text-xs font-medium mb-1 block">Preis (€)</label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0,00"
                              value={bookingForm.buchung_preis}
                              onChange={e => setBookingForm(f => ({ ...f, buchung_preis: e.target.value }))}
                              className="text-sm h-8"
                            />
                          </div>

                          {/* Status */}
                          <div>
                            <label className="text-xs font-medium mb-1 block">Status</label>
                            <select
                              value={bookingForm.buchung_status}
                              onChange={e => setBookingForm(f => ({ ...f, buchung_status: e.target.value }))}
                              className="w-full text-sm rounded-lg border border-border bg-card px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                            >
                              {statusOptions.map(opt => (
                                <option key={opt.key} value={opt.key}>{opt.label}</option>
                              ))}
                            </select>
                          </div>

                          {/* Notizen */}
                          <div>
                            <label className="text-xs font-medium mb-1 block">Notizen (optional)</label>
                            <textarea
                              rows={2}
                              placeholder="Zusätzliche Hinweise…"
                              value={bookingForm.buchung_notizen}
                              onChange={e => setBookingForm(f => ({ ...f, buchung_notizen: e.target.value }))}
                              className="w-full text-sm rounded-lg border border-border bg-card px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                          </div>

                          {/* Actions */}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleSubmitBooking(provider)}
                              disabled={submitting || !bookingForm.buchung_leistung.trim()}
                              className="flex-1 text-xs h-8"
                            >
                              {submitting ? 'Wird gespeichert…' : 'Buchung anlegen'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { setExpandedProvider(null); setBookingForm(emptyForm()); }}
                              className="text-xs h-8"
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
            )}
          </div>
        </div>
      </div>

      {/* Bottom budget summary bar (mobile sticky) */}
      {budget > 0 && (
        <div className="lg:hidden mt-4 bg-card rounded-2xl border border-border shadow-sm p-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="text-sm font-medium">Budget-Übersicht</span>
            <Badge
              className={`text-xs ${
                budgetOverflow ? 'bg-red-100 text-red-800' : budgetPct >= 80 ? 'bg-yellow-100 text-yellow-800' : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {Math.round(budgetPct)}% genutzt
            </Badge>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
            <div className={`h-full rounded-full transition-all ${budgetBarColor}`} style={{ width: `${budgetPct}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            Gebucht: <span className="font-semibold text-foreground">{formatCurrency(totalBooked)}</span> von {formatCurrency(budget)}
          </p>
        </div>
      )}
    </div>
  );
}
