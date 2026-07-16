# FitProof 会话状态交接（给下一个窗口的主AI）

> 本文件让新窗口无缝接手。**先读 `docs/HANDOFF_主AI交接.md`(角色+方法)和本文件,再动手。** 比赛日 2026-07-20。
> 分支:**redesign**(所有工作都在这)。

---

## 一、你的角色(不变,细节见 HANDOFF_主AI交接.md)
**总工程师/架构师**:出方案+任务提示词给"程序员AI(Codex)"和"资源AI",**亲自验收(验证而非轻信)**,不写产品主代码(前端组件、backend/main.py 分析逻辑),小工具(ingest/fetch 脚本)可直接改。用户是非程序员产品负责人,做产品判断。

## 二、⚠️ 本会话踩出来的操作坑(务必照做,否则重蹈)
1. **Codex 一开浏览器就崩** —— 根因是它自己浏览器预览的 Statsig 埋点 "response too large" bug,**和代码无关**。**每个给 Codex 的提示词最顶部必须加**:
   > ⛔ 硬性约束:全程严禁启动 dev server / 打开浏览器 / 任何 preview 工具。只允许改代码 + `npx tsc --noEmit`。浏览器验收由主工程师做。违反即失败。
2. **浏览器截图工具(computer screenshot)频繁 30s 超时** —— 别依赖它。验收前端用 `mcp__Claude_Browser__navigate` + `javascript_tool`(读计算样式/点按钮)+ `get_page_text`(读文本)。同步点击后要"等一下再读"(React 重渲染晚于同步读)。
3. **Windows 控制台是 GBK** —— Python 脚本打印中文/emoji 前要 `sys.stdout.reconfigure(encoding="utf-8")`;给用户用 Excel 打开的 CSV 要存 `utf-8-sig`(带BOM),否则中文乱码。
4. **dev server 首次编译 ~35s**,navigate 可能要重试几次;`until curl ... 200` 等就绪。
5. **起后端**:`.claude/launch.json`(本地文件、已 gitignore)已加 `name:"backend"`(port 8000, cwd backend),可 `preview_start {name:"backend"}`。前端 `preview_start {name:"frontend"}`(3000)。`frontend/.env.local` 已设 `NEXT_PUBLIC_API_URL=http://localhost:8000`。真实分析需后端 `.env` 里 `ASR_PROVIDER=dashscope` + 各密钥有额度。
6. 用户有两台电脑,可能在 B 机(`D:\FitProof\backend`)跑拆条。

## 三、本会话已完成并提交(redesign 分支,验收通过)
**后端画面理解优化(3件)**
- `7d006de` 关键帧闸门:ASR转录判断是否需VL,纯口播跳过省~30s(`should_describe_keyframes`,`ENABLE_KEYFRAME_GATE`)
- `386630d` 全片自适应采样:`keyframe_budget()` 帧预算随时长增长封顶15,中点均匀采样覆盖全片(修长视频后段盲区)
- `2632aff` 交错时间线:`build_media_timeline()` 把画面按时间戳穿插进转录,喂给拆主张/核验

**前端 3.4 三Tab**
- `d5c557a` 底部Tab外壳(核验/社区/我的,`BottomNav`)
- `3a468cd` 我的Tab:`lib/history.ts` localStorage历史 + 求真成就 + 抽出 `VerifyResultCard` 复用卡
- `7422686` 社区Tab:`data/community-samples.json`(真实案例,铁律2不编造)

**单视频重设计=「庭审卡组」(核心成果)** —— 全在 `components/SingleResultPage.tsx`
- `caa3083` ① 骨架+对话气泡对质卡(左"视频说"/右"权威证据库"+依据小卡+判定图章;进页面并行自动核验并发2)
- `6e1f08e` ② 关键帧真图(后端 `_describe_frames_parallel` 存帧图→480px/JPEG55/base64;对质卡按±10s匹配帧贴图)
- `a3e9594` ③a 避坑总结卡(宣判,从verifyStates派生危险条,可截图)
- `6615447` ③b 追问卡(对话形式;**后端新增 `/api/followup_single`**,带已核验证据上下文,诚实边界:超范围声明常识判断、不编造、无关拒答)
- `e5b90af` ④ 加载页收进Tab外壳(修加载时锁死切不了Tab)+ 诚实化(去假100%)
- `b11ed8d` ⑦ 卡01视频卡化(首帧封面播放器,点击跳抖音)+横滑翻卡(删上下张按钮);**新增 `FitProofCat.tsx` SVG小猫组件**(5姿势+CSS动画)+ `/cat-preview` 预览页

**数据工具(小工具,主工程师直接写的)**
- `e3273bc` `backend/fetch_sources.py`:读汇总xlsx→下载直链PDF到隔离区raw-codex→生成待核验 registry_new.csv(只读registry.csv续id+去重,不碰它)
- `f86b485`+`0f3d92a` `backend/fetch_web_pdf.py`:无头Chromium把网页清单渲染成PDF,**识破Cloudflare反爬/空壳页**(内容特征+正文长度,防误报成功污染库)
- `6303780` 修复:分享文案脏文本提取链接(前端`findDouyinLink`+后端`resolve_url`正则)+ 连接失败友好中文提示(`lib/api.ts`)

## 四、⚠️ 当前工作区未提交/进行中(接手第一件事:先搞清这些)
**未提交的前端改动(⑧⑨⑩,Codex已做我在诊断中还没提交)**:
- `SingleResultPage.tsx`(M)、`CourtCardShell.tsx`(新增,未跟踪)、`LoadingPage.tsx`(M)、`globals.css`(M)
- 内容:⑧卡01内部打磨(FitProofCat当头像/信号胶囊/播放器框)、⑨抽出`CourtCardShell`共享外壳(渐变线+玻璃白卡+大阴影+数字水印+AI底注)套所有单视频卡、⑩视觉修正。
- **这些还没验收通过**,见第五节"⑪"——有已知问题待修,修好验收后再一起提交。

**拆条 ingest 似乎已跑过**:`backend/evidence/fulltext/` 冒出大量新txt(ingest产物)。`entries/`(gitignore)状态未知。**主工程师还欠一道"抽验真实性"闸**(见第六节数据线)。`registry.csv.bak-orgfix` 是org归一化前的备份。

## 五、进行中的任务链(单视频视觉精修,正在和Codex迭代)
用户在深度体验单视频页,连续提视觉反馈。**注意:⑧⑨⑩⑪都在改同一个 `SingleResultPage.tsx`,别让多个Codex任务并行改它,会冲突。**

- **任务⑪(已发Codex,待回待验收)**:修3个问题——①布局:单视频`<main>`从`min-h-[100dvh]+pb-24`改成**固定视口`flex h-[calc(100dvh-4rem)] flex-col overflow-hidden`**(参考双视频`ResultPage.tsx:1140`),卡片区`flex-1 min-h-0`+`CourtCardShell` h-full内部滚动,让**一屏装下、Tab固定底部**;②修卡01播放按钮"两个圆重叠"(无封面时占位摄像机小圆[:147]和播放大圆[:158]同时渲染,删占位小圆);③无封面图是数据情况(口播视频无关键帧image),非bug。
- **任务⑫(已和用户讨论定方向,未写提示词)**:卡02「说法全景」太素、可读性差。方向=**案卷清单**:每条=序号徽章+带图标信号胶囊+说法+判定+状态点;危险条左边加红/琥珀色边条(轻重一眼扫);顶部"案情概览"条;严肃庭审感为主、图标为辅(用户倾向严肃不娱乐)。**等⑪落地再写⑫,避免文件冲突。**
- **FitProofCat 小猫**:已提交,但**神态/动画的浏览器视觉验收还没做**(截图工具卡)。用户另开"设计AI"在并行精修小猫。给设计AI的话务必带"只写代码别开浏览器,预览主工程师来看"。

## 六、已拍板的设计决策(接手别推翻/别搞反)
1. **🔴全站视觉标准已反转**:改用双视频那套**渐变线+立体卡+玻璃质感(backdrop-blur)+大阴影**。**旧铁律"禁止渐变/玻璃拟态"作废**。以后Codex提示词写"沿用双视频精致风",别再写"禁止渐变/玻璃"。(待更新 `docs/REDESIGN_PLAN.md`/`CONTEXT_FOR_NEW_AI.md` 里的旧铁律,免下个窗口按旧规矩改素。)
2. **视频播放=跳抖音**,不做软件内播放(抖音CDN防盗链+时效,现场会翻车)。
3. **卡02方向**=严肃庭审案卷清单(见⑫)。
4. 待办小改进:**口播视频没关键帧图**→可让后端返回抖音视频封面图当poster(需后端加字段,未做,不阻塞)。

## 七、数据线状态(用户在推,主工程师负责验收闸)
- `backend/evidence/registry.csv` 已合并到 **297行(id 1-297连续无重复)**,含膳食/减肥/婴幼/癌症/慢病/用药/睡眠/孕产/**WHO营养干预124条**等。**org已归一化**(178行,house style=中文全称(英文缩写),备份`registry.csv.bak-orgfix`)。295/297文件在`raw/`。
- **WHO ELENA批**:124个网页PDF已渲染验证(全真内容),原在`raw-codex/who/`,用户已并入。registry行`deepresearch/registry_who.csv`(id181-304)、Excel版`registry_who_中文修复版.csv`(BOM)。
- **拆条**:`cd backend && python ingest_evidence.py --manifest evidence/registry.csv`(已拆的跳过)。产物=`evidence/entries/`(结论)+`fulltext/`(全文块)。若在B机跑,**拷回 entries/ + fulltext/ 到A机**即可(向量`cache/*.npz`有指纹校验会自动重建,不用拷不用删)。
- **⚠️ 主工程师欠的闸(拆完必做)**:抽几条新证据核对①拆出结论ID真对应原文②机构/页码没错位③没编造;再拿膳食/婴幼/WHO话题真实跑一次核验,确认新证据被检索命中、核验卡能引用。

## 八、剩余大项 & 建议优先级(离比赛日很近,风险已转移到"演示交付")
产品核验能力已经很强。**最大风险是游园会现场演示流畅度,不是功能。** 建议:
1. **🔴 预置钩子话题"秒开"**:真实分析30秒~2分钟,摊位排队等不起。复用"用样例数据"离线机制,做2-3个孕产向精选话题,扫码点开秒出庭审卡组。**投入产出比最高。**
2. **🔴 部署上云+防滥用**:游园会扫码线上演示的前提(IP限频/时长上限/并发)。
3. **🔴 演示准备**:录演示视频、三层兜底(线上→本地→录屏)、未见过视频盲测、打stable tag、赛前48h功能冻结只修bug。
4. **🟡 双视频重设计**(用户早说它乱):字段排他规则——分歧只列对立点、误导风险做总裁判纠错(挂证据)、行动建议只给做法,**同一信息只进一个字段**;卡组可沿用对话气泡语言。改`build_analysis_prompt`要重新验证输出质量。
5. **🟡 小猫IP** 融入各场景(加载/空态/成就/降级)。
6. **🟢 技术债**:VL提速(数据类视频8帧~30s,可多帧合并/提并发)、补registry缺文件、口播视频封面。加分:数据飞轮审核页。

## 九、关键文件地图
- 单视频主体:`frontend/components/SingleResultPage.tsx`(庭审卡组,含5种卡+横滑)、`CourtCardShell.tsx`(共享外壳)、`VerifyResultCard.tsx`(复用核验卡)、`FitProofCat.tsx`(小猫)
- 双视频(老,精致风参考,别乱动它的命令式拖拽):`ResultPage.tsx`
- 前端状态机:`app/page.tsx`(input/loading/result/refs/singleClaims + activeTab三Tab)
- 后端核心:`backend/main.py`(提取管线extract_one_video、闸门、采样、交错时间线、`/api/analyze_single`、`/api/verify_claim`、`/api/followup_single`)、`evidence_store.py`(RAG检索+向量缓存指纹)、`ingest_evidence.py`(拆条)
- 数据工具:`fetch_sources.py`、`fetch_web_pdf.py`
- 提交约定:验收通过才commit;commit信息结尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`;push/部署/删除前先问用户。

---
**接手第一步**:跑 `git status` + `git log --oneline -8` 对齐;确认⑪是否已被Codex改完(看`SingleResultPage.tsx`布局是否已改固定视口);起前端手机尺寸验收⑧⑨⑩⑪(用js计算样式,别依赖截图);通过就提交。然后按用户当前节奏继续(大概率还在单视频视觉精修→卡02→之后转部署/预置话题)。
