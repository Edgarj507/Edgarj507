import { fetchAlerts, fetchConditions, lightningRisk, radarTiles } from './weather';

const res = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response;

describe('weather intelligence', () => {
  it('parses Open-Meteo and rounds coordinates to ~1 km', async () => {
    let url = '';
    const c = await fetchConditions(44.047372, -92.631858, (async (u: string) => { url = u; return res({ current: { temperature_2m: 63.4, weather_code: 95, wind_speed_10m: 12.1, wind_direction_10m: 141, precipitation_probability: 70, uv_index: 1.05, cape: 1500 } }); }) as typeof fetch);
    expect(url).toContain('latitude=44.05');
    expect(url).toContain('longitude=-92.63');
    expect(c).toMatchObject({ tempF: 63, windMph: 12, windFromDeg: 141, rainPct: 70, uv: 1, code: 95 });
  });
  it('NWS alerts: parsed; failures and non-US points give []', async () => {
    const a = await fetchAlerts(44.04, -92.63, (async () => res({ features: [{ id: 'x', properties: { event: 'Severe Thunderstorm Warning', severity: 'Severe', headline: 'SVR until 5pm' } }] })) as typeof fetch);
    expect(a[0]).toMatchObject({ event: 'Severe Thunderstorm Warning', severity: 'Severe' });
    expect(await fetchAlerts(51.5, -0.1, (async () => res({}, false)) as typeof fetch)).toEqual([]);
    expect(await fetchAlerts(51.5, -0.1, (async () => { throw new Error('offline'); }) as typeof fetch)).toEqual([]);
  });
  it('lightning risk from thunder codes, warnings, watches, CAPE and strikes', () => {
    expect(lightningRisk({ code: 3, cape: 0, rainPct: 10 }, []).risk).toBe('low');
    expect(lightningRisk({ code: 95, cape: 0, rainPct: 10 }, []).risk).toBe('high');
    expect(lightningRisk({ code: 3, cape: 0, rainPct: 10 }, [{ id: '', event: 'Severe Thunderstorm Warning', severity: '', headline: '', description: '', expires: '' }]).risk).toBe('high');
    expect(lightningRisk({ code: 3, cape: 0, rainPct: 10 }, [{ id: '', event: 'Severe Thunderstorm Watch', severity: '', headline: '', description: '', expires: '' }]).risk).toBe('elevated');
    expect(lightningRisk({ code: 2, cape: 1800, rainPct: 60 }, []).risk).toBe('elevated');
    expect(lightningRisk(null, [], 6)).toEqual({ risk: 'high', reasons: ['Lightning 6 mi away'] });
  });
  it('builds RainViewer tile templates', () => {
    expect(radarTiles({ host: 'https://tilecache.rainviewer.com', frames: [{ time: 1, path: '/v2/radar/abc' }] }, 0)).toBe('https://tilecache.rainviewer.com/v2/radar/abc/256/{z}/{x}/{y}/2/1_1.png');
  });
});
