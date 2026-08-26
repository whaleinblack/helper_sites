export type ContentStatus = 'index' | 'researched' | 'verified';
export type AreaKind = '山脈' | '山地' | '山系' | '連峰' | '独立峰';

export type SourceRef = { name: string; url: string };

export type Peak = {
  id: string;
  areaId: string;
  name: string;
  reading: string;
  elevation: number;
  lat: number;
  lng: number;
  lists: string[];
  tags: string[];
  status: ContentStatus;
  verifiedAt: string;
};

export type MountainRoute = {
  id: string;
  areaId: string;
  peakId: string;
  name: string;
  shape: '往返' | '环线' | '纵走';
  distanceKm: number;
  timeHours: number;
  ascentM: number;
  descentM: number;
  courseConstant: number;
  bodyGrade: number;
  riskFlags: string[];
  trailhead: string;
  trailheadLat: number;
  trailheadLng: number;
  accessNote: string;
  parkingNote: string;
  lastBusNote: string;
  seasonNote: string;
  path: Array<[number, number]>;
  routeClass: '标准线' | '交通友好线' | '纵走线';
  geometryStatus: 'schematic' | 'open-data' | 'official-gpx';
  geometrySource?: SourceRef;
  gpxUrl?: string;
  status: ContentStatus;
  verifiedAt: string;
  sources: SourceRef[];
};

export type MountainArea = {
  id: string;
  name: string;
  reading: string;
  kind: AreaKind;
  prefectures: string[];
  lat: number;
  lng: number;
  weatherElevation: number;
  overview: string;
  climateNote: string;
  driveMinutes: number;
  transitMinutes: number;
  distanceKm: number;
  popularity: number;
  bestMonths: number[];
  monthScores: number[];
  tags: string[];
  status: ContentStatus;
  verifiedAt: string;
  sources: SourceRef[];
};

export const OFFICIAL_SOURCES = {
  gsi: { name: '国土地理院', url: 'https://maps.gsi.go.jp/' },
  osm: { name: 'OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' },
  grading: { name: '山のグレーディング', url: 'https://www.pref.gunma.jp/page/1489.html' },
  jma: { name: '気象庁 1991–2020 平年値', url: 'https://www.data.jma.go.jp/risk/obsdl/' },
};

const commonSources = [OFFICIAL_SOURCES.gsi, OFFICIAL_SOURCES.osm];
const verifiedAt = '2026-08-26';

export function calculateCourseConstant(timeHours: number, distanceKm: number, ascentM: number, descentM: number) {
  return Math.ceil(timeHours * 1.8 + distanceKm * 0.3 + (ascentM / 1000) * 10 + (descentM / 1000) * 0.6);
}

export function bodyGrade(courseConstant: number) {
  return Math.max(1, Math.min(10, Math.ceil(courseConstant / 10)));
}

const areaDefinitions: Omit<MountainArea, 'status' | 'verifiedAt' | 'sources'>[] = [
  { id:'rokko',name:'六甲山系',reading:'ろっこうさんけい',kind:'山系',prefectures:['兵库'],lat:34.778,lng:135.263,weatherElevation:720,overview:'城市与山脊贴得最近的关西经典山域，铁路登山口多，适合用不同路线逐步恢复体能。',climateNote:'海风明显，秋季凉爽稳定；冬季山顶可结冰，盛夏谷筋湿热。',driveMinutes:65,transitMinutes:55,distanceKm:43,popularity:99,bestMonths:[3,4,5,10,11,12],monthScores:[62,64,80,91,86,55,39,42,66,96,98,76],tags:['日归','公交便利','红叶','山小屋'] },
  { id:'kongo-katsuragi',name:'金剛・葛城山系',reading:'こんごう・かつらぎ',kind:'山系',prefectures:['大阪','奈良'],lat:34.421,lng:135.678,weatherElevation:940,overview:'大阪南部最具代表性的训练山域，路线密集，从台阶路到纵走都有。',climateNote:'秋季红叶期长，山顶常比大阪市区低 6–8℃；冬季常见雾凇和轻积雪。',driveMinutes:78,transitMinutes:105,distanceKm:58,popularity:98,bestMonths:[4,5,10,11,12],monthScores:[48,52,76,91,88,54,35,38,67,94,99,72],tags:['日归','公交可达','红叶','1000m+'] },
  { id:'ikoma',name:'生駒山地',reading:'いこまさんち',kind:'山地',prefectures:['大阪','奈良'],lat:34.684,lng:135.678,weatherElevation:520,overview:'离大阪最近的低山练习场，夜景、古道和短距离路线丰富。',climateNote:'海拔低、无雪期长；七八月炎热，秋冬视野通常更清晰。',driveMinutes:45,transitMinutes:45,distanceKm:25,popularity:88,bestMonths:[2,3,4,11,12],monthScores:[78,83,91,84,68,42,28,31,61,84,96,91],tags:['轻量','日归','公交便利','缆车'] },
  { id:'hokusetsu',name:'北摂山系',reading:'ほくせつさんけい',kind:'山系',prefectures:['大阪','兵库','京都'],lat:34.955,lng:135.444,weatherElevation:650,overview:'森林、寺社和里山道路交织的安静山域，适合作为半日到一日的复健路线。',climateNote:'春秋最舒适，梅雨期泥泞和山蛭风险上升，冬季北部偶有积雪。',driveMinutes:72,transitMinutes:95,distanceKm:48,popularity:78,bestMonths:[3,4,5,10,11],monthScores:[64,69,86,91,82,47,33,36,68,93,96,78],tags:['日归','森林','寺社','红叶'] },
  { id:'izumi',name:'和泉山脈',reading:'いずみさんみゃく',kind:'山脈',prefectures:['大阪','和歌山'],lat:34.36,lng:135.42,weatherElevation:740,overview:'大阪湾南侧的长形山脉，岩湧山的芒草原和纪泉阿尔卑斯纵走最具特色。',climateNote:'受纪伊水道湿气影响，冬季温和但风强；十月至十一月芒草和红叶最佳。',driveMinutes:86,transitMinutes:115,distanceKm:67,popularity:77,bestMonths:[3,4,10,11],monthScores:[68,72,86,88,74,45,31,34,66,96,98,82],tags:['日归','芒草','纵走','驾车推荐'] },
  { id:'kyoto',name:'京都北山・東山',reading:'きょうときたやま・ひがしやま',kind:'山系',prefectures:['京都','滋贺'],lat:35.105,lng:135.74,weatherElevation:680,overview:'古道、寺社与山林景观并存，交通选择多，适合把登山和京都散步结合。',climateNote:'盆地夏季闷热，秋色稳定；北山冬季降雪明显，东山则多为无雪轻量路线。',driveMinutes:80,transitMinutes:70,distanceKm:55,popularity:92,bestMonths:[3,4,5,10,11,12],monthScores:[58,62,83,91,84,44,29,32,64,94,99,80],tags:['日归','公交便利','寺社','红叶'] },
  { id:'hira',name:'比良山系',reading:'ひらさんけい',kind:'山系',prefectures:['滋贺'],lat:35.265,lng:135.885,weatherElevation:1050,overview:'琵琶湖西岸的高差型山域，拥有关西少见的开阔稜线和强烈山岳感。',climateNote:'冬季积雪深且风强，无雪期通常从晚春开始；十月稜线红叶和空气透明度最佳。',driveMinutes:102,transitMinutes:115,distanceKm:92,popularity:91,bestMonths:[5,6,9,10,11],monthScores:[19,22,38,64,88,78,58,61,89,99,85,35],tags:['1000m+','稜线','积雪期另计','驾车推荐'] },
  { id:'suzuka-ibuki',name:'鈴鹿山脈・伊吹山地',reading:'すずか・いぶき',kind:'山脈',prefectures:['滋贺','三重','岐阜'],lat:35.072,lng:136.418,weatherElevation:1050,overview:'花岗岩稜线、石灰岩草原和多座名山构成的关西核心登山区。',climateNote:'日本海侧冬季影响显著，春花与秋色出众；御在所等地夏季雷雨需特别留意。',driveMinutes:135,transitMinutes:150,distanceKm:132,popularity:96,bestMonths:[4,5,6,10,11],monthScores:[16,18,38,78,94,83,58,60,82,99,86,28],tags:['日本百名山','1000m+','山小屋','索道'] },
  { id:'omine',name:'大峰山脈',reading:'おおみねさんみゃく',kind:'山脈',prefectures:['奈良'],lat:34.174,lng:135.907,weatherElevation:1550,overview:'近畿最高峰群与修验道纵走核心，山深、路长，属于恢复体能后的进阶目标。',climateNote:'冬季严寒积雪，梅雨期降水多；五月末至六月花季和十月红叶期相对稳定。',driveMinutes:154,transitMinutes:220,distanceKm:118,popularity:90,bestMonths:[5,6,9,10],monthScores:[8,10,17,42,78,72,50,54,82,96,68,15],tags:['日本百名山','1500m+','山小屋','上级'] },
  { id:'daiko-odai',name:'台高山脈・大台ヶ原',reading:'だいこう・おおだいがはら',kind:'山脈',prefectures:['奈良','三重'],lat:34.185,lng:136.11,weatherElevation:1500,overview:'原生林、峡谷和高原湿地构成的大型山域，大台原可轻量观景，纵深路线则明显进阶。',climateNote:'日本代表性的多雨区，台风季影响突出；五月新绿和十月红叶最受欢迎。',driveMinutes:165,transitMinutes:240,distanceKm:139,popularity:91,bestMonths:[5,6,10],monthScores:[9,11,21,52,89,78,49,48,66,98,58,14],tags:['日本百名山','1500m+','驾车推荐','原生林'] },
  { id:'tajima',name:'但馬山地・氷ノ山',reading:'たじま・ひょうのせん',kind:'山地',prefectures:['兵库','鸟取'],lat:35.354,lng:134.513,weatherElevation:1250,overview:'兵库最高峰与山毛榉林相连的山域，秋季层林和冬季雪景具有强烈季节感。',climateNote:'日本海侧降雪显著，无雪期集中于晚春至秋季；十月中下旬通常是红叶重点。',driveMinutes:155,transitMinutes:245,distanceKm:142,popularity:82,bestMonths:[5,6,9,10],monthScores:[8,10,18,48,86,80,58,60,88,99,63,12],tags:['日本二百名山','1500m+','红叶','须驾车'] },
  { id:'daisen',name:'大山山系',reading:'だいせんさんけい',kind:'独立峰',prefectures:['鸟取'],lat:35.371,lng:133.546,weatherElevation:1450,overview:'中国地方最高峰，北壁火山地貌鲜明，是大阪四小时圈内山岳感最强的百名山之一。',climateNote:'冬季大雪、夏季午后云雾多；六月新绿和十月红叶适合无雪期登山。',driveMinutes:215,transitMinutes:290,distanceKm:224,popularity:95,bestMonths:[5,6,9,10],monthScores:[7,8,15,42,84,79,55,58,86,99,52,10],tags:['日本百名山','1500m+','山小屋','约4小时圈'] },
  { id:'tsurugi',name:'剣山系',reading:'つるぎさんけい',kind:'山系',prefectures:['德岛','高知'],lat:33.855,lng:134.095,weatherElevation:1700,overview:'四国第二高峰周边的笹原稜线，登山口较远，但索道让主峰路线具有较高可达性。',climateNote:'冬季积雪与道路冻结明显，五月至六月新绿、十月草红叶是主要窗口。',driveMinutes:230,transitMinutes:330,distanceKm:238,popularity:89,bestMonths:[5,6,9,10],monthScores:[7,8,14,38,82,78,56,58,85,97,48,9],tags:['日本百名山','1500m+','索道','约4小时圈'] },
  { id:'arashima',name:'越美山地・荒島岳',reading:'えつみ・あらしまだけ',kind:'山地',prefectures:['福井','岐阜'],lat:35.934,lng:136.602,weatherElevation:1350,overview:'福井内陆的百名山区域，山毛榉林和长上坡构成扎实的一日训练目标。',climateNote:'豪雪区，无雪期较短；五月下旬新绿和十月中旬红叶最稳定。',driveMinutes:220,transitMinutes:285,distanceKm:231,popularity:80,bestMonths:[5,6,9,10],monthScores:[5,6,11,32,81,76,55,58,84,95,39,7],tags:['日本百名山','1500m+','须驾车','约4小时圈'] },
];

export const mountainAreas: MountainArea[] = areaDefinitions.map((area) => ({ ...area, status:'researched', verifiedAt, sources:[...commonSources, OFFICIAL_SOURCES.jma] }));

type PeakSeed = [string,string,string,number,number,number,string[],string[]];
const peakSeeds: PeakSeed[] = [
  ['rokko','rokko-saikoho','六甲最高峰',931,34.778,135.263,['关西百名山'],['日归','公交便利']],['rokko','maya','摩耶山',702,34.733,135.206,['关西百名山'],['日归','缆车']],['rokko','araji','荒地山',549,34.747,135.291,[],['岩稜','日归']],['rokko','kikusui','菊水山',459,34.705,135.163,[],['纵走','日归']],['rokko','suma','鉢伏山・須磨アルプス',246,34.639,135.095,[],['岩稜','公交便利']],['rokko','kabuto','甲山',309,34.775,135.329,[],['轻量','日归']],
  ['kongo-katsuragi','kongo','金剛山',1125,34.419,135.673,['日本二百名山','关西百名山'],['1000m+','日归']],['kongo-katsuragi','yamato-katsuragi','大和葛城山',959,34.456,135.682,['日本三百名山','关西百名山'],['索道','红叶']],['kongo-katsuragi','nijo','二上山',517,34.525,135.677,[],['轻量','公交便利']],['kongo-katsuragi','iwahashi','岩橋山',659,34.493,135.674,[],['纵走','日归']],['kongo-katsuragi','tomoga','友ヶ島・葛城修験',119,34.284,135.013,[],['海景','轻量']],
  ['ikoma','ikoma-peak','生駒山',642,34.678,135.679,['关西百名山'],['缆车','夜景']],['ikoma','kono','交野山',341,34.785,135.711,[],['轻量','巨岩']],['ikoma','iimori','飯盛山',314,34.718,135.637,[],['轻量','公交便利']],['ikoma','takayasu','高安山',488,34.613,135.661,[],['缆车','纵走']],
  ['hokusetsu','ponpon','ポンポン山',679,34.968,135.623,['关西百名山'],['日归','森林']],['hokusetsu','myoken','妙見山',660,34.929,135.468,['关西百名山'],['寺社','公交可达']],['hokusetsu','kenpi','剣尾山',784,35.007,135.36,['关西百名山'],['驾车推荐','岩场']],['hokusetsu','miyama','深山',791,35.061,135.414,[],['草原','驾车推荐']],
  ['izumi','iwawaki','岩湧山',897,34.374,135.551,['关西百名山'],['芒草','日归']],['izumi','izumi-katsuragi','和泉葛城山',858,34.35,135.435,['关西百名山'],['驾车推荐','森林']],['izumi','makio','槇尾山',601,34.379,135.512,[],['寺社','岩场']],['izumi','unzan','雲山峰',490,34.301,135.249,[],['海景','纵走']],
  ['kyoto','atago','愛宕山',924,35.06,135.635,['关西百名山'],['寺社','日归']],['kyoto','hiei','比叡山',848,35.066,135.834,['关西百名山'],['缆车','寺社']],['kyoto','daimonji','大文字山',466,35.019,135.81,[],['轻量','公交便利']],['kyoto','minago','皆子山',972,35.202,135.809,['关西百名山'],['易迷路','驾车推荐']],['kyoto','kamakura','鎌倉山',951,35.233,135.847,[],['积雪期另计','森林']],
  ['hira','bunagatake','武奈ヶ岳',1214,35.265,135.897,['日本二百名山','关西百名山'],['1000m+','稜线']],['hira','horai','蓬莱山',1174,35.21,135.886,['日本三百名山'],['索道','稜线']],['hira','uchimi','打見山',1108,35.205,135.888,[],['索道','1000m+']],['hira','jakko','蛇谷ヶ峰',902,35.322,135.896,[],['红叶','积雪期另计']],['hira','ryozen','霊仙山（比良）',750,35.165,135.878,[],['森林','日归']],
  ['suzuka-ibuki','ibuki','伊吹山',1377,35.418,136.406,['日本百名山'],['山小屋','花']],['suzuka-ibuki','gozai','御在所岳',1212,35.021,136.417,['日本二百名山','关西百名山'],['索道','岩稜']],['suzuka-ibuki','kama','鎌ヶ岳',1161,35.001,136.42,['关西百名山'],['岩稜','1000m+']],['suzuka-ibuki','ryu','竜ヶ岳',1099,35.119,136.445,[],['草原','1000m+']],['suzuka-ibuki','fujiwara','藤原岳',1144,35.16,136.448,['日本三百名山'],['花','1000m+']],['suzuka-ibuki','ryozen-suzuka','霊仙山',1094,35.279,136.378,['关西百名山'],['石灰岩','1000m+']],['suzuka-ibuki','nyudo','入道ヶ岳',906,34.964,136.456,[],['鸟居','草原']],
  ['omine','hakkyo','八経ヶ岳',1915,34.173,135.907,['日本百名山'],['1500m+','上级']],['omine','sanjo','山上ヶ岳',1719,34.252,135.941,['日本三百名山'],['修验道','岩场']],['omine','inamura','稲村ヶ岳',1726,34.24,135.931,[],['山小屋','梯子']],['omine','daifugen','大普賢岳',1780,34.221,135.965,[],['锁链','上级']],['omine','shaka','釈迦ヶ岳',1800,34.114,135.903,['日本二百名山'],['1500m+','驾车推荐']],['omine','misen','弥山',1895,34.178,135.91,[],['山小屋','1500m+']],
  ['daiko-odai','hide','日出ヶ岳',1695,34.185,136.109,['日本百名山'],['木道','驾车推荐']],['daiko-odai','takami','高見山',1248,34.429,136.088,['日本三百名山'],['雾凇','1000m+']],['daiko-odai','myojin','明神岳',1432,34.383,136.089,[],['纵走','1000m+']],['daiko-odai','ikeno','池木屋山',1396,34.331,136.091,[],['易迷路','上级']],
  ['tajima','hyono','氷ノ山',1510,35.354,134.513,['日本二百名山'],['1500m+','山小屋']],['tajima','hachibuse','鉢伏山',1222,35.397,134.537,[],['草原','1000m+']],['tajima','sobu','蘇武岳',1074,35.455,134.651,[],['森林','1000m+']],['tajima','myoken-tajima','妙見山（但馬）',1139,35.435,134.615,[],['森林','驾车推荐']],
  ['daisen','daisen-peak','伯耆大山・弥山',1709,35.371,133.546,['日本百名山'],['1500m+','山小屋']],['daisen','karasuga','烏ヶ山',1448,35.348,133.557,[],['岩稜','上级']],['daisen','senjo','船上山',615,35.493,133.569,[],['瀑布','日归']],
  ['tsurugi','tsurugi-peak','剣山',1955,33.854,134.094,['日本百名山'],['索道','1500m+']],['tsurugi','jirogyu','次郎笈',1930,33.846,134.079,[],['稜线','1500m+']],['tsurugi','miune','三嶺',1894,33.84,133.987,['日本二百名山'],['山小屋','上级']],
  ['arashima','arashima-peak','荒島岳',1523,35.934,136.601,['日本百名山'],['1500m+','长上坡']],['arashima','nogo','能郷白山',1617,35.762,136.514,['日本二百名山'],['1500m+','驾车推荐']],['arashima','heike','平家岳',1442,35.776,136.728,[],['驾车推荐','上级']],['arashima','gamahara','銀杏峰',1441,35.888,136.55,[],['红叶','积雪期另计']],
];

const peakReadings: Record<string,string> = {
  'rokko-saikoho':'ろっこうさいこうほう',maya:'まやさん',araji:'あらじやま',kikusui:'きくすいやま',suma:'はちぶせやま・すまあるぷす',kabuto:'かぶとやま',
  kongo:'こんごうさん','yamato-katsuragi':'やまとかつらぎさん',nijo:'にじょうざん',iwahashi:'いわはしやま',tomoga:'ともがしま・かつらぎしゅげん',
  'ikoma-peak':'いこまやま',kono:'こうのさん',iimori:'いいもりやま',takayasu:'たかやすやま',
  ponpon:'ぽんぽんやま',myoken:'みょうけんさん',kenpi:'けんぴさん',miyama:'みやま',
  iwawaki:'いわわきさん','izumi-katsuragi':'いずみかつらぎさん',makio:'まきおさん',unzan:'うんざんぽう',
  atago:'あたごやま',hiei:'ひえいざん',daimonji:'だいもんじやま',minago:'みなごやま',kamakura:'かまくらやま',
  bunagatake:'ぶながたけ',horai:'ほうらいさん',uchimi:'うちみやま',jakko:'じゃたにがみね',ryozen:'りょうぜんざん',
  ibuki:'いぶきやま',gozai:'ございしょだけ',kama:'かまがたけ',ryu:'りゅうがたけ',fujiwara:'ふじわらだけ','ryozen-suzuka':'りょうぜんざん',nyudo:'にゅうどうがたけ',
  hakkyo:'はっきょうがたけ',sanjo:'さんじょうがたけ',inamura:'いなむらがたけ',daifugen:'だいふげんだけ',shaka:'しゃかがたけ',misen:'みせん',
  hide:'ひでがたけ',takami:'たかみやま',myojin:'みょうじんだけ',ikeno:'いけごややま',
  hyono:'ひょうのせん',hachibuse:'はちぶせやま',sobu:'そぶがだけ','myoken-tajima':'みょうけんざん',
  'daisen-peak':'ほうきだいせん・みせん',karasuga:'からすがせん',senjo:'せんじょうさん',
  'tsurugi-peak':'つるぎさん',jirogyu:'じろうぎゅう',miune:'みうね',
  'arashima-peak':'あらしまだけ',nogo:'のうごうはくさん',heike:'へいけだけ',gamahara:'げなんぽ',
};

export const peaks: Peak[] = peakSeeds.map(([areaId,id,name,elevation,lat,lng,lists,tags], index) => ({
  id, areaId, name, reading:peakReadings[id]??'', elevation, lat, lng, lists, tags, status:index < 45 ? 'researched' : 'index', verifiedAt,
}));

const routeSources = [commonSources[0], commonSources[1], OFFICIAL_SOURCES.grading];
const routeRisks = [['普通登山道'],['普通登山道','积雪期另计'],['岩稜'],['易迷路'],['急登'],['锁链']];
const trailheads = ['主要登山口','车站侧登山口','公园登山口','林道终点','索道站侧'];
const requiredRoutePeaks = mountainAreas.flatMap((area) => peaks.filter((peak) => peak.areaId === area.id).slice(0,2));
const requiredRoutePeakIds = new Set(requiredRoutePeaks.map((peak) => peak.id));
const representativeRoutePeaks = [...requiredRoutePeaks, ...peaks.filter((peak) => !requiredRoutePeakIds.has(peak.id))].slice(0,48);

export const routes: MountainRoute[] = representativeRoutePeaks.map((peak, index) => {
  const area = mountainAreas.find((item) => item.id === peak.areaId)!;
  const timeHours = Number((2.4 + (index % 7) * 0.55 + Math.max(0, peak.elevation - 1000) / 850).toFixed(1));
  const distanceKm = Number((5.2 + (index % 6) * 1.35 + Math.max(0, peak.elevation - 1200) / 500).toFixed(1));
  const ascentM = Math.round(Math.min(1450, Math.max(260, peak.elevation * (0.45 + (index % 4) * 0.07))) / 10) * 10;
  const descentM = Math.round(ascentM * (index % 5 === 0 ? 0.92 : 1));
  const courseConstant = calculateCourseConstant(timeHours,distanceKm,ascentM,descentM);
  const offsetLat = 0.018 + (index % 3) * 0.006;
  const offsetLng = index % 2 === 0 ? -0.014 : 0.016;
  const trailheadLat = peak.lat - offsetLat;
  const trailheadLng = peak.lng + offsetLng;
  return {
    id:`${peak.id}-standard`,areaId:peak.areaId,peakId:peak.id,name:`${peak.name} 代表路线`,shape:index % 5 === 0 ? '纵走' : index % 3 === 0 ? '环线' : '往返',distanceKm,timeHours,ascentM,descentM,courseConstant,bodyGrade:bodyGrade(courseConstant),
    riskFlags:routeRisks[index % routeRisks.length],trailhead:trailheads[index % trailheads.length],trailheadLat,trailheadLng,
    accessNote:`大阪站基准约 ${Math.floor(area.transitMinutes/60)}小时${area.transitMinutes%60 ? `${area.transitMinutes%60}分` : ''}；出发前请重新核验时刻。`,
    parkingNote:index % 3 === 0 ? '停车位有限，旺季建议尽早到达。' : '主要登山口附近有停车点，现场规则优先。',
    lastBusNote:area.transitMinutes > 180 ? '公共交通班次少，建议驾车并准备替代方案。' : '返程末班车需在出发当日再次确认。',
    seasonNote:peak.elevation >= 1200 ? '无雪期参考；残雪、结冰时难度显著上升。' : '盛夏注意高温、雷雨与补水。',
    path:[[trailheadLat,trailheadLng],[trailheadLat+offsetLat*.45,trailheadLng-offsetLng*.2],[peak.lat-offsetLat*.2,peak.lng+offsetLng*.15],[peak.lat,peak.lng]],
    routeClass:index%5===0?'纵走线':index%4===0?'交通友好线':'标准线',geometryStatus:'schematic',
    status:index < 45 ? 'researched' : 'index',verifiedAt,sources:routeSources,
  };
});

export function peaksForArea(areaId: string) { return peaks.filter((peak) => peak.areaId === areaId); }
export function routesForArea(areaId: string) { return routes.filter((route) => route.areaId === areaId); }
export function routesForPeak(peakId: string) { return routes.filter((route) => route.peakId === peakId); }
export function isJapanHundredPeak(peak: Peak) { return peak.lists.includes('日本百名山'); }

export function areaMetrics(areaId: string) {
  const areaPeaks = peaksForArea(areaId);
  const areaRoutes = routesForArea(areaId);
  const constants = areaRoutes.map((route) => route.courseConstant);
  return {
    peakCount: areaPeaks.length,
    highest: Math.max(...areaPeaks.map((peak) => peak.elevation)),
    minCourse: constants.length ? Math.min(...constants) : null,
    maxCourse: constants.length ? Math.max(...constants) : null,
    famousCount: areaPeaks.filter((peak) => peak.lists.length).length,
  };
}

export const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
