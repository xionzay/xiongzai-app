import { useLocalSearchParams } from "expo-router";
import { SellerServiceEditScreen } from "@/features/seller/seller-service-edit-screen";

export default function SellerServiceEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SellerServiceEditScreen id={id ?? ""} />;
}
