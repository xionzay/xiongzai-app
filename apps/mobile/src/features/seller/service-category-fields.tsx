import { Pressable, Text, View } from "react-native";
import { FormField } from "@/components/form-field";
import { PrimaryButton } from "@/components/primary-button";
import { useServiceCategories } from "./seller-api";
import type { CategorySnapshot, BillingUnit } from "@/features/catalog/service-catalog";
export function ServiceCategoryFields({ categoryId, snapshot, attributes, onChange, editable = true }: { categoryId: string | null; snapshot?: CategorySnapshot | null; attributes: Record<string, string>; onChange(id: string | null, attributes: Record<string, string>): void; editable?: boolean }) {
  const query = useServiceCategories();
  const category = query.data?.find((item) => item.id === categoryId) ?? snapshot;
  return <View style={{ gap: 12 }}>
    <Text>服务分类{!editable && category ? `：${category.name}` : ""}</Text>
    {editable ? <>
      {query.isPending ? <Text>正在加载分类…</Text> : query.isError ? <PrimaryButton tone="plain" label="分类加载失败，重试" onPress={() => void query.refetch()} /> : query.data?.length === 0 ? <Text>暂无可用分类，请联系平台管理员。</Text> : null}
      {query.data?.map((item) => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: categoryId === item.id }} onPress={() => onChange(item.id, item.id === categoryId ? Object.fromEntries(item.fields.filter((field) => attributes[field.key] !== undefined).map((field) => [field.key, attributes[field.key]!])) : {})} style={{ padding: 12, borderWidth: 1, borderRadius: 10, backgroundColor: item.id === categoryId ? "#D9EDFF" : "#FFFFFF" }}><Text>{item.id === categoryId ? "✓ " : ""}{item.name}</Text></Pressable>)}
      {categoryId && !query.isPending && !query.isError && !query.data?.some((item) => item.id === categoryId) ? <Text>此分类已停用，请选择其他分类后保存。</Text> : null}
    </> : null}
    {category?.fields.map((field) => <FormField key={field.key} label={`${field.label}${field.required ? "（必填）" : ""}`} value={attributes[field.key] ?? ""} editable={editable} maxLength={1000} onChangeText={(value) => onChange(categoryId, { ...Object.fromEntries(category.fields.filter((item) => attributes[item.key] !== undefined).map((item) => [item.key, attributes[item.key]!])), [field.key]: value })} />)}
  </View>;
}
export function PackageUnits({ unit, count, onChange, editable = true }: { unit: BillingUnit; count: string; onChange(unit: BillingUnit, count: string): void; editable?: boolean }) {
  return <View style={{ gap: 8 }}><Text>套餐计量单位</Text><View style={{ flexDirection: "row", gap: 8 }}>{([['SESSION', '次'], ['MATCH', '局'], ['HOUR', '小时']] as const).map(([value, label]) => <Pressable key={value} disabled={!editable} accessibilityRole="radio" accessibilityState={{ checked: unit === value }} onPress={() => onChange(value, count)} style={{ minHeight: 44, padding: 12, borderWidth: 1, borderRadius: 10, backgroundColor: unit === value ? "#D9EDFF" : "#FFFFFF" }}><Text>{label}{unit === value ? " ✓" : ""}</Text></Pressable>)}</View><FormField label="每份套餐包含数量（1–1000）" value={count} editable={editable} onChangeText={(value) => onChange(unit, value)} keyboardType="number-pad" /><Text>套餐价格为整份价格。按小时计量时，预约分钟数须等于小时数 × 60；按局计量时填写预计占用时间。</Text></View>;
}
