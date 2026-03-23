import asyncio
import json
import time
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions, AssistantMessage, UserMessage, ToolUseBlock, ToolResultBlock, TextBlock, ResultMessage, HookMatcher
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

async def main():
    # Skills and CLAUDE.md are loaded automatically by Claude SDK from cwd
    # No manual instruction loading needed - the SDK reads:
    # - /home/user/app/CLAUDE.md (copied from SANDBOX_PROMPT.md)
    # - /home/user/app/.claude/skills/ (copied from sandbox_skills/)

    # Deployment is handled by the service (S3 upload + git push)
    # No deploy tool needed — agent just builds, service deploys

    # Optionen konfigurieren
    # setting_sources=["project"] is REQUIRED to load CLAUDE.md and .claude/skills/ from cwd
    options = ClaudeAgentOptions(
        hooks={
            # Log tool outputs (e.g. Bash stdout, Read contents) to container logs
            "PostToolUse": [HookMatcher(matcher=None, hooks=[_on_post_tool_use], timeout=60)],
        },
        system_prompt={
            "type": "preset",
            "preset": "claude_code",
            "append": (
                "MANDATORY RULES (highest priority):\n"
                "- No design_brief.md — analyze data in 1-2 sentences, then implement directly\n"
                "- DashboardOverview.tsx: Call Read('src/pages/DashboardOverview.tsx') FIRST, then Write ONCE with complete content. Never read back after writing.\n"
                "- NEVER use Bash for file operations (no cat, echo, heredoc, >, >>). ALWAYS use Read/Write/Edit tools. If a tool fails, retry with the SAME tool — never fall back to Bash.\n"
                "- index.css: NEVER touch — pre-generated design system (font, colors, sidebar). Use existing tokens.\n"
                "- Layout.tsx: APP_TITLE is pre-set to the appgroup name. Do NOT edit unless you need a different title.\n"
                "- CRUD pages/dialogs: NEVER touch — complete with all logic\n"
                "- App.tsx, PageShell.tsx, StatCard.tsx, ConfirmDialog.tsx: NEVER touch\n"
                "- No Read-back after Write/Edit\n"
                "- No Read of files whose contents are in .scaffold_context\n"
                "- Read .scaffold_context FIRST to understand all generated files\n"
                "- useDashboardData.ts, enriched.ts, enrich.ts, formatters.ts, ai.ts, chat-context.ts, ChatWidget.tsx: NEVER touch — use as-is\n"
                "- src/config/ai-features.ts: MAY edit — set AI_PHOTO_SCAN['Entity'] = true to enable photo scan in dialogs\n"
                "- Rules of Hooks: ALL hooks (useState, useEffect, useMemo, useCallback) MUST be BEFORE any early returns (loading/error). Never place a hook after 'if (loading) return' or 'if (error) return'.\n"
                "- IMPORT HYGIENE: Only import what you actually use. TypeScript strict mode errors on unused imports. BEFORE calling Write, mentally trace every import — if it doesn't appear in the JSX/logic body, remove it.\n"
                "- Dashboard is the PRIMARY WORKSPACE — build interactive domain-specific UI, not an info page\n"
                "- ALWAYS reuse pre-generated {Entity}Dialog from '@/components/dialogs/{Entity}Dialog' for create/edit forms in the dashboard — never build custom forms\n"
                "- TOUCH-FRIENDLY: NEVER hide action buttons/icons behind hover (no opacity-0 group-hover:opacity-100). All interactive elements must be visible without hovering.\n"
                "- After 'npm run build' succeeds, STOP immediately. Do not write summaries or analysis."
            ),
        },
        setting_sources=["project"],  # Required: loads CLAUDE.md and .claude/skills/
        permission_mode="bypassPermissions",
        disallowed_tools=["TodoWrite", "NotebookEdit", "WebFetch", "ExitPlanMode", "Task", "SlashCommand"],
        cwd="/home/user/app",
        model="claude-sonnet-4-6", # "claude-sonnet-4-5-20250929" "claude-opus-4-5-20251101"
    )

    # Session-Resume Unterstützung
    resume_session_id = os.getenv('RESUME_SESSION_ID')
    if resume_session_id:
        options.resume = resume_session_id
        print(f"[LILO] Resuming session: {resume_session_id}")

    # User Prompt - prefer file over env var (handles special chars better)
    user_prompt = None
    
    # First try reading from file (more reliable for special chars like umlauts)
    prompt_file = "/home/user/app/.user_prompt"
    if os.path.exists(prompt_file):
        try:
            with open(prompt_file, 'r') as f:
                user_prompt = f.read().strip()
            if user_prompt:
                print(f"[LILO] Prompt aus Datei gelesen: {len(user_prompt)} Zeichen")
        except Exception as e:
            print(f"[LILO] Fehler beim Lesen der Prompt-Datei: {e}")
    
    # Fallback to env var (for backwards compatibility)
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
        # Continue/Resume-Mode: Custom prompt vom User
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
        # Normal-Mode: Neues Dashboard bauen
        query = (
            "Read .scaffold_context and app_metadata.json. "
            "Analyze data, decide UI paradigm in 1-2 sentences, then implement directly. "
            "Follow .claude/skills/frontend-impl/SKILL.md. "
            "Use existing types and services from src/types/ and src/services/. "
            "Only import what you actually use — TypeScript strict mode errors on unused imports. "
            "Run 'npm run build' when done. Deployment is automatic."
        )

        if user_instructions:
            query += (
                f"\n\nADDITIONAL user instructions (treat as MINIMUM requirements, not as limits):\n"
                f"<user-instructions>\n{user_instructions}\n</user-instructions>\n"
                f"You MUST still build the full dashboard with all features you think are useful for the users — "
                f"analyze the data, decide the best UI paradigm, and implement everything you normally would. "
                f"The user instructions above are ADDITIONS on top of your normal work, not replacements. "
                f"Implement both: everything you would build anyway PLUS what the user asked for."
            )
            print(f"[LILO] Build-Mode MIT User Instructions: {user_instructions}")
        else:
            print(f"[LILO] Build-Mode: Neues Dashboard erstellen")

    t_agent_total_start = time.time()
    print(f"[LILO] Initialisiere Client")

    # 4. Der Client Lifecycle
    async with ClaudeSDKClient(options=options) as client:

        # Anfrage senden
        await client.query(query)

        # 5. Antwort-Schleife
        # receive_response() liefert alles bis zum Ende des Auftrags
        t_last_step = t_agent_total_start
        
        async for message in client.receive_response():
            now = time.time()
            elapsed = round(now - t_agent_total_start, 1)
            dt = round(now - t_last_step, 1)
            t_last_step = now
            
            # A. Wenn er denkt oder spricht
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        print(json.dumps({"type": "think", "content": block.text, "t": elapsed, "dt": dt}), flush=True)

                    elif isinstance(block, ToolUseBlock):
                        print(json.dumps({"type": "tool", "tool": block.name, "input": str(block.input), "t": elapsed, "dt": dt}), flush=True)

            # A2. Tool-Ergebnisse (UserMessage mit ToolResultBlock)
            elif isinstance(message, UserMessage):
                if isinstance(message.content, list):
                    for block in message.content:
                        if isinstance(block, ToolResultBlock):
                            content = str(block.content)[:4000] if block.content else ""
                            print(json.dumps({"type": "tool_result", "tool_use_id": block.tool_use_id, "output": content, "is_error": block.is_error, "t": elapsed}), flush=True)

            # B. Wenn er fertig ist (oder Fehler)
            elif isinstance(message, ResultMessage):
                status = "success" if not message.is_error else "error"
                print(f"[LILO] Session ID: {message.session_id}")
                
                # Save session_id to file for future resume (AFTER ResultMessage)
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