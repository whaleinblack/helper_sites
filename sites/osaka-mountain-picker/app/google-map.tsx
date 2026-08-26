'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import type { MountainArea, MountainRoute, Peak } from './mountain-data';

declare global { interface Window { google?: any; __osakaMountainGoogleLoading?: Promise<void> } }

type Props = {
  areas: MountainArea[];
  peaks: Peak[];
  selectedAreaId: string;
  hoveredAreaId: string | null;
  selectedRoute: MountainRoute | null;
  onHoverArea: (id: string | null) => void;
  onSelectArea: (id: string) => void;
};

function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve();
  if (window.__osakaMountainGoogleLoading) return window.__osakaMountainGoogleLoading;
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return Promise.reject(new Error('missing-key'));
  window.__osakaMountainGoogleLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&language=ja&region=JP`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('load-failed'));
    document.head.appendChild(script);
  });
  return window.__osakaMountainGoogleLoading;
}

export default function GoogleMountainMap(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<Map<string, any>>(new Map());
  const routeRef = useRef<any>(null);
  const [terrainOn, setTerrainOn] = useState(true);
  const [mapStatus, setMapStatus] = useState<'loading'|'ready'|'fallback'>('loading');

  useEffect(() => {
    let cancelled = false;
    const markers = markerRef.current;
    loadGoogleMaps().then(() => {
      if (cancelled || !hostRef.current || !window.google?.maps) return;
      const map = new window.google.maps.Map(hostRef.current, {
        center:{lat:34.82,lng:135.65}, zoom:8, mapTypeId:'terrain', disableDefaultUI:true,
        zoomControl:true, clickableIcons:false, gestureHandling:'greedy',
        styles:[{featureType:'poi.business',stylers:[{visibility:'off'}]},{featureType:'road',elementType:'labels',stylers:[{visibility:'simplified'}]},{featureType:'water',stylers:[{color:'#9eb8b2'}]}],
      });
      mapRef.current = map;
      const gsi = new window.google.maps.ImageMapType({
        getTileUrl:({x,y}: {x:number;y:number},zoom:number) => `https://cyberjapandata.gsi.go.jp/xyz/std/${zoom}/${x}/${y}.png`,
        tileSize:new window.google.maps.Size(256,256), opacity:.3, name:'地理院', maxZoom:18,
      });
      map.__gsiLayer = gsi;
      map.overlayMapTypes.push(gsi);
      props.areas.forEach((area) => {
        const marker = new window.google.maps.Marker({
          map, position:{lat:area.lat,lng:area.lng}, title:area.name,
          label:{text:String(props.peaks.filter((peak)=>peak.areaId===area.id).length),color:'#102113',fontSize:'10px',fontWeight:'800'},
          icon:{path:window.google.maps.SymbolPath.CIRCLE,scale:14,fillColor:'#b7f07d',fillOpacity:.95,strokeColor:'#f5fbf3',strokeWeight:3},
        });
        marker.addListener('mouseover',()=>props.onHoverArea(area.id));
        marker.addListener('mouseout',()=>props.onHoverArea(null));
        marker.addListener('click',()=>props.onSelectArea(area.id));
        markers.set(area.id,marker);
      });
      setMapStatus('ready');
    }).catch(()=>setMapStatus('fallback'));
    return () => { cancelled = true; markers.forEach((marker)=>marker.setMap(null)); markers.clear(); };
  // Initial marker creation is intentionally stable; current callbacks are state setters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    markerRef.current.forEach((marker,id) => {
      const active = id === props.selectedAreaId || id === props.hoveredAreaId;
      marker.setIcon({path:window.google.maps.SymbolPath.CIRCLE,scale:active?18:14,fillColor:active?'#f1b56d':'#b7f07d',fillOpacity:.96,strokeColor:'#f5fbf3',strokeWeight:3});
      marker.setZIndex(active?20:1);
    });
  },[props.hoveredAreaId,props.selectedAreaId]);

  useEffect(() => {
    const area = props.areas.find((item)=>item.id===props.selectedAreaId);
    if (!area || !mapRef.current) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(()=>{
      mapRef.current.panTo({lat:area.lat,lng:area.lng});
      mapRef.current.setZoom(area.distanceKm>180?9:10);
    },reduced?0:500);
    return ()=>window.clearTimeout(timer);
  },[props.areas,props.selectedAreaId]);

  useEffect(() => {
    if (!mapRef.current || !window.google?.maps) return;
    routeRef.current?.setMap(null);
    if (!props.selectedRoute) return;
    routeRef.current = new window.google.maps.Polyline({
      map:mapRef.current,path:props.selectedRoute.path.map(([lat,lng])=>({lat,lng})),
      strokeColor:'#f1b56d',strokeOpacity:1,strokeWeight:5,
    });
  },[props.selectedRoute]);

  function toggleTerrain() {
    const map = mapRef.current;
    if (!map) return;
    if (terrainOn) map.overlayMapTypes.clear(); else map.overlayMapTypes.push(map.__gsiLayer);
    setTerrainOn(!terrainOn);
  }

  return <section className="real-map" aria-label="大阪周边山域地图">
    <div ref={hostRef} className="google-map-host" />
    {mapStatus !== 'ready' && <div className="map-fallback" aria-live="polite">
      <div className="fallback-contours" />
      <span className="fallback-origin">大阪</span>
      {props.areas.map((area,index)=><button type="button" key={area.id} className={props.selectedAreaId===area.id?'active':''} style={{left:`${25+(index*17)%68}%`,top:`${18+(index*23)%66}%`}} onClick={()=>props.onSelectArea(area.id)} aria-label={area.name}><i /><b>{area.name}</b></button>)}
      <p>{mapStatus==='loading'?'地图加载中…':'配置 Google Maps Key 后显示真实地图；当前使用地形预览。'}</p>
    </div>}
    <div className="map-controls">
      <button type="button" className={terrainOn?'active':''} onClick={toggleTerrain} disabled={mapStatus!=='ready'}>地理院</button>
      <span>路线线条为规划示意，不可作离线导航</span>
    </div>
  </section>;
}
