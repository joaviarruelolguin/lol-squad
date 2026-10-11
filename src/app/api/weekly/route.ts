import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { getSquadMembers } from '@/lib/storage';
import { RiotApiClient, getRegionalRouting } from '@/lib/riot';
import { getMatchesWithCache } from '@/lib/matchCache';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { checkRateLimit, getClientIp, rateLimitResponse, LIMITS } from '@/lib/rateLimit';
import { WeeklySummary, WeeklyPlayerStat } from '@/lib/types';

const MATCHES_PER_PLAYER = 20;
const FLEX_QUEUE = 440;

interface Agg {
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  vision: number;
  cs: number;
  gold: number;
  wardsPlaced: number;
  wardsKilled: number;
}

export async function GET(req: Request) {
  await connection();

  const { searchParams } = new URL(req.url);
  const weeks = Math.min(8, Math.max(1, Number(searchParams.get('weeks') || 4)));

  const allMembers = await getSquadMembers();
  const members = allMembers.filter(
    (m): m is any => Boolean(m.puuid)
  );
  const client = new RiotApiClient();

  if (members.length === 0) {
    return NextResponse.json({
      status: 'error' as const,
      error: 'No hay miembros en la squad.',
      summaries: [],
    });
  }

  // Recolectar matchIds recientes de todos los miembros
  const orderedMatchIds: string[] = [];
  const seen = new Set<string>();

  for (const member of members) {
    try {
      const routing = getRegionalRouting(member.region);
      const ids = await client.getMatchIdsByPuuid(
        member.puuid,
        routing,
        MATCHES_PER_PLAYER,
        FLEX_QUEUE
      );
      for (const id of ids) {
        if (!seen.has(id)) {
          seen.add(id);
          orderedMatchIds.push(id);
        }
      }
    } catch {
      // ignorar
    }
  }

  const defaultRouting = getRegionalRouting(members[0]?.region ?? 'la2');
  const puuidToMember = new Map<string, any>(members.map((m) => [m.puuid, m]));

  // Filtrar por ventana de tiempo
  const now = Date.now();
  const windowMs = weeks * 7 * 24 * 60 * 60 * 1000;
  const cutoff = now - windowMs;

  const aggs = new Map<string, Agg>();
  const getAgg = (id: string): Agg => {
    if (!aggs.has(id)) {
      aggs.set(id, {
        games: 0, wins: 0, kills: 0, deaths: 0, assists: 0,
        damage: 0, vision: 0, cs: 0, gold: 0, wardsPlaced: 0, wardsKilled: 0,
      });
    }
    return aggs.get(id)!;
  };

  let matchesInWindow = 0;

  // Traemos las partidas con la caché persistente: solo va a Riot lo que falta.
  // No necesitamos timeline para el resumen semanal, así que lo saltamos.
  const cachedMatches = await getMatchesWithCache(orderedMatchIds, defaultRouting, false, 3);

  for (const { info } of cachedMatches) {
    if (!info || !Array.isArray(info.participants)) continue;

      const created = info.gameCreation || 0;
      if (created < cutoff) continue; // fuera de la ventana

      const squadPlayers = info.participants.filter((p: any) => puuidToMember.has(p.puuid));
      if (squadPlayers.length === 0) continue;
      matchesInWindow++;

      const teamDamage = new Map<number, number>();
      for (const p of info.participants) {
        teamDamage.set(p.teamId, (teamDamage.get(p.teamId) || 0) + (p.totalDamageDealtToChampions || 0));
      }

      for (const p of squadPlayers) {
        const member = puuidToMember.get(p.puuid)!;
        const a = getAgg(member.id);
        a.games++;
        if (p.win) a.wins++;
        a.kills += p.kills || 0;
        a.deaths += p.deaths || 0;
        a.assists += p.assists || 0;
        a.damage += p.totalDamageDealtToChampions || 0;
        a.vision += p.visionScore || 0;
        a.cs += (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0);
        a.gold += p.goldEarned || 0;
        a.wardsPlaced += p.wardsPlaced || 0;
        a.wardsKilled += p.wardsKilled || 0;
      }
  }

  // Construir stats por jugador
  const playerStats: WeeklyPlayerStat[] = [];
  for (const member of members) {
    const a = aggs.get(member.id);
    if (!a || a.games === 0) continue;
    const g = a.games;
    playerStats.push({
      memberId: member.id,
      gameName: member.gameName,
      nickname: member.nickname,
      profileIconId: member.profileIconId || 29,
      games: g,
      wins: a.wins,
      losses: g - a.wins,
      winrate: Math.round((a.wins / g) * 100),
      avgKills: Math.round((a.kills / g) * 10) / 10,
      avgDeaths: Math.round((a.deaths / g) * 10) / 10,
      avgAssists: Math.round((a.assists / g) * 10) / 10,
      avgKDA: a.deaths === 0 ? a.kills + a.assists : Math.round(((a.kills + a.assists) / a.deaths) * 100) / 100,
      avgDamage: Math.round(a.damage / g),
      avgVision: Math.round(a.vision / g),
      avgCS: Math.round((a.cs / g) * 10) / 10,
      avgGold: Math.round(a.gold / g),
      wardsPlaced: Math.round(a.wardsPlaced / g),
      wardsKilled: Math.round(a.wardsKilled / g),
    });
  }

  // Ordenar por winrate
  playerStats.sort((a, b) => b.winrate - a.winrate);

  // Consultar resúmenes guardados
  let summaries: WeeklySummary[] = [];
  if (isSupabaseConfigured()) {
    try {
      const { data } = await getSupabase()
        .from('weekly_summaries')
        .select('*')
        .order('week_start', { ascending: false })
        .limit(weeks);
      summaries = (data || []) as any;
    } catch {
      summaries = [];
    }
  }

  return NextResponse.json({
    status: 'ok' as const,
    weeks,
    matchesInWindow,
    playerStats,
    summaries,
  });
}

// ---------- POST: generar resumen con IA ----------
export async function POST(req: Request) {
  await connection();

  // Rate limit: generar un resumen con IA es caro
  const limited = rateLimitResponse(
    checkRateLimit(
      `weekly:${getClientIp(req)}`,
      LIMITS.weeklyGenerate.limit,
      LIMITS.weeklyGenerate.windowMs
    )
  );
  if (limited) return limited;

  try {
    const body = await req.json();
    const weeks = Math.min(8, Math.max(1, Number(body?.weeks || 4)));

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'Falta GEMINI_API_KEY. Configurala en .env.local o en las variables de Vercel.',
          errorType: 'API_KEY_MISSING',
        },
        { status: 400 }
      );
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        {
          error:
            'El resumen semanal necesita Supabase para guardarse. Configurá SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.',
          errorType: 'SUPABASE_MISSING',
        },
        { status: 400 }
      );
    }

    // Reusamos la lógica del GET para obtener las stats
    const statsRes = await GET(
      new Request(`http://localhost/api/weekly?weeks=${weeks}`)
    );
    const statsJson: any = await statsRes.json();

    if (!statsJson?.playerStats?.length) {
      return NextResponse.json(
        {
          error: 'No hay partidas suficientes en la ventana de tiempo para generar un resumen.',
          errorType: 'NOT_ENOUGH_DATA',
        },
        { status: 400 }
      );
    }

    const weekStart = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);
    const weekEnd = new Date();

    // Construir el contexto estructurado para la IA (NO la partida cruda)
    const ctxLines = statsJson.playerStats.map(
      (p: WeeklyPlayerStat) =>
        `- ${p.gameName} ("${p.nickname}"): ${p.games} partidas, ${p.wins}V/${p.losses}D (${p.winrate}%) | KDA ${p.avgKDA} (${p.avgKills}/${p.avgDeaths}/${p.avgAssists}) | Daño prom ${(p.avgDamage / 1000).toFixed(1)}k | Visión prom ${p.avgVision} | CS ${p.avgCS} | Oro ${(p.avgGold / 1000).toFixed(1)}k | Wards ${p.wardsPlaced}`
    );

    const squadGames = statsJson.playerStats.reduce((s: number, p: WeeklyPlayerStat) => s + p.games, 0);
    const squadWins = statsJson.playerStats.reduce((s: number, p: WeeklyPlayerStat) => s + p.wins, 0);
    const squadWinrate = squadGames > 0 ? Math.round((squadWins / squadGames) * 100) : 0;

    const context = `PERÍODO: últimos ${weeks} semana(s) (${weekStart.toLocaleDateString('es-AR')} - ${weekEnd.toLocaleDateString('es-AR')})
PARTIDAS ANALIZADAS: ${statsJson.matchesInWindow} (cuenta individual por jugador: ${squadGames})
WINRATE DE LA SQUAD: ${squadWinrate}%

ESTADÍSTICAS POR JUGADOR:
${ctxLines.join('\n')}`;

    const systemPrompt = `Sos un coach de League of Legends que analiza el rendimiento semanal de un grupo de amigos (squad) en partidas Flex.

Recibís estadísticas YA AGREGADAS de la semana (no la partida cruda). Tu trabajo:
1. Escribir un resumen destacado de la semana (highlights): cómo les fue, momentos calendario, récords.
2. Dar 3 cosas concretas a mejorar por jugador, basadas en SUS números.

FORMATO DE SALIDA (respondé SOLO con este JSON, sin texto extra):
{
  "highlights": "texto de 3-5 frases con los_logros_y_trendencias_de_la_semana",
  "improvements": [
    { "gameName": "NombreExacto", "tips": ["tip1", "tip2", "tip3"] }
  ]
}

REGLAS:
- Usá los nombres EXACTOS del jugador como aparecen en el contexto.
- Solo un objeto en "improvements" por jugador, con 3 tips cada uno.
- Tips ACCIONABLES y espec��ficos, basados en los números reales (ej: "tu vision promedio de 18 está bajo el promedio de la squad de 25, poné 1 ward más por oleada").
- Tono de coach amigable: motivador, nunca culpabilizador. Usá "pueden mejorar" no "les falta".
- Si un jugador está muy bien,felicitá con un tip menor.
- Respondé en español rioplatense, casual.
- El JSON debe ser válido (comillas dobles, sin trailing commas).`;

    // Llamar a Gemini con fallback
    const models = [
      process.env.GEMINI_MODEL,
      'gemini-3.8-flash',
      'gemini-2.5-flash',
    ].filter(Boolean) as string[];

    let aiData: any = null;
    let usedModel = '';
    let lastErr = '';

    for (const model of [...new Set(models)]) {
      try {
        const aiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [
                {
                  role: 'user',
                  parts: [{ text: `Acá van las estadísticas de la semana:\n\n${context}\n\nGenerá el resumen semanal en el formato JSON pedido.` }],
                },
              ],
            }),
          }
        );

        if (aiRes.ok) {
          aiData = await aiRes.json();
          usedModel = model;
          break;
        }
        lastErr = await aiRes.text();
        if (aiRes.status !== 503 && aiRes.status !== 429) break;
      } catch (e: any) {
        lastErr = e?.message || 'Error de red';
      }
    }

    if (!aiData) {
      return NextResponse.json(
        {
          error: `Gemini está saturado ahora. Probá en un rato. (${lastErr.slice(0, 120)})`,
          errorType: 'AI_OVERLOADED',
        },
        { status: 503 }
      );
    }

    const rawText =
      aiData?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p.text)
        .join('') || '';

    // Parsear el JSON (los modelos a veces envuelven en ```json)
    let parsed: any = null;
    try {
      const clean = rawText
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      parsed = JSON.parse(clean);
    } catch {
      parsed = null;
    }

    if (!parsed?.highlights || !Array.isArray(parsed?.improvements)) {
      return NextResponse.json(
        {
          error: 'La IA devolvió una respuesta que no pudimos interpretar.',
          errorType: 'AI_PARSE_ERROR',
          raw: rawText.slice(0, 300),
        },
        { status: 502 }
      );
    }

    // Guardar en Supabase
    const id = `week_${weekStart.toISOString().slice(0, 10)}_${Date.now()}`;
    const supabase = getSupabase();
    const { error: dbError } = await supabase.from('weekly_summaries').insert({
      id,
      week_start: weekStart.toISOString(),
      week_end: weekEnd.toISOString(),
      matches_analyzed: statsJson.matchesInWindow,
      squad_winrate: squadWinrate,
      highlights: parsed.highlights,
      improvements: JSON.stringify(parsed.improvements),
      model: usedModel,
    });

    if (dbError) {
      return NextResponse.json(
        { error: `No se pudo guardar el resumen: ${dbError.message}`, errorType: 'DB_ERROR' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      summary: {
        id,
        week_start: weekStart.toISOString(),
        week_end: weekEnd.toISOString(),
        matches_analyzed: statsJson.matchesInWindow,
        squad_winrate: squadWinrate,
        highlights: parsed.highlights,
        improvements: JSON.stringify(parsed.improvements),
        model: usedModel,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Error inesperado' }, { status: 500 });
  }
}