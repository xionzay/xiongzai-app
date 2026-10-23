import { sellerApplicationMissingFields } from "../packages/contracts/src/commerce";
import { fieldLabels, validateProfile, type Profile, type ProfileFields, type Request } from "./storefront/model";

export function onboardingPayload(fields: ProfileFields): ProfileFields {
  return Object.fromEntries(Object.entries(fields).map(([key,value]) => [key, typeof value === "string" ? (value.trim() || (key === "seller_nickname" ? "" : null)) : value])) as ProfileFields;
}
export function onboardingErrors(fields: ProfileFields, submitting: boolean) {
  const errors=validateProfile(fields,false);
  if(submitting)for(const field of sellerApplicationMissingFields(fields))errors[field]=`提交审核前请完成${fieldLabels[field]}`;
  return errors;
}
export async function saveOnboardingDraft(request: Request, fields: ProfileFields, current: Pick<Profile,"id"|"version"> | null) {
  const payload=onboardingPayload(fields), errors=onboardingErrors(payload,false);
  if(Object.keys(errors).length)throw new Error(Object.values(errors).join("；"));
  return request<Profile>("/seller/profile",{method:current?"PATCH":"POST",body:JSON.stringify({...payload,accepting_orders:false,...(current?{version:current.version}:{})})});
}
