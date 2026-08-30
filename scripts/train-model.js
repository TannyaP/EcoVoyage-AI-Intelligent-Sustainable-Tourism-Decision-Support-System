const { MongoClient } = require('mongodb');
const { trainCrowdModel } = require('../lib/analytics');

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017');
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'ecovoyage_ai');
  const run = trainCrowdModel(await db.collection('destinations').find().toArray());
  await db.collection('modelRuns').insertOne(run);
  console.log(JSON.stringify({ algorithm: run.algorithm, regression: run.regression, recommendation: run.recommendation, dataLabel: run.dataLabel }, null, 2));
  await client.close();
})().catch(error => { console.error(error); process.exit(1); });
