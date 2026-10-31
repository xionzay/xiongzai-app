import type { ImageSourcePropType } from 'react-native';
import quickMatchIcon from '../../assets/reference-jelly-v5/quick-match.png';
import couponCenterIcon from '../../assets/reference-jelly-v5/coupon-center-original-shape.png';
import appRulesIcon from '../../assets/reference-jelly-v5/app-rules.png';
import feedbackIcon from '../../assets/reference-jelly-v5/feedback-original-shape.png';
import officialNoticesIcon from '../../assets/reference-jelly-v5/official-notices.png';
import homeIcon from '../../assets/reference-jelly-v5/home.png';
import orderIcon from '../../assets/reference-jelly-v5/order-original-shape.png';
import messageIcon from '../../assets/reference-jelly-v5/message.png';
import mineIcon from '../../assets/reference-jelly-v5/mine.png';
import searchIcon from '../../assets/reference-jelly-v5/search.png';
import flameIcon from '../../assets/reference-jelly-v5/flame.png';
import crownIcon from '../../assets/reference-jelly-v5/crown.png';
import productIcon from '../../assets/reference-jelly-v5/product.png';
import walletIcon from '../../assets/reference-jelly-v5/wallet.png';
import shieldIcon from '../../assets/reference-jelly-v5/shield.png';
import favoriteIcon from '../../assets/reference-jelly-v5/favorite.png';
import settingIcon from '../../assets/reference-jelly-v5/setting.png';
import shareIcon from '../../assets/reference-jelly-v5/share.png';
import serviceIcon from '../../assets/reference-jelly-v5/service.png';
import dataIcon from '../../assets/reference-jelly-v5/data.png';
import mineWaitIcon from '../../assets/reference-jelly-v5/mine-wait.png';
import couponIcon from '../../assets/reference-jelly-v5/coupon.png';
import backIcon from '../../assets/reference-jelly-v5/back.png';
import closeIcon from '../../assets/reference-jelly-v5/close.png';
import chevronIcon from '../../assets/reference-jelly-v5/chevron.png';
import checkIcon from '../../assets/reference-jelly-v5/check.png';
import plusIcon from '../../assets/reference-jelly-v5/plus.png';
import minusIcon from '../../assets/reference-jelly-v5/minus.png';
import moreIcon from '../../assets/reference-jelly-v5/more.png';
import smileIcon from '../../assets/reference-jelly-v5/smile.png';
import sendIcon from '../../assets/reference-jelly-v5/send.png';
import ratingOutlineIcon from '../../assets/reference-jelly-v5/rating-outline.png';
import messageOutlineIcon from '../../assets/reference-jelly-v5/message-outline.png';
import ratingFilledIcon from '../../assets/reference-jelly-v5/rating-filled.png';
import targetIcon from '../../assets/reference-jelly-v5/target.png';
import refreshIcon from '../../assets/reference-jelly-v5/refresh.png';
import imageIcon from '../../assets/reference-jelly-v5/image.png';
import warningIcon from '../../assets/reference-jelly-v5/warning.png';
import hourglassIcon from '../../assets/reference-jelly-v5/hourglass.png';
import maleIcon from '../../assets/reference-jelly-v5/male.png';
import femaleIcon from '../../assets/reference-jelly-v5/female.png';
import playIcon from '../../assets/reference-jelly-v5/play.png';
import pauseIcon from '../../assets/reference-jelly-v5/pause.png';
import heartFilledIcon from '../../assets/reference-jelly-v5/heart-filled.png';
import heartOutlineIcon from '../../assets/reference-jelly-v5/heart-outline.png';

// Static imports preserve Metro bundling and the approved artwork without tinting.
export const jellyAssets = {
  'quick-match': quickMatchIcon,
  'coupon-center': couponCenterIcon,
  'app-rules': appRulesIcon,
  'feedback': feedbackIcon,
  'official-notices': officialNoticesIcon,
  'home': homeIcon,
  'order': orderIcon,
  'message': messageIcon,
  'mine': mineIcon,
  'search': searchIcon,
  'flame': flameIcon,
  'crown': crownIcon,
  'product': productIcon,
  'wallet': walletIcon,
  'shield': shieldIcon,
  'favorite': favoriteIcon,
  'setting': settingIcon,
  'share': shareIcon,
  'service': serviceIcon,
  'data': dataIcon,
  'mine-wait': mineWaitIcon,
  'coupon': couponIcon,
  'back': backIcon,
  'close': closeIcon,
  'chevron': chevronIcon,
  'check': checkIcon,
  'plus': plusIcon,
  'minus': minusIcon,
  'more': moreIcon,
  'smile': smileIcon,
  'send': sendIcon,
  'rating-outline': ratingOutlineIcon,
  'message-outline': messageOutlineIcon,
  'rating-filled': ratingFilledIcon,
  'target': targetIcon,
  'refresh': refreshIcon,
  'image': imageIcon,
  'warning': warningIcon,
  'hourglass': hourglassIcon,
  'male': maleIcon,
  'female': femaleIcon,
  'play': playIcon,
  'pause': pauseIcon,
  'heart-filled': heartFilledIcon,
  'heart-outline': heartOutlineIcon,
} as const satisfies Record<string, ImageSourcePropType>;
