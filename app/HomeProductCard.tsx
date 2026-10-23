import { CatalogImage } from './CatalogImage';
import { homeProductFacts, type HomeProductSource } from './home-product-model';

export function HomeProductCard({ product, preview = false, onOpen }: {
  product: HomeProductSource & { title: string; cover: string; coverFileId?: string | null; gameCategory?: string | null };
  preview?: boolean; onOpen: () => void;
}) {
  const facts = homeProductFacts(product, preview);
  const game = product.gameCategory?.trim();
  return <button type="button" className="product-card home-product-item" onClick={onOpen}>
    <span className="product-cover"><CatalogImage src={product.cover} fileId={product.coverFileId} alt="" /></span>
    <span className="product-copy">
      <b title={product.title}>{product.title}</b>
      {game && <small title={game}>{game}</small>}
      <em>
        {facts.priceText ? <strong>¥{facts.priceText}{facts.qualifier && <small>{facts.qualifier}</small>}{facts.unit && <small>/{facts.unit}</small>}</strong> : <span>价格暂不可用</span>}
        {facts.sales !== undefined && <span>销量 {facts.sales}</span>}
      </em>
    </span>
  </button>;
}
