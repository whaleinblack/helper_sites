'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import GoogleMountainMap from './google-map';
import { areaMetrics, bodyGrade, isJapanHundredPeak, monthNames, mountainAreas, peaks, peaksForArea, routes, routesForArea, routesForPeak, type MountainArea } from './mountain-data';
import mountainImages from './mountain-images.json';
import { matchesMountainSearch } from './mountain-search';
import { getMonthInsight } from './month-insights';

type WeatherDay = { date:string; min:number; max:number; pop:number; rain:number; wind:number; summary:string };
type WeatherResponse = { status:'fresh'|'refreshed'|'stale'|'unconfigured'; updatedAt:string|null; availableDays:number; days:WeatherDay[]; stale:boolean; message?:string };
type SortKey = 'recommended'|'distance'|'drive'|'transit'|'elevation'|'course-min'|'course-max'|'popularity';
const unconfiguredWeather: WeatherResponse = {
  status:'unconfigured',updatedAt:null,availableDays:0,days:[],stale:false,
  message:'实时天气未配置；月度气候档案仍可使用。',
};

const phases = [{id:1,ja:'探す',zh:'选山'},{id:2,ja:'歩く',zh:'路线'},{id:3,ja:'行く',zh:'条件'},{id:4,ja:'決める',zh:'决定'}];
const currentMonthIndex = new Date().getMonth();

function formatMinutes(minutes:number) { const h=Math.floor(minutes/60); const m=minutes%60; return h?`${h}h ${m?`${m}m`:''}`:`${m}m`; }
function rangeLabel(areaId:string) { const m=areaMetrics(areaId); return m.minCourse===null?'待整理':`${m.minCourse}–${m.maxCourse}`; }
function peakRangeLabel(peakId:string) { const constants=routesForPeak(peakId).map((route)=>route.courseConstant); return constants.length?`${Math.min(...constants)}–${Math.max(...constants)}`:'待整理'; }
type RecommendationGrade='A'|'B'|'C'|'D'|'E'|'F';
function recommendationGrade(score:number):RecommendationGrade { if(score>=90)return'A';if(score>=80)return'B';if(score>=70)return'C';if(score>=55)return'D';if(score>=40)return'E';return'F'; }
function courseTone(value:number|null) { if(value===null||value<30)return'course-low';if(value<50)return'course-medium';if(value<70)return'course-high';return'course-extreme'; }
const gradeMeaning={A:'极佳',B:'推荐',C:'尚可',D:'需斟酌',E:'不太适合',F:'尽可能避开'} as const;
function MonthInsightPopover({area,month}:{area:MountainArea;month:number}){
  const triggerRef=useRef<HTMLSpanElement>(null);
  const [position,setPosition]=useState<{left:number;top:number;scale:number}|null>(null);
  const score=area.monthScores[month];
  const grade=recommendationGrade(score);
  const insight=getMonthInsight(area,month);
  useEffect(()=>{
    const anchor=triggerRef.current?.parentElement;
    if(!anchor)return;
    const scaleForViewport=()=>window.innerWidth>=3400&&window.innerHeight>=1800?2:window.innerWidth>=2800&&window.innerHeight>=1500?1.5:window.innerWidth>=2200&&window.innerHeight>=1200?1.25:1;
    const place=(clientX:number,clientY:number)=>{
      const scale=scaleForViewport();
      const width=320*scale;
      const height=250*scale;
      const gap=18;
      const left=clientX+gap+width<=window.innerWidth-12?clientX+gap:Math.max(12,clientX-width-gap);
      const top=Math.max(12,Math.min(clientY-22,window.innerHeight-height-12));
      setPosition({left,top,scale});
    };
    const enter=(event:Event)=>{const pointer=event as MouseEvent;place(pointer.clientX,pointer.clientY)};
    const move=(event:Event)=>{const pointer=event as MouseEvent;place(pointer.clientX,pointer.clientY)};
    const leave=()=>setPosition(null);
    const focus=()=>{const rect=anchor.getBoundingClientRect();place(rect.right,rect.top+rect.height/2)};
    const blur=(event:Event)=>{if(!anchor.contains((event as FocusEvent).relatedTarget as Node|null))setPosition(null)};
    anchor.addEventListener('mouseenter',enter);
    anchor.addEventListener('mousemove',move);
    anchor.addEventListener('mouseleave',leave);
    anchor.addEventListener('focusin',focus);
    anchor.addEventListener('focusout',blur);
    return()=>{
      anchor.removeEventListener('mouseenter',enter);
      anchor.removeEventListener('mousemove',move);
      anchor.removeEventListener('mouseleave',leave);
      anchor.removeEventListener('focusin',focus);
      anchor.removeEventListener('focusout',blur);
    };
  },[]);
  const popover=position?<span className="month-insight month-insight-floating" role="tooltip" style={{left:position.left,top:position.top,'--popover-scale':position.scale} as CSSProperties}>
    <span className="month-insight-head"><span><b>{area.name} · {monthNames[month]}</b></span><strong className={`grade-${grade.toLowerCase()}`}>{grade}<small>{score}</small></strong></span>
    <span className="month-insight-grid">{insight.items.map((item)=><span className={`insight-row tone-${item.tone}`} title={item.detail} key={item.label}><small>{item.label}</small><b>{item.value}</b></span>)}</span>
    <span className="month-insight-summary month-insight-overall">综合：{gradeMeaning[grade]} · {insight.summary}</span>
  </span>:null;
  return <><span ref={triggerRef} className="month-insight-trigger" aria-hidden="true"/>{popover&&createPortal(popover,document.body)}</>;
}

function WeatherGlyph({summary}:{summary:string}){
  if(/雷|thunder/i.test(summary))return <svg viewBox="0 0 24 24" aria-label={summary}><path d="M7 17a4 4 0 1 1 1-7.87A6 6 0 0 1 19 12a3 3 0 0 1-3 3h-3l-2 4h3l-4 4 1-5H8"/></svg>;
  if(/雨|rain|drizzle/i.test(summary))return <svg viewBox="0 0 24 24" aria-label={summary}><path d="M7 16a4 4 0 1 1 1-7.87A6 6 0 0 1 19 11a3 3 0 0 1-3 3H7m2 3-1 2m5-2-1 2m5-2-1 2"/></svg>;
  if(/雪|snow/i.test(summary))return <svg viewBox="0 0 24 24" aria-label={summary}><path d="M7 15a4 4 0 1 1 1-7.87A6 6 0 0 1 19 10a3 3 0 0 1-3 3H7m3 4h.01M14 17h.01M12 20h.01"/></svg>;
  if(/云|cloud|曇|雾|mist|fog/i.test(summary))return <svg viewBox="0 0 24 24" aria-label={summary}><path d="M6 17a4 4 0 1 1 1.2-7.82A6 6 0 0 1 18.7 11 3 3 0 0 1 17 17H6Z"/></svg>;
  return <svg viewBox="0 0 24 24" aria-label={summary}><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>;
}

type MountainPickerAppProps = {
  displayName: string;
  deploymentMode?: 'private' | 'public';
  basePath?: string;
  weatherEndpoint?: string | null;
};

export default function MountainPickerApp({
  displayName,
  deploymentMode = 'private',
  basePath = '',
  weatherEndpoint = '/api/weather',
}: MountainPickerAppProps) {
  const normalizedBasePath = basePath.replace(/\/$/, '');
  const [phase,setPhase]=useState(1);
  const [phaseDirection,setPhaseDirection]=useState<'forward'|'back'>('forward');
  const [selectedMonth,setSelectedMonth]=useState(currentMonthIndex);
  const [selectedAreaId,setSelectedAreaId]=useState('rokko');
  const [selectedPeakId,setSelectedPeakId]=useState<string|null>(null);
  const [selectedRouteId,setSelectedRouteId]=useState<string|null>(routes[0]?.id??null);
  const [expandedAreaId,setExpandedAreaId]=useState<string|null>('rokko');
  const [hoveredAreaId,setHoveredAreaId]=useState<string|null>(null);
  const [query,setQuery]=useState('');
  const [rehabMode,setRehabMode]=useState(true);
  const [dayTripOnly,setDayTripOnly]=useState(false);
  const [famousOnly,setFamousOnly]=useState(false);
  const [maxDrive,setMaxDrive]=useState(240);
  const [sortKey,setSortKey]=useState<SortKey>('recommended');
  const [weatherByArea,setWeatherByArea]=useState<Record<string,WeatherResponse>>({});
  const requestedWeather=useRef(new Set<string>());
  const selectedArea=mountainAreas.find((area)=>area.id===selectedAreaId)??mountainAreas[0];
  const selectedPeak=peaks.find((peak)=>peak.id===selectedPeakId)??null;
  const subjectRoutes=selectedPeak?routesForPeak(selectedPeak.id):routesForArea(selectedArea.id);
  const selectedRoute=subjectRoutes.find((route)=>route.id===selectedRouteId)??subjectRoutes[0]??null;
  const weather=weatherByArea[selectedAreaId]??(weatherEndpoint?null:unconfiguredWeather);
  const weatherLoading=!weather;

  const filteredAreas=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    const copy=mountainAreas.filter((area)=>{
      const areaPeaks=peaksForArea(area.id);
      if (needle&&!matchesMountainSearch(area,areaPeaks,needle)) return false;
      if (area.driveMinutes>maxDrive) return false;
      if (famousOnly&&!areaPeaks.some(isJapanHundredPeak)) return false;
      if (dayTripOnly&&!area.tags.includes('日归')&&!areaPeaks.some((peak)=>peak.tags.includes('日归'))) return false;
      return true;
    });
    const score=(area:MountainArea)=>{
      const m=areaMetrics(area.id);
      if(sortKey==='distance')return area.distanceKm;if(sortKey==='drive')return area.driveMinutes;if(sortKey==='transit')return area.transitMinutes;
      if(sortKey==='elevation')return -m.highest;if(sortKey==='course-min')return m.minCourse??999;if(sortKey==='course-max')return m.maxCourse??999;
      if(sortKey==='popularity')return -area.popularity;
      const rehabBonus=rehabMode&&m.minCourse!==null&&m.minCourse<=20?18:0;
      return -(area.monthScores[selectedMonth]*.58+area.popularity*.12+(240-area.driveMinutes)*.08+rehabBonus);
    };
    return copy.sort((a,b)=>score(a)-score(b));
  },[dayTripOnly,famousOnly,maxDrive,query,rehabMode,selectedMonth,sortKey]);

  useEffect(()=>{
    if (!weatherEndpoint) return;
    const targets=phase===1?filteredAreas:mountainAreas.filter((area)=>area.id===selectedAreaId);
    for(const area of targets){
      if(requestedWeather.current.has(area.id))continue;
      requestedWeather.current.add(area.id);
      fetch(`${weatherEndpoint}?rangeId=${encodeURIComponent(area.id)}`)
        .then(async(response)=>{if(!response.ok)throw new Error('weather');return response.json() as Promise<WeatherResponse>})
        .then(data=>setWeatherByArea((current)=>({...current,[area.id]:data})))
        .catch(()=>setWeatherByArea((current)=>({...current,[area.id]:{status:'stale',updatedAt:null,availableDays:0,days:[],stale:true,message:'天气服务暂不可用'}})));
    }
  },[filteredAreas,phase,selectedAreaId,weatherEndpoint]);

  function advanceAfterSelection(nextPhase=2){
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(()=>goPhase(nextPhase),reduced?0:500);
  }
  function goPhase(nextPhase:number){setPhaseDirection(nextPhase>=phase?'forward':'back');setPhase(nextPhase)}
  function chooseArea(id:string){setSelectedAreaId(id);setSelectedPeakId(null);setSelectedRouteId(routesForArea(id)[0]?.id??null);setExpandedAreaId((current)=>current===id?null:id)}
  function focusAreaFromMap(id:string){
    setSelectedAreaId(id);setSelectedPeakId(null);setSelectedRouteId(routesForArea(id)[0]?.id??null);setExpandedAreaId(id);goPhase(1);
    window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>document.getElementById(`area-card-${id}`)?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'})));
  }
  function choosePeak(id:string){const peak=peaks.find((item)=>item.id===id);if(!peak)return;setSelectedAreaId(peak.areaId);setSelectedPeakId(id);setSelectedRouteId(routesForPeak(id)[0]?.id??null);advanceAfterSelection(2)}

  const metrics=areaMetrics(selectedArea.id);
  const googleDestination=selectedRoute?`${selectedRoute.trailheadLat},${selectedRoute.trailheadLng}`:`${selectedArea.lat},${selectedArea.lng}`;
  const decision=(()=>{
    if(!selectedRoute)return{label:'先选择路线',tone:'neutral',text:'选择一条代表路线后再综合判断。'};
    const first=weather?.days[0];const risky=selectedRoute.bodyGrade>=4||selectedRoute.riskFlags.some((flag)=>/锁链|上级|易迷路/.test(flag));const badWeather=first&&(first.pop>=70||first.wind>=13||first.rain>=10);
    if(badWeather)return{label:'暂缓',tone:'stop',text:'近期降水或风力偏高，建议换日期并核验山地预报。'};
    if(risky||selectedRoute.bodyGrade>=3)return{label:'谨慎',tone:'caution',text:'路线超出默认复健范围，需要更早出发并确认体能与路况。'};
    return{label:'适合前往',tone:'go',text:'路线体力度、交通和当前天气均落在复健模式的优先区间。'};
  })();

  return <main className="app-shell">
    <GoogleMountainMap areas={filteredAreas} peaks={peaks} weatherByArea={weatherByArea} selectedMonth={selectedMonth} selectedAreaId={selectedAreaId} selectedPeakId={selectedPeakId} detailAreaId={phase>=2?selectedAreaId:expandedAreaId} hoveredAreaId={hoveredAreaId} selectedRoute={phase>=2?selectedRoute:null} onHoverArea={setHoveredAreaId} onSelectArea={focusAreaFromMap} onSelectPeak={choosePeak} />

    <aside className="planner">
      <header className="app-header">
        <div className="brand-round">山</div><div className="brand-copy"><span>PICK A PEAK · OSAKA</span><b>下一座山</b></div>
        <div className="user-chip" title={displayName || '公开访问'}><i /> {deploymentMode === 'public' ? 'PUBLIC' : 'PRIVATE'}</div>
      </header>
      <nav className="phase-tabs" aria-label="规划阶段">
        {phases.map((item)=><button type="button" key={item.id} className={phase===item.id?'active':''} onClick={()=>goPhase(item.id)} disabled={item.id>2&&!selectedRoute}><span>0{item.id}</span><b>{item.ja}</b><small>{item.zh}</small></button>)}
      </nav>

      <section className="phase-body" aria-live="polite">
        {phase===1&&<div className={`phase-view ${phaseDirection}`}>
          <div className="section-kicker">PHASE 01 · DISCOVER</div>
          <div className="phase-title"><div><h1>下一个顶峰</h1><p>先按山域缩小范围，再进入代表路线与天气判断。</p></div><div className="catalog-count"><b>{filteredAreas.length}</b><span>山域</span><small>64 PEAKS</small></div></div>
          <label className="catalog-search"><span>⌕</span><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="山域、山峰、百名山、索道…" aria-label="搜索山域和山峰"/><kbd>⌘ K</kbd></label>
          <div className="quick-filters">
            <button type="button" className={rehabMode?'on':''} onClick={()=>setRehabMode(!rehabMode)}>复健模式</button>
            <button type="button" className={dayTripOnly?'on':''} onClick={()=>setDayTripOnly(!dayTripOnly)}>日归</button>
            <button type="button" className={famousOnly?'on':''} onClick={()=>setFamousOnly(!famousOnly)}>百名山</button>
            <label className="month-filter"><span>月份</span><select value={selectedMonth} onChange={(event)=>setSelectedMonth(Number(event.target.value))} aria-label="选择推荐月份">{monthNames.map((name,index)=><option value={index} key={name}>{name}</option>)}</select></label>
            <label>≤ {Math.round(maxDrive/60)}h<input type="range" min="60" max="240" step="30" value={maxDrive} onChange={(event)=>setMaxDrive(Number(event.target.value))} aria-label="最大驾车时间"/></label>
          </div>
          <div className="catalog-tools"><span>{rehabMode?'优先体力度 1–2':'全部难度'} · {monthNames[selectedMonth]}</span><select value={sortKey} onChange={(event)=>setSortKey(event.target.value as SortKey)} aria-label="排序方式"><option value="recommended">月份推荐度</option><option value="distance">直线距离</option><option value="drive">驾车时间</option><option value="transit">公交时间</option><option value="elevation">最高海拔</option><option value="course-min">最低定数</option><option value="course-max">最高定数</option><option value="popularity">热门度</option></select></div>
          <div className="catalog-list">
            {filteredAreas.map((area,index)=>{const m=areaMetrics(area.id);const expanded=expandedAreaId===area.id;const active=selectedAreaId===area.id;const cardWeather=weatherByArea[area.id]??(weatherEndpoint?undefined:unconfiguredWeather);const cardLoading=!cardWeather;const monthScore=area.monthScores[selectedMonth];const grade=recommendationGrade(monthScore);const photo=mountainImages[area.id as keyof typeof mountainImages];const photoPath=`${normalizedBasePath}${photo.src}`;return <article id={`area-card-${area.id}`} key={area.id} style={{'--area-photo':`url("${photoPath}")`} as CSSProperties} className={`area-card ${active?'active':''}`} onMouseEnter={()=>setHoveredAreaId(area.id)} onMouseLeave={()=>setHoveredAreaId(null)}>
              <button type="button" className="area-select" onClick={()=>chooseArea(area.id)}>
                <span className="area-order">{String(index+1).padStart(2,'0')}</span><span className="area-name"><small>{area.kind} · {area.prefectures.join(' / ')}</small><b>{area.name}</b><em>{m.peakCount} 峰 · 最高 {m.highest.toLocaleString()}m</em></span>
                <span className="area-course"><b className={courseTone(m.maxCourse)}>{rangeLabel(area.id)}</b><small>コース定数</small></span><span className="area-score month-insight-anchor"><b className={`grade-${grade.toLowerCase()}`}>{grade}</b><small>{monthNames[selectedMonth]}推荐</small><MonthInsightPopover area={area} month={selectedMonth}/></span>
              </button>
              <div className="area-card-footer"><span>{formatMinutes(area.driveMinutes)} 驾车</span><span>{formatMinutes(area.transitMinutes)} 公交</span><span>{m.famousCount} 名山</span><button type="button" aria-expanded={expanded} onClick={()=>chooseArea(area.id)}>{expanded?'收起':'展开山峰'}⌄</button></div>
              <div className="area-weather" aria-label={`${area.name}天气预报`} title={`天气为海拔约 ${area.weatherElevation}m 的山地代表点预测数据`}><span className="area-weather-label">{cardLoading?'天气更新中':cardWeather?.stale?'旧缓存':'未来预报'} · {area.weatherElevation}m</span>{(cardWeather?.days??[]).map((day)=><span className="area-weather-day" key={day.date}><small>{day.date.slice(5).replace('-','/')}</small><b><WeatherGlyph summary={day.summary}/>{Math.round(day.max)}°</b><em>雨 {Math.round(day.pop)}%</em></span>)}{!cardLoading&&!cardWeather?.days.length&&<span className="area-weather-empty">{cardWeather?.message??'预报待配置'}</span>}</div>
              <div className={`peak-sublist ${expanded?'expanded':''}`} aria-hidden={!expanded}><div className="area-year-rating"><span>12 MONTHS · 悬浮查看原因</span><div>{area.monthScores.map((score,month)=>{const monthGrade=recommendationGrade(score);return <span key={monthNames[month]} tabIndex={expanded?0:-1} className={`month-bar month-insight-anchor ${selectedMonth===month?'current ':''}grade-${monthGrade.toLowerCase()}`} aria-label={`${monthNames[month]}：${monthGrade}，${score}分`}><span className="month-bar-track"><i style={{height:`${score}%`}}/></span><small>{month+1}</small><MonthInsightPopover area={area} month={month}/></span>})}</div></div>{peaksForArea(area.id).map((peak)=><button type="button" key={peak.id} tabIndex={expanded?0:-1} onClick={()=>choosePeak(peak.id)}><span><b>{peak.name}</b><small>{peak.lists.join(' · ')||peak.tags.slice(0,2).join(' · ')}</small></span><strong>{peak.elevation.toLocaleString()}m</strong><strong className={`peak-course ${courseTone(routesForPeak(peak.id)[0]?.courseConstant??null)}`}>定数 {peakRangeLabel(peak.id)}</strong><em>→</em></button>)}<a className="photo-credit" href={photo.sourceUrl} title={`${photo.title} · ${photo.artist} · ${photo.license} · Wikimedia Commons`} target="_blank" rel="noreferrer">图片鸣谢：{photo.artist} · {photo.license} ↗</a></div>
            </article>})}
            {!filteredAreas.length&&<div className="empty-state"><b>没有符合条件的山域</b><p>放宽驾车时间或清除标签后再试。</p></div>}
          </div>
        </div>}

        {phase===2&&<div className={`phase-view ${phaseDirection}`}>
          <button type="button" className="back-link" onClick={()=>goPhase(1)}>← 返回山域列表</button>
          <div className="route-hero"><div><span>{selectedArea.kind} · {selectedArea.prefectures.join(' / ')}</span><h1>{selectedPeak?.name??selectedArea.name}</h1><p>{selectedPeak?`${selectedPeak.elevation.toLocaleString()}m · ${selectedPeak.lists.join(' · ')||selectedPeak.tags.join(' · ')}`:selectedArea.overview}</p></div><div className="hero-number"><b>{selectedPeak?.elevation.toLocaleString()??metrics.highest.toLocaleString()}</b><span>METERS</span></div></div>
          {selectedPeak&&<div className="peak-resource-links"><span>山峰资料与更多典型／纵走路线</span><a target="_blank" rel="noreferrer" href={`https://yamap.com/mountains?q=${encodeURIComponent(selectedPeak.name)}`}>YAMAP 山峰 ↗</a><a target="_blank" rel="noreferrer" href={`https://yamahack.com/search/${encodeURIComponent(selectedPeak.name)}`}>YamaHack ↗</a></div>}
          <div className="weather-strip" title={`天气为海拔约 ${selectedArea.weatherElevation}m 的山地代表点预测数据`}><div><span>{weatherLoading?'天气更新中':weather?.status==='stale'?'天气缓存过期':'未来天气'}</span><b>{selectedArea.name} · {selectedArea.weatherElevation}m</b></div>{(weather?.days??[]).map((day)=><span key={day.date}><small>{day.date.slice(5)}</small><b><WeatherGlyph summary={day.summary}/></b><em>{Math.round(day.max)}°</em></span>)}{!weatherLoading&&!weather?.days.length&&<p>{weather?.message??'配置天气密钥后显示预报'}</p>}<button type="button" onClick={()=>goPhase(3)}>{weather?.availableDays??0}日 →</button></div>
          <div className="route-layout">
            <div className="route-list"><div className="subheading"><span>代表路线</span><small>{subjectRoutes.length} ROUTES</small></div>{subjectRoutes.map((route)=><button type="button" key={route.id} className={selectedRoute?.id===route.id?'active':''} onClick={()=>setSelectedRouteId(route.id)}><span><small>{route.routeClass} · {route.shape} · {route.trailhead}</small><b>{route.name}</b><em>{route.riskFlags.join(' · ')}</em></span><strong><b className={courseTone(route.courseConstant)}>{route.courseConstant}</b><small>定数</small></strong></button>)}{!subjectRoutes.length&&<div className="empty-state"><b>路线资料整理中</b><p>该山峰目前提供索引信息与外部核验入口。</p></div>}</div>
            {selectedRoute&&<article className="route-detail"><div className="route-metrics"><div><b>{selectedRoute.distanceKm}</b><span>KM</span></div><div><b>{selectedRoute.timeHours}</b><span>HOURS</span></div><div><b>+{selectedRoute.ascentM}</b><span>ASCENT</span></div><div><b className={courseTone(selectedRoute.courseConstant)}>{selectedRoute.courseConstant}</b><span>定数 · 体力度 {bodyGrade(selectedRoute.courseConstant)}</span></div></div>
              <div className="elevation-profile" aria-label="路线海拔剖面示意"><i style={{height:`${Math.min(88,30+selectedRoute.ascentM/20)}%`}}/><i style={{height:'52%'}}/><i style={{height:'76%'}}/><i style={{height:'45%'}}/><i style={{height:'68%'}}/><span>路线剖面示意 · 起点 {selectedRoute.trailhead}</span></div>
              <div className="risk-box"><span>ROUTE NOTES</span><b>{selectedRoute.riskFlags.join(' · ')}</b><p>{selectedRoute.seasonNote}</p></div>
              <div className={`geometry-status ${selectedRoute.geometryStatus}`}><b>{selectedRoute.geometryStatus==='schematic'?'示意路线':selectedRoute.geometryStatus==='official-gpx'?'官方 GPX':'开放轨迹'}</b><span>{selectedRoute.geometryStatus==='schematic'?'当前地图折线与剖面仅用于路线索引，未伪装为实际 GPS 轨迹。':selectedRoute.geometrySource?.name??'已核验开放来源'}</span>{selectedRoute.gpxUrl&&<a href={selectedRoute.gpxUrl} target="_blank" rel="noreferrer">查看原始 GPX ↗</a>}</div>
              <div className="source-stamp"><span>资料状态：{selectedRoute.status}</span><span>核验 {selectedRoute.verifiedAt}</span></div>
              <button type="button" className="primary-action" onClick={()=>goPhase(3)}>查看交通与天气 <span>→</span></button>
            </article>}
          </div>
        </div>}

        {phase===3&&<div className={`phase-view ${phaseDirection}`}>
          <button type="button" className="back-link" onClick={()=>goPhase(2)}>← 返回路线概览</button>
          <div className="section-kicker">PHASE 03 · CONDITIONS</div><h1 className="conditions-title">先看天气，<br/>再决定出发。</h1>
          <section className="condition-card forecast-card" title={`天气为海拔约 ${selectedArea.weatherElevation}m 的山地代表点预测数据`}><div className="condition-head"><div><span>{weather?.availableDays??0} DAY FORECAST</span><h2>{selectedArea.name}</h2><p>约 {selectedArea.weatherElevation}m · {weather?.updatedAt?`更新 ${new Date(weather.updatedAt).toLocaleString('zh-CN')}`:'尚无在线缓存'}</p></div><b className={`status-dot ${weather?.status}`}>{weather?.status??'LOADING'}</b></div><div className="forecast-grid">{(weather?.days??[]).map((day)=><article key={day.date}><span>{day.date.slice(5).replace('-','/')}</span><b><WeatherGlyph summary={day.summary}/></b><strong>{Math.round(day.max)}°</strong><small>{Math.round(day.min)}° · 雨 {Math.round(day.pop)}%</small></article>)}{!weatherLoading&&!weather?.days.length&&<div className="weather-empty"><b>等待 OpenWeather 配置</b><p>{weather?.message??'月度气候与路线信息仍可正常使用。'}</p></div>}</div><p className="mountain-warning">山地微气候变化快；出发前请同时核验山岳气象、雷达和现场封路信息。</p></section>
          <section className="condition-card climate-card"><div className="condition-head"><div><span>1991–2020 CLIMATE</span><h2>十二个月适宜度</h2><p>{selectedArea.climateNote}</p></div><b className={`grade-${recommendationGrade(selectedArea.monthScores[selectedMonth]).toLowerCase()}`}>{recommendationGrade(selectedArea.monthScores[selectedMonth])}</b></div><div className="month-chart">{selectedArea.monthScores.map((score,index)=><div key={monthNames[index]} tabIndex={0} className="month-insight-anchor" aria-label={`${monthNames[index]}：${recommendationGrade(score)}，${score}分`}><span className="month-chart-track"><i style={{height:`${score}%`}} className={`${index===selectedMonth?'current ':''}grade-${recommendationGrade(score).toLowerCase()}`}/></span><span>{index+1}</span><MonthInsightPopover area={selectedArea} month={index}/></div>)}</div></section>
          {selectedRoute&&<section className="condition-card access-card"><div className="condition-head"><div><span>ACCESS FROM OSAKA</span><h2>{selectedRoute.trailhead}</h2><p>大阪站为统一基准，保存的是规划摘要，不是实时路况。</p></div><b>{formatMinutes(selectedArea.driveMinutes)}</b></div><div className="access-grid"><article><span>驾车</span><b>{formatMinutes(selectedArea.driveMinutes)}</b><p>{selectedRoute.parkingNote}</p></article><article><span>公共交通</span><b>{formatMinutes(selectedArea.transitMinutes)}</b><p>{selectedRoute.lastBusNote}</p></article></div><div className="external-actions"><a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&origin=Osaka+Station&destination=${encodeURIComponent(googleDestination)}`}>Google Maps 实时导航 ↗</a><a target="_blank" rel="noreferrer" href="https://roote.ekispert.net/">駅すぱあと实时查询 ↗</a></div></section>}
          <button type="button" className="primary-action wide" disabled={!selectedRoute} onClick={()=>goPhase(4)}>生成行程判断 <span>→</span></button>
        </div>}

        {phase===4&&<div className={`phase-view ${phaseDirection}`}>
          <button type="button" className="back-link" onClick={()=>goPhase(3)}>← 返回天气与交通</button>
          <div className="section-kicker">PHASE 04 · DECIDE</div><h1 className="conditions-title">下一座山，<br/>就定在这里。</h1>
          <section className={`decision-card ${decision.tone}`}><span>TRIP SIGNAL</span><h2>{decision.label}</h2><p>{decision.text}</p><div className="decision-route"><small>{selectedArea.name}</small><b>{selectedRoute?.name??'未选择路线'}</b><span>{selectedRoute?`${selectedRoute.distanceKm}km · ${selectedRoute.timeHours}h · 定数 ${selectedRoute.courseConstant}`:''}</span></div></section>
          <div className="decision-grid"><article><span>01 · 路线</span><b>体力度 {selectedRoute?.bodyGrade??'—'}</b><p>{selectedRoute?.riskFlags.join(' · ')??'路线未定'}</p></article><article><span>02 · 交通</span><b>{formatMinutes(selectedArea.driveMinutes)}</b><p>大阪站至代表登山口，非实时。</p></article><article><span>03 · 季节</span><b className={`grade-${recommendationGrade(selectedArea.monthScores[selectedMonth]).toLowerCase()}`}>{recommendationGrade(selectedArea.monthScores[selectedMonth])} · {selectedArea.monthScores[selectedMonth]}</b><p>{monthNames[selectedMonth]}静态适宜度。</p></article><article title={`天气为海拔约 ${selectedArea.weatherElevation}m 的山地代表点预测数据`}><span>04 · 天气</span><b>{weather?.days[0]?`${Math.round(weather.days[0].max)}° / 雨${Math.round(weather.days[0].pop)}%`:'待更新'}</b><p>出发前再次确认实时变化。</p></article></div>
          <section className="checklist"><span>出发前 CHECK</span>{['重新确认登山道封闭与积雪','核对末班车或停车场开放','向家人共享行程并提交登山届','下载正式离线登山地图'].map((item)=><label key={item}><input type="checkbox"/>{item}</label>)}</section>
          <div className="external-actions stacked"><a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&origin=Osaka+Station&destination=${encodeURIComponent(googleDestination)}`}>打开 Google Maps ↗</a><a target="_blank" rel="noreferrer" href={`https://yamap.com/mountains?q=${encodeURIComponent(selectedPeak?.name??selectedArea.name)}`}>在 YAMAP 核验 ↗</a><a target="_blank" rel="noreferrer" href={`https://yamahack.com/search/${encodeURIComponent(selectedPeak?.name??selectedArea.name)}`}>在 YamaHack 查路线 ↗</a><a target="_blank" rel="noreferrer" href={`https://www.yamareco.com/modules/yamareco/search_record.php?key=${encodeURIComponent(selectedPeak?.name??selectedArea.name)}`}>在ヤマレコ核验 ↗</a></div>
        </div>}
      </section>
      <footer className="planner-footer"><span>资料核验 2026.08.26</span><a href="https://www.pref.gunma.jp/page/1489.html" target="_blank" rel="noreferrer">コース定数说明 ↗</a>{deploymentMode === 'private' ? <a href="/signout-with-chatgpt?return_to=/">退出</a> : <span className="deployment-mode">PUBLIC</span>}</footer>
    </aside>
  </main>;
}
