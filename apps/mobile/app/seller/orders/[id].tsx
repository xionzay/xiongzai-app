import { useLocalSearchParams } from "expo-router";
import { SellerOrderDetailScreen } from "@/features/seller/seller-order-detail-screen";
export default function Route() { const { id = "" } = useLocalSearchParams<{ id: string }>(); return <SellerOrderDetailScreen id={id} />; }
