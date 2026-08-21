import { AppError } from "./errors.js";

// Existing game engines use the natural (message, code, status) ordering.
// Keep that boundary while Cardcade's HTTP layer standardizes AppError.
export class GameError extends AppError {
  constructor(message, code, status = 400) {
    super(code, message, status);
    this.name = "GameError";
  }
}
