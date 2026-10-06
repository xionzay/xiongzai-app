"use client";

import { CatalogImage } from "./CatalogImage";
import { homeShopFacts, type HomeShopInfo } from "./home-shop-model";

export function HomeShopCard({ shop, onOpen }: { shop: HomeShopInfo; onOpen: () => void }) {
  const facts = homeShopFacts(shop);
  return <button type="button" className="home-shop-card" onClick={onOpen} aria-label={`查看${shop.name}的店铺主页`}>
    <CatalogImage className="home-shop-avatar" src={shop.image} fileId={shop.avatarFileId} kind="avatar" alt="" />
    <span className="home-shop-content">
      <span className="home-shop-heading">
        <b className="home-shop-name" title={shop.name}>{shop.name}</b>
        <span className={`home-shop-rating${facts.hasRating ? " has-rating" : ""}`} title={facts.ratingDescription}>{facts.ratingText}</span>
      </span>
      <span className="home-shop-intro">{facts.introduction}</span>
      {facts.gameLabels.length > 0 && <span className="home-shop-games" aria-label={`主营游戏：${facts.games.join("、")}`}>
        {facts.gameLabels.map(game => <span key={game}>{game}</span>)}
      </span>}
      {(facts.productText || facts.completedText) && <span className="home-shop-stats">
        {facts.productText && <span>{facts.productText}</span>}
        {facts.completedText && <span>{facts.completedText}</span>}
      </span>}
    </span>
  </button>;
}
