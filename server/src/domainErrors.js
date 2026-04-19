class DomainError extends Error {
  constructor(status, headline, message = headline, code = null) {
    super(message);
    this.name = "DomainError";
    this.status = status;
    this.headline = headline;
    this.code = code;
  }
}

function createDomainError(status, headline, message = headline, code = null) {
  return new DomainError(status, headline, message, code);
}

export function badRequest(headline, message = headline, code = "bad_request") {
  return createDomainError(400, headline, message, code);
}

export function notFound(headline, message = headline, code = "not_found") {
  return createDomainError(404, headline, message, code);
}

export function conflict(headline, message = headline, code = "conflict") {
  return createDomainError(409, headline, message, code);
}
