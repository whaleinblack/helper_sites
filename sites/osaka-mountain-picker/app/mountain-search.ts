import { pinyin } from 'pinyin-pro';
import { toRomaji } from 'wanakana';
import type { MountainArea, Peak } from './mountain-data';

const simplifiedCharacters: Record<string,string> = {
  島:'岛',馬:'马',剣:'剑',駒:'驹',剛:'刚',鈴:'铃',摂:'摄',脈:'脉',連:'连',體:'体',
  嶺:'岭',澤:'泽',瀧:'泷',穂:'穗',龍:'龙',靈:'灵',霊:'灵',國:'国',關:'关',廣:'广',
  園:'园',臺:'台',縱:'纵',歸:'归',纜:'缆',鐵:'铁',鎌:'镰',銀:'银',戶:'户',縣:'县',
};

export function normalizeSearch(value:string){
  return value.normalize('NFKC').toLowerCase().replace(/[\s\-‐‑‒–—・･·'’_.\/（）()]+/g,'');
}

export function toSimplified(value:string){
  return [...value].map((character)=>simplifiedCharacters[character]??character).join('');
}

function multilingualForms(value:string){
  if(!value)return[];
  const simplified=toSimplified(value);
  const mandarin=pinyin(simplified,{toneType:'none',type:'array'}).join(' ');
  return [value,simplified,mandarin,mandarin.replaceAll(' ',''),toRomaji(value)];
}

export function mountainSearchText(area:MountainArea,areaPeaks:Peak[]){
  const stable=[area.id,area.name,area.reading,...area.tags,...area.prefectures];
  const peakForms=areaPeaks.flatMap((peak)=>[peak.id,peak.name,peak.reading,...peak.lists,...peak.tags]);
  return [...stable,...peakForms].flatMap(multilingualForms).map(normalizeSearch).join(' ');
}

export function matchesMountainSearch(area:MountainArea,areaPeaks:Peak[],query:string){
  const needle=normalizeSearch(query);
  return !needle||mountainSearchText(area,areaPeaks).includes(needle);
}
