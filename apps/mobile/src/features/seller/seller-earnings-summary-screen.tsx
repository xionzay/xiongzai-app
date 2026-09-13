import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { CalendarDatePicker } from "@/components/calendar-date-picker";
import { NativePage, nativeShadow } from "@/components/native-page";
import { StateView } from "@/components/state-view";
import { WithdrawTabIcon } from "@/components/tab-icons";
import { useFinanceSummary, useSellerIncomes } from "@/features/seller/seller-finance-api";
import { colors } from "@/theme/tokens";
import type { SellerIncomeApiView } from "@/types/api";
import { formatCent } from "@/utils/money";

type Range = "今日" | "昨日" | "本周" | "本月" | "本年" | "累计";
const ranges: Range[] = ["今日", "昨日", "本周", "本月", "本年", "累计"];

export function SellerEarningsSummaryScreen() {
  const summary = useFinanceSummary();
  const incomes = useSellerIncomes();
  const [range, setRange] = useState<Range>("本周");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState(() => dateInputValue(new Date()));
  const [datePicker, setDatePicker] = useState<"start" | "end" | null>(null);
  const rows = useMemo(() => incomes.data?.pages.flatMap((page) => page.items) ?? [], [incomes.data]);
  const earliestValue = useMemo(() => rows.length ? dateInputValue(rows.reduce((earliest, item) => { const date = new Date(item.created_at); return date < earliest ? date : earliest; }, new Date(rows[0]!.created_at))) : `${new Date().getFullYear()}-01-01`, [rows]);
  const effectiveStart = customStart || earliestValue;
  const customDatesValid = validDateValue(effectiveStart) && validDateValue(customEnd) && effectiveStart <= customEnd;
  const selected = useMemo(() => rows.filter((item) => inRange(item.created_at, range, effectiveStart, customEnd)), [customEnd, effectiveStart, range, rows]);
  const amountCent = selected.reduce((sum, item) => sum + BigInt(item.seller_amount_cent), 0n);
  const averageCent = selected.length ? amountCent / BigInt(selected.length) : 0n;
  const finance = summary.data;

  return (
    <NativePage title="收益中心" subtitle="按时间查看真实收益" action={<Pressable accessibilityRole="button" accessibilityLabel="提现记录" onPress={() => router.push("/seller/finance/withdrawals")} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}><WithdrawTabIcon color={colors.text} size={29} /></Pressable>} contentStyle={styles.content} refreshing={summary.isRefetching || incomes.isRefetching} onRefresh={() => void Promise.all([summary.refetch(), incomes.refetch()])} onBack={() => router.replace("/(seller-tabs)")}>
      {summary.isPending || incomes.isPending ? <View style={styles.state}><StateView kind="loading" title="正在读取收益数据" /></View> : null}
      {summary.isError || incomes.isError || (!summary.isPending && !finance) ? <View style={styles.state}><StateView kind="error" title="收益数据加载失败" onRetry={() => void Promise.all([summary.refetch(), incomes.refetch()])} /></View> : null}
      {finance ? <>
        <View style={styles.balance}>
          <Text style={styles.balanceLabel}>可提现金额</Text>
          <Text style={styles.balanceMoney}>{formatCent(finance.available_cent)}</Text>
          <Text style={styles.balanceMeta}>待结算 {formatCent(finance.pending_cent)} · 欠款 {formatCent(finance.liability_cent)}</Text>
          <Pressable accessibilityRole="button" disabled={finance.withdrawal_paused} onPress={() => router.push("/seller/finance/withdraw")} style={({ pressed }) => [styles.withdraw, finance.withdrawal_paused && styles.disabled, pressed && styles.pressed]}><Text style={styles.withdrawText}>{finance.withdrawal_paused ? "提现暂停" : "提现"}</Text></Pressable>
        </View>
        {finance.withdrawal_paused ? <View style={styles.danger}><Text style={styles.dangerText}>当前存在欠款或风险事件，服务端已暂停提现。</Text></View> : null}
        <View style={styles.rangeTabs}>{ranges.map((item) => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: range === item }} onPress={() => setRange(item)} style={({ pressed }) => [styles.range, range === item && styles.rangeActive, pressed && styles.pressed]}><Text style={[styles.rangeText, range === item && styles.rangeTextActive]}>{item}</Text></Pressable>)}</View>
        {range === "累计" ? <View style={styles.dateRange} accessibilityLabel="累计收益日期范围">
          <View style={styles.dateRangeTitle}><Text style={styles.dateRangeBadge}>日</Text><Text style={styles.dateRangeTitleText}>自定义累计区间</Text></View>
          <View style={styles.dateField}><Text style={styles.dateLabel}>开始日期</Text><DateField label="开始日期" value={effectiveStart} onPress={() => setDatePicker("start")} /></View>
          <Text style={styles.dateSeparator}>至</Text>
          <View style={styles.dateField}><Text style={styles.dateLabel}>结束日期</Text><DateField label="结束日期" value={customEnd} onPress={() => setDatePicker("end")} /></View>
          <Text style={[styles.dateCaption, !customDatesValid && styles.dateInvalid]}>{customDatesValid ? `${displayDate(effectiveStart)} 至 ${displayDate(customEnd)}` : "请输入有效日期，开始日期不能晚于结束日期"}</Text>
        </View> : null}
        <View style={styles.summary}>
          <Summary label={`${range === "累计" ? "区间" : range}收益`} value={formatCent(amountCent.toString())} note={`${selected.length} 笔已完成收益`} accent />
          <Summary label="平均单笔" value={formatCent(averageCent.toString())} note="按当前筛选计算" />
          <Summary label="锁定中" value={formatCent(finance.locked_cent)} note="等待平台或渠道处理" />
        </View>
        <View style={styles.paper}>
          <Pressable accessibilityRole="button" onPress={() => router.push("/seller/finance/incomes")} style={styles.sectionHead}><View style={styles.sectionTitleRow}><Text style={styles.sectionTitle}>收益明细</Text><Text style={styles.sectionCount}>{rows.length} 笔</Text></View><Text style={styles.sectionLink}>全部 ›</Text></Pressable>
          {rows.slice(0, 3).map((item, index) => <IncomeRow key={item.id} item={item} last={index === Math.min(rows.length, 3) - 1} />)}
          {!rows.length ? <Text style={styles.empty}>暂时没有收益记录</Text> : null}
        </View>
        {datePicker ? <CalendarDatePicker visible title={datePicker === "start" ? "选择开始日期" : "选择结束日期"} value={datePicker === "start" ? effectiveStart : customEnd} minimumDate={datePicker === "end" ? effectiveStart : undefined} maximumDate={datePicker === "start" ? customEnd : dateInputValue(new Date())} onSelect={datePicker === "start" ? setCustomStart : setCustomEnd} onClose={() => setDatePicker(null)} /> : null}
      </> : null}
    </NativePage>
  );
}

function Summary({ label, value, note, accent = false }: { label: string; value: string; note: string; accent?: boolean }) {
  return <View style={styles.summaryCard}><Text style={styles.summaryLabel}>{label}</Text><Text numberOfLines={1} style={[styles.summaryValue, accent && styles.summaryAccent]}>{value}</Text><Text style={styles.summaryNote}>{note}</Text></View>;
}

function DateField({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`选择${label}，当前${displayDate(value)}`} accessibilityHint="打开日历" onPress={onPress} style={({ pressed }) => [styles.dateInput, pressed && styles.dateInputPressed]}><Text numberOfLines={1} style={styles.dateInputText}>{value}</Text><View accessibilityElementsHidden style={styles.calendarIcon}><View style={styles.calendarIconTop} /><Text style={styles.calendarIconText}>日</Text></View></Pressable>;
}

function IncomeRow({ item, last }: { item: SellerIncomeApiView; last: boolean }) {
  return <View style={[styles.incomeRow, !last && styles.rowBorder]}><View style={styles.incomeCopy}><Text style={styles.incomeTitle}>订单 {item.order_no}</Text><Text style={styles.incomeMeta}>{item.service_title} · {new Date(item.created_at).toLocaleString("zh-CN")}</Text></View><Text style={styles.incomeMoney}>+{formatCent(item.seller_amount_cent)}</Text></View>;
}

function inRange(value: string, range: Range, customStart: string, customEnd: string) {
  const date = new Date(value);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === "今日") return date >= startToday;
  if (range === "昨日") { const start = new Date(startToday); start.setDate(start.getDate() - 1); return date >= start && date < startToday; }
  if (range === "本周") { const start = new Date(startToday); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); return date >= start; }
  if (range === "本月") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  if (range === "本年") return date.getFullYear() === now.getFullYear();
  if (!validDateValue(customStart) || !validDateValue(customEnd) || customStart > customEnd) return false;
  return date >= new Date(`${customStart}T00:00:00`) && date <= new Date(`${customEnd}T23:59:59.999`);
}

function dateInputValue(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function validDateValue(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(`${value}T00:00:00`); return !Number.isNaN(date.getTime()) && dateInputValue(date) === value; }
function displayDate(value: string) { const [year, month, day] = value.split("-"); return `${year}年${month}月${day}日`; }

const styles = StyleSheet.create({
  content: { gap: 12 }, state: { minHeight: 250, justifyContent: "center", borderRadius: 18, backgroundColor: "#FFFDF8", ...nativeShadow },
  headerAction: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#FFFDF8" },
  balance: { position: "relative", minHeight: 154, justifyContent: "center", paddingHorizontal: 21, borderRadius: 20, backgroundColor: "#367FBF", ...nativeShadow }, balanceLabel: { color: "#DCEDFF", fontSize: 13, fontWeight: "800" }, balanceMoney: { marginTop: 5, color: "#FFFFFF", fontSize: 39, lineHeight: 44, fontWeight: "900" }, balanceMeta: { alignSelf: "flex-start", marginTop: 12, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, color: "#FFFFFF", backgroundColor: "rgba(255,255,255,0.15)", fontSize: 11 },
  withdraw: { position: "absolute", right: 17, top: 55, minWidth: 76, minHeight: 43, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#CFF20B", ...nativeShadow }, withdrawText: { color: "#2B3A0C", fontSize: 13, fontWeight: "900" },
  rangeTabs: { flexDirection: "row", gap: 3, padding: 4, borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 14, backgroundColor: "#FFFDF8", ...nativeShadow }, range: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 10 }, rangeActive: { backgroundColor: "#2F82C9" }, rangeText: { color: "#696B6D", fontSize: 11, fontWeight: "800" }, rangeTextActive: { color: "#FFFFFF" },
  dateRange: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 7, padding: 11, paddingBottom: 13, borderWidth: 3, borderBottomWidth: 6, borderColor: "#78B8E7", borderBottomColor: "#A8D4EF", borderRadius: 21, backgroundColor: "#EDF8FF", ...nativeShadow }, dateRangeTitle: { width: "100%", minHeight: 30, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginBottom: 1 }, dateRangeBadge: { width: 27, height: 27, paddingTop: 4, borderWidth: 2, borderColor: "#FFFFFF", borderRadius: 9, backgroundColor: "#FF7D48", color: "#FFFFFF", fontSize: 11, fontWeight: "900", textAlign: "center", overflow: "hidden" }, dateRangeTitleText: { color: "#285F91", fontSize: 12, fontWeight: "900", letterSpacing: 0.3 }, dateField: { flex: 1, minWidth: 125 }, dateLabel: { marginBottom: 6, marginLeft: 3, color: "#527391", fontSize: 11, fontWeight: "900" }, dateInput: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 5, paddingHorizontal: 9, borderWidth: 2, borderColor: "#BDDbed", borderRadius: 12, backgroundColor: "#FFFFFF" }, dateInputPressed: { borderColor: "#2F82C9", backgroundColor: "#F7FCFF" }, dateInputText: { flex: 1, color: "#283641", fontSize: 12, fontWeight: "900" }, calendarIcon: { width: 22, height: 22, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#2F82C9", borderRadius: 6 }, calendarIconTop: { position: "absolute", top: 4, left: 3, right: 3, height: 1.5, backgroundColor: "#2F82C9" }, calendarIconText: { marginTop: 4, color: "#2F82C9", fontSize: 8, lineHeight: 10, fontWeight: "900" }, dateSeparator: { marginBottom: 15, color: "#6D8CA4", fontSize: 11, fontWeight: "900" }, dateCaption: { width: "100%", color: "#527391", fontSize: 10, lineHeight: 15, fontWeight: "800", textAlign: "center" }, dateInvalid: { color: colors.danger },
  summary: { flexDirection: "row", gap: 7 }, summaryCard: { flex: 1, minHeight: 100, justifyContent: "center", paddingHorizontal: 10, borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 15, backgroundColor: "#FFFDF8", ...nativeShadow }, summaryLabel: { color: "#6E7479", fontSize: 11 }, summaryValue: { marginVertical: 7, color: "#1F6EAE", fontSize: 18, fontWeight: "900" }, summaryAccent: { color: colors.accent, fontSize: 20 }, summaryNote: { color: colors.textSecondary, fontSize: 9, lineHeight: 13 },
  paper: { overflow: "hidden", borderWidth: 1, borderColor: "rgba(62,57,47,0.10)", borderRadius: 18, backgroundColor: "#FFFDF8", ...nativeShadow }, sectionHead: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14 }, sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 }, sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "900" }, sectionCount: { color: colors.textSecondary, fontSize: 11 }, sectionLink: { color: colors.brandDeep, fontSize: 12, fontWeight: "900" },
  empty: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12, color: colors.textSecondary, fontSize: 12, textAlign: "center" },
  incomeRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 }, rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(62,57,47,0.10)" }, incomeCopy: { flex: 1 }, incomeTitle: { color: colors.text, fontSize: 13, fontWeight: "900" }, incomeMeta: { marginTop: 5, color: colors.textSecondary, fontSize: 10, lineHeight: 14 }, incomeMoney: { color: colors.accent, fontSize: 15, fontWeight: "900" },
  danger: { padding: 12, borderRadius: 13, backgroundColor: "#FFF0E8" }, dangerText: { color: colors.danger, fontSize: 12 }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.72 }
});
