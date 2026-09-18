export const PARTNER_FLOAT_ACCOUNT_TYPE = "partner_float";
export const PARTNER_DRAWINGS_ACCOUNT_TYPE = "partner_drawings";

export const PARTNER_ADVANCE_TAG = "partner-advance";
export const PARTNER_SPEND_TAG = "partner-spend";
export const PARTNER_DRAWING_TAG = "partner-drawing";
export const PARTNER_RETURN_TAG = "partner-return";

export function isPartnerSystemAccountType(type: string) {
  return type === PARTNER_FLOAT_ACCOUNT_TYPE || type === PARTNER_DRAWINGS_ACCOUNT_TYPE;
}

export function isExcludedFromAvailableBalance(type: string) {
  return type === PARTNER_DRAWINGS_ACCOUNT_TYPE;
}

export const PARTNER_SYSTEM_TAGS = new Set([
  PARTNER_ADVANCE_TAG,
  PARTNER_SPEND_TAG,
  PARTNER_DRAWING_TAG,
  PARTNER_RETURN_TAG,
]);

export function hasPartnerTag(tags: string[] | null | undefined, tag: string) {
  return (tags ?? []).some((item) => item.toLowerCase() === tag.toLowerCase());
}

export function withoutPartnerSystemTags(tags: string[] | null | undefined) {
  return (tags ?? []).filter((item) => !PARTNER_SYSTEM_TAGS.has(item.toLowerCase()));
}
