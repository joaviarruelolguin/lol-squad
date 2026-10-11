import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { RiotApiClient } from '@/lib/riot';
import { RiotApiError, ErrorInfo } from '@/lib/errors';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { getSquadMembers } from '@/lib/storage';
import { checkRateLimit, getClientIp, rateLimitResponse, LIMITS } from '@/lib/rateLimit';
import { routingFromMatchId } from '@/app/api/flex-matches/route';

export async function POST(req: Request) {
  await connection();

  // Rate limit: proteger el presupuesto de Gemini
  const limited = rateLimitResponse(
    checkRateLimit(`ai-chat:${getClientIp(req)}`, LIMITS.aiChat.limit, LIMITS.aiChat.windowMs)
  );
  if (limited) return limited;

  try {
    const body = await req.json();
    const { matchId, message, history = [], chatId, model: requestedModel } = body;

    if (!matchId || !message) {
      return NextResponse.json(
        { error: 'Faltan matchId o mensaje' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'No está configurada la API de IA. Generá una API Key gratuita en Google AI Studio (aistudio.google.com) y agregá GEMINI_API_KEY en el archivo .env.local.',
          errorType: 'API_KEY_MISSING',
        },
        { status: 400 }
      );
    }

    // Modelos en orden de preferencia: si uno falla por saturación (503/429),
// caemos automáticamente al siguiente.
// Si el usuario eligió uno explícitamente, ese va primero (con fallback igual).
const MODEL_FALLBACKS = [
  requestedModel,
  process.env.GEMINI_MODEL,
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
].filter(Boolean) as string[];

// Evitamos repetir el mismo modelo en la lista
const UNIQUE_MODELS = [...new Set(MODEL_FALLBACKS)];

    // 1. Traer el detalle de la partida (cacheado 24h)
    const client = new RiotApiClient();
    const routing = routingFromMatchId(matchId);
    let detail: any;
    try {
      detail = await client.getMatchDetail(matchId, routing);
    } catch (err) {
      const info = err instanceof RiotApiError ? err.toInfo() : {
        type: 'UNKNOWN' as const,
        message: 'No se pudo cargar la partida.',
      };
      return NextResponse.json({ error: info.message, errorType: info.type }, { status: 400 });
    }

    const info = detail?.info;
    if (!info || !Array.isArray(info.participants)) {
      return NextResponse.json({ error: 'Partida sin datos válidos.' }, { status: 400 });
    }

    // 2. Obtener miembros de la squad para identificar aliados
    const squadMembers = await getSquadMembers();
    const squadPuuids = new Set(
      squadMembers.filter((m) => m.puuid).map((m) => m.puuid as string)
    );
    const puuidToName = new Map(
      squadMembers
        .filter((m) => m.puuid)
        .map((m) => [m.puuid as string, m.gameName])
    );

    // 3. Construir el contexto compacto de la partida
    const context = buildMatchContext(info, squadPuuids, puuidToName);

    // 3. Armar el historial de conversación para Gemini
    const contents = [
      {
        role: 'user',
        parts: [
          {
            text: `Contexto de la partida Flex:\n\n${context}\n\nEl usuario quiere que analices esta partida. Respondé siempre en español, con tono constructivo y de ayuda (sin insultar a nadie).`,
          },
        ],
      },
      ...history
        .filter((h: any) => h && h.role && h.content)
        .slice(-8) // limitar historial para no saturar
        .map((h: any) => ({
          role: h.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: String(h.content) }],
        })),
      { role: 'user', parts: [{ text: String(message) }] },
    ];

    const systemPrompt = `Sos un coach de League of Legends especializado en partidas Flex (Ranked Flex 5v5) de un grupo de amigos.
Tu tarea: analizar la partida con datos reales (KDA, daño, visión, campeones), dar resúmenes claros, detectar puntos a mejorar y dar tips concretos y accionables.

REGLA CRÍTICA - ALIADOS vs RIVALES:
- En el contexto, los jugadores marcados como [ALIADO] son LOS AMIGOS del usuario (su squad). Los marca con [RIVAL] son los enemigos.
- Analizá principalmente el desempeño de los [ALIADOS]: son a quienes hay que ayudar a mejorar.
- NUNCA critiques a un [RIVAL] ni te enfoques en ellos. El foco es el equipo del usuario.
- Cuando el usuario pregunte por "bigJoa0" o cualquier aliado, respondé con datos de ese jugador.
- Si un aliado tuvo un mal juego, sé constructivo: "puede mejorar X", no "jugó horrible".

Reglas:
- Tono constructivo y amigable: nunca defenestres ni insultes a nadie. Usá frases como "pueden mejorar X" en lugar de "jugó horrible".
- Apoyate SÓLO en los datos del contexto. No inventes estadísticas.
- Sé conciso: resumí en 3-6 viñetas cuando corresponda, y dá 1-2 tips prácticos.
- Respondé siempre en español (rioplatense, casual).`;

    const requestBody = JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
    });

    // Intentamos cada modelo hasta que uno responda.
    // 503 / 429 = saturación temporal -> probamos el siguiente.
    let aiData: any = null;
    let lastError = '';
    let usedModel = UNIQUE_MODELS[0];

    for (const modelName of UNIQUE_MODELS) {
      try {
        const aiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: requestBody,
          }
        );

        if (aiRes.ok) {
          aiData = await aiRes.json();
          usedModel = modelName;
          break;
        }

        const text = await aiRes.text();
        let msg = 'Error al consultar la IA.';
        try {
          const parsed = JSON.parse(text);
          msg = parsed?.error?.message || msg;
        } catch {
          /* ignore */
        }
        lastError = msg;

        // 404 = modelo deprecado/no disponible → probamos el siguiente.
        // 429/503 = saturación temporal → probamos el siguiente.
        // Solo cortamos ante errores reales del cliente (400/401/403).
        const retryable =
          aiRes.status === 503 ||
          aiRes.status === 429 ||
          aiRes.status === 404;

        if (!retryable) {
          return NextResponse.json(
            { error: msg, errorType: 'AI_ERROR' },
            { status: 502 }
          );
        }
      } catch (err: any) {
        lastError = err?.message || 'Error de red al contactar a Gemini.';
      }
    }

    if (!aiData) {
      return NextResponse.json(
        {
          error: `Todos los modelos están saturados ahora mismo. Probá en un rato. (${lastError})`,
          errorType: 'AI_OVERLOADED',
        },
        { status: 503 }
      );
    }

    const reply =
      aiData?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p.text)
        .join('') || 'La IA no devolvió una respuesta.';

    // Guardar en Supabase (historial de chats, FIFO 10)
    let newChatId = chatId;
    if (isSupabaseConfigured()) {
      try {
        const supabase = getSupabase();
        const allMessages = [
          ...history.filter((h: any) => h && h.role && h.content),
          { role: 'user', content: String(message) },
          { role: 'assistant', content: reply },
        ];

        if (newChatId) {
          // Actualizar chat existente
          await supabase
            .from('ai_chats')
            .update({ messages: allMessages, match_id: matchId })
            .eq('id', newChatId);
        } else {
          // Crear nuevo chat
          newChatId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          await supabase.from('ai_chats').insert({
            id: newChatId,
            user_id: 'squad',
            title: String(message).slice(0, 60),
            messages: allMessages,
            match_id: matchId,
          });
        }
      } catch (err) {
        console.warn('No se pudo guardar el chat en Supabase:', err);
      }
    }

    return NextResponse.json({ reply, chatId: newChatId, model: usedModel });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function buildMatchContext(
  info: any,
  squadPuuids?: Set<string>,
  puuidToName?: Map<string, string>
): string {
  const date = new Date(info.gameCreation).toLocaleString('es-AR');
  const durationMin = Math.floor((info.gameDuration || 0) / 60);

  const teams = [100, 200].map((teamId) => {
    const players = (info.participants || []).filter(
      (p: any) => p.teamId === teamId
    );
    const win = players[0]?.win ?? false;
    const totalDamage = players.reduce(
      (s: number, p: any) => s + (p.totalDamageDealtToChampions || 0),
      0
    );
    return { teamId, win, players, totalDamage };
  });

  // Determinar qué equipo tiene más aliados (el equipo del usuario)
  const teamAllyCount = teams.map((t) =>
    t.players.filter((p: any) => squadPuuids?.has(p.puuid)).length
  );
  const userTeam = teamAllyCount[0] >= teamAllyCount[1] ? 0 : 1;

  const lines: string[] = [];
  lines.push(`Fecha: ${date}`);
  lines.push(`Duración: ${durationMin} minutos`);
  lines.push(`Versión: ${info.gameVersion || 'desconocida'}`);
  lines.push('');

  for (let ti = 0; ti < teams.length; ti++) {
    const team = teams[ti];
    const isUserTeam = ti === userTeam;
    const teamLabel = isUserTeam ? 'NUESTRO EQUIPO' : 'EQUIPO RIVAL';
    lines.push(
      `${teamLabel} (Equipo ${team.teamId === 100 ? 'A' : 'B'}) - ${team.win ? 'VICTORIA' : 'DERROTA'} - Daño total: ${(team.totalDamage / 1000).toFixed(1)}k`
    );
    for (const p of team.players) {
      const isAlly = squadPuuids?.has(p.puuid);
      const tag = isAlly ? '[ALIADO]' : '[RIVAL]';
      const allyName = isAlly && puuidToName?.get(p.puuid)
        ? ` (${puuidToName.get(p.puuid)})`
        : '';
      const cs = (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0);
      lines.push(
        `  - ${tag} ${p.riotIdGameName}${allyName}: ${p.championName} (${p.lane}) | K/D/A ${p.kills}/${p.deaths}/${p.assists} | Daño ${(p.totalDamageDealtToChampions / 1000).toFixed(1)}k | Visión ${p.visionScore} | CS ${cs} | Oro ${(p.goldEarned / 1000).toFixed(1)}k`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}
