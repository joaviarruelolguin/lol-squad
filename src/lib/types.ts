import type { ErrorInfo } from './errors';

export type RiotRegion = 'la1' | 'la2' | 'na1' | 'br1' | 'euw1';
export type RegionalRouting = 'americas' | 'europe' | 'asia' | 'sea';

export interface SquadMember {
  id: string; // internal id
  gameName: string;
  tagLine: string;
  nickname: string; // Apodo del grupo (ej: "El manco de mid")
  role?: 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT' | 'FILL';
  puuid?: string;
  summonerId?: string;
  profileIconId?: number;
  summonerLevel?: number;
  region: RiotRegion;
  addedAt: string;
}

export interface RankedStats {
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  winrate: number;
  hotStreak?: boolean;
}

export interface ChampionMastery {
  championId: number;
  championName?: string;
  championLevel: number;
  championPoints: number;
}

export interface MemberStats {
  member: SquadMember;
  soloQueue?: RankedStats;
  flexQueue?: RankedStats;
  topChampions: ChampionMastery[];
  recentMatches?: {
    total: number;
    wins: number;
    losses: number;
    winrate: number;
    streak: { count: number; isWin: boolean };
  };
  lastUpdated: string;
}

// Resultado honesto por miembro: ok | partial | error
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

export interface DuoResult {
  status: 'ok' | 'partial' | 'error';
  errors: ErrorInfo[];
  duos: DuoStat[];
  scannedMatches: number;
  membersAnalyzed: number;
}

// ---------- Liga de Customs ----------
export interface CustomMatch {
  id: string;
  date: string;
  teamAName: string;
  teamBName: string;
  teamA: string[];
  teamB: string[];
  scoreA?: number;
  scoreB?: number;
  winner?: 'A' | 'B';
  mvpMemberId?: string;
  notes?: string;
}

export interface TableRow {
  memberId: string;
  played: number;
  won: number;
  lost: number;
  mvps: number;
  points: number;
}

// ---------- Análisis de partidas Flex ----------
export interface FlexPlayer {
  puuid: string;
  riotIdGameName: string;
  riotIdTagline: string;
  squadMemberId?: string;
  squadNickname?: string;
  championId: number;
  championName: string;
  teamId: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  totalDamageDealtToChampions: number;
  physicalDamage: number;
  magicDamage: number;
  trueDamage: number;
  totalDamageTaken: number;
  goldEarned: number;
  cs: number;
  visionScore: number;
  wardsPlaced: number;
  wardsKilled: number;
  damageDealtToObjectives: number;
  role: string;
  lane: string;
}

export interface FlexTeam {
  teamId: number;
  win: boolean;
  players: FlexPlayer[];
  totalDamage: number;
}

export type WeakPointType =
  | 'FED'
  | 'LOW_DAMAGE'
  | 'ZERO_IMPACT'
  | 'LOW_VISION'
  | 'DAMAGE_GAP';

export interface WeakPoint {
  type: WeakPointType;
  title: string;
  detail: string;
  playerName?: string;
}

export interface FlexMatch {
  matchId: string;
  date: string;
  duration: number; // segundos
  queueId: number;
  gameVersion: string;
  squadMemberCount: number;
  squadMembers: { id: string; gameName: string; nickname: string; win: boolean }[];
  teams: FlexTeam[];
  weakPoints: WeakPoint[];
}

export interface FlexResult {
  status: 'ok' | 'partial' | 'error';
  errors: ErrorInfo[];
  matches: FlexMatch[];
  matchesAnalyzed: number;
  pagination: {
    offset: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

export interface DuoStat {
  player1Id: string;
  player2Id: string;
  player1Name: string;
  player2Name: string;
  totalGames: number;
  wins: number;
  losses: number;
  winrate: number;
  synergyRating: 'GOD_TIER' | 'REGULAR' | 'FRIA' | 'A_PULIR';
}

// ---------- Métricas agregadas por jugador (Flex) ----------
export interface PlayerMetrics {
  memberId: string;
  gameName: string;
  nickname: string;
  profileIconId: number;
  totalGames: number;
  wins: number;
  losses: number;
  winrate: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgKDA: number;
  avgDamage: number;
  avgVisionScore: number;
  avgCS: number;
  avgGold: number;
  mostPlayedChampion: {
    name: string;
    games: number;
    winrate: number;
  } | null;
  championPool: {
    name: string;
    games: number;
    winrate: number;
  }[];
  damageShare: number; // % del daño del equipo
  visionPerMinute: number;
}

export interface PlayerMetricsResult {
  status: 'ok' | 'partial' | 'error';
  errors: ErrorInfo[];
  metrics: PlayerMetrics[];
  totalMatchesAnalyzed: number;
}

