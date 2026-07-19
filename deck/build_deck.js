const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.author = "冯晨煜";
pres.title = "从打补丁到 AI Native";

const PAPER = "FFFFFF";
const INK   = "1A1D24";
const MUTE  = "6E7682";
const FAINT = "9AA1AC";
const RULE  = "E2E5EA";
const ACC   = "C0563A";
const WHITE = "FFFFFF";
const WMUTE = "C9CDD4";

const HEAD = "微软雅黑";
const PW = 13.3, PH = 7.5;
const ML = 1.0;
const TOTAL = 7;
const A = "assets/";

function folio(s, n){
  s.addText([
    { text: String(n).padStart(2,"0"), options: { color: INK, bold: true } },
    { text: "  /  " + String(TOTAL).padStart(2,"0"), options: { color: FAINT } },
  ], { x: PW-2.4, y: 0.55, w: 1.5, h: 0.35, align: "right", valign: "middle",
       fontFace: HEAD, fontSize: 12, charSpacing: 1 });
}
function kicker(s, text){
  s.addText(text, { x: ML, y: 0.62, w: 10, h: 0.35, fontFace: HEAD, fontSize: 12.5,
    bold: true, color: ACC, charSpacing: 3 });
}
function rule(s, x, y, w, color){
  s.addShape(pres.shapes.LINE, { x, y, w, h: 0, line: { color: color||RULE, width: 1 } });
}
function notes(s, t){ s.addNotes(t); }
function rightPhoto(s, path){ s.addImage({ path: A + path, x: 6.4, y: 0, w: 6.9, h: PH }); }
function contentHead(s, n, kick, title){
  folio(s, n); kicker(s, kick);
  s.addText(title, { x: ML, y: 1.08, w: 6.7, h: 1.2, fontFace: HEAD, fontSize: 30, bold: true,
    color: INK, lineSpacing: 40 });
}

// ============ 1 · COVER ============
{
  const s = pres.addSlide();
  s.background = { path: A + "cover_dark.jpg" };
  s.addShape(pres.shapes.RECTANGLE, { x: ML, y: 1.4, w: 0.55, h: 0.06, fill: { color: ACC } });
  s.addText("全国创新创业大会  ·  AI OPC  ·  学生代表分享", {
    x: ML, y: 1.75, w: 10, h: 0.4, fontFace: HEAD, fontSize: 13, color: WMUTE, charSpacing: 3 });
  s.addText([
    { text: "从打补丁，到 ", options: { color: WHITE } },
    { text: "AI Native", options: { color: ACC } },
  ], { x: ML-0.04, y: 2.4, w: 11.8, h: 1.4, fontFace: HEAD, fontSize: 56, bold: true });
  s.addText("一支 OPC 团队，真实走过的落地之路", {
    x: ML, y: 3.85, w: 11, h: 0.5, fontFace: HEAD, fontSize: 20, color: WMUTE });
  s.addText([
    { text: "冯晨煜（代表团队）", options: { bold: true, color: WHITE, fontSize: 15 } },
    { text: "    温州医科大学 · 信息管理与信息系统专业", options: { color: WMUTE, fontSize: 13 } },
  ], { x: ML, y: 6.5, w: 11, h: 0.5, fontFace: HEAD, valign: "middle" });
  notes(s, "开场。代表团队。今天只讲两件事：① 从打补丁到 AI Native；② 医学生怎么点醒我们。");
}

// ============ 2 · 讲两件事（总览） ============
{
  const s = pres.addSlide(); s.background = { color: PAPER };
  folio(s, 2); kicker(s, "今天，只讲两件事");
  s.addText("两件事", { x: ML, y: 1.1, w: 11, h: 1.0, fontFace: HEAD, fontSize: 40, bold: true, color: INK });

  const parts = [
    ["其一", "一段技术的较劲", "我们怎么从跟 AI「打补丁」，走到了 AI Native。"],
    ["其二", "一次思路的碰撞", "团队里的医学生，怎么把我们点醒。"],
  ];
  const top = 2.7, rh = 1.95;
  parts.forEach((p,i)=>{
    const y = top + i*rh;
    s.addText(p[0], { x: ML, y, w: 2.0, h: 1.2, valign: "middle", fontFace: HEAD, fontSize: 44, bold: true, color: ACC });
    s.addText(p[1], { x: ML+2.4, y: y+0.05, w: 9.5, h: 0.6, fontFace: HEAD, fontSize: 23, bold: true, color: INK });
    s.addText(p[2], { x: ML+2.4, y: y+0.75, w: 9.3, h: 0.6, fontFace: HEAD, fontSize: 15.5, color: MUTE });
    if (i===0) rule(s, ML, y+rh-0.45, 11.3);
  });
  notes(s, "总览：把全场框成两件事，建立结构预期。一句话带过即可。");
}

// ============ 3 · 第一部分① 节奏被打乱 → 脏补丁 ============
{
  const s = pres.addSlide(); s.background = { color: PAPER };
  rightPhoto(s, "code_fade.png");
  contentHead(s, 3, "第一部分 · 我们的开发之路", "节奏，被 AI 彻底打乱了");
  s.addText("以前", { x: ML, y: 2.5, w: 3, h: 0.35, fontFace: HEAD, fontSize: 12.5, color: FAINT, charSpacing: 2 });
  s.addText("做系统习惯几年稳扎稳打、一版版迭代成成品", { x: ML, y: 2.82, w: 6.3, h: 0.4, fontFace: HEAD, fontSize: 14.5, color: MUTE });
  s.addText("AI 来了", { x: ML, y: 3.35, w: 3, h: 0.35, fontFace: HEAD, fontSize: 12.5, color: ACC, charSpacing: 2 });
  s.addText([
    { text: "几十个小时", options: { color: INK, bold: true } },
    { text: "，就能做出一个像样的系统。眼前一亮。", options: { color: INK } },
  ], { x: ML, y: 3.67, w: 6.4, h: 0.7, fontFace: HEAD, fontSize: 14.5, lineSpacing: 22 });
  rule(s, ML, 4.6, 6.5);
  s.addText("但兴奋没多久——一落地，问题全冒出来",
    { x: ML, y: 4.78, w: 6.5, h: 0.45, fontFace: HEAD, fontSize: 15, bold: true, color: INK });
  s.addText("安全、权限、维护、边界，AI 统统没替我们考虑。",
    { x: ML, y: 5.25, w: 6.5, h: 0.45, fontFace: HEAD, fontSize: 13.5, color: MUTE });
  s.addText([
    { text: "只能一个坑打一个补丁，越打越乱——", options: { color: INK, breakLine: true } },
    { text: "这就是我们现在还在走的路：打「脏补丁」。", options: { color: ACC, bold: true } },
  ], { x: ML, y: 5.75, w: 6.5, h: 1.0, fontFace: HEAD, fontSize: 14, lineSpacing: 22 });
  notes(s, "第一部分上半场（纯方法论对比，不提黑客松）。以前几年稳扎稳打 vs AI 几十小时（眼前一亮）→ 但落地踩坑 → 打脏补丁，越打越乱。");
}

// ============ 4 · 第一部分② 转向 AI Native ============
{
  const s = pres.addSlide(); s.background = { color: PAPER };
  rightPhoto(s, "frame_fade.png");
  contentHead(s, 4, "第一部分 · 我们的开发之路", "与其打补丁，不如重做地基");
  s.addText("改到后来，我们想通了一件事：", { x: ML, y: 2.55, w: 6.4, h: 0.4, fontFace: HEAD, fontSize: 15, bold: true, color: INK });
  s.addText("与其在烂地基上没完没了地补，不如把顶层框架重新设计一遍——先定义问题、用户、安全与质量的边界，再让 AI 在框架里去搭。",
    { x: ML, y: 3.05, w: 6.4, h: 1.0, fontFace: HEAD, fontSize: 14, color: MUTE, lineSpacing: 22 });
  rule(s, ML, 4.25, 6.5);
  s.addText([
    { text: "后来才知道，这正是最近很火的 ", options: { color: INK } },
    { text: "AI Native", options: { color: ACC, bold: true } },
    { text: "。", options: { color: INK } },
  ], { x: ML, y: 4.45, w: 6.5, h: 0.5, fontFace: HEAD, fontSize: 17, bold: true });
  s.addText("我们照着做，真的做出了一个更经得起落地的产品。",
    { x: ML, y: 5.05, w: 6.5, h: 0.5, fontFace: HEAD, fontSize: 14.5, color: INK });
  s.addText("下一步 · 产品要被看见 —— AI 时代靠 GEO（生成引擎优化）去推广。",
    { x: ML, y: 5.95, w: 6.5, h: 0.6, fontFace: HEAD, fontSize: 13.5, color: FAINT, lineSpacing: 20 });
  notes(s, "第一部分下半场。补丁走不通→顶层重做地基→撞见 AI Native→做出更能落地的产品。GEO 一句带过。");
}

// ============ 5 · 第二部分① 两种思路的碰撞 ============
{
  const s = pres.addSlide(); s.background = { color: PAPER };
  folio(s, 5); kicker(s, "第二部分 · 医学生的启示");
  s.addText("两种思路，截然不同", { x: ML, y: 1.08, w: 11.3, h: 0.9, fontFace: HEAD, fontSize: 30, bold: true, color: INK });
  s.addText([
    { text: "上个月抖音黑客松，我们 ", options: { color: INK } },
    { text: "24 小时做出产品、拿了二等奖", options: { color: INK, bold: true } },
    { text: "——而团队里，还有医学生。", options: { color: INK } },
  ], { x: ML, y: 2.0, w: 11.3, h: 0.45, fontFace: HEAD, fontSize: 15, color: MUTE });

  s.addText("我们 · 软件工程思路", { x: ML, y: 2.95, w: 5.4, h: 0.45, fontFace: HEAD, fontSize: 17, bold: true, color: MUTE });
  s.addText("满脑子是：怎么把功能跑通，怎么更快。",
    { x: ML, y: 3.47, w: 5.2, h: 1.0, fontFace: HEAD, fontSize: 14.5, color: INK, lineSpacing: 22 });

  s.addShape(pres.shapes.RECTANGLE, { x: 6.65, y: 2.95, w: 0.04, h: 2.2, fill: { color: RULE } });

  s.addText("医学生 · 场景敏感性", { x: 7.05, y: 2.95, w: 5.4, h: 0.45, fontFace: HEAD, fontSize: 17, bold: true, color: ACC });
  s.addText("以写病例为例：产品给出的每个判断都不能凭空生成，必须有佐证——坚持引入权威医学文献作依据，否则临床根本不敢用。",
    { x: 7.05, y: 3.47, w: 5.3, h: 1.5, fontFace: HEAD, fontSize: 14, color: INK, lineSpacing: 21 });

  rule(s, ML, 5.45, 11.3);
  s.addText("一开始我们嫌它拖慢进度，后来才明白：这恰恰是医学产品的命门。",
    { x: ML, y: 5.65, w: 11.3, h: 0.6, fontFace: HEAD, fontSize: 16, bold: true, color: INK });
  notes(s, "第二部分上半场。黑客松现场（24h二等奖、团队有医学生）→ 两种思路截然不同：工程求快 vs 场景敏感性（写病例要佐证、引文献）。");
}

// ============ 6 · 第二部分② 启示 ============
{
  const s = pres.addSlide(); s.background = { color: PAPER };
  rightPhoto(s, "hack_fade.png");
  contentHead(s, 6, "第二部分 · 医学生的启示", "AI 负责快，医学生负责对");
  s.addText("正是两种思路互相碰撞、互相补位，", { x: ML, y: 2.6, w: 6.4, h: 0.45, fontFace: HEAD, fontSize: 15.5, color: INK });
  s.addText([
    { text: "我们才做出真正「敢用」的产品，", options: { color: INK, breakLine: true } },
    { text: "拿了奖。", options: { color: ACC, bold: true } },
  ], { x: ML, y: 3.05, w: 6.4, h: 0.9, fontFace: HEAD, fontSize: 15.5, lineSpacing: 24 });
  rule(s, ML, 4.2, 6.5);
  s.addText("它给我们的启示", { x: ML, y: 4.4, w: 6, h: 0.4, fontFace: HEAD, fontSize: 13, color: FAINT, charSpacing: 1 });
  s.addText([
    { text: "AI Native 的顶层框架里到底装什么？", options: { color: INK, breakLine: true } },
    { text: "不能只有工程——还得把「场景敏感性」装进去。", options: { color: ACC, bold: true } },
  ], { x: ML, y: 4.8, w: 6.5, h: 1.4, fontFace: HEAD, fontSize: 17, lineSpacing: 30 });
  notes(s, "第二部分下半场。碰撞互补→敢用的产品→拿奖。启示：顶层框架不能只有工程，要装进场景敏感性。AI 负责快，医学生负责对。");
}

// ============ 7 · 收尾 ============
{
  const s = pres.addSlide();
  s.background = { path: A + "network_dark.jpg" };
  s.addText("我们一直在做 OPC。", { x: ML, y: 1.75, w: 11, h: 0.5, fontFace: HEAD, fontSize: 17, color: WMUTE });
  s.addShape(pres.shapes.RECTANGLE, { x: ML, y: 2.45, w: 0.55, h: 0.06, fill: { color: ACC } });
  s.addText([
    { text: "AI 没有取代我们，", options: { color: WHITE, breakLine: true } },
    { text: "而是逼我们想清楚——什么交给 AI，", options: { color: WHITE, breakLine: true } },
    { text: "什么必须由人守住", options: { color: ACC } },
    { text: "。", options: { color: WHITE } },
  ], { x: ML, y: 2.9, w: 11.6, h: 2.4, fontFace: HEAD, fontSize: 34, bold: true, lineSpacing: 48 });
  rule(s, ML, 5.95, 5.0, "3A3F4A");
  s.addText("一半靠工程，一半靠场景。这就是我们正在走的路。",
    { x: ML, y: 6.15, w: 11, h: 0.5, fontFace: HEAD, fontSize: 15, color: WMUTE });
  s.addText("谢谢大家", { x: ML, y: 6.75, w: 11, h: 0.4, fontFace: HEAD, fontSize: 13, bold: true, color: FAINT, charSpacing: 2 });
  notes(s, "收尾。一直在做 OPC → AI 逼我们分清人与 AI 的边界 → 一半工程一半场景。金句重读。");
}

pres.writeFile({ fileName: "D:/PointMap/deck/AI_OPC_演讲.pptx" }).then(()=>console.log("written"));
