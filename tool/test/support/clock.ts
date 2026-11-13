export const FAKE_NOW = "2026-11-12";

export class FakeClock {
  constructor(private readonly date: string = FAKE_NOW) {}

  today(): string {
    return this.date;
  }
}
