export class AppError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export function assert(condition, code, message, status = 400) {
  if (!condition) {
    throw new AppError(code, message, status);
  }
}
