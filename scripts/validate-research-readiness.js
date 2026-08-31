const { buildResearchReadiness, REQUIRED_DESTINATION_OBSERVATIONS } = require('../lib/research-readiness');

const baseEvidence = { destinationObservations: 0, historicalEnvironmentObservations: 0, approvedBehaviourRatings: 0, liveEnvironmentObservations: 0, latestPerformance: null, sourceRegistry: [] };
const incomplete = buildResearchReadiness(baseEvidence, { openWeather: false, waqi: false, atlasDeployment: false, atlasSearch: false });
if (incomplete.overallReady || incomplete.blockers.length !== 7) throw new Error('Incomplete research evidence must remain blocked.');

const complete = buildResearchReadiness({
  destinationObservations: REQUIRED_DESTINATION_OBSERVATIONS,
  historicalEnvironmentObservations: 1,
  approvedBehaviourRatings: 1,
  liveEnvironmentObservations: 1,
  latestPerformance: { environment: { deployment: 'mongodb-atlas' } },
  sourceRegistry: [{ key: 'festivals', status: 'imported' }]
}, { openWeather: true, waqi: true, atlasDeployment: true, atlasSearch: true });
if (!complete.overallReady || complete.blockers.length) throw new Error('Complete research evidence should be ready.');

console.log(`Research-readiness rules validated; minimum destination observations: ${REQUIRED_DESTINATION_OBSERVATIONS}.`);
