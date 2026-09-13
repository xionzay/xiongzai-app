# 品牌字样样式统一

只修改独立项目，本地预览；未发布。

已替换：首页主标题、相遇与陪伴短句、首页信念短句、品牌横栏短句、数据横栏短句、关于我们插画旁短句、游戏伙伴短句、宇宙横幅左右短句、底部下一站标题、公司介绍页信念标题，共 11 处。

使用上一轮五组内置 image_gen 字稿，另补齐三组。原 PNG 保存在 dist/assets/lettering-style/，通过浏览器原生 SVG 笔画遮罩和 currentColor 显示；未改写原图片像素，背景不会显示成白色矩形。白色字样（首页、品牌横栏、宇宙）保持白色，蓝色字样继承原位置颜色。品牌名称统一为熊崽。正文与导航不改字体。

本轮备份：backups/before-lettering-style-20260912-231113/。

字稿为参考风格生成，不是可安装字体文件，也非原图逐像素提取。新短句制作模式：内置 image_gen。

## 因为游戏，我们相遇 / 因为陪伴，创造更多可能

源文件：dist/assets/lettering-style/meeting.png

提示词：
Use case: style-transfer. Create a Chinese brand lettering asset using the supplied image ONLY as a handwriting style reference. Match its lively variable brush pressure, tapered strokes, airy legible handwritten character shapes, slightly rightward ascending lines, blue ink, and subtle sweeping underline. Replace the wording with EXACTLY these two lines:
因为游戏，我们相遇
因为陪伴，创造更多可能
Use correctly written simplified Chinese. Uniform PURE WHITE background, blue ink #073789. No checkerboard, no paper grain, no scenery, no panels, no labels, no other words. No extra text from reference. Keep each line intact, no third line. Wide landscape composition, generous clear margins. This is brush calligraphy, not typeset sans-serif.

## 因为相信 / 所以看见

源文件：dist/assets/lettering-style/belief.png

提示词：
Use case: style-transfer. Create a Chinese brand lettering asset using the supplied image ONLY as a handwriting style reference. Match its lively variable brush pressure, tapered strokes, airy legible handwritten character shapes, slightly rightward ascending lines, blue ink, and subtle sweeping underline. Replace the wording with EXACTLY these two lines:
因为相信
所以看见
Use correctly written simplified Chinese. Uniform PURE WHITE background, blue ink #073789. No checkerboard, no paper grain, no scenery, no panels, no labels, no other words. No extra text from reference. Keep each line intact, no third line. Wide landscape composition, generous clear margins. This is brush calligraphy, not typeset sans-serif.

## 下一站， / 遇见新的伙伴

源文件：dist/assets/lettering-style/next-stop.png

提示词：
Use case: style-transfer. Create a Chinese brand lettering asset using the supplied image ONLY as a handwriting style reference. Match its lively variable brush pressure, tapered strokes, airy legible handwritten character shapes, slightly rightward ascending lines, blue ink, and subtle sweeping underline. Replace the wording with EXACTLY these two lines:
下一站，
遇见新的伙伴
Use correctly written simplified Chinese. Uniform PURE WHITE background, blue ink #073789. No checkerboard, no paper grain, no scenery, no panels, no labels, no other words. No extra text from reference. Keep each line intact, no third line. Wide landscape composition, generous clear margins. This is brush calligraphy, not typeset sans-serif.
