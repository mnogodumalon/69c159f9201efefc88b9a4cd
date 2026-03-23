import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import type { Action } from '@/lib/actions-agent';
import { fetchActions, executeAction, deleteAction as deleteActionApi, agentChat } from '@/lib/actions-agent';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image?: string;
};

interface ActionsContextType {
  actions: Action[];
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  messages: Message[];
  chatLoading: boolean;
  runAction: (action: Action) => void;
  sendMessage: (text: string, image?: string) => void;
  devMode: boolean;
  setDevMode: (v: boolean) => void;
  showActionCode: (action: Action) => void;
  deleteAction: (action: Action) => Promise<void>;
}

const ActionsContext = createContext<ActionsContextType | null>(null);

export function useActions() {
  const ctx = useContext(ActionsContext);
  if (!ctx) throw new Error('useActions must be used within ActionsProvider');
  return ctx;
}

export function ActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<Action[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [threadId] = useState(() => crypto.randomUUID());
  const chatLoadingRef = useRef(false);

  const [devMode, setDevMode] = useState(() => {
    try { return localStorage.getItem('developer-mode') === 'true'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem('developer-mode', String(devMode)); } catch {}
  }, [devMode]);

  const refreshActions = useCallback(async () => {
    try {
      const list = await fetchActions();
      setActions(list);
    } catch {
      // silently ignore — actions panel will be empty
    }
  }, []);

  useEffect(() => {
    void refreshActions();
  }, [refreshActions]);

  const runAction = useCallback((action: Action) => {
    if (chatLoadingRef.current) return;
    chatLoadingRef.current = true;
    setChatLoading(true);
    setChatOpen(true);

    const placeholderId = crypto.randomUUID();
    setMessages(prev => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', content: `Aktion: ${action.identifier}` },
      { id: placeholderId, role: 'assistant', content: 'In Arbeit...' },
    ]);

    executeAction(action.app_id, action.identifier)
      .then(result => {
        const content = result.error
          ? `Fehler bei der Ausführung:\n${result.error}`
          : result.stdout || '(no output)';
        setMessages(prev =>
          prev.map(m => m.id === placeholderId ? { ...m, content } : m)
        );
      })
      .catch(err => {
        setMessages(prev =>
          prev.map(m =>
            m.id === placeholderId
              ? { ...m, content: `Fehler bei der Ausführung: ${err instanceof Error ? err.message : String(err)}` }
              : m,
          )
        );
      })
      .finally(() => {
        chatLoadingRef.current = false;
        setChatLoading(false);
        void refreshActions();
        window.dispatchEvent(new Event('dashboard-refresh'));
      });
  }, [refreshActions]);

  const showActionCode = useCallback((action: Action) => {
    const code = action.value.trim() || '# Leere Aktion';
    const msg = `**Code für \`${action.identifier}\` in \`${action.app_name}\`:**\n\n\`\`\`python\n${code}\n\`\`\``;
    setChatOpen(true);
    setMessages(prev => [
      ...prev,
      { id: crypto.randomUUID(), role: 'assistant', content: msg },
    ]);
  }, []);

  const deleteActionFn = useCallback(async (action: Action) => {
    const confirmed = window.confirm(`Aktion löschen "${action.identifier}" (aus "${action.app_name}")?`);
    if (!confirmed) return;
    const result = await deleteActionApi(action.app_id, action.identifier);
    setChatOpen(true);
    if (result.error) {
      setMessages(prev => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: `**Fehler bei der Ausführung:** ${result.error}` },
      ]);
    } else {
      setMessages(prev => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: `Aktion gelöscht: \`${action.identifier}\` (aus \`${action.app_name}\`).` },
      ]);
      await refreshActions();
    }
  }, [refreshActions]);

  const sendMessage = useCallback(async (text: string, image?: string) => {
    if (chatLoadingRef.current) return;
    chatLoadingRef.current = true;
    setChatLoading(true);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      image: image ?? undefined,
    };
    const assistantId = crypto.randomUUID();

    setMessages(prev => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', content: '' },
    ]);

    try {
      const apiMessages = messages
        .concat(userMsg)
        .map(m => ({ role: m.role, content: m.content, image: m.image }));

      await agentChat(apiMessages, threadId, (delta) => {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId ? { ...m, content: m.content + delta } : m,
          )
        );
      });
    } catch (err) {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: `Fehler bei der Ausführung: ${err instanceof Error ? err.message : String(err)}` }
            : m,
        )
      );
    } finally {
      chatLoadingRef.current = false;
      setChatLoading(false);
      void refreshActions();
      window.dispatchEvent(new Event('dashboard-refresh'));
    }
  }, [messages, threadId, refreshActions]);

  return (
    <ActionsContext.Provider
      value={{ actions, chatOpen, setChatOpen, messages, chatLoading, runAction, sendMessage, devMode, setDevMode, showActionCode, deleteAction: deleteActionFn }}
    >
      {children}
    </ActionsContext.Provider>
  );
}
