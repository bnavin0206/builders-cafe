#!/usr/bin/env bash
# Deploy Builder's Cafe to an EXISTING Azure Web App (App Service on Linux),
# running it as a container image built in Azure Container Registry.
#
#   ./deploy-webapp.sh --check    which settings are set or missing (names only)
#   ./deploy-webapp.sh --plan     look at Azure and print what --deploy would do
#                                 (changes nothing; this is the default)
#   ./deploy-webapp.sh --deploy   do it, after you type the Web App's name
#
# Name the target yourself, there are no defaults, so nothing can land on the
# wrong app by accident:
#
#   export AZURE_RESOURCE_GROUP=<resource group>
#   export AZURE_WEBAPP_NAME=<web app name>
#   export AZURE_ACR_NAME=<new or existing registry name: 5-50 letters/digits>
#   export AZURE_ACR_RESOURCE_GROUP=<optional: a separate group for the registry>
#   ENV_FILE=.env.azure.local ./deploy-webapp.sh --plan
#
# With AZURE_ACR_RESOURCE_GROUP the registry lives in its own group (created if
# missing, no charge), apart from your other apps; deleting that group later
# removes everything this script added. Without it the registry goes in the
# Web App's group.
#
# It only touches this Web App and the registry named above. The App Service
# plan is shared with whatever else runs on it; it is never changed. Settings are
# added or replaced by name; every other setting on the Web App is left alone.
# No secret value is ever printed.
set -Eeuo pipefail
# Git Bash on Windows rewrites arguments that start with / into C:/Program Files/Git/...; turn that off.
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'
trap 'rc=$?; echo "ERROR: the script stopped at line $LINENO (exit code $rc) while running: $BASH_COMMAND" >&2' ERR

MODE="${1:---plan}"
ASSUME_YES="no"
[[ "${2:-}" == "--yes" ]] && ASSUME_YES="yes"

APP_PORT="${APP_PORT:-3000}"
IMAGE_NAME="${IMAGE_NAME:-builders-cafe}"
IMAGE_TAG="${IMAGE_TAG:-$(date +%Y%m%d%H%M%S)}"
ENV_FILE="${ENV_FILE:-.env.azure.local}"
HEALTH_WAIT_SECONDS="${HEALTH_WAIT_SECONDS:-420}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The Windows az.exe cannot read Git Bash paths like /c/Users/...; convert when cygpath exists.
winpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf %s "$1"; fi; }
# shellcheck source=scripts/load-env.sh
source "$HERE/scripts/load-env.sh"

die() { echo "ERROR: $*" >&2; exit 1; }
say() { echo "$*"; }

case "$MODE" in
  --check|--plan|--deploy) ;;
  *) die "Unknown option '$MODE'. Use --check, --plan or --deploy." ;;
esac

if [[ "$MODE" == "--check" ]]; then
  ENV_FILE="$ENV_FILE" bash "$HERE/deploy.sh" --check
  exit $?
fi

# ---- the target, named by you ------------------------------------------------
: "${AZURE_RESOURCE_GROUP:?Set AZURE_RESOURCE_GROUP (the resource group of the Web App)}"
: "${AZURE_WEBAPP_NAME:?Set AZURE_WEBAPP_NAME (the name of the Web App)}"
: "${AZURE_ACR_NAME:?Set AZURE_ACR_NAME (the Container Registry name; 5-50 letters and digits)}"
[[ "$AZURE_ACR_NAME" =~ ^[a-zA-Z0-9]{5,50}$ ]] || die "AZURE_ACR_NAME must be 5-50 letters and digits only."
ACR_RG="${AZURE_ACR_RESOURCE_GROUP:-$AZURE_RESOURCE_GROUP}"
[[ "$ACR_RG" =~ ^[a-zA-Z0-9._()-]{1,90}$ ]] || die "AZURE_ACR_RESOURCE_GROUP has characters Azure does not allow in a resource group name."

command -v az >/dev/null 2>&1 || die "The Azure CLI (az) is not installed or not on the path."
command -v node >/dev/null 2>&1 || die "Node.js is needed (it builds the settings file safely)."

# az on Windows prints Windows line endings; strip them. If az fails, say why on
# stderr (the first lines of what az said) and return failure to the caller.
azv() {
  local out err rc=0
  err="$(mktemp)"
  out="$(az "$@" 2>"$err")" || rc=$?
  if (( rc != 0 )); then
    echo "az $1 $2 failed: $(head -c 400 "$err" | tr -d '\r' | tr '\n' ' ')" >&2
    rm -f -- "$err"
    return 1
  fi
  rm -f -- "$err"
  printf '%s\n' "$out" | tr -d '\r'
}

if ! az account show >/dev/null 2>&1; then
  die "You are not signed in to Azure. Run: az login"
fi
say "Azure subscription: $(azv account show --query name -o tsv)"

load_env_file "$ENV_FILE" || exit 1

# Local-dev logins stay local; the live app can have its own.
ADMIN_LOGIN="${DEPLOY_ADMIN_LOGIN:-${ADMIN_LOGIN:-}}"
MIXOLOGIST_LOGIN="${DEPLOY_MIXOLOGIST_LOGIN:-${MIXOLOGIST_LOGIN:-}}"
KIOSK_LOGIN="${DEPLOY_KIOSK_LOGIN:-${KIOSK_LOGIN:-}}"
export ADMIN_LOGIN MIXOLOGIST_LOGIN KIOSK_LOGIN

# Settings sent to the Web App when the matching value is not empty.
SETTING_KEYS=(
  TWILIO_ACCOUNT_SID TWILIO_API_KEY TWILIO_API_SECRET TWILIO_AUTH_TOKEN
  TWILIO_MESSAGING_SERVICE_SID TWILIO_SYNC_SERVICE_SID TWILIO_VERIFY_SERVICE_SID
  RAZORPAY_KEY_ID RAZORPAY_KEY_SECRET RAZORPAY_WEBHOOK_SECRET
  LEADS_WEBHOOK_URL LEADS_WEBHOOK_SECRET
  ADMIN_LOGIN MIXOLOGIST_LOGIN KIOSK_LOGIN BOARD_KEY PUBLIC_BASE_URL
  SERVICE_INSTANCE_PREFIX LEAD_COLLECTION EVENT_NAME
  SEGMENT_SPACE_ID SEGMENT_PROFILE_KEY SEGMENT_TRAIT_CHECK UNLIMITED_ORDERS REQUIRE_TWILIO_SIGNATURE
  DAILY_REPORT_ENABLED REPORT_TO REPORT_CC REPORT_TEST_TO REPORT_SEND_TIME REPORT_SEND_EMPTY
  MAIL_FROM SENDGRID_API_KEY SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASSWORD
)

# The settings file must be complete before anything else happens.
if ! ENV_FILE="$ENV_FILE" bash "$HERE/deploy.sh" --check >/tmp/deploy-webapp-check.$$ 2>&1; then
  cat /tmp/deploy-webapp-check.$$
  rm -f -- "/tmp/deploy-webapp-check.$$"
  die "Fix the settings file first (see above)."
fi
rm -f -- "/tmp/deploy-webapp-check.$$"
say "Settings file $ENV_FILE: complete."

# ---- look at the Web App (read-only) ------------------------------------------
say "Reading the Web App $AZURE_WEBAPP_NAME ..."
APP_JSON="$(azv webapp show -g "$AZURE_RESOURCE_GROUP" -n "$AZURE_WEBAPP_NAME" \
  --query '{loc:location, reserved:reserved, state:state, host:defaultHostName, plan:serverFarmId, plan2:appServicePlanId, fx:siteConfig.linuxFxVersion, alwaysOn:siteConfig.alwaysOn, https:httpsOnly}' \
  -o json)" || die "Cannot read Web App '$AZURE_WEBAPP_NAME' in resource group '$AZURE_RESOURCE_GROUP' (the reason is above). Check the names, and that you are signed in to the right subscription."
[[ -n "$APP_JSON" ]] || die "Azure returned nothing for Web App '$AZURE_WEBAPP_NAME'."

# Pick one field out of a JSON answer; stop with a clear message if it is not JSON.
jfield() { printf '%s' "$1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let o;try{o=JSON.parse(s)}catch(e){process.exit(3)}const v=o[process.argv[1]];process.stdout.write(v===null||v===undefined?"":String(v))})' "$2"; }
jget() { jfield "$APP_JSON" "$1" || die "Could not read the Web App details from Azure's answer (it was not the JSON expected)."; }
LOCATION="$(jget loc)"; RESERVED="$(jget reserved)"; HOST="$(jget host)"; PLAN_ID="$(jget plan)"
[[ -n "$PLAN_ID" ]] || PLAN_ID="$(jget plan2)"
[[ -n "$PLAN_ID" ]] || die "Could not find which App Service plan this Web App runs on, so the plan's size cannot be checked. Nothing was changed."
CURRENT_FX="$(jget fx)"; ALWAYS_ON="$(jget alwaysOn)"; HTTPS_ONLY="$(jget https)"

[[ "$RESERVED" == "true" ]] || die "This Web App is not on a Linux plan. The app runs as a Linux container, so it needs a Linux plan."

PLAN_NAME="${PLAN_ID##*/}"
PLAN_RG="$(sed -n 's#.*/[Rr]esource[Gg]roups/\([^/]*\)/.*#\1#p' <<< "$PLAN_ID")"
[[ -n "$PLAN_RG" ]] || PLAN_RG="$AZURE_RESOURCE_GROUP"
say "Reading the App Service plan $PLAN_NAME ..."
PLAN_JSON="$(azv appservice plan show -n "$PLAN_NAME" -g "$PLAN_RG" \
  --query '{sku:sku.name, tier:sku.tier, workers:sku.capacity}' -o json)" \
  || die "Cannot read the App Service plan '$PLAN_NAME' (the reason is above)."
pget() { jfield "$PLAN_JSON" "$1" || die "Could not read the plan details from Azure's answer."; }
PLAN_SKU="$(pget sku)"; PLAN_TIER="$(pget tier)"; PLAN_WORKERS="$(pget workers)"
[[ -n "$PLAN_SKU" && -n "$PLAN_TIER" ]] || die "Could not read the size of the App Service plan '$PLAN_NAME', so it cannot be checked for Always On. Nothing was changed."
case "$PLAN_TIER" in
  Free|Shared|Dynamic) die "The plan '$PLAN_NAME' is $PLAN_TIER, which cannot stay always on. Use a Basic plan or higher." ;;
esac

# Informational only: if either read fails the plan still goes on and says so.
# The query has no special characters, because az.cmd on Windows mangles && and !.
say "Listing the other apps in the resource group (names only) ..."
OTHER_APPS=""
if APPS_RAW="$(azv webapp list -g "$AZURE_RESOURCE_GROUP" --query '[].[name,serverFarmId,appServicePlanId]' -o tsv)"; then
  while IFS=$'\t' read -r app_name app_plan app_plan2; do
    [[ -z "$app_plan" || "$app_plan" == "None" ]] && app_plan="$app_plan2"
    [[ -n "$app_name" && "$app_name" != "$AZURE_WEBAPP_NAME" && "${app_plan##*/}" == "$PLAN_NAME" ]] && OTHER_APPS+="$app_name "
  done <<< "$APPS_RAW"
  [[ -n "$OTHER_APPS" ]] || OTHER_APPS="none"
else
  OTHER_APPS="(could not be read, see the message above)"
fi
say "Reading the Web App's existing setting names ..."
if ! EXISTING_SETTINGS="$(azv webapp config appsettings list -g "$AZURE_RESOURCE_GROUP" -n "$AZURE_WEBAPP_NAME" --query '[].name' -o tsv | tr '\n' ' ')"; then
  EXISTING_SETTINGS="(could not be read, see the message above)"
fi

# Registry: exists here, free to create, or the name is taken elsewhere.
ACR_STATE="missing"
ACR_RG_STATE="exists"
if [[ "$ACR_RG" != "$AZURE_RESOURCE_GROUP" ]] && ! az group show -n "$ACR_RG" >/dev/null 2>&1; then
  ACR_RG_STATE="missing"
fi
if az acr show -n "$AZURE_ACR_NAME" -g "$ACR_RG" >/dev/null 2>&1; then
  ACR_STATE="exists"
else
  say "Checking that the registry name $AZURE_ACR_NAME is free ..."
  AVAILABLE="$(azv acr check-name --name "$AZURE_ACR_NAME" --query nameAvailable -o tsv)" \
    || die "Could not check the registry name (the reason is above)."
  [[ "$AVAILABLE" == "true" ]] || die "The registry name '$AZURE_ACR_NAME' is already taken (registry names are unique worldwide). Choose another AZURE_ACR_NAME."
fi

SET_NAMES=()
for k in "${SETTING_KEYS[@]}"; do
  if [[ -n "${!k:-}" ]]; then
    SET_NAMES+=("$k")
  fi
done

say
say "================ PLAN (nothing has been changed) ================"
say "Web App:        $AZURE_WEBAPP_NAME  ($AZURE_RESOURCE_GROUP)"
say "Address:        https://$HOST"
say "Region:         $LOCATION"
say "Operating sys:  Linux"
say "Plan:           $PLAN_NAME  ($PLAN_SKU, $PLAN_TIER, $PLAN_WORKERS instance(s)); the plan is NOT changed"
say "Other apps on this plan (not touched): ${OTHER_APPS:-none}"
say "Runs now as:    ${CURRENT_FX:-unknown}   Always On: ${ALWAYS_ON:-unknown}   HTTPS only: ${HTTPS_ONLY:-unknown}"
say "Registry:       $AZURE_ACR_NAME  ($([[ "$ACR_STATE" == "exists" ]] && echo "already exists" || echo "will be CREATED: Basic tier, about US\$5 a month, $LOCATION"))"
if [[ "$ACR_RG" == "$AZURE_RESOURCE_GROUP" ]]; then
  say "Registry group: $ACR_RG (the same group as the Web App)"
else
  say "Registry group: $ACR_RG ($([[ "$ACR_RG_STATE" == "exists" ]] && echo "already exists" || echo "will be CREATED, no charge, apart from your other apps"))"
fi
say "Image:          $IMAGE_NAME:$IMAGE_TAG (built in Azure from this folder; .dockerignore keeps .env files out)"
say
say "Changes --deploy would make, in order:"
n=1
if [[ "$ACR_RG_STATE" != "exists" ]]; then say "  $n. Create the resource group $ACR_RG for the registry (no charge)"; n=$((n+1)); fi
if [[ "$ACR_STATE" != "exists" ]]; then say "  $n. Create the registry $AZURE_ACR_NAME in $ACR_RG (Basic, admin sign-in on)"; n=$((n+1)); fi
say "  $n. Build the image in Azure and store it in the registry"; n=$((n+1))
say "  $n. Add or replace ${#SET_NAMES[@]} app settings on $AZURE_WEBAPP_NAME (names below), plus the port, host and registry sign-in"; n=$((n+1))
say "  $n. Point the Web App at the new image; turn Always On, HTTPS only and container logging on"; n=$((n+1))
say "  $n. Restart the Web App, then wait until https://$HOST answers"
say
say "Settings that will be added or replaced (names only):"
say "  ${SET_NAMES[*]}  WEBSITES_PORT HOSTNAME WEBSITES_ENABLE_APP_SERVICE_STORAGE DOCKER_REGISTRY_SERVER_URL DOCKER_REGISTRY_SERVER_USERNAME DOCKER_REGISTRY_SERVER_PASSWORD"
say "Settings already on the Web App (left alone unless named above):"
say "  ${EXISTING_SETTINGS:-none}"
say "================================================================="

if [[ "$MODE" == "--plan" ]]; then
  say "Nothing was changed. To go ahead:  ./deploy-webapp.sh --deploy"
  exit 0
fi

# ---- --deploy ------------------------------------------------------------------
if [[ "$ASSUME_YES" != "yes" ]]; then
  read -r -p "Type the Web App name ($AZURE_WEBAPP_NAME) to continue, anything else cancels: " ANSWER
  [[ "$ANSWER" == "$AZURE_WEBAPP_NAME" ]] || die "Cancelled. Nothing was changed."
fi

if [[ "$ACR_RG_STATE" != "exists" ]]; then
  say "Creating resource group $ACR_RG"
  az group create -n "$ACR_RG" -l "$LOCATION" --tags purpose=builders-cafe-registry -o none
fi
if [[ "$ACR_STATE" != "exists" ]]; then
  say "Creating registry $AZURE_ACR_NAME in $ACR_RG"
  az acr create -n "$AZURE_ACR_NAME" -g "$ACR_RG" -l "$LOCATION" \
    --sku Basic --admin-enabled true -o none
fi
ACR_SERVER="$(azv acr show -n "$AZURE_ACR_NAME" -g "$ACR_RG" --query loginServer -o tsv)"
[[ -n "$ACR_SERVER" ]] || die "Could not read the registry's address."

say "Building the image in Azure (a few minutes)"
az acr build --registry "$AZURE_ACR_NAME" --image "$IMAGE_NAME:$IMAGE_TAG" "$(winpath "$HERE")"

DIGEST="$(azv acr repository show -n "$AZURE_ACR_NAME" --image "$IMAGE_NAME:$IMAGE_TAG" --query digest -o tsv)"
[[ -n "$DIGEST" ]] || die "Could not read the image digest."
REMOTE_IMAGE="$ACR_SERVER/$IMAGE_NAME@$DIGEST"
say "Image: $REMOTE_IMAGE"

ACR_USER="$(azv acr credential show -n "$AZURE_ACR_NAME" --query username -o tsv)"
ACR_PASS="$(azv acr credential show -n "$AZURE_ACR_NAME" --query 'passwords[0].value' -o tsv)"

# Settings go in through a private temporary JSON file: values with characters
# such as & % ^ would otherwise be mangled by az.cmd on Windows, and nothing
# is shown on the command line or in the output.
SETTINGS_FILE="$(mktemp)"
trap 'rm -f -- "$SETTINGS_FILE"' EXIT
chmod 600 "$SETTINGS_FILE" 2>/dev/null || true
SETTINGS_PORT="$APP_PORT" SETTINGS_ACR_SERVER="https://$ACR_SERVER" \
SETTINGS_ACR_USER="$ACR_USER" SETTINGS_ACR_PASS="$ACR_PASS" \
node -e '
const out = {};
for (const k of process.argv.slice(1)) if (process.env[k]) out[k] = process.env[k];
out.WEBSITES_PORT = process.env.SETTINGS_PORT;
out.HOSTNAME = "0.0.0.0";
out.WEBSITES_ENABLE_APP_SERVICE_STORAGE = "false";
out.DOCKER_REGISTRY_SERVER_URL = process.env.SETTINGS_ACR_SERVER;
out.DOCKER_REGISTRY_SERVER_USERNAME = process.env.SETTINGS_ACR_USER;
out.DOCKER_REGISTRY_SERVER_PASSWORD = process.env.SETTINGS_ACR_PASS;
process.stdout.write(JSON.stringify(out));
' "${SET_NAMES[@]}" > "$SETTINGS_FILE"

say "Applying app settings (names only are shown, never values)"
az webapp config appsettings set -g "$AZURE_RESOURCE_GROUP" -n "$AZURE_WEBAPP_NAME" \
  --settings "@$(winpath "$SETTINGS_FILE")" -o none

say "Pointing the Web App at the new image"
az webapp config set -g "$AZURE_RESOURCE_GROUP" -n "$AZURE_WEBAPP_NAME" \
  --linux-fx-version "DOCKER|$REMOTE_IMAGE" --always-on true --http20-enabled true -o none
az webapp update -g "$AZURE_RESOURCE_GROUP" -n "$AZURE_WEBAPP_NAME" --https-only true -o none
az webapp log config -g "$AZURE_RESOURCE_GROUP" -n "$AZURE_WEBAPP_NAME" \
  --docker-container-logging filesystem -o none

say "Restarting"
az webapp restart -g "$AZURE_RESOURCE_GROUP" -n "$AZURE_WEBAPP_NAME" -o none

say "Waiting for https://$HOST (up to $((HEALTH_WAIT_SECONDS / 60)) minutes; the first start pulls the image)"
deadline=$((SECONDS + HEALTH_WAIT_SECONDS))
code="000"
while (( SECONDS < deadline )); do
  code="$(curl -sS -m 15 -o /dev/null -w '%{http_code}' "https://$HOST/webhooks/messaging" 2>/dev/null || true)"
  [[ "$code" == "200" ]] && break
  sleep 10
done

say
if [[ "$code" == "200" ]]; then
  say "Deployment complete: the app answers."
else
  say "The app did not answer with 200 yet (last answer: $code). It may still be starting."
  say "Look at the logs:  az webapp log tail -g $AZURE_RESOURCE_GROUP -n $AZURE_WEBAPP_NAME"
fi
say "App URL:         https://$HOST"
say "Twilio webhook:  https://$HOST/webhooks/messaging"
say "Razorpay webhook: https://$HOST/webhooks/razorpay   (event: payment_link.paid)"
say "TV order board:  https://$HOST/event/<event>/board?key=<BOARD_KEY>"
