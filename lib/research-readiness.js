const REQUIRED_DESTINATION_OBSERVATIONS = 30;

function isImportedSource(registry, key) {
  const record = registry.find(item => item.key === key);
  return ['imported', 'bundled-official'].includes(record?.status);
}

function buildResearchReadiness(evidence, configuration) {
  const atlasDeployment = Boolean(configuration.atlasDeployment);
  const atlasSearch = atlasDeployment && Boolean(configuration.atlasSearch);
  const benchmarkDeployment = evidence.latestPerformance?.environment?.deployment || 'not benchmarked';
  const benchmarkMatchesTarget = Boolean(evidence.latestPerformance) && (!atlasDeployment || benchmarkDeployment === 'mongodb-atlas');
  const checks = [
    {
      id: 'destination-observations',
      label: 'Destination-level crowd observations',
      detail: `${evidence.destinationObservations}/${REQUIRED_DESTINATION_OBSERVATIONS} approved observations`,
      ready: evidence.destinationObservations >= REQUIRED_DESTINATION_OBSERVATIONS
    },
    {
      id: 'historical-environment',
      label: 'Historical environment observations',
      detail: `${evidence.historicalEnvironmentObservations} imported observations`,
      ready: evidence.historicalEnvironmentObservations > 0
    },
    {
      id: 'festival-provenance',
      label: 'Festival data provenance',
      detail: isImportedSource(evidence.sourceRegistry, 'festivals') ? 'cited import recorded' : 'demo seed only',
      ready: isImportedSource(evidence.sourceRegistry, 'festivals')
    },
    {
      id: 'behaviour-consent',
      label: 'Consented recommendation labels',
      detail: `${evidence.approvedBehaviourRatings} de-identified rating records`,
      ready: evidence.approvedBehaviourRatings > 0
    },
    {
      id: 'live-environment',
      label: 'Live weather and AQI ingestion',
      detail: configuration.openWeather && configuration.waqi ? `${evidence.liveEnvironmentObservations} live reading(s) stored` : 'OpenWeather and WAQI keys are not both configured',
      ready: configuration.openWeather && configuration.waqi && evidence.liveEnvironmentObservations > 0
    },
    {
      id: 'atlas-search',
      label: 'MongoDB Atlas and Atlas Search',
      detail: atlasSearch ? 'Atlas URI and Search flag configured' : 'Atlas URI and/or Search flag not configured',
      ready: atlasSearch
    },
    {
      id: 'latency-evidence',
      label: 'Target-deployment latency evidence',
      detail: evidence.latestPerformance ? `${benchmarkDeployment} benchmark recorded` : 'no benchmark recorded',
      ready: benchmarkMatchesTarget
    }
  ];
  const blockers = checks.filter(check => !check.ready).map(check => check.label);
  return {
    overallReady: blockers.length === 0,
    blockers,
    checks,
    requirements: { minimumDestinationObservations: REQUIRED_DESTINATION_OBSERVATIONS }
  };
}

module.exports = { REQUIRED_DESTINATION_OBSERVATIONS, buildResearchReadiness };
