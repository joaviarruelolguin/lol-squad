import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMatchesWithCache } from '@/lib/matchCache';

/**
 * Estado controlable de los dos externos.
 *
 * Va en vi.hoisted porque vi.mock se izan por encima de los imports: si el
 * factory tocara variables declaradas más abajo, entraría en TDZ.
 */
const ext = vi.hoisted(() => ({
  dbRows: [] as { match_id: string; detail: unknown; timeline: unknown }[],
  upserts: [] as Record<string, unknown>[],
  detailCalls: [] as string[],
  timelineCalls: [] as string[],
  timelineFailsFor: new Set<string>(),
}));

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        in: async (_col: string, ids: string[]) => ({
          data: ext.dbRows.filter((r) => ids.includes(r.match_id)),
          error: null,
        }),
      }),
      upsert: async (rows: Record<string, unknown>[]) => {
        ext.upserts.push(...rows);
        return { error: null };
      },
    }),
  }),
}));

vi.mock('@/lib/riot', () => ({
  RiotApiClient: class {
    async getMatchDetail(id: string) {
      ext.detailCalls.push(id);
      return { info: { matchId: id, participants: [], gameCreation: 1 } };
    }
    async getMatchTimeline(id: string) {
      ext.timelineCalls.push(id);
      if (ext.timelineFailsFor.has(id)) throw new Error('timeline 404');
      return { info: { frames: [{ participantFrames: {} }, { participantFrames: {} }] } };
    }
  },
}));

/**
 * Lo que cubre este archivo es un bug que estuvo en producción y dejó la
 * timeline del chat (LaneDiffPanel) muerta.
 *
 * /api/weekly y /api/flex-matches cargan con withTimeline=false, así que cachean
 * todas las partidas sin timeline. Cuando después el chat pedía una de esas
 * partidas, la fila ya existía: se devolvía timeline en null y Riot no se le
 * volvía a preguntar nunca. El endpoint respondía 400 "La partida no tiene
 * timeline disponible" para partidas que Riot tenía perfectamente.
 */
describe('getMatchesWithCache: timeline', () => {
  beforeEach(() => {
    ext.dbRows.length = 0;
    ext.upserts.length = 0;
    ext.detailCalls.length = 0;
    ext.timelineCalls.length = 0;
    ext.timelineFailsFor.clear();
  });

  it('pide el timeline cuando el detalle está cacheado pero el timeline no', async () => {
    // Estado real de producción: la partida ya está en match_cache porque la
    // trajo /api/weekly sin timeline.
    ext.dbRows.push({
      match_id: 'LA2_1',
      detail: { info: { matchId: 'LA2_1' } },
      timeline: null,
    });

    const [match] = await getMatchesWithCache(['LA2_1'], 'americas', true);

    expect(ext.timelineCalls).toEqual(['LA2_1']);
    expect(match?.timeline).not.toBeNull();
    expect(match?.timeline?.info?.frames).toHaveLength(2);
  });

  it('no vuelve a pedir el detalle que ya estaba en caché', async () => {
    ext.dbRows.push({
      match_id: 'LA2_1',
      detail: { info: { matchId: 'LA2_1' } },
      timeline: null,
    });

    await getMatchesWithCache(['LA2_1'], 'americas', true);

    // El detalle ya lo teníamos: solo hay que pagar el timeline.
    expect(ext.detailCalls).toEqual([]);
  });

  it('persiste el timeline que acaba de conseguir, junto al detalle', async () => {
    ext.dbRows.push({
      match_id: 'LA2_1',
      detail: { info: { matchId: 'LA2_1' } },
      timeline: null,
    });

    await getMatchesWithCache(['LA2_1'], 'americas', true);

    expect(ext.upserts).toHaveLength(1);
    expect(ext.upserts[0].match_id).toBe('LA2_1');
    expect(ext.upserts[0].timeline).toBeTruthy();
    // Se manda el detalle igual: el upsert reemplaza las columnas que viajan.
    expect(ext.upserts[0].detail).toBeTruthy();
  });

  it('usa el timeline cacheado sin volver a pegarle a Riot', async () => {
    ext.dbRows.push({
      match_id: 'LA2_1',
      detail: { info: { matchId: 'LA2_1' } },
      timeline: { info: { frames: [{ participantFrames: {} }] } },
    });

    const [match] = await getMatchesWithCache(['LA2_1'], 'americas', true);

    expect(ext.timelineCalls).toEqual([]);
    expect(match?.timeline).not.toBeNull();
  });

  it('sin pedir timeline no hace el request extra', async () => {
    // /api/weekly y /api/flex-matches van por acá.
    ext.dbRows.push({
      match_id: 'LA2_1',
      detail: { info: { matchId: 'LA2_1' } },
      timeline: null,
    });

    const [match] = await getMatchesWithCache(['LA2_1'], 'americas', false);

    expect(ext.timelineCalls).toEqual([]);
    expect(match?.timeline).toBeNull();
  });

  it('si el timeline no existe, devuelve la partida igual y no rompe', async () => {
    // Hay partidas a las que Riot no les da timeline: no puede tumbar el chat.
    ext.dbRows.push({
      match_id: 'LA2_1',
      detail: { info: { matchId: 'LA2_1' } },
      timeline: null,
    });
    ext.timelineFailsFor.add('LA2_1');

    const [match] = await getMatchesWithCache(['LA2_1'], 'americas', true);

    expect(match).toBeTruthy();
    expect(match?.info?.matchId).toBe('LA2_1');
    expect(match?.timeline).toBeNull();
    // Nada nuevo que guardar (el detalle ya estaba). Lo importante es que no se
    // escribe un timeline en null, que borraría el que otra corrida cacheó.
    expect(ext.upserts).toHaveLength(0);
  });

  it('la partida que no está en caché sigue yendo a por detalle y timeline', async () => {
    const [match] = await getMatchesWithCache(['LA2_9'], 'americas', true);

    expect(ext.detailCalls).toEqual(['LA2_9']);
    expect(ext.timelineCalls).toEqual(['LA2_9']);
    expect(match?.timeline).not.toBeNull();
  });
});
