---
name: WhatsApp delivery certainty
description: Decision guidance for duplicate suppression and ambiguous WhatsApp Cloud API send outcomes.
---

Treat WhatsApp outbound outcomes according to certainty. A successful Graph acceptance should suppress duplicate replies for a finite period. Configuration errors and explicit client rejections can be retried within a bounded attempt limit. Timeouts, network failures, malformed responses, and server errors are ambiguous; do not retry them immediately because Meta may already have accepted the message. Keep ambiguous suppression finite and state the remaining duplicate-versus-lost-reply tradeoff.

**Why:** If the Graph response is lost, the application cannot know whether a reply was accepted. Immediate retry can create duplicate health replies, while indefinite suppression can leave the user without one.

**How to apply:** Preserve differentiated handling when changing WhatsApp retries or deduplication. The process-local state does not coordinate across restarts or multiple server instances, so durable idempotency remains separate work.
