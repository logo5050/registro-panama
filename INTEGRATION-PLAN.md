# Registro Panama × GEO Glass Integration Plan

## The Big Picture

Registro Panama is a **data layer** that feeds GEO Glass. When a business gets audited by GEO Glass, the audit engine can now check: "Does this business appear in ACODECO sanctions? In court rulings? In the news?" That context makes GEO Glass audits richer, more accurate, and harder for competitors to replicate.

---

## 1. How ACODECO Data Affects GEO Glass Scores

### New Radar Metric: "Reputación Digital" (Digital Reputation)

Add a 7th radar metric to `src/lib/audit/radar-metrics.ts`:

- **What it measures:** Whether AI engines associate the business with negative regulatory events (sanctions, fines, complaints)
- **Data source:** Query `GET /api/businesses?q={businessName}` from Registro Panama during audit
- **Scoring logic:**
  - Business NOT found in Registro Panama → Neutral (no impact)
  - Business found with `news_mention` events only → Slight positive (business is known/visible)
  - Business found with `acodeco_infraction` events → Negative flag (AI engines may surface this when users ask about the business)
  - Business found with `court_ruling` → Stronger negative flag

### Impact on Existing Dimensions

In `src/lib/audit/engine.ts`, during the audit of a business:

```
Discovery (60%) — No change
Accuracy (20%) — ADD: If AI engines mention ACODECO sanctions when asked about the business,
                  accuracy score adjusts (the AI is accurately reporting public record)
Technical (20%) — No change
```

### New Task in Task Registry

Add to `src/lib/audit/task-registry.ts`:

```
{
  id: 'monitor-regulatory-mentions',
  title_es: 'Monitorear menciones regulatorias',
  title_en: 'Monitor regulatory mentions',
  points: 5,
  dimension: 'accuracy',
  description: 'Check if AI engines surface ACODECO sanctions or regulatory issues about your business',
  autoDetectable: true  // Auto-detected by querying Registro Panama API
}
```

---

## 2. Technical Integration (API Calls)

### During GEO Glass Audit (engine.ts)

```typescript
// In the audit engine, after querying AI engines:
const registroResponse = await fetch(
  `https://registro-panama.vercel.app/api/businesses?q=${encodeURIComponent(businessName)}&status=verified`
);
const registroData = await registroResponse.json();

// Check for regulatory events
const hasAcodecoSanctions = registroData.some(b =>
  b.events?.some(e => e.event_type === 'acodeco_infraction')
);
const hasCourtRulings = registroData.some(b =>
  b.events?.some(e => e.event_type === 'court_ruling')
);
const hasNewsPresence = registroData.some(b =>
  b.events?.some(e => e.event_type === 'news_mention')
);
```

### New API Endpoint on Registro Panama

Add `GET /api/businesses/check?name={exact_name}` — a lightweight endpoint GEO Glass calls during audits:

```json
{
  "found": true,
  "slug": "farmacia-el-sol",
  "event_counts": {
    "acodeco_infraction": 2,
    "news_mention": 1,
    "court_ruling": 0,
    "sanction": 0
  },
  "latest_event": "2026-03-15",
  "profile_url": "https://registro-panama.vercel.app/registro/farmacia-el-sol"
}
```

---

## 3. GEO Glass Dashboard Features This Enables

### A. "Regulatory Alert" Badge on Overview Page

On the GEO Glass dashboard overview, show a warning badge if the business has ACODECO sanctions:

```
⚠️ ACODECO encontró 2 infracciones para tu negocio.
   Los motores de IA pueden mostrar esta información a tus clientes potenciales.
   [Ver detalles en Registro Panamá →]
```

**Why this matters to the customer:** If ChatGPT tells a potential customer "this business has been sanctioned by ACODECO," that's a visibility problem. GEO Glass can help them manage it.

### B. "Reputation Shield" Upsell (Observatory Page)

On the Observatory/Strategy page, add a scenario:

```
Escenario: Protección de Reputación
- Tu negocio aparece en registros de ACODECO
- Cuando alguien pregunta a ChatGPT sobre tu negocio,
  puede ver estas sanciones
- Acción recomendada: Crear contenido positivo que
  supere las menciones negativas en resultados de IA
```

### C. Competitor Intelligence (Arena Page)

In the Arena, when comparing competitors:
- Show which competitors have ACODECO sanctions
- "Tu competidor [X] tiene 3 sanciones de ACODECO — esto es una ventaja competitiva para ti"

---

## 4. New GEO Glass Product Offerings

### Tier 1: Free (Current)
- Basic AI visibility audit
- Shows if your business appears in AI search

### Tier 2: Pro ($29/mo)
- Everything in Free
- **Regulatory monitoring** — alerts when your business appears in ACODECO, court rulings
- **Reputation score** — how AI engines perceive your business reputation
- Weekly monitoring of new regulatory filings

### Tier 3: Enterprise ($99/mo)
- Everything in Pro
- **Competitor regulatory monitoring** — track competitors' ACODECO/legal issues
- **Reputation management playbook** — AI-generated action plan to address negative mentions
- **API access** to Registro Panama data for internal compliance

---

## 5. The Stamp of Approval / Trust Badge

### Concept: "Verificado por Registro Panamá"

A trust badge businesses can display on their website:

```
✅ Verificado por Registro Panamá
   Sin infracciones de ACODECO | Actualizado: Marzo 2026
```

**How it works:**
1. Business signs up on GEO Glass
2. GEO Glass checks Registro Panama for sanctions
3. If clean record → business gets a verification badge (embeddable HTML snippet)
4. Badge links back to their Registro Panama profile page
5. AI crawlers see the structured data on the profile → reinforces positive reputation

**Monetization:**
- Free: Static badge, updated monthly
- Pro: Real-time badge with live status, priority re-verification
- The badge itself is a backlink that improves their SEO AND AI visibility

### Technical Implementation

Add to Registro Panama:
```
GET /api/badge/{slug} → Returns SVG/HTML badge with current status
GET /api/verify/{slug} → Returns JSON verification status for embedding
```

Add Schema.org to badge:
```json
{
  "@type": "Organization",
  "hasCredential": {
    "@type": "EducationalOccupationalCredential",
    "credentialCategory": "regulatory-compliance",
    "recognizedBy": {
      "@type": "Organization",
      "name": "Registro Panamá"
    }
  }
}
```

---

## 6. Data Moat Strategy

### What makes this defensible:

1. **ACODECO PDF extraction** — You cracked the scanned PDF problem. Competitors would need to replicate your Claude Vision pipeline.
2. **Historical depth** — You have data going back to Oct 2024. New entrants start from zero.
3. **Schema.org structured data** — AI engines already index your pages. First-mover advantage.
4. **Cross-platform network effect** — GEO Glass drives businesses to Registro Panama → more profile data → better AI indexing → GEO Glass audits become more valuable → more signups.

### Weekly data growth:
- ~10-15 new ACODECO edictos/week (auto-scraped, ~$0.05/week in API costs)
- ~20-30 news articles/week
- Court rulings as available

---

## 7. Implementation Priority (Recommended Order)

### Phase 1: Foundation (This Week)
- [x] ACODECO PDF extraction working ✅
- [ ] Run news backfill (`node backfill-news.mjs`)
- [ ] Commit all scraper changes + push to GitHub
- [ ] Add ANTHROPIC_API_KEY to GitHub repo secrets
- [ ] Verify weekly GitHub Actions run successfully

### Phase 2: Integration API (Week 2)
- [ ] Build `GET /api/businesses/check?name=X` endpoint on Registro Panama
- [ ] Add Registro Panama query to GEO Glass audit engine
- [ ] Add "Reputación Digital" radar metric to GEO Glass
- [ ] Add regulatory monitoring task to task-registry.ts

### Phase 3: Dashboard Features (Week 3)
- [ ] Add regulatory alert badge to GEO Glass Overview page
- [ ] Add reputation scenario to Observatory page
- [ ] Add competitor regulatory data to Arena page
- [ ] Show Registro Panama link on business profiles

### Phase 4: Monetization (Week 4)
- [ ] Build verification badge system
- [ ] Create badge embed endpoint on Registro Panama
- [ ] Add "Regulatory Monitoring" to GEO Glass Pro tier
- [ ] Launch trust badge for clean businesses

### Phase 5: Scale (Month 2+)
- [ ] Add more data sources (Contraloría, Registro Público, ASEP)
- [ ] Build judiciary scraper with Claude Vision for court PDFs
- [ ] Expand to other LATAM countries (start with Costa Rica, Colombia)
- [ ] API partnerships with compliance/legal firms
