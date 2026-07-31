# Chopper — Personal Food & Allergy Tracker on Zoho Catalyst

Chopper is a single-user personal health web app built to help identify food and environmental triggers for skin allergies. You log everything you consume/encounter with exact timestamps, log reactions when they occur (severity, symptoms, resolution method), and Chopper provides a bird's-eye git-style calendar view and trigger detection to spot allergy patterns.

---

## UI Design Previews

### Dashboard — Calendar Heatmap + Today's Log + Flagged Foods
![Dashboard](/Users/hariharand/.gemini/antigravity-ide/brain/de2de886-8ff1-401c-af20-a29f036c5f1b/allergylog_dashboard_1785429318093.png)

### Log Entry Modal (Food/Drink or Other triggers)
![Log Entry Modal](/Users/hariharand/.gemini/antigravity-ide/brain/de2de886-8ff1-401c-af20-a29f036c5f1b/allergylog_log_food_modal_1785429346595.png)

### Log Reaction Modal (Severity + Symptoms + Resolution)
![Log Reaction Modal](/Users/hariharand/.gemini/antigravity-ide/brain/de2de886-8ff1-401c-af20-a29f036c5f1b/allergylog_reaction_modal_1785429355996.png)

### Day Drill-Down View (Timeline + Pattern Analysis Insights)
![Day Drill-down](/Users/hariharand/.gemini/antigravity-ide/brain/de2de886-8ff1-401c-af20-a29f036c5f1b/allergylog_day_drill_down_1785429381610.png)

---

## Technical Stack & Choices

| Component | Choice / Specification |
|-----------|------------------------|
| **App Name** | **Chopper** |
| **Catalyst Organization** | `Hariharan` (Org ID: `60036478430`) |
| **Catalyst Project** | **New Catalyst Project** (to be initialized) |
| **Backend Compute** | **Catalyst Java Advanced I/O Function** (Java 21/17) |
| **Database** | **Catalyst Data Store** (ZCQL relational tables) |
| **Frontend Hosting** | **Catalyst Slate** (React 18 + Vite SPA) |
| **Styling** | Vanilla CSS (Dark theme, glassmorphism design system) |

---

## Data Store Schema (Relational Database)

#### Table: `LogEntries`
| Column | Type | Notes |
|--------|------|-------|
| ROWID | Auto | Primary Key |
| UserId | Text | Catalyst User ID |
| EntryType | Text | `food` or `other` (e.g. detergent, pollen) |
| ItemName | Text | e.g. "Peanut butter toast", "Detergent X" |
| LoggedAt | DateTime | Exact time item was consumed/encountered |
| Notes | Text | Optional preparation or brand details |
| CREATEDTIME | Auto | System record creation timestamp |

#### Table: `Reactions`
| Column | Type | Notes |
|--------|------|-------|
| ROWID | Auto | Primary Key |
| UserId | Text | Catalyst User ID |
| SymptomStartTime | DateTime | Time symptoms began |
| SeverityLevel | Integer | 1 (mild) to 5 (severe) |
| Symptoms | Text | JSON string: `["Skin rash","Itching"]` |
| Resolution | Text | `antihistamine` (took tablet) or `auto` (auto-resolved) |
| ResolvedInMinutes | Integer | Duration before resolving (null if ongoing/antihistamine) |
| Notes | Text | Additional observations |

#### Table: `ConfirmedTriggers`
| Column | Type | Notes |
|--------|------|-------|
| ROWID | Auto | Primary Key |
| UserId | Text | Catalyst User ID |
| ItemName | Text | Verified allergen item |
| ConfirmedAt | DateTime | Timestamp when confirmed |

---

## Backend Architecture — Java Advanced I/O Function (`chopper_api`)

The Java function implements a RESTful servlet routing pattern handling all endpoints:

| Route | Verb | Description |
|-------|------|-------------|
| `/server/chopper_api/execute/entries` | `GET` | Retrieve food/item log entries for date range |
| `/server/chopper_api/execute/entries` | `POST` | Create a new log entry |
| `/server/chopper_api/execute/entries/{id}` | `DELETE` | Delete a log entry |
| `/server/chopper_api/execute/reactions` | `GET` | Retrieve reactions list |
| `/server/chopper_api/execute/reactions` | `POST` | Create a reaction event |
| `/server/chopper_api/execute/reactions/{id}` | `DELETE` | Delete a reaction event |
| `/server/chopper_api/execute/dashboard` | `GET` | Aggregated payload for heatmap + flagged items |
| `/server/chopper_api/execute/triggers` | `GET` / `POST` | Fetch/Mark confirmed allergy triggers |

---

## Frontend Architecture — Catalyst Slate (React + Vite)

### App Views & Navigation
1. **Dashboard (`/`)**
   - **6-Month Git Calendar Heatmap Grid**:
     - 🟩 Deep Green = No allergy logged that day
     - 🟧 Yellow-Orange = Mild reaction (auto-resolved)
     - 🟥 Coral Red = Severe reaction (required tablet/antihistamine)
     - ⬛ Slate Gray = No logs/data recorded
   - **Today's Timeline Sidebar**: Chronological stream of today's food & reactions
   - **Flagged Foods Strip**: Bottom bar highlighting foods co-occurring with allergy days

2. **Day Drill-Down (`/day/:date`)**
   - Chronological timeline of everything consumed + reaction events for that date
   - **Pattern Analysis Card**: Calculates overlap percentage between items eaten and allergy days

3. **Log Entry & Log Reaction Modals**
   - Interactive modals for logging items with time pickers and severity sliders

---

## Phase Execution Plan

### Phase 1: Project Setup & Database Provisioning
1. Initialize new Catalyst Project for Chopper in CLI / MCP
2. Create Data Store tables (`LogEntries`, `Reactions`, `ConfirmedTriggers`) via MCP
3. Configure Table Scopes & Permissions for App Users

### Phase 2: Java Backend Function Development
1. Create Java 21/17 Advanced I/O function `chopper_api`
2. Implement ZCQL data access methods & JSON serializers
3. Build endpoint routes & test locally

### Phase 3: Frontend Slate Web App Development
1. Create Slate app scaffold using React + Vite
2. Implement modern dark UI design system matching mockups
3. Build Git-style calendar heatmap, today sidebar, modals & day drill-down
4. Integrate frontend with Java backend endpoints

### Phase 4: Verification & Deployment
1. Deploy Java API function (`catalyst deploy --only functions`)
2. Deploy React Slate frontend (`catalyst deploy --only slate`)
3. Validate full flow: log entries → log reactions → heatmap visual update → trigger analysis

---

## Verification Plan

### Backend Verification
- Execute ZCQL queries and HTTP endpoints via local function testing (`catalyst serve`)
- Confirm JSON structure and HTTP status codes (200 OK, 201 Created)

### Frontend & End-to-End Verification
- Test entry creation with custom timestamp and verify persistence in Data Store
- Test reaction logging with severity level 1-5 and resolution method
- Confirm calendar heatmap accurately colors days based on maximum severity
- Confirm flagged items calculate correctly based on reaction co-occurrence
