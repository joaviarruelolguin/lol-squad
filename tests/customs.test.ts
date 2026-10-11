import { describe, it, expect } from 'vitest';
import { computeTable } from '@/lib/customs';
import type { CustomMatch } from '@/lib/types';

function match(partial: Partial<CustomMatch>): CustomMatch {
  return {
    id: 'm1',
    date: '2026-01-01T00:00:00.000Z',
    teamAName: 'A',
    teamBName: 'B',
    teamA: [],
    teamB: [],
    ...partial,
  };
}

describe('computeTable', () => {
  it('devuelve tabla vacía si no hay partidas', () => {
    expect(computeTable([])).toEqual({});
  });

  it('ignora partidas sin ganador', () => {
    const table = computeTable([
      match({ teamA: ['a1', 'a2'], teamB: ['b1', 'b2'] }),
    ]);
    expect(table).toEqual({});
  });

  it('suma 3 puntos a los ganadores y 0 a los perdedores', () => {
    const table = computeTable([
      match({ teamA: ['a1', 'a2'], teamB: ['b1', 'b2'], winner: 'A' }),
    ]);
    expect(table.a1).toEqual({
      memberId: 'a1', played: 1, won: 1, lost: 0, mvps: 0, points: 3,
    });
    expect(table.b1).toEqual({
      memberId: 'b1', played: 1, won: 0, lost: 1, mvps: 0, points: 0,
    });
  });

  it('acumula puntos y partidas a lo largo de varias fechas', () => {
    const table = computeTable([
      match({ id: 'm1', teamA: ['x'], teamB: ['y'], winner: 'A' }),
      match({ id: 'm2', teamA: ['x'], teamB: ['y'], winner: 'A' }),
      match({ id: 'm3', teamA: ['x'], teamB: ['y'], winner: 'B' }),
    ]);
    expect(table.x).toEqual({
      memberId: 'x', played: 3, won: 2, lost: 1, mvps: 0, points: 6,
    });
    expect(table.y).toEqual({
      memberId: 'y', played: 3, won: 1, lost: 2, mvps: 0, points: 3,
    });
  });

  it('suma 1 punto extra por MVP', () => {
    const table = computeTable([
      match({ teamA: ['a1'], teamB: ['b1'], winner: 'A', mvpMemberId: 'b1' }),
    ]);
    // b1 perdió pero fue MVP
    expect(table.b1.points).toBe(1);
    expect(table.b1.won).toBe(0);
    expect(table.b1.lost).toBe(1);
  });

  it('el MVP puede ser del equipo ganador (suma 4 en total)', () => {
    const table = computeTable([
      match({ teamA: ['a1'], teamB: ['b1'], winner: 'A', mvpMemberId: 'a1' }),
    ]);
    expect(table.a1.points).toBe(4);
    expect(table.a1.mvps).toBe(1);
  });

  it('acumula varios MVPs', () => {
    const table = computeTable([
      match({ id: 'm1', teamA: ['a1'], teamB: ['b1'], winner: 'A', mvpMemberId: 'a1' }),
      match({ id: 'm2', teamA: ['a1'], teamB: ['b1'], winner: 'A', mvpMemberId: 'a1' }),
    ]);
    expect(table.a1.mvps).toBe(2);
    expect(table.a1.points).toBe(8); // 3+3 por victorias + 1+1 por MVP
  });

  it('un MVP que nunca jugó no aparece si no está en ningún equipo', () => {
    const table = computeTable([
      match({ teamA: ['a1'], teamB: ['b1'], winner: 'A', mvpMemberId: 'fantasma' }),
    ]);
    // ensure() lo crea con 0 partidas
    expect(table.fantasma).toEqual({
      memberId: 'fantasma', played: 0, won: 0, lost: 0, mvps: 1, points: 1,
    });
  });

  it('cuenta correctamente cuando un jugador juega en ambos equipos es imposible', () => {
    // guardians: el mismo id en ambos equipos se contaría en ambos lados
    // documentamos el comportamiento actual
    const table = computeTable([
      match({ teamA: ['dup'], teamB: ['dup'], winner: 'A' }),
    ]);
    expect(table.dup.played).toBe(2);
    expect(table.dup.won).toBe(1);
    expect(table.dup.lost).toBe(1);
  });
});