import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const targets = [
  ['rokko','六甲山','六甲山'],
  ['kongo-katsuragi','金剛山 大阪','金剛山 (金剛山地)'],
  ['ikoma','生駒山','生駒山'],
  ['hokusetsu','妙見山 大阪','妙見山 (大阪府・兵庫県)'],
  ['izumi','岩湧山','岩湧山'],
  ['kyoto','比叡山','比叡山'],
  ['hira','武奈ヶ岳','武奈ヶ岳'],
  ['suzuka-ibuki','伊吹山','伊吹山'],
  ['omine','八経ヶ岳','八経ヶ岳'],
  ['daiko-odai','大台ヶ原','大台ヶ原山'],
  ['tajima','氷ノ山','氷ノ山'],
  ['daisen','大山 鳥取','大山 (鳥取県)'],
  ['tsurugi','剣山 徳島','剣山'],
  ['arashima','荒島岳','荒島岳'],
];

const outputDir = path.resolve('public/mountains');
await mkdir(outputDir,{recursive:true});
const manifest = {};
const sleep = (ms) => new Promise((resolve)=>setTimeout(resolve,ms));
async function fetchWithRetry(url){
  for(let attempt=0;attempt<4;attempt+=1){
    const response=await fetch(url,{headers:{'User-Agent':'OsakaMountainPicker/1.0 personal research site'}});
    if(response.status!==429)return response;
    await sleep(6000*(attempt+1));
  }
  return fetch(url,{headers:{'User-Agent':'OsakaMountainPicker/1.0 personal research site'}});
}

for(const [id,term,wikiTitle] of targets){
  const pageParams = new URLSearchParams({action:'query',prop:'pageimages',titles:wikiTitle,piprop:'name',format:'json',origin:'*'});
  const pageApi=await fetchWithRetry(`https://ja.wikipedia.org/w/api.php?${pageParams}`);
  const pageJson=await pageApi.json();
  const page=Object.values(pageJson.query?.pages??{})[0];
  let selected;
  if(page?.pageimage){
    await sleep(1200);
    const fileParams=new URLSearchParams({action:'query',titles:`File:${page.pageimage}`,prop:'imageinfo',iiprop:'url|mime|size|extmetadata',iiurlwidth:'1200',format:'json',origin:'*'});
    const fileApi=await fetchWithRetry(`https://commons.wikimedia.org/w/api.php?${fileParams}`);
    const fileJson=await fileApi.json();
    const filePage=Object.values(fileJson.query?.pages??{})[0];
    const info=filePage?.imageinfo?.[0];
    if(info?.mime==='image/jpeg')selected={page:filePage,info};
  }
  if(!selected){
    const params = new URLSearchParams({action:'query',generator:'search',gsrsearch:term,gsrnamespace:'6',gsrlimit:'12',prop:'imageinfo',iiprop:'url|mime|size|extmetadata',iiurlwidth:'1200',format:'json',origin:'*'});
    const api = await fetchWithRetry(`https://commons.wikimedia.org/w/api.php?${params}`);
    if(!api.ok) throw new Error(`Commons search failed for ${id}: ${api.status}`);
    const json = await api.json();
    const pages = Object.values(json.query?.pages??{});
    selected = pages.flatMap((candidate)=>candidate.imageinfo?.map((info)=>({page:candidate,info}))??[])
      .filter(({info})=>info.mime==='image/jpeg'&&info.width>=700)
      .sort((a,b)=>(b.info.width*b.info.height)-(a.info.width*a.info.height))[0];
  }
  if(!selected){console.warn(`No landscape JPEG found for ${id}`);continue;}
  await sleep(1500);
  const response = await fetchWithRetry(selected.info.thumburl??selected.info.url);
  if(!response.ok) throw new Error(`Image download failed for ${id}: ${response.status}`);
  await writeFile(path.join(outputDir,`${id}.jpg`),Buffer.from(await response.arrayBuffer()));
  const meta=selected.info.extmetadata??{};
  manifest[id]={
    src:`/mountains/${id}.jpg`,
    sourceUrl:selected.info.descriptionurl,
    title:selected.page.title.replace(/^File:/,''),
    artist:String(meta.Artist?.value??'Wikimedia Commons contributor').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(),
    license:meta.LicenseShortName?.value??'See source',
  };
  console.log(`${id}: ${manifest[id].title}`);
  await sleep(2500);
}

await writeFile(path.resolve('app/mountain-images.json'),`${JSON.stringify(manifest,null,2)}\n`);
