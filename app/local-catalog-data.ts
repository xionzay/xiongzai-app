// Local UI fixtures only. IDs must never be sent to commerce APIs.
const names = ["晚风", "小熊软糖", "北极熊", "星河", "橘子汽水", "月亮同学"];
const introductions = [
  "耐心报点，轻松配合，一起享受开黑的乐趣。",
  "喜欢团队协作，声音温柔，认真陪你打好每一局。",
  "擅长路线规划与局内沟通，节奏稳定，配合默契。",
  "认真研究战术，也喜欢聊天，和你一起找到游戏乐趣。",
  "活泼好沟通，娱乐开黑不冷场，输赢都保持好心情。",
  "耐心讲解操作与思路，从基础配合开始慢慢进步。",
];
export const previewCompanions = names.map((name, index) => ({
  id: `local-avatar-preview-${String(index + 1).padStart(2, "0")}`, name,
  image: `/assets/home-companions/avatar-${String(index + 1).padStart(2, "0")}.jpg`,
  gender: (["男", "女", "男", "男", "女", "女"] as const)[index],
  level: 1, rank: index === 2 ? "巅峰赛季" : "超级王牌",
  rating: ["5.0", "4.8", "4.7", "4.9", "4.8", "4.9"][index],
  completed: 0, services: 3, tags: ["耐心沟通", "团队配合"],
  introduction: introductions[index],
}));
const mainTitles = ["地铁逃生 · 苏尔南组队陪玩", "地铁逃生 · 探索搭子", "三角洲行动 · 战术配合", "地铁逃生 · 进阶组队", "和平精英 · 轻松四排", "和平精英 · 新手陪练"];
const prices = [3000, 2500, 2800, 4000, 2600, 2200];
export const previewServices = [0, 1, 2].flatMap((variant) => previewCompanions.map((seller, index) => {
  const price = prices[index] + variant * 500;
  return {
    id: `local-service-preview-${index + 1}-${variant + 1}`, sellerId: seller.id,
    sellerName: seller.name, sellerImage: seller.image,
    title: variant === 0 ? mainTitles[index] : `${index === 2 ? "三角洲行动" : index < 4 ? "地铁逃生" : "和平精英"} · ${variant === 1 ? "双人默契配合" : "技巧讲解陪练"}`,
    cover: `/assets/home-hot-sale/cover-${String(index % 4 + 1).padStart(2, "0")}.jpg`,
    priceCent: String(price), sold: 0, rating: seller.rating, tone: "blue" as const,
    tags: variant === 2 ? ["技巧讲解", "耐心陪练"] : ["组队陪玩", "平台沟通"],
    subtitle: variant === 2 ? "从基础操作到团队思路，边玩边讲解。" : "开局前确认需求，沟通节奏，体验轻松组队。",
    description: `${seller.name}提供的${variant === 2 ? "技巧讲解" : "游戏组队"}服务。开始前确认游戏区服、段位和时间，服务中保持友好沟通。以下规格和价格用于本地界面预览。`,
    specs: [
      { id: `preview-sku-${index}-${variant}-0`, name: "体验陪玩 · 30 分钟", priceCent: price, duration: 30 },
      { id: `preview-sku-${index}-${variant}-1`, name: "默契开黑 · 60 分钟", priceCent: price * 2, duration: 60 },
      { id: `preview-sku-${index}-${variant}-2`, name: "畅玩陪伴 · 120 分钟", priceCent: price * 4, duration: 120 },
    ],
  };
}));
export const previewHotServices = previewServices.slice(0, 4);
export type PreviewEntry = { kind: "companion" | "service"; id: string };
