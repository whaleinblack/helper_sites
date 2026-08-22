"use client";

/* Google Maps constructors are supplied by the browser SDK. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";

type MapCategory = "all" | "life" | "sports" | "transit";
type MapFilter = MapCategory | "convenience" | "supermarket";
type MapIconType = "home" | "station" | "mall" | "convenience" | "supermarket" | "library" | "gym" | "pool" | "park";
type TravelMode = "WALKING" | "DRIVING" | "TRANSIT";

export type CachedRouteTarget = {
  id: string;
  provider: "google" | "ekispert";
  name: string;
  sub: string;
  mode: TravelMode;
};

type MapCache = {
  generatedAt: string;
  origin: { name: string; lat: number; lng: number };
  facilitySummary: { total: number; convenienceStores: number; supermarkets: number; sports: number; transit: number };
  facilities: Array<{ name: string; label: string; iconType: string; category: string; vicinity?: string; lat: number; lng: number }>;
  routes: Record<string, any>;
};

declare global {
  interface Window {
    __OSAKA_HOME_GUIDE_CONFIG__?: { googleMapsApiKey?: string; googleMapId?: string };
    google?: any;
  }
}

const mapIconSvg: Record<MapIconType, string> = {
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V5h11v16M8 9h3m-3 4h3m-3 4h3m4-7h5v11M3 21h18"/></svg>',
  station: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="14" rx="3"/><path d="M8 7h8M8 12h.01M16 12h.01M8 17l-2 4m10-4 2 4M8 21h8"/></svg>',
  mall: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/></svg>',
  convenience: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h16v12H4V9Zm-1-5h18l-2 5H5L3 4Z"/><path d="M8 13h8m-8 4h5"/></svg>',
  supermarket: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.2 10h9.9l2-7H6"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/></svg>',
  library: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22V5.5ZM20 5.5A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22V5.5Z"/></svg>',
  gym: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8v8m4-10v12m8-12v12m4-10v8M8 12h8M2 10v4m20-4v4"/></svg>',
  pool: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v12m0-8h6m0-4v12M2 17c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2M2 21c2 0 2 1 4 1s2-1 4-1 2 1 4 1 2-1 4-1 2 1 4 1"/></svg>',
  park: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c-4 3-6 6-6 9a6 6 0 0 0 12 0c0-3-2-6-6-9Z"/><path d="M12 11v10m-4 0h8"/></svg>',
};

function siteBasePath() {
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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.googleMapsApiKey)}&v=beta&libraries=maps,marker&language=zh-CN&region=JP`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps 加载失败"));
    document.head.appendChild(script);
  });
  return window.google;
}

function createPoiLabel(label: string, iconType: MapIconType, category: MapCategory, isHome = false) {
  const root = document.createElement("div");
  root.className = `map-poi-label ${category}${isHome ? " home" : ""}`;
  root.setAttribute("aria-label", label);
  const icon = document.createElement("span");
  icon.className = `map-poi-icon ${iconType}`;
  icon.innerHTML = mapIconSvg[iconType] ?? mapIconSvg.home;
  const name = document.createElement("span");
  name.className = "map-poi-name";
  name.textContent = label;
  root.append(icon, name);
  return root;
}

function modeName(mode: TravelMode) {
  return mode === "WALKING" ? "步行" : mode === "DRIVING" ? "驾车" : "公共交通";
}

export default function CachedPropertyMap({ cache, routeTargets, title }: { cache: MapCache; routeTargets: CachedRouteTarget[]; title: string }) {
  const mapElement = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<any>(null);
  const routePolyline = useRef<any>(null);
  const markers = useRef<Array<{ setVisible: (visible: boolean) => void; category: MapCategory; iconType: MapIconType }>>([]);
  const [filter, setFilter] = useState<MapFilter>("all");
  const [mapStatus, setMapStatus] = useState("正在载入 Google 地图…");
  const [routeStatus, setRouteStatus] = useState("选择目的地即可查看开发阶段预先查询的路线快照；点击不会调用路线 API。");

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((google) => {
      if (cancelled || !mapElement.current) return;
      const config = window.__OSAKA_HOME_GUIDE_CONFIG__ ?? {};
      const mapOptions: any = { center: cache.origin, zoom: 14, mapTypeId: "roadmap", mapTypeControl: true, fullscreenControl: true, streetViewControl: true, gestureHandling: "greedy", backgroundColor: "#dfe4dc" };
      if (config.googleMapId) mapOptions.mapId = config.googleMapId;
      const map = new google.maps.Map(mapElement.current, mapOptions);
      mapInstance.current = map;
      const info = new google.maps.InfoWindow();
      const addMarker = (facility: { name: string; label: string; iconType: MapIconType; category: MapCategory; vicinity?: string; lat: number; lng: number }, isHome = false) => {
        const color = isHome ? "#e6533f" : facility.category === "sports" ? "#2d7f71" : facility.category === "life" ? "#d99a35" : "#3f72af";
        if (google.maps.marker?.AdvancedMarkerElement && config.googleMapId) {
          const marker = new google.maps.marker.AdvancedMarkerElement({ map, position: { lat: facility.lat, lng: facility.lng }, title: facility.name, content: createPoiLabel(facility.label, facility.iconType, facility.category, isHome), gmpClickable: true, zIndex: isHome ? 1000 : facility.category === "transit" ? 800 : facility.category === "sports" ? 600 : facility.iconType === "supermarket" ? 420 : 350, collisionBehavior: google.maps.CollisionBehavior?.OPTIONAL_AND_HIDES_LOWER_PRIORITY });
          marker.addListener("click", () => { const kind = facility.iconType === "convenience" ? "便利店" : facility.iconType === "supermarket" ? "超市 / 食品采购" : facility.category === "sports" ? "运动设施" : facility.category === "transit" ? "交通节点" : "生活设施"; info.setContent(`<strong>${facility.name}</strong><br>${kind}${facility.vicinity ? `<br>${facility.vicinity}` : ""}`); info.open({ map, anchor: marker }); });
          return { setVisible: (visible: boolean) => { marker.map = visible ? map : null; } };
        }
        const marker = new google.maps.Marker({ map, position: { lat: facility.lat, lng: facility.lng }, title: facility.name, label: { text: facility.label, color: "#10241f", fontSize: "12px", fontWeight: "700" }, icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: color, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3, scale: isHome ? 11 : 8, labelOrigin: new google.maps.Point(0, -18) } });
        return { setVisible: (visible: boolean) => marker.setVisible(visible) };
      };
      const home = { ...cache.origin, label: title, iconType: "home" as MapIconType, category: "all" as MapCategory };
      markers.current.push({ ...addMarker(home, true), category: "all", iconType: "home" });
      cache.facilities.forEach((item) => {
        const facility = { ...item, iconType: item.iconType as MapIconType, category: item.category as MapCategory };
        markers.current.push({ ...addMarker(facility), category: facility.category, iconType: facility.iconType });
      });
      setMapStatus(`地图已就绪 · ${cache.facilitySummary.total} 个设施：${cache.facilitySummary.convenienceStores} 家便利店、${cache.facilitySummary.supermarkets} 家超市、${cache.facilitySummary.sports} 个体育设施`);
    }).catch((error) => !cancelled && setMapStatus(error instanceof Error ? error.message : "地图加载失败"));
    return () => { cancelled = true; };
  }, [cache, title]);

  useEffect(() => {
    markers.current.forEach(({ setVisible, category, iconType }) => setVisible(category === "all" || filter === "all" || (filter === "convenience" || filter === "supermarket" ? iconType === filter : category === filter)));
  }, [filter]);

  function showRoute(target: CachedRouteTarget) {
    const map = mapInstance.current;
    const google = window.google;
    const route = cache.routes[target.id];
    if (!map || !google?.maps) return setRouteStatus("地图仍在载入，请稍后再试。");
    if (!route || !Array.isArray(route.path) || route.path.length < 2) return setRouteStatus(`${target.name}的缓存路线暂不可用。`);
    routePolyline.current?.setMap(null);
    routePolyline.current = new google.maps.Polyline({ map, path: route.path, geodesic: true, strokeColor: target.provider === "ekispert" ? "#2d7f71" : "#e6533f", strokeOpacity: .92, strokeWeight: 7 });
    const bounds = new google.maps.LatLngBounds();
    route.path.forEach((point: { lat: number; lng: number }) => bounds.extend(point));
    map.fitBounds(bounds, 72);
    const date = new Date(cache.generatedAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Tokyo" });
    if (target.provider === "ekispert") {
      const lines = Array.isArray(route.steps) ? route.steps.map((step: { line?: string }) => step.line).filter(Boolean).join(" → ") : "";
      setRouteStatus(`${target.name} · Ekispert 缓存约 ${route.durationMinutes} 分钟 · ${route.transferCount ? `换乘 ${route.transferCount} 次` : "直达"}${route.fareYen ? ` · 约 ¥${route.fareYen}` : ""}${lines ? ` · ${lines}` : ""}。快照日期：${date}，点击未调用 API。`);
    } else {
      setRouteStatus(`${target.name} · Google Maps 缓存${modeName(target.mode)}约 ${route.durationText || `${route.durationMinutes} 分钟`} · ${route.distanceText || "距离见路线"}。快照日期：${date}，点击未调用 API。`);
    }
  }

  return <>
    <div ref={mapElement} className="property-map" aria-label={`${title}周边互动地图`} />
    <div className="map-panel"><p className="story-kicker">CACHED MAP · GOOGLE MAPS</p><h2>把通勤、采购与体育馆放到同一张地图。</h2><p>{mapStatus}</p><div className="map-filters">{([['all','全部'],['convenience','便利店'],['supermarket','超市'],['sports','运动'],['transit','交通'],['life','其他生活']] as const).map(([value,label])=><button key={value} onClick={()=>setFilter(value)} className={filter===value?'active':''}>{label}</button>)}</div><div className="route-groups"><section><small>主要通勤 · Ekispert 开发缓存</small><div className="route-picker">{routeTargets.filter((target)=>target.provider==="ekispert").map((target)=><button key={target.id} onClick={()=>showRoute(target)}><b>{target.name}</b><span>{target.sub}</span></button>)}</div></section><section><small>步行 / 驾车 / 体育馆 · Google 开发缓存</small><div className="route-picker">{routeTargets.filter((target)=>target.provider==="google").map((target)=><button key={target.id} onClick={()=>showRoute(target)}><b>{target.name}</b><span>{target.sub}</span></button>)}</div></section></div><div className="route-status">{routeStatus}</div></div>
  </>;
}
