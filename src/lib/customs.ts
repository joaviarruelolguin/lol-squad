import fs from 'fs';
import path from 'path';
import { CustomMatch, TableRow } from './types';
import { getSupabase, isSupabaseConfigured } from './supabase';

const DATA_DIR = path.join(process.cwd(), 'data');
const CUSTOMS_FILE = path.join(DATA_DIR, 'customs.json');

// ---------- Mapeo ----------
function rowToMatch(row: any): CustomMatch {
  return {
    id: row.id,
    date: row.date,
    teamAName: row.team_a_name,
    teamBName: row.team_b_name,
    teamA: row.team_a || [],
    teamB: row.team_b || [],
    scoreA: row.score_a ?? undefined,
    scoreB: row.score_b ?? undefined,
    winner: row.winner ?? undefined,
    mvpMemberId: row.mvp_member_id ?? undefined,
    notes: row.notes ?? undefined,
  };
}

function matchToRow(m: CustomMatch) {
  return {
    id: m.id,
    date: m.date,
    team_a_name: m.teamAName,
    team_b_name: m.teamBName,
    team_a: m.teamA,
    team_b: m.teamB,
    score_a: m.scoreA ?? null,
    score_b: m.scoreB ?? null,
    winner: m.winner ?? null,
    mvp_member_id: m.mvpMemberId ?? null,
    notes: m.notes ?? null,
  };
}

// ---------- Fallback en archivos ----------
function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function fileGetMatches(): CustomMatch[] {
  ensureDir();
  if (!fs.existsSync(CUSTOMS_FILE)) {
    fs.writeFileSync(CUSTOMS_FILE, JSON.stringify([], null, 2));
    return [];
  }
  try {
    const raw = fs.readFileSync(CUSTOMS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function fileSaveMatch(match: CustomMatch): CustomMatch[] {
  const current = fileGetMatches();
  const index = current.findIndex((m) => m.id === match.id);
  if (index >= 0) current[index] = match;
  else current.push(match);
  ensureDir();
  fs.writeFileSync(CUSTOMS_FILE, JSON.stringify(current, null, 2));
  return current;
}

function fileDeleteMatch(id: string): CustomMatch[] {
  const current = fileGetMatches().filter((m) => m.id !== id);
  ensureDir();
  fs.writeFileSync(CUSTOMS_FILE, JSON.stringify(current, null, 2));
  return current;
}

// ---------- API pública (híbrida) ----------
export async function getMatches(): Promise<CustomMatch[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabase()
      .from('custom_matches')
      .select('*')
      .order('date', { ascending: true });
    if (error) {
      console.warn('Supabase getMatches error:', error.message);
      return fileGetMatches();
    }
    return (data || []).map(rowToMatch);
  }
  return fileGetMatches();
}

export async function saveMatch(match: CustomMatch): Promise<CustomMatch[]> {
  if (isSupabaseConfigured()) {
    const row = matchToRow(match);
    const { error } = await getSupabase().from('custom_matches').upsert(row, {
      onConflict: 'id',
    });
    if (error) {
      console.warn('Supabase saveMatch error:', error.message);
      return fileSaveMatch(match);
    }
    return getMatches();
  }
  return fileSaveMatch(match);
}

export async function deleteMatch(id: string): Promise<CustomMatch[]> {
  if (isSupabaseConfigured()) {
    const { error } = await getSupabase().from('custom_matches').delete().eq('id', id);
    if (error) {
      console.warn('Supabase deleteMatch error:', error.message);
      return fileDeleteMatch(id);
    }
    return getMatches();
  }
  return fileDeleteMatch(id);
}

// Tabla de posiciones: victoria = 3 pts, MVP = +1 bonus
export function computeTable(matches: CustomMatch[]): Record<string, TableRow> {
  const table: Record<string, TableRow> = {};

  const ensure = (id: string): TableRow => {
    if (!table[id]) {
      table[id] = { memberId: id, played: 0, won: 0, lost: 0, mvps: 0, points: 0 };
    }
    return table[id];
  };

  for (const m of matches) {
    if (!m.winner) continue;
    const winners = m.winner === 'A' ? m.teamA : m.teamB;
    const losers = m.winner === 'A' ? m.teamB : m.teamA;

    for (const pid of winners) {
      const row = ensure(pid);
      row.played++;
      row.won++;
      row.points += 3;
    }
    for (const pid of losers) {
      const row = ensure(pid);
      row.played++;
      row.lost++;
    }
    if (m.mvpMemberId) {
      const row = ensure(m.mvpMemberId);
      row.mvps++;
      row.points += 1;
    }
  }

  return table;
}
