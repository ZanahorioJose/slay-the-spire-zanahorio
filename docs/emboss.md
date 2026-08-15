# 卡牌表面工艺方案 · 浮雕与全息（Emboss & Holo Foil）

> 调研日期：2026-08-14 · 本项目美术讨论的内容沉淀
>
> 目标：卡牌表面的两类工艺——浮雕立体感（纹路 / 图形突起）
> 与全息闪卡光效（镀膜 / 扫光 / 星星），以及它们的实现路线与踩坑记录。
> 对应演示页：`docs/art-card-studio.html`（卡牌美术工作台：材质 / 动画 / 布局 一体）。

---

## 1. 结论速览

前人已经用纯 CSS / SVG 做过浮雕卡牌，主流有三条路线。
它们不是互斥的，实际项目里经常组合使用：

| 路线 | 原理 | 立体真实度 | 性能 | 浏览器兼容 | 适合场景 |
| --- | --- | --- | --- | --- | --- |
| 一 · 阴影浮雕 | box-shadow / text-shadow 双层光影 | 中（整块/文字效果好） | 极好 | 全浏览器 | 卡面文字、按钮、边框凸起 |
| 二 · SVG 光照滤镜 | feDiffuseLighting / feSpecularLighting，alpha 通道当凹凸贴图 | 高（任意图形真突起） | 一般（滤镜重绘） | Chromium 好，Firefox 与 3D 组合有限 | 卡面图形、纹路、logo 打光 |
| 三 · 叠层混合 | 多层渐变/纹理 + mix-blend-mode 模拟镀膜光泽 | 中高（光泽感强，无真实凸起） | 较好（transform/opacity 走 GPU） | 全浏览器 | 闪卡 / 全息卡 / 烫金 |

---

## 2. 路线一：box-shadow / text-shadow 光影浮雕

### 原理

「受光面亮、背光面暗」：

- 凸起：左上用亮色阴影模拟受光，右下用暗色阴影模拟背光（外阴影）。
- 凹陷：方向反过来，并且用 `inset` 让阴影发生在元素内部。
- 文字浮雕：用两层 `text-shadow`，一明一暗。

### 具体做法

```css
/* 凸起（外阴影） */
.emboss-raised {
  background: #e8e8e8;
  box-shadow:
    -4px -4px 8px rgba(255, 255, 255, 0.9),   /* 左上亮：受光 */
    4px 4px 8px rgba(0, 0, 0, 0.25);           /* 右下暗：背光 */
}

/* 凹陷（内阴影） */
.emboss-pressed {
  background: #e8e8e8;
  box-shadow:
    inset 4px 4px 8px rgba(0, 0, 0, 0.25),
    inset -4px -4px 8px rgba(255, 255, 255, 0.9);
}

/* 文字浮雕 */
.emboss-text {
  color: #8a8a8a;
  text-shadow:
    1px 1px 1px #ffffff,
    -1px -1px 1px rgba(0, 0, 0, 0.4);
}
```

调整要点：

- 阴影偏移量（`4px`）控制「鼓起来」的高度。
- 模糊半径（`8px`）控制立体感的软硬，越小越锐利。
- 光源方向通常固定为左上，全卡保持一致才真实。
- 多个 `box-shadow` 叠加可以模拟多个光源或更深的层次。

### 参考案例

- CodePen · [Emboss neumorphic styles card](https://codepen.io/Chocksy/pen/MWYLEeg)
  （拟态浮雕卡片，软阴影典型写法）
- CodePen · [Credit Card](https://codepen.io/Manoj-EU/pen/myEVzaP)
  （信用卡卡号 / logo 用阴影压印 + 表面高光层）
- CodePen · [Notched Border + Emboss](https://codepen.io/bluesatin/pen/yLvaaZw)
  （缺口边框 + 浮雕文字组合）
- 博客园 · [使用 css 实现浮雕效果](https://www.cnblogs.com/ai888/p/18601526)
  （凸起 / 凹陷 / 文字 / 多阴影的完整讲解）
- 掘金 · [使用 css 实现浮雕效果](https://juejin.cn/post/7369483819864670242)
  （box-shadow + 边框颜色组合法）

### 局限

- 只适合「整块元素」或「文字」。
- 伪元素只有 `::before` / `::after` 两个，复杂图形纹路要拆很多层才能拼。
- 阴影是平面的「明暗欺骗」，换个角度看没有变化。

---

## 3. 路线二：SVG feDiffuseLighting / feSpecularLighting 凹凸贴图

### 原理

这是真正意义上「图形突起」的方案。

MDN 官方原文：

> 滤镜光照一个图像，使用 alpha 通道作为隆起映射。
> 结果图像是一个 RGBA 不透明图像，取决于光的颜色、光的位置
> 以及输入隆起映射的表面几何形状。

一句话：你给任意一个 alpha 图形（SVG 路径、文字、图片的透明通道），
滤镜就能按光源方向自动算出受光面与背光面，等价于前端的凹凸贴图（bump map）。

### 具体做法

先在页面里定义一个滤镜（隐藏的 SVG）：

```html
<svg width="0" height="0" style="position:absolute">
  <filter id="emboss">
    <!-- 先模糊 alpha 通道，让打光有平滑的过渡 -->
    <feGaussianBlur in="SourceAlpha" stdDeviation="1.5" result="blur"/>

    <!-- 镜面反射光照：alpha 作为隆起表面 -->
    <feSpecularLighting
        in="blur"
        surfaceScale="6"
        specularConstant="0.9"
        specularExponent="18"
        lighting-color="#ffffff"
        result="specOut">
      <fePointLight x="150" y="60" z="200"/>
    </feSpecularLighting>

    <!-- 只保留图形范围内的光 -->
    <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specIn"/>

    <!-- 原图形 + 光，arithmetic 叠加 -->
    <feComposite
        in="SourceGraphic"
        in2="specIn"
        operator="arithmetic"
        k1="0" k2="1" k3="1" k4="0"/>
  </filter>
</svg>
```

然后应用到任意 HTML / SVG 元素上：

```css
.card-emboss {
  filter: url(#emboss);
}
```

### 参数速查

| 参数 | 作用 | 常用范围 |
| --- | --- | --- |
| `surfaceScale` | 表面起伏高度 | 2 ~ 10，越大越「鼓」 |
| `specularExponent` | 高光锐度 | 8 ~ 30，越小越柔和、越大越像金属 |
| `specularConstant` | 高光强度 | 0.5 ~ 1.5 |
| `lighting-color` | 光源颜色 | 白 / 暖白 / 冷白 |
| 光源元素 | 光从哪来 | `fePointLight`（点光）、`feDistantLight`（平行光）、`feSpotLight`（聚光） |

### 与纹理叠加

MDN 提到：光映射可以与纹理图用 `feComposite` 的 arithmetic 操作组合；
在贴纹理之前叠加多个光映射，可以模拟多个光源。

```svg
<filter id="emboss-with-texture">
  <!-- 打光结果 -->
  <feDiffuseLighting in="SourceAlpha" surfaceScale="5" diffuseConstant="1">
    <feDistantLight azimuth="225" elevation="45"/>
  </feDiffuseLighting>

  <!-- 与纹理图做 arithmetic 合成 -->
  <feComposite
      in="texture"
      in2="SourceAlpha"
      operator="arithmetic"
      k1="0.6" k2="0.4" k3="0" k4="0"/>
</filter>
```

### 浏览器兼容坑（必须实测）

- Chromium（Chrome / Edge）对 HTML 元素应用 SVG filter 支持良好。
- Firefox 上 `filter` 与 `transform-style: preserve-3d` 组合有限制，
  滤镜可能破坏 3D 上下文。
- 建议提供降级：检测滤镜不生效时退回路线一的阴影浮雕。
- 滤镜属于重绘型开销，批量卡牌动画时谨慎使用，
  只给主卡 / 悬停态开。

### 参考

- MDN · [feDiffuseLighting](https://developer.mozilla.org/zh-CN/docs/Web/SVG/Reference/Element/feDiffuseLighting)
  （2025-03 更新，含光源示例与相关滤镜索引）
- 掘金 · [踏足 SVG · 滤镜篇（三）：光照效果](https://juejin.cn/post/7132306133162655781)
  （feDiffuseLighting / feSpecularLighting / fePointLight 系列讲解）
- MDN · [feSpecularLighting](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feSpecularLighting)

---

## 4. 路线三：多层纹理 + 混合模式（闪卡 / 全息伪立体）

### 原理

不做真实凸起，而是叠很多「素材层」：

1. 卡面底图 / 印刷层
2. 动态黑白渐变层（位置跟随鼠标，模拟反光带）
3. 彩虹 / 全息渐变层（模拟镀膜）
4. 星星闪烁层（sparkles）
5. 眩光高光层（glare）

每层用 `mix-blend-mode`（`color-dodge` / `screen` / `overlay`）混合，
让光泽随鼠标移动变化，看起来像卡面有起伏的膜。

### 具体做法（来自 SegmentFault iCSS 文章）

核心是「鼠标 X 位置写入 CSS 变量 `--per`，渐变跟着走」：

```css
.holo-card {
  --per: 30%;
  position: relative;
}

.holo-card::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    115deg,
    transparent 0%,
    rgba(255, 255, 255, 0.7) var(--per),
    rgba(0, 0, 0, 0.6) calc(var(--per) + 25%),
    rgba(255, 255, 255, 0.5) calc(var(--per) + 50%),
    transparent 100%
  );
  mix-blend-mode: color-dodge;
}
```

```js
card.addEventListener("mousemove", (e) => {
  const box = card.getBoundingClientRect();
  const per = ((e.clientX - box.left) / box.width) * 100;
  card.style.setProperty("--per", per + "%");
});
```

星星闪烁层（文章原版用 GIF）：

```css
.holo-card::after {
  content: "";
  position: absolute;
  inset: 0;
  background: url("sparkles.gif");   /* 或自己生成 CSS 星星点阵 */
  mix-blend-mode: color-dodge;
}
```

换不同的渐变与混合模式，就能排列组合出不同风格的卡：

- `color-dodge`：强反光、亮部发光
- `screen`：柔和提亮
- `overlay` / `soft-light`：保留底色纹理的光泽
- conic 彩虹渐变：全息膜
- repeating 渐变：拉丝 / 烫金纹

### 参考

- SegmentFault · [【动画进阶】神奇的 3D 卡片反光闪烁动效（iCSS）](https://segmentfault.com/a/1190000044576516)
  （本次学习源头：--per 动态高光 + color-dodge + sparkles）
- CodePen · [Pokemon Card Holo Effect](https://codepen.io/simeydotme/pen/PrQKgo)
  （闪卡界标杆：彩虹渐变 + sparkles + 3D 倾斜）
- HelloGitHub · [simeydotme/pokemon-cards-css 介绍](https://hellogithub.com/repository/e7da4ba131e447bca5d54666d2e0c53d)
  （眩光 / 纹理 / 银河全息 / 垂直光束等效果合集）

> 备注：GitHub 仓库本身在本次调研网络下直连超时，未能读取源码，
> 以上为第三方摘要信息。

> **补充（2026-08-14 复核成功）**：仓库为 **simeydotme/pokemon-cards-css**
> （约 5.4k stars，纯 CSS + SvelteJS 演示工程），用 CSS Transforms / Gradients /
> Blend-modes / Filters 模拟宝可梦「剑盾」世代卡牌的多种 Holofoil 工艺；
> 在线 Demo：https://poke-holo.simey.me/（另有 151 全图鉴版 https://poke-151.simey.me/）。
> 作者另发布了可直接复用的 3D 倾斜组件 **simeydotme/hover-tilt**，
> 效果被 css-tricks.com 收录（Holographic Trading Card Effect）。
> 技法要点：多层渐变 + 混合模式 + 跟随鼠标的光斑/扫光（与本文路线三一致）；
> 星星层素材来自 aschefield101 的 HoloSheet。本项目 v3 已本地化其 sparkles.gif。

### 局限

- 没有真实凸起，属于「光影欺骗」，换角度立体感来自鼠标视差。
- 层数多时注意 GPU 开销，手牌常态建议只保留 1~2 层。

---

## 5. 辅助手段

- `feTurbulence`：生成噪点 / 波纹 / 云纹，做卡面质感底。
- `repeating-linear-gradient`：拉丝、编织、网格纹理（v2 已用）。
- `filter: drop-shadow()`：给不规则的图形（像素画、SVG 路径）投影，
  比 box-shadow 更贴合图形轮廓。
- `border-image` / 渐变边框：做「金属压边」的边框凸起感。

---

## 6. 本项目实现记录（全息 + 浮雕）

v3 闪卡全息实验室已完成使命并归档（2026-08-14），技法沉淀到本文与
`docs/art-card-studio.html`（卡牌美术工作台，含「宝可梦全息」材质）：
全息闪卡（全息膜 / 动态扫光 / 星星闪烁 / 塑料光泽）+ 四类浮雕，浮雕可与全息叠加。

### 6.1 四类浮雕与实现要点

**① 阴影浮雕（bevel）—— 路线一**

- 只有<b>图形与框框</b>参与：费用球、类型宝石凸起，画框框沿凸起。
- 文字（卡名、描述）保持平面，不做 text-shadow 浮雕。
- 凸起规则（光源统一左上）：
  左上受光亮边 + 右下背光暗边 + 下方投影（鼓出感）。
- 深度由 CSS 变量 `--emboss-depth` 控制，滑杆实时调。

```css
.emboss-bevel .cost {
  box-shadow:
    inset 1px 1px 2px rgba(255, 255, 255, 0.55),   /* 内左上亮 */
    inset -1px -1px 3px rgba(0, 0, 0, 0.5),        /* 内右下暗 */
    1px 2px 3px rgba(0, 0, 0, 0.6);                /* 外右下投影 */
}
.emboss-bevel .art-window {
  box-shadow:
    -1px -1px 2px rgba(255, 255, 255, 0.25),       /* 框沿外亮 */
    1px 2px 4px rgba(0, 0, 0, 0.55),               /* 框沿外暗投影 */
    0 0 0 3px rgba(0, 0, 0, 0.45),                 /* 描边 */
    inset 0 3px 14px rgba(0, 0, 0, 0.8);           /* 窗内保持凹槽 */
}
```

**② 素材浮雕（art）—— 路线二，图形真突起**

- SVG `feSpecularLighting` + `fePointLight`，应用在画框内
  `.art-window canvas / img` 上。
- 像素画 16×16 先整数倍预放大到 128×128（block=8）再打光，
  alpha 通道即凹凸贴图，边缘不会被重采样糊掉。
- 光源坐标由 JS 跟随鼠标：
  `x = 30 + lx * 1.2`、`y = 20 + ly * 1.1`（相对画框内素材）。
- `surfaceScale` 随「浮雕深度」滑杆动态更新。

```html
<filter id="emboss-art" color-interpolation-filters="sRGB">
  <feGaussianBlur in="SourceAlpha" stdDeviation="1.2" result="blur"/>
  <feSpecularLighting in="blur" surfaceScale="6" specularConstant="0.85"
      specularExponent="14" lighting-color="#ffffff" result="specOut">
    <fePointLight x="90" y="40" z="160"/>
  </feSpecularLighting>
  <feComposite in="specOut" in2="SourceAlpha" operator="in" result="specIn"/>
  <feComposite in="SourceGraphic" in2="specIn"
      operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>
</filter>
```

**③ 烫金浮雕（gold）—— 金色只作用于框框与图形**

- 卡面边框渐变金化、画框角饰金色、稀有度宝石点亮。
- 卡名文字保持平面（不做金字渐变 / 阴影浮雕）。

**④ 卡纸压纹（grain）—— 路线二应用在整卡面**

- `feTurbulence(fractalNoise)` 生成噪点 → `feDiffuseLighting`（平行光）
  → `feComposite` arithmetic 叠加到 `.face`，整卡面细腻颗粒，
  模拟卡纸 / 皮革压花。

```html
<filter id="emboss-grain" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.5 0.62"
      numOctaves="2" seed="11" result="noise"/>
  <feDiffuseLighting in="noise" surfaceScale="2" diffuseConstant="1.05"
      lighting-color="#ffffff" result="grainLight">
    <feDistantLight azimuth="225" elevation="55"/>
  </feDiffuseLighting>
  <feComposite in="SourceGraphic" in2="grainLight"
      operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>
</filter>
```

### 6.2 踩坑记录（重要）

1. **inset 方向写反 = 凸起变凹陷**：
   `inset` 正偏移的阴影出现在元素左上区域（偏移的反方向），负偏移在右下。
   最初写成 `inset +1 +1 暗色 + inset -1 -1 亮色`，视觉上是
   左上暗 + 右下亮 = 凹陷。凸起必须反过来：左上亮、右下暗。
2. **亮边强度不足**：
   深色卡面上白色亮边透明度 0.16 几乎不可见，只剩右下黑影，
   人眼会把「只有暗边」判读成刻进去的凹陷。受光边至少 0.4+。
3. **凸凹语义要统一**：
   真实卡牌是「该凸的凸、该凹的凹」——铭牌类（卡名 / 费用 / 宝石）凸起，
   画框 / 描述区作为「嵌印凹窗」保留内凹阴影，不要全卡统一凸起。
4. **文字不参与浮雕**：
   卡名 / 描述做 text-shadow 浮雕在深色底上容易脏、显假；
   产品决策为文字保持平面，只让图形与框框浮雕。
5. **SVG filter 与 3D**：
   滤镜挂在卡面内部元素（`.face`、画框内素材）上，
   不要挂在 `preserve-3d` 容器（`.card3d`）上；
   Firefox 与 3D 组合需实测，准备降级。
6. **性能**：
   `feSpecularLighting` 每帧跟随鼠标会触发重绘，
   只给主卡展示 / 悬停态开；手牌常态建议只用 bevel（纯阴影）。

### 6.3 验证情况（2026-08-14）

- JS 语法：`node --check` 通过。
- Edge 无头 DOM 验证：5 个浮雕按钮、2 个 SVG filter、
  9 张预设卡 + 6 张风格参考卡均正常渲染。
- 截图对比：默认 / 素材浮雕 / 卡纸压纹 / 阴影浮雕（修复前 vs 修复后）/
  烫金浮雕（修复前 vs 修复后）/ 文字平面版。

### 6.4 产品决策摘要（唯一权威）

- 3D 只做"整卡旋转 + 图案随鼠标视角"，膜层贴死卡面；卡图不做每帧独立位移、
  不加 `will-change: transform`，像素画先整数倍预放大再显示
- 手牌常态只开 bevel / gold（纯阴影，零滤镜）；悬停 / 大图才开 art / grain（SVG 滤镜）
- 异画卡亮底的全息混合用 `overlay`，普通卡用 `color-dodge`
- 文字（卡名 / 描述）保持平面不参与浮雕；该凸的凸（费用 / 宝石 / 框沿）、
  该凹的凹（描述面板）

### 6.5 全息参数工作台（docs/art-card-studio.html · 唯一权威）

宝可梦全息的全部可调参数以 studio 为准，本文只记录决策与踩坑，不重复参数清单。

- **12 套风格预设**（7 套宝可梦实卡风格 + 5 套自定），与第 7 节
  `CardData.foil` 字段一一对应：
  - 宝可梦实卡：rainbow（Rare Holo）/ cosmos（Cosmos）/ reverse（Reverse，
    膜在边框、画面保持印刷）/ radiant（Radiant，亮银 + 45° 网格）/
    amazing（Amazing Rare，saturation 混合柔彩虹）/ gold（Secret Rare 金）/
    shiny（Shiny，横彩虹）
  - 自定：sunset / aurora / neon / oil / galaxy
  - 预设 = 6 色平滑彩虹（repeating-linear-gradient，颜色自然过渡无硬边）+
    条纹角度 / 彩虹周期 + 视差强度 + 饱和 / 亮度 / 对比度 + 星星大小 / 密度 +
    可选网格纹理（--holo-mesh）与副膜混合模式（--holo-sub-mix）+
    区域强度（--art-film / --frame-film，reverse 用），点按即整套切换。
- **分组折叠控制**：总开关 / 风格预设 / 全息膜 / 光斑·扫光 / 星星光点 / 塑料光泽·3D，
  每个滑杆实时显示当前值，可一键重置全息参数。
- **参数清单以 studio 页面为准**（膜厚度 / 条纹角度 / 彩虹周期 / 视差 / 饱和 /
  亮度 / 对比度 / 模糊 / 混合模式、光斑强度与大小、扫光强度 / 角度 / 模糊 /
  带宽 / 频率 / 速度、
  星星强度 / 大小 / 密度 / 闪烁速度、塑料光泽、3D 倾斜幅度 / 自动旋转速度）。
- **膜的运动模型（2026-08-15 源码核对，唯一正确做法）**：对照
  `simeydotme/pokemon-cards-css` 源码（cosmos-holo.css / regular-holo.css /
  Card.svelte）确认——真实闪卡膜 = **固定斜条纹箔纸 + 鼠标驱动的
  background-position 视差**：
  - 膜图案用 `repeating-linear-gradient`（82°~110° 斜条纹），
    颜色间**平滑插值（无硬边）**，避免硬边界色条产生"线条感"；
    `background-size` 由 `--holo-period` 控制（周期越大越平滑）；
  - 主膜层 `background-position` 随鼠标映射值（37~63 / 33~67）以 2.6~3.5 倍率滑动，
    副膜层（::before）以约 0.6 倍率错层 → 前后分层产生箔纸深度；
  - 眩光层（glare）是 `radial-gradient` 跟随鼠标，`overlay` 混合，
    亮度随「离卡中心距离」变化（越靠边缘反光越强）；
  - **图案本身不旋转、不漂移**——"光在动"全部由 background-position 承担。
- **区域化膜（2026-08-15 修复，普通卡）**：宝可梦卡是全幅画所以膜铺满整卡；
  本项目的普通卡是「小画窗 + 深色 UI 边框」，膜铺满会变成彩虹条码盖住卡名。
  因此普通卡按区域分层（mask 控制）：**画面区膜满强度（--art-film=1），
  边框只留轻镀膜（--frame-film≈0.22），扫光与星星保持整卡**；
  异画卡（满版绘画）仍整卡铺满。两个强度都是滑杆可调。

踩坑记录（2026-08-14/15 修正，迁移到游戏时注意）：

1. 膜运动**不要用 transform / translate 动画**（旋转会变风车、平移是错误理解），
   一律用 `background-position` + CSS 变量驱动；`--holo-angle` 是条纹角度，
   不是动画起点。
2. 鼠标值直接喂给视差会滑过头：先映射到 37~63 / 33~67（repo 的
   `--background-x/y` spring 范围）再乘 2.6 倍率。
3. 星星密度用 `background-size` 平铺实现（`--sparkle-tile`），
   一个 tile 内 8 个 radial-gradient 点位即可循环出整片星场，不必手写几十个点位。
4. 异画卡自动切 overlay 的选择器要写成
   `body:not(.mix-manual).alt-mode .foil-on .holo-film`
   —— `alt-mode` 在 body、`foil-on` 在卡面元素，二者不在同一元素上；
   控制台手动选了混合模式时加 `body.mix-manual` 以手动为准。
5. range 滑杆的 `step` 会把默认值吸附到步长网格：如 `step="0.05"` 时
   `value="0.22"` 会被吸附成 `0.2`；需要精确小数时用 `step="0.01"`。
6. 全息膜**不要用硬边界色条**（`c1 0 4%, c2 4% 8%`）：
   实心色带边缘锐利，视觉上是强烈的线条感；repo 的 regular-holo 用
   平滑插值渐变（纯色列表），cosmos 之所以可以硬边是因为叠了
   cosmos 纹理图（color-burn/multiply）打散边缘。

---

## 7. 迁移到游戏项目（下一步）

目标文件：

- `src/ui/cardView.ts` —— 卡面结构对齐 v3（face + holo 层 + 浮雕类）
- `src/styles.css` —— 移植材质变量、全息层、浮雕类
- `src/core/types.ts` —— `CardData` 增加可选字段：
  `foil?: "rainbow" | "cosmos" | "reverse" | "radiant" | "amazing" | "gold" |
  "shiny" | "sunset" | "aurora" | "neon" | "oil" | "galaxy"`、
  `emboss?: "bevel" | "art" | "gold" | "grain" | null`
- SVG defs 放 `index.html` 或由 `main.ts` 注入

建议：

1. 手牌常态：只开 bevel / gold（纯阴影，零滤镜开销）。
2. 悬停 / 查看大图：才开 art / grain（SVG 滤镜）。
3. 兼容降级：检测 `SVGFEDiffuseLightingElement in window`，
   不支持时 art / grain 自动回落 bevel。
4. 编辑器（editorView.ts）：闪卡风格 + 浮雕模式做成下拉选项，
   实时预览复用本页逻辑；全息风格下拉选项与 studio 的 6 套预设保持一致。
5. 全息 CSS 变量按 studio 的命名搬运（`--holo-*` / `--spot-*` / `--gloss-*` /
   `--sparkle-*` / `--shine-*`），studio 是全息参数的唯一调试入口。

打包清单（2026-08-14 精简后）：

- `docs/art-card-studio.html`（卡牌美术工作台：材质 / 动画 / 布局 一体）
- `docs/emboss.md`（本文档）
- `assets/ui/sparkles.gif`（星星闪烁本地素材）

---

## 8. 参考来源清单

| 来源 | 链接 | 说明 |
| --- | --- | --- |
| MDN · feDiffuseLighting | https://developer.mozilla.org/zh-CN/docs/Web/SVG/Reference/Element/feDiffuseLighting | 凹凸贴图原理（一手文档） |
| SegmentFault · 3D 卡片反光闪烁（iCSS） | https://segmentfault.com/a/1190000044576516 | 闪卡叠层完整教程 |
| CodePen · Emboss neumorphic styles card | https://codepen.io/Chocksy/pen/MWYLEeg | 拟态浮雕卡片 |
| CodePen · Credit Card | https://codepen.io/Manoj-EU/pen/myEVzaP | 浮雕信用卡 |
| CodePen · Notched Border + Emboss | https://codepen.io/bluesatin/pen/yLvaaZw | 边框 + 浮雕 |
| CodePen · Pokemon Card Holo Effect | https://codepen.io/simeydotme/pen/PrQKgo | 全息闪卡标杆 |
| 博客园 · 使用 css 实现浮雕效果 | https://www.cnblogs.com/ai888/p/18601526 | 阴影浮雕全解 |
| 掘金 · 使用 css 实现浮雕效果 | https://juejin.cn/post/7369483819864670242 | box-shadow + 边框法 |
| 掘金 · SVG 滤镜篇（三） | https://juejin.cn/post/7132306133162655781 | SVG 光照滤镜讲解 |
| HelloGitHub · pokemon-cards-css | https://hellogithub.com/repository/e7da4ba131e447bca5d54666d2e0c53d | 卡牌 CSS 效果合集摘要 |
| GitHub · simeydotme/pokemon-cards-css | https://github.com/simeydotme/pokemon-cards-css | 闪卡效果合集源码（约 5.4k stars，Sword & Shield 全息工艺，Demo: poke-holo.simey.me） |

---

> 下一步：按第 7 节把闪卡 + 浮雕接入 `src/ui/cardView.ts` /
> `src/styles.css` / `src/core/types.ts`，并在编辑器里加配置项。
