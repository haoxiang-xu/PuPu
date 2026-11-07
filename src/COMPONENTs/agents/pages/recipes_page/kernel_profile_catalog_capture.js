/* What the Kernel profile route actually answers, over the real transport.
 *
 * Captured 2026-10-13 from `GET /skeleton_kernel_profiles` on the fixed
 * installation pair — `unchain==0.2.0`, wheel SHA-256
 * df33867b3737569fa4a5272b6fdd735fa76a6ec92343517d06e278b9c537c178 — through
 * the real Flask app's test client, so what is below crossed JSON exactly as
 * it does in the product.
 *
 * It is here for the one check neither side can make alone: the producer
 * admits each profile with the runtime's own `validate_kernel_config`, and the
 * editor admits it with its mirror. Both passing on hand-written profiles
 * proves nothing about the pair — a shared assumption would simply be shared.
 * These are the producer's own bytes.
 *
 * Nineteen profiles and twelve refusals is what this wheel yields. The twelve
 * are every chat model whose capability file declares no `max_output_tokens`,
 * which includes most of the OpenAI family: a reply reservation has to be
 * bounded by a declared cap, and inventing one would mean sending a guessed
 * number to a provider as a real request. */

const CATALOG = {
 "profiles": [
  {
   "capabilities": {
    "files": true,
    "images": true,
    "json_schema": true
   },
   "context_window": 1000000,
   "credential_ref": "anthropic",
   "endpoint": "https://api.anthropic.com",
   "id": "anthropic:claude-fable-5",
   "model": "claude-fable-5",
   "output_limit": 128000,
   "protocol": "anthropic",
   "provider": "anthropic"
  },
  {
   "capabilities": {
    "files": true,
    "images": true,
    "json_schema": true
   },
   "context_window": 1000000,
   "credential_ref": "anthropic",
   "endpoint": "https://api.anthropic.com",
   "id": "anthropic:claude-fable-5-1",
   "model": "claude-fable-5-1",
   "output_limit": 128000,
   "protocol": "anthropic",
   "provider": "anthropic"
  },
  {
   "capabilities": {
    "files": true,
    "images": true,
    "json_schema": true
   },
   "context_window": 200000,
   "credential_ref": "anthropic",
   "endpoint": "https://api.anthropic.com",
   "id": "anthropic:claude-opus-4-6",
   "model": "claude-opus-4-6",
   "output_limit": 16384,
   "protocol": "anthropic",
   "provider": "anthropic"
  },
  {
   "capabilities": {
    "files": true,
    "images": true,
    "json_schema": true
   },
   "context_window": 200000,
   "credential_ref": "anthropic",
   "endpoint": "https://api.anthropic.com",
   "id": "anthropic:claude-opus-4-7",
   "model": "claude-opus-4-7",
   "output_limit": 16384,
   "protocol": "anthropic",
   "provider": "anthropic"
  },
  {
   "capabilities": {
    "files": true,
    "images": true,
    "json_schema": true
   },
   "context_window": 1000000,
   "credential_ref": "anthropic",
   "endpoint": "https://api.anthropic.com",
   "id": "anthropic:claude-opus-4-8",
   "model": "claude-opus-4-8",
   "output_limit": 128000,
   "protocol": "anthropic",
   "provider": "anthropic"
  },
  {
   "capabilities": {
    "files": true,
    "images": true,
    "json_schema": true
   },
   "context_window": 1000000,
   "credential_ref": "anthropic",
   "endpoint": "https://api.anthropic.com",
   "id": "anthropic:claude-opus-5-5",
   "model": "claude-opus-5-5",
   "output_limit": 128000,
   "protocol": "anthropic",
   "provider": "anthropic"
  },
  {
   "capabilities": {
    "files": true,
    "images": true,
    "json_schema": true
   },
   "context_window": 200000,
   "credential_ref": "anthropic",
   "endpoint": "https://api.anthropic.com",
   "id": "anthropic:claude-sonnet-4",
   "model": "claude-sonnet-4",
   "output_limit": 16384,
   "protocol": "anthropic",
   "provider": "anthropic"
  },
  {
   "capabilities": {
    "files": true,
    "images": true,
    "json_schema": true
   },
   "context_window": 200000,
   "credential_ref": "anthropic",
   "endpoint": "https://api.anthropic.com",
   "id": "anthropic:claude-sonnet-4-6",
   "model": "claude-sonnet-4-6",
   "output_limit": 16384,
   "protocol": "anthropic",
   "provider": "anthropic"
  },
  {
   "capabilities": {
    "files": true,
    "images": true,
    "json_schema": true
   },
   "context_window": 1000000,
   "credential_ref": "anthropic",
   "endpoint": "https://api.anthropic.com",
   "id": "anthropic:claude-sonnet-5",
   "model": "claude-sonnet-5",
   "output_limit": 128000,
   "protocol": "anthropic",
   "provider": "anthropic"
  },
  {
   "capabilities": {
    "files": true,
    "images": true,
    "json_schema": true
   },
   "context_window": 1048576,
   "credential_ref": "gemini",
   "endpoint": "https://generativelanguage.googleapis.com",
   "id": "gemini:gemini-3-flash-preview",
   "model": "gemini-3-flash-preview",
   "output_limit": 65536,
   "protocol": "gemini",
   "provider": "gemini"
  },
  {
   "capabilities": {
    "files": true,
    "images": true,
    "json_schema": true
   },
   "context_window": 1048576,
   "credential_ref": "gemini",
   "endpoint": "https://generativelanguage.googleapis.com",
   "id": "gemini:gemini-3.1-flash-lite",
   "model": "gemini-3.1-flash-lite",
   "output_limit": 65536,
   "protocol": "gemini",
   "provider": "gemini"
  },
  {
   "capabilities": {
    "files": true,
    "images": true,
    "json_schema": true
   },
   "context_window": 1048576,
   "credential_ref": "gemini",
   "endpoint": "https://generativelanguage.googleapis.com",
   "id": "gemini:gemini-3.1-pro-preview",
   "model": "gemini-3.1-pro-preview",
   "output_limit": 65536,
   "protocol": "gemini",
   "provider": "gemini"
  },
  {
   "capabilities": {
    "files": true,
    "images": true,
    "json_schema": true
   },
   "context_window": 1048576,
   "credential_ref": "gemini",
   "endpoint": "https://generativelanguage.googleapis.com",
   "id": "gemini:gemini-3.5-flash",
   "model": "gemini-3.5-flash",
   "output_limit": 65536,
   "protocol": "gemini",
   "provider": "gemini"
  },
  {
   "capabilities": {
    "files": true,
    "images": true,
    "json_schema": true
   },
   "context_window": 1048576,
   "credential_ref": "gemini",
   "endpoint": "https://generativelanguage.googleapis.com",
   "id": "gemini:gemini-3.5-flash-lite",
   "model": "gemini-3.5-flash-lite",
   "output_limit": 65536,
   "protocol": "gemini",
   "provider": "gemini"
  },
  {
   "capabilities": {
    "files": true,
    "images": true,
    "json_schema": true
   },
   "context_window": 1048576,
   "credential_ref": "gemini",
   "endpoint": "https://generativelanguage.googleapis.com",
   "id": "gemini:gemini-3.6-flash",
   "model": "gemini-3.6-flash",
   "output_limit": 65536,
   "protocol": "gemini",
   "provider": "gemini"
  },
  {
   "capabilities": {
    "files": true,
    "images": true,
    "json_schema": true
   },
   "context_window": 1048576,
   "credential_ref": "gemini",
   "endpoint": "https://generativelanguage.googleapis.com",
   "id": "gemini:gemini-3.7-flash",
   "model": "gemini-3.7-flash",
   "output_limit": 65536,
   "protocol": "gemini",
   "provider": "gemini"
  },
  {
   "capabilities": {
    "files": true,
    "images": true,
    "json_schema": true
   },
   "context_window": 1048576,
   "credential_ref": "gemini",
   "endpoint": "https://generativelanguage.googleapis.com",
   "id": "gemini:gemini-3.8-flash",
   "model": "gemini-3.8-flash",
   "output_limit": 65536,
   "protocol": "gemini",
   "provider": "gemini"
  },
  {
   "capabilities": {
    "files": false,
    "images": true,
    "json_schema": true
   },
   "context_window": 1050000,
   "credential_ref": "openai",
   "endpoint": "https://api.openai.com/v1",
   "id": "openai:gpt-6-luna",
   "model": "gpt-6-luna",
   "output_limit": 128000,
   "protocol": "openai-responses",
   "provider": "openai"
  },
  {
   "capabilities": {
    "files": false,
    "images": true,
    "json_schema": true
   },
   "context_window": 1050000,
   "credential_ref": "openai",
   "endpoint": "https://api.openai.com/v1",
   "id": "openai:gpt-6-sol",
   "model": "gpt-6-sol",
   "output_limit": 128000,
   "protocol": "openai-responses",
   "provider": "openai"
  }
 ],
 "unavailable": [
  {
   "id": "anthropic:claude-haiku-4-5",
   "model": "claude-haiku-4-5",
   "provider": "anthropic",
   "reason": "output_limit_unknown"
  },
  {
   "id": "ollama:deepseek-r1:14b",
   "model": "deepseek-r1:14b",
   "provider": "ollama",
   "reason": "output_limit_unknown"
  },
  {
   "id": "openai:gpt-4.1",
   "model": "gpt-4.1",
   "provider": "openai",
   "reason": "output_limit_unknown"
  },
  {
   "id": "openai:gpt-4.1-mini",
   "model": "gpt-4.1-mini",
   "provider": "openai",
   "reason": "output_limit_unknown"
  },
  {
   "id": "openai:gpt-5",
   "model": "gpt-5",
   "provider": "openai",
   "reason": "output_limit_unknown"
  },
  {
   "id": "openai:gpt-5.3-codex",
   "model": "gpt-5.3-codex",
   "provider": "openai",
   "reason": "output_limit_unknown"
  },
  {
   "id": "openai:gpt-5.4",
   "model": "gpt-5.4",
   "provider": "openai",
   "reason": "output_limit_unknown"
  },
  {
   "id": "openai:gpt-5.5",
   "model": "gpt-5.5",
   "provider": "openai",
   "reason": "output_limit_unknown"
  },
  {
   "id": "openai:gpt-5.6-luna",
   "model": "gpt-5.6-luna",
   "provider": "openai",
   "reason": "output_limit_unknown"
  },
  {
   "id": "openai:gpt-5.6-sol",
   "model": "gpt-5.6-sol",
   "provider": "openai",
   "reason": "output_limit_unknown"
  },
  {
   "id": "openai:gpt-5.6-terra",
   "model": "gpt-5.6-terra",
   "provider": "openai",
   "reason": "output_limit_unknown"
  },
  {
   "id": "openai:gpt-6-astra",
   "model": "gpt-6-astra",
   "provider": "openai",
   "reason": "output_limit_unknown"
  }
 ]
};

export const CAPTURED_KERNEL_CATALOG = Object.freeze(CATALOG);
