export type SmsEncoding = "GSM-7" | "UCS-2";

const GSM_BASIC_ASCII = /^[A-Za-z0-9 \n\r!"#$%&'()*+,\-./:;<=>?@_]$/u;
const GSM_BASIC_OTHER = new Set(
  "\u00a3\u00a5\u00e8\u00e9\u00f9\u00ec\u00f2\u00c7\u00d8\u00f8\u00c5\u00e5\u0394\u03a6\u0393\u039b\u03a9\u03a0\u03a8\u03a3\u0398\u039e\u00c6\u00e6\u00df\u00c9\u00a4\u00a1\u00c4\u00d6\u00d1\u00dc\u00a7\u00bf\u00e4\u00f6\u00f1\u00fc\u00e0",
);
const GSM_EXTENSION = new Set("^{}\\[~]|\u20ac\f");

const isBasic = (ch: string): boolean => GSM_BASIC_ASCII.test(ch) || GSM_BASIC_OTHER.has(ch);
const isGsm = (ch: string): boolean => isBasic(ch) || GSM_EXTENSION.has(ch);

export const smsEncoding = (text: string): SmsEncoding =>
  [...text].every(isGsm) ? "GSM-7" : "UCS-2";

const gsmUnits = (text: string): number =>
  [...text].reduce((sum, ch) => sum + (GSM_EXTENSION.has(ch) ? 2 : 1), 0);

const segmentsOf = (units: number, single: number, multi: number): number =>
  units <= single ? 1 : Math.ceil(units / multi);

/** Number of SMS segments: 160/153 for GSM-7, 70/67 for UCS-2 (UTF-16 code units). */
export const smsSegments = (text: string): number =>
  smsEncoding(text) === "GSM-7"
    ? segmentsOf(gsmUnits(text), 160, 153)
    : segmentsOf(text.length, 70, 67);
