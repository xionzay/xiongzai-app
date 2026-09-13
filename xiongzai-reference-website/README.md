# 最新修正：持续动效与品牌细节

首页：http://127.0.0.1:3030/ · 公司介绍：http://127.0.0.1:3030/about.html

本轮新增公司介绍页、品牌旗帜与罐装水，修复轨道，下载仅在底部。详见 [修改记录与限制](docs/motion-brand-report.md)。

# 熊崽官网 · 参考图修正版

独立项目，本地预览 http://127.0.0.1:3030/ 。未发布，未修改旧官网。

## 运行

```sh
python3 -m http.server 3030 --bind 127.0.0.1 --directory dist
```

完整静态网站在 `dist/`，无需安装或构建。GSAP、字体和图片本地提供。

## 本次修正

修复首屏斜坐熊崽与长站台、圆润鲸鱼、列车及路牌；重做九张独立场景插画、关于睡熊与宇宙横幅。恢复品牌短句、五角星、盾牌标记、人群图标及装饰文字。底部使用用户原始 613×211 列车 JPG，显示不超过原始宽度。保留九卡横排、场景弹层、邮箱操作、原生滚动及轻柔 GSAP 环境动画。

**主要插画、字体与图标仍为近似还原，不能称为像素完全一致。列车保持停站，没有实现沿弯轨的三维行驶。** 右上及品牌栏浮岛独立运动，部分远景仍属于合成环境图。详细差异和交付记录见 `docs/fidelity-repair-report.md`。

不包含视频、播放控件、第三方社交 Logo、未核实运营数字或捏造的新闻日期。邮箱为 `postmaster@xionzay.com`。

## 核对和验证

- `qa/fidelity-repair/reference-comparison.png`：1024px 同宽对照。
- `qa/fidelity-repair/current-*.png`：修正后网页截图。
- `qa/fidelity-repair/results.json`：八个场景及其他交互、五种宽度、动态暂停与减少动态检查。
- `qa/fidelity-repair/final-review.json`：文字裁切、横向溢出、原图显示尺寸检查。
- `qa/fidelity-repair/performance.json`：本机浏览器滚动和帧采样结果。

之前版本的检查保留在 `qa/`，本次结果以 `qa/fidelity-repair/` 为准。

## 素材

`docs/fidelity-assets.json` 记录最终素材。`output/fidelity-repair/prompts.json` 保留内置 image_gen 修复提示词和来源；生成原图存放同目录。使用的最终图层已检查透明通道，失败的棋盘格中间稿未接入页面。原软件 Logo 未重绘。

源码为 `dist/index.html`、`dist/styles.css`、`dist/fidelity.css`、`dist/app.js`。修改前版本在 `qa/fidelity-repair/before-dist/`。
