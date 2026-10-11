import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { getSquadMembers, saveSquadMember } from '@/lib/storage';
import { RiotApiClient, getRegionalRouting } from '@/lib/riot';
import { RiotApiError, ErrorInfo, fromNetworkError } from '@/lib/errors';
import { RankedStats, ChampionMastery, SquadMember } from '@/lib/types';
import { getChampionInfo } from '@/lib/ddragon';
import { guardRead } from '@/lib/rateLimit';

export interface MemberResult {
  member: SquadMember;
  status: 'ok' | 'partial' | 'error';
  errors: {
    account?: ErrorInfo;
    rank?: ErrorInfo;
    mastery?: ErrorInfo;
  };
  soloQueue?: RankedStats;
  flexQueue?: RankedStats;
  topChampions: ChampionMastery[];
  lastUpdated: string;
}

function toErrorInfo(err: unknown): ErrorInfo {
  if (err instanceof RiotApiError) return err.toInfo();
  if (err && typeof err === 'object' && 'type' in err && 'message' in err) {
    return err as ErrorInfo;
  }
  return fromNetworkError(err);
}

export async function GET(req: Request) {
  await connection();

  const limited = guardRead(req, 'stats');
  if (limited) return limited;
  const members = await getSquadMembers();
  const client = new RiotApiClient();

  const results: MemberResult[] = [];

  for (let member of members) {
    const errors: MemberResult['errors'] = {};
    let soloQueue: RankedStats | undefined;
    let flexQueue: RankedStats | undefined;
    let topChampions: ChampionMastery[] = [];

    // --- Paso 1: asegurar PUUID (auto-cura si falta) ---
    if (!member.puuid) {
      try {
        const routing = getRegionalRouting(member.region);
        const account = await client.getAccountByRiotId(member.gameName, member.tagLine, routing);
        if (account?.puuid) {
          member.puuid = account.puuid;
          member.id = account.puuid;
          const summoner = await client.getSummonerByPuuid(account.puuid, member.region);
          member.profileIconId = summoner.profileIconId;
          member.summonerLevel = summoner.summonerLevel;
          await saveSquadMember(member);
        }
      } catch (err) {
        errors.account = toErrorInfo(err);
      }
    }

    // --- Paso 2: rangos (solo si tenemos PUUID) ---
    if (member.puuid) {
      try {
        const entries = await client.getLeagueEntriesByPuuid(member.puuid, member.region);

        const solo = entries.find((e) => e.queueType === 'RANKED_SOLO_5x5');
        if (solo) {
          const total = solo.wins + solo.losses;
          soloQueue = {
            tier: solo.tier,
            rank: solo.rank,
            leaguePoints: solo.leaguePoints,
            wins: solo.wins,
            losses: solo.losses,
            winrate: total > 0 ? Math.round((solo.wins / total) * 100) : 0,
            hotStreak: solo.hotStreak,
          };
        }

        const flex = entries.find((e) => e.queueType === 'RANKED_FLEX_SR');
        if (flex) {
          const total = flex.wins + flex.losses;
          flexQueue = {
            tier: flex.tier,
            rank: flex.rank,
            leaguePoints: flex.leaguePoints,
            wins: flex.wins,
            losses: flex.losses,
            winrate: total > 0 ? Math.round((flex.wins / total) * 100) : 0,
            hotStreak: flex.hotStreak,
          };
        }
      } catch (err) {
        errors.rank = toErrorInfo(err);
      }

      // --- Paso 3: maestrías de campeones ---
      try {
        const masteries = await client.getTopMasteries(member.puuid, member.region, 3);
        topChampions = await Promise.all(
          masteries.map(async (m) => {
            const info = await getChampionInfo(m.championId);
            return {
              championId: m.championId,
              championName: info.name,
              championLevel: m.championLevel,
              championPoints: m.championPoints,
            };
          })
        );
      } catch (err) {
        errors.mastery = toErrorInfo(err);
        topChampions = [];
      }
    }

    // --- Estado general ---
    const hasAnyData = Boolean(soloQueue || flexQueue || topChampions.length > 0);
    let status: MemberResult['status'];
    if (!member.puuid) {
      // No pudimos ni resolver la identidad
      status = 'error';
    } else if (Object.keys(errors).length > 0) {
      status = hasAnyData ? 'partial' : 'error';
    } else {
      status = 'ok';
    }

    results.push({
      member,
      status,
      errors,
      soloQueue,
      flexQueue,
      topChampions,
      lastUpdated: new Date().toISOString(),
    });
  }

  // Ordenar: los que tienen rango real primero, los con error al final
  const tierOrder: Record<string, number> = {
    CHALLENGER: 9,
    GRANDMASTER: 8,
    MASTER: 7,
    DIAMOND: 6,
    EMERALD: 5,
    PLATINUM: 4,
    GOLD: 3,
    SILVER: 2,
    BRONZE: 1,
    IRON: 0,
  };

  // Ranking orientado a FLEX: priorizamos flexQueue, fallback a soloQueue
  const rankOrder: Record<string, number> = { I: 0, II: 1, III: 2, IV: 3 };
  results.sort((a, b) => {
    const aQueue = a.flexQueue || a.soloQueue;
    const bQueue = b.flexQueue || b.soloQueue;
    const tierA = tierOrder[(aQueue?.tier || 'UNRANKED').toUpperCase()] ?? -1;
    const tierB = tierOrder[(bQueue?.tier || 'UNRANKED').toUpperCase()] ?? -1;
    if (tierA !== tierB) return tierB - tierA;
    // Mismo tier: I > II > III > IV
    const rA = rankOrder[aQueue?.rank || 'IV'] ?? 3;
    const rB = rankOrder[bQueue?.rank || 'IV'] ?? 3;
    if (rA !== rB) return rA - rB;
    // Mismo rango: más LP primero
    const lpA = aQueue?.leaguePoints || 0;
    const lpB = bQueue?.leaguePoints || 0;
    return lpB - lpA;
  });

  return NextResponse.json(results);
}
