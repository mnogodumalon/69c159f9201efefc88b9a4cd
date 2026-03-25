import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import type { Action } from '@/lib/actions-agent';
import { fetchActions, executeAction, agentChat } from '@/lib/actions-agent';

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
      });
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
        .map(m => ({ role: m.role, content: m.content }));

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
    }
  }, [messages, threadId, refreshActions]);

  return (
    <ActionsContext.Provider
      value={{ actions, chatOpen, setChatOpen, messages, chatLoading, runAction, sendMessage }}
    >
      {children}
    </ActionsContext.Provider>
  );
}
