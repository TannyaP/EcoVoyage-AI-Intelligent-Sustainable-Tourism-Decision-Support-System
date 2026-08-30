# EcoVoyage AI

EcoVoyage AI is a full-stack sustainable-tourism decision-support prototype for the CSE3086 NoSQL project. It implements the Review 1 design with a React interface, Express API, MongoDB data model, role-based access, geospatial queries, time-series environmental data, crowd prediction, carrying-capacity assessment, and a hybrid recommender.

## Run the application

1. In WSL, start MongoDB:

   ```bash
   sudo service mongod start
   ```

2. In this folder, build the React client after any client-side edit:

   ```powershell
   .\node_modules\.bin\vite.cmd build
   ```

3. Start the Express server:

   ```powershell
   & "C:\Users\hp\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.js
   ```

4. Open `http://localhost:3000`.

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Tourist | `tourist@ecovoyage.ai` | `Tourist@123` |
| Government | `government@ecovoyage.ai` | `Gov@123` |
| Administrator | `admin@ecovoyage.ai` | `Admin@123` |

Passwords are bcrypt-hashed before storage. JWTs expire after eight hours.

## Implemented requirements

| Review 1 component | Implementation |
|---|---|
| Tourist / Government / Admin dashboards | Role-based React views secured by JWT middleware |
| MongoDB NoSQL architecture | `users`, `destinations`, `visits`, `environmentReadings`, `festivals`, `modelRuns`, `capacityAssessments` collections |
| Document / GeoJSON data | Destination documents store GeoJSON points; `location_2dsphere` supports `$near` queries |
| Time-series environmental data | Native MongoDB time-series `environmentReadings` collection with a 30-day expiry policy |
| DTIP | Tourist actions update interest weights and append immutable visitor events |
| DTSI++ | AQI, weather, crowd, carbon and heritage weighted sustainability score |
| Crowd prediction | Random Forest Regressor with 60 bootstrapped trees, persisted evaluation evidence |
| Carrying capacity | Safe capacity recalculated from weather, air-quality and heritage-protection penalties |
| Hybrid recommender | DTIP, DTSI++, budget, weather, predicted crowd and capacity combined into a ranking |
| MongoDB aggregation | `$lookup` retrieves the most recent environmental reading for every destination |
| Maps / eco context | React Leaflet map using OpenStreetMap tiles and MongoDB GeoJSON locations |
| Performance evidence | RMSE, MAE, R², Precision@3, Recall@3 and NDCG@3 shown to Government/Admin roles |
| Mobile support | Responsive UI plus installable web-app manifest/service worker |

## Live data connectors

Copy `.env.example` to `.env`, then add your own keys:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=ecovoyage_ai
JWT_SECRET=use-a-long-random-value-here
OPENWEATHER_API_KEY=your_openweather_key
WAQI_TOKEN=your_waqi_token
```

The Administrator dashboard’s **Refresh environment & OSM data** button then calls these integrations:

- **OpenWeather**: temperature and weather condition
- **WAQI**: air-quality index
- **OpenStreetMap/Overpass**: nearby tourism POI count

UNESCO heritage information, festivals and tourism statistics remain seeded in this prototype because the source datasets/API access credentials were not supplied. Seeded or fallback values are explicitly labelled in the app and database. Replace those documents with cited official exports before presenting research results as real-world findings.

## API endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/login` | Role-aware sign-in and JWT issuance |
| `GET /api/bootstrap` | Role dashboard data, recommendations and data-source status |
| `POST /api/interactions` | Tourist behavioural event / DTIP update |
| `GET /api/destinations/nearby` | MongoDB `$near` geospatial destinations |
| `GET /api/government/overview` | Capacity pressure and engagement analytics |
| `GET /api/analytics/evaluation` | Model / recommender evaluation metrics |
| `GET /api/admin/database/status` | Collection counts, indexes and latest model evidence |
| `POST /api/admin/environment/snapshots` | Manually insert an environmental reading |
| `POST /api/admin/ingestion/run` | Run configured OpenWeather, WAQI and OSM ingestion |
| `POST /api/admin/models/train` | Train and persist a Random Forest evaluation run |

## Research-data note

The currently stored historical visitor records and relevance labels are synthetic demo data. They validate the pipeline and calculation flow, but they must be replaced with a cited India tourism dataset before the evaluation scores are reported in the paper as experimental results.
