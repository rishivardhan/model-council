"""Central config for Model Council backend."""

import os

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")

# The three models dispatched in parallel for every prompt.
COUNCIL_MODELS = [
    "qwen2.5-coder:3b",
    "qwen2.5-coder:1.5b",
    "phi3.5:latest",
]

# Arbiter model - scores/merges the three outputs after they complete.
ARBITER_MODEL = "phi3.5:latest"

# Per-model generation timeout, in seconds. A model that exceeds this is
# reported as failed rather than allowed to hang the whole request.
MODEL_TIMEOUT_SECONDS = float(os.environ.get("MODEL_TIMEOUT_SECONDS", "120"))

ARBITER_TIMEOUT_SECONDS = float(os.environ.get("ARBITER_TIMEOUT_SECONDS", "60"))
