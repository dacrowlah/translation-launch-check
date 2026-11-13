export type SmsEncoding = "GSM-7" | "UCS-2";

const GSM_BASIC_ASCII = /^[A-Za-z0-9 \n\r!"#$%&'()*+,\-./:;<=>?@_]$/u;
const GSM_BASIC_OTHER = new Set("£¥èéùìòÇØøÅåΔΦΓΛΩΠΨΣΘΞÆæßÉ¤¡ÄÖÑÜ§¿äöñüà");
const GSM_EXTENSION = new Set("^{}\\[~]|€\f");

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
