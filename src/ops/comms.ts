import { sanitizeText } from '../../supabase/functions/_shared/validation.ts';
import { normalizePhone } from '../lib/sms';

/** Two-way chat: one thread per golfer (keyed by phone, or name for guests) with the clubhouse. */
export interface ChatMessage {
  id: string;
  thread: string;
  threadName: string;
  from: 'player' | 'staff' | 'cart';
  author: string;
  text: string;
  at: number;
  readByStaff?: boolean;
  readByPlayer?: boolean;
}

export type BroadcastKind = 'lightning' | 'weather' | 'frost' | 'closure' | 'cancellation' | 'general';
export type BroadcastAudience = 'on-course' | 'event' | 'all';
export interface Broadcast {
  id: string; kind: BroadcastKind; severity: 'info' | 'warning' | 'critical';
  title: string; body: string; audience: BroadcastAudience; eventId?: string;
  author: string; at: number;
}

export interface SosAlert {
  id: string; from: 'player' | 'cart'; name: string; phone?: string;
  hole?: number; lat?: number; lng?: number; note?: string; at: number;
  status: 'active' | 'acknowledged' | 'resolved' | 'cancelled';
  ackBy?: string; ackAt?: number; resolvedAt?: number;
}

export const BROADCAST_TEMPLATES: Record<BroadcastKind, { title: string; body: string; severity: Broadcast['severity']; label: string }> = {
  lightning: { label: 'Lightning — clear the course', severity: 'critical', title: '⚡ Lightning in the area — suspend play now', body: 'Leave the course immediately and seek shelter in the clubhouse or a vehicle. Do not shelter under trees. Play resumes 30 minutes after the last strike.' },
  weather: { label: 'Severe weather', severity: 'warning', title: 'Severe weather approaching', body: 'Strong storms are expected shortly. Please head toward the clubhouse and watch for further updates.' },
  frost: { label: 'Frost delay', severity: 'info', title: 'Frost delay', body: 'Tee times are delayed while frost clears. We’ll send an update when the course opens.' },
  closure: { label: 'Course closed', severity: 'warning', title: 'Course closed', body: 'The course is closed for the rest of the day. Please return to the clubhouse.' },
  cancellation: { label: 'Weather cancellation', severity: 'warning', title: 'Event cancelled due to weather', body: 'Today’s event is cancelled due to weather. Refund / rain-check details will follow by email.' },
  general: { label: 'Announcement', severity: 'info', title: 'Announcement', body: '' },
};

/** Thread key for a golfer: normalized phone, else their name. */
export const threadKey = (phone: string | null | undefined, name: string) => normalizePhone(phone ?? '') ?? `name:${sanitizeText(name, 60).toLowerCase()}`;

export const cleanText = (t: string, max: number) => t.replace(/[<>]/g, '').split(/\r?\n/).map((l) => sanitizeText(l, max)).join('\n').trim().slice(0, max);

export function validMessage(m: ChatMessage) {
  return !!m.thread && m.thread.length <= 80 && cleanText(m.text, 1000).length > 0 && ['player', 'staff', 'cart'].includes(m.from);
}
export function validBroadcast(b: Broadcast) {
  return !!cleanText(b.title, 120) && !!cleanText(b.body, 600) && ['on-course', 'event', 'all'].includes(b.audience) && b.kind in BROADCAST_TEMPLATES;
}
