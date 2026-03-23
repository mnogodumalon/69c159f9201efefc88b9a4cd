import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichEinladungenRsvp, enrichDienstleisterbuchungen } from '@/lib/enrich';
import type { EnrichedEinladungenRsvp, EnrichedDienstleisterbuchungen } from '@/types/enriched';
import type { Eventplanung } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  IconCalendarEvent,
  IconMapPin,
  IconUsers,
  IconBuildingStore,
  IconChevronRight,
  IconChevronLeft,
  IconCheck,
  IconAlertTriangle,
  IconCircleCheck,
  IconCurrencyEuro,
  IconClock,
  IconX,
  IconQuestionMark,
} from '@tabler/icons-react';

// ─── Step indicator ──────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: 'Auswahl' },
  { n: 2, label: 'RSVPs' },
  { n: 3, label: 'Zahlungen' },
  { n: 4, label: 'Abschluss' },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((s, idx) => (
        <div key={s.n} className="flex items-center flex-1 min-w-0">
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                s.n < current
                  ? 'bg-primary text-primary-foreground'
                  : s.n === current
                  ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {s.n < current ? <IconCheck size={14} stroke={2.5} /> : s.n}
            </div>
            <span
              className={`text-xs font-medium whitespace-nowrap ${
                s.n === current ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              {s.label}
            </span>
          </div>
          {idx < STEPS.length - 1 && (
            <div
              className={`h-0.5 flex-1 mx-2 mt-[-12px] transition-colors ${
                s.n < current ? 'bg-primary' : 'bg-muted'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Status badge helpers ─────────────────────────────────────────────────────

function statusColor(key: string | undefined) {
  switch (key) {
    case 'in_planung': return 'bg-blue-100 text-blue-700';
    case 'einladungen_versendet': return 'bg-purple-100 text-purple-700';
    case 'bestaetigt': return 'bg-green-100 text-green-700';
    case 'abgeschlossen': return 'bg-slate-100 text-slate-700';
    case 'abgesagt': return 'bg-red-100 text-red-700';
    default: return 'bg-muted text-muted-foreground';
  }
}

function rsvpColor(key: string | undefined) {
  switch (key) {
    case 'zugesagt': return 'bg-green-100 text-green-700';
    case 'abgesagt': return 'bg-red-100 text-red-700';
    case 'vielleicht': return 'bg-amber-100 text-amber-700';
    case 'ausstehend': return 'bg-gray-100 text-gray-600';
    default: return 'bg-muted text-muted-foreground';
  }
}

function zahlungColor(key: string | undefined) {
  switch (key) {
    case 'bezahlt': return 'bg-green-100 text-green-700';
    case 'anzahlung': return 'bg-amber-100 text-amber-700';
    case 'offen': return 'bg-red-100 text-red-700';
    default: return 'bg-muted text-muted-foreground';
  }
}

// ─── Step 1: Event auswählen ─────────────────────────────────────────────────

function Step1EventSelect({
  events,
  einladungenRsvp,
  dienstleisterbuchungen,
  onSelect,
}: {
  events: Eventplanung[];
  einladungenRsvp: EnrichedEinladungenRsvp[];
  dienstleisterbuchungen: EnrichedDienstleisterbuchungen[];
  onSelect: (eventId: string) => void;
}) {
  const openEvents = events.filter(
    (e) => e.fields.event_status?.key !== 'abgeschlossen'
  );

  if (openEvents.length === 0) {
    return (
      <div className="text-center py-16">
        <IconCircleCheck size={48} className="text-primary mx-auto mb-4" stroke={1.5} />
        <h3 className="text-lg font-semibold mb-2">Alle Events abgeschlossen</h3>
        <p className="text-muted-foreground">Es gibt keine offenen Events, die abgeschlossen werden müssen.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1">Event auswählen</h2>
      <p className="text-muted-foreground mb-6">Wählen Sie das Event, das Sie abschliessen möchten.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {openEvents.map((event) => {
          const rsvpCount = einladungenRsvp.filter(
            (r) => extractRecordId(r.fields.einladung_event) === event.record_id
          ).length;
          const bookingCount = dienstleisterbuchungen.filter(
            (b) => extractRecordId(b.fields.buchung_event) === event.record_id
          ).length;
          return (
            <button
              key={event.record_id}
              onClick={() => onSelect(event.record_id)}
              className="text-left w-full"
            >
              <Card className="overflow-hidden hover:border-primary transition-colors cursor-pointer group">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-semibold text-base truncate min-w-0 group-hover:text-primary transition-colors">
                      {event.fields.event_name ?? '(Kein Name)'}
                    </h3>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${statusColor(
                        event.fields.event_status?.key
                      )}`}
                    >
                      {event.fields.event_status?.label ?? '—'}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-sm text-muted-foreground">
                    {event.fields.event_datum && (
                      <div className="flex items-center gap-1.5">
                        <IconCalendarEvent size={14} stroke={1.5} />
                        <span>{formatDate(event.fields.event_datum)}</span>
                      </div>
                    )}
                    {event.fields.event_location_name && (
                      <div className="flex items-center gap-1.5">
                        <IconMapPin size={14} stroke={1.5} />
                        <span className="truncate">{event.fields.event_location_name}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 pt-1">
                      <div className="flex items-center gap-1">
                        <IconUsers size={14} stroke={1.5} />
                        <span>{rsvpCount} Einladungen</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <IconBuildingStore size={14} stroke={1.5} />
                        <span>{bookingCount} Dienstleister</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end mt-3">
                    <IconChevronRight size={16} className="text-muted-foreground group-hover:text-primary transition-colors" stroke={2} />
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 2: RSVP Status aktualisieren ───────────────────────────────────────

const RSVP_OPTIONS = [
  { key: 'ausstehend', label: 'Ausstehend', icon: IconClock },
  { key: 'zugesagt', label: 'Zugesagt', icon: IconCheck },
  { key: 'abgesagt', label: 'Abgesagt', icon: IconX },
  { key: 'vielleicht', label: 'Vielleicht', icon: IconQuestionMark },
];

function Step2Rsvp({
  event,
  rsvps,
  onBack,
  onNext,
  fetchAll,
}: {
  event: Eventplanung;
  rsvps: EnrichedEinladungenRsvp[];
  onBack: () => void;
  onNext: () => void;
  fetchAll: () => void;
}) {
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  function getStatus(rsvp: EnrichedEinladungenRsvp): string {
    return changes[rsvp.record_id] ?? rsvp.fields.rsvp_status?.key ?? 'ausstehend';
  }

  const counts = useMemo(() => {
    const result = { zugesagt: 0, abgesagt: 0, ausstehend: 0, vielleicht: 0 };
    rsvps.forEach((r) => {
      const s = getStatus(r);
      if (s === 'zugesagt') result.zugesagt++;
      else if (s === 'abgesagt') result.abgesagt++;
      else if (s === 'vielleicht') result.vielleicht++;
      else result.ausstehend++;
    });
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rsvps, changes]);

  const changedCount = Object.keys(changes).length;

  async function handleSave() {
    setSaving(true);
    const today = new Date().toISOString().slice(0, 10);
    try {
      const updates = Object.entries(changes).map(([id, statusKey]) =>
        LivingAppsService.updateEinladungenRsvpEntry(id, {
          rsvp_status: statusKey as never,
          rsvp_datum: today,
        })
      );
      await Promise.all(updates);
      setSavedIds(new Set(Object.keys(changes)));
      setChanges({});
      fetchAll();
    } catch (err) {
      console.error('Fehler beim Speichern der RSVPs:', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1">
        RSVP-Status aktualisieren
      </h2>
      <p className="text-muted-foreground mb-4">
        <span className="font-medium text-foreground">{event.fields.event_name}</span> — Übersicht der Einladungen
      </p>

      {/* Live counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { key: 'zugesagt', label: 'Zugesagt', color: 'text-green-600', bg: 'bg-green-50' },
          { key: 'abgesagt', label: 'Abgesagt', color: 'text-red-600', bg: 'bg-red-50' },
          { key: 'ausstehend', label: 'Ausstehend', color: 'text-gray-600', bg: 'bg-gray-50' },
          { key: 'vielleicht', label: 'Vielleicht', color: 'text-amber-600', bg: 'bg-amber-50' },
        ].map((item) => (
          <div key={item.key} className={`${item.bg} rounded-xl p-3 text-center`}>
            <div className={`text-2xl font-bold ${item.color}`}>
              {counts[item.key as keyof typeof counts]}
            </div>
            <div className="text-xs text-muted-foreground">{item.label}</div>
          </div>
        ))}
      </div>

      {rsvps.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <IconUsers size={40} className="mx-auto mb-3 opacity-40" stroke={1.5} />
          <p>Keine Einladungen für dieses Event vorhanden.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {rsvps.map((rsvp) => {
            const currentKey = getStatus(rsvp);
            const wasChanged = !!changes[rsvp.record_id];
            const wasSaved = savedIds.has(rsvp.record_id);
            return (
              <div
                key={rsvp.record_id}
                className={`border rounded-xl p-3 transition-colors ${
                  wasChanged ? 'border-primary/40 bg-primary/5' : wasSaved ? 'border-green-300 bg-green-50/50' : 'bg-card'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{rsvp.einladung_gastName || '(Unbekannt)'}</div>
                    {rsvp.fields.rsvp_datum && (
                      <div className="text-xs text-muted-foreground">
                        Geantwortet: {formatDate(rsvp.fields.rsvp_datum)}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {RSVP_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => {
                          const originalKey = rsvp.fields.rsvp_status?.key ?? 'ausstehend';
                          if (opt.key === originalKey) {
                            setChanges((prev) => {
                              const next = { ...prev };
                              delete next[rsvp.record_id];
                              return next;
                            });
                          } else {
                            setChanges((prev) => ({ ...prev, [rsvp.record_id]: opt.key }));
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                          currentKey === opt.key
                            ? `${rsvpColor(opt.key)} border-transparent`
                            : 'bg-background text-muted-foreground border-border hover:bg-muted'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mt-6">
        <Button variant="outline" onClick={onBack} className="gap-1.5">
          <IconChevronLeft size={16} stroke={2} />
          Zurück
        </Button>
        <div className="flex-1" />
        {changedCount > 0 && (
          <Button
            variant="outline"
            onClick={handleSave}
            disabled={saving}
            className="gap-1.5 border-primary text-primary hover:bg-primary/10"
          >
            <IconCheck size={16} stroke={2} />
            {saving ? 'Speichern...' : `${changedCount} Änderung${changedCount !== 1 ? 'en' : ''} speichern`}
          </Button>
        )}
        <Button onClick={onNext} className="gap-1.5">
          Weiter
          <IconChevronRight size={16} stroke={2} />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3: Zahlungsstatus der Dienstleister ─────────────────────────────────

const ZAHLUNG_OPTIONS = [
  { key: 'offen', label: 'Offen' },
  { key: 'anzahlung', label: 'Anzahlung' },
  { key: 'bezahlt', label: 'Bezahlt' },
];

function Step3Zahlungen({
  event,
  bookings,
  onBack,
  onNext,
  fetchAll,
}: {
  event: Eventplanung;
  bookings: EnrichedDienstleisterbuchungen[];
  onBack: () => void;
  onNext: () => void;
  fetchAll: () => void;
}) {
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function getZahlungsstatus(b: EnrichedDienstleisterbuchungen): string {
    return changes[b.record_id] ?? b.fields.buchung_zahlungsstatus?.key ?? 'offen';
  }

  const activeBookings = bookings.filter(
    (b) => b.fields.buchung_status?.key !== 'storniert'
  );

  const budget = useMemo(() => {
    let total = 0;
    let paid = 0;
    activeBookings.forEach((b) => {
      const preis = b.fields.buchung_preis ?? 0;
      total += preis;
      const status = getZahlungsstatus(b);
      if (status === 'bezahlt') paid += preis;
    });
    return { total, paid, outstanding: total - paid };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBookings, changes]);

  const changedCount = Object.keys(changes).length;

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.all(
        Object.entries(changes).map(([id, key]) =>
          LivingAppsService.updateDienstleisterbuchungenEntry(id, {
            buchung_zahlungsstatus: key as never,
          })
        )
      );
      setChanges({});
      fetchAll();
    } catch (err) {
      console.error('Fehler beim Speichern der Zahlungen:', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1">Zahlungen abgleichen</h2>
      <p className="text-muted-foreground mb-4">
        <span className="font-medium text-foreground">{event.fields.event_name}</span> — Zahlungsstatus der Dienstleister
      </p>

      {/* Budget widget */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-muted/50 rounded-xl p-3 text-center">
          <div className="text-lg font-bold text-foreground">{formatCurrency(budget.total)}</div>
          <div className="text-xs text-muted-foreground">Gesamt</div>
        </div>
        <div className="bg-green-50 rounded-xl p-3 text-center">
          <div className="text-lg font-bold text-green-700">{formatCurrency(budget.paid)}</div>
          <div className="text-xs text-muted-foreground">Bezahlt</div>
        </div>
        <div className={`rounded-xl p-3 text-center ${budget.outstanding > 0 ? 'bg-amber-50' : 'bg-green-50'}`}>
          <div className={`text-lg font-bold ${budget.outstanding > 0 ? 'text-amber-700' : 'text-green-700'}`}>
            {formatCurrency(budget.outstanding)}
          </div>
          <div className="text-xs text-muted-foreground">Offen</div>
        </div>
      </div>

      {bookings.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <IconBuildingStore size={40} className="mx-auto mb-3 opacity-40" stroke={1.5} />
          <p>Keine Dienstleisterbuchungen für dieses Event vorhanden.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {bookings.map((booking) => {
            const currentKey = getZahlungsstatus(booking);
            const wasChanged = !!changes[booking.record_id];
            const storniert = booking.fields.buchung_status?.key === 'storniert';
            return (
              <div
                key={booking.record_id}
                className={`border rounded-xl p-3 transition-colors ${
                  storniert
                    ? 'opacity-50 bg-muted/30'
                    : wasChanged
                    ? 'border-primary/40 bg-primary/5'
                    : 'bg-card'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">
                        {booking.buchung_dienstleisterName || '(Unbekannt)'}
                      </span>
                      {booking.fields.buchung_status && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {booking.fields.buchung_status.label}
                        </span>
                      )}
                    </div>
                    {booking.fields.buchung_leistung && (
                      <div className="text-xs text-muted-foreground truncate">{booking.fields.buchung_leistung}</div>
                    )}
                    {booking.fields.buchung_preis != null && (
                      <div className="text-sm font-semibold mt-0.5 flex items-center gap-1">
                        <IconCurrencyEuro size={13} stroke={2} />
                        {formatCurrency(booking.fields.buchung_preis)}
                      </div>
                    )}
                  </div>
                  {!storniert && (
                    <div className="flex gap-1 flex-wrap">
                      {ZAHLUNG_OPTIONS.map((opt) => (
                        <button
                          key={opt.key}
                          onClick={() => {
                            const originalKey = booking.fields.buchung_zahlungsstatus?.key ?? 'offen';
                            if (opt.key === originalKey) {
                              setChanges((prev) => {
                                const next = { ...prev };
                                delete next[booking.record_id];
                                return next;
                              });
                            } else {
                              setChanges((prev) => ({ ...prev, [booking.record_id]: opt.key }));
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                            currentKey === opt.key
                              ? `${zahlungColor(opt.key)} border-transparent`
                              : 'bg-background text-muted-foreground border-border hover:bg-muted'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mt-6">
        <Button variant="outline" onClick={onBack} className="gap-1.5">
          <IconChevronLeft size={16} stroke={2} />
          Zurück
        </Button>
        <div className="flex-1" />
        {changedCount > 0 && (
          <Button
            variant="outline"
            onClick={handleSave}
            disabled={saving}
            className="gap-1.5 border-primary text-primary hover:bg-primary/10"
          >
            <IconCheck size={16} stroke={2} />
            {saving ? 'Speichern...' : `${changedCount} Zahlung${changedCount !== 1 ? 'en' : ''} speichern`}
          </Button>
        )}
        <Button onClick={onNext} className="gap-1.5">
          Weiter
          <IconChevronRight size={16} stroke={2} />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 4: Event abschliessen ───────────────────────────────────────────────

function Step4Abschluss({
  event,
  rsvps,
  bookings,
  onBack,
  onSuccess,
}: {
  event: Eventplanung;
  rsvps: EnrichedEinladungenRsvp[];
  bookings: EnrichedDienstleisterbuchungen[];
  onBack: () => void;
  onSuccess: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [done, setDone] = useState(false);

  const stats = useMemo(() => {
    const zugesagt = rsvps.filter((r) => r.fields.rsvp_status?.key === 'zugesagt').length;
    const ausstehend = rsvps.filter((r) => r.fields.rsvp_status?.key === 'ausstehend').length;
    const activeBookings = bookings.filter((b) => b.fields.buchung_status?.key !== 'storniert');
    const totalCost = activeBookings.reduce((sum, b) => sum + (b.fields.buchung_preis ?? 0), 0);
    const paidCost = activeBookings
      .filter((b) => b.fields.buchung_zahlungsstatus?.key === 'bezahlt')
      .reduce((sum, b) => sum + (b.fields.buchung_preis ?? 0), 0);
    const unpaidBookings = activeBookings.filter(
      (b) => b.fields.buchung_zahlungsstatus?.key !== 'bezahlt'
    ).length;
    return { zugesagt, ausstehend, totalCost, paidCost, outstanding: totalCost - paidCost, unpaidBookings };
  }, [rsvps, bookings]);

  const hasWarnings = stats.ausstehend > 0 || stats.unpaidBookings > 0;

  async function handleClose() {
    setClosing(true);
    try {
      await LivingAppsService.updateEventplanungEntry(event.record_id, {
        event_status: 'abgeschlossen' as never,
      });
      setDone(true);
    } catch (err) {
      console.error('Fehler beim Abschliessen des Events:', err);
    } finally {
      setClosing(false);
    }
  }

  if (done) {
    return (
      <div className="text-center py-12">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
          <IconCircleCheck size={44} className="text-green-600" stroke={1.5} />
        </div>
        <h2 className="text-2xl font-bold mb-2">Event abgeschlossen!</h2>
        <p className="text-muted-foreground mb-2">
          <span className="font-semibold text-foreground">{event.fields.event_name}</span> wurde erfolgreich als abgeschlossen markiert.
        </p>
        <p className="text-sm text-muted-foreground mb-8">
          {stats.zugesagt} Teilnehmer — {formatCurrency(stats.paidCost)} bezahlt
        </p>
        <Button onClick={onSuccess} className="gap-2" size="lg">
          <IconCheck size={18} stroke={2} />
          Zurück zur Übersicht
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1">Event abschliessen</h2>
      <p className="text-muted-foreground mb-6">Abschliessende Zusammenfassung vor dem Abschluss</p>

      {/* Summary card */}
      <Card className="overflow-hidden mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{event.fields.event_name}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {event.fields.event_datum && (
              <div className="flex items-center gap-2 text-sm">
                <IconCalendarEvent size={15} stroke={1.5} className="text-muted-foreground" />
                <span>{formatDate(event.fields.event_datum)}</span>
              </div>
            )}
            {event.fields.event_location_name && (
              <div className="flex items-center gap-2 text-sm">
                <IconMapPin size={15} stroke={1.5} className="text-muted-foreground" />
                <span className="truncate">{event.fields.event_location_name}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <IconUsers size={15} stroke={1.5} className="text-muted-foreground" />
              <span>{stats.zugesagt} bestätigte Teilnehmer</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <IconCurrencyEuro size={15} stroke={1.5} className="text-muted-foreground" />
              <span>{formatCurrency(stats.paidCost)} von {formatCurrency(stats.totalCost)} bezahlt</span>
            </div>
          </div>

          {/* Bookings list */}
          {bookings.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Dienstleister
              </div>
              <div className="space-y-1.5">
                {bookings.map((b) => (
                  <div key={b.record_id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate min-w-0">{b.buchung_dienstleisterName || '—'}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {b.fields.buchung_preis != null && (
                        <span className="text-muted-foreground">{formatCurrency(b.fields.buchung_preis)}</span>
                      )}
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-full ${zahlungColor(
                          b.fields.buchung_zahlungsstatus?.key
                        )}`}
                      >
                        {b.fields.buchung_zahlungsstatus?.label ?? 'Offen'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Warnings */}
      {hasWarnings && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
          <IconAlertTriangle size={18} className="mt-0.5 flex-shrink-0 text-amber-600" stroke={2} />
          <div>
            <div className="font-semibold mb-1">Hinweis: Offene Punkte</div>
            <ul className="list-disc list-inside space-y-0.5">
              {stats.ausstehend > 0 && (
                <li>{stats.ausstehend} Einladung{stats.ausstehend !== 1 ? 'en' : ''} noch ohne RSVP-Antwort</li>
              )}
              {stats.unpaidBookings > 0 && (
                <li>{stats.unpaidBookings} Dienstleister-Buchung{stats.unpaidBookings !== 1 ? 'en' : ''} noch nicht vollständig bezahlt</li>
              )}
            </ul>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <Button variant="outline" onClick={onBack} className="gap-1.5">
          <IconChevronLeft size={16} stroke={2} />
          Zurück
        </Button>
        <div className="flex-1" />
        <Button
          onClick={handleClose}
          disabled={closing}
          className="gap-2 bg-green-600 hover:bg-green-700 text-white"
          size="default"
        >
          <IconCircleCheck size={16} stroke={2} />
          {closing ? 'Wird abgeschlossen...' : 'Event als abgeschlossen markieren'}
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EventAbschliessenPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const {
    eventplanung,
    einladungenRsvp,
    dienstleisterbuchungen,
    gaesteverzeichnisMap,
    eventplanungMap,
    dienstleisterverzeichnisMap,
    loading,
    error,
    fetchAll,
  } = useDashboardData();

  const enrichedRsvp = useMemo(
    () => enrichEinladungenRsvp(einladungenRsvp, { eventplanungMap, gaesteverzeichnisMap }),
    [einladungenRsvp, eventplanungMap, gaesteverzeichnisMap]
  );

  const enrichedBookings = useMemo(
    () => enrichDienstleisterbuchungen(dienstleisterbuchungen, { eventplanungMap, dienstleisterverzeichnisMap }),
    [dienstleisterbuchungen, eventplanungMap, dienstleisterverzeichnisMap]
  );

  // Initialize step and eventId from URL params
  const urlEventId = searchParams.get('eventId');
  const urlStep = parseInt(searchParams.get('step') ?? '1', 10);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(urlEventId);
  const [step, setStep] = useState<number>(urlEventId && urlStep > 1 ? urlStep : urlEventId ? 2 : 1);

  // Sync URL params when step or event changes
  useEffect(() => {
    const params: Record<string, string> = {};
    if (selectedEventId) params.eventId = selectedEventId;
    if (step > 1) params.step = String(step);
    setSearchParams(params, { replace: true });
  }, [step, selectedEventId, setSearchParams]);

  // Derived data for selected event
  const selectedEvent = useMemo(
    () => eventplanung.find((e) => e.record_id === selectedEventId) ?? null,
    [eventplanung, selectedEventId]
  );

  const eventRsvps = useMemo(
    () =>
      selectedEventId
        ? enrichedRsvp.filter((r) => extractRecordId(r.fields.einladung_event) === selectedEventId)
        : [],
    [enrichedRsvp, selectedEventId]
  );

  const eventBookings = useMemo(
    () =>
      selectedEventId
        ? enrichedBookings.filter((b) => extractRecordId(b.fields.buchung_event) === selectedEventId)
        : [],
    [enrichedBookings, selectedEventId]
  );

  // ALL hooks are declared above — early returns are safe here
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64 text-muted-foreground">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p>Daten werden geladen...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center text-destructive">
          <IconAlertTriangle size={40} className="mx-auto mb-3" stroke={1.5} />
          <p className="font-semibold">Fehler beim Laden</p>
          <p className="text-sm mt-1">{error.message}</p>
          <Button variant="outline" onClick={fetchAll} className="mt-4">
            Erneut versuchen
          </Button>
        </div>
      </div>
    );
  }

  function handleSelectEvent(id: string) {
    setSelectedEventId(id);
    setStep(2);
  }

  function handleBack() {
    if (step === 2) {
      setSelectedEventId(null);
      setStep(1);
    } else {
      setStep((s) => s - 1);
    }
  }

  function handleSuccess() {
    fetchAll();
    navigate('/');
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Event abschliessen</h1>
        <p className="text-muted-foreground mt-1">
          Schritt-für-Schritt-Assistent zum Abschliessen eines Events
        </p>
      </div>

      {/* Step indicator */}
      <StepIndicator current={step} />

      {/* Step content */}
      <Card className="overflow-hidden shadow-sm">
        <CardContent className="p-5 sm:p-6">
          {step === 1 && (
            <Step1EventSelect
              events={eventplanung}
              einladungenRsvp={enrichedRsvp}
              dienstleisterbuchungen={enrichedBookings}
              onSelect={handleSelectEvent}
            />
          )}
          {step === 2 && selectedEvent && (
            <Step2Rsvp
              event={selectedEvent}
              rsvps={eventRsvps}
              onBack={handleBack}
              onNext={() => setStep(3)}
              fetchAll={fetchAll}
            />
          )}
          {step === 3 && selectedEvent && (
            <Step3Zahlungen
              event={selectedEvent}
              bookings={eventBookings}
              onBack={handleBack}
              onNext={() => setStep(4)}
              fetchAll={fetchAll}
            />
          )}
          {step === 4 && selectedEvent && (
            <Step4Abschluss
              event={selectedEvent}
              rsvps={eventRsvps}
              bookings={eventBookings}
              onBack={handleBack}
              onSuccess={handleSuccess}
            />
          )}
          {/* Fallback if selected event not found but step > 1 */}
          {step > 1 && !selectedEvent && (
            <div className="text-center py-8 text-muted-foreground">
              <p>Event nicht gefunden.</p>
              <Button variant="outline" onClick={() => setStep(1)} className="mt-4">
                Zurück zur Auswahl
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
