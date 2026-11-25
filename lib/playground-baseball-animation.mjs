// Presentation only. These frames do not advance a pitch or decide contact/results.
const POSES = '/images/playground/baseball/poses/20261123'
const MOTION = '/images/playground/baseball/motion/20261123-v5'
const FRAME_NAMES = ['ready', 'load', 'plant', 'precontact', 'contact', 'follow', 'recovery', 'reset']

function freezeTree(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeTree)
    Object.freeze(value)
  }
  return value
}

export const BASEBALL_BATTER_FRAME_NAMES = Object.freeze(FRAME_NAMES)

// Reviewed source-pixel front-sole anchors, independent of canvas size/DPR.
// Left-handed source poses are distinct images, not mirrored right-handed poses.
// In the load image the sole is lifted by about 15 source pixels.
const FOOT_ANCHORS = {
  right: {
    ready: { x: 580, y: 1360 },
    load: { x: 600, y: 1390 },
    plant: { x: 850, y: 1430 },
    precontact: { x: 840, y: 1440 },
    contact: { x: 700, y: 1410 },
    follow: { x: 820, y: 1470 },
    recovery: { x: 630, y: 1370 },
    reset: { x: 590, y: 1370 },
  },
  left: {
    ready: { x: 340, y: 1365 },
    load: { x: 350, y: 1390 },
    plant: { x: 180, y: 1435 },
    precontact: { x: 160, y: 1435 },
    contact: { x: 285, y: 1405 },
    follow: { x: 200, y: 1470 },
    recovery: { x: 250, y: 1450 },
    reset: { x: 315, y: 1370 },
  },
}

// Manually reviewed source-pixel landmarks (about +/-12px), not motion capture.
// A raised heel has a toe support; the load foot retains its virtual ground reference.
const POSE_LANDMARKS = {
  right: {
    ready: {"feet":{"lead":{"outline":[[488,1288],[548,1281],[606,1305],[660,1326],[688,1336],[694,1354],[683,1372],[607,1376],[527,1366],[469,1353],[458,1330],[466,1305]],"contact":[[475,1349],[678,1364]],"kind":"flat-sole","liftPx":0,"groundReference":{"x":576.5,"y":1356.5}},"trail":{"outline":[[214,1405],[275,1414],[330,1420],[364,1442],[410,1470],[423,1493],[420,1514],[342,1524],[246,1510],[195,1488],[190,1461],[201,1431]],"contact":[[205,1490],[405,1514]],"kind":"flat-sole","liftPx":0,"groundReference":{"x":305,"y":1502}}},"bat":{"barrelEnd":[218,42],"barrelStart":[350,265],"grip":[470,429],"knob":[495,483]}},
    load: {"feet":{"lead":{"outline":[[498,1281],[554,1282],[601,1302],[660,1320],[695,1343],[704,1363],[696,1381],[612,1380],[534,1361],[475,1346],[465,1328],[477,1306]],"contact":[],"kind":"lifted","liftPx":15,"groundReference":{"x":600,"y":1390},"virtualContact":[[498.5,1382.5],[701.5,1397.5]]},"trail":{"outline":[[212,1408],[275,1410],[332,1425],[374,1450],[419,1478],[428,1499],[419,1517],[343,1521],[252,1509],[195,1490],[185,1470],[197,1438]],"contact":[[203,1490],[410,1512]],"kind":"flat-sole","liftPx":0,"groundReference":{"x":306.5,"y":1501}}},"bat":{"barrelEnd":[149,36],"barrelStart":[304,292],"grip":[414,427],"knob":[448,522]}},
    plant: {"feet":{"lead":{"outline":[[749,1341],[810,1334],[850,1350],[893,1375],[945,1392],[968,1411],[965,1430],[934,1446],[855,1443],[784,1433],[721,1423],[714,1406],[725,1379]],"contact":[[729,1425],[947,1435]],"kind":"flat-sole","liftPx":0,"groundReference":{"x":838,"y":1430}},"trail":{"outline":[[116,1298],[160,1292],[201,1318],[225,1360],[216,1401],[208,1434],[220,1462],[219,1485],[201,1494],[165,1476],[140,1440],[133,1395],[113,1368],[97,1336]],"contact":[[205,1485]],"kind":"toe-pivot","liftPx":0,"groundReference":{"x":205,"y":1485}}},"bat":{"barrelEnd":[127,264],"barrelStart":[332,435],"grip":[556,581],"knob":[619,638]}},
    precontact: {"feet":{"lead":{"outline":[[749,1364],[812,1358],[855,1374],[901,1396],[947,1412],[968,1435],[966,1452],[935,1463],[858,1458],[783,1453],[724,1443],[714,1426],[725,1396]],"contact":[[730,1448],[946,1455]],"kind":"flat-sole","liftPx":0,"groundReference":{"x":838,"y":1451.5}},"trail":{"outline":[[94,1299],[137,1291],[178,1325],[195,1363],[184,1418],[170,1455],[175,1484],[157,1501],[134,1499],[105,1476],[91,1436],[91,1385],[73,1345],[71,1322]],"contact":[[155,1497]],"kind":"toe-pivot","liftPx":0,"groundReference":{"x":155,"y":1497}}},"bat":{"barrelEnd":[335,740],"barrelStart":[540,652],"grip":[783,555],"knob":null}},
    contact: {"feet":{"lead":{"outline":[[622,1334],[683,1327],[724,1347],[774,1372],[812,1388],[827,1409],[820,1427],[785,1435],[710,1430],[640,1424],[592,1414],[584,1396],[596,1367]],"contact":[[599,1417],[808,1428]],"kind":"flat-sole","liftPx":0,"groundReference":{"x":703.5,"y":1422.5}},"trail":{"outline":[[59,1298],[99,1305],[136,1331],[155,1380],[147,1420],[174,1451],[179,1469],[166,1480],[128,1474],[91,1455],[76,1422],[70,1382],[43,1351],[32,1325]],"contact":[[163,1474]],"kind":"toe-pivot","liftPx":0,"groundReference":{"x":163,"y":1474}}},"bat":{"barrelEnd":[1000,561],"barrelStart":[794,568],"grip":[604,569],"knob":[542,568]}},
    follow: {"feet":{"lead":{"outline":[[724,1380],[781,1372],[822,1394],[866,1417],[916,1431],[940,1451],[935,1468],[903,1478],[827,1476],[755,1465],[694,1454],[685,1437],[696,1406]],"contact":[[699,1458],[921,1470]],"kind":"flat-sole","liftPx":0,"groundReference":{"x":810,"y":1464}},"trail":{"outline":[[152,1308],[187,1315],[213,1344],[226,1370],[216,1411],[205,1457],[212,1493],[202,1512],[180,1518],[153,1499],[141,1458],[145,1409],[127,1376],[125,1344]],"contact":[[194,1511]],"kind":"toe-pivot","liftPx":0,"groundReference":{"x":194,"y":1511}}},"bat":{"barrelEnd":[49,45],"barrelStart":[164,133],"grip":[294,222],"knob":null}},
    recovery: {"feet":{"lead":{"outline":[[543,1310],[602,1304],[647,1324],[693,1343],[731,1357],[747,1377],[739,1391],[703,1400],[630,1395],[562,1384],[514,1376],[507,1357],[518,1328]],"contact":[[522,1382],[727,1393]],"kind":"flat-sole","liftPx":0,"groundReference":{"x":624.5,"y":1387.5}},"trail":{"outline":[[192,1401],[251,1405],[303,1418],[348,1445],[385,1472],[395,1492],[389,1508],[355,1519],[278,1509],[209,1496],[173,1481],[167,1460],[177,1429]],"contact":[[183,1488],[378,1510]],"kind":"flat-sole","liftPx":0,"groundReference":{"x":280.5,"y":1499}}},"bat":{"barrelEnd":[186,181],"barrelStart":[356,326],"grip":[537,474],"knob":[592,546]}},
    reset: {"feet":{"lead":{"outline":[[489,1293],[548,1284],[603,1304],[653,1326],[682,1335],[695,1358],[686,1373],[608,1379],[531,1368],[469,1356],[458,1334],[466,1310]],"contact":[[474,1356],[679,1371]],"kind":"flat-sole","liftPx":0,"groundReference":{"x":576.5,"y":1363.5}},"trail":{"outline":[[213,1408],[273,1415],[328,1422],[369,1452],[409,1475],[425,1496],[416,1516],[341,1523],[247,1512],[196,1490],[190,1464],[200,1437]],"contact":[[204,1494],[408,1515]],"kind":"flat-sole","liftPx":0,"groundReference":{"x":306,"y":1504.5}}},"bat":{"barrelEnd":[177,99],"barrelStart":[335,295],"grip":[466,418],"knob":[491,496]}},
  },
  left: {
    ready: {"feet":{"lead":{"outline":[[349,1289],[438,1302],[473,1325],[474,1348],[433,1364],[289,1378],[235,1368],[234,1340]],"contact":[[246,1366],[271,1374],[460,1352],[460,1347]],"kind":"flat-sole","liftPx":0,"groundReference":{"x":340,"y":1365}},"trail":{"outline":[[669,1400],[783,1410],[806,1453],[807,1481],[773,1500],[629,1517],[561,1503],[562,1474]],"contact":[[575,1506],[595,1514],[791,1491],[791,1486]],"kind":"flat-sole","liftPx":0,"groundReference":{"x":700,"y":1505}}},"bat":{"barrelEnd":[818,47],"barrelStart":[671,224],"grip":[565,405],"knob":[514,490]}},
    load: {"feet":{"lead":{"outline":[[337,1263],[452,1268],[481,1299],[478,1320],[409,1345],[289,1379],[241,1367],[242,1340]],"contact":[],"kind":"lifted","liftPx":15,"groundReference":{"x":350,"y":1390},"virtualContact":[[256,1391],[281,1399],[470,1377],[470,1372]]},"trail":{"outline":[[672,1409],[804,1410],[819,1457],[817,1481],[785,1501],[634,1519],[567,1505],[568,1476]],"contact":[[580,1508],[600,1516],[804,1493],[804,1488]],"kind":"flat-sole","liftPx":0,"groundReference":{"x":704,"y":1507}}},"bat":{"barrelEnd":[858,55],"barrelStart":[721,215],"grip":[585,405],"knob":[551,489]}},
    plant: {"feet":{"lead":{"outline":[[175,1345],[279,1356],[294,1394],[291,1424],[262,1438],[107,1455],[57,1440],[56,1416]],"contact":[[67,1439],[92,1447],[280,1424],[280,1419]],"kind":"flat-sole","liftPx":0,"groundReference":{"x":180,"y":1435}},"trail":{"outline":[[832,1295],[921,1304],[940,1334],[925,1388],[896,1447],[875,1494],[815,1504],[811,1483]],"contact":[[824,1493],[848,1493],[848,1501],[824,1501]],"kind":"toe-pivot","liftPx":0,"groundReference":{"x":836,"y":1496}}},"bat":{"barrelEnd":[901,251],"barrelStart":[761,371],"grip":[535,585],"knob":[450,667]}},
    precontact: {"feet":{"lead":{"outline":[[145,1340],[241,1355],[258,1390],[257,1422],[217,1435],[98,1451],[42,1439],[40,1416]],"contact":[[52,1438],[77,1446],[247,1422],[247,1417]],"kind":"flat-sole","liftPx":0,"groundReference":{"x":160,"y":1435}},"trail":{"outline":[[875,1277],[943,1278],[961,1303],[946,1359],[942,1430],[925,1467],[876,1480],[866,1459]],"contact":[[877,1469],[901,1469],[901,1477],[877,1477]],"kind":"toe-pivot","liftPx":0,"groundReference":{"x":889,"y":1472}}},"bat":{"barrelEnd":[805,754],"barrelStart":[621,709],"grip":[272,627],"knob":null}},
    contact: {"feet":{"lead":{"outline":[[283,1328],[385,1345],[397,1383],[397,1409],[363,1420],[222,1433],[177,1422],[174,1402]],"contact":[[187,1421],[212,1429],[385,1409],[385,1404]],"kind":"flat-sole","liftPx":0,"groundReference":{"x":285,"y":1405}},"trail":{"outline":[[910,1282],[957,1285],[978,1308],[958,1369],[929,1425],[909,1458],[849,1471],[838,1451]],"contact":[[851,1458],[875,1458],[875,1466],[851,1466]],"kind":"toe-pivot","liftPx":0,"groundReference":{"x":863,"y":1461}}},"bat":{"barrelEnd":[28,566],"barrelStart":[171,566],"grip":[412,562],"knob":[482,556]}},
    follow: {"feet":{"lead":{"outline":[[190,1380],[300,1392],[318,1436],[318,1457],[290,1470],[120,1486],[67,1472],[63,1449]],"contact":[[77,1470],[102,1478],[307,1459],[307,1454]],"kind":"flat-sole","liftPx":0,"groundReference":{"x":200,"y":1470}},"trail":{"outline":[[848,1307],[905,1321],[927,1351],[913,1416],[911,1485],[889,1512],[847,1523],[831,1503]],"contact":[[851,1510],[875,1510],[875,1518],[851,1518]],"kind":"toe-pivot","liftPx":0,"groundReference":{"x":863,"y":1513}}},"bat":{"barrelEnd":[979,44],"barrelStart":[883,111],"grip":[754,217],"knob":null}},
    recovery: {"feet":{"lead":{"outline":[[228,1365],[327,1379],[347,1412],[346,1442],[312,1457],[194,1470],[130,1457],[129,1433]],"contact":[[141,1457],[166,1465],[336,1444],[336,1439]],"kind":"flat-sole","liftPx":0,"groundReference":{"x":250,"y":1450}},"trail":{"outline":[[700,1395],[823,1398],[848,1434],[850,1459],[821,1483],[704,1516],[629,1502],[631,1475]],"contact":[[642,1503],[662,1511],[838,1468],[838,1463]],"kind":"flat-sole","liftPx":0,"groundReference":{"x":738,"y":1503}}},"bat":{"barrelEnd":[827,196],"barrelStart":[729,289],"grip":[534,528],"knob":[484,607]}},
    reset: {"feet":{"lead":{"outline":[[302,1294],[411,1310],[432,1340],[431,1361],[395,1373],[248,1388],[190,1371],[190,1344]],"contact":[[201,1371],[226,1379],[421,1361],[421,1356]],"kind":"flat-sole","liftPx":0,"groundReference":{"x":315,"y":1370}},"trail":{"outline":[[674,1409],[788,1414],[811,1453],[811,1483],[784,1504],[636,1518],[565,1505],[565,1476]],"contact":[[577,1507],[597,1515],[800,1493],[800,1488]],"kind":"flat-sole","liftPx":0,"groundReference":{"x":701,"y":1505}}},"bat":{"barrelEnd":[857,89],"barrelStart":[744,247],"grip":[580,420],"knob":[535,499]}},
  },
}

// Versioned lower-leg edits selected locally after whole-pose visual review.
// The approved v4/v5 files remain available through originalSrc for comparison.
const POSE_EDITS = {
  right: {
    plant: {"src":"/images/playground/baseball/motion/20261123-v6-foot-candidates/right-plant-v6.png","feet":{"lead":{"outline":[[585,1348],[644,1345],[685,1362],[720,1387],[765,1404],[787,1428],[789,1444],[771,1453],[693,1451],[625,1444],[560,1436],[551,1419],[562,1389]],"heel":[564,1435],"toe":[772,1447],"support":"grounded","kind":"flat-sole","contact":[[564,1435],[772,1447]],"groundReference":{"x":668,"y":1441},"liftPx":0},"trail":{"outline":[[211,1301],[252,1312],[282,1338],[299,1372],[290,1400],[302,1433],[315,1468],[306,1485],[286,1488],[253,1471],[225,1438],[212,1400],[200,1367],[186,1335]],"heel":[196,1328],"toe":[301,1480],"support":"toe-pivot","kind":"toe-pivot","contact":[[301,1480]],"groundReference":{"x":301,"y":1480},"liftPx":0}},"bat":{"barrelEnd":[127,264],"barrelStart":[332,435],"grip":[556,581],"knob":[619,638]},"accuracyPx":15},
    precontact: {"src":"/images/playground/baseball/motion/20261123-v6-foot-candidates/right-precontact-v6.png","feet":{"lead":{"outline":[[633,1375],[717,1370],[757,1391],[803,1413],[836,1428],[848,1448],[843,1469],[807,1475],[735,1468],[667,1462],[616,1457],[604,1441],[612,1412]],"heel":[615,1458],"toe":[829,1467],"support":"grounded","kind":"flat-sole","contact":[[615,1458],[829,1467]],"groundReference":{"x":722,"y":1462.5},"liftPx":0},"trail":{"outline":[[194,1328],[235,1329],[266,1353],[284,1394],[276,1431],[277,1466],[290,1491],[279,1508],[258,1506],[226,1483],[205,1445],[196,1406],[176,1370],[173,1346]],"heel":[181,1344],"toe":[275,1497],"support":"toe-pivot","kind":"toe-pivot","contact":[[275,1497]],"groundReference":{"x":275,"y":1497},"liftPx":0}},"bat":{"barrelEnd":[335,740],"barrelStart":[540,652],"grip":[783,555],"knob":null},"accuracyPx":15},
    follow: {"src":"/images/playground/baseball/motion/20261123-v6-foot-candidates/right-follow-v6.png","feet":{"lead":{"outline":[[570,1378],[628,1378],[672,1398],[711,1420],[756,1433],[782,1455],[778,1472],[751,1479],[680,1476],[608,1468],[544,1458],[534,1441],[544,1411]],"heel":[544,1456],"toe":[769,1471],"support":"grounded","kind":"flat-sole","contact":[[544,1456],[769,1471]],"groundReference":{"x":656.5,"y":1463.5},"liftPx":0},"trail":{"outline":[[244,1327],[277,1339],[303,1369],[307,1398],[292,1437],[288,1471],[297,1495],[285,1510],[262,1513],[238,1496],[225,1457],[233,1411],[221,1384],[220,1356]],"heel":[229,1354],"toe":[282,1507],"support":"toe-pivot","kind":"toe-pivot","contact":[[282,1507]],"groundReference":{"x":282,"y":1507},"liftPx":0}},"bat":{"barrelEnd":[49,45],"barrelStart":[164,133],"grip":[294,222],"knob":null},"accuracyPx":15},
  },
  left: {
    plant: {"src":"/images/playground/baseball/motion/20261123-v6-foot-candidates/left-plant-v6.png","feet":{"lead":{"outline":[[271,1354],[374,1364],[393,1402],[395,1435],[364,1454],[218,1469],[166,1454],[165,1429]],"contact":[[174,1451],[198,1459],[383,1447],[383,1442]],"groundReference":{"x":278.5,"y":1450.5},"kind":"flat-sole","liftPx":0},"trail":{"outline":[[729,1307],[786,1321],[812,1343],[796,1391],[764,1448],[736,1482],[683,1492],[673,1472]],"contact":[[685,1480],[709,1480],[709,1488],[685,1488]],"groundReference":{"x":697,"y":1483},"kind":"toe-pivot","liftPx":0}},"bat":{"knob":[450,667],"grip":[535,585],"barrelStart":[761,371],"barrelEnd":[901,251]},"accuracyPx":15},
    precontact: {"src":"/images/playground/baseball/motion/20261123-v6-foot-candidates/left-precontact-v6.png","feet":{"lead":{"outline":[[261,1341],[356,1357],[375,1390],[379,1412],[350,1430],[229,1453],[168,1438],[165,1414]],"contact":[[174,1433],[198,1441],[367,1418],[367,1413]],"groundReference":{"x":270.5,"y":1427},"kind":"flat-sole","liftPx":0},"trail":{"outline":[[769,1284],[830,1290],[853,1311],[839,1360],[818,1413],[799,1448],[748,1468],[734,1448]],"contact":[[744,1458],[768,1458],[768,1466],[744,1466]],"groundReference":{"x":756,"y":1461},"kind":"toe-pivot","liftPx":0}},"bat":{"knob":null,"grip":[272,627],"visibleStart":[300,638],"barrelStart":[621,709],"barrelEnd":[805,754]},"accuracyPx":15},
    follow: {"src":"/images/playground/baseball/motion/20261123-v6-foot-candidates/left-follow-v6.png","feet":{"lead":{"outline":[[278,1386],[378,1397],[392,1435],[391,1458],[359,1473],[205,1487],[153,1472],[150,1447]],"contact":[[160,1467],[185,1475],[381,1460],[381,1455]],"groundReference":{"x":270.5,"y":1467.5},"kind":"flat-sole","liftPx":0},"trail":{"outline":[[755,1320],[808,1328],[830,1351],[814,1414],[800,1474],[779,1500],[741,1514],[729,1496]],"contact":[[736,1501],[760,1501],[760,1509],[736,1509]],"groundReference":{"x":748,"y":1505},"kind":"toe-pivot","liftPx":0}},"bat":{"knob":null,"grip":[754,217],"barrelStart":[883,111],"barrelEnd":[979,44]},"accuracyPx":15},
  },
}

function supportCenter(feet) {
  const supports = Object.values(feet).flatMap(foot => foot.kind === 'lifted'
    ? foot.virtualContact : foot.contact)
  return { x:(Math.min(...supports.map(p => p[0])) + Math.max(...supports.map(p => p[0]))) / 2,
    y:(Math.min(...supports.map(p => p[1])) + Math.max(...supports.map(p => p[1]))) / 2 }
}

const HELMET_BOUNDS = {
  right: {
    ready: [400, 100, 680, 320], load: [400, 100, 680, 320],
    plant: [450, 80, 740, 310], precontact: [380, 60, 680, 300],
    contact: [200, 150, 470, 375], follow: [450, 60, 740, 330],
    recovery: [420, 60, 710, 320], reset: [400, 100, 680, 320],
  },
  left: {
    ready: [290, 100, 590, 320], load: [300, 100, 590, 320],
    plant: [270, 90, 570, 330], precontact: [280, 90, 590, 330],
    contact: [575, 135, 850, 370], follow: [280, 65, 570, 330],
    recovery: [275, 80, 580, 335], reset: [290, 90, 590, 340],
  },
}

const CONTACT_NUMBER_POLYGON = [[145, 385], [325, 400], [390, 565], [340, 690], [170, 660], [120, 490]]

function framesFor(handedness) {
  const left = handedness === 'left'
  return Object.fromEntries(FRAME_NAMES.map(name => {
    const foot = FOOT_ANCHORS[handedness][name]
    const edit = POSE_EDITS[handedness][name]
    const landmarks = edit || POSE_LANDMARKS[handedness][name]
    const originalSrc = name === 'ready' || name === 'follow'
      ? `${POSES}/batter-${name}-${handedness}-angle-v4.png`
      : `${MOTION}/${handedness}-${name}-v5.png`
    const [helmetLeft, helmetTop, helmetRight, helmetBottom] = HELMET_BOUNDS[handedness][name]
    const backNumber = name === 'contact' ? {
      polygon: CONTACT_NUMBER_POLYGON.map(([x, y]) => [left ? 1024 - x : x, y]),
      transform: { x: left ? 774 : 250, y: 525, rotationDeg: left ? -6 : 6, skewDeg: left ? 8 : -8, scaleX: 1 },
      fontPx: 115,
      maxWidth: 160,
      maxHeight: 150,
    } : name === 'follow' ? {
      polygon: left
        ? [[324, 360], [624, 360], [614, 650], [334, 650]]
        : [[390, 360], [680, 360], [700, 650], [400, 650]],
      transform: { x: left ? 470 : 550, y: 510, rotationDeg: left ? 13 : -13, skewDeg: left ? 8 : -8, scaleX: 1 },
      fontPx: 144,
      maxWidth: 220,
      maxHeight: 190,
    } : null
    return [name, {
      name,
      src: edit?.src || originalSrc,
      originalSrc,
      poseRevision: edit ? 'v6-foot' : 'original',
      width: 1024,
      height: 1536,
      footAnchor: { x: foot.x, y: foot.y },
      registrationAnchor: supportCenter(landmarks.feet),
      feet: landmarks.feet,
      batLandmarks: landmarks.bat,
      landmarkAccuracyPx: edit?.accuracyPx || 12,
      helmetPolygon: [[helmetLeft, helmetTop], [helmetRight, helmetTop], [helmetRight, helmetBottom], [helmetLeft, helmetBottom]],
      backNumber,
    }]
  }))
}

export const BASEBALL_BATTER_FRAMES = freezeTree({ right: framesFor('right'), left: framesFor('left') })

export const BASEBALL_BATTER_TIMELINE = freezeTree([
  { startMs: 0, frame: 'load' },
  { startMs: 45, frame: 'plant' },
  { startMs: 80, frame: 'precontact' },
  { startMs: 110, frame: 'contact' },
  { startMs: 155, frame: 'follow' },
  { startMs: 280, frame: 'recovery' },
  { startMs: 420, frame: 'reset' },
  { startMs: 520, frame: 'ready' },
])

// The scene may hold the follow-through after gameplay has already resolved at
// 520ms. This table must never be used as the game's result/pitch-count deadline.
export const BASEBALL_BATTER_VISUAL_TIMELINE = freezeTree([
  { startMs: 0, frame: 'load' },
  { startMs: 45, frame: 'plant' },
  { startMs: 80, frame: 'precontact' },
  { startMs: 110, frame: 'contact' },
  { startMs: 155, frame: 'follow' },
  { startMs: 520, frame: 'recovery' },
  { startMs: 700, frame: 'reset' },
  { startMs: 900, frame: 'ready' },
])

export function getBaseballBatterFrames(handedness = 'right') {
  return BASEBALL_BATTER_FRAMES[handedness === 'left' ? 'left' : 'right']
}

/** elapsedMs is since the swing request, never since release or ball contact. */
export function sampleBaseballBatterAnimation(elapsedMs, handedness = 'right', options = {}) {
  const frames = getBaseballBatterFrames(handedness)
  if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs) || elapsedMs < 0) return frames.ready
  const timeline = options?.visualTail === true ? BASEBALL_BATTER_VISUAL_TIMELINE : BASEBALL_BATTER_TIMELINE
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    if (elapsedMs >= timeline[index].startMs) return frames[timeline[index].frame]
  }
  return frames.ready
}
