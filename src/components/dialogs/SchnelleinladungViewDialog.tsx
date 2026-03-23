import type { Schnelleinladung, Eventplanung, Gaesteverzeichnis } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { IconPencil } from '@tabler/icons-react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

function formatDate(d?: string) {
  if (!d) return '—';
  try { return format(parseISO(d), 'dd.MM.yyyy', { locale: de }); } catch { return d; }
}

interface SchnelleinladungViewDialogProps {
  open: boolean;
  onClose: () => void;
  record: Schnelleinladung | null;
  onEdit: (record: Schnelleinladung) => void;
  eventplanungList: Eventplanung[];
  gaesteverzeichnisList: Gaesteverzeichnis[];
}

export function SchnelleinladungViewDialog({ open, onClose, record, onEdit, eventplanungList, gaesteverzeichnisList }: SchnelleinladungViewDialogProps) {
  function getEventplanungDisplayName(url?: unknown) {
    if (!url) return '—';
    const id = extractRecordId(url);
    return eventplanungList.find(r => r.record_id === id)?.fields.event_name ?? '—';
  }

  function getGaesteverzeichnisDisplayName(url?: unknown) {
    if (!url) return '—';
    const id = extractRecordId(url);
    return gaesteverzeichnisList.find(r => r.record_id === id)?.fields.vorname ?? '—';
  }

  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Schnelleinladung anzeigen</DialogTitle>
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
            <p className="text-sm">{getEventplanungDisplayName(record.fields.schnell_event)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Gast</Label>
            <p className="text-sm">{getGaesteverzeichnisDisplayName(record.fields.schnell_gast)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Einladungsdatum</Label>
            <p className="text-sm">{formatDate(record.fields.schnell_einladungsdatum)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Notiz</Label>
            <p className="text-sm whitespace-pre-wrap">{record.fields.schnell_notiz ?? '—'}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}