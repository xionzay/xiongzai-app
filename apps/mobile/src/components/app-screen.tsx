import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type ScrollViewProps } from "react-native";
import { NativeBackdrop } from "@/components/native-page";

interface AppScreenProps extends ScrollViewProps {
  scroll?: boolean;
}

export function AppScreen({ children, scroll = true, contentContainerStyle, ...props }: AppScreenProps) {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <NativeBackdrop />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {scroll ? (
          <ScrollView
            {...props}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            contentContainerStyle={[styles.content, contentContainerStyle]}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.content, styles.flex, contentContainerStyle]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#DEF0FF" },
  content: { flexGrow: 1, paddingHorizontal: 12, paddingBottom: 32 },
  flex: { flex: 1 }
});
