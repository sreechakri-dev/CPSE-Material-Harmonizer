# CPSE Material Harmonizer

National CPSE Material Standardization Initiative — "One Nation, One Material Code"

## Setup

```
npm install
npm start
```

Then open http://localhost:3000

## Demo credentials

| Role            | User ID | Password |
|-----------------|---------|----------|
| Storekeeper     | EMP001  | emp123   |
| Branch Officer  | OFF101  | off123   |
| National Admin  | ADM999  | adm123   |

A `database.db` SQLite file is created automatically in the project root the first time the server runs.

## AI Description-Driven Semantic Pooling

Two new modules handle messy, inconsistent warehouse descriptions:

- **Bulk Data Ingestion** (all roles) — drag-and-drop a `.csv` or `.xlsx` export. Column headers just need to contain "description", "category", and "location" somewhere.
- **AI Pooling Review** (Branch Officer / National Admin only) — a side-by-side queue showing each raw description, its AI confidence score against the master catalog, and a suggested clean description / master code. Actions: approve a pooled or new-code suggestion, override with an edited description, or bulk-approve everything at ≥80% confidence.

The matching engine (`server.js`) normalizes text (lowercasing, punctuation stripping, CPSE abbreviation expansion — `MS`→Mild Steel, `SCH`→Schedule, etc.), tokenizes it, and scores it against every existing master description using Jaccard token-overlap similarity blended with Levenshtein edit distance. Thresholds: ≥80% auto-suggests pooling under the existing code, 50–79% queues it as "Pending AI Review," below 50% is flagged as a new unique item. Nothing is written to the production `materials` table until a reviewer approves it from the queue — uploads only populate the `staging_inventory` table.
"# CPSE-Material-Harmonizer" 
