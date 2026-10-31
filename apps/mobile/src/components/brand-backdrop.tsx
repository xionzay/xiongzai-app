import { Image, StyleSheet, View } from "react-native";
import buyerCanvas from "../../assets/approved-ui/buyer-canvas.png";
import sellerCanvas from "../../assets/approved-ui/seller-canvas.png";
import buyerDock from "../../assets/approved-ui/buyer-dock.png";
import sellerDock from "../../assets/approved-ui/seller-dock.png";

// The approved Web CSS canvas, rendered locally by the adjacent Swift script.
// One static decorative image instead of hundreds of views or a new native dependency.
export function BrandBackdrop({ seller = false, dock = false }: { seller?: boolean; dock?: boolean }) {
  return <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    <Image source={dock ? (seller ? sellerDock : buyerDock) : (seller ? sellerCanvas : buyerCanvas)} resizeMode="stretch" accessible={false} style={styles.image} />
  </View>;
}
const styles = StyleSheet.create({ image: { width: "100%", height: "100%" } });
