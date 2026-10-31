/** D09/D13: 临时测试配置，正式启用前确认。复用既有商品图片安全限制。 */
export const reviewImageLimits = Object.freeze({
  maximumCount: 30,
  maximumBytes: 10 * 1024 * 1024,
  mimeTypes: ["image/jpeg", "image/png", "image/webp"] as readonly string[],
  temporary: true,
});

export interface ReviewImageView {
  file_id: string;
  position: number;
  /** Relative API path, not an object-store URL or a persisted signed grant. */
  content_path: string;
}
