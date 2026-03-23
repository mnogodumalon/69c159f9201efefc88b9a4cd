import { useState, useMemo } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichDienstleisterbuchungen } from '@/lib/enrich';
import type { EnrichedDienstleisterbuchungen } from '@/types/enriched';
import type { Eventplanung } from '@/types/app';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { PageShell } from '@/components/PageShell';
import { StatCard } from '@/components/StatCard';
import {
  IconCurrencyEuro,
  IconTrendingUp,
  IconChevronDown,
  IconChevronUp,
  IconCalendar,
  IconAlertTriangle,
  IconCircleCheck,
  IconMinus,
} from '@tabler/icons-react';

type BookingStatusKey = 'angefragt' | 'angebot_erhalten' | 'gebucht' | 'bestaetigt' | 'storniert';
type PaymentStatusKey = 'offen' | 'anzahlung' | 'bezahlt';

const STATUS_LABELS: Record<BookingStatusKey, string> = {
  angefragt: 'Angefragt',
  angebot_erhalten: 'Angebot erhalten',
  gebucht: 'Gebucht',
  bestaetigt: 'Bestätigt',
  storniert: 'Storniert',
};

const PAYMENT_LABELS: Record<PaymentStatusKey, string> = {
  offen: 'Offen',
  anzahlung: 'Anzahlung',
  bezahlt: 'Bezahlt',
};

const STATUS_COLORS: Record<BookingStatusKey, string> = {
  angefragt: 'bg-gray-100 text-gray-700',
  angebot_erhalten: 'bg-blue-100 text-blue-700',
  gebucht: 'bg-yellow-100 text-yellow-800',
  bestaetigt: 'bg-green-100 text-green-700',
  storniert: 'bg-red-100 text-red-700 line-through',
};

const PAYMENT_COLORS: Record<PaymentStatusKey, string> = {
  offen: 'bg-orange-100 text-orange-700',
  anzahlung: 'bg-blue-100 text-blue-700',
  bezahlt: 'bg-green-100 text-green-700',
};

const EVENT_STATUS_COLORS: Record<string, string> = {
  in_planung: 'bg-gray-100 text-gray-700',
  einladungen_versendet: 'bg-blue-100 text-blue-700',
  bestaetigt: 'bg-green-100 text-green-700',
  abgeschlossen: 'bg-purple-100 text-purple-700',
  abgesagt: 'bg-red-100 text-red-700',
};

function getBudgetBarColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 75) return 'bg-yellow-400';
  return 'bg-green-500';
}

function getBudgetBgColor(pct: number): string {
  if (pct >= 90) return 'bg-red-100';
  if (pct >= 75) return 'bg-yellow-100';
  return 'bg-green-100';
}

interface CategoryBreakdown {
  label: string;
  total: number;
  count: number;
}

interface EventBudgetData {
  event: Eventplanung;
  budget: number;
  committedSpend: number;
  cancelledCount: number;
  bookings: EnrichedDienstleisterbuchungen[];
  activeBookings: EnrichedDienstleisterbuchungen[];
  categoryBreakdown: CategoryBreakdown[];
}

export default function BudgetUebersichtPage() {
  const { eventplanung, dienstleisterbuchungen, eventplanungMap, dienstleisterverzeichnisMap, loading, error } =
    useDashboardData();

  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  const enrichedBookings = useMemo(
    () => enrichDienstleisterbuchungen(dienstleisterbuchungen, { eventplanungMap, dienstleisterverzeichnisMap }),
    [dienstleisterbuchungen, eventplanungMap, dienstleisterverzeichnisMap]
  );

  const bookingsByEvent = useMemo(() => {
    const map = new Map<string, EnrichedDienstleisterbuchungen[]>();
    enrichedBookings.forEach((b) => {
      const eventId = b.buchung_eventName
        ? b.fields.buchung_event
          ? (() => {
              const url = b.fields.buchung_event ?? '';
              const parts = url.split('/');
              return parts[parts.length - 1];
            })()
          : null
        : null;
      if (!eventId) return;
      if (!map.has(eventId)) map.set(eventId, []);
      map.get(eventId)!.push(b);
    });
    return map;
  }, [enrichedBookings]);

  const eventBudgetData = useMemo((): EventBudgetData[] => {
    return eventplanung.map((event) => {
      const allBookings = bookingsByEvent.get(event.record_id) ?? [];
      const activeBookings = allBookings.filter(
        (b) => b.fields.buchung_status?.key !== 'storniert'
      );
      const cancelledCount = allBookings.length - activeBookings.length;
      const committedSpend = activeBookings.reduce((sum, b) => sum + (b.fields.buchung_preis ?? 0), 0);
      const budget = event.fields.event_budget ?? 0;

      const catMap = new Map<string, { label: string; total: number; count: number }>();
      activeBookings.forEach((b) => {
        const eventId = b.fields.buchung_event?.split('/').pop() ?? '';
        const dlId = b.fields.buchung_dienstleister?.split('/').pop() ?? '';
        const dl = dienstleisterverzeichnisMap.get(dlId);
        const catKey = dl?.fields.dl_kategorie?.key ?? 'sonstiges';
        const catLabel = dl?.fields.dl_kategorie?.label ?? 'Sonstiges';
        if (!catMap.has(catKey)) catMap.set(catKey, { label: catLabel, total: 0, count: 0 });
        const entry = catMap.get(catKey)!;
        entry.total += b.fields.buchung_preis ?? 0;
        entry.count += 1;
        void eventId;
      });

      const categoryBreakdown = Array.from(catMap.values()).sort((a, b) => b.total - a.total);

      return { event, budget, committedSpend, cancelledCount, bookings: allBookings, activeBookings, categoryBreakdown };
    });
  }, [eventplanung, bookingsByEvent, dienstleisterverzeichnisMap]);

  const summaryTotals = useMemo(() => {
    const activeEvents = eventBudgetData.filter((d) => d.event.fields.event_status?.key !== 'abgesagt');
    const totalBudget = activeEvents.reduce((sum, d) => sum + d.budget, 0);
    const totalCommitted = activeEvents.reduce((sum, d) => sum + d.committedSpend, 0);
    const totalRemaining = totalBudget - totalCommitted;
    const utilizationPct = totalBudget > 0 ? Math.round((totalCommitted / totalBudget) * 100) : 0;
    return { totalBudget, totalCommitted, totalRemaining, utilizationPct, activeEventCount: activeEvents.length };
  }, [eventBudgetData]);

  if (loading) {
    return (
      <PageShell title="Budget-Übersicht" subtitle="Lade Budgetdaten...">
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <div className="text-center space-y-2">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm">Daten werden geladen...</p>
          </div>
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell title="Budget-Übersicht" subtitle="Fehler beim Laden">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
          <div className="flex items-center gap-2 font-medium">
            <IconAlertTriangle size={18} />
            Fehler beim Laden der Budgetdaten
          </div>
          <p className="text-sm mt-1">{error.message}</p>
        </div>
      </PageShell>
    );
  }

  const toggleEvent = (id: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <PageShell
      title="Budget-Übersicht"
      subtitle={`Budget-Kontrolle fur ${summaryTotals.activeEventCount} aktive Events`}
    >
      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Gesamtbudget"
          value={formatCurrency(summaryTotals.totalBudget)}
          description={`${summaryTotals.activeEventCount} aktive Events`}
          icon={<IconCurrencyEuro size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Gebuchte Kosten"
          value={formatCurrency(summaryTotals.totalCommitted)}
          description="Alle aktiven Buchungen"
          icon={<IconTrendingUp size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Verbleibendes Budget"
          value={formatCurrency(summaryTotals.totalRemaining)}
          description={summaryTotals.totalRemaining < 0 ? 'Budget uberschritten!' : 'Noch verfugbar'}
          icon={<IconMinus size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Budget-Auslastung"
          value={`${summaryTotals.utilizationPct}%`}
          description={
            summaryTotals.utilizationPct >= 90
              ? 'Kritisch – Budget fast aufgebraucht'
              : summaryTotals.utilizationPct >= 75
              ? 'Achtung – Uber 75% verbraucht'
              : 'Im grunen Bereich'
          }
          icon={<IconCircleCheck size={18} className="text-muted-foreground" />}
        />
      </div>

      {/* Overall progress bar */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-muted-foreground">Gesamt-Budgetauslastung</span>
          <span className="text-sm font-bold">{summaryTotals.utilizationPct}%</span>
        </div>
        <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${getBudgetBarColor(summaryTotals.utilizationPct)}`}
            style={{ width: `${Math.min(summaryTotals.utilizationPct, 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-muted-foreground">{formatCurrency(summaryTotals.totalCommitted)} gebucht</span>
          <span className="text-xs text-muted-foreground">{formatCurrency(summaryTotals.totalBudget)} gesamt</span>
        </div>
      </div>

      {/* Per-event cards */}
      <div className="space-y-4">
        {eventBudgetData.length === 0 && (
          <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground">
            Keine Events gefunden.
          </div>
        )}
        {eventBudgetData.map(({ event, budget, committedSpend, cancelledCount, bookings, activeBookings, categoryBreakdown }) => {
          const pct = budget > 0 ? Math.min(Math.round((committedSpend / budget) * 100), 100) : 0;
          const isExpanded = expandedEvents.has(event.record_id);
          const statusKey = (event.fields.event_status?.key ?? 'in_planung') as string;
          const statusLabel = event.fields.event_status?.label ?? 'Unbekannt';

          return (
            <div
              key={event.record_id}
              className="rounded-xl border bg-card shadow-sm overflow-hidden"
            >
              {/* Card Header */}
              <div className="p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-base truncate">{event.fields.event_name ?? '(Kein Name)'}</h3>
                      <span
                        className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
                          EVENT_STATUS_COLORS[statusKey] ?? 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                      <IconCalendar size={14} />
                      <span>{event.fields.event_datum ? formatDate(event.fields.event_datum) : '—'}</span>
                      {event.fields.event_location_name && (
                        <span className="ml-2 truncate">{event.fields.event_location_name}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${getBudgetBgColor(pct)} ${pct >= 90 ? 'text-red-700' : pct >= 75 ? 'text-yellow-800' : 'text-green-700'}`}>
                      {pct}% ausgelastet
                    </div>
                    <button
                      onClick={() => toggleEvent(event.record_id)}
                      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-lg transition-colors"
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? (
                        <>
                          <IconChevronUp size={14} />
                          <span>Zuklappen</span>
                        </>
                      ) : (
                        <>
                          <IconChevronDown size={14} />
                          <span>Details</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Budget Progress Bar */}
                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{formatCurrency(committedSpend)}</span>
                    <span className="text-muted-foreground">von {formatCurrency(budget)} Budget</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${getBudgetBarColor(pct)}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1.5 text-xs text-muted-foreground">
                    <span>
                      {activeBookings.length} Buchung{activeBookings.length !== 1 ? 'en' : ''}
                      {cancelledCount > 0 && ` · ${cancelledCount} storniert`}
                    </span>
                    <span>
                      {budget > committedSpend
                        ? `${formatCurrency(budget - committedSpend)} verbleibend`
                        : `${formatCurrency(committedSpend - budget)} uber Budget`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Expandable Details */}
              {isExpanded && (
                <div className="border-t bg-muted/30 p-5 space-y-5">
                  {/* Category Breakdown */}
                  {categoryBreakdown.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-3">Aufschlüsselung nach Kategorie</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {categoryBreakdown.map((cat) => {
                          const catPct = committedSpend > 0 ? Math.round((cat.total / committedSpend) * 100) : 0;
                          return (
                            <div key={cat.label} className="bg-card rounded-lg border p-3">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-sm font-medium">{cat.label}</span>
                                <span className="text-sm font-bold">{formatCurrency(cat.total)}</span>
                              </div>
                              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary/70 transition-all duration-300"
                                  style={{ width: `${catPct}%` }}
                                />
                              </div>
                              <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                                <span>{cat.count} Buchung{cat.count !== 1 ? 'en' : ''}</span>
                                <span>{catPct}% der Kosten</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Bookings Table */}
                  <div>
                    <h4 className="text-sm font-semibold mb-3">Alle Buchungen</h4>
                    {bookings.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Keine Buchungen fur dieses Event.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted/50 text-left">
                              <th className="px-3 py-2 font-medium text-muted-foreground">Dienstleister</th>
                              <th className="px-3 py-2 font-medium text-muted-foreground">Kategorie</th>
                              <th className="px-3 py-2 font-medium text-muted-foreground">Leistung</th>
                              <th className="px-3 py-2 font-medium text-muted-foreground text-right">Preis</th>
                              <th className="px-3 py-2 font-medium text-muted-foreground">Status</th>
                              <th className="px-3 py-2 font-medium text-muted-foreground">Zahlung</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bookings.map((booking) => {
                              const dlId = booking.fields.buchung_dienstleister?.split('/').pop() ?? '';
                              const dl = dienstleisterverzeichnisMap.get(dlId);
                              const catLabel = dl?.fields.dl_kategorie?.label ?? '—';
                              const bStatusKey = (booking.fields.buchung_status?.key ?? 'angefragt') as BookingStatusKey;
                              const bStatusLabel = STATUS_LABELS[bStatusKey] ?? booking.fields.buchung_status?.label ?? '—';
                              const pStatusKey = (booking.fields.buchung_zahlungsstatus?.key ?? 'offen') as PaymentStatusKey;
                              const pStatusLabel = PAYMENT_LABELS[pStatusKey] ?? booking.fields.buchung_zahlungsstatus?.label ?? '—';
                              const isCancelled = bStatusKey === 'storniert';

                              return (
                                <tr
                                  key={booking.record_id}
                                  className={`border-t ${isCancelled ? 'opacity-50' : ''}`}
                                >
                                  <td className="px-3 py-2 font-medium max-w-[150px]">
                                    <span className="truncate block">{booking.buchung_dienstleisterName || '—'}</span>
                                  </td>
                                  <td className="px-3 py-2 text-muted-foreground">{catLabel}</td>
                                  <td className="px-3 py-2 text-muted-foreground max-w-[200px]">
                                    <span className="truncate block">{booking.fields.buchung_leistung ?? '—'}</span>
                                  </td>
                                  <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                                    {isCancelled ? (
                                      <span className="line-through text-muted-foreground">
                                        {formatCurrency(booking.fields.buchung_preis)}
                                      </span>
                                    ) : (
                                      formatCurrency(booking.fields.buchung_preis)
                                    )}
                                  </td>
                                  <td className="px-3 py-2">
                                    <span
                                      className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
                                        STATUS_COLORS[bStatusKey] ?? 'bg-gray-100 text-gray-700'
                                      }`}
                                    >
                                      {bStatusLabel}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2">
                                    {!isCancelled && (
                                      <span
                                        className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
                                          PAYMENT_COLORS[pStatusKey] ?? 'bg-gray-100 text-gray-700'
                                        }`}
                                      >
                                        {pStatusLabel}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          {activeBookings.length > 0 && (
                            <tfoot>
                              <tr className="border-t bg-muted/30 font-semibold">
                                <td colSpan={3} className="px-3 py-2 text-sm">
                                  Summe (aktive Buchungen)
                                </td>
                                <td className="px-3 py-2 text-right text-sm whitespace-nowrap">
                                  {formatCurrency(committedSpend)}
                                </td>
                                <td colSpan={2} />
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </PageShell>
  );
}
