export type RiotErrorType =
  | 'API_KEY_INVALID'
  | 'NOT_FOUND'
  | 'RATE_LIMIT'
  | 'FORBIDDEN'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export interface ErrorInfo {
  type: RiotErrorType;
  message: string; // mensaje ya traducido para el usuario
  detail?: string; // detalle técnico (opcional, para debug)
  code?: number;   // código HTTP de Riot, si aplica
}

export const ERROR_MESSAGES: Record<RiotErrorType, string> = {
  API_KEY_INVALID:
    'API key inválida o vencida. Las keys de desarrollo expiran cada 24h: generá una nueva en developer.riotgames.com y actualizá el archivo .env.local.',
  NOT_FOUND:
    'No se encontró el invocador. Verificá que el Game Name y el Tag sean correctos (ej: bigJoao + LAS) y que la región coincida.',
  RATE_LIMIT:
    'Alcanzamos el límite de solicitudes de Riot (rate limit). Esperá unos segundos y actualizá.',
  FORBIDDEN:
    'Acceso denegado por Riot. Puede ser un problema de permisos o de región.',
  SERVER_ERROR:
    'El servidor de Riot está caído o en mantenimiento. Reintentá más tarde.',
  NETWORK_ERROR:
    'No se pudo conectar con la API de Riot (error de red). Revisá tu conexión.',
  UNKNOWN:
    'Ocurrió un error inesperado al consultar la API de Riot.',
};

export function classifyRiotStatus(status: number): RiotErrorType {
  if (status === 401 || status === 403) return status === 401 ? 'API_KEY_INVALID' : 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMIT';
  if (status >= 500) return 'SERVER_ERROR';
  return 'UNKNOWN';
}

export function makeError(
  type: RiotErrorType,
  detail?: string,
  code?: number
): ErrorInfo {
  return {
    type,
    message: ERROR_MESSAGES[type],
    detail,
    code,
  };
}

export function fromStatus(status: number, detail?: string): ErrorInfo {
  const type = classifyRiotStatus(status);
  return makeError(type, detail, status);
}

export function fromNetworkError(err: unknown): ErrorInfo {
  const detail = err instanceof Error ? err.message : String(err);
  return makeError('NETWORK_ERROR', detail);
}

export class RiotApiError extends Error {
  type: RiotErrorType;
  code?: number;

  constructor(type: RiotErrorType, message: string, code?: number) {
    super(message);
    this.name = 'RiotApiError';
    this.type = type;
    this.code = code;
  }

  static fromStatus(status: number, detail?: string): RiotApiError {
    const type = classifyRiotStatus(status);
    return new RiotApiError(type, ERROR_MESSAGES[type], status);
  }

  static network(err: unknown): RiotApiError {
    const detail = err instanceof Error ? err.message : String(err);
    return new RiotApiError('NETWORK_ERROR', ERROR_MESSAGES.NETWORK_ERROR);
  }

  toInfo(): ErrorInfo {
    return {
      type: this.type,
      message: this.message,
      code: this.code,
    };
  }
}
