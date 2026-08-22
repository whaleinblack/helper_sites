"use client";

import { useEffect, useRef, useState } from "react";
import CachedPropertyMap, { type CachedRouteTarget } from "../cached-property-map";
import mapCache from "./map-cache.json";

const official = "https://ogud.co.jp/scenes/sekimetakadono134/";
const assetRoot = "../../assets/scenes-sekime-takadono";
const images = {
  hero: `${assetRoot}/hero.jpg`, design: `${assetRoot}/design.jpg`, approach: `${assetRoot}/approach.jpg`, hall: `${assetRoot}/hall.jpg`,
  b: `${assetRoot}/plan-b.png`, d1: `${assetRoot}/plan-d1.png`, f: `${assetRoot}/plan-f.png`,
};
const sections = [["overview","概览"],["plans","户型价格"],["design","设计"],["parking","停车"],["map","地图"],["commute","通勤"],["life","生活"],["sports","运动"],["value","投资判断"]] as const;
const routeTargets = [
  { id:"kadomashi",provider:"ekispert",name:"门真市",sub:"谷町线＋单轨",mode:"TRANSIT" },
  { id:"kyobashi",provider:"ekispert",name:"京桥",sub:"步行换乘京阪",mode:"TRANSIT" },
  { id:"osaka",provider:"ekispert",name:"梅田 / 大阪站",sub:"东梅田直达",mode:"TRANSIT" },
  { id:"honmachi",provider:"ekispert",name:"本町",sub:"核心办公区",mode:"TRANSIT" },
  { id:"namba",provider:"ekispert",name:"难波",sub:"南部商业中心",mode:"TRANSIT" },
  { id:"shin-osaka",provider:"ekispert",name:"新大阪",sub:"新干线门户",mode:"TRANSIT" },
  { id:"itami",provider:"ekispert",name:"大阪伊丹机场",sub:"阪急＋单轨",mode:"TRANSIT" },
  { id:"kansai",provider:"ekispert",name:"关西机场",sub:"天王寺换乘",mode:"TRANSIT" },
  { id:"sekime-takadono",provider:"google",name:"关目高殿站",sub:"步行",mode:"WALKING" },
  { id:"asahi-gym",provider:"google",name:"旭体育中心",sub:"体育 · 驾车",mode:"DRIVING" },
  { id:"tsurumi-gym",provider:"google",name:"鹤见体育中心",sub:"羽毛球 · 驾车",mode:"DRIVING" },
  { id:"kadoma-gym",provider:"google",name:"门真综合体育馆",sub:"羽毛球 · 驾车",mode:"DRIVING" },
] satisfies CachedRouteTarget[];

export default function ScenesSekimeTakadono() {
  const scrollRoot = useRef<HTMLElement | null>(null);
  const [activeSection,setActiveSection] = useState("overview");
  useEffect(()=>{const root=scrollRoot.current;if(!root)return;const observer=new IntersectionObserver(entries=>entries.forEach(entry=>entry.isIntersecting&&setActiveSection(entry.target.id)),{root,threshold:.5});sections.forEach(([id])=>{const node=document.getElementById(id);if(node)observer.observe(node)});return()=>observer.disconnect()},[]);
  return <main className="property-page scenes-theme" ref={scrollRoot}>
    <aside className="story-nav" aria-label="页面目录"><a className="story-brand" href="../../"><span>住</span><b>大阪置业研究所</b></a><div className="story-progress"><i style={{width:`${((sections.findIndex(([id])=>id===activeSection)+1)/sections.length)*100}%`}}/></div><nav>{sections.map(([id,label],i)=><a key={id} className={activeSection===id?"active":""} href={`#${id}`}><small>{String(i+1).padStart(2,"0")}</small>{label}</a>)}</nav><a className="back-link" href="../../#projects">← 返回推荐物件</a></aside>

    <section className="story-section hero-story" id="overview"><img className="hero-image" src={images.hero} alt="Scenes关目高殿外观完成预想图"/><div className="hero-shade"/><div className="story-copy hero-copy-block"><p className="story-kicker">PROPERTY 02 · SEKIME TAKADONO</p><h1>站前三分钟，<br/><em>四线大阪生活。</em></h1><p className="story-lead">134户、11层。它把大阪市地址、谷町线直达东梅田与京阪沿线通勤压缩在一个成熟住宅区里。三套优选中，它的核心不是“便宜”，而是下一手买家也容易理解的站距与交通。</p><div className="hero-facts"><span><b>134</b>户</span><span><b>3</b>分钟到站</span><span><b>4</b>站 / 4线</span><span><b>2027.04</b>预计交付</span></div></div><a className="image-credit" href={official} target="_blank" rel="noreferrer">图片：项目官方网站完成预想图 ↗</a></section>

    <section className="story-section concept-story"><div className="story-copy centered-copy"><p className="story-kicker">THE BIG IDEA</p><h2>以更高的新筑单价，<br/>买一套更容易解释的房子。</h2><p>关目高殿3分钟、关目成育与京阪关目约7分钟、JR野江约12分钟。谷町线负责梅田，京阪负责京桥与门真，JR大阪东线补足新大阪方向。站距与多线不是宣传词，而是这套资产最清晰的转售逻辑。</p><div className="showcase-score"><span><b>9.6</b>通勤</span><span><b>8.7</b>生活</span><span><b>9.2</b>流动性</span><span><b>7.0</b>买入性价比</span></div><div className="verdict-row"><article><b>最强项</b><span>大阪市门牌、地铁3分钟、四站四线与成熟生活圈</span></article><article><b>核心风险</b><span>站近新筑溢价、国道沿线环境、车位覆盖率仅约40%</span></article></div></div></section>

    <section className="story-section plans-story" id="plans"><div className="story-copy wide-copy"><p className="story-kicker">PRICE & PLAN · 2026.08</p><div className="section-title-row"><h2>56–85㎡全谱系，优先看67–75㎡家庭型。</h2><div className="price-display"><small>当前先着顺4户</small><b>5,840</b><span>— 7,390 万日元</span></div></div><div className="plan-grid"><article><img src={images.b} alt="B户型图"/><div><small>紧凑家庭型</small><h3>B · 3LDK</h3><p>68.55㎡</p><strong>约6千万中后段参考</strong><span>面积与房间数平衡。具体住户价格随销售期公布，不能把相邻户型价格直接套用。</span></div></article><article className="recommended"><img src={images.d1} alt="D1户型图"/><div><small>研究所优先关注</small><h3>D1 · 3LDK</h3><p>67.40㎡</p><strong>公开期参考约6,740万</strong><span>总价、面积和未来家庭买家池较均衡；现场重点看朝向、前方距离与道路噪音。</span></div></article><article><img src={images.f} alt="F户型图"/><div><small>面积升级</small><h3>F · 3LDK</h3><p>74.72㎡</p><strong>公开期参考约7,890万</strong><span>更接近长期家庭自住需要，但总价跨入7千万后，要和大阪市内更多新筑/次新盘竞争。</span></div></article></div><div className="cost-strip"><span>管理费 <b>约0.89–1.11万/月</b></span><span>修缮积立金 <b>约1.06–1.32万/月</b></span><span>面积范围 <b>56.64–85.25㎡</b></span><small>费用为当前先着顺面积带公开口径；价格与销售住户会变化，签约前以最新物件概要和重要事项说明为准。</small></div></div></section>

    <section className="story-section design-story" id="design"><div className="split-visual"><img src={images.design} alt="Scenes关目高殿外观设计完成预想图"/><div className="story-copy"><p className="story-kicker">DESIGN LANGUAGE</p><h2>不是塔楼，而是低调、耐看的城市住宅。</h2><p>134户形成足够的管理规模，又没有超大型社区的复杂动线。官方设计用水平线与植栽弱化建筑体量，入口强调从城市道路过渡到私领域的层次。</p><ul><li>11层RC结构，体量适中</li><li>入口、风除室与大堂形成连续归家轴线</li><li>公开空地与植栽改善临街感受</li><li>真正需要现场确认：道路侧房间的开窗噪音和夜间车流</li></ul></div></div></section>

    <section className="story-section amenity-story"><div className="amenity-gallery two-up"><figure><img src={images.approach} alt="入口完成预想图"/><figcaption>Approach · 城市到住区的缓冲</figcaption></figure><figure><img src={images.hall} alt="门厅完成预想图"/><figcaption>Entrance Hall · 日常归家尺度</figcaption></figure></div><div className="story-copy compact-copy"><p className="story-kicker">COMMON SPACE</p><h2>公共空间克制，长期持有反而更容易算账。</h2><p>它不依赖豪华泳池、宴会厅或大量收费空间来建立卖点。对重视每月持有成本的人，较少的高维护共用设施通常更透明；仍需核对电梯数量、快递柜、垃圾投放时段及长期修缮表。</p></div></section>

    <section className="story-section parking-story" id="parking"><div className="story-copy wide-copy"><p className="story-kicker">PARKING & MOBILITY</p><h2>54个车位，车是“需要提前解决”的选项。</h2><div className="parking-grid"><article><strong>54</strong><h3>汽车</h3><p>约40.3%住户覆盖率</p><b>12,000–23,000日元/月</b></article><article><strong>272</strong><h3>自行车</h3><p>每户平均约2台</p><b>优先确认平置 / 两段式比例</b></article><article><strong>12</strong><h3>摩托 / 小型摩托</h3><p>名额有限</p><b>签约前确认抽签与空位</b></article></div><div className="parking-advice"><b>本项目的判断顺序</b><ol><li>先确认你购买住户是否参与首轮抽签</li><li>核对机械车位尺寸与充电条件</li><li>同时搜步行5分钟内的月租替代</li><li>把无车生活的采购、打球动线实际走一次</li></ol></div></div></section>

    <section className="story-section map-story" id="map"><CachedPropertyMap cache={mapCache} routeTargets={routeTargets} title="Scenes 关目高殿"/></section>

    <section className="story-section commute-story" id="commute"><div className="story-copy wide-copy"><p className="story-kicker">COMMUTE LOGIC</p><h2>梅田直达，门真与京桥有第二套答案。</h2><div className="commute-flow"><article><small>HOME → 关目高殿</small><strong>步行约3分钟</strong><p>谷町线入口近，是日常通勤的基本盘。</p></article><article><small>关目高殿 → 东梅田</small><strong>列车约10分钟</strong><p>无需换乘；到大阪站还要加地下步行。</p></article><article><small>HOME → 京阪关目</small><strong>步行约7分钟</strong><p>去京桥、守口、门真可切换京阪本线。</p></article><article><small>HOME → 新大阪</small><strong>缓存约29分钟</strong><p>通常东梅田步行换御堂筋线；页面路线为开发快照。</p></article></div><p className="callout">去门真市的最快方案会随时段在“谷町线到大日换单轨”和“步行到关目乘京阪”之间变化。建议按你真实上班时刻连续查一周，而不是只看一次最短结果。</p></div></section>

    <section className="story-section life-story" id="life"><div className="story-copy wide-copy"><p className="story-kicker">DAILY LIFE</p><h2>便利店够近，超市选择是成熟街区的真正优势。</h2><div className="life-grid"><article><b>7家</b><h3>近邻便利店</h3><p>FamilyMart、Lawson 100与7-Eleven形成夜间补给网络，地图均带名称图标。</p></article><article><b>8家</b><h3>超市选择</h3><p>万代、食品馆A-Price、Sundi、关西Super等覆盖品质与平价采购。</p></article><article><b>约2–3km</b><h3>大型商业</h3><p>AEON Mall鹤见绿地是周末型选择；日常不必依赖驾车去大商场。</p></article><article><b>成熟城区</b><h3>医疗与餐饮</h3><p>关目、高殿、野江生活圈可共享。看房应额外走一次晚间餐饮与雨天回家路线。</p></article></div><p className="callout dark">城市住宅的便利，不是地图上“有”一家店，而是走路5–10分钟内有不同价位、不同闭店时间的替代。这个项目在这一项明显优于单一商场型郊区盘。</p></div></section>

    <section className="story-section sports-story" id="sports"><div className="story-copy wide-copy"><p className="story-kicker">BADMINTON & SPORTS</p><h2>旭体育中心就在邻近生活圈，打球不必跨城。</h2><div className="sports-focus"><article className="sport-primary"><small>地图缓存 · 驾车约1分钟</small><h3>大阪市立旭体育中心</h3><strong>距离极近，是本项目的羽毛球核心优势</strong><p>公共馆开放取决于团体预约和个人利用时段；距离近意味着更容易抢到临时空档，也适合骑行或步行实测。</p><a href="https://www.sports-osaka.jp/facilities/asahi/" target="_blank" rel="noreferrer">查看设施官方信息 ↗</a></article><div className="sport-list"><article><b>鹤见体育中心</b><span>缓存驾车约12分钟 · 羽毛球备选</span></article><article><b>城东体育中心</b><span>大阪市东部公共馆 · 可轮换预约</span></article><article><b>都岛 / 东淀川</b><span>多馆覆盖，适合按开放日选择</span></article><article><b>门真综合体育馆</b><span>缓存驾车约17分钟 · 工作地一侧备选</span></article></div></div><p className="showcase-note">地图已标出12个体育设施，包含大阪市多个Sport Center、守口/门真公共馆与RACTAB Dome；按钮只读取开发阶段缓存，不会现场请求路线API。</p></div></section>

    <section className="story-section value-story" id="value"><div className="story-copy wide-copy"><p className="story-kicker">VALUE & FUTURE</p><h2>三套优选中，关目高殿的转售逻辑最完整。</h2><div className="value-matrix"><article className="positive"><small>支撑因素</small><ul><li>大阪市旭区地址与地铁站3分钟，下一手容易理解</li><li>谷町线、京阪、今里筋线、大阪东线形成替代路线</li><li>134户规模兼顾管理效率与二手稀缺度</li><li>成熟生活圈，不依赖单一再开发承诺</li></ul></article><article className="negative"><small>需要折价思考</small><ul><li>当前价格已充分计入新筑与站近溢价</li><li>车位覆盖率低，自驾家庭需先解决资格</li><li>国道与城市道路环境需按具体户型现场听音</li><li>7千万级住户会进入更广的大阪市新盘竞争</li></ul></article></div><div className="final-verdict"><span>研究所判断</span><h3>适合重视通勤、城市生活与5–10年后流动性的自住买家。</h3><p>优先67–75㎡、总价不过度跨档的3LDK。不要只为高楼层加价；更值得付钱的是安静朝向、有效采光、合理管理费和下一手也能理解的户型。</p></div><div className="source-links"><a href={`${official}outline/`} target="_blank" rel="noreferrer">官方物件概要 ↗</a><a href={`${official}plan/`} target="_blank" rel="noreferrer">官方户型资料 ↗</a><a href={`${official}access/`} target="_blank" rel="noreferrer">官方交通资料 ↗</a></div><p className="fine-print">本页为中文置业研究，不构成投资、贷款、税务或法律建议。价格更新至2026年8月公开销售资料；地图设施和路线为开发阶段缓存快照，商户、班次与开放时间会变化，请在看房和签约当天复核。</p></div></section>
  </main>;
}
