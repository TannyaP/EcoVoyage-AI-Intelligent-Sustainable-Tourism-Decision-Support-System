require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoClient } = require('mongodb');
const { round, predictModel, trainCrowdModel, capacityAssessment } = require('./lib/analytics');

const ROOT = __dirname;
const SEED = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'seed.json'), 'utf8'));
const PORT = process.env.PORT || 3000;
const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGODB_DB || 'ecovoyage_ai';
const JWT_SECRET = process.env.JWT_SECRET || 'local-demo-only-change-before-deployment';
const app = express();
let db;

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Cache-Control': 'no-store' });
  next();
});
app.use(express.json({ limit: '150kb' }));

const accountSeeds = [
  ['u-tourist', 'Aarav Sharma', 'tourist@ecovoyage.ai', 'Tourist@123', 'tourist'],
  ['u-government', 'Nandini Rao', 'government@ecovoyage.ai', 'Gov@123', 'government'],
  ['u-admin', 'System Administrator', 'admin@ecovoyage.ai', 'Admin@123', 'admin']
];
const touristHome = { type: 'Point', coordinates: [77.5946, 12.9716] };
const festivalSeeds = [
  { destinationId: 'hampi', name: 'Hampi Utsav', month: 11, expectedInflow: 2100, source: 'seeded-demo' },
  { destinationId: 'rishikesh', name: 'International Yoga Festival', month: 3, expectedInflow: 3400, source: 'seeded-demo' },
  { destinationId: 'kaziranga', name: 'Wildlife Tourism Season', month: 1, expectedInflow: 1500, source: 'seeded-demo' }
];

function auth(...roles) {
  return async (req, res, next) => {
    try {
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const payload = jwt.verify(token, JWT_SECRET);
      const user = await db.collection('users').findOne({ id: payload.sub });
      if (!user || (roles.length && !roles.includes(user.role))) return res.status(403).json({ error: 'You do not have permission for this action.' });
      req.user = user;
      next();
    } catch {
      res.status(401).json({ error: 'Please sign in again.' });
    }
  };
}

function cleanUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, home: user.home, homeLocation: user.homeLocation, budget: user.budget, interests: user.interests || {}, history: user.history || [] };
}

function dtsi(destination) {
  const air = Math.max(0, 100 - destination.aqi);
  const weather = destination.weather === 'pleasant' ? 92 : destination.weather === 'warm' ? 70 : 64;
  const crowd = Math.max(0, 100 - destination.crowd / destination.capacity * 100);
  const carbon = Math.max(0, 100 - destination.carbon * 1.6);
  return round(air * .25 + weather * .15 + crowd * .28 + carbon * .17 + destination.heritage * .15);
}

function defaultPrediction(destination) {
  const weatherFactor = destination.weather === 'pleasant' ? 1.12 : .97;
  return destination.crowd * (1 - destination.rainRisk / 500) * weatherFactor;
}

function featureRow(destination, snapshot, festivals) {
  const now = new Date();
  return {
    baseCrowd: destination.crowd,
    temperature: snapshot.temperature ?? destination.temperature,
    rainRisk: snapshot.rainRisk ?? destination.rainRisk,
    aqi: snapshot.aqi ?? destination.aqi,
    festival: festivals.some(festival => festival.destinationId === destination.id && festival.month === now.getMonth() + 1),
    weekend: [0, 6].includes(now.getDay()),
    month: now.getMonth() + 1
  };
}

function destinationView(destination, model, festivals) {
  const snapshot = destination.latestEnvironment || {};
  const hydrated = { ...destination, ...snapshot };
  const prediction = model?.forest || model?.weights ? predictModel(model, featureRow(hydrated, snapshot, festivals)) : defaultPrediction(hydrated);
  const capacity = capacityAssessment(hydrated, prediction);
  return { ...hydrated, dtsi: dtsi({ ...hydrated, crowd: prediction }), predictedCrowd: capacity.predictedCrowd, capacityUse: capacity.utilisation, capacity, status: capacity.status };
}

function recommend(user, destinations) {
  return destinations.map(destination => {
    const interest = destination.tags.reduce((sum, tag) => sum + (user.interests?.[tag] || 0), 0) / destination.tags.length * 100;
    const budgetFit = destination.dailyCost <= user.budget ? 100 : Math.max(0, 100 - (destination.dailyCost - user.budget) / user.budget * 100);
    const weatherFit = destination.weather === 'pleasant' ? 100 : destination.weather === 'warm' ? 70 : 58;
    const capacityFit = Math.max(0, 100 - destination.capacityUse);
    const recommendationScore = round(interest * .38 + destination.dtsi * .30 + budgetFit * .14 + weatherFit * .10 + capacityFit * .08);
    return { ...destination, recommendationScore, why: [`${Math.round(interest)}% interest match`, `DTSI++ ${destination.dtsi}/100`, `${destination.capacityUse}% safe capacity use`] };
  }).sort((left, right) => right.recommendationScore - left.recommendationScore);
}

async function latestDestinations() {
  return db.collection('destinations').aggregate([
    { $lookup: { from: 'environmentReadings', let: { destinationId: '$id' }, pipeline: [ { $match: { $expr: { $eq: ['$meta.destinationId', '$$destinationId'] } } }, { $sort: { recordedAt: -1 } }, { $limit: 1 }, { $project: { _id: 0, meta: 0 } } ], as: 'environment' } },
    { $set: { latestEnvironment: { $ifNull: [{ $arrayElemAt: ['$environment', 0] }, {}] } } },
    { $unset: 'environment' }
  ]).toArray();
}

async function databaseSummary() {
  const names = ['users', 'destinations', 'visits', 'environmentReadings', 'festivals', 'modelRuns', 'capacityAssessments'];
  const collectionCounts = Object.fromEntries(await Promise.all(names.map(async name => [name, await db.collection(name).countDocuments()])));
  const [latestRun, latestReading, visitSummary] = await Promise.all([
    db.collection('modelRuns').find().sort({ trainedAt: -1 }).limit(1).next(),
    db.collection('environmentReadings').find().sort({ recordedAt: -1 }).limit(1).next(),
    db.collection('visits').aggregate([{ $group: { _id: '$destinationId', actions: { $sum: 1 } } }, { $sort: { actions: -1 } }, { $limit: 5 }]).toArray()
  ]);
  return { collectionCounts, latestModel: latestRun ? { algorithm: latestRun.algorithm, trainedAt: latestRun.trainedAt, regression: latestRun.regression, recommendation: latestRun.recommendation, dataLabel: latestRun.dataLabel } : null, latestReadingAt: latestReading?.recordedAt || null, visitSummary };
}

async function nearbyDestinations(point) {
  if (!point) return [];
  return db.collection('destinations').find({ location: { $near: { $geometry: point, $maxDistance: 1400000 } } }).limit(3).toArray();
}

async function getModel() { return db.collection('modelRuns').find().sort({ trainedAt: -1 }).limit(1).next(); }

async function runModelTraining() {
  const destinations = await db.collection('destinations').find().toArray();
  const run = trainCrowdModel(destinations);
  await db.collection('modelRuns').insertOne(run);
  return run;
}

async function syncAssessments(destinations, model, festivals) {
  const records = destinations.map(destination => {
    const view = destinationView(destination, model, festivals);
    return { destinationId: view.id, assessment: view.capacity, dtsi: view.dtsi, createdAt: new Date(), dataLabel: model?.dataLabel || 'heuristic fallback' };
  });
  if (records.length) await db.collection('capacityAssessments').insertMany(records);
}

async function fetchLiveData(destination) {
  const point = destination.location.coordinates;
  const result = { destinationId: destination.id, source: [], aqi: destination.aqi, weather: destination.weather, temperature: destination.temperature, rainRisk: destination.rainRisk, poiCount: null, live: false, notes: [] };
  if (process.env.OPENWEATHER_API_KEY) {
    const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${point[1]}&lon=${point[0]}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`);
    if (!response.ok) throw new Error(`OpenWeather returned ${response.status}`);
    const weather = await response.json();
    result.temperature = weather.main.temp;
    result.rainRisk = Math.min(100, Math.round((weather.clouds?.all || 0) * .65 + (weather.rain ? 35 : 0)));
    result.weather = weather.weather?.[0]?.main?.toLowerCase().includes('clear') ? 'pleasant' : weather.main.temp > 29 ? 'warm' : 'humid';
    result.source.push('OpenWeather'); result.live = true;
  } else result.notes.push('OpenWeather key not configured; seeded weather retained.');
  if (process.env.WAQI_TOKEN) {
    const response = await fetch(`https://api.waqi.info/feed/geo:${point[1]};${point[0]}/?token=${process.env.WAQI_TOKEN}`);
    if (!response.ok) throw new Error(`WAQI returned ${response.status}`);
    const aqi = await response.json();
    if (aqi.status === 'ok') { result.aqi = Number(aqi.data.aqi); result.source.push('WAQI'); result.live = true; }
  } else result.notes.push('WAQI token not configured; seeded AQI retained.');
  try {
    const query = `[out:json][timeout:20];(nwr["tourism"](around:10000,${point[1]},${point[0]}););out center;`;
    const response = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: query });
    if (response.ok) { const osm = await response.json(); result.poiCount = osm.elements?.length || 0; result.source.push('OpenStreetMap'); result.live = true; }
  } catch { result.notes.push('OSM collector unavailable; no POI count refreshed.'); }
  return result;
}

async function ingestEnvironment(destinationIds) {
  const destinations = await db.collection('destinations').find(destinationIds?.length ? { id: { $in: destinationIds } } : {}).toArray();
  const readings = [];
  for (const destination of destinations) {
    try {
      const live = await fetchLiveData(destination);
      readings.push({ meta: { destinationId: destination.id, source: live.source.length ? live.source.join(', ') : 'seeded-fallback' }, aqi: live.aqi, weather: live.weather, temperature: live.temperature, rainRisk: live.rainRisk, poiCount: live.poiCount, isLive: live.live, notes: live.notes, recordedAt: new Date() });
    } catch (error) {
      readings.push({ meta: { destinationId: destination.id, source: 'seeded-fallback' }, aqi: destination.aqi, weather: destination.weather, temperature: destination.temperature, rainRisk: destination.rainRisk, poiCount: null, isLive: false, notes: [error.message], recordedAt: new Date() });
    }
  }
  if (readings.length) await db.collection('environmentReadings').insertMany(readings);
  return readings;
}

app.post('/api/auth/login', async (req, res) => {
  const { email, password, role } = req.body || {};
  const user = await db.collection('users').findOne({ email: String(email || '').toLowerCase(), role });
  if (!user || !await bcrypt.compare(password || '', user.passwordHash)) return res.status(401).json({ error: 'Incorrect email, password or selected role.' });
  const token = jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user: cleanUser(user) });
});

app.get('/api/auth/me', auth(), (req, res) => res.json({ user: cleanUser(req.user) }));

app.get('/api/bootstrap', auth(), async (req, res) => {
  const [rawDestinations, model, festivals, database, nearbyRaw] = await Promise.all([latestDestinations(), getModel(), db.collection('festivals').find().toArray(), databaseSummary(), nearbyDestinations(req.user.homeLocation)]);
  const destinations = rawDestinations.map(destination => destinationView(destination, model, festivals));
  const nearbyIds = new Set(nearbyRaw.map(destination => destination.id));
  const nearby = destinations.filter(destination => nearbyIds.has(destination.id));
  await syncAssessments(rawDestinations, model, festivals);
  const metrics = { destinations: destinations.length, healthy: destinations.filter(destination => destination.status === 'Healthy').length, averageDtsi: round(destinations.reduce((sum, destination) => sum + destination.dtsi, 0) / Math.max(1, destinations.length)), visitors: destinations.reduce((sum, destination) => sum + destination.predictedCrowd, 0) };
  res.json({ user: cleanUser(req.user), recommendations: req.user.role === 'tourist' ? recommend(req.user, destinations) : [], destinations, nearby, metrics, database, dataSources: { OpenWeather: Boolean(process.env.OPENWEATHER_API_KEY), WAQI: Boolean(process.env.WAQI_TOKEN), OpenStreetMap: true, UNESCO: 'seeded heritage enrichment', festivals: 'seeded festival data', tourismStatistics: 'synthetic demo training data' } });
});

app.get('/api/destinations/nearby', auth(), async (req, res) => {
  const lng = Number(req.query.lng); const lat = Number(req.query.lat);
  const centre = Number.isFinite(lng) && Number.isFinite(lat) ? { type: 'Point', coordinates: [lng, lat] } : req.user.homeLocation;
  if (!centre) return res.status(400).json({ error: 'Provide longitude and latitude.' });
  const [destinations, model, festivals] = await Promise.all([nearbyDestinations(centre), getModel(), db.collection('festivals').find().toArray()]);
  res.json({ centre, results: destinations.map(destination => destinationView(destination, model, festivals)) });
});

app.post('/api/interactions', auth('tourist'), async (req, res) => {
  const { destinationId, action = 'saved', rating } = req.body || {};
  const destination = await db.collection('destinations').findOne({ id: destinationId });
  if (!destination) return res.status(404).json({ error: 'Destination not found.' });
  const interests = { ...(req.user.interests || {}) };
  destination.tags.forEach(tag => interests[tag] = round(Math.min(1, (interests[tag] || 0) + .06), 2));
  const history = [destination.name, ...(req.user.history || [])].slice(0, 25);
  await Promise.all([
    db.collection('users').updateOne({ id: req.user.id }, { $set: { interests, history } }),
    db.collection('visits').insertOne({ userId: req.user.id, destinationId: destination.id, action, rating: Number(rating) || null, at: new Date(), source: 'web-dashboard' })
  ]);
  res.status(201).json({ message: 'DTIP profile updated from observed behaviour.', interests, history });
});

app.get('/api/government/overview', auth('government', 'admin'), async (req, res) => {
  const [destinations, model, festivals, visitSummary] = await Promise.all([
    latestDestinations(),
    getModel(),
    db.collection('festivals').find().toArray(),
    db.collection('visits').aggregate([{ $group: { _id: '$destinationId', saved: { $sum: 1 }, averageRating: { $avg: '$rating' } } }]).toArray()
  ]);
  const activity = Object.fromEntries(visitSummary.map(row => [row._id, row]));
  const pressure = destinations.map(destination => ({ ...destinationView(destination, model, festivals), engagement: activity[destination.id] || { saved: 0, averageRating: null } })).sort((left, right) => right.capacityUse - left.capacityUse);
  res.json({ pressure, methodology: 'Safe capacity adjusts base capacity for weather, air quality and heritage protection.' });
});

app.get('/api/analytics/evaluation', auth('government', 'admin'), async (req, res) => {
  const run = await getModel();
  if (!run) return res.status(404).json({ error: 'No training run exists.' });
  res.json({ algorithm: run.algorithm, trainedAt: run.trainedAt, trainingRows: run.trainingRows, testRows: run.testRows, regression: run.regression, recommendation: run.recommendation, dataLabel: run.dataLabel });
});

app.get('/api/admin/database/status', auth('admin'), async (req, res) => {
  const [summary, destinationIndexes, readingIndexes] = await Promise.all([databaseSummary(), db.collection('destinations').indexes(), db.collection('environmentReadings').indexes()]);
  res.json({ ...summary, indexes: { destinations: destinationIndexes.map(index => index.name), environmentReadings: readingIndexes.map(index => index.name) } });
});

app.post('/api/admin/environment/snapshots', auth('admin'), async (req, res) => {
  const { destinationId, aqi, weather, temperature, rainRisk, source = 'admin-manual' } = req.body || {};
  if (!destinationId || !Number.isFinite(aqi) || !weather || !Number.isFinite(temperature) || !Number.isFinite(rainRisk)) return res.status(400).json({ error: 'destinationId, aqi, weather, temperature and rainRisk are required.' });
  if (!await db.collection('destinations').findOne({ id: destinationId })) return res.status(404).json({ error: 'Destination not found.' });
  const reading = { meta: { destinationId, source }, aqi, weather, temperature, rainRisk, isLive: false, notes: ['Manual administrator entry'], recordedAt: new Date() };
  await db.collection('environmentReadings').insertOne(reading);
  res.status(201).json({ message: 'Environmental reading stored in the MongoDB time-series collection.', reading });
});

app.post('/api/admin/ingestion/run', auth('admin'), async (req, res) => {
  const readings = await ingestEnvironment(req.body?.destinationIds);
  res.status(201).json({ message: 'Data ingestion completed.', readings: readings.map(reading => ({ destinationId: reading.meta.destinationId, source: reading.meta.source, isLive: reading.isLive, notes: reading.notes })) });
});

app.post('/api/admin/models/train', auth('admin'), async (req, res) => res.status(201).json({ message: 'Crowd model trained and stored in MongoDB.', run: await runModelTraining() }));

app.use(express.static(path.join(ROOT, 'dist'), { index: 'index.html' }));
app.get('*splat', (req, res) => res.sendFile(path.join(ROOT, 'dist', 'index.html')));

async function initialise() {
  const client = new MongoClient(URI, { serverSelectionTimeoutMS: 5000 });
  await client.connect(); db = client.db(DB_NAME);
  await db.collection('destinations').createIndex({ location: '2dsphere' });
  await db.collection('visits').createIndex({ userId: 1, at: -1 });
  await db.collection('modelRuns').createIndex({ trainedAt: -1 });
  await db.collection('capacityAssessments').createIndex({ destinationId: 1, createdAt: -1 });
  const collections = await db.listCollections({ name: 'environmentReadings' }).toArray();
  if (!collections.length) await db.createCollection('environmentReadings', { timeseries: { timeField: 'recordedAt', metaField: 'meta', granularity: 'hours' }, expireAfterSeconds: 2592000 });
  if (!await db.collection('destinations').countDocuments()) await db.collection('destinations').insertMany(SEED.destinations);
  if (!await db.collection('festivals').countDocuments()) await db.collection('festivals').insertMany(festivalSeeds);
  for (const [id, name, email, password, role] of accountSeeds) {
    await db.collection('users').updateOne({ id }, { $set: { id, name, email, passwordHash: await bcrypt.hash(password, 12), role, home: role === 'tourist' ? 'Bengaluru' : 'India', homeLocation: role === 'tourist' ? touristHome : null, budget: 9000, interests: role === 'tourist' ? SEED.users[0].interests : {}, history: role === 'tourist' ? SEED.users[0].history : [] } }, { upsert: true });
  }
  if (!await db.collection('environmentReadings').countDocuments()) await ingestEnvironment();
  if (!await db.collection('modelRuns').countDocuments()) await runModelTraining();
  app.listen(PORT, () => console.log(`EcoVoyage AI is running at http://localhost:${PORT} with MongoDB database ${DB_NAME}`));
}

initialise().catch(error => { console.error('Startup failed:', error); process.exit(1); });
