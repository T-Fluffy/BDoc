import * as signalR from '@microsoft/signalr';

export interface PresenceUser {
  userId: string;
  email: string;
}

export interface CursorMsg {
  userId: string;
  email: string;
  from: number;
  to: number;
}

export interface ContentMsg {
  documentId: string;
  updatedAt: string;
  byEmail: string;
}

interface Handlers {
  onPresence: (users: PresenceUser[]) => void;
  onCursor: (msg: CursorMsg) => void;
  onContent: (msg: ContentMsg) => void;
}

/** Module-level store read by the ProseMirror decorations plugin. */
export const remoteCursorStore: { current: CursorMsg[] } = { current: [] };

const handlersRef: { current: Handlers } = {
  current: { onPresence: () => undefined, onCursor: () => undefined, onContent: () => undefined },
};

let conn: signalR.HubConnection | null = null;
let joinedDoc: string | null = null;
let lastSend = 0;

async function ensureConn(): Promise<signalR.HubConnection> {
  if (!conn) {
    conn = new signalR.HubConnectionBuilder()
      .withUrl('/hubs/collab', {
        accessTokenFactory: () => localStorage.getItem('bdoc-token') ?? '',
      })
      .withAutomaticReconnect()
      .build();
    conn.on('PresenceUpdated', (users: PresenceUser[]) => handlersRef.current.onPresence(users));
    conn.on('CursorMoved', (msg: CursorMsg) => handlersRef.current.onCursor(msg));
    conn.on('ContentUpdated', (msg: ContentMsg) => handlersRef.current.onContent(msg));
    conn.onreconnected(async () => {
      if (joinedDoc && conn) {
        try {
          await conn.invoke('JoinDocument', joinedDoc);
        } catch {
          /* access may have been revoked while offline */
        }
      }
    });
  }
  if (conn.state === signalR.HubConnectionState.Disconnected) {
    await conn.start();
  }
  return conn;
}

/** Join a document room. Returns false when access is denied or offline. */
export async function joinCollab(docId: string, handlers: Handlers): Promise<boolean> {
  handlersRef.current = handlers;
  try {
    const c = await ensureConn();
    if (joinedDoc && joinedDoc !== docId) {
      try {
        await c.invoke('LeaveDocument', joinedDoc);
      } catch {
        /* ignore */
      }
    }
    await c.invoke('JoinDocument', docId);
    joinedDoc = docId;
    return true;
  } catch {
    return false;
  }
}

export async function leaveCollab(): Promise<void> {
  if (conn && joinedDoc && conn.state === signalR.HubConnectionState.Connected) {
    try {
      await conn.invoke('LeaveDocument', joinedDoc);
    } catch {
      /* ignore */
    }
  }
  joinedDoc = null;
}

/** Throttled fire-and-forget cursor broadcast with trailing send. */
let pending: { docId: string; from: number; to: number } | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function fire(docId: string, from: number, to: number): void {
  if (!conn || conn.state !== signalR.HubConnectionState.Connected || joinedDoc !== docId) return;
  conn.invoke('SendCursor', docId, from, to).catch(() => undefined);
}

export function sendCursor(docId: string, from: number, to: number): void {
  const now = Date.now();
  if (now - lastSend >= 120) {
    lastSend = now;
    fire(docId, from, to);
    return;
  }
  // Leading call already went out: remember the latest state and flush it
  // after the window so receivers converge (no stuck stale caret).
  pending = { docId, from, to };
  if (!pendingTimer) {
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      if (pending) {
        const p = pending;
        pending = null;
        lastSend = Date.now();
        fire(p.docId, p.from, p.to);
      }
    }, 130);
  }
}

/** Tell the room our save persisted (server verifies write access). */
export function notifySaved(docId: string): void {
  if (!conn || conn.state !== signalR.HubConnectionState.Connected || joinedDoc !== docId) return;
  conn.invoke('NotifySaved', docId).catch(() => undefined);
}

/** Deterministic caret color per e-mail. */
export function colorFor(email: string): string {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 70% 50%)`;
}
