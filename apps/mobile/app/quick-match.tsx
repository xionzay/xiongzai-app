import { useState } from "react";
import { Text } from "react-native";
import { productGames, type ProductGame } from "@xiongzai/contracts/commerce";
import { NativePage } from "@/components/native-page";
import { PrimaryButton } from "@/components/primary-button";
import { StateView } from "@/components/state-view";
import { GameFilter } from "@/features/home/catalog-home-screen";
import { ShopCard } from "@/features/home/catalog-card";
import { offersCompanion } from "@/features/home/home-domain";
import { useDiscoverySearch } from "@/features/discovery/discovery-api";
import { flattenUniqueById } from "@/features/discovery/discovery-domain";
import { useOnlineStatus } from "@/hooks/use-online-status";
import type { CompanionApiView } from "@/types/api";
import { colors } from "@/theme/tokens";
export default function QuickMatchRoute() {
  const [game, setGame] = useState<ProductGame>(productGames[0]);
  const online = useOnlineStatus();
  const query = useDiscoverySearch("companions", "陪玩", "comprehensive");
  const rows = (flattenUniqueById(query.data?.pages ?? []) as CompanionApiView[]).filter(item => offersCompanion(item, game));
  return <NativePage title="快速匹配" subtitle="按公开介绍查找店铺" refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
    <Text style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 23 }}>选择游戏，查看公开提供陪玩的店铺；进入店铺了解商品后再联系。不是自动下单或自动分配。</Text>
    <GameFilter value={game} all={false} onChange={value => { if (value !== "ALL") setGame(value); }} />
    {!online ? <StateView kind="offline" onRetry={() => void query.refetch()} /> : query.isPending ? <StateView kind="loading" /> : query.isError ? <StateView kind="error" onRetry={() => void query.refetch()} /> : rows.length ? rows.map(item => <ShopCard key={item.id} item={item} />) : <StateView kind="empty" title="暂无符合条件的店铺" message="可切换游戏，或继续加载更多公开店铺。" />}
    {query.hasNextPage ? <PrimaryButton tone="plain" label={query.isFetchNextPageError ? "加载失败，重试" : "加载更多店铺"} loading={query.isFetchingNextPage} disabled={!online || query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} /> : null}
  </NativePage>;
}
