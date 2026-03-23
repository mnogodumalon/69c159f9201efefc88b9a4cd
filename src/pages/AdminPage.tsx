import { useState, useMemo, useCallback } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Eventplanung, Dienstleisterbuchungen, Dienstleisterverzeichnis, Schnelleinladung, EinladungenRsvp, Gaesteverzeichnis } from '@/types/app';
import { LivingAppsService, extractRecordId, cleanFieldsForApi } from '@/services/livingAppsService';
import { EventplanungDialog } from '@/components/dialogs/EventplanungDialog';
import { EventplanungViewDialog } from '@/components/dialogs/EventplanungViewDialog';
import { DienstleisterbuchungenDialog } from '@/components/dialogs/DienstleisterbuchungenDialog';
import { DienstleisterbuchungenViewDialog } from '@/components/dialogs/DienstleisterbuchungenViewDialog';
import { DienstleisterverzeichnisDialog } from '@/components/dialogs/DienstleisterverzeichnisDialog';
import { DienstleisterverzeichnisViewDialog } from '@/components/dialogs/DienstleisterverzeichnisViewDialog';
import { SchnelleinladungDialog } from '@/components/dialogs/SchnelleinladungDialog';
import { SchnelleinladungViewDialog } from '@/components/dialogs/SchnelleinladungViewDialog';
import { EinladungenRsvpDialog } from '@/components/dialogs/EinladungenRsvpDialog';
import { EinladungenRsvpViewDialog } from '@/components/dialogs/EinladungenRsvpViewDialog';
import { GaesteverzeichnisDialog } from '@/components/dialogs/GaesteverzeichnisDialog';
import { GaesteverzeichnisViewDialog } from '@/components/dialogs/GaesteverzeichnisViewDialog';
import { BulkEditDialog } from '@/components/dialogs/BulkEditDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageShell } from '@/components/PageShell';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { IconPencil, IconTrash, IconPlus, IconFilter, IconX, IconArrowsUpDown, IconArrowUp, IconArrowDown, IconSearch, IconCopy } from '@tabler/icons-react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

function fmtDate(d?: string) {
  if (!d) return '—';
  try { return format(parseISO(d), 'dd.MM.yyyy', { locale: de }); } catch { return d; }
}

// Field metadata per entity for bulk edit and column filters
const EVENTPLANUNG_FIELDS = [
  { key: 'event_name', label: 'Eventname', type: 'string/text' },
  { key: 'event_datum', label: 'Datum & Uhrzeit', type: 'date/datetimeminute' },
  { key: 'event_location_name', label: 'Locationname', type: 'string/text' },
  { key: 'event_strasse', label: 'Straße', type: 'string/text' },
  { key: 'event_hausnummer', label: 'Hausnummer', type: 'string/text' },
  { key: 'event_plz', label: 'Postleitzahl', type: 'string/text' },
  { key: 'event_stadt', label: 'Stadt', type: 'string/text' },
  { key: 'event_geo', label: 'Standort auf Karte', type: 'geo' },
  { key: 'event_gaestezahl', label: 'Geplante Gästezahl', type: 'number' },
  { key: 'event_budget', label: 'Gesamtbudget (€)', type: 'number' },
  { key: 'event_status', label: 'Eventstatus', type: 'lookup/select', options: [{ key: 'in_planung', label: 'In Planung' }, { key: 'einladungen_versendet', label: 'Einladungen versendet' }, { key: 'bestaetigt', label: 'Bestätigt' }, { key: 'abgeschlossen', label: 'Abgeschlossen' }, { key: 'abgesagt', label: 'Abgesagt' }] },
  { key: 'event_beschreibung', label: 'Beschreibung / Programm', type: 'string/textarea' },
];
const DIENSTLEISTERBUCHUNGEN_FIELDS = [
  { key: 'buchung_event', label: 'Event', type: 'applookup/select', targetEntity: 'eventplanung', targetAppId: 'EVENTPLANUNG', displayField: 'event_name' },
  { key: 'buchung_dienstleister', label: 'Dienstleister', type: 'applookup/select', targetEntity: 'dienstleisterverzeichnis', targetAppId: 'DIENSTLEISTERVERZEICHNIS', displayField: 'dl_firmenname' },
  { key: 'buchung_leistung', label: 'Leistungsbeschreibung', type: 'string/textarea' },
  { key: 'buchung_preis', label: 'Vereinbarter Preis (€)', type: 'number' },
  { key: 'buchung_status', label: 'Buchungsstatus', type: 'lookup/select', options: [{ key: 'angefragt', label: 'Angefragt' }, { key: 'angebot_erhalten', label: 'Angebot erhalten' }, { key: 'gebucht', label: 'Gebucht' }, { key: 'bestaetigt', label: 'Bestätigt' }, { key: 'storniert', label: 'Storniert' }] },
  { key: 'buchung_zahlungsstatus', label: 'Zahlungsstatus', type: 'lookup/select', options: [{ key: 'offen', label: 'Offen' }, { key: 'anzahlung', label: 'Anzahlung geleistet' }, { key: 'bezahlt', label: 'Vollständig bezahlt' }] },
  { key: 'buchung_notizen', label: 'Notizen', type: 'string/textarea' },
];
const DIENSTLEISTERVERZEICHNIS_FIELDS = [
  { key: 'dl_firmenname', label: 'Firmenname', type: 'string/text' },
  { key: 'dl_ansprechpartner_vorname', label: 'Ansprechpartner Vorname', type: 'string/text' },
  { key: 'dl_ansprechpartner_nachname', label: 'Ansprechpartner Nachname', type: 'string/text' },
  { key: 'dl_email', label: 'E-Mail-Adresse', type: 'string/email' },
  { key: 'dl_telefon', label: 'Telefonnummer', type: 'string/tel' },
  { key: 'dl_kategorie', label: 'Kategorie', type: 'lookup/select', options: [{ key: 'catering', label: 'Catering' }, { key: 'technik', label: 'Technik / AV' }, { key: 'location', label: 'Location' }, { key: 'musik', label: 'Musik / Entertainment' }, { key: 'fotografie', label: 'Fotografie / Video' }, { key: 'dekoration', label: 'Dekoration' }, { key: 'transport', label: 'Transport' }, { key: 'sonstiges', label: 'Sonstiges' }] },
  { key: 'dl_website', label: 'Website', type: 'string/url' },
  { key: 'dl_notizen', label: 'Notizen', type: 'string/textarea' },
];
const SCHNELLEINLADUNG_FIELDS = [
  { key: 'schnell_event', label: 'Event', type: 'applookup/select', targetEntity: 'eventplanung', targetAppId: 'EVENTPLANUNG', displayField: 'event_name' },
  { key: 'schnell_gast', label: 'Gast', type: 'applookup/select', targetEntity: 'gaesteverzeichnis', targetAppId: 'GAESTEVERZEICHNIS', displayField: 'vorname' },
  { key: 'schnell_einladungsdatum', label: 'Einladungsdatum', type: 'date/date' },
  { key: 'schnell_notiz', label: 'Notiz', type: 'string/textarea' },
];
const EINLADUNGENRSVP_FIELDS = [
  { key: 'einladung_event', label: 'Event', type: 'applookup/select', targetEntity: 'eventplanung', targetAppId: 'EVENTPLANUNG', displayField: 'event_name' },
  { key: 'einladung_gast', label: 'Gast', type: 'applookup/select', targetEntity: 'gaesteverzeichnis', targetAppId: 'GAESTEVERZEICHNIS', displayField: 'vorname' },
  { key: 'einladung_datum', label: 'Einladungsdatum', type: 'date/date' },
  { key: 'rsvp_status', label: 'RSVP-Status', type: 'lookup/select', options: [{ key: 'ausstehend', label: 'Ausstehend' }, { key: 'zugesagt', label: 'Zugesagt' }, { key: 'abgesagt', label: 'Abgesagt' }, { key: 'vielleicht', label: 'Vielleicht' }] },
  { key: 'rsvp_datum', label: 'Rückmeldedatum', type: 'date/date' },
  { key: 'einladung_notizen', label: 'Notizen', type: 'string/textarea' },
];
const GAESTEVERZEICHNIS_FIELDS = [
  { key: 'vorname', label: 'Vorname', type: 'string/text' },
  { key: 'nachname', label: 'Nachname', type: 'string/text' },
  { key: 'email', label: 'E-Mail-Adresse', type: 'string/email' },
  { key: 'telefon', label: 'Telefonnummer', type: 'string/tel' },
  { key: 'firma', label: 'Firma / Organisation', type: 'string/text' },
  { key: 'position', label: 'Position / Funktion', type: 'string/text' },
  { key: 'notizen_gast', label: 'Notizen', type: 'string/textarea' },
];

const ENTITY_TABS = [
  { key: 'eventplanung', label: 'Eventplanung', pascal: 'Eventplanung' },
  { key: 'dienstleisterbuchungen', label: 'Dienstleisterbuchungen', pascal: 'Dienstleisterbuchungen' },
  { key: 'dienstleisterverzeichnis', label: 'Dienstleisterverzeichnis', pascal: 'Dienstleisterverzeichnis' },
  { key: 'schnelleinladung', label: 'Schnelleinladung', pascal: 'Schnelleinladung' },
  { key: 'einladungen_&_rsvp', label: 'Einladungen & RSVP', pascal: 'EinladungenRsvp' },
  { key: 'gaesteverzeichnis', label: 'Gästeverzeichnis', pascal: 'Gaesteverzeichnis' },
] as const;

type EntityKey = typeof ENTITY_TABS[number]['key'];

export default function AdminPage() {
  const data = useDashboardData();
  const { loading, error, fetchAll } = data;

  const [activeTab, setActiveTab] = useState<EntityKey>('eventplanung');
  const [selectedIds, setSelectedIds] = useState<Record<EntityKey, Set<string>>>(() => ({
    eventplanung: new Set(),
    dienstleisterbuchungen: new Set(),
    dienstleisterverzeichnis: new Set(),
    schnelleinladung: new Set(),
    'einladungen_&_rsvp': new Set(),
    gaesteverzeichnis: new Set(),
  }));
  const [filters, setFilters] = useState<Record<EntityKey, Record<string, string>>>(() => ({
    eventplanung: {},
    dienstleisterbuchungen: {},
    dienstleisterverzeichnis: {},
    schnelleinladung: {},
    'einladungen_&_rsvp': {},
    gaesteverzeichnis: {},
  }));
  const [showFilters, setShowFilters] = useState(false);
  const [dialogState, setDialogState] = useState<{ entity: EntityKey; record: any } | null>(null);
  const [createEntity, setCreateEntity] = useState<EntityKey | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<{ entity: EntityKey; ids: string[] } | null>(null);
  const [bulkEditOpen, setBulkEditOpen] = useState<EntityKey | null>(null);
  const [viewState, setViewState] = useState<{ entity: EntityKey; record: any } | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [search, setSearch] = useState('');

  const getRecords = useCallback((entity: EntityKey) => {
    switch (entity) {
      case 'eventplanung': return (data as any).eventplanung as Eventplanung[] ?? [];
      case 'dienstleisterbuchungen': return (data as any).dienstleisterbuchungen as Dienstleisterbuchungen[] ?? [];
      case 'dienstleisterverzeichnis': return (data as any).dienstleisterverzeichnis as Dienstleisterverzeichnis[] ?? [];
      case 'schnelleinladung': return (data as any).schnelleinladung as Schnelleinladung[] ?? [];
      case 'einladungen_&_rsvp': return (data as any).einladungenRsvp as EinladungenRsvp[] ?? [];
      case 'gaesteverzeichnis': return (data as any).gaesteverzeichnis as Gaesteverzeichnis[] ?? [];
      default: return [];
    }
  }, [data]);

  const getLookupLists = useCallback((entity: EntityKey) => {
    const lists: Record<string, any[]> = {};
    switch (entity) {
      case 'dienstleisterbuchungen':
        lists.eventplanungList = (data as any).eventplanung ?? [];
        lists.dienstleisterverzeichnisList = (data as any).dienstleisterverzeichnis ?? [];
        break;
      case 'schnelleinladung':
        lists.eventplanungList = (data as any).eventplanung ?? [];
        lists.gaesteverzeichnisList = (data as any).gaesteverzeichnis ?? [];
        break;
      case 'einladungen_&_rsvp':
        lists.eventplanungList = (data as any).eventplanung ?? [];
        lists.gaesteverzeichnisList = (data as any).gaesteverzeichnis ?? [];
        break;
    }
    return lists;
  }, [data]);

  const getApplookupDisplay = useCallback((entity: EntityKey, fieldKey: string, url?: unknown) => {
    if (!url) return '—';
    const id = extractRecordId(url);
    if (!id) return '—';
    const lists = getLookupLists(entity);
    void fieldKey; // ensure used for noUnusedParameters
    if (entity === 'dienstleisterbuchungen' && fieldKey === 'buchung_event') {
      const match = (lists.eventplanungList ?? []).find((r: any) => r.record_id === id);
      return match?.fields.event_name ?? '—';
    }
    if (entity === 'dienstleisterbuchungen' && fieldKey === 'buchung_dienstleister') {
      const match = (lists.dienstleisterverzeichnisList ?? []).find((r: any) => r.record_id === id);
      return match?.fields.dl_firmenname ?? '—';
    }
    if (entity === 'schnelleinladung' && fieldKey === 'schnell_event') {
      const match = (lists.eventplanungList ?? []).find((r: any) => r.record_id === id);
      return match?.fields.event_name ?? '—';
    }
    if (entity === 'schnelleinladung' && fieldKey === 'schnell_gast') {
      const match = (lists.gaesteverzeichnisList ?? []).find((r: any) => r.record_id === id);
      return match?.fields.vorname ?? '—';
    }
    if (entity === 'einladungen_&_rsvp' && fieldKey === 'einladung_event') {
      const match = (lists.eventplanungList ?? []).find((r: any) => r.record_id === id);
      return match?.fields.event_name ?? '—';
    }
    if (entity === 'einladungen_&_rsvp' && fieldKey === 'einladung_gast') {
      const match = (lists.gaesteverzeichnisList ?? []).find((r: any) => r.record_id === id);
      return match?.fields.vorname ?? '—';
    }
    return String(url);
  }, [getLookupLists]);

  const getFieldMeta = useCallback((entity: EntityKey) => {
    switch (entity) {
      case 'eventplanung': return EVENTPLANUNG_FIELDS;
      case 'dienstleisterbuchungen': return DIENSTLEISTERBUCHUNGEN_FIELDS;
      case 'dienstleisterverzeichnis': return DIENSTLEISTERVERZEICHNIS_FIELDS;
      case 'schnelleinladung': return SCHNELLEINLADUNG_FIELDS;
      case 'einladungen_&_rsvp': return EINLADUNGENRSVP_FIELDS;
      case 'gaesteverzeichnis': return GAESTEVERZEICHNIS_FIELDS;
      default: return [];
    }
  }, []);

  const getFilteredRecords = useCallback((entity: EntityKey) => {
    const records = getRecords(entity);
    const s = search.toLowerCase();
    const searched = !s ? records : records.filter((r: any) => {
      return Object.values(r.fields).some((v: any) => {
        if (v == null) return false;
        if (Array.isArray(v)) return v.some((item: any) => typeof item === 'object' && item !== null && 'label' in item ? String((item as any).label).toLowerCase().includes(s) : String(item).toLowerCase().includes(s));
        if (typeof v === 'object' && 'label' in (v as any)) return String((v as any).label).toLowerCase().includes(s);
        return String(v).toLowerCase().includes(s);
      });
    });
    const entityFilters = filters[entity] ?? {};
    const fieldMeta = getFieldMeta(entity);
    return searched.filter((r: any) => {
      return fieldMeta.every((fm: any) => {
        const fv = entityFilters[fm.key];
        if (!fv || fv === '') return true;
        const val = r.fields?.[fm.key];
        if (fm.type === 'bool') {
          if (fv === 'true') return val === true;
          if (fv === 'false') return val !== true;
          return true;
        }
        if (fm.type === 'lookup/select' || fm.type === 'lookup/radio') {
          const label = val && typeof val === 'object' && 'label' in val ? val.label : '';
          return String(label).toLowerCase().includes(fv.toLowerCase());
        }
        if (fm.type.includes('multiplelookup')) {
          if (!Array.isArray(val)) return false;
          return val.some((item: any) => String(item?.label ?? '').toLowerCase().includes(fv.toLowerCase()));
        }
        if (fm.type.includes('applookup')) {
          const display = getApplookupDisplay(entity, fm.key, val);
          return String(display).toLowerCase().includes(fv.toLowerCase());
        }
        return String(val ?? '').toLowerCase().includes(fv.toLowerCase());
      });
    });
  }, [getRecords, filters, getFieldMeta, getApplookupDisplay, search]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortKey(''); setSortDir('asc'); }
    } else { setSortKey(key); setSortDir('asc'); }
  }

  function sortRecords<T extends { fields: Record<string, any> }>(recs: T[]): T[] {
    if (!sortKey) return recs;
    return [...recs].sort((a, b) => {
      let va: any = a.fields[sortKey], vb: any = b.fields[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'object' && 'label' in va) va = va.label;
      if (typeof vb === 'object' && 'label' in vb) vb = vb.label;
      if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }

  const toggleSelect = useCallback((entity: EntityKey, id: string) => {
    setSelectedIds(prev => {
      const next = { ...prev, [entity]: new Set(prev[entity]) };
      if (next[entity].has(id)) next[entity].delete(id);
      else next[entity].add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((entity: EntityKey) => {
    const filtered = getFilteredRecords(entity);
    setSelectedIds(prev => {
      const allSelected = filtered.every((r: any) => prev[entity].has(r.record_id));
      const next = { ...prev, [entity]: new Set(prev[entity]) };
      if (allSelected) {
        filtered.forEach((r: any) => next[entity].delete(r.record_id));
      } else {
        filtered.forEach((r: any) => next[entity].add(r.record_id));
      }
      return next;
    });
  }, [getFilteredRecords]);

  const clearSelection = useCallback((entity: EntityKey) => {
    setSelectedIds(prev => ({ ...prev, [entity]: new Set() }));
  }, []);

  const getServiceMethods = useCallback((entity: EntityKey) => {
    switch (entity) {
      case 'eventplanung': return {
        create: (fields: any) => LivingAppsService.createEventplanungEntry(fields),
        update: (id: string, fields: any) => LivingAppsService.updateEventplanungEntry(id, fields),
        remove: (id: string) => LivingAppsService.deleteEventplanungEntry(id),
      };
      case 'dienstleisterbuchungen': return {
        create: (fields: any) => LivingAppsService.createDienstleisterbuchungenEntry(fields),
        update: (id: string, fields: any) => LivingAppsService.updateDienstleisterbuchungenEntry(id, fields),
        remove: (id: string) => LivingAppsService.deleteDienstleisterbuchungenEntry(id),
      };
      case 'dienstleisterverzeichnis': return {
        create: (fields: any) => LivingAppsService.createDienstleisterverzeichni(fields),
        update: (id: string, fields: any) => LivingAppsService.updateDienstleisterverzeichni(id, fields),
        remove: (id: string) => LivingAppsService.deleteDienstleisterverzeichni(id),
      };
      case 'schnelleinladung': return {
        create: (fields: any) => LivingAppsService.createSchnelleinladungEntry(fields),
        update: (id: string, fields: any) => LivingAppsService.updateSchnelleinladungEntry(id, fields),
        remove: (id: string) => LivingAppsService.deleteSchnelleinladungEntry(id),
      };
      case 'einladungen_&_rsvp': return {
        create: (fields: any) => LivingAppsService.createEinladungenRsvpEntry(fields),
        update: (id: string, fields: any) => LivingAppsService.updateEinladungenRsvpEntry(id, fields),
        remove: (id: string) => LivingAppsService.deleteEinladungenRsvpEntry(id),
      };
      case 'gaesteverzeichnis': return {
        create: (fields: any) => LivingAppsService.createGaesteverzeichni(fields),
        update: (id: string, fields: any) => LivingAppsService.updateGaesteverzeichni(id, fields),
        remove: (id: string) => LivingAppsService.deleteGaesteverzeichni(id),
      };
      default: return null;
    }
  }, []);

  async function handleCreate(entity: EntityKey, fields: any) {
    const svc = getServiceMethods(entity);
    if (!svc) return;
    await svc.create(fields);
    fetchAll();
    setCreateEntity(null);
  }

  async function handleUpdate(fields: any) {
    if (!dialogState) return;
    const svc = getServiceMethods(dialogState.entity);
    if (!svc) return;
    await svc.update(dialogState.record.record_id, fields);
    fetchAll();
    setDialogState(null);
  }

  async function handleBulkDelete() {
    if (!deleteTargets) return;
    const svc = getServiceMethods(deleteTargets.entity);
    if (!svc) return;
    setBulkLoading(true);
    try {
      for (const id of deleteTargets.ids) {
        await svc.remove(id);
      }
      clearSelection(deleteTargets.entity);
      fetchAll();
    } finally {
      setBulkLoading(false);
      setDeleteTargets(null);
    }
  }

  async function handleBulkClone() {
    const svc = getServiceMethods(activeTab);
    if (!svc) return;
    setBulkLoading(true);
    try {
      const records = getRecords(activeTab);
      const ids = Array.from(selectedIds[activeTab]);
      for (const id of ids) {
        const rec = records.find((r: any) => r.record_id === id);
        if (!rec) continue;
        const clean = cleanFieldsForApi(rec.fields, activeTab);
        await svc.create(clean as any);
      }
      clearSelection(activeTab);
      fetchAll();
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkEdit(fieldKey: string, value: any) {
    if (!bulkEditOpen) return;
    const svc = getServiceMethods(bulkEditOpen);
    if (!svc) return;
    setBulkLoading(true);
    try {
      const ids = Array.from(selectedIds[bulkEditOpen]);
      for (const id of ids) {
        await svc.update(id, { [fieldKey]: value });
      }
      clearSelection(bulkEditOpen);
      fetchAll();
    } finally {
      setBulkLoading(false);
      setBulkEditOpen(null);
    }
  }

  function updateFilter(entity: EntityKey, fieldKey: string, value: string) {
    setFilters(prev => ({
      ...prev,
      [entity]: { ...prev[entity], [fieldKey]: value },
    }));
  }

  function clearEntityFilters(entity: EntityKey) {
    setFilters(prev => ({ ...prev, [entity]: {} }));
  }

  const activeFilterCount = useMemo(() => {
    const f = filters[activeTab] ?? {};
    return Object.values(f).filter(v => v && v !== '').length;
  }, [filters, activeTab]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <p className="text-destructive">{error.message}</p>
        <Button onClick={fetchAll}>Erneut versuchen</Button>
      </div>
    );
  }

  const filtered = getFilteredRecords(activeTab);
  const sel = selectedIds[activeTab];
  const allFiltered = filtered.every((r: any) => sel.has(r.record_id)) && filtered.length > 0;
  const fieldMeta = getFieldMeta(activeTab);

  return (
    <PageShell
      title="Verwaltung"
      subtitle="Alle Daten verwalten"
      action={
        <Button onClick={() => setCreateEntity(activeTab)} className="shrink-0">
          <IconPlus className="h-4 w-4 mr-2" /> Hinzufügen
        </Button>
      }
    >
      <div className="flex gap-2 flex-wrap">
        {ENTITY_TABS.map(tab => {
          const count = getRecords(tab.key).length;
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSearch(''); setSortKey(''); setSortDir('asc'); fetchAll(); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === tab.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {tab.label}
              <Badge variant="secondary" className="ml-1 text-xs">{count}</Badge>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="relative w-full max-w-sm">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Suchen..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(f => !f)} className="gap-2">
            <IconFilter className="h-4 w-4" />
            Filtern
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1">{activeFilterCount}</Badge>
            )}
          </Button>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => clearEntityFilters(activeTab)}>
              Filter zurücksetzen
            </Button>
          )}
        </div>
        {sel.size > 0 && (
          <div className="flex items-center gap-2 flex-wrap bg-muted/60 rounded-lg px-3 py-1.5">
            <span className="text-sm font-medium">{sel.size} ausgewählt</span>
            <Button variant="outline" size="sm" onClick={() => setBulkEditOpen(activeTab)}>
              <IconPencil className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">Feld bearbeiten</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkClone()}>
              <IconCopy className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">Kopieren</span>
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setDeleteTargets({ entity: activeTab, ids: Array.from(sel) })}>
              <IconTrash className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">Ausgewählte löschen</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => clearSelection(activeTab)}>
              <IconX className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">Auswahl aufheben</span>
            </Button>
          </div>
        )}
      </div>

      {showFilters && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4 rounded-lg border bg-muted/30">
          {fieldMeta.map((fm: any) => (
            <div key={fm.key} className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{fm.label}</label>
              {fm.type === 'bool' ? (
                <Select value={filters[activeTab]?.[fm.key] ?? ''} onValueChange={v => updateFilter(activeTab, fm.key, v === 'all' ? '' : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Alle" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle</SelectItem>
                    <SelectItem value="true">Ja</SelectItem>
                    <SelectItem value="false">Nein</SelectItem>
                  </SelectContent>
                </Select>
              ) : fm.type === 'lookup/select' || fm.type === 'lookup/radio' ? (
                <Select value={filters[activeTab]?.[fm.key] ?? ''} onValueChange={v => updateFilter(activeTab, fm.key, v === 'all' ? '' : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Alle" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle</SelectItem>
                    {fm.options?.map((o: any) => (
                      <SelectItem key={o.key} value={o.label}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="h-8 text-xs"
                  placeholder="Filtern..."
                  value={filters[activeTab]?.[fm.key] ?? ''}
                  onChange={e => updateFilter(activeTab, fm.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-[27px] bg-card shadow-lg overflow-x-auto">
        <Table className="[&_tbody_td]:px-6 [&_tbody_td]:py-2 [&_tbody_td]:text-base [&_tbody_td]:font-medium [&_tbody_tr:first-child_td]:pt-6 [&_tbody_tr:last-child_td]:pb-10">
          <TableHeader className="bg-secondary">
            <TableRow className="border-b border-input">
              <TableHead className="w-10 px-6">
                <Checkbox
                  checked={allFiltered}
                  onCheckedChange={() => toggleSelectAll(activeTab)}
                />
              </TableHead>
              {fieldMeta.map((fm: any) => (
                <TableHead key={fm.key} className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort(fm.key)}>
                  <span className="inline-flex items-center gap-1">
                    {fm.label}
                    {sortKey === fm.key ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                  </span>
                </TableHead>
              ))}
              <TableHead className="w-24 uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6">Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortRecords(filtered).map((record: any) => (
              <TableRow key={record.record_id} className={`transition-colors cursor-pointer ${sel.has(record.record_id) ? "bg-primary/5" : "hover:bg-muted/50"}`} onClick={(e) => { if ((e.target as HTMLElement).closest('button, [role="checkbox"]')) return; setViewState({ entity: activeTab, record }); }}>
                <TableCell>
                  <Checkbox
                    checked={sel.has(record.record_id)}
                    onCheckedChange={() => toggleSelect(activeTab, record.record_id)}
                  />
                </TableCell>
                {fieldMeta.map((fm: any) => {
                  const val = record.fields?.[fm.key];
                  if (fm.type === 'bool') {
                    return (
                      <TableCell key={fm.key}>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          val ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                        }`}>
                          {val ? 'Ja' : 'Nein'}
                        </span>
                      </TableCell>
                    );
                  }
                  if (fm.type === 'lookup/select' || fm.type === 'lookup/radio') {
                    return <TableCell key={fm.key}><span className="inline-flex items-center bg-secondary border border-[#bfdbfe] text-[#2563eb] rounded-[10px] px-2 py-1 text-sm font-medium">{val?.label ?? '—'}</span></TableCell>;
                  }
                  if (fm.type.includes('multiplelookup')) {
                    return <TableCell key={fm.key}>{Array.isArray(val) ? val.map((v: any) => v?.label ?? v).join(', ') : '—'}</TableCell>;
                  }
                  if (fm.type.includes('applookup')) {
                    return <TableCell key={fm.key}><span className="inline-flex items-center bg-secondary border border-[#bfdbfe] text-[#2563eb] rounded-[10px] px-2 py-1 text-sm font-medium">{getApplookupDisplay(activeTab, fm.key, val)}</span></TableCell>;
                  }
                  if (fm.type.includes('date')) {
                    return <TableCell key={fm.key} className="text-muted-foreground">{fmtDate(val)}</TableCell>;
                  }
                  if (fm.type.startsWith('file')) {
                    return (
                      <TableCell key={fm.key}>
                        {val ? (
                          <div className="relative h-8 w-8 rounded bg-muted overflow-hidden">
                            <img src={val} alt="" className="h-full w-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          </div>
                        ) : '—'}
                      </TableCell>
                    );
                  }
                  if (fm.type === 'string/textarea') {
                    return <TableCell key={fm.key} className="max-w-xs"><span className="truncate block">{val ?? '—'}</span></TableCell>;
                  }
                  if (fm.type === 'geo') {
                    return (
                      <TableCell key={fm.key} className="max-w-[200px]">
                        <span className="truncate block" title={val ? `${val.lat}, ${val.long}` : undefined}>
                          {val?.info ?? (val ? `${val.lat?.toFixed(4)}, ${val.long?.toFixed(4)}` : '—')}
                        </span>
                      </TableCell>
                    );
                  }
                  return <TableCell key={fm.key}>{val ?? '—'}</TableCell>;
                })}
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setDialogState({ entity: activeTab, record })}>
                      <IconPencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTargets({ entity: activeTab, ids: [record.record_id] })}>
                      <IconTrash className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={fieldMeta.length + 2} className="text-center py-16 text-muted-foreground">
                  Keine Ergebnisse gefunden.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {(createEntity === 'eventplanung' || dialogState?.entity === 'eventplanung') && (
        <EventplanungDialog
          open={createEntity === 'eventplanung' || dialogState?.entity === 'eventplanung'}
          onClose={() => { setCreateEntity(null); setDialogState(null); }}
          onSubmit={dialogState?.entity === 'eventplanung' ? handleUpdate : (fields: any) => handleCreate('eventplanung', fields)}
          defaultValues={dialogState?.entity === 'eventplanung' ? dialogState.record?.fields : undefined}
          enablePhotoScan={AI_PHOTO_SCAN['Eventplanung']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Eventplanung']}
        />
      )}
      {(createEntity === 'dienstleisterbuchungen' || dialogState?.entity === 'dienstleisterbuchungen') && (
        <DienstleisterbuchungenDialog
          open={createEntity === 'dienstleisterbuchungen' || dialogState?.entity === 'dienstleisterbuchungen'}
          onClose={() => { setCreateEntity(null); setDialogState(null); }}
          onSubmit={dialogState?.entity === 'dienstleisterbuchungen' ? handleUpdate : (fields: any) => handleCreate('dienstleisterbuchungen', fields)}
          defaultValues={dialogState?.entity === 'dienstleisterbuchungen' ? dialogState.record?.fields : undefined}
          eventplanungList={(data as any).eventplanung ?? []}
          dienstleisterverzeichnisList={(data as any).dienstleisterverzeichnis ?? []}
          enablePhotoScan={AI_PHOTO_SCAN['Dienstleisterbuchungen']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Dienstleisterbuchungen']}
        />
      )}
      {(createEntity === 'dienstleisterverzeichnis' || dialogState?.entity === 'dienstleisterverzeichnis') && (
        <DienstleisterverzeichnisDialog
          open={createEntity === 'dienstleisterverzeichnis' || dialogState?.entity === 'dienstleisterverzeichnis'}
          onClose={() => { setCreateEntity(null); setDialogState(null); }}
          onSubmit={dialogState?.entity === 'dienstleisterverzeichnis' ? handleUpdate : (fields: any) => handleCreate('dienstleisterverzeichnis', fields)}
          defaultValues={dialogState?.entity === 'dienstleisterverzeichnis' ? dialogState.record?.fields : undefined}
          enablePhotoScan={AI_PHOTO_SCAN['Dienstleisterverzeichnis']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Dienstleisterverzeichnis']}
        />
      )}
      {(createEntity === 'schnelleinladung' || dialogState?.entity === 'schnelleinladung') && (
        <SchnelleinladungDialog
          open={createEntity === 'schnelleinladung' || dialogState?.entity === 'schnelleinladung'}
          onClose={() => { setCreateEntity(null); setDialogState(null); }}
          onSubmit={dialogState?.entity === 'schnelleinladung' ? handleUpdate : (fields: any) => handleCreate('schnelleinladung', fields)}
          defaultValues={dialogState?.entity === 'schnelleinladung' ? dialogState.record?.fields : undefined}
          eventplanungList={(data as any).eventplanung ?? []}
          gaesteverzeichnisList={(data as any).gaesteverzeichnis ?? []}
          enablePhotoScan={AI_PHOTO_SCAN['Schnelleinladung']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Schnelleinladung']}
        />
      )}
      {(createEntity === 'einladungen_&_rsvp' || dialogState?.entity === 'einladungen_&_rsvp') && (
        <EinladungenRsvpDialog
          open={createEntity === 'einladungen_&_rsvp' || dialogState?.entity === 'einladungen_&_rsvp'}
          onClose={() => { setCreateEntity(null); setDialogState(null); }}
          onSubmit={dialogState?.entity === 'einladungen_&_rsvp' ? handleUpdate : (fields: any) => handleCreate('einladungen_&_rsvp', fields)}
          defaultValues={dialogState?.entity === 'einladungen_&_rsvp' ? dialogState.record?.fields : undefined}
          eventplanungList={(data as any).eventplanung ?? []}
          gaesteverzeichnisList={(data as any).gaesteverzeichnis ?? []}
          enablePhotoScan={AI_PHOTO_SCAN['EinladungenRsvp']}
          enablePhotoLocation={AI_PHOTO_LOCATION['EinladungenRsvp']}
        />
      )}
      {(createEntity === 'gaesteverzeichnis' || dialogState?.entity === 'gaesteverzeichnis') && (
        <GaesteverzeichnisDialog
          open={createEntity === 'gaesteverzeichnis' || dialogState?.entity === 'gaesteverzeichnis'}
          onClose={() => { setCreateEntity(null); setDialogState(null); }}
          onSubmit={dialogState?.entity === 'gaesteverzeichnis' ? handleUpdate : (fields: any) => handleCreate('gaesteverzeichnis', fields)}
          defaultValues={dialogState?.entity === 'gaesteverzeichnis' ? dialogState.record?.fields : undefined}
          enablePhotoScan={AI_PHOTO_SCAN['Gaesteverzeichnis']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Gaesteverzeichnis']}
        />
      )}
      {viewState?.entity === 'eventplanung' && (
        <EventplanungViewDialog
          open={viewState?.entity === 'eventplanung'}
          onClose={() => setViewState(null)}
          record={viewState?.record}
          onEdit={(r: any) => { setViewState(null); setDialogState({ entity: 'eventplanung', record: r }); }}
        />
      )}
      {viewState?.entity === 'dienstleisterbuchungen' && (
        <DienstleisterbuchungenViewDialog
          open={viewState?.entity === 'dienstleisterbuchungen'}
          onClose={() => setViewState(null)}
          record={viewState?.record}
          onEdit={(r: any) => { setViewState(null); setDialogState({ entity: 'dienstleisterbuchungen', record: r }); }}
          eventplanungList={(data as any).eventplanung ?? []}
          dienstleisterverzeichnisList={(data as any).dienstleisterverzeichnis ?? []}
        />
      )}
      {viewState?.entity === 'dienstleisterverzeichnis' && (
        <DienstleisterverzeichnisViewDialog
          open={viewState?.entity === 'dienstleisterverzeichnis'}
          onClose={() => setViewState(null)}
          record={viewState?.record}
          onEdit={(r: any) => { setViewState(null); setDialogState({ entity: 'dienstleisterverzeichnis', record: r }); }}
        />
      )}
      {viewState?.entity === 'schnelleinladung' && (
        <SchnelleinladungViewDialog
          open={viewState?.entity === 'schnelleinladung'}
          onClose={() => setViewState(null)}
          record={viewState?.record}
          onEdit={(r: any) => { setViewState(null); setDialogState({ entity: 'schnelleinladung', record: r }); }}
          eventplanungList={(data as any).eventplanung ?? []}
          gaesteverzeichnisList={(data as any).gaesteverzeichnis ?? []}
        />
      )}
      {viewState?.entity === 'einladungen_&_rsvp' && (
        <EinladungenRsvpViewDialog
          open={viewState?.entity === 'einladungen_&_rsvp'}
          onClose={() => setViewState(null)}
          record={viewState?.record}
          onEdit={(r: any) => { setViewState(null); setDialogState({ entity: 'einladungen_&_rsvp', record: r }); }}
          eventplanungList={(data as any).eventplanung ?? []}
          gaesteverzeichnisList={(data as any).gaesteverzeichnis ?? []}
        />
      )}
      {viewState?.entity === 'gaesteverzeichnis' && (
        <GaesteverzeichnisViewDialog
          open={viewState?.entity === 'gaesteverzeichnis'}
          onClose={() => setViewState(null)}
          record={viewState?.record}
          onEdit={(r: any) => { setViewState(null); setDialogState({ entity: 'gaesteverzeichnis', record: r }); }}
        />
      )}

      <BulkEditDialog
        open={!!bulkEditOpen}
        onClose={() => setBulkEditOpen(null)}
        onApply={handleBulkEdit}
        fields={bulkEditOpen ? getFieldMeta(bulkEditOpen) : []}
        selectedCount={bulkEditOpen ? selectedIds[bulkEditOpen].size : 0}
        loading={bulkLoading}
        lookupLists={bulkEditOpen ? getLookupLists(bulkEditOpen) : {}}
      />

      <ConfirmDialog
        open={!!deleteTargets}
        onClose={() => setDeleteTargets(null)}
        onConfirm={handleBulkDelete}
        title="Ausgewählte löschen"
        description={`Sollen ${deleteTargets?.ids.length ?? 0} Einträge wirklich gelöscht werden? Diese Aktion kann nicht rückgängig gemacht werden.`}
      />
    </PageShell>
  );
}