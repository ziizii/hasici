#!/usr/bin/env bash
# One-time setup for the GitHub Actions deploys: creates a deploy service
# account in hasici-bo, stores its key as the FIREBASE_SERVICE_ACCOUNT repo
# secret and the web config from .env as repo variables.
# Needs: gcloud auth login, gh auth login, a filled .env.
set -euo pipefail

PROJECT=hasici-bo
REPO=ziizii/hasici
SA=github-deploy
SA_EMAIL="$SA@$PROJECT.iam.gserviceaccount.com"

cd "$(dirname "$0")/.."

# Build config (public values) from .env.
grep -E '^VITE_FIREBASE_[A-Z_]+=.+' .env | while IFS='=' read -r name value; do
	gh variable set "$name" --repo "$REPO" --body "$value"
done

gcloud services enable iam.googleapis.com cloudresourcemanager.googleapis.com \
	firebasehosting.googleapis.com firebaserules.googleapis.com --project "$PROJECT"

# Bill API quota to our project, not gcloud's shared default one (which hits
# RESOURCE_EXHAUSTED), and retry the rest on rate limits.
export CLOUDSDK_BILLING_QUOTA_PROJECT="$PROJECT"
retry() {
	for wait in 5 15 30 60; do
		"$@" && return
		echo "Retrying in ${wait}s..." >&2
		sleep "$wait"
	done
	"$@"
}

if ! gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT" >/dev/null 2>&1; then
	gcloud iam service-accounts create "$SA" --project "$PROJECT" \
		--display-name "GitHub Actions deploy"
fi

for role in \
	roles/firebasehosting.admin \
	roles/firebaserules.admin \
	roles/datastore.viewer \
	roles/serviceusage.serviceUsageConsumer \
	roles/serviceusage.apiKeysViewer \
	roles/run.viewer; do
	retry gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA_EMAIL" \
		--role "$role" --condition None --quiet >/dev/null
done

key=$(mktemp)
trap 'rm -f "$key"' EXIT
retry gcloud iam service-accounts keys create "$key" --iam-account "$SA_EMAIL" --project "$PROJECT"
gh secret set FIREBASE_SERVICE_ACCOUNT --repo "$REPO" < "$key"

echo "Done. Old keys of $SA_EMAIL can be deleted in the Cloud console."
