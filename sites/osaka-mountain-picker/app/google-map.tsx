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
  const [terrainOn, setTerrainOn] = useState(true);
  const [mapStatus, setMapStatus] = useState<'loading'|'ready'|'fallback'>('loading');

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
        styles:[{featureType:'poi.business',stylers:[{visibility:'off'}]},{featureType:'road',elementType:'labels',stylers:[{visibility:'simplified'}]},{featureType:'water',stylers:[{color:'#9eb8b2'}]}],
      });
      mapRef.current = map;
      const gsi = new window.google.maps.ImageMapType({
        getTileUrl:({x,y}: {x:number;y:number},zoom:number) => `https://cyberjapandata.gsi.go.jp/xyz/std/${zoom}/${x}/${y}.png`,
        tileSize:new window.google.maps.Size(256,256), opacity:.3, name:'地理院', maxZoom:18,
      });
      map.__gsiLayer = gsi;
      map.overlayMapTypes.push(gsi);
      setMapStatus('ready');
    }).catch(()=>setMapStatus('fallback'));
    return () => {
      cancelled = true;
      markers.forEach((marker)=>marker.setMap(null));
      markers.clear();
      peakMarkers.forEach((marker)=>marker.setMap(null));
      peakMarkers.clear();
    };
  }, []);

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
      marker.setMap(props.detailAreaId===area.id?null:map);
    });
  },[mapStatus,props.areas,props.detailAreaId,props.peaks]);

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
      marker.setMap(map);
    });
  },[mapStatus,props.detailAreaId,props.peaks]);

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
