import { useLocalSearchParams } from "expo-router";
import { SellerWithdrawalDetailScreen } from "@/features/seller/seller-withdrawals-screen";
export default function Route() { const { id = "" } = useLocalSearchParams<{ id: string }>(); return <SellerWithdrawalDetailScreen id={id} />; }
