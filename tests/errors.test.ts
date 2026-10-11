import { describe, it, expect } from 'vitest';
import {
  classifyRiotStatus,
  fromStatus,
  fromNetworkError,
  makeError,
  ERROR_MESSAGES,
  RiotApiError,
  type RiotErrorType,
} from '@/lib/errors';

describe('classifyRiotStatus', () => {
  it('401 es API key inválida', () => {
    expect(classifyRiotStatus(401)).toBe('API_KEY_INVALID');
  });

  it('403 es Forbidden (no key inválida)', () => {
    // La distinción importa: 401 = key vencida (acción: regenerar),
    // 403 = permisos/región (acción: revisar región).
    expect(classifyRiotStatus(403)).toBe('FORBIDDEN');
  });

  it('404 es NOT_FOUND', () => {
    expect(classifyRiotStatus(404)).toBe('NOT_FOUND');
  });

  it('429 es RATE_LIMIT', () => {
    expect(classifyRiotStatus(429)).toBe('RATE_LIMIT');
  });

  it('todo 5xx es SERVER_ERROR', () => {
    for (const s of [500, 502, 503, 504, 599]) {
      expect(classifyRiotStatus(s)).toBe('SERVER_ERROR');
    }
  });

  it('otros 4xx caen en UNKNOWN', () => {
    for (const s of [400, 402, 405, 418, 451]) {
      expect(classifyRiotStatus(s)).toBe('UNKNOWN');
    }
  });

  it('no cubre 429 con el rango de 5xx', () => {
    // Si el orden de las condiciones cambiara, 429 no debe caer en SERVER_ERROR.
    expect(classifyRiotStatus(429)).not.toBe('SERVER_ERROR');
  });
});

describe('ERROR_MESSAGES', () => {
  it('tiene mensaje para cada tipo', () => {
    const types: RiotErrorType[] = [
      'API_KEY_INVALID',
      'NOT_FOUND',
      'RATE_LIMIT',
      'FORBIDDEN',
      'SERVER_ERROR',
      'NETWORK_ERROR',
      'UNKNOWN',
    ];
    for (const t of types) {
      expect(ERROR_MESSAGES[t]).toBeTruthy();
      expect(ERROR_MESSAGES[t].length).toBeGreaterThan(10);
    }
  });

  it('los mensajes están en español, no en inglés', () => {
    for (const msg of Object.values(ERROR_MESSAGES)) {
      expect(msg).not.toMatch(/\b(the|your|error occurred)\b/i);
    }
  });

  it('el mensaje de key inválida menciona que expira cada 24h', () => {
    // Es el error más común y el que más confunde: la gente no sabe que
    // las dev keys vencen. El mensaje tiene que decirlo.
    expect(ERROR_MESSAGES.API_KEY_INVALID).toMatch(/24\s*h/i);
  });

  it('el mensaje de not found sugiere el formato Riot ID', () => {
    expect(ERROR_MESSAGES.NOT_FOUND).toMatch(/Game Name/i);
  });
});

describe('makeError', () => {
  it('traduce el tipo al mensaje correspondiente', () => {
    const e = makeError('RATE_LIMIT');
    expect(e.type).toBe('RATE_LIMIT');
    expect(e.message).toBe(ERROR_MESSAGES.RATE_LIMIT);
  });

  it('incluye detail y code cuando se pasan', () => {
    const e = makeError('SERVER_ERROR', 'upstream 503', 503);
    expect(e.detail).toBe('upstream 503');
    expect(e.code).toBe(503);
  });

  it('deja detail y code en undefined si no se pasan', () => {
    const e = makeError('UNKNOWN');
    expect(e.detail).toBeUndefined();
    expect(e.code).toBeUndefined();
  });
});

describe('fromStatus', () => {
  it('clasifica y traduce en un solo paso', () => {
    const e = fromStatus(404);
    expect(e.type).toBe('NOT_FOUND');
    expect(e.message).toBe(ERROR_MESSAGES.NOT_FOUND);
  });

  it('guarda el status original como code', () => {
    expect(fromStatus(429).code).toBe(429);
  });

  it('arrastra el detail técnico si viene', () => {
    expect(fromStatus(401, '401 Unauthorized').detail).toBe('401 Unauthorized');
  });
});

describe('fromNetworkError', () => {
  it('clasifica como NETWORK_ERROR', () => {
    expect(fromNetworkError(new Error('ECONNRESET')).type).toBe('NETWORK_ERROR');
  });

  it('guarda el mensaje real como detail para debug', () => {
    const e = fromNetworkError(new Error('ECONNRESET'));
    expect(e.detail).toBe('ECONNRESET');
  });

  it('no explota con valores que no son Error', () => {
    const e = fromNetworkError('timeout');
    expect(e.type).toBe('NETWORK_ERROR');
    expect(e.detail).toBe('timeout');
  });

  it('el mensaje de red está traducido, no en crudo', () => {
    expect(fromNetworkError(new Error('x')).message).not.toBe('x');
  });
});

describe('RiotApiError', () => {
  it('fromStatus crea el error con el mensaje traducido', () => {
    const err = RiotApiError.fromStatus(401);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('RiotApiError');
    expect(err.type).toBe('API_KEY_INVALID');
    expect(err.message).toBe(ERROR_MESSAGES.API_KEY_INVALID);
    expect(err.code).toBe(401);
  });

  it('network() usa el mensaje traducido de red', () => {
    const err = RiotApiError.network(new Error('ECONNREFUSED'));
    expect(err.type).toBe('NETWORK_ERROR');
    expect(err.message).toBe(ERROR_MESSAGES.NETWORK_ERROR);
  });

  it('toInfo() expone el error en la forma que espera el cliente', () => {
    const info = RiotApiError.fromStatus(404).toInfo();
    expect(info).toEqual({
      type: 'NOT_FOUND',
      message: ERROR_MESSAGES.NOT_FOUND,
      code: 404,
    });
  });

  it('es catcheable como Error normal', () => {
    try {
      throw RiotApiError.fromStatus(429);
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as RiotApiError).type).toBe('RATE_LIMIT');
    }
  });
});
