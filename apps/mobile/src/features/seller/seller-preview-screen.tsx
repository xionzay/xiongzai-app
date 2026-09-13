import { StyleSheet, View } from "react-native";
import { NativePage, nativeShadow } from "@/components/native-page";
import { StateView } from "@/components/state-view";
import { CompanionDetailScreen } from "@/features/discovery/companion-detail-screen";
import { useSellerProfile } from "@/features/seller/seller-api";

export function SellerPreviewScreen() {
  const query = useSellerProfile();
  if (query.isPending) return <NativePage title="公开主页预览" subtitle="买家看到的主页效果"><View style={styles.state}><StateView kind="loading" /></View></NativePage>;
  if (!query.data || query.isError || query.data.status !== "APPROVED") return <NativePage title="公开主页预览" subtitle="买家看到的主页效果"><View style={styles.state}><StateView kind="error" title="当前主页不可预览" /></View></NativePage>;
  return <CompanionDetailScreen preview sellerId={query.data.id} />;
}

const styles = StyleSheet.create({ state: { minHeight: 240, justifyContent: "center", borderRadius: 18, backgroundColor: "rgba(255,253,248,0.96)", ...nativeShadow } });
