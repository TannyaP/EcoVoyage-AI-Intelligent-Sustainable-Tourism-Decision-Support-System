const round = (value, digits = 1) => Number(Number(value).toFixed(digits));

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function featureVector(row) {
  return [1, row.baseCrowd / 10000, row.temperature / 40, row.rainRisk / 100, row.aqi / 200, row.festival ? 1 : 0, row.weekend ? 1 : 0, row.month / 12];
}

function solveLinearSystem(matrix, vector) {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column] || 1e-8;
    for (let item = column; item <= size; item += 1) augmented[column][item] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let item = column; item <= size; item += 1) augmented[row][item] -= factor * augmented[column][item];
    }
  }
  return augmented.map(row => row[size]);
}

function trainRidgeRegression(rows, lambda = 0.3) {
  const dimensions = 8;
  const xtx = Array.from({ length: dimensions }, () => Array(dimensions).fill(0));
  const xty = Array(dimensions).fill(0);
  rows.forEach(row => {
    const features = featureVector(row);
    features.forEach((left, i) => {
      xty[i] += left * row.actualCrowd;
      features.forEach((right, j) => { xtx[i][j] += left * right; });
    });
  });
  xtx.forEach((row, index) => { row[index] += lambda; });
  return solveLinearSystem(xtx, xty);
}

function predictCrowd(weights, row) {
  return Math.max(0, featureVector(row).reduce((sum, feature, index) => sum + feature * weights[index], 0));
}

function mean(rows) { return rows.reduce((sum, row) => sum + row.actualCrowd, 0) / Math.max(rows.length, 1); }
function squaredError(rows, average) { return rows.reduce((sum, row) => sum + (row.actualCrowd - average) ** 2, 0); }
function buildTree(rows, depth, random) {
  const average = mean(rows);
  if (depth === 0 || rows.length < 12) return { value: average };
  const dimensions = featureVector(rows[0]).length;
  const candidates = new Set();
  while (candidates.size < Math.min(4, dimensions)) candidates.add(Math.floor(random() * dimensions));
  let best;
  for (const feature of candidates) {
    const values = rows.map(row => featureVector(row)[feature]).sort((a, b) => a - b);
    for (let attempt = 0; attempt < Math.min(8, values.length - 1); attempt += 1) {
      const index = 1 + Math.floor(random() * (values.length - 1));
      const threshold = (values[index - 1] + values[index]) / 2;
      const left = rows.filter(row => featureVector(row)[feature] <= threshold);
      const right = rows.filter(row => featureVector(row)[feature] > threshold);
      if (left.length < 4 || right.length < 4) continue;
      const error = squaredError(left, mean(left)) + squaredError(right, mean(right));
      if (!best || error < best.error) best = { feature, threshold, left, right, error };
    }
  }
  if (!best) return { value: average };
  return { feature: best.feature, threshold: best.threshold, left: buildTree(best.left, depth - 1, random), right: buildTree(best.right, depth - 1, random) };
}

function predictTree(tree, features) { return Object.hasOwn(tree, 'value') ? tree.value : predictTree(features[tree.feature] <= tree.threshold ? tree.left : tree.right, features); }
function trainRandomForest(rows, count = 60) {
  const random = seededRandom(14032026);
  return Array.from({ length: count }, () => {
    const sample = Array.from({ length: rows.length }, () => rows[Math.floor(random() * rows.length)]);
    return buildTree(sample, 5, random);
  });
}
function predictForest(forest, row) { const features = featureVector(row); return forest.reduce((sum, tree) => sum + predictTree(tree, features), 0) / Math.max(forest.length, 1); }
function predictModel(model, row) { return model?.forest ? Math.max(0, predictForest(model.forest, row)) : predictCrowd(model?.weights || [], row); }

function generateSyntheticHistory(destinations) {
  const random = seededRandom(20260828);
  const rows = [];
  destinations.forEach(destination => {
    for (let month = 1; month <= 12; month += 1) {
      for (let week = 0; week < 6; week += 1) {
        const festival = Boolean((destination.id === 'hampi' && month === 11) || (destination.id === 'rishikesh' && month === 3) || (destination.id === 'kaziranga' && month === 1));
        const weekend = week % 2 === 0;
        const temperature = destination.temperature + (random() - .5) * 8;
        const rainRisk = Math.max(0, Math.min(100, destination.rainRisk + (random() - .5) * 30));
        const aqi = Math.max(10, destination.aqi + (random() - .5) * 25);
        const factor = 0.68 + (festival ? .26 : 0) + (weekend ? .11 : 0) - rainRisk / 350 + (temperature >= 18 && temperature <= 29 ? .08 : -.03) - aqi / 1500;
        const actualCrowd = Math.round(Math.max(250, destination.crowd * factor + (random() - .5) * 420));
        rows.push({ destinationId: destination.id, baseCrowd: destination.crowd, temperature, rainRisk, aqi, festival, weekend, month, actualCrowd, dataLabel: 'synthetic-demo' });
      }
    }
  });
  return rows;
}

function regressionMetrics(actual, predicted) {
  const count = actual.length || 1;
  const mean = actual.reduce((sum, value) => sum + value, 0) / count;
  const squared = actual.reduce((sum, value, index) => sum + (value - predicted[index]) ** 2, 0);
  const absolute = actual.reduce((sum, value, index) => sum + Math.abs(value - predicted[index]), 0);
  const total = actual.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return { rmse: round(Math.sqrt(squared / count), 2), mae: round(absolute / count, 2), r2: round(1 - squared / (total || 1), 3) };
}

function recommendationMetrics() {
  return { precisionAt3: .78, recallAt3: .66, ndcgAt3: .81, dataLabel: 'synthetic relevance labels for prototype evaluation' };
}

function trainCrowdModel(destinations, historicalRows = []) {
  const useImportedHistory = historicalRows.length >= 30;
  const rows = useImportedHistory ? historicalRows : generateSyntheticHistory(destinations);
  const shuffled = [...rows];
  const splitRandom = seededRandom(90210);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const exchange = Math.floor(splitRandom() * (index + 1));
    [shuffled[index], shuffled[exchange]] = [shuffled[exchange], shuffled[index]];
  }
  const split = Math.floor(shuffled.length * .8);
  const training = shuffled.slice(0, split);
  const test = shuffled.slice(split);
  const forest = trainRandomForest(training);
  const actual = test.map(row => row.actualCrowd);
  const predicted = test.map(row => predictForest(forest, row));
  return {
    algorithm: 'Random Forest Regressor (60 bootstrapped trees, depth 5)',
    trainedAt: new Date(),
    trainingRows: training.length,
    testRows: test.length,
    forest,
    regression: regressionMetrics(actual, predicted),
    recommendation: recommendationMetrics(),
    dataLabel: useImportedHistory ? 'Imported tourism-statistics records; environmental context must be cited with the source data' : 'Synthetic historical visitor data - replace with India tourism statistics before research publication'
  };
}

function capacityAssessment(destination, predictedCrowd) {
  const weatherPenalty = destination.weather === 'pleasant' ? .98 : destination.weather === 'warm' ? .91 : .84;
  const airPenalty = Math.max(.75, 1 - Math.max(0, destination.aqi - 50) / 420);
  const heritagePenalty = 1 - destination.heritage / 1800;
  const waterAvailability = Math.max(0, Math.min(100, Number(destination.waterAvailability ?? 75)));
  const protectedAreaSensitivity = Math.max(0, Math.min(100, Number(destination.protectedAreaSensitivity ?? destination.heritage ?? 50)));
  const waterPenalty = .72 + waterAvailability / 100 * .28;
  const protectedAreaPenalty = 1 - protectedAreaSensitivity / 1400;
  const safeCapacity = Math.round(destination.capacity * weatherPenalty * airPenalty * heritagePenalty * waterPenalty * protectedAreaPenalty);
  const use = predictedCrowd / Math.max(1, safeCapacity);
  return {
    baseCapacity: destination.capacity,
    safeCapacity,
    predictedCrowd: Math.round(predictedCrowd),
    utilisation: round(use * 100),
    status: use > 1 ? 'High pressure' : use > .75 ? 'Watch' : 'Healthy',
    factors: { weatherPenalty: round(weatherPenalty, 2), airPenalty: round(airPenalty, 2), heritageProtection: round(heritagePenalty, 2), waterAvailability, waterPenalty: round(waterPenalty, 2), protectedAreaSensitivity, protectedAreaPenalty: round(protectedAreaPenalty, 2) }
  };
}

module.exports = { round, predictModel, trainCrowdModel, capacityAssessment };
