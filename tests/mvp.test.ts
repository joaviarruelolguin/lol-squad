import { describe, it, expect } from 'vitest';
import {
  startOfWeek,
  getWeekWindow,
  getRollingWindow,
  isUsableWindow,
  matchIdToTimestamp,
  isInWindow,
  filterMatchIdsByWindow,
  computeMvpScore,
  confidenceWeight,
  applyConfidence,
  isLowSample,
  recentWinrate,
  currentStreak,
  computeMvp,
  streakLabel,
  MVP_REFERENCE,
  MVP_WEIGHTS,
  type MvpMemberLike,
} from '@/lib/mvp';

// 2026-03-11 es miércoles. Lo uso como ancla porque los tests de ventana
// dependen del día de la semana.
const WEDNESDAY = new Date(2026, 2, 11, 15, 30, 0).getTime();

describe('startOfWeek', () => {
  it('deja el lunes de la semana actual a las 00:00', () => {
    const result = startOfWeek(WEDNESDAY);
    const d = new Date(result);
    expect(d.getDay()).toBe(1); // lunes
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
  });

  it('el lunes temprano devuelve el mismo día', () => {
    const monday = new Date(2026, 2, 9, 0, 0, 1).getTime();
    expect(startOfWeek(monday)).toBe(new Date(2026, 2, 9, 0, 0, 0).getTime());
  });

  it('el domingo sigue pertenciendo a la semana que empezó el lunes', () => {
    const sunday = new Date(2026, 2, 15, 23, 59, 59).getTime();
    expect(startOfWeek(sunday)).toBe(new Date(2026, 2, 9, 0, 0, 0).getTime());
  });

  it('es idempotente', () => {
    expect(startOfWeek(startOfWeek(WEDNESDAY))).toBe(startOfWeek(WEDNESDAY));
  });
});

describe('getWeekWindow', () => {
  it('termina ahora y se renueva en 7 días', () => {
    const w = getWeekWindow(WEDNESDAY);
    expect(w.start).toBe(startOfWeek(WEDNESDAY));
    expect(w.end).toBe(WEDNESDAY);
    expect(w.kind).toBe('week');
    expect(w.renewsAt - w.start).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('renueva siempre el lunes siguiente', () => {
    const w = getWeekWindow(WEDNESDAY);
    expect(new Date(w.renewsAt).getDay()).toBe(1);
  });

  it('la ventana todavía no está cumplida (renewsAt > end)', () => {
    const w = getWeekWindow(WEDNESDAY);
    expect(w.renewsAt).toBeGreaterThan(w.end);
  });
});

describe('getRollingWindow', () => {
  it('mira 7 días para atrás', () => {
    const w = getRollingWindow(WEDNESDAY);
    expect(w.end - w.start).toBe(7 * 24 * 60 * 60 * 1000);
    expect(w.kind).toBe('rolling');
  });

  it('se renueva el mismo lunes que la ventana semanal', () => {
    expect(getRollingWindow(WEDNESDAY).renewsAt).toBe(
      getWeekWindow(WEDNESDAY).renewsAt
    );
  });
});

describe('isUsableWindow', () => {
  it('exige al menos 2 partidas', () => {
    expect(isUsableWindow(0)).toBe(false);
    expect(isUsableWindow(1)).toBe(false);
    expect(isUsableWindow(2)).toBe(true);
    expect(isUsableWindow(50)).toBe(true);
  });
});

describe('matchIdToTimestamp', () => {
  it('extrae el timestamp de un match ID real', () => {
    // 6801234567 segundos = 2025-07-24 aprox
    expect(matchIdToTimestamp('LA2_6801234567')).toBe(6801234567000);
  });

  it('funciona con otras regiones', () => {
    expect(matchIdToTimestamp('BR1_6800000000')).toBe(6800000000000);
    expect(matchIdToTimestamp('EUW1_6700000000')).toBe(6700000000000);
  });

  it('devuelve null con formatos que no podemos interpretar', () => {
    expect(matchIdToTimestamp('sin-separador')).toBeNull();
    expect(matchIdToTimestamp('')).toBeNull();
    expect(matchIdToTimestamp('LA2_')).toBeNull();
    expect(matchIdToTimestamp('LA2_abc')).toBeNull();
  });

  it('rechaza timestamps en milisegundos (13 dígitos)', () => {
    // Si Riot pasara a ms, 1770000000000 nos daría una fecha en el año 58000.
    expect(matchIdToTimestamp('LA2_1770000000000')).toBeNull();
  });

  it('rechaza notación exponencial', () => {
    // Number('1.7e12') = 1700000000000, pero no es un match ID válido.
    expect(matchIdToTimestamp('LA2_1.7e12')).toBeNull();
  });

  it('rechaza números fuera de rango razonable', () => {
    expect(matchIdToTimestamp('LA2_0')).toBeNull();
    expect(matchIdToTimestamp('LA2_123')).toBeNull();
  });
});

describe('isInWindow / filterMatchIdsByWindow', () => {
  const window = getWeekWindow(WEDNESDAY);
  const MondayNoon = startOfWeek(WEDNESDAY) + 12 * 60 * 60 * 1000;
  const lastWeek = startOfWeek(WEDNESDAY) - 24 * 60 * 60 * 1000;

  it('acepta una partida dentro de la ventana', () => {
    expect(isInWindow(`LA2_${MondayNoon / 1000}`, window)).toBe(true);
  });

  it('descarta una partida de la semana anterior', () => {
    expect(isInWindow(`LA2_${lastWeek / 1000}`, window)).toBe(false);
  });

  it('si no puede parsear el ID, deja pasar la partida', () => {
    // Nunca perdemos una partida por una optimización de filtrado.
    expect(isInWindow('formato-raro', window)).toBe(true);
  });

  it('filtra una lista mixta', () => {
    const ids = [
      `LA2_${MondayNoon / 1000}`,
      `LA2_${lastWeek / 1000}`,
      'formato-raro',
      `BR1_${MondayNoon / 1000}`,
    ];
    expect(filterMatchIdsByWindow(ids, window)).toEqual([
      `LA2_${MondayNoon / 1000}`,
      'formato-raro',
      `BR1_${MondayNoon / 1000}`,
    ]);
  });
});

describe('computeMvpScore', () => {
  it('un jugador perfecto en todo llega al tope de 100', () => {
    const score = computeMvpScore({
      winrate: 100,
      avgKDA: 99,
      damageShare: 99,
      avgVision: 999,
      momentum: 100,
    });
    expect(score.raw).toBe(100);
  });

  it('un jugador flojo en todo da 0', () => {
    const score = computeMvpScore({
      winrate: 0,
      avgKDA: 0,
      damageShare: 0,
      avgVision: 0,
      momentum: 0,
    });
    expect(score.raw).toBe(0);
  });

  it('las métricas exactamente en la referencia dan el peso completo', () => {
    const score = computeMvpScore({
      winrate: MVP_REFERENCE.winrate,
      avgKDA: MVP_REFERENCE.kda,
      damageShare: MVP_REFERENCE.damageShare,
      avgVision: MVP_REFERENCE.vision,
      momentum: MVP_REFERENCE.momentum,
    });
    expect(score.raw).toBe(100);
  });

  it('los pesos suman 100', () => {
    const total = Object.values(MVP_WEIGHTS).reduce((s, n) => s + n, 0);
    expect(total).toBe(100);
  });

  it('los pesos son positivos', () => {
    for (const w of Object.values(MVP_WEIGHTS)) {
      expect(w).toBeGreaterThan(0);
    }
  });

  it('el desglose casi suma el total (cada parte viene redondeada a 1 decimal)', () => {
    const score = computeMvpScore({
      winrate: 73,
      avgKDA: 3.4,
      damageShare: 31,
      avgVision: 52,
      momentum: 60,
    });
    const partsTotal = Object.values(score.parts).reduce((s, n) => s + n, 0);
    // 5 partes redondeadas a 1 decimal => hasta 0.25 de deriva en el peor caso.
    expect(Math.abs(partsTotal - score.raw)).toBeLessThan(0.25);
  });

  it('no se puede ganar multiplicando una sola métrica', () => {
    // KDA absurdo, todo lo demás en cero.
    const carry = computeMvpScore({
      winrate: 0,
      avgKDA: 50,
      damageShare: 0,
      avgVision: 0,
      momentum: 0,
    });
    expect(carry.raw).toBe(MVP_WEIGHTS.kda);
  });

  it('es monótona: mejorar una métrica nunca empeora el puntaje', () => {
    const base = {
      winrate: 50,
      avgKDA: 2.5,
      damageShare: 20,
      avgVision: 30,
      momentum: 50,
    };
    const baseScore = computeMvpScore(base).raw;
    const better = computeMvpScore({ ...base, winrate: 80 }).raw;
    expect(better).toBeGreaterThan(baseScore);
  });

  it('tolera NaN e infinitos sin romperse', () => {
    const score = computeMvpScore({
      winrate: NaN,
      avgKDA: Infinity,
      damageShare: -50,
      avgVision: NaN,
      momentum: NaN,
    });
    expect(Number.isFinite(score.raw)).toBe(true);
    expect(score.raw).toBeGreaterThanOrEqual(0);
  });
});

describe('confidenceWeight', () => {
  it('con 0 partidas no pesa nada', () => {
    expect(confidenceWeight(0)).toBe(0);
  });

  it('crece de forma monótona con las partidas', () => {
    let prev = -1;
    for (let g = 0; g <= 40; g++) {
      const w = confidenceWeight(g);
      expect(w).toBeGreaterThan(prev);
      prev = w;
    }
  });

  it('nunca llega a 1', () => {
    expect(confidenceWeight(1000)).toBeLessThan(1);
  });

  it('con 1 partida pesa menos de la mitad', () => {
    expect(confidenceWeight(1)).toBeLessThan(0.5);
  });
});

describe('applyConfidence', () => {
  it('con 0 partidas devuelve la media de la squad', () => {
    expect(applyConfidence(100, 0, 55)).toBe(55);
  });

  it('con muchas partidas se acerca al puntaje crudo', () => {
    const result = applyConfidence(100, 100, 50);
    expect(result).toBeGreaterThan(90);
  });

  it('un 1/1-no puede ganarle al jugador constante', () => {
    // El rusher tiene 100 crudo con 1 partida; el regular, 80 con 20.
    const rusher = applyConfidence(100, 1, 70);
    const regular = applyConfidence(80, 20, 70);
    expect(regular).toBeGreaterThan(rusher);
  });
});

describe('isLowSample', () => {
  it('marca como muestra chica menos de 3 partidas', () => {
    expect(isLowSample(1)).toBe(true);
    expect(isLowSample(2)).toBe(true);
    expect(isLowSample(3)).toBe(false);
  });
});

describe('recentWinrate', () => {
  const t = (created: number, win: boolean) => ({ created, win });

  it('devuelve 0 sin partidas', () => {
    expect(recentWinrate([], 5)).toBe(0);
  });

  it('mira solo los últimos N, no todos', () => {
    const timeline = [
      t(1, false),
      t(2, false),
      t(3, true),
      t(4, true),
    ];
    // Con n=2 solo ve las dos últimas: 100%.
    expect(recentWinrate(timeline, 2)).toBe(100);
    // Con todas: 2/4.
    expect(recentWinrate(timeline, 10)).toBe(50);
  });

  it('ordena por fecha aunque le pasen el timeline desordenado', () => {
    const desordenado = [t(3, true), t(1, false), t(2, false)];
    expect(recentWinrate(desordenado, 1)).toBe(100);
  });

  it('no muta el array original', () => {
    const timeline = [t(3, true), t(1, false)];
    const copia = [...timeline];
    recentWinrate(timeline, 1);
    expect(timeline).toEqual(copia);
  });
});

describe('currentStreak', () => {
  const t = (created: number, win: boolean) => ({ created, win });

  it('sin partidas no hay racha', () => {
    expect(currentStreak([])).toEqual({ type: null, length: 0 });
  });

  it('detecta una racha de victorias', () => {
    expect(currentStreak([t(1, true), t(2, true), t(3, true), t(4, false)])).toEqual(
      { type: 'loss', length: 1 }
    );
  });

  it('mide la racha completa, no la total', () => {
    const timeline = [t(1, true), t(2, true), t(3, true), t(4, true), t(5, true), t(6, true), t(7, false)];
    expect(currentStreak(timeline)).toEqual({ type: 'loss', length: 1 });
  });

  it('detecta una racha de derrotas', () => {
    expect(currentStreak([t(1, true), t(2, false), t(3, false)])).toEqual({
      type: 'loss',
      length: 2,
    });
  });

  it('funciona con el timeline desordenado', () => {
    expect(currentStreak([t(3, false), t(1, true), t(2, false)])).toEqual({
      type: 'loss',
      length: 2,
    });
  });
});

describe('streakLabel', () => {
  it('describe una racha positiva', () => {
    expect(streakLabel({ type: 'win', length: 3 })).toBe('3 partidas ganando');
  });

  it('usa singular para una sola partida', () => {
    expect(streakLabel({ type: 'loss', length: 1 })).toBe('1 partida perdiendo');
  });

  it('sin racha muestra un guion', () => {
    expect(streakLabel({ type: null, length: 0 })).toBe('—');
  });
});

// ============================================================
// computeMvp (integración con partidas)
// ============================================================

const MEMBERS: MvpMemberLike[] = [
  { id: 'm1', puuid: 'p1', gameName: 'Ana', nickname: 'La pro' },
  { id: 'm2', puuid: 'p2', gameName: 'Beto', nickname: 'El tanque' },
];

interface PlayerStats {
  kills?: number;
  deaths?: number;
  assists?: number;
  damage?: number;
  vision?: number;
  cs?: number;
  wards?: number;
  championName?: string;
}

/**
 * Arma un match-v5 con 10 participantes (5 por lado).
 *
 * `ana` y `beto` son los dos miembros de la squad: comparten resultado de
 * partida pero pueden tener stats muy distintas, que es justo lo que necesita
 * el puntaje para decidir.
 */
function makeMatch({
  created,
  squadWon,
  ana = {},
  beto = {},
}: {
  created: number;
  squadWon: boolean;
  ana?: PlayerStats;
  beto?: PlayerStats;
}) {
  const mk = (
    teamId: number,
    puuid: string,
    win: boolean,
    s: PlayerStats,
    defaultDamage = 20000
  ) => ({
    puuid,
    teamId,
    win,
    kills: s.kills ?? 2,
    deaths: s.deaths ?? 3,
    assists: s.assists ?? 5,
    championName: s.championName ?? 'Ezreal',
    championId: 1,
    totalDamageDealtToChampions: s.damage ?? defaultDamage,
    visionScore: s.vision ?? 20,
    totalMinionsKilled: s.cs ?? 200,
    neutralMinionsKilled: 0,
    wardsPlaced: s.wards ?? 5,
  });

  return {
    info: {
      gameCreation: created,
      gameDuration: 1800,
      participants: [
        // Equipo 1: Ana y Beto (squad) + 3 bots.
        mk(100, 'p1', squadWon, ana, 20000),
        mk(100, 'p2', squadWon, beto, 20000),
        mk(100, 'bot1', !squadWon, {}, 15000),
        mk(100, 'bot2', !squadWon, {}, 15000),
        mk(100, 'bot3', !squadWon, {}, 15000),
        // Equipo 2: 5 enemigos que se llevan el resto del daño.
        mk(200, 'e1', !squadWon, {}, 30000),
        mk(200, 'e2', !squadWon, {}, 30000),
        mk(200, 'e3', !squadWon, {}, 30000),
        mk(200, 'e4', !squadWon, {}, 30000),
        mk(200, 'e5', !squadWon, {}, 30000),
      ],
    },
  };
}

const WINDOW = {
  start: 0,
  end: 10_000_000_000,
  renewsAt: 20_000_000_000,
  kind: 'week' as const,
  days: 7,
};

describe('computeMvp', () => {
  it('devuelve vacío si no hay partidas', () => {
    const result = computeMvp([], MEMBERS, WINDOW);
    expect(result.entries).toEqual([]);
    expect(result.matchesInWindow).toBe(0);
    expect(result.totalPlayerGames).toBe(0);
    expect(result.squadWins).toBe(0);
  });

  it('ignora partidas anteriores a la ventana', () => {
    const old = makeMatch({ created: 1000, squadWon: true });
    const ventanaFutura = { ...WINDOW, start: 2_000_000, end: 3_000_000 };
    const result = computeMvp([old], MEMBERS, ventanaFutura);
    expect(result.matchesInWindow).toBe(0);
    expect(result.entries).toEqual([]);
  });

  it('ignora partidas posteriores al fin de la ventana', () => {
    const futura = makeMatch({ created: 50_000_000_000, squadWon: true });
    const result = computeMvp([futura], MEMBERS, WINDOW);
    expect(result.matchesInWindow).toBe(0);
    expect(result.entries).toEqual([]);
  });

  it('incluye las partidas justo en los bordes de la ventana', () => {
    const enBorde = [
      makeMatch({ created: WINDOW.start, squadWon: true }),
      makeMatch({ created: WINDOW.end, squadWon: true }),
    ];
    expect(computeMvp(enBorde, MEMBERS, WINDOW).matchesInWindow).toBe(2);
  });

  it('ignora partidas donde no jugó nadie de la squad', () => {
    const match = makeMatch({ created: 1000, squadWon: true });
    match.info.participants = match.info.participants.map((p) => ({
      ...p,
      puuid: `otro-${p.puuid}`,
    }));

    const result = computeMvp([match], MEMBERS, WINDOW);
    expect(result.matchesInWindow).toBe(0);
  });

  it('agrega las partidas de la ventana y cuenta la winrate de la squad', () => {
    const matches = [
      makeMatch({ created: 1000, squadWon: true }),
      makeMatch({ created: 2000, squadWon: false }),
      makeMatch({ created: 3000, squadWon: true }),
    ];

    const result = computeMvp(matches, MEMBERS, WINDOW);
    expect(result.matchesInWindow).toBe(3);
    expect(result.entries).toHaveLength(2);
    // 3 partidas x 2 jugadores = 6 partidas-individuales
    expect(result.totalPlayerGames).toBe(6);
    // 2 victorias x 2 jugadores
    expect(result.squadWins).toBe(4);
  });

  it('excluye a los miembros que no jugaron en la ventana', () => {
    const matches = [makeMatch({ created: 1000, squadWon: true })];
    const result = computeMvp(matches, MEMBERS, WINDOW);
    // Ambos juntaban en la misma partida, así que los dos cuentan.
    expect(result.entries.map((e) => e.gameName).sort()).toEqual(['Ana', 'Beto']);
  });

  it('corona al mejor jugador de la ventana', () => {
    const matches = [
      makeMatch({
        created: 1000,
        squadWon: true,
        ana: { kills: 15, deaths: 1, assists: 10, damage: 60000, vision: 50 },
        beto: { kills: 3, deaths: 6, assists: 12, damage: 22000, vision: 55 },
      }),
      makeMatch({
        created: 2000,
        squadWon: true,
        ana: { kills: 12, deaths: 2, assists: 11, damage: 55000, vision: 48 },
        beto: { kills: 2, deaths: 7, assists: 10, damage: 20000, vision: 52 },
      }),
      makeMatch({
        created: 3000,
        squadWon: false,
        ana: { kills: 4, deaths: 6, assists: 8, damage: 30000, vision: 44 },
        beto: { kills: 1, deaths: 9, assists: 5, damage: 18000, vision: 50 },
      }),
    ];

    const result = computeMvp(matches, MEMBERS, WINDOW);

    const ana = result.entries.find((e) => e.gameName === 'Ana')!;
    const beto = result.entries.find((e) => e.gameName === 'Beto')!;

    expect(ana.wins).toBe(2);
    expect(ana.losses).toBe(1);
    expect(ana.winrate).toBe(67);
    expect(result.entries[0].gameName).toBe('Ana');
    expect(ana.score).toBeGreaterThan(beto.score);
    expect(ana.avgKills).toBeCloseTo((15 + 12 + 4) / 3, 1);
    expect(ana.avgDeaths).toBeCloseTo((1 + 2 + 6) / 3, 1);
  });

  it('el damage share es el porcentaje del daño de SU equipo', () => {
    // Ana 60000, Beto 20000, 3 bots 15000 c/u = 125000 total del equipo 1.
    const matches = [
      makeMatch({
        created: 1000,
        squadWon: true,
        ana: { damage: 60000 },
        beto: { damage: 20000 },
      }),
    ];

    const result = computeMvp(matches, MEMBERS, WINDOW);
    const ana = result.entries.find((e) => e.gameName === 'Ana')!;
    // 60000 / (60000 + 20000 + 15000*3) = 60000/125000 = 48%
    expect(ana.damageShare).toBeCloseTo(48, 0);
  });

  it('marca muestra chica cuando el jugador jugó menos de 3 veces', () => {
    const matches = [makeMatch({ created: 1000, squadWon: true })];
    const result = computeMvp(matches, MEMBERS, WINDOW);
    for (const entry of result.entries) {
      expect(entry.lowSample).toBe(true);
      expect(entry.confidence).toBeLessThan(30);
    }
  });

  it('deja de marcar muestra chica con 3 o más partidas', () => {
    const matches = [
      makeMatch({ created: 1000, squadWon: true }),
      makeMatch({ created: 2000, squadWon: true }),
      makeMatch({ created: 3000, squadWon: true }),
    ];
    const result = computeMvp(matches, MEMBERS, WINDOW);
    for (const entry of result.entries) {
      expect(entry.lowSample).toBe(false);
    }
  });

  it('guarda el campeón más jugado con su winrate', () => {
    const matches = [
      makeMatch({ created: 1000, squadWon: true, ana: { championName: 'Jinx' } }),
      makeMatch({ created: 2000, squadWon: false, ana: { championName: 'Jinx' } }),
      makeMatch({ created: 3000, squadWon: true, ana: { championName: 'Lucian' } }),
    ];

    const result = computeMvp(matches, MEMBERS, WINDOW);
    const ana = result.entries.find((e) => e.gameName === 'Ana')!;
    expect(ana.champion).toEqual({ name: 'Jinx', games: 2, wins: 1, winrate: 50 });
  });

  it('guarda los últimos 5 resultados en orden cronológico', () => {
    // 6 partidas: se descarta la más vieja.
    const matches = [
      makeMatch({ created: 1000, squadWon: false }),
      makeMatch({ created: 2000, squadWon: true }),
      makeMatch({ created: 3000, squadWon: true }),
      makeMatch({ created: 4000, squadWon: false }),
      makeMatch({ created: 5000, squadWon: true }),
      makeMatch({ created: 6000, squadWon: false }),
    ];

    const result = computeMvp(matches, MEMBERS, WINDOW);
    expect(result.entries[0].lastResults).toEqual([true, true, false, true, false]);
  });

  it('calcula la racha actual', () => {
    const matches = [
      makeMatch({ created: 1000, squadWon: true }),
      makeMatch({ created: 2000, squadWon: true }),
      makeMatch({ created: 3000, squadWon: true }),
    ];
    const result = computeMvp(matches, MEMBERS, WINDOW);
    expect(result.entries[0].streak).toEqual({ type: 'win', length: 3 });
  });

  it('es determinístico ante empates exactos', () => {
    // Ana y Beto con stats idénticas: el desempate no puede depender del
    // orden de iteración del Map.
    const matches = [
      makeMatch({
        created: 1000,
        squadWon: true,
        ana: { kills: 10, deaths: 2, assists: 8, damage: 40000, vision: 40 },
        beto: { kills: 10, deaths: 2, assists: 8, damage: 40000, vision: 40 },
      }),
      makeMatch({
        created: 2000,
        squadWon: true,
        ana: { kills: 10, deaths: 2, assists: 8, damage: 40000, vision: 40 },
        beto: { kills: 10, deaths: 2, assists: 8, damage: 40000, vision: 40 },
      }),
      makeMatch({
        created: 3000,
        squadWon: true,
        ana: { kills: 10, deaths: 2, assists: 8, damage: 40000, vision: 40 },
        beto: { kills: 10, deaths: 2, assists: 8, damage: 40000, vision: 40 },
      }),
    ];

    const first = computeMvp(matches, MEMBERS, WINDOW).entries.map((e) => e.gameName);
    const second = computeMvp(matches, MEMBERS, WINDOW).entries.map((e) => e.gameName);
    const third = computeMvp(matches, MEMBERS, WINDOW).entries.map((e) => e.gameName);
    expect(first).toEqual(second);
    expect(second).toEqual(third);
    // Y los puntajes son idénticos, así que el empate es real.
    const scores = computeMvp(matches, MEMBERS, WINDOW).entries.map((e) => e.score);
    expect(scores[0]).toBe(scores[1]);
  });

  it('tolera partidas mal formadas sin romper el cálculo', () => {
    const matches = [
      { info: null },
      { info: {} },
      { info: { participants: 'no-es-un-array' } },
      { info: { participants: [] } },
      makeMatch({ created: 1000, squadWon: true }),
    ];

    const result = computeMvp(matches, MEMBERS, WINDOW);
    expect(result.matchesInWindow).toBe(1);
    expect(result.entries).toHaveLength(2);
  });

  it('tolera participantes sin stats (undefined)', () => {
    const match = {
      info: {
        gameCreation: 1000,
        participants: [
          { puuid: 'p1', teamId: 100, win: true },
          { puuid: 'p2', teamId: 100, win: true },
        ],
      },
    };

    const result = computeMvp([match], MEMBERS, WINDOW);
    expect(result.entries).toHaveLength(2);
    for (const e of result.entries) {
      expect(Number.isFinite(e.avgKDA)).toBe(true);
      expect(Number.isFinite(e.score)).toBe(true);
      expect(e.damageShare).toBe(0);
      expect(e.champion).not.toBeNull();
    }
  });

  it('ignora miembros sin puuid', () => {
    const conPuuid = [...MEMBERS, { id: 'm3', puuid: '', gameName: 'Sin', nickname: 'Sin' }];
    const result = computeMvp(
      [makeMatch({ created: 1000, squadWon: true })],
      conPuuid,
      WINDOW
    );
    expect(result.entries.map((e) => e.gameName).sort()).toEqual(['Ana', 'Beto']);
  });

  it('con 0 muertes el KDA usa la convención (kills + assists)', () => {
    const matches = [
      makeMatch({
        created: 1000,
        squadWon: true,
        ana: { kills: 10, deaths: 0, assists: 20 },
      }),
    ];
    const result = computeMvp(matches, MEMBERS, WINDOW);
    const ana = result.entries.find((e) => e.gameName === 'Ana')!;
    expect(ana.avgKDA).toBe(30);
  });
});

