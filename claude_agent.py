import asyncio
import json
import time
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions, AgentDefinition, AssistantMessage, UserMessage, ToolUseBlock, ToolResultBlock, TextBlock, ResultMessage, HookMatcher
import os

_t0 = time.time()

async def _on_post_tool_use(input_data: dict, tool_use_id: str | None = None, context: dict | None = None) -> dict:
    """Log tool results after execution."""
    try:
        tool = input_data.get("tool_name", "?")
        response = input_data.get("tool_response", "")
        output = str(response)[:4000] if response else ""
        elapsed = round(time.time() - _t0, 1)
        print(json.dumps({"type": "tool_result", "tool": tool, "output": output, "t": elapsed}), flush=True)
    except Exception as e:
        elapsed = round(time.time() - _t0, 1)
        print(json.dumps({"type": "tool_result", "tool": input_data.get("tool_name", "?"), "output": f"[hook error: {e}]", "t": elapsed}), flush=True)
    return {"continue_": True}

# Environment-specific configuration
LA_API_URL = os.getenv("LA_API_URL", "https://my.living-apps.de/rest")
LA_FRONTEND_URL = os.getenv("LA_FRONTEND_URL", "https://my.living-apps.de")

# ── Subagent prompts ────────────────────────────────────────────────

DASHBOARD_BUILDER_PROMPT = """\
You build the main DashboardOverview.tsx — the primary workspace of a Living Apps React dashboard.

MANDATORY RULES:
- Read src/pages/DashboardOverview.tsx FIRST, then Write ONCE with complete content. Never read back.
- Read .scaffold_context to understand available types, services, components.
- NEVER use Bash for file operations — use Read/Write/Edit tools only.
- index.css: NEVER touch. CRUD pages/dialogs: NEVER touch.
- Rules of Hooks: ALL hooks MUST be BEFORE any early returns (loading/error).
- IMPORT HYGIENE: Only import what you use. Trace every import before Write.
- ALWAYS reuse pre-generated {Entity}Dialog from '@/components/dialogs/{Entity}Dialog' for create/edit.
- TOUCH-FRIENDLY: NEVER hide buttons behind hover.
- Dashboard is the PRIMARY WORKSPACE — build interactive domain-specific UI, not an info page.
- The dashboard also serves as a HUB for intent pages. The orchestrator will tell you which intent \
routes exist — add navigation cards/buttons linking to them (use HashRouter: <a href="#/intents/...">).
- Follow .claude/skills/frontend-impl/SKILL.md for UI paradigm guidance.
- Do NOT run npm run build — the orchestrator handles that.
- src/config/ai-features.ts: MAY edit — set AI_PHOTO_SCAN['Entity'] = true.
"""

INTENT_BUILDER_PROMPT = """\
You build a single INTENT UI page — a task-oriented workflow that guides the user through a multi-step process.

## WHAT AN INTENT UI IS (vs what it is NOT)

An intent UI is NOT a fancy CRUD page. CRUD pages already exist for every entity — they have tables, search, \
create/edit/delete dialogs. Do NOT rebuild that.

An intent UI is a WORKFLOW that:
- Spans MULTIPLE entities (e.g., selecting a record from entity A, then creating linked records in entity B and C)
- Has STEPS or PHASES (e.g., Step 1: pick event → Step 2: invite guests → Step 3: book vendors → Step 4: confirm)
- Creates MULTIPLE records in a single flow (e.g., inviting 20 guests = creating 20 invitation records)
- Has a clear START state and END state (user begins the task → user completes the task)
- Shows live context as the user progresses (e.g., running budget total, guest count, progress indicator)

EXAMPLES of good intent UIs:
- "Prepare Event": Wizard — choose event → bulk-invite guests (creates Einladung records) → book vendors (creates Buchung records) → see budget summary → confirm
- "Schedule Lesson": Pick student + instructor + vehicle + timeslot in ONE focused view → creates Fahrstunde record with all relationships pre-filled
- "Record Exam Results": Select exam from pending list → set result → auto-update student status → show next pending exam

EXAMPLES of what is NOT an intent UI (just CRUD with lipstick):
- ❌ A table of events with filters and a create button
- ❌ A kanban board showing records grouped by status (that's a dashboard widget)
- ❌ A single-entity form with some extra styling

## IMPLEMENTATION

You will be given an intent description and the file path to create. Create the COMPLETE file from scratch.

Use useState to manage wizard steps, selections, and running totals. Use the pre-generated {Entity}Dialog \
for individual record creation when needed, but the FLOW itself (step progression, entity selection, \
bulk operations) is your custom code.

MANDATORY RULES:
- Read .scaffold_context to understand available types, services, components.
- Create the file with Write tool — one shot, no read-back.
- The file must be a valid React component with a default export.
- Import useDashboardData from '@/hooks/useDashboardData' for data access.
- Import types from '@/types/app', services from '@/services/livingAppsService'.
- Import enrichment functions from '@/lib/enrich' and enriched types from '@/types/enriched' if needed.
- NEVER use Bash for file operations — use Read/Write/Edit tools only.
- Rules of Hooks: ALL hooks MUST be BEFORE any early returns (loading/error).
- IMPORT HYGIENE: Only import what you use.
- ALWAYS reuse pre-generated {Entity}Dialog from '@/components/dialogs/{Entity}Dialog' for single-record creation.
- TOUCH-FRIENDLY: NEVER hide buttons behind hover.
- Follow .claude/skills/intent-ui/SKILL.md for design patterns.
- Do NOT run npm run build — the orchestrator handles that.
- Do NOT touch any other files — only create the file you were given.
"""

SUBAGENT_TOOLS = ["Read", "Write", "Edit", "Bash", "Glob", "Grep"]


async def main():
    # Skills and CLAUDE.md are loaded automatically by Claude SDK from cwd
    # setting_sources=["project"] is REQUIRED to load CLAUDE.md and .claude/skills/ from cwd

    agents = {
        "dashboard_builder": AgentDefinition(
            description="Builds DashboardOverview.tsx — the main dashboard hub page with navigation to intent UIs",
            prompt=DASHBOARD_BUILDER_PROMPT,
            tools=SUBAGENT_TOOLS,
            model="inherit",
        ),
        "intent_builder": AgentDefinition(
            description="Builds one intent-specific UI page from scratch. Give it the file path to create and the intent description.",
            prompt=INTENT_BUILDER_PROMPT,
            tools=SUBAGENT_TOOLS,
            model="inherit",
        ),
    }

    options = ClaudeAgentOptions(
        hooks={
            "PostToolUse": [HookMatcher(matcher=None, hooks=[_on_post_tool_use], timeout=60)],
        },
        system_prompt={
            "type": "preset",
            "preset": "claude_code",
            "append": (
                "MANDATORY RULES (highest priority):\n"
                "- NEVER use Bash for file operations (no cat, echo, heredoc, >, >>). ALWAYS use Read/Write/Edit tools.\n"
                "- index.css: NEVER touch — pre-generated design system. CRUD pages/dialogs: NEVER touch.\n"
                "- Layout.tsx: NEVER touch — sidebar navigation is pre-generated.\n"
                "- useDashboardData.ts, enriched.ts, enrich.ts, formatters.ts, ai.ts, chat-context.ts, ChatWidget.tsx: NEVER touch\n"
                "- Rules of Hooks: ALL hooks MUST be BEFORE any early returns.\n"
                "- IMPORT HYGIENE: Only import what you actually use.\n"
                "- After 'npm run build' succeeds, STOP immediately."
            ),
        },
        setting_sources=["project"],
        permission_mode="bypassPermissions",
        disallowed_tools=["TodoWrite", "NotebookEdit", "WebFetch", "ExitPlanMode", "SlashCommand"],
        agents=agents,
        cwd="/home/user/app",
        model="claude-sonnet-4-6",
    )

    # Session-Resume Unterstützung
    resume_session_id = os.getenv('RESUME_SESSION_ID')
    if resume_session_id:
        options.resume = resume_session_id
        print(f"[LILO] Resuming session: {resume_session_id}")

    # User Prompt - prefer file over env var (handles special chars better)
    user_prompt = None

    prompt_file = "/home/user/app/.user_prompt"
    if os.path.exists(prompt_file):
        try:
            with open(prompt_file, 'r') as f:
                user_prompt = f.read().strip()
            if user_prompt:
                print(f"[LILO] Prompt aus Datei gelesen: {len(user_prompt)} Zeichen")
        except Exception as e:
            print(f"[LILO] Fehler beim Lesen der Prompt-Datei: {e}")

    if not user_prompt:
        user_prompt = os.getenv('USER_PROMPT')
        if user_prompt:
            print(f"[LILO] Prompt aus ENV gelesen")

    # Build instructions — optional user notes for fresh builds (NOT continue mode)
    user_instructions = None
    instructions_file = "/home/user/app/.user_instructions"
    if os.path.exists(instructions_file):
        try:
            with open(instructions_file, 'r') as f:
                user_instructions = f.read().strip()
            if user_instructions:
                print(f"[LILO] User instructions aus Datei gelesen: {len(user_instructions)} Zeichen")
        except Exception as e:
            print(f"[LILO] Fehler beim Lesen der User-Instructions-Datei: {e}")

    if not user_instructions:
        user_instructions = os.getenv('USER_INSTRUCTIONS')
        if user_instructions:
            print(f"[LILO] User instructions aus ENV gelesen")

    if user_prompt:
        # Continue/Resume-Mode: Custom prompt vom User (no subagents, direct editing)
        query = f"""🚨 AUFGABE: Du MUSST das existierende Dashboard ändern!

User-Anfrage: "{user_prompt}"

PFLICHT-SCHRITTE (alle müssen ausgeführt werden):

1. LESEN: Lies src/pages/DashboardOverview.tsx um die aktuelle Struktur zu verstehen
2. ÄNDERN: Implementiere die User-Anfrage mit dem Edit-Tool
3. TESTEN: Führe 'npm run build' aus um sicherzustellen dass es kompiliert
4. BAUEN: Führe 'npm run build' aus. Bei Fehler: fixen und erneut bauen bis es klappt.

⚠️ KRITISCH:
- Du MUSST Änderungen am Code machen (Edit-Tool verwenden!)
- Analysieren alleine reicht NICHT - du musst HANDELN!
- Deployment passiert automatisch nach deiner Arbeit — deploye NICHT manuell!

Das Dashboard existiert bereits. Mache NUR die angeforderten Änderungen, nicht mehr.
Starte JETZT mit Schritt 1!"""
        print(f"[LILO] Continue-Mode mit User-Prompt: {user_prompt}")

    else:
        # Build-Mode: Orchestrator dispatches subagents for dashboard + intent UIs
        query = """\
You are the BUILD ORCHESTRATOR. Read .scaffold_context and app_metadata.json to understand the project.

## WHAT ARE INTENT UIs?

Every entity ALREADY has a full CRUD page (table + search + create/edit/delete). Intent UIs are NOT more CRUD pages \
with different styling. They are TASK WORKFLOWS.

An intent UI is a MULTI-STEP TASK that:
- Spans MULTIPLE entities in one flow (selecting from entity A → creating linked records in entity B and C)
- Has STEPS (wizard/stepper pattern with clear progression)
- Often creates MULTIPLE records in a single flow (e.g., inviting 20 guests = 20 Einladung records)
- Shows LIVE FEEDBACK as the user progresses (running totals, counts, progress bar, budget remaining)
- Has a clear START → END (user begins task → user completes task with a result)

GOOD intent UIs:
- "Prepare Event": wizard — pick event → bulk-invite guests (each click creates an Einladung record) → book vendors (each creates a Buchung) → see budget summary → confirm
- "Schedule Lesson": focused view — pick student + instructor + vehicle + timeslot → creates Fahrstunde with all relationships
- "Process Returns": queue — scan overdue items one by one → set condition → mark returned → running count of processed items

BAD (these are just CRUD with lipstick — DO NOT BUILD THESE):
- ❌ A table of records with nicer filters (= the CRUD page already does this)
- ❌ A kanban board showing one entity grouped by status (= a dashboard widget, not a workflow)
- ❌ A single-entity form with extra styling (= that's just the existing dialog)
- ❌ A read-only status overview (= belongs on the dashboard, not a separate page)

## YOUR JOB

1. ANALYZE entities, fields, relationships. Think: what real-world MULTI-ENTITY WORKFLOWS do users perform? \
A workflow always involves creating/updating records across 2+ entities in a sequence of steps. Pick 2-3 workflows.

2. DISPATCH ALL SUBAGENTS IN PARALLEL (in a single response):
   a) Dispatch 'dashboard_builder' to build src/pages/DashboardOverview.tsx
      - Give it a summary of entities, relationships, and the intent page routes you decided on
   b) For EACH intent, dispatch 'intent_builder' with:
      - File path: src/pages/intents/{PascalCaseName}Page.tsx
      - DETAILED step-by-step description: what are the STEPS of the workflow, which entities are touched \
in each step, what records get created/updated, what live feedback to show between steps

3. After ALL subagents complete:
   - Edit src/App.tsx to add imports and routes for the new intent pages
   - Run 'npm run build', fix any TypeScript errors, keep fixing until build succeeds

4. After 'npm run build' succeeds, STOP immediately.

CRITICAL: Dispatch ALL subagents in a SINGLE response for maximum parallelism."""

        if user_instructions:
            query += (
                f"\n\nADDITIONAL user instructions (pass relevant parts to dashboard_builder):\n"
                f"<user-instructions>\n{user_instructions}\n</user-instructions>"
            )
            print(f"[LILO] Orchestrator-Mode MIT User Instructions: {user_instructions}")
        else:
            print(f"[LILO] Orchestrator-Mode: Dashboard + Intent UIs")

    t_agent_total_start = time.time()
    print(f"[LILO] Initialisiere Client")

    async with ClaudeSDKClient(options=options) as client:

        await client.query(query)

        t_last_step = t_agent_total_start

        async for message in client.receive_response():
            now = time.time()
            elapsed = round(now - t_agent_total_start, 1)
            dt = round(now - t_last_step, 1)
            t_last_step = now

            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        print(json.dumps({"type": "think", "content": block.text, "t": elapsed, "dt": dt}), flush=True)

                    elif isinstance(block, ToolUseBlock):
                        print(json.dumps({"type": "tool", "tool": block.name, "input": str(block.input), "t": elapsed, "dt": dt}), flush=True)

            elif isinstance(message, UserMessage):
                if isinstance(message.content, list):
                    for block in message.content:
                        if isinstance(block, ToolResultBlock):
                            content = str(block.content)[:4000] if block.content else ""
                            print(json.dumps({"type": "tool_result", "tool_use_id": block.tool_use_id, "output": content, "is_error": block.is_error, "t": elapsed}), flush=True)

            elif isinstance(message, ResultMessage):
                status = "success" if not message.is_error else "error"
                print(f"[LILO] Session ID: {message.session_id}")

                if message.session_id:
                    try:
                        with open("/home/user/app/.claude_session_id", "w") as f:
                            f.write(message.session_id)
                        print(f"[LILO] ✅ Session ID in Datei gespeichert")
                    except Exception as e:
                        print(f"[LILO] ⚠️ Fehler beim Speichern der Session ID: {e}")

                t_agent_total = time.time() - t_agent_total_start
                print(json.dumps({
                    "type": "result",
                    "status": status,
                    "cost": message.total_cost_usd,
                    "session_id": message.session_id,
                    "duration_s": round(t_agent_total, 1)
                }), flush=True)

if __name__ == "__main__":
    asyncio.run(main())
