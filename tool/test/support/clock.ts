import type { Clock } from "../../src/domain/ports/clock";

export const FAKE_NOW = "2026-11-12";

export class FakeClock implements Clock {
  constructor(private readonly date: string = FAKE_NOW) {}

  today(): string {
    return this.date;
  }
}
