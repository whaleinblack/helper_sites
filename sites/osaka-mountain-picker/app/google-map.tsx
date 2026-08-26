'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { areaMetrics, monthNames, routesForPeak, type MountainArea, type MountainRoute, type Peak } from './mountain-data';
import mountainImages from './mountain-images.json';
import { getMonthInsight } from './month-insights';

declare global { interface Window { google?: any; __osakaMountainGoogleLoading?: Promise<void> } }

type Props = {
  areas: MountainArea[];
  peaks: Peak[];
  basePath: string;
  selectedMonth: number;
  selectedAreaId: string;
  selectedPeakId: string | null;
  detailAreaId: string | null;
  hoveredAreaId: string | null;
  selectedRoute: MountainRoute | null;
  onHoverArea: (id: string | null) => void;
  onSelectArea: (id: string) => void;
  onSelectPeak: (id: string) => void;
};

type DomOverlayRecord = { overlay:any; element:HTMLElement };

const gradeMeaning:Record<string,string>={A:'极佳',B:'推荐',C:'尚可',D:'需斟酌',E:'不太适合',F:'尽可能避开'};

function recommendationGrade(score:number){
  if(score>=90)return 'A';
  if(score>=80)return 'B';
  if(score>=70)return 'C';
  if(score>=55)return 'D';
  if(score>=40)return 'E';
  return 'F';
}

function routeRange(peakId:string){
  const constants=routesForPeak(peakId).map((route)=>route.courseConstant);
  if(!constants.length)return '待整理';
  const min=Math.min(...constants);
  const max=Math.max(...constants);
  return min===max?String(min):`${min}–${max}`;
}

function viewportMapScale(){
  if(window.innerWidth>=3400&&window.innerHeight>=1800)return 2;
  if(window.innerWidth>=2800&&window.innerHeight>=1500)return 1.5;
  if(window.innerWidth>=2200&&window.innerHeight>=1200)return 1.25;
  return 1;
}

function mapCardScale(map:any){
  const zoom=Number(map.getZoom?.()??8);
  const zoomScale=zoom<=7?.48:zoom<=8?.58:zoom<=9?.68:zoom<=10?.78:zoom<=11?.88:1;
  return zoomScale*viewportMapScale();
}

function applyMapCardScale(element:HTMLElement,map:any){
  const scale=mapCardScale(map);
  element.dataset.baseScale=String(scale);
  if(!element.matches(':hover'))element.style.setProperty('--map-card-scale',String(scale));
}

function expandMapCard(element:HTMLElement){
  const base=Number(element.dataset.baseScale??1);
  element.style.setProperty('--map-card-scale',String(Math.max(base,.88*viewportMapScale())));
}

function createDomOverlay(map:any,position:{lat:number;lng:number},element:HTMLElement){
  class DomOverlay extends window.google.maps.OverlayView {
    point:any;
    node:HTMLElement;
    constructor(){super();this.point=new window.google.maps.LatLng(position);this.node=element}
    onAdd(){this.getPanes()?.overlayMouseTarget.appendChild(this.node)}
    draw(){const pixel=this.getProjection()?.fromLatLngToDivPixel(this.point);if(pixel){this.node.style.left=`${pixel.x}px`;this.node.style.top=`${pixel.y}px`}}
    onRemove(){this.node.remove()}
  }
  const overlay=new DomOverlay();
  overlay.setMap(map);
  return overlay;
}

function clearOverlays(records:Map<string,DomOverlayRecord>){
  records.forEach(({overlay})=>overlay.setMap(null));
  records.clear();
}

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
  const areaOverlayRef = useRef<Map<string, DomOverlayRecord>>(new Map());
  const peakOverlayRef = useRef<Map<string, DomOverlayRecord>>(new Map());
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
    const areaOverlays = areaOverlayRef.current;
    const peakOverlays = peakOverlayRef.current;
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
      clearOverlays(areaOverlays);
      clearOverlays(peakOverlays);
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
    if(mapStatus!=='ready'||!mapRef.current)return;
    const map=mapRef.current;
    const update=()=>{
      areaOverlayRef.current.forEach(({element})=>applyMapCardScale(element,map));
      peakOverlayRef.current.forEach(({element})=>applyMapCardScale(element,map));
    };
    const listener=map.addListener('zoom_changed',update);
    window.addEventListener('resize',update);
    update();
    return()=>{listener.remove();window.removeEventListener('resize',update)};
  },[mapStatus]);

  useEffect(()=>{
    if(mapStatus!=='ready'||!mapRef.current||!window.google?.maps)return;
    const map=mapRef.current;
    const overlays=areaOverlayRef.current;
    clearOverlays(overlays);
    if(!preferences.showMarkers||props.detailAreaId)return;
    props.areas.forEach((area)=>{
      const score=area.monthScores[props.selectedMonth];
      const grade=recommendationGrade(score);
      const insight=getMonthInsight(area,props.selectedMonth);
      const root=document.createElement('div');
      root.className=`map-area-card-anchor ${props.selectedAreaId===area.id?'active ':''}${area.lng>136?'report-left':''}`;
      const photo=mountainImages[area.id as keyof typeof mountainImages];
      root.style.setProperty('--map-area-photo',`url("${props.basePath}${photo.src}")`);
      applyMapCardScale(root,map);
      root.addEventListener('mouseenter',()=>{expandMapCard(root);callbacksRef.current.onHoverArea(area.id)});
      root.addEventListener('mouseleave',()=>{applyMapCardScale(root,map);callbacksRef.current.onHoverArea(null)});

      const button=document.createElement('button');
      button.type='button';
      button.className='map-area-photo-card';
      button.setAttribute('aria-label',`选择${area.name}，${monthNames[props.selectedMonth]}评级${grade}${score}分`);
      button.addEventListener('click',(event)=>{event.stopPropagation();callbacksRef.current.onSelectArea(area.id)});

      const head=document.createElement('span');
      head.className='map-area-card-head';
      const title=document.createElement('span');
      const name=document.createElement('strong');
      name.textContent=area.name;
      const elevation=document.createElement('small');
      elevation.textContent=`最高 ${areaMetrics(area.id).highest.toLocaleString()}m`;
      title.append(name,elevation);
      const gradeNode=document.createElement('b');
      gradeNode.className=`grade-${grade.toLowerCase()}`;
      gradeNode.textContent=grade;
      head.append(title,gradeNode);
      button.appendChild(head);

      const report=document.createElement('aside');
      report.className='map-area-score-report';
      const reportHead=document.createElement('header');
      const reportName=document.createElement('strong');
      reportName.textContent=`${area.name} · ${monthNames[props.selectedMonth]}`;
      const reportGrade=document.createElement('b');
      reportGrade.className=`grade-${grade.toLowerCase()}`;
      reportGrade.textContent=`${grade}${score}`;
      reportHead.append(reportName,reportGrade);
      report.appendChild(reportHead);
      const grid=document.createElement('div');
      grid.className='map-area-score-grid';
      insight.items.forEach((item)=>{
        const row=document.createElement('span');
        row.className=`tone-${item.tone}${item.wide?' insight-wide':''}`;
        const label=document.createElement('small');
        label.textContent=item.label;
        const value=document.createElement('b');
        value.textContent=item.value;
        row.append(label,value);
        grid.appendChild(row);
      });
      const overall=document.createElement('p');
      overall.textContent=`综合：${gradeMeaning[grade]} · ${insight.summary}`;
      report.append(grid,overall);
      root.append(button,report);

      const overlay=createDomOverlay(map,{lat:area.lat,lng:area.lng},root);
      overlays.set(area.id,{overlay,element:root});
    });
    return()=>clearOverlays(overlays);
  },[mapStatus,preferences.showMarkers,props.areas,props.basePath,props.detailAreaId,props.selectedAreaId,props.selectedMonth]);

  useEffect(()=>{
    if(mapStatus!=='ready'||!mapRef.current||!window.google?.maps)return;
    const map=mapRef.current;
    const overlays=peakOverlayRef.current;
    clearOverlays(overlays);
    const detailPeaks=props.detailAreaId?props.peaks.filter((peak)=>peak.areaId===props.detailAreaId):[];
    if(!preferences.showMarkers)return;
    detailPeaks.forEach((peak,index)=>{
      const root=document.createElement('div');
      root.className=`map-peak-card-anchor ${index%2?'side-left ':''}${props.selectedPeakId===peak.id?'active':''}`;
      applyMapCardScale(root,map);
      root.addEventListener('mouseenter',()=>{expandMapCard(root);callbacksRef.current.onHoverArea(peak.areaId)});
      root.addEventListener('mouseleave',()=>{applyMapCardScale(root,map);callbacksRef.current.onHoverArea(null)});
      const point=document.createElement('i');
      point.className='map-peak-glow-point';
      const connector=document.createElement('i');
      connector.className='map-peak-connector';
      const button=document.createElement('button');
      button.type='button';
      button.className='map-peak-card';
      button.setAttribute('aria-label',`选择山峰${peak.name}，海拔${peak.elevation}米`);
      button.addEventListener('click',(event)=>{event.stopPropagation();callbacksRef.current.onSelectPeak(peak.id)});
      const name=document.createElement('strong');
      name.textContent=peak.name;
      const facts=document.createElement('span');
      facts.textContent=`${peak.elevation.toLocaleString()}m · 定数 ${routeRange(peak.id)}`;
      const tags=document.createElement('span');
      tags.className='map-peak-tags';
      const labels=(peak.lists.length?peak.lists:peak.tags).slice(0,2);
      labels.forEach((label)=>{
        const chip=document.createElement('small');
        chip.textContent=label;
        tags.appendChild(chip);
      });
      button.append(name,facts);
      if(labels.length)button.appendChild(tags);
      root.append(point,connector,button);
      const overlay=createDomOverlay(map,{lat:peak.lat,lng:peak.lng},root);
      overlays.set(peak.id,{overlay,element:root});
    });
    return()=>clearOverlays(overlays);
  },[mapStatus,preferences.showMarkers,props.detailAreaId,props.peaks,props.selectedPeakId]);

  useEffect(()=>{
    areaOverlayRef.current.forEach(({element},id)=>element.classList.toggle('hovered',id===props.hoveredAreaId));
  },[props.hoveredAreaId]);

  useEffect(() => {
    const map=mapRef.current;
    if (!map) return;
    const selectedPeak=props.peaks.find((peak)=>peak.id===props.selectedPeakId);
    const detailPeaks=props.detailAreaId?props.peaks.filter((peak)=>peak.areaId===props.detailAreaId):[];
    const area=props.detailAreaId?props.areas.find((item)=>item.id===props.detailAreaId):null;
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
