// ============================================================================
// National CPSE Material Standardization Initiative
// "One Nation - One Material Code"
// server.js — Express backend, SQLite database, and REST API controllers
// ============================================================================

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory upload buffer for staging file ingestion (.csv / .xlsx)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ----------------------------------------------------------------------------
// 1. Database setup
// ----------------------------------------------------------------------------

const db = new sqlite3.Database(path.join(__dirname, 'database.db'), (err) => {
    if (err) {
        console.error('Failed to open database.db:', err.message);
    } else {
        console.log('Connected to SQLite database (database.db).');
    }
});

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userid TEXT UNIQUE,
            password TEXT,
            name TEXT,
            role TEXT,
            entity TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS materials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT,
            description TEXT,
            category TEXT,
            location TEXT,
            status TEXT,
            added_by TEXT
        )
    `);

    // AI Semantic Pooling — staging queue for raw, unstandardized warehouse rows
    db.run(`
        CREATE TABLE IF NOT EXISTS staging_inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            raw_description TEXT,
            raw_category TEXT,
            raw_location TEXT,
            normalized_description TEXT,
            suggested_description TEXT,
            status TEXT,
            similarity_score REAL,
            matched_code TEXT,
            confidence_score REAL,
            uploaded_by TEXT,
            resolved INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // ------------------------------------------------------------------------
    // 2. Seed default RBAC users if the table is empty
    // ------------------------------------------------------------------------
    db.get('SELECT COUNT(*) AS count FROM users', (err, row) => {
        if (err) {
            console.error('Error checking users table:', err.message);
            return;
        }
        if (row.count === 0) {
            const seedUsers = [
                ['EMP001', 'emp123', 'Rajesh Kumar', 'Storekeeper', 'CPSE North Operations'],
                ['OFF101', 'off123', 'Ananya Sharma', 'Branch Officer', 'CPSE Central Logistics'],
                ['ADM999', 'adm123', 'Dr. V. K. Malhotra', 'National Admin', 'Grid Controller HQ']
            ];
            const insertStmt = db.prepare(
                'INSERT INTO users (userid, password, name, role, entity) VALUES (?, ?, ?, ?, ?)'
            );
            seedUsers.forEach((u) => insertStmt.run(u));
            insertStmt.finalize(() => {
                console.log('Seeded default users: EMP001, OFF101, ADM999');
            });
        }
    });
});

// ----------------------------------------------------------------------------
// 3. Server-side in-memory session state
// ----------------------------------------------------------------------------

let sessionState = {
    isAuthenticated: false,
    currentUser: null,
    activeTab: 'profile',
    theme: 'dark',
    lastScannedBarcode: 'CPSE-IND-88421',
    systemStatus: 'Online - Secure Offline/Online Sync Active'
};

// Helper: generate a random 5-digit numeric string
function randomFiveDigits() {
    return String(Math.floor(10000 + Math.random() * 90000));
}

// Helper: strip password before ever sending a user object to the client
function sanitizeUser(user) {
    if (!user) return null;
    const { password, ...safe } = user;
    return safe;
}

// ============================================================================
// AI Description-Driven Semantic Pooling & Matching Engine
// ----------------------------------------------------------------------------
// Warehouses write the same material a dozen different ways ("MS PIPE SCH40
// 2IN" vs "Mild Steel Seamless Pipe 2-inch" vs "MS TUBING 50MM"). This engine
// normalizes each raw description into a comparable token set, then scores it
// against the existing master catalog using Jaccard token-overlap similarity,
// with Levenshtein string distance blended in as a secondary confidence
// signal. Nothing here calls an external AI API — it's a deterministic,
// explainable text-matching pipeline, which keeps master-data decisions
// auditable (a hard requirement for CPSE governance).
// ============================================================================

const CPSE_ABBREVIATIONS = {
    'ms': 'mild steel',
    'ss': 'stainless steel',
    'in': 'inch',
    'sch': 'schedule',
    'mm': 'millimeter',
    'galv': 'galvanized',
    'dia': 'diameter',
    'hex': 'hexagon',
    'qty': 'quantity',
    'no': 'number'
};

const STOP_WORDS = new Set(['for', 'with', 'the', 'a', 'an', 'of', 'and', 'to', 'in', 'on', 'at']);
// Note: bare "in" as a stop word only applies AFTER abbreviation expansion has
// already turned the technical unit "IN" into "inch" — so this never eats the
// unit itself, only genuine prepositions like "pipe in warehouse".

// Split glued number+letter tokens ("SCH40" -> "SCH 40", "2IN" -> "2 IN")
function splitNumberLetterBoundaries(str) {
    return str
        .replace(/(\d)([a-zA-Z])/g, '$1 $2')
        .replace(/([a-zA-Z])(\d)/g, '$1 $2');
}

// Normalize a raw warehouse description into a clean token array
function normalizeDescription(raw) {
    if (!raw) return { tokens: [], normalizedString: '' };

    let text = String(raw)
        .toLowerCase()
        .replace(/"/g, ' inch ')          // the inch mark is a real technical token, not punctuation
        .replace(/['\-\/,]/g, ' ')        // strip hyphens, quotes, slashes, commas
        .replace(/[^a-z0-9\s]/g, ' ');    // strip any remaining special punctuation

    text = splitNumberLetterBoundaries(text);

    const rawTokens = text.split(/\s+/).filter(Boolean);

    const expanded = [];
    for (const tok of rawTokens) {
        if (CPSE_ABBREVIATIONS[tok]) {
            expanded.push(...CPSE_ABBREVIATIONS[tok].split(' '));
        } else {
            expanded.push(tok);
        }
    }

    const tokens = expanded.filter((tok) => tok.length > 0 && !STOP_WORDS.has(tok));

    return { tokens, normalizedString: tokens.join(' ') };
}

// Jaccard similarity between two token sets: |A ∩ B| / |A ∪ B|
function jaccardSimilarity(tokensA, tokensB) {
    const setA = new Set(tokensA);
    const setB = new Set(tokensB);
    if (setA.size === 0 && setB.size === 0) return 0;

    let intersection = 0;
    for (const tok of setA) {
        if (setB.has(tok)) intersection += 1;
    }
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
}

// Standard Levenshtein edit-distance, normalized to a 0..1 similarity score
function levenshteinSimilarity(a, b) {
    if (a === b) return 1;
    if (!a.length || !b.length) return 0;

    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost
            );
        }
    }
    const distance = dp[m][n];
    const maxLen = Math.max(m, n);
    return maxLen === 0 ? 1 : 1 - distance / maxLen;
}

// Build a human-readable "clean" description from normalized tokens
// (simple heuristic title-caser — not a substitute for a curated master name,
// but enough to give a reviewer a readable suggestion at a glance).
function formatSuggestedDescription(tokens) {
    return tokens
        .map((tok) => (/^\d+$/.test(tok) ? tok : tok.charAt(0).toUpperCase() + tok.slice(1)))
        .join(' ');
}

// Compare one raw description against the full master catalog and return the
// best match plus its blended confidence score.
function findBestMatch(rawDescription, materialsRows) {
    const { tokens: incomingTokens, normalizedString: incomingNormalized } = normalizeDescription(rawDescription);

    let best = null;

    for (const row of materialsRows) {
        const { tokens: masterTokens, normalizedString: masterNormalized } = normalizeDescription(row.description);
        if (masterTokens.length === 0) continue;

        const jaccard = jaccardSimilarity(incomingTokens, masterTokens);
        const editSim = levenshteinSimilarity(incomingNormalized, masterNormalized);
        // Jaccard (token overlap) carries most of the weight; Levenshtein acts
        // as a tie-breaker / secondary signal for near-identical phrasing.
        const confidence = jaccard * 0.8 + editSim * 0.2;

        if (!best || confidence > best.confidence) {
            best = {
                code: row.code,
                description: row.description,
                category: row.category,
                jaccard,
                confidence
            };
        }
    }

    return {
        incomingTokens,
        incomingNormalized,
        best
    };
}

// Classify a match result into the three-tier pooling workflow
function classifyMatch(best) {
    const score = best ? best.confidence : 0;
    if (best && score >= 0.8) {
        return { status: 'Pooled (Auto-Suggested)', matchedCode: best.code };
    }
    if (best && score >= 0.5) {
        return { status: 'Pending AI Review', matchedCode: best.code };
    }
    return { status: 'New Unique Item - Requires Master Code Generation', matchedCode: null };
}

// ----------------------------------------------------------------------------
// 4. REST API routes
// ----------------------------------------------------------------------------

// POST /api/login
app.post('/api/login', (req, res) => {
    const { userid, password } = req.body || {};

    if (!userid || !password) {
        return res.status(400).json({ success: false, message: 'User ID and password are required.' });
    }

    db.get(
        'SELECT * FROM users WHERE userid = ? AND password = ?',
        [userid, password],
        (err, user) => {
            if (err) {
                console.error('Login query error:', err.message);
                return res.status(500).json({ success: false, message: 'Internal server error.' });
            }
            if (!user) {
                return res.status(401).json({ success: false, message: 'Invalid User ID or password.' });
            }

            sessionState.isAuthenticated = true;
            sessionState.currentUser = user;
            sessionState.activeTab = 'profile';

            return res.json({ success: true, user: sanitizeUser(user) });
        }
    );
});

// POST /api/logout
app.post('/api/logout', (req, res) => {
    sessionState.isAuthenticated = false;
    sessionState.currentUser = null;
    sessionState.activeTab = 'profile';
    return res.json({ success: true });
});

// GET /api/state
app.get('/api/state', (req, res) => {
    db.all('SELECT * FROM materials ORDER BY id DESC LIMIT 50', [], (err, rows) => {
        if (err) {
            console.error('Error fetching materials:', err.message);
            return res.status(500).json({ success: false, message: 'Internal server error.' });
        }

        return res.json({
            ...sessionState,
            currentUser: sanitizeUser(sessionState.currentUser),
            materials: rows
        });
    });
});

// POST /api/tab — server-side RBAC enforcement
app.post('/api/tab', (req, res) => {
    const { tab } = req.body || {};

    if (!sessionState.isAuthenticated || !sessionState.currentUser) {
        return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }

    const role = sessionState.currentUser.role;

    if (tab === 'restrictions' && !(role === 'Branch Officer' || role === 'National Admin')) {
        return res.status(403).json({ success: false, message: 'Access Denied: insufficient privileges for Purchase Restrictions.' });
    }

    if (tab === 'review_queue' && !(role === 'Branch Officer' || role === 'National Admin')) {
        return res.status(403).json({ success: false, message: 'Access Denied: insufficient privileges for AI Pooling Review.' });
    }

    if (tab === 'override' && role !== 'National Admin') {
        return res.status(403).json({ success: false, message: 'Access Denied: Global Edit & Override is restricted to National Admin.' });
    }

    sessionState.activeTab = tab;
    return res.json({ success: true });
});

// POST /api/materials
app.post('/api/materials', (req, res) => {
    if (!sessionState.isAuthenticated || !sessionState.currentUser) {
        return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }

    const { description, category, location, isScan } = req.body || {};

    if (!isScan && (!description || !category || !location)) {
        return res.status(400).json({ success: false, message: 'Description, category, and location are required.' });
    }

    const prefix = isScan ? 'CPSE-SCN' : 'CPSE-MAT';
    const code = `${prefix}-${randomFiveDigits()}`;

    const finalDescription = isScan
        ? (description || 'Scanned Item — Pending Manual Description')
        : description;
    const finalCategory = isScan ? (category || 'Uncategorized') : category;
    const finalLocation = isScan ? (location || 'Unassigned Node') : location;

    if (isScan) {
        sessionState.lastScannedBarcode = code;
    }

    db.run(
        'INSERT INTO materials (code, description, category, location, status, added_by) VALUES (?, ?, ?, ?, ?, ?)',
        [code, finalDescription, finalCategory, finalLocation, 'Verified Standard', sessionState.currentUser.userid],
        function (err) {
            if (err) {
                console.error('Error inserting material:', err.message);
                return res.status(500).json({ success: false, message: 'Internal server error.' });
            }

            db.all('SELECT * FROM materials ORDER BY id DESC LIMIT 50', [], (err2, rows) => {
                if (err2) {
                    console.error('Error fetching materials:', err2.message);
                    return res.status(500).json({ success: false, message: 'Internal server error.' });
                }
                return res.json({
                    success: true,
                    code,
                    ...sessionState,
                    currentUser: sanitizeUser(sessionState.currentUser),
                    materials: rows
                });
            });
        }
    );
});

// POST /api/override — National Admin only, purges all material records
app.post('/api/override', (req, res) => {
    if (!sessionState.isAuthenticated || !sessionState.currentUser) {
        return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }

    if (sessionState.currentUser.role !== 'National Admin') {
        return res.status(403).json({ success: false, message: 'Access Denied: Global Override is restricted to National Admin.' });
    }

    db.run('DELETE FROM materials', [], function (err) {
        if (err) {
            console.error('Error purging materials:', err.message);
            return res.status(500).json({ success: false, message: 'Internal server error.' });
        }
        return res.json({ success: true, message: 'All master inventory records have been purged and reset.' });
    });
});

// POST /api/theme
app.post('/api/theme', (req, res) => {
    sessionState.theme = sessionState.theme === 'dark' ? 'light' : 'dark';
    return res.json({ success: true, theme: sessionState.theme });
});

// ----------------------------------------------------------------------------
// AI Semantic Pooling — staging ingestion & review-queue routes
// ----------------------------------------------------------------------------

function requireAuth(req, res) {
    if (!sessionState.isAuthenticated || !sessionState.currentUser) {
        res.status(401).json({ success: false, message: 'Not authenticated.' });
        return false;
    }
    return true;
}

// Approving/rejecting matches commits permanent National Master Codes, so this
// mirrors the same reviewer-tier restriction as the "restrictions" tab.
function requireReviewerRole(req, res) {
    const role = sessionState.currentUser && sessionState.currentUser.role;
    if (!(role === 'Branch Officer' || role === 'National Admin')) {
        res.status(403).json({ success: false, message: 'Access Denied: insufficient privileges for AI Pooling Review.' });
        return false;
    }
    return true;
}

// Loosely match a spreadsheet header to the field we need, regardless of
// exact wording ("Description" / "Item Desc" / "raw_description", etc.)
function findColumn(headerRow, candidates) {
    const normalizedHeaders = headerRow.map((h) => String(h || '').toLowerCase().trim());
    for (const candidate of candidates) {
        const idx = normalizedHeaders.findIndex((h) => h.includes(candidate));
        if (idx !== -1) return idx;
    }
    return -1;
}

// POST /api/upload-staging — parse a .csv/.xlsx of raw warehouse rows, run the
// matching engine against the current master catalog, and stage the results.
app.post('/api/upload-staging', upload.single('file'), (req, res) => {
    if (!requireAuth(req, res)) return;

    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded. Attach a .csv or .xlsx file under field "file".' });
    }

    let rows;
    try {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    } catch (err) {
        console.error('Error parsing upload:', err.message);
        return res.status(400).json({ success: false, message: 'Could not parse the uploaded file. Ensure it is a valid .csv or .xlsx.' });
    }

    if (!rows || rows.length < 2) {
        return res.status(400).json({ success: false, message: 'The uploaded file has no data rows below the header.' });
    }

    const headerRow = rows[0];
    const descIdx = findColumn(headerRow, ['description', 'desc', 'material', 'item']);
    const catIdx = findColumn(headerRow, ['category', 'cat', 'type']);
    const locIdx = findColumn(headerRow, ['location', 'loc', 'warehouse', 'node', 'site']);

    if (descIdx === -1) {
        return res.status(400).json({ success: false, message: 'Could not find a description column in the uploaded file.' });
    }

    const dataRows = rows.slice(1).filter((r) => r[descIdx] && String(r[descIdx]).trim().length > 0);

    if (dataRows.length === 0) {
        return res.status(400).json({ success: false, message: 'No usable rows found under the description column.' });
    }

    // Pull the current master catalog once; every incoming row is scored against it.
    db.all('SELECT code, description, category FROM materials', [], (err, materialsRows) => {
        if (err) {
            console.error('Error loading materials for matching:', err.message);
            return res.status(500).json({ success: false, message: 'Internal server error.' });
        }

        const insertStmt = db.prepare(`
            INSERT INTO staging_inventory
                (raw_description, raw_category, raw_location, normalized_description,
                 suggested_description, status, similarity_score, matched_code,
                 confidence_score, uploaded_by, resolved)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `);

        let stagedCount = 0;
        for (const row of dataRows) {
            const rawDescription = String(row[descIdx]).trim();
            const rawCategory = catIdx !== -1 ? String(row[catIdx] || '').trim() : '';
            const rawLocation = locIdx !== -1 ? String(row[locIdx] || '').trim() : '';

            const { incomingTokens, incomingNormalized, best } = findBestMatch(rawDescription, materialsRows);
            const { status, matchedCode } = classifyMatch(best);
            const suggestedDescription = formatSuggestedDescription(incomingTokens);
            const confidencePct = best ? Math.round(best.confidence * 100) : 0;
            const similarity = best ? Number(best.jaccard.toFixed(4)) : 0;

            insertStmt.run([
                rawDescription,
                rawCategory,
                rawLocation,
                incomingNormalized,
                suggestedDescription,
                status,
                similarity,
                matchedCode,
                confidencePct,
                sessionState.currentUser.userid
            ]);
            stagedCount += 1;

            // Refresh the in-memory candidate pool so later rows in the same
            // file can also match against earlier rows in that same batch.
            materialsRows.push({ code: matchedCode || `PENDING-${stagedCount}`, description: rawDescription, category: rawCategory });
        }

        insertStmt.finalize(() => {
            return res.json({ success: true, staged: stagedCount, message: `${stagedCount} row(s) processed through the semantic pooling engine.` });
        });
    });
});

// GET /api/staging-queue — everything still awaiting a human decision
app.get('/api/staging-queue', (req, res) => {
    if (!requireAuth(req, res)) return;
    if (!requireReviewerRole(req, res)) return;

    db.all(
        'SELECT * FROM staging_inventory WHERE resolved = 0 ORDER BY confidence_score DESC, id DESC',
        [],
        (err, rows) => {
            if (err) {
                console.error('Error fetching staging queue:', err.message);
                return res.status(500).json({ success: false, message: 'Internal server error.' });
            }
            return res.json({ success: true, queue: rows });
        }
    );
});

// Shared helper: insert a resolved item into the production materials table
function commitToMaterials({ code, description, category, location, status, addedBy }, callback) {
    db.run(
        'INSERT INTO materials (code, description, category, location, status, added_by) VALUES (?, ?, ?, ?, ?, ?)',
        [code, description, category, location, status, addedBy],
        callback
    );
}

// POST /api/approve-match — accept a pooled or AI-suggested match (or a batch of them)
// Body: { staging_id } OR { staging_ids: [...] }
app.post('/api/approve-match', (req, res) => {
    if (!requireAuth(req, res)) return;
    if (!requireReviewerRole(req, res)) return;

    const ids = Array.isArray(req.body.staging_ids)
        ? req.body.staging_ids
        : (req.body.staging_id ? [req.body.staging_id] : []);

    if (ids.length === 0) {
        return res.status(400).json({ success: false, message: 'Provide staging_id or staging_ids.' });
    }

    const placeholders = ids.map(() => '?').join(',');
    db.all(`SELECT * FROM staging_inventory WHERE id IN (${placeholders}) AND resolved = 0`, ids, (err, items) => {
        if (err) {
            console.error('Error loading staging items:', err.message);
            return res.status(500).json({ success: false, message: 'Internal server error.' });
        }
        if (items.length === 0) {
            return res.status(404).json({ success: false, message: 'No matching unresolved staging items found.' });
        }

        let remaining = items.length;
        const results = [];

        items.forEach((item) => {
            const finalize = () => {
                remaining -= 1;
                if (remaining === 0) {
                    return res.json({ success: true, approved: results.length, results });
                }
            };

            if (item.matched_code) {
                // Pooled item — link it under the existing National Master Code
                commitToMaterials({
                    code: item.matched_code,
                    description: item.suggested_description || item.raw_description,
                    category: item.raw_category || 'Uncategorized',
                    location: item.raw_location || 'Unassigned Node',
                    status: 'Verified Standard (Pooled)',
                    addedBy: sessionState.currentUser.userid
                }, (insertErr) => {
                    if (insertErr) {
                        console.error('Error committing pooled match:', insertErr.message);
                        return finalize();
                    }
                    db.run(
                        'UPDATE staging_inventory SET status = ?, resolved = 1 WHERE id = ?',
                        ['Approved - Pooled', item.id],
                        () => {
                            results.push({ id: item.id, code: item.matched_code, action: 'pooled' });
                            finalize();
                        }
                    );
                });
            } else {
                // No suggested match on record — approving a "New Unique Item"
                // is equivalent to minting it a fresh master code.
                const newCode = `CPSE-MAT-${String(Math.floor(10000 + Math.random() * 90000))}`;
                commitToMaterials({
                    code: newCode,
                    description: item.suggested_description || item.raw_description,
                    category: item.raw_category || 'Uncategorized',
                    location: item.raw_location || 'Unassigned Node',
                    status: 'Verified Standard',
                    addedBy: sessionState.currentUser.userid
                }, (insertErr) => {
                    if (insertErr) {
                        console.error('Error committing new item:', insertErr.message);
                        return finalize();
                    }
                    db.run(
                        'UPDATE staging_inventory SET status = ?, matched_code = ?, resolved = 1 WHERE id = ?',
                        ['Approved - New Code', newCode, item.id],
                        () => {
                            results.push({ id: item.id, code: newCode, action: 'new_code' });
                            finalize();
                        }
                    );
                });
            }
        });
    });
});

// POST /api/reject-match — override the AI suggestion and mint a brand new
// National Master Code, optionally with a reviewer-edited description/category.
// Body: { staging_id, description?, category? }
app.post('/api/reject-match', (req, res) => {
    if (!requireAuth(req, res)) return;
    if (!requireReviewerRole(req, res)) return;

    const { staging_id, description, category } = req.body || {};
    if (!staging_id) {
        return res.status(400).json({ success: false, message: 'staging_id is required.' });
    }

    db.get('SELECT * FROM staging_inventory WHERE id = ? AND resolved = 0', [staging_id], (err, item) => {
        if (err) {
            console.error('Error loading staging item:', err.message);
            return res.status(500).json({ success: false, message: 'Internal server error.' });
        }
        if (!item) {
            return res.status(404).json({ success: false, message: 'Staging item not found or already resolved.' });
        }

        const newCode = `CPSE-MAT-${String(Math.floor(10000 + Math.random() * 90000))}`;
        const finalDescription = (description && description.trim()) || item.suggested_description || item.raw_description;
        const finalCategory = (category && category.trim()) || item.raw_category || 'Uncategorized';

        commitToMaterials({
            code: newCode,
            description: finalDescription,
            category: finalCategory,
            location: item.raw_location || 'Unassigned Node',
            status: 'Verified Standard',
            addedBy: sessionState.currentUser.userid
        }, (insertErr) => {
            if (insertErr) {
                console.error('Error committing overridden item:', insertErr.message);
                return res.status(500).json({ success: false, message: 'Internal server error.' });
            }

            db.run(
                'UPDATE staging_inventory SET status = ?, matched_code = ?, resolved = 1 WHERE id = ?',
                ['Rejected/New Code Created', newCode, staging_id],
                (updateErr) => {
                    if (updateErr) {
                        console.error('Error updating staging item:', updateErr.message);
                        return res.status(500).json({ success: false, message: 'Internal server error.' });
                    }
                    return res.json({ success: true, code: newCode, message: `New National Master Code ${newCode} created.` });
                }
            );
        });
    });
});

// ----------------------------------------------------------------------------
// 5. Start server
// ----------------------------------------------------------------------------

app.listen(PORT, () => {
    console.log(`CPSE Material Harmonizer server running at http://localhost:${PORT}`);
});

/*
------------------------------------------------------------
Copyright © 2026 Sree. All Rights Reserved.
Original Project: CPSE-Material-Harmonizer
SIH Problem Statement: SIH26099
Developed by: sreechakri-dev

Private use permitted. Redistribution and public publication
require prior written permission.
See LICENSE.md for complete terms.
------------------------------------------------------------
*/
