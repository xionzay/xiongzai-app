# 持续动效实现与验证

预览：http://127.0.0.1:3030/?revision=living-world#home

设计提示词见 living-world-brief.md。实现文件为 dist/living-world.js 与 dist/living-world.css；首页和独立公司页共同加载。之前版本备份在 backups/before-living-world/。

## 实现

- 时间驱动的鲸鱼闭合巡游轨迹、旗面摇摆、浮岛漂浮、熊崽呼吸、泡泡上升。
- 首页、场景区、关于我们、宇宙横幅、下载区、公司页及页脚的循环云层；星光粒子与错峰流星；九张场景卡片和动态弹窗。
- 原始列车使用 SVG 轮廓拆层，在重新补齐的轨道底图上透视前进，以云雾衔接循环。属于二维分层动效，不是三维物理仿真；轨道与站台固定。
- 办公原图通过 WebGL 局部连续变形，让熊崽、小猫和手部以不同节奏轻动；电脑标志以 SVG 叠加，保持固定位置。WebGL 不可用时保留静态原图与苹果标志。
- 顶部导航轻抬、光底、直线下划线展开，下载按钮增加浅蓝苹果与绿色安卓图标。
- 全站暂停、系统减少动态效果、离屏暂停、页面隐藏暂停、弹窗背景暂停。移除旧的微动初始化及不再需要的 GSAP 加载，防止多套动画竞争。

## 检查

qa/living-world/results.json：1440 / 390 像素视口，无页面脚本错误、无横向溢出；鲸鱼静置运动、列车变换、公司动画、下载弹窗、暂停和减少动态效果通过。

qa/living-world/interaction-results.json：悬停下划线、宇宙云层、公司动画时钟、暂停、弹窗左右键与 Esc、320 像素手机菜单通过。当前本机 Chrome 无头测试办公场景 90 帧平均帧间隔约 16.54ms，95 分位约 16.8ms；不代表所有设备的性能保证。

## 图像生成记录

使用内置 image_gen 进行一次背景补绘。输入：dist/assets/station-sign-removed.webp。最终资产：dist/assets/station-empty-motion.png。原车身、品牌熊崽与旗帜继续使用现有素材。

完整补绘提示词：

```text
Precise object removal / clean background plate for layered website animation. Edit this exact image. Remove ONLY the entire blue passenger train (all cars, wheels, train shadow). Reconstruct the empty two continuous shiny metal rails and sleepers underneath, and the floating-island buildings, sky and cloud scenery formerly hidden by train. Preserve all existing station platform, foreground cream railing, blue safety fence, castles, clouds, perspective, original camera and glossy light exactly in place. No bear, no train, no signs, no text, no new objects. Maintain the original very wide 2003 x 785 aspect ratio and composition. The rails must continue smoothly from the distant bend around x=1100,y=490 diagonally toward the bottom-right x=2003,y=775. This is a background plate, not a redesigned scene.
```
