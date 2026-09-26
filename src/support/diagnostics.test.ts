import { collectDiagnostics, recordError, scrub } from './diagnostics';

describe('bug report diagnostics', () => {
  it('scrubs personal data and secrets', () => {
    const s = scrub('user edgar@example.com at 44.047372, -92.631858 phone +1 (507) 555-0100 token=abcdefghijklmnopqrstuvwx eyJhbGciOi.eyJzdWIi.sig123');
    expect(s).not.toMatch(/edgar@|44\.047|555-0100|abcdefghijklmnop|eyJhbGci/);
    expect(s).toContain('[email]');
    expect(s).toContain('[coords]');
  });
  it('collects non-sensitive metadata with recent errors', () => {
    recordError(new Error('Map failed for pat@example.com'));
    const d = collectDiagnostics('player');
    expect(d).toMatchObject({ role: 'player' });
    expect(typeof d.appVersion).toBe('string');
    expect((d.recentErrors as string[])[0]).toMatch(/Error: Map failed for \[email\]/);
    expect(JSON.stringify(d)).not.toMatch(/pat@example/);
  });
});
