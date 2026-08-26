import type { MountainArea } from './mountain-data';

export type InsightTone = 'good' | 'fair' | 'caution' | 'bad' | 'neutral';
export type MonthInsightItem = {
  label: string;
  value: string;
  detail: string;
  tone: InsightTone;
};

export type MonthInsight = {
  temperatureRange: string;
  snowPhase: '无稳定积雪' | '初雪・移行期' | '积雪期' | '严冬期' | '融雪・残雪期';
  summary: string;
  items: MonthInsightItem[];
};

const osakaMonthlyHigh = [10, 11, 15, 20, 25, 28, 32, 33, 29, 23, 17, 12];
const shortDayMonths = new Set([10, 11, 0, 1]);
const wetMonths = new Set([5, 6, 7, 8]);
const heavySnowAreas = new Set(['hira', 'suzuka-ibuki', 'tajima', 'daisen', 'arashima']);
const alpineSnowAreas = new Set(['omine', 'daiko-odai', 'tsurugi']);
const exposedAreas = new Set(['hira', 'suzuka-ibuki', 'daisen', 'tsurugi', 'arashima', 'izumi']);

function toneFor(score:number):InsightTone {
  if(score>=80)return 'good';
  if(score>=65)return 'fair';
  if(score>=45)return 'caution';
  return 'bad';
}

function snowPhase(area:MountainArea, month:number):MonthInsight['snowPhase'] {
  const highSnow = heavySnowAreas.has(area.id) || alpineSnowAreas.has(area.id) || area.weatherElevation >= 1250;
  const middleSnow = highSnow || area.weatherElevation >= 850 || /积雪|雾凇/.test(`${area.tags.join(' ')} ${area.climateNote}`);
  if(highSnow){
    if(month===10)return '初雪・移行期';
    if(month===11)return '积雪期';
    if(month===0||month===1)return '严冬期';
    if(month===2||month===3)return '融雪・残雪期';
    if(month===4&&area.weatherElevation>=1400)return '融雪・残雪期';
  }
  if(middleSnow){
    if(month===11)return '初雪・移行期';
    if(month===0||month===1)return area.weatherElevation>=1050?'严冬期':'积雪期';
    if(month===2)return '融雪・残雪期';
  }
  return '无稳定积雪';
}

function thermalLabel(max:number, snow:MonthInsight['snowPhase']) {
  if(snow!=='无稳定积雪')return snow;
  if(max>=27)return '炎热';
  if(max>=20)return '温暖';
  if(max>=12)return '凉爽';
  if(max>=5)return '寒冷';
  return '严寒';
}

function formatSolarMinutes(totalMinutes:number){
  const normalized=(Math.round(totalMinutes)+1440)%1440;
  return `${String(Math.floor(normalized/60)).padStart(2,'0')}:${String(normalized%60).padStart(2,'0')}`;
}

function monthlyAverageSunTimes(area:MountainArea,month:number){
  const year=2025;
  const daysInMonth=new Date(Date.UTC(year,month+1,0)).getUTCDate();
  let sunriseTotal=0;
  let sunsetTotal=0;
  for(let day=1;day<=daysInMonth;day+=1){
    const current=Date.UTC(year,month,day);
    const yearStart=Date.UTC(year,0,1);
    const dayOfYear=Math.floor((current-yearStart)/86400000)+1;
    const gamma=(2*Math.PI/365)*(dayOfYear-1);
    const equationOfTime=229.18*(0.000075+0.001868*Math.cos(gamma)-0.032077*Math.sin(gamma)-0.014615*Math.cos(2*gamma)-0.040849*Math.sin(2*gamma));
    const declination=0.006918-0.399912*Math.cos(gamma)+0.070257*Math.sin(gamma)-0.006758*Math.cos(2*gamma)+0.000907*Math.sin(2*gamma)-0.002697*Math.cos(3*gamma)+0.00148*Math.sin(3*gamma);
    const latitude=area.lat*Math.PI/180;
    const hourAngle=Math.acos(Math.cos(90.833*Math.PI/180)/(Math.cos(latitude)*Math.cos(declination))-Math.tan(latitude)*Math.tan(declination));
    const solarNoon=720-4*area.lng-equationOfTime+9*60;
    const daylightOffset=4*hourAngle*180/Math.PI;
    sunriseTotal+=solarNoon-daylightOffset;
    sunsetTotal+=solarNoon+daylightOffset;
  }
  return {
    sunrise:formatSolarMinutes(sunriseTotal/daysInMonth),
    sunset:formatSolarMinutes(sunsetTotal/daysInMonth),
  };
}

export function getMonthInsight(area:MountainArea, month:number):MonthInsight {
  const latitudePenalty=Math.max(0,area.lat-34.5)*1.15;
  const max=Math.round(osakaMonthlyHigh[month]-area.weatherElevation*.0064-latitudePenalty);
  const min=Math.round(max-(month<=1||month>=10?7:6));
  const snow=snowPhase(area,month);
  const mountainWeatherScore=area.monthScores[month];
  const veryWet=area.id==='daiko-odai'||area.id==='omine';
  const precipitationScore=Math.max(18,Math.min(94,mountainWeatherScore+(wetMonths.has(month)?-13:8)+(veryWet?-10:0)));
  const windScore=Math.max(22,Math.min(92,mountainWeatherScore+(exposedAreas.has(area.id)?-11:5)+((month<=1||month===11)?-10:4)));
  const snowTechnical=snow!=='无稳定积雪';
  const trailScore=snowTechnical?Math.min(45,mountainWeatherScore):Math.max(28,Math.min(94,mountainWeatherScore+(wetMonths.has(month)?-12:6)));
  const sceneryScore=area.bestMonths.includes(month+1)?95:Math.max(38,Math.min(82,mountainWeatherScore+5));
  const accessScore=Math.max(30,Math.min(92,86-(area.driveMinutes>180?14:0)-(snowTechnical&&area.driveMinutes>120?25:0)-(shortDayMonths.has(month)?8:0)));

  const rainValue=precipitationScore>=80?'偏干爽':precipitationScore>=65?'降水适中':precipitationScore>=45?'多雨・湿滑':'强降水期';
  const windValue=windScore>=80?'风较弱':windScore>=65?'偶有阵风':windScore>=45?'风力偏强':'强风风险';
  const trailValue=snowTechnical
    ? (snow==='严冬期'?'冰雪技术另计':snow==='融雪・残雪期'?'腐雪・踏抜风险':'积雪路况另计')
    : trailScore>=75?'路况较稳定':trailScore>=55?'局部湿滑':'泥泞・雷雨风险';
  const lightValue=shortDayMonths.has(month)?'日照较短':accessScore<55?'季节交通受限':'交通与日照良好';
  const temperatureValue=`${thermalLabel(max,snow)} · ${min}–${max}℃`;
  const sunTimes=monthlyAverageSunTimes(area,month);

  const items:MonthInsightItem[]=[
    {label:'气温・积雪',value:temperatureValue,detail:snowTechnical?'按代表点海拔推算；冬季技术难度不计入普通路线定数。':'按山域代表点海拔和月平均温度推算。',tone:toneFor(snowTechnical?Math.min(48,mountainWeatherScore):max>=7&&max<=24?88:max>=3&&max<27?66:38)},
    {label:'降水',value:rainValue,detail:veryWet?'该山域属于近畿多雨侧，降水风险加权提高。':wetMonths.has(month)?'梅雨、盛夏对流雨或台风季会提高湿滑概率。':'结合该山域月度气候档案判断。',tone:toneFor(precipitationScore)},
    {label:'风力',value:windValue,detail:exposedAreas.has(area.id)?'开阔稜线或海风影响较明显。':'代表山体的季节风暴露度估计。',tone:toneFor(windScore)},
    {label:'路况・技术',value:trailValue,detail:snowTechnical?'须另行核验雪深、结冰、雪崩地形和冬季封路；不沿用无雪期难度。':'反映泥泞、雷雨、落叶与普通登山道季节状态。',tone:toneFor(trailScore)},
    {label:'景色',value:sceneryScore>=90?'当季亮点':sceneryScore>=65?'景观尚佳':'非主景季',detail:area.bestMonths.includes(month+1)?'进入该山域的新绿、花期、稜线或红叶窗口。':'不是资料中标记的主要景观月份。',tone:toneFor(sceneryScore)},
    {label:'交通・日照',value:lightValue,detail:shortDayMonths.has(month)?'需为下山和末班交通保留更大余量。':'综合季节道路、公共交通和白昼长度。',tone:toneFor(accessScore)},
    {label:'平均日出・日落',value:`${sunTimes.sunrise} · ${sunTimes.sunset}`,detail:'按山域中心经纬度逐日计算该月平均太阳升落时间（日本时间）；山体遮挡未计。',tone:'neutral'},
  ];
  const weakest=[...items].sort((a,b)=>['bad','caution','fair','neutral','good'].indexOf(a.tone)-['bad','caution','fair','neutral','good'].indexOf(b.tone)).slice(0,2).map((item)=>item.value);
  return {temperatureRange:`${min}–${max}℃`,snowPhase:snow,summary:`主要制约：${weakest.join('、')}`,items};
}
