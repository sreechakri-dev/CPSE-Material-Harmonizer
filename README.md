[README.md](https://github.com/user-attachments/files/32689512/README.md)
# AI-Driven Standardization and Harmonization of Material Codes Across CPSEs

## PS ID: SIH26099

An enterprise-grade, AI-powered catalog harmonization and material deduplication platform engineered to eradicate fragmented procurement data, duplicated material codes, and bloated inventory across Central Public Sector Enterprises (CPSEs).

---

## Table of Contents

- [Core Architecture](#-core-architecture)
- [Directory Structure](#-directory-structure)
- [Data Harmonization Pipeline](#-data-harmonization-pipeline)
- [Harmonization Telemetry](#-harmonization-telemetry--matching-log)
- [System Specifications](#-system-specifications)
- [Getting Started](#-getting-started)
- [Controls & Usage](#-controls--interface-usage)
- [Key Capabilities](#-key-capabilities)
- [Technology Stack](#-technology-stack)
- [Project Objective](#-project-objective)
- [License](#-license)

---

## 🏛️ Core Architecture

The system decouples **text normalization**, **semantic embedding**, and **explainable cross-matching** to resolve naming discrepancies across siloed procurement databases.

### Text Normalization Engine — `normalizer.py`

Executes:

- Regex-based token cleaning
- Standard unit conversion
- Abbreviation expansion
- Noise filtering
- Attribute extraction
- Description standardization

### Semantic Embedding & Vector Search — `embedder.py`

Leverages fine-tuned transformer models to map industrial material attributes into dense vector spaces for rapid similarity lookups.

Key capabilities include:

- Dense semantic embeddings
- 768-dimensional vectors
- FAISS-based similarity search
- HNSW indexing support
- Fast candidate retrieval

### Cross-Encoder Reranker — `matcher.py`

Applies deep cross-attention layers to score candidate matches and identify functionally equivalent material codes across disparate databases.

The matcher combines:

- Semantic similarity
- Material attributes
- Dimensional specifications
- Grade and material information
- Functional equivalence

### Explainability Module — `explainer.py`

Deconstructs the AI decision process by highlighting matching attributes and confidence contribution scores.

The module helps users understand:

- Which attributes matched
- Which attributes differed
- Why two materials were considered equivalent
- Confidence associated with the match

### Unified Dashboard UI — `app.py` & `dashboard/`

Coordinates:

- Catalog upload workflows
- Harmonization analytics
- Material matching inspection
- Deduplication statistics
- Collaborative demand-pooling insights
- Master catalog export

---

## 📁 Directory Structure

```text
SIH26099/
├── backend/
│   ├── src/
│   │   ├── main.py            # FastAPI Application Server & API Gateway
│   │   ├── normalizer.py      # Text Cleaning & Standardization Engine
│   │   ├── embedder.py        # Dense Vector Generation & FAISS Indexing
│   │   ├── matcher.py         # Cross-Encoder Reranking & Similarity Core
│   │   ├── explainer.py       # Explainable AI Attribute Match Breakdown
│   │   └── database.py        # PostgreSQL / MongoDB Connection Handlers
│   │
│   └── models/
│       └── sbert_material.onnx # Quantized Semantic Matcher Weights
│
├── frontend/
│   ├── src/
│   │   ├── components/        # Reusable UI Blocks & Data Tables
│   │   ├── pages/             # Harmonization & Analytics Views
│   │   └── App.jsx            # Root Application Layout
│   │
│   └── package.json            # Frontend Dependencies
│
├── datasets/
│   └── sample_catalog.csv      # Sample Unstructured Procurement Records
│
├── docs/
│   ├── architecture.md         # Deep-Dive System Design Documentation
│   └── taxonomy.md             # Universal Material Classification Standard
│
├── requirements.txt            # Python Pipeline Dependencies
└── README.md                   # Project Overview
```

---

## 🔄 Data Harmonization Pipeline

```text
Raw Procurement Data
        │
        ▼
┌───────────────────────┐
│  Input Catalog Upload │
│   CSV / Excel / JSON  │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────────┐
│  Text Normalization       │
│  • Cleaning               │
│  • Unit Conversion        │
│  • Abbreviation Expansion │
│  • Attribute Extraction   │
└────────────┬──────────────┘
             │
             ▼
┌───────────────────────────┐
│ Semantic Embedding        │
│ 768-D Dense Vectors       │
└────────────┬──────────────┘
             │
             ▼
┌───────────────────────────┐
│ Vector Candidate Search   │
│ FAISS / HNSW              │
└────────────┬──────────────┘
             │
             ▼
┌───────────────────────────┐
│ Cross-Encoder Reranking   │
│ Semantic + Attribute Match│
└────────────┬──────────────┘
             │
             ▼
┌───────────────────────────┐
│ Explainable Match Engine  │
│ Confidence + Attributes   │
└────────────┬──────────────┘
             │
             ▼
┌───────────────────────────┐
│ Unified Material Master   │
│ Deduplicated Catalog      │
└───────────────────────────┘
```

---

## 📊 Harmonization Telemetry & Matching Log

| Request ID | Raw Input String | Standardized Catalog Match | Confidence Score (%) | Semantic Vector Latency (ms) | Cross-Encoder Rerank (ms) | Status |
|---|---|---|---:|---:|---:|---|
| REQ-9011 | `SS 304 Seamless Pipe 2inch Sch40` | `PIPE, STAINLESS STEEL, 304, 2 IN, SCH 40` | 98.4% | 12.4 | 18.2 | Harmonized |
| REQ-9012 | `H.T. Bolt M16x50 Grade 8.8 Galvanized` | `BOLT, HEX HEAD, M16 X 50, GR 8.8, HDG` | 97.1% | 11.9 | 17.5 | Harmonized |
| REQ-9013 | `Gate Valve CI 150# Flanged 4 inch` | `VALVE, GATE, CAST IRON, 150 LB, FLG, 4 IN` | 95.8% | 13.1 | 19.4 | Harmonized |
| REQ-9014 | `Gasket Spiral Wound 300# 6in RF` | `GASKET, SPIRAL WOUND, 300 LB, 6 IN, RF` | 96.5% | 12.0 | 16.8 | Harmonized |
| REQ-9015 | `Copper Cable 3C x 400 sq mm armored` | `CABLE, POWER, 3-CORE, 400 SQ MM, CU, ARMOURED` | 99.2% | 10.8 | 15.1 | Harmonized |

---

![Architecture Diagram](<img width="1917" height="1078" alt="Screenshot 2026-09-27 024227" src="https://github.com/user-attachments/assets/70a84c41-1714-4adf-8760-431ec63b351e" />
)



## ⚙️ System Specifications

| Parameter | Value |
|---|---|
| Target Throughput | 5,000 records/sec |
| Embedding Dimension | 768-d dense vectors |
| Indexing Structure | FAISS Flat / HNSW Index |
| Accuracy Threshold | ≥ 95% match precision |
| API Framework | FastAPI + Uvicorn Async |
| Frontend Stack | React, Vite, Tailwind CSS, Recharts |
| Database Backend | PostgreSQL with pgvector |

---

## 🚀 Getting Started

### Prerequisites

Ensure the following software is installed:

- Python 3.10+
- Node.js 18+
- PostgreSQL
- PostgreSQL `pgvector` extension

### Installation

#### 1. Clone the Repository

```bash
git clone <repository-url>
cd SIH26099
```

#### 2. Install Backend Dependencies

```bash
pip install -r requirements.txt
```

#### 3. Install Frontend Dependencies

```bash
cd frontend
npm install
```

---

## ▶️ Running the Application

### Start the FastAPI Backend

From the project root:

```bash
cd backend/src
uvicorn main:app --reload --port 8000
```

Backend API:

```text
http://localhost:8000
```

### Start the React Frontend

Open another terminal:

```bash
cd frontend
npm run dev
```

---

## 🎮 Controls & Interface Usage

### `Upload Catalog`

Drag and drop messy procurement spreadsheets or structured files into the normalization portal.

Supported input formats:

- CSV
- Excel
- JSON

Uploaded records are passed through the normalization and harmonization pipeline.

### `Inspect Match`

Click any harmonized record to open the explainability interface.

The interface displays:

- Original material description
- Standardized material description
- Matching attributes
- Attribute-level contribution
- Semantic similarity
- Cross-encoder confidence
- Final harmonization decision

### `Export Master`

Download the resulting deduplicated **National Unified Material Master** catalog in structured formats such as:

- CSV
- JSON

---

## 🎯 Key Capabilities

- AI-powered material deduplication
- Cross-enterprise catalog harmonization
- Semantic similarity matching
- Attribute-aware material matching
- Vector-based candidate retrieval
- Cross-encoder reranking
- Explainable AI decisions
- Standardized material taxonomy
- High-throughput processing
- Centralized unified material master
- Procurement data analytics
- Demand-pooling support
- Structured catalog export

---

## 🏗️ Technology Stack

| Layer | Technology |
|---|---|
| Backend | Python, FastAPI, Uvicorn |
| AI / NLP | Transformer / SBERT-based Models |
| Vector Search | FAISS / HNSW |
| Model Runtime | ONNX Runtime |
| Database | PostgreSQL + pgvector |
| Frontend | React + Vite |
| Styling | Tailwind CSS |
| Visualization | Recharts |
| Data Processing | Pandas |
| API Architecture | REST |

---

## 📌 Project Objective

The **National Unified Material Master (NUMM)** framework aims to create a standardized, AI-assisted material intelligence layer capable of harmonizing fragmented procurement catalogs across organizations.

By identifying semantically and functionally equivalent materials despite differences in naming conventions, abbreviations, units, and descriptions, the platform can support:

- Material master standardization
- Duplicate-code identification
- Inventory rationalization
- Cross-organization catalog interoperability
- Procurement consolidation
- Demand aggregation
- Data-driven procurement analytics

---

