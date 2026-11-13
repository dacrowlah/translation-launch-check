import type { Clock } from "../domain/ports/clock";

const ISO_DATE_LENGTH = 10;

export class SystemClock implements Clock {
  today(): string {
    return new Date().toISOString().slice(0, ISO_DATE_LENGTH);
  }
}
