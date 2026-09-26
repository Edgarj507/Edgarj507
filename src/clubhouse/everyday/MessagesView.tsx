import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquarePlus, MessageSquareText, Send } from 'lucide-react';
import { threadKey, type ChatMessage } from '../../ops/comms';
import { normalizePhone } from '../../lib/sms';
import { newId } from '../../ops/useOps';
import { ago, field, glass } from '../ui';

export interface Thread { key: string; name: string; last: ChatMessage; unread: number }

export function threadsOf(messages: ChatMessage[]): Thread[] {
  const m = new Map<string, Thread>();
  for (const x of messages) {
    const t = m.get(x.thread) ?? { key: x.thread, name: x.threadName, last: x, unread: 0 };
    if (x.at >= t.last.at) t.last = x;
    if (x.from === 'player' && !x.readByStaff) t.unread++;
    m.set(x.thread, t);
  }
  return [...m.values()].sort((a, b) => b.last.at - a.last.at);
}

/** Clubhouse ↔ golfer two-way messaging (one thread per golfer). */
export function MessagesView({ messages, now, author, from = 'staff', open, onOpen, onSend, onRead }: {
  messages: ChatMessage[]; now: number; author: string; from?: 'staff' | 'cart';
  /** Thread to show (controlled so other screens can jump into a conversation). */
  open: { key: string; name: string } | null;
  onOpen: (t: { key: string; name: string } | null) => void;
  onSend: (m: ChatMessage) => void;
  onRead: (thread: string) => void;
}) {
  const threads = useMemo(() => threadsOf(messages), [messages]);
  const [text, setText] = useState('');
  const [compose, setCompose] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const convo = open ? messages.filter((m) => m.thread === open.key).sort((a, b) => a.at - b.at) : [];
  const end = useRef<HTMLDivElement>(null);
  const unreadOpen = open ? convo.some((m) => m.from === 'player' && !m.readByStaff) : false;
  useEffect(() => { if (open && unreadOpen) onRead(open.key); }, [open, unreadOpen, onRead]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [convo.length, open?.key]);

  const send = () => {
    if (!open || !text.trim()) return;
    onSend({ id: newId(), thread: open.key, threadName: open.name, from, author, text: text.trim(), at: Date.now() });
    setText('');
  };
  const start = () => {
    if (newName.trim().length < 2 || (newPhone && !normalizePhone(newPhone))) return;
    onOpen({ key: threadKey(newPhone, newName), name: newName.trim() });
    setCompose(false); setNewName(''); setNewPhone('');
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 @3xl:grid-cols-[280px_1fr]" data-testid="messages-view">
      <section aria-label="Conversations" className={`${glass} flex min-h-0 flex-col rounded-3xl p-3`}>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em]"><MessageSquareText size={13} /> Messages</h2>
          <button onClick={() => setCompose((v) => !v)} aria-label="New conversation" className="grid h-8 w-8 place-items-center rounded-full bg-white/10"><MessageSquarePlus size={14} /></button>
        </div>
        {compose && (
          <div className="mb-2 flex flex-col gap-1.5 rounded-2xl border border-white/10 bg-black/30 p-2">
            <input aria-label="Golfer name" placeholder="Golfer name" value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} className={field} />
            <input aria-label="Golfer phone" placeholder="Phone (optional)" type="tel" value={newPhone} maxLength={20} onChange={(e) => setNewPhone(e.target.value)} className={field} />
            <button onClick={start} className="rounded-xl bg-emerald-500 py-2 text-[10px] font-black uppercase tracking-widest text-black">Start conversation</button>
          </div>
        )}
        <ul className="eg-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {threads.map((t) => (
            <li key={t.key}>
              <button onClick={() => onOpen({ key: t.key, name: t.name })} aria-current={open?.key === t.key ? 'true' : undefined}
                className={`flex w-full flex-col rounded-xl border px-3 py-2 text-left ${open?.key === t.key ? 'border-emerald-400/40 bg-emerald-500/10' : 'border-white/5 bg-white/[0.03]'}`}>
                <span className="flex items-center justify-between gap-2 text-[12px] font-bold">
                  <span className="truncate">{t.name}</span>
                  {t.unread > 0 ? <span aria-label={`${t.unread} unread`} className="rounded-full bg-emerald-400 px-1.5 text-[9px] font-black text-black">{t.unread}</span> : <span className="text-[9px] font-normal text-white/40">{ago(t.last.at, now)}</span>}
                </span>
                <span className="truncate text-[11px] text-white/50">{t.last.from !== 'player' ? 'You: ' : ''}{t.last.text}</span>
              </button>
            </li>
          ))}
          {!threads.length && <li className="py-8 text-center text-[11px] text-white/40">No conversations yet.</li>}
        </ul>
      </section>

      <section aria-label="Conversation" className={`${glass} flex min-h-[320px] flex-col rounded-3xl p-3`}>
        {open ? (
          <>
            <div className="mb-2 flex items-center justify-between px-1">
              <h3 className="text-[13px] font-black">{open.name}</h3>
              <span className="font-mono text-[10px] text-white/40">{open.key.startsWith('name:') ? 'no phone' : open.key}</span>
            </div>
            <div className="eg-scroll flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-1" aria-live="polite">
              {convo.map((m) => <Bubble key={m.id} m={m} mine={m.from !== 'player'} now={now} />)}
              {!convo.length && <p className="py-6 text-center text-[11px] text-white/40">Say hello — the golfer gets it in their app.</p>}
              <div ref={end} />
            </div>
            <form onSubmit={(e) => { e.preventDefault(); send(); }} className="mt-2 flex gap-2">
              <input aria-label="Reply" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder={`Reply to ${open.name}…`} className={field} />
              <button type="submit" aria-label="Send message" disabled={!text.trim()} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-500 text-black disabled:opacity-40"><Send size={15} /></button>
            </form>
          </>
        ) : <p className="m-auto text-[12px] text-white/40">Pick a conversation.</p>}
      </section>
    </div>
  );
}

export function Bubble({ m, mine, now }: { m: ChatMessage; mine: boolean; now: number }) {
  return (
    <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
      <div className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[13px] ${mine ? 'rounded-br-md bg-emerald-500/85 text-black' : 'rounded-bl-md bg-white/10 text-white'}`}>{m.text}</div>
      <span className="mt-0.5 text-[9px] text-white/40">{m.from === 'cart' ? `${m.author} (cart)` : m.author} · {ago(m.at, now)}</span>
    </div>
  );
}
