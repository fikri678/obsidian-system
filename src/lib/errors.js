export class HttpError extends Error {
  constructor(status, message, { code = null, details = null } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code || defaultCode(status);
    this.details = details;
  }
}

function defaultCode(status) {
  switch (status) {
    case 400: return 'BAD_REQUEST';
    case 401: return 'UNAUTHORIZED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 409: return 'CONFLICT';
    case 422: return 'VALIDATION_ERROR';
    case 429: return 'TOO_MANY_REQUESTS';
    default: return 'ERROR';
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, { details });
export const unauthorized = (msg = 'Sesi tamat. Sila log masuk semula.') => new HttpError(401, msg);
export const forbidden = (msg = 'Anda tiada kebenaran untuk tindakan ini.') => new HttpError(403, msg);
export const notFound = (msg = 'Rekod tidak dijumpai.') => new HttpError(404, msg);
export const conflict = (msg, details) => new HttpError(409, msg, { details });
export const validation = (msg, details) => new HttpError(422, msg, { details });
