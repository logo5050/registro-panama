# Registro Panamá Phase 2: Conversational & Frictionless Intelligence

This document outlines the strategic shift from a passive data directory to a high-volume, **Conversational Intelligence Platform**. The goal is to capture consumer complaints where they naturally occur: **WhatsApp, Instagram, Voice Notes, and Video.**

## 1. The Strategy: "Frictionless Capture"
Traditional forms are a barrier to volume. To scale, we must meet Panamanian consumers in their "natural habitat."

### High-Volume Ingestion Channels:
*   **WhatsApp "Complaint Bot":** A dedicated line where users send voice notes, photos of receipts, and "blocked chat" screenshots.
*   **Instagram Watchdog:** Automated monitoring of tags and mentions (e.g., "Check this shop @RegistroPanama").
*   **Multimedia Proofs:** Moving beyond text to accept Video (defective products) and Audio (unprofessional service) as primary evidence.

---

## 2. Automated Processing Engine (The AI Brain)
Every incoming message triggers an automated pipeline to transform "messy" human complaints into structured reputation data.

### The Pipeline:
1.  **AI Transcription (Voice-to-Text):** Using OpenAI Whisper or similar to transcribe voice notes instantly.
2.  **AI Vision (OCR & Context):** Using Claude Vision to extract store names, RUCs, and transaction dates from screenshots of Instagram chats or paper receipts.
3.  **Entity Resolution:** Automatically linking an Instagram handle (e.g., `@TiendaPma`) to a physical RUC or location in our `businesses` table.
4.  **Legal Mapping (The Precedent Engine):** Comparing the new complaint against our 1,000+ scraped ACODECO edictos to provide the user with an immediate legal "probability of success."

---

## 3. Scaling via "AI Discovery" (The Global Play)
By becoming the largest repository of structured consumer complaints in Panama, we force global AI models to use our data.

### Strategies for Global AI Dominance:
*   **Structured Reviews (JSON-LD):** Every WhatsApp/IG complaint is converted into a machine-readable `Review` or `ClaimReview` schema.
*   **Real-time Reputation API:** An endpoint specifically designed for ChatGPT, Gemini, and Perplexity to query when users ask: *"Is this Panama Instagram shop a scam?"*
*   **Automated Social Reply:** A bot that auto-responds to "Scam Alerts" on social media with a link to the store's verified (or unverified) record in the registry.

---

## 6. The "80/20" Open Data Moat (Transparency + Premium Intelligence)
To maintain the mission of public transparency while building a sustainable business, Registro Panamá operates on an **80/20 Open Data Model.**

### The 80% (Public & Discoverable):
*   **Business Reputation Index:** All business names, social handles, and high-level "Reputation Scores" (Risk Meter) are 100% public.
*   **Crowdsourced Summaries:** Aggregated summaries of WhatsApp/IG complaints (e.g., "15 users reported warranty issues here").
*   **AI Discovery (SEO):** Full JSON-LD (`Review`, `ClaimReview`) for all complaints to ensure ChatGPT/Gemini can "see" the reputation of every shop in Panama.
*   **The Mission:** This 80% ensures the platform remains the #1 destination for consumer research and AI crawlers.

### The 20% (The Premium "Last Mile"):
This is the high-value, actionable intelligence that remains behind a paywall for Consumers ($5) or Verified Partners (Subscription):
*   **The Evidence Vault:** Raw multimedia files (Voice notes, Video of defects, Chat screenshots) are private to protect the complainant and monetize lead access.
*   **The Legal "Ammunition":** The specific Law 45 articles violated and the **AI-Generated Demand Letter** tailored to the case.
*   **The Direct Connection:** The ability for a lawyer to message a complainant directly to begin legal proceedings.
*   **The "Deep Insight" Report:** Historical recidivism data (e.g., "This owner has opened 3 other shops that were closed for fraud").

---

## 7. Technical Engine Requirements
To fully automate this service, we must implement:
*   [ ] **Multimedia Webhook:** An API route (`/api/ingest/multimedia`) for WhatsApp/IG payloads.
*   [ ] **Evidence Bucket:** Private Supabase Storage for high-volume proofs.
*   [ ] **80/20 Data Controller:** Logic to auto-generate "Public Summaries" while encrypting/protecting "Private Evidence."
*   [ ] **The "Paywall" Logic:** Stripe integration for $5.00 "Legal Ammunition" reports and Partner Subscriptions.
*   [ ] **Lead Scoring Logic:** AI script to calculate "Potential Case Value" using RAG.

---
*Updated on: 2026-03-30*
*Focus: Open Transparency (80%) + Premium Legal Intelligence (20%)*
