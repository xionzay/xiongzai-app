import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { nativeShadow } from "@/components/native-page";
import { colors } from "@/theme/tokens";

const weekLabels = ["日", "一", "二", "三", "四", "五", "六"];

type CalendarDatePickerProps = {
  visible: boolean;
  title: string;
  value: string;
  minimumDate?: string;
  maximumDate?: string;
  onSelect: (value: string) => void;
  onClose: () => void;
};

export function CalendarDatePicker({ visible, title, value, minimumDate, maximumDate, onSelect, onClose }: CalendarDatePickerProps) {
  const insets = useSafeAreaInsets();
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(parseDate(value)));

  const cells = useMemo(() => calendarCells(visibleMonth), [visibleMonth]);
  const previousMonth = shiftMonth(visibleMonth, -1);
  const nextMonth = shiftMonth(visibleMonth, 1);
  const previousDisabled = Boolean(minimumDate && monthLast(previousMonth) < parseDate(minimumDate));
  const nextDisabled = Boolean(maximumDate && nextMonth > monthStart(parseDate(maximumDate)));
  const today = dateValue(new Date());

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭日期选择器" onPress={onClose} style={styles.backdrop} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.grabber} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.eyebrow}>选择日期</Text>
              <Text style={styles.title}>{title}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="关闭" onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}><Text style={styles.closeText}>×</Text></Pressable>
          </View>
          <View style={styles.monthHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="上个月" disabled={previousDisabled} onPress={() => setVisibleMonth(previousMonth)} style={({ pressed }) => [styles.monthButton, previousDisabled && styles.disabled, pressed && styles.pressed]}><Text style={styles.monthArrow}>‹</Text></Pressable>
            <Text accessibilityRole="header" style={styles.monthTitle}>{visibleMonth.getFullYear()}年 {visibleMonth.getMonth() + 1}月</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="下个月" disabled={nextDisabled} onPress={() => setVisibleMonth(nextMonth)} style={({ pressed }) => [styles.monthButton, nextDisabled && styles.disabled, pressed && styles.pressed]}><Text style={styles.monthArrow}>›</Text></Pressable>
          </View>
          <View style={styles.weekRow}>{weekLabels.map((label) => <Text key={label} style={styles.weekLabel}>{label}</Text>)}</View>
          <View style={styles.calendarGrid}>
            {cells.map((cell, index) => {
              if (!cell) return <View key={`empty-${index}`} style={styles.dayCell} />;
              const disabled = Boolean((minimumDate && cell < minimumDate) || (maximumDate && cell > maximumDate));
              const selected = cell === value;
              const isToday = cell === today;
              return <View key={cell} style={styles.dayCell}><Pressable accessibilityRole="button" accessibilityLabel={`${displayDate(cell)}${selected ? "，已选择" : ""}`} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => { onSelect(cell); onClose(); }} style={({ pressed }) => [styles.dayButton, selected && styles.daySelected, isToday && !selected && styles.dayToday, disabled && styles.dayDisabled, pressed && !disabled && styles.dayPressed]}><Text style={[styles.dayText, selected && styles.dayTextSelected, disabled && styles.dayTextDisabled]}>{Number(cell.slice(-2))}</Text></Pressable></View>;
            })}
          </View>
          <Text style={styles.hint}>点击日期即可完成选择</Text>
        </View>
      </View>
    </Modal>
  );
}

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function monthStart(value: Date) { return new Date(value.getFullYear(), value.getMonth(), 1); }
function monthLast(value: Date) { return new Date(value.getFullYear(), value.getMonth() + 1, 0); }
function shiftMonth(value: Date, amount: number) { return new Date(value.getFullYear(), value.getMonth() + amount, 1); }
function dateValue(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function displayDate(value: string) { const [year, month, day] = value.split("-"); return `${year}年${month}月${day}日`; }

function calendarCells(month: Date) {
  const leading = month.getDay();
  const days = monthLast(month).getDate();
  const cells: (string | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= days; day += 1) cells.push(dateValue(new Date(month.getFullYear(), month.getMonth(), day)));
  while (cells.length % 7) cells.push(null);
  return cells;
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(19,31,42,0.38)" },
  sheet: { paddingHorizontal: 18, paddingTop: 9, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: "#FFFDF8", ...nativeShadow },
  grabber: { alignSelf: "center", width: 44, height: 5, marginBottom: 12, borderRadius: 3, backgroundColor: "#D7DEE3" },
  sheetHeader: { minHeight: 55, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { color: colors.brandDeep, fontSize: 11, fontWeight: "800" },
  title: { marginTop: 3, color: colors.text, fontSize: 20, fontWeight: "900" },
  closeButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#F3F0E9" },
  closeText: { color: colors.text, fontSize: 28, lineHeight: 31, fontWeight: "500" },
  monthHeader: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, borderRadius: 16, backgroundColor: "#EDF8FF" },
  monthButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  monthArrow: { color: colors.brandDeep, fontSize: 33, lineHeight: 36, fontWeight: "500" },
  monthTitle: { color: "#285F91", fontSize: 16, fontWeight: "900" },
  weekRow: { flexDirection: "row", marginTop: 12 },
  weekLabel: { width: "14.2857%", color: colors.textSecondary, fontSize: 12, fontWeight: "800", textAlign: "center" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
  dayCell: { width: "14.2857%", height: 46, alignItems: "center", justifyContent: "center" },
  dayButton: { width: 39, height: 39, alignItems: "center", justifyContent: "center", borderRadius: 13 },
  daySelected: { backgroundColor: "#2F82C9", ...nativeShadow },
  dayToday: { borderWidth: 2, borderColor: "#FF7043" },
  dayDisabled: { opacity: 0.28 },
  dayPressed: { backgroundColor: "#DCEEFF" },
  dayText: { color: colors.text, fontSize: 14, fontWeight: "800" },
  dayTextSelected: { color: "#FFFFFF" },
  dayTextDisabled: { color: colors.textSecondary },
  hint: { marginTop: 8, color: colors.textSecondary, fontSize: 11, textAlign: "center" },
  disabled: { opacity: 0.28 },
  pressed: { opacity: 0.68 }
});
