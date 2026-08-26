import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [input,output,...flags]=process.argv.slice(2);
const option=(name)=>{const i=flags.indexOf(name);return i>=0?flags[i+1]:''};
const sourceUrl=option('--source-url');
const license=option('--license');
if(!input||!output||!sourceUrl||!license){
  console.error('Usage: npm run route:import-gpx -- input.gpx output.json --source-url URL --license LICENSE');
  process.exit(1);
}
if(!/^https?:\/\//.test(sourceUrl))throw new Error('source-url must be an HTTP(S) URL');
const xml=await readFile(resolve(input),'utf8');
const points=[...xml.matchAll(/<trkpt\s+[^>]*lat=["']([^"']+)["'][^>]*lon=["']([^"']+)["'][^>]*>/gi)].map((match)=>[Number(match[1]),Number(match[2])]);
if(points.length<2||points.some(([lat,lng])=>!Number.isFinite(lat)||!Number.isFinite(lng)))throw new Error('No valid GPX track found');
const payload={type:'Feature',properties:{geometryStatus:'open-data',sourceUrl,license,importedAt:new Date().toISOString()},geometry:{type:'LineString',coordinates:points.map(([lat,lng])=>[lng,lat])}};
await writeFile(resolve(output),`${JSON.stringify(payload,null,2)}\n`,'utf8');
console.log(`Imported ${points.length} track points to ${resolve(output)}`);
