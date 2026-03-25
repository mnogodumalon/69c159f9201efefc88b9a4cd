import type { Dienstleisterbuchungen, Eventplanung, Dienstleisterverzeichnis } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { IconPencil } from '@tabler/icons-react';

interface DienstleisterbuchungenViewDialogProps {
  open: boolean;
  onClose: () => void;
  record: Dienstleisterbuchungen | null;
  onEdit: (record: Dienstleisterbuchungen) => void;
  eventplanungList: Eventplanung[];
  dienstleisterverzeichnisList: Dienstleisterverzeichnis[];
}

export function DienstleisterbuchungenViewDialog({ open, onClose, record, onEdit, eventplanungList, dienstleisterverzeichnisList }: DienstleisterbuchungenViewDialogProps) {
  function getEventplanungDisplayName(url?: unknown) {
    if (!url) return '—';
    const id = extractRecordId(url);
    return eventplanungList.find(r => r.record_id === id)?.fields.event_name ?? '—';
  }

  function getDienstleisterverzeichnisDisplayName(url?: unknown) {
    if (!url) return '—';
    const id = extractRecordId(url);
    return dienstleisterverzeichnisList.find(r => r.record_id === id)?.fields.dl_firmenname ?? '—';
  }

  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dienstleisterbuchungen anzeigen</DialogTitle>
        </DialogHeader>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { onClose(); onEdit(record); }}>
            <IconPencil className="h-3.5 w-3.5 mr-1.5" />
            Bearbeiten
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Event</Label>
            <p className="text-sm">{getEventplanungDisplayName(record.fields.buchung_event)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Dienstleister</Label>
            <p className="text-sm">{getDienstleisterverzeichnisDisplayName(record.fields.buchung_dienstleister)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Leistungsbeschreibung</Label>
            <p className="text-sm whitespace-pre-wrap">{record.fields.buchung_leistung ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Vereinbarter Preis (€)</Label>
            <p className="text-sm">{record.fields.buchung_preis ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Buchungsstatus</Label>
            <Badge variant="secondary">{record.fields.buchung_status?.label ?? '—'}</Badge>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Zahlungsstatus</Label>
            <Badge variant="secondary">{record.fields.buchung_zahlungsstatus?.label ?? '—'}</Badge>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Notizen</Label>
            <p className="text-sm whitespace-pre-wrap">{record.fields.buchung_notizen ?? '—'}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}