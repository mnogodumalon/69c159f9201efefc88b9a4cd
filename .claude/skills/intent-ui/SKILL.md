---
name: intent-ui
description: |
  Activate this skill when:
  - Building an intent-specific UI page (src/pages/intents/*.tsx)
  - Creating multi-step task workflows that span multiple entities
  - Building wizard/stepper interfaces for complex user tasks
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# Intent UI Building Skill

Build a **multi-step task workflow** — NOT a CRUD page with different styling.

---

## What Makes an Intent UI (vs a CRUD page)

Every entity already has a CRUD page. An intent UI is fundamentally different:

| CRUD Page (already exists) | Intent UI (what you build) |
|---|---|
| Shows ONE entity's records | Orchestrates MULTIPLE entities in one flow |
| Generic table + search + dialogs | Task-specific steps with clear progression |
| Creates one record at a time | Often creates MANY records in one flow |
| No context between actions | Live feedback: totals, counts, progress |
| No clear start/end | Wizard with start → steps → completion |

**If your intent UI is just a table/list/kanban of ONE entity — you're building a CRUD page, not an intent UI. Stop and redesign.**

---

## Your Workflow

1. **Read `.scaffold_context`** to understand available types, services, and components
2. **Write the complete file** with `Write` tool — one shot, no read-back
3. Do NOT run `npm run build` — the orchestrator handles that

---

## Core Pattern: Wizard with Steps

Most intent UIs follow a wizard/stepper pattern:

```tsx
const [step, setStep] = useState(1);
const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
const [invitedGuests, setInvitedGuests] = useState<string[]>([]);

// Step indicator at top
<div className="flex gap-2 mb-6">
  {[1, 2, 3].map(s => (
    <div key={s} className={`h-2 flex-1 rounded-full ${s <= step ? 'bg-primary' : 'bg-muted'}`} />
  ))}
</div>

// Render current step
{step === 1 && <StepSelectEvent ... />}
{step === 2 && <StepInviteGuests ... />}
{step === 3 && <StepSummary ... />}
```

**Each step typically:**
- Shows data from one or more entities
- Lets the user make selections or create records
- Updates running state (counts, totals, selections)
- Has "Next" / "Back" navigation

---

## Pattern: Bulk Record Creation

When the user needs to create many records (e.g., invite 20 guests):

```tsx
const handleInvite = async (guestId: string) => {
  await LivingAppsService.createEinladungenEntry({
    veranstaltung: createRecordUrl(APP_IDS.VERANSTALTUNGEN, selectedEvent!),
    gast: createRecordUrl(APP_IDS.GAESTE, guestId),
    status: { key: 'eingeladen', label: 'Eingeladen' },
  });
  setInvitedGuests(prev => [...prev, guestId]);
  fetchAll(); // refresh data
};
```

**Show live feedback:**
- Counter: "12 von 40 Gästen eingeladen"
- Progress bar
- Running cost total if budget-relevant

---

## Pattern: Cross-Entity Selection

When the user picks from multiple entities to create a linked record:

```tsx
// Step 1: Select student (from Fahrschueler)
// Step 2: Select instructor (from Fahrlehrer, filtered by availability)
// Step 3: Select vehicle (from Fahrzeuge, filtered by type matching class)
// Step 4: Pick date/time
// Step 5: Confirm → creates Fahrstunde with all 3 applookup references
```

Each step narrows the options based on previous selections.

---

## Anti-Patterns (DO NOT BUILD)

- ❌ **Status kanban** for one entity → belongs on the dashboard, not an intent page
- ❌ **Filtered table** of one entity → that's the CRUD page
- ❌ **Single-entity form** with styling → that's the existing dialog
- ❌ **Read-only summary/stats** → belongs on the dashboard
- ❌ **Entity list with action buttons** → that's the CRUD page with extra buttons

---

## Technical Rules

These are MANDATORY — violation causes TypeScript build errors or runtime crashes:

- **Rules of Hooks**: ALL hooks (`useState`, `useEffect`, `useMemo`, `useCallback`) MUST be placed BEFORE any early returns (`if (loading) return`, `if (error) return`)
- **Import hygiene**: Only import what you actually use.
- **Reuse Entity Dialogs**: For creating a single record within a step, import pre-generated `{Entity}Dialog` from `@/components/dialogs/{Entity}Dialog`. The dialog handles all field types, validation, photo scan.
- **No Bash file ops**: Use Read/Write/Edit tools only
- **No file read-back**: After Write, do NOT read the file back
- **Touch-friendly**: Never hide buttons behind hover

## Available Libraries

- **shadcn/ui**: Button, Card, Badge, Dialog, Select, Input, Tabs, Table (all in `src/components/ui/`)
- **@tabler/icons-react**: All icons prefixed with `Icon`. Use `stroke` prop, not `strokeWidth`.
- **date-fns**: `format`, `parseISO`, `isAfter`, `isBefore`, `addDays`, `differenceInDays`. Import `de` locale.

## Data Access

From `useDashboardData()` hook:
- Entity records: `Record<string, EntityType>` — use `Object.values()` to get array
- Map objects: `{entity}Map` for applookup resolution
- `fetchAll()` — refetch after creating/updating records
- `loading`, `error` — handle in the component

**CRUD operations:**
```typescript
await LivingAppsService.createXEntry(fields);
await LivingAppsService.updateXEntry(recordId, fields);
await LivingAppsService.deleteXEntry(recordId);
```

### CRITICAL: Lookup field values when writing to the API

When READING, lookup fields are enriched objects: `{ key: 'gut', label: 'Gut' }`.
When WRITING (create/update), the API expects **ONLY the plain key string**, NOT the object!

```typescript
// ❌ WRONG — API returns 400 "illegal-field-value"
await LivingAppsService.createEinladungenEntry({
  status: { key: 'eingeladen', label: 'Eingeladen' },  // dict → error!
});

// ✅ CORRECT — send plain key string
await LivingAppsService.createEinladungenEntry({
  status: 'eingeladen',  // just the key
});
```

This applies to ALL lookup/select, lookup/radio, and multiplelookup fields.
For multiplelookup, send an array of key strings: `['tag1', 'tag2']`, NOT `[{key, label}, ...]`.

The pre-generated {Entity}Dialog handles this automatically — but when you create records
directly via LivingAppsService in intent UI code, YOU must send plain keys.

## Design Tokens

Use existing CSS custom properties — do NOT create new ones:
- `bg-card`, `bg-secondary`, `bg-primary`, `bg-destructive/10`
- `text-foreground`, `text-muted-foreground`, `text-primary-foreground`
- `rounded-2xl`, `shadow-lg` for card wrappers
