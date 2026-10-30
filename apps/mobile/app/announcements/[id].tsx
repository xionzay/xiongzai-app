import { useLocalSearchParams } from "expo-router";
import { NativePage } from "@/components/native-page";
import { AnnouncementDetailScreen } from "@/features/home/home-announcements";
export default function AnnouncementRoute() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  return <NativePage title="公告详情" subtitle="平台已发布公告"><AnnouncementDetailScreen id={id} /></NativePage>;
}
