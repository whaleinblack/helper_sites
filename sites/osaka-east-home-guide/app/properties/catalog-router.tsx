"use client";

import CatalogPropertyPage from "./catalog-property-page";
import { getCatalogProperty } from "./catalog-data";
import cieliaMoriguchi from "./cielia-moriguchi/map-cache.json";
import cityHouseShimmori from "./city-house-shimmori/map-cache.json";
import liberCityMoriguchi from "./liber-city-moriguchi/map-cache.json";
import parkHomesLalaKadoma from "./park-homes-lala-kadoma/map-cache.json";
import proudSekime from "./proud-sekime/map-cache.json";
import geoSekimeTakadono from "./geo-sekime-takadono/map-cache.json";
import sunMarksDainichi from "./sun-marks-dainichi/map-cache.json";
import moriguchiMidsiteTower from "./moriguchi-midsite-tower/map-cache.json";
import riverGardenMiyakojima from "./river-garden-miyakojima/map-cache.json";
import cieliaKyobashi from "./cielia-kyobashi/map-cache.json";

const caches={"cielia-moriguchi":cieliaMoriguchi,"city-house-shimmori":cityHouseShimmori,"liber-city-moriguchi":liberCityMoriguchi,"park-homes-lala-kadoma":parkHomesLalaKadoma,"proud-sekime":proudSekime,"geo-sekime-takadono":geoSekimeTakadono,"sun-marks-dainichi":sunMarksDainichi,"moriguchi-midsite-tower":moriguchiMidsiteTower,"river-garden-miyakojima":riverGardenMiyakojima,"cielia-kyobashi":cieliaKyobashi} as const;
export const catalogSlugs=Object.keys(caches) as Array<keyof typeof caches>;

export default function CatalogRouter({slug}:{slug?:string}){
  const resolved=slug??catalogSlugs.find(item=>window.location.pathname.includes(`/properties/${item}/`));
  if(!resolved||!(resolved in caches))return null;
  const data=getCatalogProperty(resolved);if(!data)return null;
  return <CatalogPropertyPage data={data} cache={caches[resolved as keyof typeof caches]}/>;
}
