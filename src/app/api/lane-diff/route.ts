import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { getSquadMembers } from '@/lib/storage';
import { RiotApiClient, getRegionalRouting } from '@/lib/riot';
import { SquadMember, LaneDiffResult, LaneDiffPlayer } from '@/lib/types';

// Minutos en los que sacamos el diferencial
const CHECKPOINTS = [10, 15];

export async function GET(req: Request) {
  await connection();

  const { searchParams } = new URL(req.url);
  const matchId = searchParams.get('matchId');

  if (!matchId) {
    return NextResponse.json(
      { error: 'Falta el matchId' },
      { status: 400 }
    );
  }

  const allMembers = await getSquadMembers();
  const members = allMembers.filter(
    (m): m is SquadMember & { puuid: string } => Boolean(m.puuid)
  );
  const client = new RiotApiClient();

  const defaultRouting = getRegionalRouting(members[0]?.region ?? 'la2');
  const puuidToMember = new Map<string, SquadMember>(
    members.map((m) => [m.puuid, m])
  );

  // Traer detalle (para saber el equipo y la duración)
  let info: any;
  try {
    const detail = await client.getMatchDetail(matchId, defaultRouting);
    info = detail?.info;
  } catch (err) {
    return NextResponse.json(
      { error: 'No se pudo cargar la partida.' },
      { status: 400 }
    );
  }
  if (!info || !Array.isArray(info.participants)) {
    return NextResponse.json(
      { error: 'Partida sin datos válidos.' },
      { status: 400 }
    );
  }

  // Traer timeline
  let timeline: any;
  try {
    timeline = await client.getMatchTimeline(matchId, defaultRouting);
  } catch (err) {
    return NextResponse.json(
      { error: 'No se pudo cargar el timeline de la partida.' },
      { status: 400 }
    );
  }

  const frames = timeline?.info?.frames || [];
  if (frames.length === 0) {
    return NextResponse.json(
      { error: 'La partida no tiene timeline disponible.' },
      { status: 400 }
    );
  }

  // Índice de cada participante en participants[]
  const puuidToIdx = new Map<string, number>();
  info.participants.forEach((p: any, i: number) => puuidToIdx.set(p.puuid, i));

  // Determinar el equipo del usuario (el que tiene más aliados)
  const allyCountByTeam = new Map<number, number>();
  for (const p of info.participants) {
    if (!puuidToMember.has(p.puuid)) continue;
    allyCountByTeam.set(p.teamId, (allyCountByTeam.get(p.teamId) || 0) + 1);
  }
  const userTeamId = [...allyCountByTeam.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 100;
  const enemyTeamId = userTeamId === 100 ? 200 : 100;

  const snapshots = CHECKPOINTS.map((minute) => {
    // Riot genera un frame por minuto; el frame 0 es el inicio de la partida
    const frameIndex = Math.min(minute, frames.length - 1);
    const frame = frames[frameIndex];
    const timestamp = frame?.timestamp;
    // participantFrames es un objeto indexado por participantId (1..10),
    // NO un array. participantId = índice en participants[] + 1
    const pFrames = frame?.participantFrames || {};

    const players: LaneDiffPlayer[] = info.participants.map((p: any, idx: number) => {
      const pf = pFrames[String(idx + 1)];
      const member = puuidToMember.get(p.puuid);
      return {
        puuid: p.puuid,
        gameName: p.riotIdGameName || 'Desconocido',
        nickname: member?.nickname,
        isSquad: Boolean(member),
        memberId: member?.id,
        teamId: p.teamId,
        lane: p.lane || 'UNKNOWN',
        championName: p.championName || '?',
        win: p.win,
        totalGold: pf?.totalGold ?? 0,
        xp: pf?.xp ?? 0,
        cs: (pf?.minionsKilled ?? 0) + (pf?.jungleMinionsKilled ?? 0),
      };
    });

    return {
      minute,
      timestamp,
      players,
    };
  });

  // Armar el resultado
  const result: LaneDiffResult = {
    matchId,
    date: new Date(info.gameCreation).toLocaleString('es-AR'),
    duration: info.gameDuration,
    userTeamId,
    enemyTeamId,
    userTeamWon: info.participants.find((p: any) => p.teamId === userTeamId)?.win ?? false,
    checkpoints: snapshots.map((snap) => {
      const mine = snap.players.filter((p) => p.teamId === userTeamId);
      const theirs = snap.players.filter((p) => p.teamId === enemyTeamId);

      const myGold = mine.reduce((s, p) => s + p.totalGold, 0);
      const theirGold = theirs.reduce((s, p) => s + p.totalGold, 0);
      const myXp = mine.reduce((s, p) => s + p.xp, 0);
      const theirXp = theirs.reduce((s, p) => s + p.xp, 0);

      return {
        minute: snap.minute,
        goldDiff: myGold - theirGold,
        xpDiff: myXp - theirXp,
        myGold,
        theirGold,
        myXp,
        theirXp,
        squadPlayers: mine.filter((p) => p.isSquad),
        // Diferencial por lane (promedio de los members de la squad en cada lane)
        laneBreakdown: buildLaneBreakdown(mine, theirs),
      };
    }),
  };

  return NextResponse.json(result);
}

/** Diferencial de oro por lane entre nuestro equipo y el rival */
function buildLaneBreakdown(mine: LaneDiffPlayer[], theirs: LaneDiffPlayer[]) {
  const lanes = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM'];
  const out: { lane: string; goldDiff: number; ourPlayer: string; theirPlayer: string }[] = [];

  for (const lane of lanes) {
    const myLane = mine.filter((p) => p.lane === lane);
    const theirLane = theirs.filter((p) => p.lane === lane);
    if (myLane.length === 0 || theirLane.length === 0) continue;

    // Promedio si hay 2 (ADC + support en BOTTOM)
    const myAvg = myLane.reduce((s, p) => s + p.totalGold, 0) / myLane.length;
    const theirAvg = theirLane.reduce((s, p) => s + p.totalGold, 0) / theirLane.length;

    out.push({
      lane,
      goldDiff: Math.round(myAvg - theirAvg),
      ourPlayer: myLane
        .map((p) => (p.isSquad ? `${p.gameName} (${p.championName})` : `${p.championName} (rival)`))
        .join(' + '),
      theirPlayer: theirLane.map((p) => p.championName).join(' + '),
    });
  }
  return out;
}