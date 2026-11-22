#!/bin/sh
# Prompt regression gate: re-runs the 20-crop pipeline eval (about 40 model calls) and fails on a drop.
set -eu
cd "$(dirname "$0")"
if [ -f ../.env ]; then set -a; . ../.env; set +a; fi
EVAL_GATE=1 exec python3 pipeline_eval.py
