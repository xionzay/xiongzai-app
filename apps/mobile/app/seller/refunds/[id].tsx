import { useLocalSearchParams } from "expo-router";
import { SellerRefundScreen } from "@/features/seller/seller-refund-screen";
export default function Route() { const { id = "" } = useLocalSearchParams<{ id: string }>(); return <SellerRefundScreen id={id} />; }
