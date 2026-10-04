"use client";
import { CartoonIcon } from "./ui/CartoonIcon";

export function ProductBackButton({ onBack }: { onBack: () => void }) {
  return <button type="button" className="product-back-button" onClick={onBack} aria-label="返回上一页"><CartoonIcon kind="back" /></button>;
}

export function ProductDescription({ description, gameCategory }: { description: string; gameCategory: string }) {
  return <section className="paper-panel product-description-card"><h2>服务说明</h2><dl><div><dt>简介</dt><dd>{description}</dd></div><div><dt>游戏类目</dt><dd>{gameCategory}</dd></div></dl></section>;
}

export function ProductActions({ favorite, onStore, onFavorite, onContact, onBuy, unavailable = false }: {
  favorite: boolean; onStore: () => void; onFavorite: () => void; onContact: () => void; onBuy: () => void; unavailable?: boolean;
}) {
  return <nav className="product-purchase-actions" aria-label="商品操作">
    <button type="button" className="product-small-action" onClick={onStore}><CartoonIcon kind="store" /><span>店铺</span></button>
    <button type="button" className="product-small-action product-save-action" onClick={onFavorite} aria-pressed={favorite}><CartoonIcon kind="favorite" /><span>{favorite ? "已收藏" : "收藏"}</span></button>
    <button type="button" className="product-small-action" onClick={onContact}><CartoonIcon kind="message" /><span>客服</span></button>
    <button type="button" className="primary-action product-buy-action" disabled={unavailable} onClick={onBuy}>{unavailable ? "暂不可购买" : "立即购买"}</button>
  </nav>;
}
