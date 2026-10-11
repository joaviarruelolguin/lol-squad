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

// ---------- Stats / Awards ----------
export interface PlayerAward {
  memberId: string;
  title: string;
  emoji: string;
  value: string;
}

export interface RoleStat {
  memberId: string;
  role: string;
  games: number;
  winrate: number;
}

export interface TiltData {
  memberId: string;
  afterWinWinrate: number | null;
  afterLossWinrate: number | null;
}

export interface PlayerStatsResult {
  status: 'ok' | 'partial' | 'error';
  errors: ErrorInfo[];
  awards: PlayerAward[];
  roleStats: RoleStat[];
  tiltData: TiltData[];
  totalMatches: number;
}

// ---------- Diferenciales por lane (timeline match-v5) ----------
export interface LaneDiffPlayer {
  puuid: string;
  gameName: string;
  nickname?: string;
  isSquad: boolean;
  memberId?: string;
  teamId: number;
  lane: string;
  championName: string;
  win: boolean;
  totalGold: number;
  xp: number;
  cs: number;
}

export interface LaneDiffCheckpoint {
  minute: number;
  goldDiff: number;
  xpDiff: number;
  myGold: number;
  theirGold: number;
  myXp: number;
  theirXp: number;
  squadPlayers: LaneDiffPlayer[];
  laneBreakdown: {
    lane: string;
    goldDiff: number;
    ourPlayer: string;
    theirPlayer: string;
  }[];
}

export interface LaneDiffResult {
  matchId: string;
  date: string;
  duration: number;
  userTeamId: number;
  enemyTeamId: number;
  userTeamWon: boolean;
  checkpoints: LaneDiffCheckpoint[];
}

// ---------- Recomendador de composición ----------
export interface ChampCombo {
  champions: string[];
  size: number; // 2 = duo, 5 = composición completa
  wins: number;
  games: number;
  winrate: number;
}

export interface RoleFill {
  role: string;
  games: number;
  wins: number;
  winrate: number;
}

export interface CompositionResult {
  status: 'ok' | 'partial' | 'error';
  errors: ErrorInfo[];
  champCombos: ChampCombo[];
  roleFills: RoleFill[];
  scannedMatches: number;
}

// ---------- Tendencias por jugador ----------
export interface PlayerTrend {
  memberId: string;
  gameName: string;
  nickname: string;
  profileIconId: number;
  games: number;
  wins: number;
  losses: number;
  winrate: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgDamage: number;
  avgVision: number;
  csPerMinute: number;
  hasEnoughData: boolean;
  worstDeathWindow: string; // ej: "12-17" = minutos
  worstHour: { hour: number; deathsPerGame: number; games: number } | null;
  worstDay: { day: number; name: string; deathsPerGame: number; games: number } | null;
  last10Results: boolean[]; // oldest → newest
  currentStreakType: 'win' | 'loss' | null;
  currentStreakLength: number;
}

export interface TrendResult {
  status: 'ok' | 'error';
  error?: string;
  trends: PlayerTrend[];
  scannedMatches: number;
  minTrendGames?: number;
}

// ---------- Matriz de tríos ----------
export interface TrioStat {
  memberIds: string[];
  memberNames: { id: string; name: string; nickname?: string }[];
  totalGames: number;
  wins: number;
  losses: number;
  winrate: number;
  synergyRating: 'GOD_TIER' | 'REGULAR' | 'FRIA' | 'A_PULIR';
  lastPlayed: number; // timestamp de la última partida juntos
}

export interface TrioResult {
  status: 'ok' | 'partial' | 'error';
  errors: ErrorInfo[];
  trios: TrioStat[];
  scannedMatches: number;
}

// ---------- Resumen semanal automático ----------
export interface WeeklyPlayerStat {
  memberId: string;
  gameName: string;
  nickname: string;
  profileIconId: number;
  games: number;
  wins: number;
  losses: number;
  winrate: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgKDA: number;
  avgDamage: number;
  avgVision: number;
  avgCS: number;
  avgGold: number;
  wardsPlaced: number;
  wardsKilled: number;
}

export interface WeeklySummary {
  id: string;
  week_start: string;
  week_end: string;
  matches_analyzed: number;
  squad_winrate: number;
  highlights: string;      // texto generado por la IA
  improvements: string;    // JSON array de { memberId, tips: string[] }
  created_at: string;
  model?: string;
}

