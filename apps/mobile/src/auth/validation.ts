import { z } from "zod";

export const phoneSchema = z.string().regex(/^1\d{10}$/u, "请输入正确的 11 位手机号码");
export const smsCodeSchema = z.string().regex(/^\d{6}$/u, "请输入 6 位验证码");

export const loginFormSchema = z.object({
  phone: phoneSchema,
  code: smsCodeSchema
});

export const profileFormSchema = z.object({
  nickname: z.string().trim().min(2, "昵称至少需要 2 个字符").max(16, "昵称不能超过 16 个字符")
    .refine((value) => !/1\d{10}/u.test(value), "昵称中请勿填写手机号或联系方式")
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
export type ProfileFormValues = z.infer<typeof profileFormSchema>;
