import { useAuth } from "@/auth/auth-provider";
import { ProtectedEmptyTab } from "@/features/auth/protected-tab";
import { MineScreen } from "@/features/account/mine-screen";

export default function MineRoute() {
  const { user } = useAuth();
  return user ? <MineScreen /> : <ProtectedEmptyTab title="我的" mark="♙" returnTo="/(buyer-tabs)/mine" message="登录后查看个人资料与收藏。" />;
}
