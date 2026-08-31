# MongoDB Atlas and Atlas Search setup

This repository runs unchanged with local MongoDB. Use these steps only when you are ready to deploy your own data to MongoDB Atlas. Do not commit a connection string, database password or API key.

## 1. Create the database connection

1. Create an Atlas deployment in your own Atlas project.
2. Create a least-privilege database user with read/write access to the `ecovoyage_ai` database.
3. Add the IP address that will run the Express server to the Atlas network access list.
4. Copy the SRV connection string and put it in your untracked `.env` file:

   ```dotenv
   MONGODB_URI=mongodb+srv://<database-user>:<password>@<cluster-host>/ecovoyage_ai?retryWrites=true&w=majority
   MONGODB_DB=ecovoyage_ai
   JWT_SECRET=replace-with-a-long-random-secret
   USE_ATLAS_SEARCH=true
   ATLAS_SEARCH_INDEX=destination-search
   ```

The server creates normal MongoDB indexes, its time-series collection and the first-run seed data on startup. Keep `.env` private; it is ignored by Git.

## 2. Create the Atlas Search index

In the Atlas UI, open the `ecovoyage_ai.destinations` collection, create a Search index, select the JSON editor, set the index name to `destination-search`, and paste the contents of:

`atlas/destination-search-index.json`

The definition deliberately uses static mappings only for the four fields queried by the application: `name`, `state`, `tags` and `description`. This limits unintended indexing of application and user fields. Wait for the index status to become **Ready** before enabling `USE_ATLAS_SEARCH=true`.

## 3. Verify the integration

1. Start the application with the Atlas `.env` file.
2. Sign in using any demo account and search for `heritage`, `Kerala`, or `beach`.
3. The result label should be **MongoDB Atlas Search**. If the index is missing, unavailable, or the flag is false, the application intentionally returns **MongoDB field-search fallback** instead.
4. In the Administrator dashboard, confirm the data-source status shows Atlas Search as enabled.

## Safety checklist

- Never use an Atlas admin password in source code, commits, screenshots or a paper appendix.
- Restrict network access to the server’s current address instead of allowing every address in production.
- Use a separate research/development database rather than a personal or production database.
- Record the deployment environment before interpreting latency results: local MongoDB and Atlas timings are not directly comparable.

MongoDB’s documentation describes static mappings as indexing only the specified fields, and Atlas Search index definitions can be stored as JSON configuration files. Sources: https://www.mongodb.com/docs/search/index/define-field-mappings/ and https://www.mongodb.com/docs/atlas/cli/current/reference/json/search-index-config-file/
