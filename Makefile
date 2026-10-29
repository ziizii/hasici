.PHONY: help install login setup dev dev-prod demo emulators reset-emu check test-rules build preview deploy setup-ci

FIREBASE ?= npx -y firebase-tools@latest
# Same project ID the app uses in emulator mode (src/lib/firebase.ts). The
# demo- prefix keeps the emulators from ever touching real resources.
EMU = $(FIREBASE) --project demo-hasici
EMU_DATA = .emulator-data
# Your Firebase project, from .env (written by `npm run setup`).
PROJECT = $(shell sed -n 's/^VITE_FIREBASE_PROJECT_ID=//p' .env 2>/dev/null)

help: ## Show targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-10s %s\n", $$1, $$2}'

node_modules: package.json package-lock.json
	npm install
	@touch node_modules

install: node_modules ## Install dependencies

setup: ## First deploy to your own Firebase project (guided, writes .env)
	npm run setup

dev: node_modules ## Dev server + local emulators (data kept in .emulator-data)
	$(EMU) emulators:exec --only auth,firestore --import=$(EMU_DATA) --export-on-exit=$(EMU_DATA) \
		'VITE_USE_EMULATORS=1 npm run dev -- --open'

dev-prod: node_modules ## Dev server against the real Firebase project (.env)
	npm run dev -- --open

demo: node_modules ## Dev server with sample data, no Firebase
	npm run dev -- --open /?demo

emulators: ## Only the emulators (for running the app or tests separately)
	$(EMU) emulators:start --only auth,firestore --import=$(EMU_DATA) --export-on-exit=$(EMU_DATA)

reset-emu: ## Wipe local emulator data
	rm -rf $(EMU_DATA)

check: node_modules ## Type-check
	npm run check

test-rules: node_modules ## Test firestore.rules on throwaway emulators
	$(EMU) emulators:exec --only auth,firestore 'node scripts/test-rules.mjs'

build: node_modules ## Production build into build/
	npm run build

preview: build ## Serve the production build locally
	npm run preview -- --open

deploy: check build ## Deploy rules + hosting to the project in .env
	@test -n "$(PROJECT)" || { echo 'No project in .env, run make setup first'; exit 1; }
	$(FIREBASE) deploy --only firestore:rules,hosting --project $(PROJECT)

login: ## Log in to Firebase CLI
	$(FIREBASE) login

setup-ci: ## One-time: deploy service account + GitHub secret/variables
	./scripts/setup-ci.sh
