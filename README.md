# 🌿 Chopper — Personal Food & Allergy Tracker

**Chopper** is a full-stack personal food intake and allergy symptom tracking application built on **Zoho Catalyst Cloud**. It empowers individuals with skin allergies or dietary sensitivities to log daily meals, track allergic reaction occurrences with severity metrics, and automatically isolate suspected food triggers through co-occurrence pattern analysis.

![Chopper Dashboard](https://chopperfrontend-ywojfbbr.onslate.in)

---

## ✨ Features

- 🟩 **Git-Style 6-Month Heatmap Calendar**: Visual bird's-eye view of your daily health status (Safe Days = Green, Mild Reactions = Yellow, Severe Reactions = Red).
- 🍽️ **Meal & Environmental Intake Logging**: Fast logging of meals, beverages, skin products, or environmental exposure with precise timestamps and custom notes.
- 🚨 **Allergy Reaction Tracking**: Capture symptom onset times, severity ratings (1 to 5 scale), detailed symptom checklists (hives, itching, swelling), and resolution methods (took antihistamine vs. auto-resolved).
- 🔥 **Automated Pattern Analysis & Co-Occurrence Engine**: Automatically cross-references allergy reaction days against food items consumed prior to symptom onset to flag high-risk suspected triggers.
- 🔒 **Native Zoho Authentication**: Enterprise-grade single sign-on backed by Catalyst Native Authentication and DataStore ZCQL query isolation.

---

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 18, Vite, Custom Glassmorphic Dark-Mode CSS |
| **Hosting** | Zoho Catalyst Slate (`chopperfrontend`) |
| **Backend API** | Java 21 Advanced I/O Servlet (`chopper_api`) |
| **Database** | Zoho Catalyst Data Store (ZCQL Relational DataStore) |
| **Authentication**| Zoho Catalyst Native Hosted Authentication |
| **Deployment** | Zoho Catalyst CLI |

---

## 📁 Repository Structure

```
chopper/
├── catalyst.json                   # Catalyst project manifest configuration
├── README.md                       # Project documentation
├── .gitignore                      # Git ignore rules
├── functions/
│   └── chopper_api/                # Java 21 Serverless Advanced I/O Backend API
│       ├── Sample.java             # Main REST Servlet controller (/dashboard, /entries, /reactions, /triggers)
│       └── catalyst-config.json    # Function configuration & Security Rules
└── chopperfrontend/                # React 18 Single Page Application (Slate)
    ├── index.html                  # HTML entry point with Catalyst Web SDK script
    ├── src/
    │   ├── App.jsx                 # Main Dashboard, Heatmap, Timeline & Auth Guard
    │   ├── api.js                  # Fetch client communicating with chopper_api
    │   └── index.css               # Glassmorphic CSS design system
    └── package.json                # Frontend package dependencies & build scripts
```

---

## 🚀 Live Application

- **Live URL**: [https://chopperfrontend-ywojfbbr.onslate.in](https://chopperfrontend-ywojfbbr.onslate.in)
- **API Endpoint**: `https://chopper-60036478430.development.catalystserverless.in/server/chopper_api/execute`

---

## ⚙️ Local Development & Deployment

### Prerequisites
- Node.js 18+
- JDK 21
- Zoho Catalyst CLI (`npm install -g zcatalyst-cli`)

### Building & Deploying

1. **Build Frontend Bundle**:
   ```bash
   cd chopperfrontend
   npm install
   npm run build
   ```

2. **Deploy to Catalyst Cloud**:
   ```bash
   # Deploy Backend Java API Function
   catalyst deploy --only functions

   # Deploy Frontend Slate App
   catalyst deploy --only slate
   ```

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
