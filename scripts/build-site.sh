#!/bin/bash
set -e

echo "--- Building Frontend ---"
cd frontend
npm install
npm run build
cd ..

echo "--- Building Static Documentation Site ---"
# 'vantage' was installed via 'pip install .' by Cloudflare automatically
vantage build userguide/ -o dist/docs --frontend-dist frontend/dist -n "Vantage User Guide" --base-path /docs/

echo "--- Build Complete ---"
