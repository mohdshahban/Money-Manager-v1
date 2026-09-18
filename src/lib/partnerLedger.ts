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
