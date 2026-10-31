import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAppActivity } from "@/hooks/use-app-activity";
import { useQuery } from "@tanstack/react-query";
import { communityClient, useAnnouncement, useAnnouncements } from "@/features/community/community-api";
import { communityError, type AnnouncementCover as CoverResponse } from "@/features/community/community-client";
import { NoticeBanner } from "@/components/notice-banner";
import { PrimaryButton } from "@/components/primary-button";
import { colors } from "@/theme/tokens";

export function HomeAnnouncements() {
  const query = useAnnouncements();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(true);
  const scroll = useRef<ScrollView>(null);
  const resumeAt = useRef(0);
  const width = useWindowDimensions().width - 24;
  const activity = useAppActivity();
  const announcements = [...new Map((query.data?.pages.flatMap(page => page.items) ?? []).map(item => [item.id, item])).values()];
  const selected = Math.min(index, Math.max(0, announcements.length - 1));
  const current = announcements[selected];
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduceMotion(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { alive = false; subscription.remove(); };
  }, []);
  useFocusEffect(useCallback(() => {
    if (activity !== 'active' || paused || reduceMotion || announcements.length < 2 || query.isError) return;
    const timer = setInterval(() => {
      if (Date.now() < resumeAt.current) return;
      scroll.current?.scrollTo({ x: ((selected + 1) % announcements.length) * width, animated: true });
    }, 5200);
    return () => clearInterval(timer);
  }, [activity, paused, reduceMotion, announcements.length, query.isError, selected, width]));
  if (query.isPending) return <View style={styles.wrapper}><Text style={styles.copy}>正在加载公告…</Text></View>;
  if (query.isError) return <View style={styles.wrapper}><NoticeBanner tone="danger" message="公告读取失败，无法确认当前发布内容。" /><PrimaryButton label="重试读取公告" tone="plain" onPress={() => void query.refetch()} /></View>;
  if (!current) return <View style={[styles.wrapper, { minHeight: 52, justifyContent: "center", padding: 14, marginVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: "rgba(255,255,255,0.18)" }]}><Text style={styles.copy}>暂无已发布公告</Text></View>;
  return <View style={styles.wrapper}>
    <View>
    <ScrollView ref={scroll} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScrollBeginDrag={() => { resumeAt.current = Date.now() + 7000; }} onScroll={event => setIndex(Math.max(0, Math.min(announcements.length - 1, Math.round(event.nativeEvent.contentOffset.x / width))))} scrollEventThrottle={16}>
      {announcements.map((item, position) => <View key={`${item.id}:${item.version}`} style={{ width }} importantForAccessibility={position === selected ? 'auto' : 'no-hide-descendants'} accessibilityElementsHidden={position !== selected}>
        <Pressable accessibilityRole="button" accessibilityLabel={`查看公告：${item.title}`} onPress={() => router.push({ pathname: '/announcements/[id]', params: { id: item.id } })} style={styles.banner}>
          {item.cover_file_id ? <AnnouncementCover id={item.id} title={item.title} /> : <Text style={styles.copy}>{item.title}</Text>}
        </Pressable>
      </View>)}
    </ScrollView>
    {announcements.length > 1 ? <View style={styles.controls}>{announcements.map((item, i) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`公告 ${i + 1}：${item.title}`} accessibilityState={{ selected: selected === i }} onPress={() => { resumeAt.current = Date.now() + 7000; scroll.current?.scrollTo({ x: i * width, animated: !reduceMotion }); }} style={styles.dotButton}><View style={[styles.dot, selected === i && styles.activeDot]} /></Pressable>)}
      <Pressable accessibilityRole="button" accessibilityLabel={paused ? '继续自动轮播' : '暂停自动轮播'} onPress={() => setPaused(value => !value)} style={styles.dotButton}><Text style={{ color: 'white', fontSize: 12 }}>{paused ? '▷' : 'Ⅱ'}</Text></Pressable>
    </View> : null}
    </View>
    {query.hasNextPage ? <PrimaryButton label="加载更多公告" tone="plain" loading={query.isFetchingNextPage} disabled={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} /> : null}
  </View>;
}
export function AnnouncementDetailScreen({ id }: { id: string }) {
  const query = useAnnouncement(id);
  if (!id) return <NoticeBanner message="公告不存在。" />;
  if (query.isPending) return <Text style={styles.copy}>正在加载公告…</Text>;
  if (query.isError || !query.data) return <View style={styles.detail}><NoticeBanner tone="danger" message={communityError(query.error)} /><PrimaryButton label="重试读取公告" tone="plain" onPress={() => void query.refetch()} /></View>;
  const current = query.data;
  return <View style={styles.detail}>
    {current.cover_file_id ? <AnnouncementCover key={`${current.id}:${current.version}`} id={current.id} title={current.title} /> : null}
    <Text accessibilityRole="header" style={styles.title}>{current.title}</Text>
    <Text style={styles.copy}>{new Date(current.published_at).toLocaleString("zh-CN")}</Text>
    <Text selectable style={styles.copy}>{current.content}</Text>
    <PrimaryButton label="刷新公告" tone="plain" loading={query.isFetching} onPress={() => void query.refetch()} />
  </View>;
}

/** Signed addresses live only in this mounted query and are discarded/hidden on expiry or failure. */
export function AnnouncementCover({ id, title }: { id: string; title: string }) {
  const query = useQuery({ queryKey: ["announcement-cover", id], queryFn: ({ signal }) => communityClient.cover(id, signal), staleTime: 0, gcTime: 0, retry: false });
  const expiry = query.data?.access.expires_at;
  const refetch = query.refetch;
  useFocusEffect(useCallback(() => {
    // Returning to a retained tab must renew an expired signed cover, not keep a broken image.
    if (expiry && Date.parse(expiry) <= Date.now()) void refetch();
  }, [expiry, refetch]));
  const retry = <PrimaryButton label="重新获取封面" tone="plain" loading={query.isFetching} onPress={() => void query.refetch()} />;
  if (query.isPending) return <Text style={styles.copy}>正在加载公告封面…</Text>;
  if (query.isError || !query.data) return <View><Text style={styles.copy}>封面暂不可用。</Text>{retry}</View>;
  return <CoverLease key={`${query.dataUpdatedAt}:${query.data.access.expires_at}`} data={query.data} title={title} retry={retry} />;
}
function CoverLease({ data, title, retry }: { data: CoverResponse; title: string; retry: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  const expiresAt = data.access.expires_at;
  const [expired, setExpired] = useState(() => !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now());
  useEffect(() => {
    const milliseconds = Date.parse(expiresAt) - Date.now();
    const timer = setTimeout(() => setExpired(true), Number.isFinite(milliseconds) ? Math.max(0, Math.min(milliseconds, 2_147_483_647)) : 0);
    return () => clearTimeout(timer);
  }, [expiresAt]);
  if (failed || expired) return <View><Text style={styles.copy}>封面暂不可用或链接已过期。</Text>{retry}</View>;
  return <Image source={{ uri: data.access.url, cache: "reload" }} resizeMode="contain" style={styles.image} accessibilityLabel={`${title}封面`} onError={() => setFailed(true)} />;
}
const styles = StyleSheet.create({ wrapper: { marginHorizontal: 12, marginBottom: 4 }, banner: { overflow: "hidden", borderRadius: 8, minHeight: 48, justifyContent: "center" }, image: { width: "100%", height: undefined, aspectRatio: 4.48 }, controls: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: "row", justifyContent: "center" }, dotButton: { minWidth: 44, minHeight: 44, justifyContent: "flex-end", paddingBottom: 8, alignItems: "center" }, dot: { width: 6, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.7)' }, activeDot: { width: 14, backgroundColor: 'white' }, detail: { gap: 16 }, title: { color: colors.text, fontSize: 21, lineHeight: 30, fontWeight: "700" }, copy: { color: colors.textSecondary, fontSize: 15, lineHeight: 23 } });
