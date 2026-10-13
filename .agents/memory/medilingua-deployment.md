---
name: MediLingua deployment constraints
description: Durable product context for changes to the live MediLingua healthcare assistant and WhatsApp agent.
---

MediLingua Health AI is live, and its WhatsApp Business agent has worked previously. Treat the existing application and Meta configuration as a working baseline; diagnose channel failures before replacing providers, models, or product components.

**Why:** Broad changes to a live healthcare assistant can regress safety behavior and established messaging configuration.

**How to apply:** Prefer narrow backend changes, preserve the seven languages and emergency guidance, and do not republish without explicit user approval.
