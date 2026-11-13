export interface Taken {
  readonly taken: string[];
  readonly rest: string;
}

/** Takes every match of the "g" pattern; each becomes one space in rest. */
export const take = (text: string, pattern: RegExp): Taken => ({
  taken: [...text.matchAll(pattern)].map((match) => match[0]),
  rest: text.replace(pattern, " "),
});
