'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import type { MountainArea, MountainRoute, Peak } from './mountain-data';

declare global { interface Window { google?: any; __osakaMountainGoogleLoading?: Promise<void> } }

type Props = {
  areas: MountainArea[];
  peaks: Peak[];
  selectedAreaId: string;
  selectedPeakId: string | null;
  detailAreaId: string | null;
  hoveredAreaId: string | null;
  selectedRoute: MountainRoute | null;
  onHoverArea: (id: string | null) => void;
  onSelectArea: (id: string) => void;
  onSelectPeak: (id: string) => void;
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

function mapDisplayScale() {
  if(window.innerWidth>=3400&&window.innerHeight>=1800)return 2;
  if(window.innerWidth>=2800&&window.innerHeight>=1500)return 1.5;
  if(window.innerWidth>=2200&&window.innerHeight>=1200)return 1.25;
  return 1;
}

type BaseMapType='terrain'|'roadmap'|'satellite'|'hybrid';
type GsiOverlay='none'|'std'|'pale'|'hillshademap'|'slopemap'|'sekishoku';
type MapPreferences={
  baseMap:BaseMapType;
  gsiOverlay:GsiOverlay;
  overlayOpacity:number;
  showLabels:boolean;
  showRoads:boolean;
  showPoi:boolean;
  showTraffic:boolean;
  showTransit:boolean;
  showBicycling:boolean;
  showMarkers:boolean;
  showRoute:boolean;
  gestureHandling:'greedy'|'cooperative';
};

const DEFAULT_MAP_PREFERENCES:MapPreferences={
  baseMap:'terrain',
  gsiOverlay:'std',
  overlayOpacity:30,
  showLabels:true,
  showRoads:true,
  showPoi:false,
  showTraffic:false,
  showTransit:false,
  showBicycling:false,
  showMarkers:true,
  showRoute:true,
  gestureHandling:'greedy',
};

const GSI_OVERLAYS:Record<Exclude<GsiOverlay,'none'>,{tile:string;name:string;maxZoom:number}>={
  std:{tile:'std',name:'地理院标准',maxZoom:18},
  pale:{tile:'pale',name:'地理院淡色',maxZoom:18},
  hillshademap:{tile:'hillshademap',name:'阴影起伏',maxZoom:16},
  slopemap:{tile:'slopemap',name:'坡度',maxZoom:15},
  sekishoku:{tile:'sekishoku',name:'红色立体',maxZoom:14},
};

function mapStyles(preferences:MapPreferences){
  return [
    {elementType:'labels',stylers:[{visibility:preferences.showLabels?'on':'off'}]},
    {featureType:'road',stylers:[{visibility:preferences.showRoads?'simplified':'off'}]},
    {featureType:'poi',stylers:[{visibility:preferences.showPoi?'on':'off'}]},
    {featureType:'water',stylers:[{color:'#9eb8b2'}]},
  ];
}

export default function GoogleMountainMap(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<Map<string, any>>(new Map());
  const peakMarkerRef = useRef<Map<string, any>>(new Map());
  const callbacksRef = useRef({
    onHoverArea:props.onHoverArea,
    onSelectArea:props.onSelectArea,
    onSelectPeak:props.onSelectPeak,
  });
  const routeRef = useRef<any>(null);
  const trafficRef = useRef<any>(null);
  const transitRef = useRef<any>(null);
  const bicyclingRef = useRef<any>(null);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [preferences,setPreferences]=useState<MapPreferences>(DEFAULT_MAP_PREFERENCES);
  const [mapStatus, setMapStatus] = useState<'loading'|'ready'|'fallback'>('loading');

  useEffect(()=>{
    if(!settingsOpen)return;
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setSettingsOpen(false)};
    window.addEventListener('keydown',close);
    return()=>window.removeEventListener('keydown',close);
  },[settingsOpen]);

  useEffect(()=>{
    callbacksRef.current={
      onHoverArea:props.onHoverArea,
      onSelectArea:props.onSelectArea,
      onSelectPeak:props.onSelectPeak,
    };
  },[props.onHoverArea,props.onSelectArea,props.onSelectPeak]);

  useEffect(() => {
    let cancelled = false;
    const markers = markerRef.current;
    const peakMarkers = peakMarkerRef.current;
    loadGoogleMaps().then(() => {
      if (cancelled || !hostRef.current || !window.google?.maps) return;
      const map = new window.google.maps.Map(hostRef.current, {
        center:{lat:34.82,lng:135.65}, zoom:8, mapTypeId:'terrain', disableDefaultUI:true,
        zoomControl:true, clickableIcons:false, gestureHandling:'greedy',
        styles:mapStyles(DEFAULT_MAP_PREFERENCES),
      });
      mapRef.current = map;
      map.__gsiLayers=Object.fromEntries(Object.entries(GSI_OVERLAYS).map(([id,spec])=>[id,new window.google.maps.ImageMapType({
        getTileUrl:({x,y}: {x:number;y:number},zoom:number) => `https://cyberjapandata.gsi.go.jp/xyz/${spec.tile}/${zoom}/${x}/${y}.png`,
        tileSize:new window.google.maps.Size(256,256),opacity:DEFAULT_MAP_PREFERENCES.overlayOpacity/100,name:spec.name,maxZoom:spec.maxZoom,
      })]));
      trafficRef.current=new window.google.maps.TrafficLayer();
      transitRef.current=new window.google.maps.TransitLayer();
      bicyclingRef.current=new window.google.maps.BicyclingLayer();
      setMapStatus('ready');
    }).catch(()=>setMapStatus('fallback'));
    return () => {
      cancelled = true;
      markers.forEach((marker)=>marker.setMap(null));
      markers.clear();
      peakMarkers.forEach((marker)=>marker.setMap(null));
      peakMarkers.clear();
      trafficRef.current?.setMap(null);
      transitRef.current?.setMap(null);
      bicyclingRef.current?.setMap(null);
    };
  }, []);

  useEffect(()=>{
    if(mapStatus!=='ready'||!mapRef.current)return;
    const map=mapRef.current;
    map.setMapTypeId(preferences.baseMap);
    map.setOptions({gestureHandling:preferences.gestureHandling,styles:mapStyles(preferences)});
    map.overlayMapTypes.clear();
    if(preferences.gsiOverlay!=='none'){
      const overlay=map.__gsiLayers?.[preferences.gsiOverlay];
      overlay?.setOpacity(preferences.overlayOpacity/100);
      if(overlay)map.overlayMapTypes.push(overlay);
    }
    trafficRef.current?.setMap(preferences.showTraffic?map:null);
    transitRef.current?.setMap(preferences.showTransit?map:null);
    bicyclingRef.current?.setMap(preferences.showBicycling?map:null);
  },[mapStatus,preferences]);

  useEffect(()=>{
    if(mapStatus!=='ready'||!mapRef.current||!window.google?.maps)return;
    const map=mapRef.current;
    const displayScale=mapDisplayScale();
    const visibleIds=new Set(props.areas.map((area)=>area.id));
    markerRef.current.forEach((marker,id)=>{
      if(!visibleIds.has(id)){marker.setMap(null);markerRef.current.delete(id)}
    });
    props.areas.forEach((area)=>{
      let marker=markerRef.current.get(area.id);
      if(!marker){
        marker=new window.google.maps.Marker({
          position:{lat:area.lat,lng:area.lng},
          title:area.name,
          label:{text:String(props.peaks.filter((peak)=>peak.areaId===area.id).length),color:'#102113',fontSize:`${10*displayScale}px`,fontWeight:'800'},
          icon:{path:window.google.maps.SymbolPath.CIRCLE,scale:14*displayScale,fillColor:'#b7f07d',fillOpacity:.95,strokeColor:'#f5fbf3',strokeWeight:3*displayScale},
        });
        marker.addListener('mouseover',()=>callbacksRef.current.onHoverArea(area.id));
        marker.addListener('mouseout',()=>callbacksRef.current.onHoverArea(null));
        marker.addListener('click',()=>callbacksRef.current.onSelectArea(area.id));
        markerRef.current.set(area.id,marker);
      }
      marker.setMap(preferences.showMarkers&&props.detailAreaId!==area.id?map:null);
    });
  },[mapStatus,preferences.showMarkers,props.areas,props.detailAreaId,props.peaks]);

  useEffect(()=>{
    if(mapStatus!=='ready'||!mapRef.current||!window.google?.maps)return;
    const map=mapRef.current;
    const displayScale=mapDisplayScale();
    const detailPeaks=props.detailAreaId?props.peaks.filter((peak)=>peak.areaId===props.detailAreaId):[];
    const visibleIds=new Set(detailPeaks.map((peak)=>peak.id));
    peakMarkerRef.current.forEach((marker,id)=>{
      if(!visibleIds.has(id)){marker.setMap(null);peakMarkerRef.current.delete(id)}
    });
    detailPeaks.forEach((peak)=>{
      let marker=peakMarkerRef.current.get(peak.id);
      if(!marker){
        marker=new window.google.maps.Marker({
          map,
          position:{lat:peak.lat,lng:peak.lng},
          title:`${peak.name} · ${peak.elevation.toLocaleString()}m`,
          icon:{path:window.google.maps.SymbolPath.CIRCLE,scale:8*displayScale,fillColor:'#b7f07d',fillOpacity:.98,strokeColor:'#f5fbf3',strokeWeight:2*displayScale},
        });
        marker.addListener('mouseover',()=>callbacksRef.current.onHoverArea(peak.areaId));
        marker.addListener('mouseout',()=>callbacksRef.current.onHoverArea(null));
        marker.addListener('click',()=>callbacksRef.current.onSelectPeak(peak.id));
        peakMarkerRef.current.set(peak.id,marker);
      }
      marker.setMap(preferences.showMarkers?map:null);
    });
  },[mapStatus,preferences.showMarkers,props.detailAreaId,props.peaks]);

  useEffect(() => {
    const displayScale=mapDisplayScale();
    markerRef.current.forEach((marker,id) => {
      const active = id === props.selectedAreaId || id === props.hoveredAreaId;
      marker.setIcon({path:window.google.maps.SymbolPath.CIRCLE,scale:(active?18:14)*displayScale,fillColor:active?'#f1b56d':'#b7f07d',fillOpacity:.96,strokeColor:'#f5fbf3',strokeWeight:3*displayScale});
      marker.setZIndex(active?20:1);
    });
  },[props.hoveredAreaId,props.selectedAreaId]);

  useEffect(() => {
    const displayScale=mapDisplayScale();
    peakMarkerRef.current.forEach((marker,id)=>{
      const active=id===props.selectedPeakId;
      marker.setIcon({path:window.google.maps.SymbolPath.CIRCLE,scale:(active?12:8)*displayScale,fillColor:active?'#f1b56d':'#b7f07d',fillOpacity:.98,strokeColor:'#f5fbf3',strokeWeight:(active?3:2)*displayScale});
      marker.setZIndex(active?30:5);
    });
  },[props.selectedPeakId,props.detailAreaId]);

  useEffect(() => {
    const map=mapRef.current;
    if (!map) return;
    const selectedPeak=props.peaks.find((peak)=>peak.id===props.selectedPeakId);
    const detailPeaks=props.detailAreaId?props.peaks.filter((peak)=>peak.areaId===props.detailAreaId):[];
    const area=props.areas.find((item)=>item.id===props.selectedAreaId);
    if(!selectedPeak&&!detailPeaks.length&&!area)return;
    const focusPoints=selectedPeak?[selectedPeak]:detailPeaks.length?detailPeaks:area?[area]:[];
    const center={
      lat:focusPoints.reduce((sum,item)=>sum+item.lat,0)/focusPoints.length,
      lng:focusPoints.reduce((sum,item)=>sum+item.lng,0)/focusPoints.length,
    };
    const latitudes=focusPoints.map((item)=>item.lat);
    const longitudes=focusPoints.map((item)=>item.lng);
    const spread=Math.max(Math.max(...latitudes)-Math.min(...latitudes),Math.max(...longitudes)-Math.min(...longitudes));
    const targetZoom=selectedPeak?14:detailPeaks.length?(spread>.3?9:spread>.16?10:spread>.08?11:spread>.035?12:13):(area?.distanceKm??0)>180?9:10;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timers:number[]=[];
    map.panTo(center);
    const zoomStep=()=>{
      const current=Math.round(map.getZoom()??8);
      if(current===targetZoom)return;
      map.setZoom(current+(current<targetZoom?1:-1));
      timers.push(window.setTimeout(zoomStep,reduced?0:130));
    };
    timers.push(window.setTimeout(zoomStep,reduced?0:520));
    return()=>timers.forEach((timer)=>window.clearTimeout(timer));
  },[props.areas,props.detailAreaId,props.peaks,props.selectedAreaId,props.selectedPeakId]);

  useEffect(() => {
    if (!mapRef.current || !window.google?.maps) return;
    routeRef.current?.setMap(null);
    if (!props.selectedRoute||!preferences.showRoute) return;
    routeRef.current = new window.google.maps.Polyline({
      map:mapRef.current,path:props.selectedRoute.path.map(([lat,lng])=>({lat,lng})),
      strokeColor:'#f1b56d',strokeOpacity:1,strokeWeight:5,
    });
  },[preferences.showRoute,props.selectedRoute]);

  function updatePreference<K extends keyof MapPreferences>(key:K,value:MapPreferences[K]){
    setPreferences((current)=>({...current,[key]:value}));
  }

  function resetCamera(){
    mapRef.current?.panTo({lat:34.82,lng:135.65});
    mapRef.current?.setZoom(8);
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
      <button type="button" className={settingsOpen?'active':''} aria-expanded={settingsOpen} aria-controls="map-detail-settings" onClick={()=>setSettingsOpen((open)=>!open)} disabled={mapStatus!=='ready'}>地图设置</button>
      <span>路线线条为规划示意，不可作离线导航</span>
    </div>
    {settingsOpen&&<aside id="map-detail-settings" className="map-settings" aria-label="地图详细设置">
      <header><div><small>OUTDOOR MAP</small><b>地图详细设置</b></div><button type="button" aria-label="关闭地图设置" onClick={()=>setSettingsOpen(false)}>×</button></header>
      <section><span className="map-setting-label">Google 底图</span><div className="map-type-options">{([['terrain','地形'],['roadmap','道路'],['satellite','卫星'],['hybrid','混合']] as const).map(([id,label])=><button type="button" className={preferences.baseMap===id?'active':''} key={id} onClick={()=>updatePreference('baseMap',id)}>{label}</button>)}</div></section>
      <section><label className="map-select-label"><span>地理院户外叠加层</span><select value={preferences.gsiOverlay} onChange={(event)=>updatePreference('gsiOverlay',event.target.value as GsiOverlay)}><option value="none">关闭</option><option value="std">标准地形图</option><option value="pale">淡色地形图</option><option value="hillshademap">阴影起伏图</option><option value="slopemap">坡度图</option><option value="sekishoku">红色立体图</option></select></label><label className="map-opacity"><span>叠加透明度 <b>{preferences.overlayOpacity}%</b></span><input type="range" min="0" max="100" step="5" disabled={preferences.gsiOverlay==='none'} value={preferences.overlayOpacity} onChange={(event)=>updatePreference('overlayOpacity',Number(event.target.value))}/></label></section>
      <section><span className="map-setting-label">地图内容</span><div className="map-toggle-grid">{([
        ['showLabels','地名标签'],['showRoads','道路'],['showPoi','地点'],['showMarkers','山峰标点'],['showRoute','路线示意'],['showTraffic','实时交通'],['showTransit','公共交通'],['showBicycling','自行车道'],
      ] as const).map(([key,label])=><label key={key}><input type="checkbox" checked={preferences[key]} onChange={(event)=>updatePreference(key,event.target.checked)}/><span>{label}</span></label>)}</div></section>
      <section><label className="map-select-label"><span>地图手势</span><select value={preferences.gestureHandling} onChange={(event)=>updatePreference('gestureHandling',event.target.value as MapPreferences['gestureHandling'])}><option value="greedy">单指直接拖动</option><option value="cooperative">双指拖动地图</option></select></label><p>交通、自行车与公共交通覆盖范围由 Google Maps 决定。</p></section>
      <footer><button type="button" onClick={resetCamera}>回到大阪全景</button><button type="button" onClick={()=>setPreferences(DEFAULT_MAP_PREFERENCES)}>恢复默认</button></footer>
    </aside>}
    {preferences.gsiOverlay!=='none'&&<a className="gsi-attribution" href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル ↗</a>}
  </section>;
}
