# Project Architecture

- Manual quiz imports are parsed and validated in the browser without AI calls, then saved through the existing deck workflow; share the 20-card partition helper with automatic generation to keep both paths consistent.

- Administrative access is stored in `user_roles` and enforced by authenticated server functions before privileged reads, preventing client-side role spoofing.
- All AI calls go through `callChat` in `src/lib/ai.functions.ts`: it uses the owner's own Google Gemini key (`GOOGLE_API_KEY` secret) through a chain of Gemini models that skips busy, slow or over-quota models and falls back to the Lovable AI gateway only when that secret is unset — so AI usage bills to the owner's Google account, not workspace credits. New AI features must reuse `callChat`, never call a provider directly.