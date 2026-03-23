const AGENT_ENDPOINT = "https://my.living-apps.de/actions-agent";
const APPGROUP_ID = "69c159f9201efefc88b9a4cd";

export interface Action {
  identifier: string;
  description: string;
  app_id: string;
  app_name: string;
}

export async function fetchActions(): Promise<Action[]> {
  const resp = await fetch(
    `${AGENT_ENDPOINT}/actions?appgroup_id=${APPGROUP_ID}`,
    { credentials: "include" },
  );
  if (!resp.ok) return [];
  const data = await resp.json();
  const flat: Action[] = [];
  for (const app of data.apps || []) {
    for (const action of app.actions || []) {
      flat.push({
        identifier: action.identifier,
        description: action.description || "",
        app_id: app.app_id,
        app_name: app.app_name,
      });
    }
  }
  return flat;
}

export async function executeAction(
  appId: string,
  actionIdentifier: string,
): Promise<{ stdout: string | null; error: string | null }> {
  const resp = await fetch(`${AGENT_ENDPOINT}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ app_id: appId, action_identifier: actionIdentifier }),
  });
  const data = await resp.json();
  return { stdout: data.stdout ?? null, error: data.error ?? null };
}

export async function agentChat(
  messages: Array<{ role: string; content: string }>,
  threadId: string,
  onContent: (delta: string) => void,
): Promise<void> {
  const resp = await fetch(`${AGENT_ENDPOINT}/copilotkit/agents/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      name: "klar-agent",
      threadId,
      state: {},
      properties: { appgroup_id: APPGROUP_ID },
      messages: messages.map((m) => ({
        id: crypto.randomUUID(),
        role: m.role,
        content: m.content,
        createdAt: new Date().toISOString(),
      })),
      actions: [],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Agent API ${resp.status}: ${text.slice(0, 200)}`);
  }

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.type === "TextMessageContent") {
          onContent(event.content);
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  // Process any remaining buffer
  if (buffer.trim()) {
    try {
      const event = JSON.parse(buffer);
      if (event.type === "TextMessageContent") {
        onContent(event.content);
      }
    } catch {
      // skip
    }
  }
}
