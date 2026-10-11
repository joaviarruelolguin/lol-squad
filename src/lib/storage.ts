import fs from 'fs';
import path from 'path';
import { SquadMember } from './types';
import { getSupabase, isSupabaseConfigured } from './supabase';

const DATA_DIR = path.join(process.cwd(), 'data');
const SQUAD_FILE = path.join(DATA_DIR, 'squad.json');

// ---------- Mapeo Supabase <-> interfaz ----------
function rowToMember(row: any): SquadMember {
  return {
    id: row.id,
    gameName: row.game_name,
    tagLine: row.tag_line,
    nickname: row.nickname ?? row.game_name,
    role: row.role || 'FILL',
    puuid: row.puuid,
    profileIconId: row.profile_icon_id ?? 29,
    summonerLevel: row.summoner_level ?? 100,
    region: row.region || 'la2',
    addedAt: row.added_at,
  };
}

function memberToRow(m: SquadMember) {
  return {
    id: m.id,
    game_name: m.gameName,
    tag_line: m.tagLine,
    nickname: m.nickname,
    role: m.role || 'FILL',
    puuid: m.puuid,
    profile_icon_id: m.profileIconId ?? 29,
    summoner_level: m.summonerLevel ?? 100,
    region: m.region || 'la2',
    added_at: m.addedAt,
  };
}

// ---------- Fallback en archivos (desarrollo local sin Supabase) ----------
function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function fileGetSquadMembers(): SquadMember[] {
  ensureDir();
  if (!fs.existsSync(SQUAD_FILE)) {
    fs.writeFileSync(SQUAD_FILE, JSON.stringify([], null, 2));
    return [];
  }
  try {
    const raw = fs.readFileSync(SQUAD_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function fileSaveSquadMember(member: SquadMember): SquadMember[] {
  const current = fileGetSquadMembers();
  const index = current.findIndex(
    (m) =>
      m.id === member.id ||
      (m.gameName.toLowerCase() === member.gameName.toLowerCase() &&
        m.tagLine.toLowerCase() === member.tagLine.toLowerCase())
  );
  if (index >= 0) current[index] = { ...current[index], ...member };
  else current.push(member);
  ensureDir();
  fs.writeFileSync(SQUAD_FILE, JSON.stringify(current, null, 2));
  return current;
}

function fileRemoveSquadMember(id: string): SquadMember[] {
  const filtered = fileGetSquadMembers().filter((m) => m.id !== id);
  ensureDir();
  fs.writeFileSync(SQUAD_FILE, JSON.stringify(filtered, null, 2));
  return filtered;
}

// ---------- API pública (híbrida) ----------
export async function getSquadMembers(): Promise<SquadMember[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabase()
      .from('squad_members')
      .select('*')
      .order('added_at', { ascending: true });
    if (error) {
      console.warn('Supabase getSquadMembers error:', error.message);
      return fileGetSquadMembers();
    }
    return (data || []).map(rowToMember);
  }
  return fileGetSquadMembers();
}

export async function saveSquadMember(member: SquadMember): Promise<SquadMember[]> {
  if (isSupabaseConfigured()) {
    const row = memberToRow(member);
    const { error } = await getSupabase().from('squad_members').upsert(row, {
      onConflict: 'id',
    });
    if (error) {
      console.warn('Supabase saveSquadMember error:', error.message);
      return fileSaveSquadMember(member);
    }
    return getSquadMembers();
  }
  return fileSaveSquadMember(member);
}

export async function removeSquadMember(id: string): Promise<SquadMember[]> {
  if (isSupabaseConfigured()) {
    const { error } = await getSupabase().from('squad_members').delete().eq('id', id);
    if (error) {
      console.warn('Supabase removeSquadMember error:', error.message);
      return fileRemoveSquadMember(id);
    }
    return getSquadMembers();
  }
  return fileRemoveSquadMember(id);
}
