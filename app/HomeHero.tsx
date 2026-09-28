/** Reuse approved artwork without regenerating or distorting the mascot.
 * SVG viewports expose only illustration/sky regions, never the page UI.
 * Search, tabs, shortcuts, cards and navigation remain real controls.
 */
const REFERENCE_ART = "/assets/user-theme/home-reference-original.png";

export function HomeSky() {
  return <svg className="home-reference-sky" viewBox="0 0 821 250" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <image href="/assets/user-theme/home-sky-header.png" width="821" height="250" preserveAspectRatio="xMidYMid slice" />
  </svg>;
}

export function HomeHero({ onRules }: { onRules: () => void }) {
  return <section className="play-hero" aria-label="找搭子，一起上分">
    <h1 className="home-art-label">找搭子，一起上分！</h1>
    <svg className="play-hero-reference" viewBox="0 245 821 375" role="img" aria-label="参考图原版蓝黄天空主视觉，白色熊崽穿奶蓝鲨鱼服，手持蓝白游戏手柄">
      <image href={REFERENCE_ART} width="821" height="1916" />
    </svg>
    <button type="button" onClick={onRules} className="play-hero-safety" aria-label="平台内沟通与交易">
      <span className="home-art-label">平台内沟通与交易</span>
    </button>
  </section>;
}
