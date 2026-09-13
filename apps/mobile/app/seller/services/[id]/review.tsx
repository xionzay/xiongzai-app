import { useLocalSearchParams } from "expo-router";
import { SellerServiceReviewScreen } from "@/features/seller/seller-service-review-screen";

export default function SellerServiceReviewRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SellerServiceReviewScreen id={id ?? ""} />;
}
