export const CALLBACK_DATA_MAX_LENGTH = 64;

export type MaybeNestedCallbackData =
  | { callbackQuery: { data: string } }
  | { data: string }
  | string;

export function splitWithTail(str: string, separator: string, limit: number) {
  // Resulting array will have at most `limit` elements
  const parts = str.split(separator);
  const tail = parts.slice(limit - 1).join(separator);
  return [...parts.slice(0, limit - 1), tail];
}

export function escapeRegExp(needle: string) {
  return needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeCallbackData(data: MaybeNestedCallbackData): string {
  if (typeof data === "string") {
    return data;
  }
  if ("callbackQuery" in data) {
    return data.callbackQuery.data;
  }
  return data.data;
}
