---
name: intent-ui
description: |
  Activate this skill when:
  - Building an intent-specific UI page (src/pages/intents/*.tsx)
  - Creating focused, single-purpose task interfaces
  - Implementing relation, scheduling, tracking, or status-flow UIs
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# Intent UI Building Skill

Build a **focused, zero-cognitive-load page** for ONE specific task. Unlike the dashboard (a hub), an intent page should feel like opening a dedicated mini-app.

---

## Your Workflow

1. **Read the skeleton** at the path you were given — it has an `INTENT:` JSON comment with type, entities, fields, and description
2. **Read `.scaffold_context`** to understand available types, services, and components
3. **Write the complete file** with `Write` tool — one shot, no read-back
4. Do NOT run `npm run build` — the orchestrator handles that

---

## Design Patterns by Intent Type

### relation — "Assign X to Y"

The user needs to create/manage assignments between two entities.

**Best patterns:**
- **Two-panel view**: Left side shows available items (searchable list), right side shows currently assigned items. Click to assign/unassign.
- **Drag-and-drop**: Draggable cards between "unassigned" and "assigned" zones
- **Quick-assign form**: Prominent dropdowns for both entities, one-click "Assign" button, list of recent assignments below

**Key UX:**
- Show both entities side by side — user should see the relationship visually
- Search/filter on both sides
- Show assignment count ("3 von 12 zugewiesen")
- Allow undo (unassign) with one click

### scheduling — "Schedule/Plan X"

The user needs to create time-based entries.

**Best patterns:**
- **Calendar view**: Month/week/day grid with events. Click date to create.
- **Timeline**: Horizontal timeline with entity cards positioned by date
- **Quick-schedule form**: Date picker + entity dropdown as the hero, with upcoming schedule below

**Key UX:**
- Default to current week/month
- Show existing entries on the calendar/timeline
- Click-to-create on empty slots
- Color-code by category or status if available
- Show conflicts/overlaps

### status_flow — "Update X Status"

The user needs to move items between states.

**Best patterns:**
- **Kanban board**: Columns per status value, drag cards between columns
- **Status cards**: Grouped cards with prominent status badge, one-click transition buttons
- **Pipeline view**: Horizontal stages with item counts and quick-move actions

**Key UX:**
- Show all status groups simultaneously
- Count badges per column/group
- One-click or drag to transition
- Show key info on each card (name, date, assignee)
- Highlight blocked or overdue items

### tracking — "Track X"

The user needs to monitor items with date pairs (start/end, issue/return).

**Best patterns:**
- **Timeline/Gantt view**: Horizontal bars showing duration per item
- **Overdue dashboard**: Split into "overdue", "due soon", "on track" sections
- **Progress cards**: Cards with progress indicator and quick-action buttons

**Key UX:**
- **Red highlight** for overdue items (past end date, no completion)
- **Yellow** for due within 3 days
- Quick-action buttons: "Mark returned", "Extend date", "Complete"
- Summary stats at top: overdue count, due today, total active

### quick_create — "New X"

The user needs to create a record with minimal friction.

**Best patterns:**
- **Hero form**: Large, centered form with only essential fields (hide optional in "More" accordion)
- **Stepper/wizard**: Multi-step if many fields, single step if ≤ 5
- **Quick-add + list**: Input bar at top (like a todo app), list of recent entries below

**Key UX:**
- Pre-fill smart defaults (today's date, logged-in user)
- Largest/most important field gets the hero position
- Submit button always visible (no scrolling needed)
- Success confirmation with "Add another" shortcut

---

## Technical Rules

These are MANDATORY — violation causes TypeScript build errors or runtime crashes:

- **Rules of Hooks**: ALL hooks (`useState`, `useEffect`, `useMemo`, `useCallback`) MUST be placed BEFORE any early returns (`if (loading) return`, `if (error) return`)
- **Import hygiene**: Only import what you actually use. Trace every import — if it doesn't appear in JSX/logic, remove it. The skeleton has `@ts-ignore` on imports you may or may not need.
- **Reuse Entity Dialogs**: For create/edit, ALWAYS import pre-generated `{Entity}Dialog` from `@/components/dialogs/{Entity}Dialog`. Never build custom forms.
- **No Bash file ops**: Use Read/Write/Edit tools only
- **No file read-back**: After Write, do NOT read the file back
- **Touch-friendly**: Never hide buttons behind hover (`opacity-0 group-hover:opacity-100`)

## Available Libraries

- **shadcn/ui**: Button, Card, Badge, Dialog, Select, Input, Tabs, Table (all in `src/components/ui/`)
- **@tabler/icons-react**: All icons prefixed with `Icon` (e.g., `IconPlus`, `IconCalendar`). Use `stroke` prop, not `strokeWidth`.
- **date-fns**: `format`, `parseISO`, `isAfter`, `isBefore`, `addDays`, `differenceInDays`. Import `de` locale.
- **recharts**: LineChart, BarChart, PieChart, AreaChart (for stats if needed)

## Data Access

From the skeleton's `useDashboardData()` hook:
- Entity arrays: `werkzeuge`, `mitarbeiter`, etc. — each is `Record<string, EntityType>`
- Map objects: `werkzeugeMap` — `Record<record_id, EntityType>` for applookup resolution
- `fetchAll()` — refetch all data
- `loading`, `error` — already handled in skeleton

**CRUD operations:**
```typescript
await LivingAppsService.createXEntry(fields);
await LivingAppsService.updateXEntry(recordId, fields);
await LivingAppsService.deleteXEntry(recordId);
```

**Formatting:**
```typescript
formatDate(dateStr)              // "21.03.2026" or "Mar 21, 2026"
displayLookup(lookupValue)       // "Gut" from { key: "gut", label: "Gut" }
displayMultiLookup(mlValue)      // "Tag1, Tag2" from array
```

## Design Tokens

Use existing CSS custom properties — do NOT create new ones:
- `bg-card`, `bg-secondary`, `bg-destructive/10`
- `text-foreground`, `text-muted-foreground`, `text-destructive`
- `border`, `border-input`
- `rounded-2xl`, `shadow-lg` for card wrappers
