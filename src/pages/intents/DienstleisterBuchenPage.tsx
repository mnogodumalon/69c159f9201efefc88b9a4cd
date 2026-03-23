import { useState, useMemo } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichDienstleisterbuchungen } from '@/lib/enrich';
import type { EnrichedDienstleisterbuchungen } from '@/types/enriched';
import type { Dienstleisterbuchungen, Dienstleisterverzeichnis } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { DienstleisterbuchungenDialog } from '@/components/dialogs/DienstleisterbuchungenDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageShell } from '@/components/PageShell';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { AI_PHOTO_SCAN } from '@/config/ai-features';
import {
  IconCalendar,
  IconChevronDown,
  IconMail,
  IconPencil,
  IconPhone,
  IconPlus,
  IconTag,
  IconTrash,
  IconWorld,
} from '@tabler/icons-react';

const CATEGORY_LABELS: Record<string, string> = {
  catering: 'Catering',
  technik: 'Technik / AV',
  location: 'Location',
  musik: 'Musik / Entertainment',
  fotografie: 'Fotografie / Video',
  dekoration: 'Dekoration',
  transport: 'Transport',
  sonstiges: 'Sonstiges',
};

const CATEGORY_COLORS: Record<string, string> = {
  catering: 'bg-orange-100 text-orange-700',
  technik: 'bg-blue-100 text-blue-700',
  location: 'bg-purple-100 text-purple-700',
  musik: 'bg-pink-100 text-pink-700',
  fotografie: 'bg-yellow-100 text-yellow-700',
  dekoration: 'bg-green-100 text-green-700',
  transport: 'bg-cyan-100 text-cyan-700',
  sonstiges: 'bg-gray-100 text-gray-700',
};

const STATUS_COLORS: Record<string, string> = {
  angefragt: 'bg-blue-100 text-blue-700',
  angebot_erhalten: 'bg-yellow-100 text-yellow-700',
  gebucht: 'bg-green-100 text-green-700',
  bestaetigt: 'bg-emerald-100 text-emerald-700',
  storniert: 'bg-red-100 text-red-700',
};

const PAYMENT_COLORS: Record<string, string> = {
  offen: 'bg-red-50 text-red-600',
  anzahlung: 'bg-yellow-50 text-yellow-600',
  bezahlt: 'bg-green-50 text-green-600',
};

export default function DienstleisterBuchenPage() {
  const {
    eventplanung,
    dienstleisterbuchungen,
    dienstleisterverzeichnis,
    eventplanungMap,
    dienstleisterverzeichnisMap,
    loading,
    error,
    fetchAll,
  } = useDashboardData();

  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<EnrichedDienstleisterbuchungen | null>(null);
  const [prefilledProviderId, setPrefilledProviderId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EnrichedDienstleisterbuchungen | null>(null);
  const [eventDropdownOpen, setEventDropdownOpen] = useState(false);

  const enrichedBuchungen = useMemo(
    () => enrichDienstleisterbuchungen(dienstleisterbuchungen, { eventplanungMap, dienstleisterverzeichnisMap }),
    [dienstleisterbuchungen, eventplanungMap, dienstleisterverzeichnisMap]
  );

  const sortedEvents = useMemo(
    () => [...eventplanung].sort((a, b) => {
      const da = a.fields.event_datum ?? '';
      const db = b.fields.event_datum ?? '';
      return da.localeCompare(db);
    }),
    [eventplanung]
  );

  const selectedEvent = useMemo(
    () => sortedEvents.find(e => e.record_id === selectedEventId) ?? null,
    [sortedEvents, selectedEventId]
  );

  const eventBuchungen = useMemo(
    () => enrichedBuchungen.filter(b => extractRecordId(b.fields.buchung_event) === selectedEventId),
    [enrichedBuchungen, selectedEventId]
  );

  const totalBooked = useMemo(
    () => eventBuchungen
      .filter(b => b.fields.buchung_status?.key !== 'storniert')
      .reduce((sum, b) => sum + (b.fields.buchung_preis ?? 0), 0),
    [eventBuchungen]
  );

  const filteredProviders = useMemo(() => {
    if (categoryFilter === 'all') return dienstleisterverzeichnis;
    return dienstleisterverzeichnis.filter(
      p => p.fields.dl_kategorie?.key === categoryFilter
    );
  }, [dienstleisterverzeichnis, categoryFilter]);

  const bookedProviderIds = useMemo(
    () => new Set(
      eventBuchungen
        .filter(b => b.fields.buchung_status?.key !== 'storniert')
        .map(b => extractRecordId(b.fields.buchung_dienstleister))
        .filter(Boolean) as string[]
    ),
    [eventBuchungen]
  );

  async function handleDelete() {
    if (!deleteTarget) return;
    await LivingAppsService.deleteDienstleisterbuchungenEntry(deleteTarget.record_id);
    await fetchAll();
    setDeleteTarget(null);
  }

  function openCreateWithProvider(provider: Dienstleisterverzeichnis) {
    setEditRecord(null);
    setPrefilledProviderId(provider.record_id);
    setDialogOpen(true);
  }

  function openEdit(booking: EnrichedDienstleisterbuchungen) {
    setEditRecord(booking);
    setPrefilledProviderId(null);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditRecord(null);
    setPrefilledProviderId(null);
  }

  function buildDefaultValues(): Dienstleisterbuchungen['fields'] | undefined {
    if (editRecord) return editRecord.fields;
    const defaults: Dienstleisterbuchungen['fields'] = {};
    if (selectedEventId) {
      defaults.buchung_event = createRecordUrl(APP_IDS.EVENTPLANUNG, selectedEventId);
    }
    if (prefilledProviderId) {
      defaults.buchung_dienstleister = createRecordUrl(APP_IDS.DIENSTLEISTERVERZEICHNIS, prefilledProviderId);
    }
    return Object.keys(defaults).length > 0 ? defaults : undefined;
  }

  if (loading) {
    return (
      <PageShell title="Dienstleister buchen" subtitle="Lade Daten...">
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          Daten werden geladen...
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell title="Dienstleister buchen" subtitle="Fehler beim Laden">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
          {error.message}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Dienstleister buchen"
      subtitle="Dienstleister fuer Ihre Events buchen und Buchungen verwalten"
    >
      {/* Event Selector */}
      <div className="rounded-xl border bg-card p-4 overflow-hidden">
        <div className="flex items-center gap-2 mb-3">
          <IconCalendar size={18} className="text-muted-foreground shrink-0" />
          <span className="text-sm font-medium">Event auswahlen</span>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setEventDropdownOpen(v => !v)}
            className="w-full flex items-center justify-between gap-2 rounded-lg border bg-background px-4 py-3 text-left text-sm hover:bg-muted/50 transition-colors"
          >
            <span className={selectedEvent ? 'font-medium' : 'text-muted-foreground'}>
              {selectedEvent
                ? `${selectedEvent.fields.event_name ?? '—'}${selectedEvent.fields.event_datum ? ' — ' + formatDate(selectedEvent.fields.event_datum) : ''}`
                : 'Event auswahlen...'}
            </span>
            <IconChevronDown size={16} className="text-muted-foreground shrink-0" />
          </button>
          {eventDropdownOpen && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border bg-popover shadow-lg">
              {sortedEvents.length === 0 && (
                <div className="px-4 py-3 text-sm text-muted-foreground">Keine Events gefunden</div>
              )}
              {sortedEvents.map(ev => {
                const bookingCount = enrichedBuchungen.filter(
                  b => extractRecordId(b.fields.buchung_event) === ev.record_id
                ).length;
                return (
                  <button
                    key={ev.record_id}
                    type="button"
                    onClick={() => {
                      setSelectedEventId(ev.record_id);
                      setEventDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-muted/50 transition-colors border-b last:border-b-0 ${
                      selectedEventId === ev.record_id ? 'bg-primary/5 font-medium' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{ev.fields.event_name ?? '—'}</div>
                      {ev.fields.event_datum && (
                        <div className="text-xs text-muted-foreground">{formatDate(ev.fields.event_datum)}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {ev.fields.event_status && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {ev.fields.event_status.label}
                        </span>
                      )}
                      {bookingCount > 0 && (
                        <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Current bookings for selected event */}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-base">
                {selectedEvent ? `Buchungen: ${selectedEvent.fields.event_name}` : 'Buchungen'}
              </h2>
              {selectedEvent && eventBuchungen.length > 0 && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  Gesamt (aktiv): {formatCurrency(totalBooked)}
                </p>
              )}
            </div>
            {selectedEventId && (
              <button
                type="button"
                onClick={() => {
                  setEditRecord(null);
                  setPrefilledProviderId(null);
                  setDialogOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
              >
                <IconPlus size={16} />
                Buchung
              </button>
            )}
          </div>

          {!selectedEventId ? (
            <div className="rounded-xl border bg-muted/30 p-10 text-center text-muted-foreground text-sm">
              Wahlen Sie oben ein Event aus, um die Buchungen anzuzeigen.
            </div>
          ) : eventBuchungen.length === 0 ? (
            <div className="rounded-xl border bg-muted/30 p-10 text-center text-muted-foreground text-sm">
              Noch keine Buchungen fur dieses Event.
              <br />
              Wahlen Sie einen Dienstleister aus der Liste und klicken Sie "Buchen".
            </div>
          ) : (
            <div className="space-y-3">
              {eventBuchungen.map(booking => {
                const statusKey = booking.fields.buchung_status?.key ?? '';
                const paymentKey = booking.fields.buchung_zahlungsstatus?.key ?? '';
                return (
                  <div
                    key={booking.record_id}
                    className={`rounded-xl border bg-card p-4 overflow-hidden ${
                      statusKey === 'storniert' ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 min-w-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate text-sm">
                            {booking.buchung_dienstleisterName || '—'}
                          </span>
                          {booking.fields.buchung_dienstleister && (() => {
                            const pid = extractRecordId(booking.fields.buchung_dienstleister);
                            const provider = pid ? dienstleisterverzeichnisMap.get(pid) : undefined;
                            const catKey = provider?.fields.dl_kategorie?.key ?? '';
                            return catKey ? (
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[catKey] ?? 'bg-gray-100 text-gray-700'}`}>
                                {CATEGORY_LABELS[catKey] ?? catKey}
                              </span>
                            ) : null;
                          })()}
                        </div>
                        {booking.fields.buchung_leistung && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {booking.fields.buchung_leistung}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {statusKey && (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[statusKey] ?? 'bg-gray-100 text-gray-700'}`}>
                              {booking.fields.buchung_status?.label ?? statusKey}
                            </span>
                          )}
                          {paymentKey && (
                            <span className={`rounded-full px-2 py-0.5 text-xs ${PAYMENT_COLORS[paymentKey] ?? 'bg-gray-50 text-gray-600'}`}>
                              {booking.fields.buchung_zahlungsstatus?.label ?? paymentKey}
                            </span>
                          )}
                          {booking.fields.buchung_preis != null && (
                            <span className="text-xs font-semibold text-foreground">
                              {formatCurrency(booking.fields.buchung_preis)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEdit(booking)}
                          className="rounded-lg p-2 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          title="Bearbeiten"
                        >
                          <IconPencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(booking)}
                          className="rounded-lg p-2 hover:bg-red-50 transition-colors text-muted-foreground hover:text-red-600"
                          title="Loschen"
                        >
                          <IconTrash size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Service provider directory */}
        <div className="space-y-4">
          <div>
            <h2 className="font-semibold text-base">Dienstleisterverzeichnis</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {filteredProviders.length} Dienstleister
            </p>
          </div>

          {/* Category filter chips */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                categoryFilter === 'all'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Alle
            </button>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setCategoryFilter(key)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  categoryFilter === key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {filteredProviders.length === 0 ? (
            <div className="rounded-xl border bg-muted/30 p-10 text-center text-muted-foreground text-sm">
              Keine Dienstleister in dieser Kategorie.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 max-h-[600px] overflow-y-auto pr-1">
              {filteredProviders.map(provider => {
                const catKey = provider.fields.dl_kategorie?.key ?? '';
                const contactName = [
                  provider.fields.dl_ansprechpartner_vorname,
                  provider.fields.dl_ansprechpartner_nachname,
                ].filter(Boolean).join(' ');
                const isBooked = bookedProviderIds.has(provider.record_id);
                return (
                  <div
                    key={provider.record_id}
                    className={`rounded-xl border bg-card p-4 overflow-hidden ${
                      isBooked ? 'border-green-300 bg-green-50/30' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 min-w-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">
                            {provider.fields.dl_firmenname ?? '—'}
                          </span>
                          {catKey && (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium flex items-center gap-1 ${CATEGORY_COLORS[catKey] ?? 'bg-gray-100 text-gray-700'}`}>
                              <IconTag size={10} />
                              {CATEGORY_LABELS[catKey] ?? catKey}
                            </span>
                          )}
                          {isBooked && (
                            <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">
                              Gebucht
                            </span>
                          )}
                        </div>
                        {contactName && (
                          <p className="text-xs text-muted-foreground mt-1">{contactName}</p>
                        )}
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                          {provider.fields.dl_email && (
                            <a
                              href={`mailto:${provider.fields.dl_email}`}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                              onClick={e => e.stopPropagation()}
                            >
                              <IconMail size={12} />
                              <span className="truncate max-w-[140px]">{provider.fields.dl_email}</span>
                            </a>
                          )}
                          {provider.fields.dl_telefon && (
                            <a
                              href={`tel:${provider.fields.dl_telefon}`}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                              onClick={e => e.stopPropagation()}
                            >
                              <IconPhone size={12} />
                              {provider.fields.dl_telefon}
                            </a>
                          )}
                          {provider.fields.dl_website && (
                            <a
                              href={provider.fields.dl_website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                              onClick={e => e.stopPropagation()}
                            >
                              <IconWorld size={12} />
                              Website
                            </a>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openCreateWithProvider(provider)}
                        disabled={!selectedEventId}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors shrink-0 ${
                          !selectedEventId
                            ? 'bg-muted text-muted-foreground cursor-not-allowed'
                            : 'bg-primary text-primary-foreground hover:bg-primary/90'
                        }`}
                        title={!selectedEventId ? 'Bitte zuerst ein Event auswahlen' : 'Dienstleister buchen'}
                      >
                        <IconPlus size={14} />
                        Buchen
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <DienstleisterbuchungenDialog
        open={dialogOpen}
        onClose={closeDialog}
        onSubmit={async (fields) => {
          if (editRecord) {
            await LivingAppsService.updateDienstleisterbuchungenEntry(editRecord.record_id, fields);
          } else {
            await LivingAppsService.createDienstleisterbuchungenEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={buildDefaultValues()}
        eventplanungList={eventplanung}
        dienstleisterverzeichnisList={dienstleisterverzeichnis}
        enablePhotoScan={AI_PHOTO_SCAN['Dienstleisterbuchungen']}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Buchung loschen"
        description={
          deleteTarget
            ? `Buchung fur "${deleteTarget.buchung_dienstleisterName}" wirklich loschen?`
            : ''
        }
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </PageShell>
  );
}
