"use client";

/* The Google Maps SDK is loaded at runtime, so its constructors are not available to TypeScript here. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";

type MapCategory = "all" | "life" | "sports" | "transit";
type TravelMode = "WALKING" | "DRIVING" | "TRANSIT" | "BICYCLING";

const official = "https://www.sumitomo-rd-mansion.jp/kansai/furukawabashi/";
const assetRoot = "../../assets/city-tower-furukawabashi";
const images = {
  hero: `${assetRoot}/hero.jpg`,
  design: `${assetRoot}/design.jpg`,
  entrance: `${assetRoot}/entrance.jpg`,
  lounge: `${assetRoot}/lounge.jpg`,
  fitness: `${assetRoot}/fitness.jpg`,
  f3: `${assetRoot}/plan-f3.jpg`,
  k3: `${assetRoot}/plan-k3.jpg`,
  p2: `${assetRoot}/plan-p2.jpg`,
};

const sections = [
  ["overview", "概览"],
  ["plans", "户型价格"],
  ["design", "设计"],
  ["parking", "停车"],
  ["map", "地图"],
  ["commute", "通勤"],
  ["life", "生活"],
  ["sports", "运动"],
  ["value", "投资判断"],
] as const;

const facilities = [
  { name: "古川桥站", label: "古川桥站", icon: "🚉", query: "京阪古川橋駅", category: "transit" as const },
  { name: "门真市站", label: "门真市站", icon: "🚉", query: "京阪門真市駅", category: "transit" as const },
  { name: "そよら古川桥站前", label: "Soyora", icon: "🛍", query: "そよら古川橋駅前", category: "life" as const },
  { name: "Foods Market Satake", label: "Satake", icon: "🛒", query: "Foods Market satake コア古川橋店", category: "life" as const },
  { name: "LaLaport / Outlet 门真", label: "LaLaport门真", icon: "🛍", query: "ららぽーと門真", category: "life" as const },
  { name: "Costco 门真", label: "Costco门真", icon: "🛒", query: "コストコホールセール 門真倉庫店", category: "life" as const },
  { name: "KADOMADO 文化创造图书馆", label: "KADOMADO", icon: "📚", query: "門真市立文化創造図書館 KADOMADO", category: "life" as const },
  { name: "门真市立综合体育馆", label: "门真综合体育馆", icon: "🏸", query: "門真市立総合体育館", category: "sports" as const },
  { name: "RACTAB Dome", label: "RACTAB Dome", icon: "🏊", query: "東和薬品RACTABドーム", category: "sports" as const },
  { name: "守口市民体育馆", label: "守口体育馆", icon: "🏸", query: "守口市民体育館", category: "sports" as const },
  { name: "鹤见体育中心", label: "鹤见体育中心", icon: "🏸", query: "大阪市立鶴見スポーツセンター", category: "sports" as const },
  { name: "旭体育中心", label: "旭体育中心", icon: "🏸", query: "大阪市立旭スポーツセンター", category: "sports" as const },
  { name: "城东体育中心", label: "城东体育中心", icon: "🏸", query: "大阪市立城東スポーツセンター", category: "sports" as const },
];

function createPoiLabel(label: string, icon: string, category: MapCategory, isHome = false) {
  const root = document.createElement("div");
  root.className = `map-poi-label ${category}${isHome ? " home" : ""}`;
  root.setAttribute("aria-label", label);
  const iconNode = document.createElement("span");
  iconNode.className = "map-poi-icon";
  iconNode.textContent = icon;
  const nameNode = document.createElement("span");
  nameNode.className = "map-poi-name";
  nameNode.textContent = label;
  root.append(iconNode, nameNode);
  return root;
}

const routeTargets: Array<{ id: string; provider: "google" | "ekispert"; name: string; sub: string; query: string; mode: TravelMode }> = [
  { id: "furukawabashi", provider: "google", name: "古川桥站", sub: "步行 · Google", query: "京阪古川橋駅", mode: "WALKING" },
  { id: "kyobashi", provider: "ekispert", name: "京桥", sub: "京阪本线", query: "京橋駅 大阪", mode: "TRANSIT" },
  { id: "osaka", provider: "ekispert", name: "梅田 / 大阪站", sub: "京桥换乘 JR", query: "大阪駅", mode: "TRANSIT" },
  { id: "shin-osaka", provider: "ekispert", name: "新大阪", sub: "新干线门户", query: "新大阪駅", mode: "TRANSIT" },
  { id: "itami", provider: "ekispert", name: "大阪伊丹机场", sub: "铁路 / 单轨", query: "大阪国際空港", mode: "TRANSIT" },
  { id: "kansai", provider: "ekispert", name: "关西机场", sub: "铁路路线", query: "関西国際空港", mode: "TRANSIT" },
  { id: "lalaport", provider: "google", name: "LaLaport门真", sub: "驾车 · Google", query: "ららぽーと門真", mode: "DRIVING" },
  { id: "costco", provider: "google", name: "Costco门真", sub: "驾车 · Google", query: "コストコホールセール 門真倉庫店", mode: "DRIVING" },
  { id: "ractab", provider: "google", name: "RACTAB Dome", sub: "驾车 · Google", query: "東和薬品RACTABドーム", mode: "DRIVING" },
];

declare global {
  interface Window {
    __OSAKA_HOME_GUIDE_CONFIG__?: { googleMapsApiKey?: string; googleMapId?: string };
    google?: any;
  }
}

function siteBasePath() {
  if (typeof window === "undefined") return "/";
  const marker = "/properties/";
  const index = window.location.pathname.indexOf(marker);
  return index >= 0 ? window.location.pathname.slice(0, index + 1) : "./";
}

async function loadRuntimeConfig() {
  if (window.__OSAKA_HOME_GUIDE_CONFIG__) return window.__OSAKA_HOME_GUIDE_CONFIG__;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${siteBasePath()}config.js`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("地图配置尚未加载"));
    document.head.appendChild(script);
  });
  return window.__OSAKA_HOME_GUIDE_CONFIG__ ?? {};
}

async function loadGoogleMaps() {
  if (window.google?.maps) return window.google;
  const config = await loadRuntimeConfig();
  if (!config.googleMapsApiKey) throw new Error("地图 API 尚未配置");
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.googleMapsApiKey ?? "")}&v=beta&libraries=maps,marker,places,routes&language=zh-CN&region=JP`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps 加载失败"));
    document.head.appendChild(script);
  });
  return window.google;
}

function formatMode(mode: TravelMode) {
  return { WALKING: "步行", DRIVING: "驾车", TRANSIT: "公共交通", BICYCLING: "骑行" }[mode];
}

export default function CityTowerFurukawabashi() {
  const scrollRoot = useRef<HTMLElement | null>(null);
  const mapElement = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<any>(null);
  const directionsService = useRef<any>(null);
  const directionsRenderer = useRef<any>(null);
  const ekispertPolyline = useRef<any>(null);
  const markers = useRef<Array<{ setVisible: (visible: boolean) => void; category: MapCategory }>>([]);
  const [activeSection, setActiveSection] = useState("overview");
  const [mapCategory, setMapCategory] = useState<MapCategory>("all");
  const [mapStatus, setMapStatus] = useState("正在载入同级 Google 地图…");
  const [routeStatus, setRouteStatus] = useState("选择一个目的地，地图会计算当前路线时间。");

  useEffect(() => {
    const root = scrollRoot.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.isIntersecting && setActiveSection(entry.target.id)),
      { root, threshold: 0.5 },
    );
    sections.forEach(([id]) => {
      const node = document.getElementById(id);
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(async (google) => {
        if (cancelled || !mapElement.current) return;
        const config = window.__OSAKA_HOME_GUIDE_CONFIG__ ?? {};
        const center = { lat: 34.741652, lng: 135.5905763 };
        const mapOptions: any = {
          center,
          zoom: 14,
          mapTypeId: "roadmap",
          mapTypeControl: true,
          fullscreenControl: true,
          streetViewControl: true,
          gestureHandling: "greedy",
          backgroundColor: "#dfe4dc",
        };
        if (config.googleMapId) mapOptions.mapId = config.googleMapId;
        const map = new google.maps.Map(mapElement.current, mapOptions);
        mapInstance.current = map;
        directionsService.current = new google.maps.DirectionsService();
        directionsRenderer.current = new google.maps.DirectionsRenderer({ map, suppressMarkers: false, polylineOptions: { strokeColor: "#e6533f", strokeWeight: 6 } });
        const info = new google.maps.InfoWindow();
        const addLabeledMarker = ({ position, title, label, icon, category, isHome = false }: { position: any; title: string; label: string; icon: string; category: MapCategory; isHome?: boolean }) => {
          const color = isHome ? "#e6533f" : category === "sports" ? "#2d7f71" : category === "life" ? "#d99a35" : "#3f72af";
          if (google.maps.marker?.AdvancedMarkerElement && config.googleMapId) {
            const marker = new google.maps.marker.AdvancedMarkerElement({
              map,
              position,
              title,
              content: createPoiLabel(label, icon, category, isHome),
              gmpClickable: true,
              zIndex: isHome ? 1000 : category === "transit" ? 600 : 400,
              collisionBehavior: google.maps.CollisionBehavior?.REQUIRED,
            });
            return { marker, setVisible: (visible: boolean) => { marker.map = visible ? map : null; } };
          }
          const marker = new google.maps.Marker({
            map,
            position,
            title,
            label: { text: `${icon} ${label}`, color: "#10241f", fontSize: "13px", fontWeight: "700" },
            icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: color, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3, scale: isHome ? 11 : 8, labelOrigin: new google.maps.Point(0, -18) },
          });
          return { marker, setVisible: (visible: boolean) => marker.setVisible(visible) };
        };

        const homeEntry = addLabeledMarker({ position: center, title: "City Tower 古川桥", label: "City Tower 古川桥", icon: "🏙", category: "all", isHome: true });
        homeEntry.marker.addListener("click", () => { info.setContent("<strong>City Tower 古川桥</strong><br>研究坐标：幸福町14-15周边"); info.open({ map, anchor: homeEntry.marker }); });
        markers.current.push({ setVisible: homeEntry.setVisible, category: "all" });

        const geocoder = new google.maps.Geocoder();
        await Promise.all(facilities.map(async (facility) => {
          try {
            const response = await geocoder.geocode({ address: facility.query, region: "jp" });
            const location = response.results?.[0]?.geometry?.location;
            if (!location || cancelled) return;
            const entry = addLabeledMarker({ position: location, title: facility.name, label: facility.label, icon: facility.icon, category: facility.category });
            entry.marker.addListener("click", () => { info.setContent(`<strong>${facility.name}</strong><br>${facility.category === "sports" ? "运动设施" : facility.category === "life" ? "生活设施" : "交通节点"}`); info.open({ map, anchor: entry.marker }); });
            markers.current.push({ setVisible: entry.setVisible, category: facility.category });
          } catch { /* A missing POI must not block the map. */ }
        }));
        if (!cancelled) setMapStatus("地图已就绪 · 可缩放、切换底图并计算路线");
      })
      .catch((error) => !cancelled && setMapStatus(error instanceof Error ? error.message : "地图加载失败"));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    markers.current.forEach(({ setVisible, category }) => setVisible(category === "all" || mapCategory === "all" || category === mapCategory));
  }, [mapCategory]);

  async function showRoute(target: (typeof routeTargets)[number]) {
    const map = mapInstance.current;
    const google = window.google;
    if (!map || !google?.maps) {
      setRouteStatus("地图仍在载入，请稍后再试。");
      return;
    }
    setRouteStatus(`正在通过${target.provider === "ekispert" ? "服务器 Ekispert" : "Google Maps"}计算前往${target.name}的${formatMode(target.mode)}路线…`);
    try {
      if (target.provider === "ekispert") {
        const response = await fetch(`${siteBasePath()}api/transit-route?destination=${encodeURIComponent(target.id)}`, { headers: { Accept: "application/json" } });
        const route = await response.json();
        if (!response.ok) throw new Error(route.hint ?? "Ekispert 路线查询失败");
        directionsRenderer.current?.setMap(null);
        ekispertPolyline.current?.setMap(null);
        const path = Array.isArray(route.path) ? route.path : [];
        if (path.length > 1) {
          ekispertPolyline.current = new google.maps.Polyline({ map, path, geodesic: true, strokeColor: "#2d7f71", strokeOpacity: 0.92, strokeWeight: 7 });
          const bounds = new google.maps.LatLngBounds();
          path.forEach((point: { lat: number; lng: number }) => bounds.extend(point));
          map.fitBounds(bounds, 72);
        }
        const lineSummary = Array.isArray(route.steps) ? route.steps.map((step: { line?: string }) => step.line).filter(Boolean).join(" → ") : "";
        setRouteStatus(`${target.name} · Ekispert 约 ${route.durationMinutes ?? "—"} 分钟 · ${route.transferCount ? `换乘 ${route.transferCount} 次` : "直达"}${route.fareYen ? ` · 约 ¥${route.fareYen}` : ""}${lineSummary ? ` · ${lineSummary}` : ""}。站点级结果，班次以出发时刻为准。`);
        return;
      }

      const service = directionsService.current;
      const renderer = directionsRenderer.current;
      if (!service || !renderer) throw new Error("Google 路线服务尚未就绪");
      ekispertPolyline.current?.setMap(null);
      renderer.setMap(map);
      const result = await service.route({
        origin: { lat: 34.741652, lng: 135.5905763 },
        destination: target.query,
        travelMode: google.maps.TravelMode[target.mode],
        region: "JP",
      });
      renderer.setDirections(result);
      const leg = result.routes?.[0]?.legs?.[0];
      setRouteStatus(`${target.name} · Google Maps ${formatMode(target.mode)}约 ${leg?.duration?.text ?? "—"} · ${leg?.distance?.text ?? "距离由路线决定"}。实际时间随路况变化。`);
      map.panTo(leg?.start_location);
    } catch (error) {
      setRouteStatus(error instanceof Error ? error.message : `暂时无法计算${target.name}路线，可点击下方外部地图继续。`);
    }
  }

  return (
    <main className="property-page" ref={scrollRoot}>
      <aside className="story-nav" aria-label="页面目录">
        <a className="story-brand" href="../../"><span>住</span><b>大阪置业研究所</b></a>
        <div className="story-progress"><i style={{ width: `${((sections.findIndex(([id]) => id === activeSection) + 1) / sections.length) * 100}%` }} /></div>
        <nav>{sections.map(([id, label], index) => <a key={id} className={activeSection === id ? "active" : ""} href={`#${id}`}><small>{String(index + 1).padStart(2, "0")}</small>{label}</a>)}</nav>
        <a className="back-link" href="../../#projects">← 返回推荐物件</a>
      </aside>

      <section className="story-section hero-story" id="overview">
        <img className="hero-image" src={images.hero} alt="City Tower 古川桥外观完成预想图" />
        <div className="hero-shade" />
        <div className="story-copy hero-copy-block">
          <p className="story-kicker">PROPERTY 01 · FURUKAWABASHI</p>
          <h1>站前四分钟，<br/><em>门真的新坐标。</em></h1>
          <p className="story-lead">41层、648户，坐进27,800㎡官民一体开发的核心。它不是“大阪市中心塔楼的便宜替代”，而是一笔关于通勤、生活完成度与区域更新速度的选择。</p>
          <div className="hero-facts"><span><b>41</b>层</span><span><b>648</b>户</span><span><b>4</b>分钟到站</span><span><b>2027.03</b>预计交付</span></div>
        </div>
        <a className="image-credit" href={official} target="_blank" rel="noreferrer">图片：住友不动产官方完成预想图 ↗</a>
      </section>

      <section className="story-section concept-story">
        <div className="story-copy centered-copy">
          <p className="story-kicker">THE BIG IDEA</p>
          <h2>买的不只是塔楼，<br/>而是一个仍在完成中的站前街区。</h2>
          <p>项目西侧集中布置塔楼，东侧释放约2,000㎡开放空间；KADOMADO文化创造图书馆、交流广场、商业设施与步行轴共同构成新街区。优势是“从无到有”的更新红利，代价是未来数年仍要面对施工、动线变化与南侧17层计划建筑带来的不确定性。</p>
          <div className="verdict-row"><article><b>最强项</b><span>大规模地标性＋车站步行圈＋生活设施成形</span></article><article><b>核心风险</b><span>新盘溢价、邻地施工、塔楼长期修缮成本</span></article></div>
        </div>
      </section>

      <section className="story-section plans-story" id="plans">
        <div className="story-copy wide-copy">
          <p className="story-kicker">PRICE & PLAN · 2026.08.19</p>
          <div className="section-title-row"><h2>先看总价，再看每一平米是否买得值。</h2><div className="price-display"><small>公开先着顺</small><b>4,800</b><span>— 8,700 万日元</span></div></div>
          <div className="plan-grid">
            <article><img src={images.p2} alt="P-2户型图"/><div><small>入门总价</small><h3>P-2 · 2LDK</h3><p>54.43㎡ · 2WIC＋SIC</p><strong>约4,800–5,000万</strong><span>适合总价优先、两人居住或出租流动性。储物完整，但需要接受较紧凑的公共区。</span></div></article>
            <article className="recommended"><img src={images.k3} alt="K-3户型图"/><div><small>研究所优先关注</small><h3>K-3 · 3LDK</h3><p>68.03㎡ · WIC</p><strong>约5,500–6,000万</strong><span>面积、总价和家庭适配度最平衡。重点核验朝向、楼层价差与实际采光。</span></div></article>
            <article><img src={images.f3} alt="F-3户型图"/><div><small>角住户升级</small><h3>F-3 · 3LDK</h3><p>72.66㎡ · WIC＋SIC</p><strong>约6,900–7,200万</strong><span>33.86㎡大阳台与角部采光更有稀缺性；同时要判断高总价能否在二手市场被下一位买家认可。</span></div></article>
          </div>
          <div className="cost-strip"><span>管理费 <b>1.99–2.63万/月</b></span><span>修缮积立金 <b>1.23–1.65万/月</b></span><span>修缮基金 <b>82.17–109.74万</b></span><small>价格与费用会随销售期变化，签约前以最新重要事项说明书为准。</small></div>
        </div>
      </section>

      <section className="story-section design-story" id="design">
        <div className="split-visual"><img src={images.design} alt="塔楼设计完成预想图"/><div className="story-copy"><p className="story-kicker">DESIGN LANGUAGE</p><h2>纵向线条，把41层做成门真的远景标记。</h2><p>官方以沉稳的单色系切换强调竖向比例。真正影响居住感受的，不只是远观立面，而是两层挑空、约5.8m高、约215㎡的大堂，以及从电梯厅延续到内廊的木纹与酒店式动线。</p><ul><li>约2,000㎡开放空间与步车分流</li><li>北侧车寄，直接连接主入口大堂</li><li>6部电梯；实际高峰等待时间需交付后验证</li><li>内廊空调为季节与时段限定运行</li></ul></div></div>
      </section>

      <section className="story-section amenity-story">
        <div className="amenity-gallery"><figure><img src={images.entrance} alt="大堂完成预想图"/><figcaption>两层挑空 Grand Entrance Hall</figcaption></figure><figure><img src={images.lounge} alt="高空休息室完成预想图"/><figcaption>30层 Sky Lounge</figcaption></figure><figure><img src={images.fitness} alt="健身房完成预想图"/><figcaption>3层 Fitness Room</figcaption></figure></div>
        <div className="story-copy compact-copy"><p className="story-kicker">COMMON SPACE</p><h2>大盘的公共空间很丰富，但要问清“怎么用、多少钱”。</h2><p>3层设置远程办公休息室、派对室、健身房与两间客房；地下1层有防音工作室，30层设高空休息室。工作室、派对室和客房为收费设施，最终使用规则与费用应在签约前确认。</p></div>
      </section>

      <section className="story-section parking-story" id="parking">
        <div className="story-copy wide-copy">
          <p className="story-kicker">PARKING & MOBILITY</p><h2>379个车位，覆盖约58.5%的住户。</h2>
          <div className="parking-grid"><article><strong>379</strong><h3>汽车</h3><p>塔式352台＋横行升降式27台</p><b>9,000–16,000日元/月</b></article><article><strong>1,296</strong><h3>自行车</h3><p>每户平均约2个名额；平置、滑轨与两段式</p><b>300–3,500日元/月</b></article><article><strong>65</strong><h3>摩托 / 小型摩托</h3><p>摩托39台＋小型摩托26台</p><b>4,000–6,000日元/月</b></article></div>
          <div className="parking-advice"><b>买前要问的四件事</b><ol><li>抽签优先级及未中签后的周边月租替代</li><li>塔式车位的车高、车宽、重量和充电限制</li><li>高峰取车平均等待与长期维护停机安排</li><li>未来更换机械设备的费用是否已纳入长期修缮计划</li></ol></div>
        </div>
      </section>

      <section className="story-section map-story" id="map">
        <div ref={mapElement} className="property-map" aria-label="City Tower古川桥周边互动地图" />
        <div className="map-panel"><p className="story-kicker">LIVE MAP · GOOGLE MAPS</p><h2>把生活圈放到同一张地图。</h2><p>{mapStatus}</p><div className="map-filters">{([['all','全部'],['life','生活'],['sports','运动'],['transit','交通']] as const).map(([value,label])=><button key={value} onClick={()=>setMapCategory(value)} className={mapCategory===value?'active':''}>{label}</button>)}</div><div className="route-groups"><section><small>公交 / 铁路 · 服务器 Ekispert</small><div className="route-picker">{routeTargets.filter(target=>target.provider==="ekispert").map(target=><button key={target.id} onClick={()=>showRoute(target)}><b>{target.name}</b><span>{target.sub}</span></button>)}</div></section><section><small>步行 / 驾车 · Google Maps</small><div className="route-picker">{routeTargets.filter(target=>target.provider==="google").map(target=><button key={target.id} onClick={()=>showRoute(target)}><b>{target.name}</b><span>{target.sub}</span></button>)}</div></section></div><div className="route-status">{routeStatus}</div><a href="https://www.google.com/maps/dir/?api=1&origin=34.741652,135.5905763" target="_blank" rel="noreferrer">在 Google Maps 继续规划 ↗</a></div>
      </section>

      <section className="story-section commute-story" id="commute">
        <div className="story-copy wide-copy"><p className="story-kicker">COMMUTE LOGIC</p><h2>通勤的关键不是“离大阪多远”，而是在哪一次换乘。</h2><div className="commute-flow"><article><small>HOME → 古川桥</small><strong>步行 4 分钟</strong><p>官方口径；道路与广场完成后路线仍可能调整。</p></article><article><small>古川桥 → 京桥</small><strong>京阪本线</strong><p>主要城市换乘点；前往大阪站、难波方向通常从这里分流。</p></article><article><small>门真市 → 伊丹</small><strong>大阪单轨</strong><p>一站到门真市后换乘单轨；当前常见全程约45–65分钟，页面地图可按出发时刻重算。</p></article><article><small>寝屋川市 → KIX</small><strong>机场巴士备选</strong><p>官方介绍从寝屋川市东口有直达关西机场巴士，需按航班时刻核验班次。</p></article></div><p className="callout">新大阪不是直达：通常需要在京桥转 JR，再连接大阪站或其他换乘方案。高频坐新干线的人，应把“门到站”的实际换乘疲劳纳入，而不只看铁路运行分钟数。</p></div>
      </section>

      <section className="story-section life-story" id="life">
        <div className="story-copy wide-copy"><p className="story-kicker">DAILY LIFE</p><h2>小采购在站前，大采购在门真商业带。</h2><div className="life-grid"><article><b>4–6分钟</b><h3>站前日常</h3><p>Station Mall core古川桥内的Satake食品超市、そよら古川桥站前与本通商店街，覆盖生鲜、药妆、日用品和工作日晚餐。</p></article><article><b>约19分钟步行</b><h3>LaLaport / Outlet</h3><p>约1.47km，餐饮、影院、品牌与黑门市场式食品区形成周末目的地。</p></article><article><b>约24分钟步行</b><h3>Costco 门真</h3><p>约1.89km；有车或自行车更现实，回程载货量要和塔式车位、停车动线一起考虑。</p></article><article><b>街区内</b><h3>KADOMADO</h3><p>图书馆、文化会馆、咖啡与屋顶/立体花园带来非商业型公共生活，是本项目区别于普通站前塔楼的重要组成。</p></article></div><p className="callout dark">餐厅数量并不是唯一指标。更值得现场看的是：工作日21点后的可选餐饮、超市闭店时间、雨天从站口到大堂的遮雨连续性，以及大型活动日的人流。</p></div>
      </section>

      <section className="story-section sports-story" id="sports">
        <div className="story-copy wide-copy"><p className="story-kicker">BADMINTON & SPORTS</p><h2>对打羽毛球的人，这一项是少见的硬优势。</h2><div className="sports-focus"><article className="sport-primary"><small>步行约5分钟 · 约400m</small><h3>门真市立综合体育馆</h3><strong>副馆可布置3面羽毛球场</strong><p>另有主馆、室内跑道、训练室、武道场等。个人利用取决于当天团体预约空档，固定打球应提前了解团体注册与预约规则。</p><a href="https://information.konamisportsclub.jp/trust/kadoma/" target="_blank" rel="noreferrer">查看官方预约与设施 ↗</a></article><div className="sport-list"><article><b>RACTAB Dome</b><span>门真南 · 泳池 / 主副竞技场 / 冰场季节转换</span></article><article><b>守口市民体育馆</b><span>守口市站生活圈 · 作为京阪沿线备选</span></article><article><b>鹤见体育中心</b><span>大阪市东侧 · 骑行或驾车可达的公共馆</span></article><article><b>旭 / 城东体育中心</b><span>大阪市内多馆备选 · 适合按开放日轮换</span></article></div></div><p className="callout">地图的“运动”图层已标出主要公共体育馆。实际判断建议按你的打球频率做一次晚间实测：下班到家、换装、到馆、停车/锁车、打完回家的完整时间，比地图距离更有意义。</p></div>
      </section>

      <section className="story-section value-story" id="value">
        <div className="story-copy wide-copy"><p className="story-kicker">VALUE & FUTURE</p><h2>它的未来性来自“稀缺地标”，不是来自低买入价。</h2><div className="value-matrix"><article className="positive"><small>支撑因素</small><ul><li>门真市首个41层、648户的大规模塔楼，识别度强</li><li>古川桥站步行4分钟，站距对郊区转售尤为重要</li><li>公共文化设施、广场和商业同步落地，生活圈升级</li><li>京阪沿线持续推进站前再开发与沿线价值提升</li></ul></article><article className="negative"><small>需要折价思考</small><ul><li>4,800–8,700万已包含新筑、塔楼和再开发溢价</li><li>机械停车与大规模共用设施会形成长期维护成本</li><li>南东侧公共设施、南侧17层计划建筑影响部分视野</li><li>门真市二手买家总价承受力可能限制高价户型流动性</li></ul></article></div><div className="final-verdict"><span>研究所判断</span><h3>自住价值高于纯投资收益；优先中总价、家庭型、站近逻辑清晰的户型。</h3><p>如果目标是5–10年自住并频繁使用门真/京阪沿线、体育馆和周边商业，K-3等约68㎡中间户具备较好的“用得上”价值。若主要追求租金回报，应单独核算管理修缮、空置、出租限制与预期租金，不应只看地标性。</p></div><div className="source-links"><a href={official} target="_blank" rel="noreferrer">住友不动产官方资料 ↗</a><a href="https://suumo.jp/ms/shinchiku/osaka/sc_kadoma/nc_67729555/property/" target="_blank" rel="noreferrer">SUUMO 物件概要与最新销售期 ↗</a><a href="https://www.city.kadoma.osaka.jp/machizukuri_rodo/machizukuri/kanminrenkei/hurukawabasisyuhen/kadomashi_kyuudaiicchuuatochi/22977.html" target="_blank" rel="noreferrer">门真市站前开发资料 ↗</a></div><p className="fine-print">本页为中文置业研究，不是开发商销售材料，也不构成投资、贷款、税务或法律建议。价格信息更新至2026年8月19日前后的公开销售资料；地图路线、商户与开放时间会变化，请在看房和签约当天复核。</p></div>
      </section>
    </main>
  );
}
