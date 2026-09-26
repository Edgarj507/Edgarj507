import { SG_CATEGORIES, type SgCategory, type SgResult } from './strokesGained';

export interface CardData {
  course: string;
  date: string;
  score: string;
  sg: SgResult;
  labels: Record<SgCategory, string>;
  insights: string[];
  handle: string;
}

/** Signed one-decimal SG; |n| < 0.05 reads as a neutral 0.0 (never "−0.0"). */
const f1 = (n: number) => (Math.abs(n) < 0.05 ? '0.0' : `${n > 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`);

/** Draw a 1080×1350 tour-style Strokes Gained card (Instagram portrait). Pure canvas — no DOM capture. */
export function drawCard(ctx: CanvasRenderingContext2D, d: CardData) {
  const W = 1080, H = 1350;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#07130d');
  bg.addColorStop(0.55, '#030605');
  bg.addColorStop(1, '#000');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // subtle fairway stripes
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.fillStyle = '#34d399';
  for (let x = -H; x < W; x += 90) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + 45, H); ctx.lineTo(x + 45 + H * 0.6, 0); ctx.lineTo(x + H * 0.6, 0); ctx.fill(); }
  ctx.restore();

  const mono = '"SF Mono", ui-monospace, Menlo, monospace';
  const sans = '-apple-system, "SF Pro Display", system-ui, sans-serif';
  ctx.fillStyle = '#34d399';
  ctx.font = `800 30px ${sans}`;
  ctx.letterSpacing = '8px';
  ctx.fillText('EXCLUSIVE.GOLF', 80, 120);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `700 26px ${sans}`;
  ctx.letterSpacing = '6px';
  ctx.fillText('ROUND BREAKDOWN', 80, 170);
  ctx.letterSpacing = '0px';

  ctx.fillStyle = '#fff';
  ctx.font = `800 58px ${sans}`;
  ctx.fillText(d.course.length > 26 ? d.course.slice(0, 25) + '…' : d.course, 80, 270);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `500 30px ${sans}`;
  ctx.fillText(`${d.date}  ·  ${d.score}`, 80, 320);

  // Total SG hero
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `700 24px ${sans}`;
  ctx.letterSpacing = '5px';
  ctx.fillText('STROKES GAINED VS TOUR', 80, 430);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = d.sg.total >= 0 ? '#34d399' : '#fda4af';
  ctx.font = `700 170px ${mono}`;
  ctx.fillText(f1(d.sg.total), 70, 590);

  // Category bars (diverging from centre)
  const top = 680, rowH = 104, cx = 640, span = 280;
  const maxAbs = Math.max(2, ...SG_CATEGORIES.map((c) => Math.abs(d.sg.byCategory[c])));
  SG_CATEGORIES.forEach((c, i) => {
    const y = top + i * rowH;
    const v = d.sg.byCategory[c];
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `600 32px ${sans}`;
    ctx.fillText(d.labels[c], 80, y + 12);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.roundRect(cx - span, y - 12, span * 2, 24, 12); ctx.fill();
    const w = (Math.abs(v) / maxAbs) * span;
    ctx.fillStyle = v >= 0 ? '#10b981' : '#fb7185';
    ctx.beginPath(); ctx.roundRect(v >= 0 ? cx : cx - w, y - 12, Math.max(w, 4), 24, 12); ctx.fill();
    ctx.fillStyle = v >= 0 ? '#6ee7b7' : '#fda4af';
    ctx.font = `700 34px ${mono}`;
    ctx.textAlign = 'right';
    ctx.fillText(f1(v), W - 80, y + 12);
    ctx.textAlign = 'left';
  });
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(cx - 1, top - 30, 2, rowH * 4 - 40);

  // Insights
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `500 28px ${sans}`;
  d.insights.slice(0, 2).forEach((line, i) => ctx.fillText(line.length > 58 ? line.slice(0, 57) + '…' : line, 80, 1150 + i * 44));

  ctx.fillStyle = '#34d399';
  ctx.font = `700 30px ${sans}`;
  ctx.fillText(d.handle, 80, H - 70);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = `500 22px ${sans}`;
  ctx.textAlign = 'right';
  ctx.fillText('SG vs PGA Tour baseline', W - 80, H - 70);
  ctx.textAlign = 'left';
}

export async function renderCard(d: CardData): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = 1080;
  c.height = 1350;
  drawCard(c.getContext('2d')!, d);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/png'));
}

/** Share via the native sheet when files are supported, else download. */
export async function shareCard(d: CardData) {
  const blob = await renderCard(d);
  const file = new File([blob], 'exclusive-golf-round.png', { type: 'image/png' });
  const text = `${d.course}: ${d.score}, ${f1(d.sg.total)} strokes gained vs Tour. ${d.handle} #ExclusiveGolf`;
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return 'shared'; } catch { /* cancelled */ return 'cancelled'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'downloaded';
}
