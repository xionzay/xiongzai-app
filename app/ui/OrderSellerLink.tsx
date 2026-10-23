import { CatalogImage } from '../CatalogImage';
import { CartoonIcon } from './CartoonIcon';

/** The seller and order body remain separate navigation targets. */
export function OrderSellerLink({ name, avatarSrc, avatarFileId, onOpen }: {
  name: string; avatarSrc?: string; avatarFileId?: string | null; onOpen: () => void;
}) {
  return <button type="button" className="toon-link order-seller-link" aria-label={`查看${name}的店铺主页`} onClick={event => { event.stopPropagation(); onOpen(); }}>
    <CatalogImage src={avatarSrc} fileId={avatarFileId} kind="avatar" alt="" className="order-seller-avatar" />
    <span className="toon-link-label" title={name}>{name}</span>
    <CartoonIcon kind="back" className="toon-link-arrow" />
  </button>;
}
