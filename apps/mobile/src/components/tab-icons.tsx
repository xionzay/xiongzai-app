import { useEffect, useState } from "react";
import { Animated, Easing, Image, type ColorValue, type ImageSourcePropType } from "react-native";
import couponIcon from "../../assets/reference-jelly-v5/coupon.png";
import favoriteActionFilledIcon from "../../assets/reference-jelly-v5/rating-filled.png";
import favoriteActionOutlineIcon from "../../assets/reference-jelly-v5/rating-outline.png";
import favoriteIcon from "../../assets/reference-jelly-v5/favorite.png";
import homeIcon from "../../assets/reference-jelly-v5/home.png";
import messageActionIcon from "../../assets/reference-jelly-v5/message-outline.png";
import messageIcon from "../../assets/reference-jelly-v5/message.png";
import mineIcon from "../../assets/reference-jelly-v5/mine.png";
import orderIcon from "../../assets/reference-jelly-v5/order-original-shape.png";
import serviceIcon from "../../assets/reference-jelly-v5/service.png";
import settingIcon from "../../assets/reference-jelly-v5/setting.png";
import shieldIcon from "../../assets/reference-jelly-v5/shield.png";
import walletIcon from "../../assets/reference-jelly-v5/wallet.png";

type TabIconProps = { color?: ColorValue; size?: number };
const iconSources = {
  home: homeIcon,
  order: orderIcon,
  message: messageIcon,
  mine: mineIcon,
  service: serviceIcon,
  wallet: walletIcon,
  shield: shieldIcon,
  setting: settingIcon,
  favorite: favoriteIcon,
  coupon: couponIcon,
  withdraw: walletIcon,
  favoriteActionOutline: favoriteActionOutlineIcon,
  favoriteActionFilled: favoriteActionFilledIcon,
  messageAction: messageActionIcon,
} as const;

function DesignAssetIcon({ source, size }: { source: ImageSourcePropType; color: ColorValue; size: number }) {
  return <Image source={source} resizeMode="contain" style={{ width: size, height: size, opacity: 1 }} />;
}

export function HomeTabIcon({ color = "#6E706F", size = 40 }: TabIconProps) {
  return <DesignAssetIcon source={iconSources.home} color={color} size={size} />;
}

export function OrderTabIcon({ color = "#6E706F", size = 40 }: TabIconProps) {
  return <DesignAssetIcon source={iconSources.order} color={color} size={size} />;
}

export function MessageTabIcon({ color = "#6E706F", size = 40 }: TabIconProps) {
  return <DesignAssetIcon source={iconSources.message} color={color} size={size} />;
}

export function MineTabIcon({ color = "#6E706F", size = 40 }: TabIconProps) {
  return <DesignAssetIcon source={iconSources.mine} color={color} size={size} />;
}

export function ServiceTabIcon({ color = "#6E706F", size = 40 }: TabIconProps) {
  return <DesignAssetIcon source={iconSources.service} color={color} size={size} />;
}

export function WalletTabIcon({ color = "#6E706F", size = 40 }: TabIconProps) {
  return <DesignAssetIcon source={iconSources.wallet} color={color} size={size} />;
}

export function WithdrawTabIcon({ color = "#6E706F", size = 40 }: TabIconProps) {
  return <DesignAssetIcon source={iconSources.withdraw} color={color} size={size} />;
}

export function FavoriteMenuIcon({ color = "#FFB319", size = 62 }: TabIconProps) {
  return <DesignAssetIcon source={iconSources.favorite} color={color} size={size} />;
}

export function FavoriteActionIcon({ selected = false, size = 34 }: { selected?: boolean; color?: ColorValue; size?: number }) {
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    scale.stopAnimation();
    if (!selected) { scale.setValue(1); return; }
    scale.setValue(0.82);
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.08, duration: 140, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 60, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  }, [scale, selected]);
  return <Animated.Image source={selected ? iconSources.favoriteActionFilled : iconSources.favoriteActionOutline} resizeMode="contain" style={{ width: size, height: size, transform: [{ scale }] }} />;
}

export function MessageActionIcon({ color = "#2F8FE5", size = 34 }: { color?: ColorValue; size?: number }) {
  return <DesignAssetIcon source={iconSources.messageAction} color={color} size={size} />;
}

export function CouponActionIcon({ color = "#2F8FE5", size = 62 }: { color?: ColorValue; surfaceColor?: ColorValue; size?: number }) {
  return <DesignAssetIcon source={iconSources.coupon} color={color} size={size} />;
}

export function ShieldIcon({ color = "#171A21", size = 42 }: TabIconProps) {
  return <DesignAssetIcon source={iconSources.shield} color={color} size={size} />;
}

export function SettingsIcon({ color = "#171A21", size = 42 }: TabIconProps) {
  return <DesignAssetIcon source={iconSources.setting} color={color} size={size} />;
}
