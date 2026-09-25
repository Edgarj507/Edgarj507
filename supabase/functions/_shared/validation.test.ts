import { courseQuery, escapeLike, normalizeHandle, parseScoreSubmission, passwordProblem, sanitizeText } from './validation.ts';
import { corsHeaders, parseOrigins } from './cors.ts';

const RID = '3f1c2b9e-8d7a-4c1b-9a2e-1b2c3d4e5f60';

describe('sanitizeText', () => {
  it('strips markup, control and bidi characters and caps length', () => {
    expect(sanitizeText('<img src=x onerror=alert(1)>', 80)).toBe('img src=x onerror=alert(1)');
    expect(sanitizeText('Tiger‮ Woods\u0000', 80)).toBe('Tiger Woods');
    expect(sanitizeText('  lots   of\n\tspace ', 80)).toBe('lots of space');
    expect(sanitizeText('x'.repeat(100), 10)).toHaveLength(10);
    expect(sanitizeText(42, 10)).toBe('');
  });
});

describe('handles & search', () => {
  it('normalizes handles and rejects junk', () => {
    expect(normalizeHandle('@Alex_M')).toBe('alex_m');
    expect(normalizeHandle('a')).toBeNull();
    expect(normalizeHandle("bob'; drop table profiles;--")).toBeNull();
  });
  it('escapes LIKE wildcards', () => {
    expect(escapeLike('100%_off\\')).toBe('100\\%\\_off\\\\');
    expect(courseQuery('Pebble%')).toBe('Pebble\\%');
    expect(courseQuery('x')).toBeNull();
  });
  it('password policy', () => {
    expect(passwordProblem('short1')).toMatch(/10/);
    expect(passwordProblem('longbutnodigits')).toMatch(/numbers/);
    expect(passwordProblem('fairway2025!')).toBeNull();
  });
});

describe('parseScoreSubmission', () => {
  const ok = { roundId: RID, hole: 7, strokes: 4, putts: 2 };
  it('accepts a valid body', () => expect(parseScoreSubmission(ok)).toEqual({ ok: true, value: ok }));
  it('rejects extra fields (no mass assignment)', () =>
    expect(parseScoreSubmission({ ...ok, userId: 'someone-else' })).toEqual({ ok: false, error: 'unexpected_field' }));
  it.each([
    [{ ...ok, roundId: "1' or '1'='1" }, 'invalid_round'],
    [{ ...ok, hole: 19 }, 'hole_out_of_range'],
    [{ ...ok, strokes: 0 }, 'strokes_out_of_range'],
    [{ ...ok, strokes: 3.5 }, 'strokes_out_of_range'],
    [{ ...ok, strokes: '4' }, 'strokes_out_of_range'],
    [{ ...ok, putts: 5 }, 'putts_out_of_range'],
    [[ok], 'invalid_body'],
  ])('rejects %j', (body, error) => expect(parseScoreSubmission(body)).toEqual({ ok: false, error }));
});

describe('cors', () => {
  const allowed = parseOrigins('https://exclusive.golf, capacitor://localhost, http://evil.com, *');
  it('keeps only well-formed origins (no wildcard, no plain http except localhost)', () =>
    expect([...allowed]).toEqual(['https://exclusive.golf', 'capacitor://localhost']));
  it('echoes allowed origins only', () => {
    expect(corsHeaders('https://exclusive.golf', allowed)?.['Access-Control-Allow-Origin']).toBe('https://exclusive.golf');
    expect(corsHeaders('https://evil.example', allowed)).toBeNull();
    expect(corsHeaders(null, allowed)).toBeNull();
  });
});
