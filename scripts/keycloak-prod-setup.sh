#!/usr/bin/env bash
# Nastavitev PRODUKCIJSKEGA Keycloaka za CleverDash (VPS, vsebnik za kc.planego.eu).
#
# Zakaj skripta in ne navodilo za klikanje po admin konzoli: konfiguracija odjemalca je del
# pogodbe s kodo (redirect_uri iz apps/api/src/modules/auth/router.ts, vlogi iz
# platform/keycloak/role-mapping.ts, PKCE iz istega toka). Ročno naklikana bi bila edini
# nezapisani del namestitve — enaka past kot Caddyjev blok, zato je tudi ta verzioniran
# (infra/cleverdash.caddyfile). Skripta je IDEMPOTENTNA: ponovni zagon popravi odmik
# (npr. redirect_uri po zamenjavi domene), ne podvoji ničesar.
#
# Uporaba na VPS-u (iz korena repozitorija):
#
#   KC_ADMIN_PASSWORD=... CLEVERDASH_USER_PASSWORD=... ./scripts/keycloak-prod-setup.sh
#
# Obe gesli lahko izpustiš — skripta ju takrat vpraša (vnos ni viden). Nikoli ju ne piši v to
# datoteko (člen IV: v gitu ni skrivnosti; .gitleaks.toml to preverja v CI).
#
# Kar naredi:
#   1. realm cleverdash (če ga še ni),
#   2. vlogi cleverdash-admin in cleverdash-user,
#   3. zaupanja vrednega (confidential) odjemalca cleverdash-api s PKCE in pravima
#      preusmeritvama za https://cleverdash.zuusi.com,
#   4. uporabnika z vlogo cleverdash-admin in nastavljenim geslom,
#   5. izpiše blok za ../envs/.env.cleverdashNew (vključno s skrivnostjo odjemalca).
#
# Na obstoječih realmih (planego) ne spremeni ničesar: dela izključno v svojem realmu.
set -euo pipefail

# ─── Kar je vezano na TO namestitev ───────────────────────────────────────────────────────
# PUBLIC_BASE_URL mora biti IDENTIČEN tistemu v datoteki z okoljem, brez poševnice na koncu:
# iz njega api sestavi redirect_uri (callbackRedirectUri() v modules/auth/router.ts) in
# post_logout_redirect_uri (POST /auth/logout), Keycloak pa oba primerja z spodaj zapisanima
# DOBESEDNO. Neujemanje se ne pokaže v CleverDashu, ampak kot Keycloakova stran z "Invalid
# parameter: redirect_uri" — torej še preden uporabnik vidi aplikacijo.
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://cleverdash.zuusi.com}"
# Javni naslov Keycloaka. Rabi se samo za izpis KEYCLOAK_ISSUER_URL na koncu — sama skripta
# se s Keycloakom pogovarja po localhostu znotraj vsebnika (KC_INTERNAL_URL spodaj).
KC_PUBLIC_URL="${KC_PUBLIC_URL:-https://kc.planego.eu}"
REALM="${KC_REALM:-cleverdash}"
CLIENT_ID="${KEYCLOAK_CLIENT_ID:-cleverdash-api}"
# Imeni vlog sta privzetka KEYCLOAK_ADMIN_ROLE/KEYCLOAK_USER_ROLE iz
# apps/api/src/platform/config/env.ts. Brez ene od njiju je oseba zavrnjena, tudi če se pri
# Keycloaku uspešno prijavi (FR-007) — sam obstoj računa ne zadošča.
ADMIN_ROLE="${KEYCLOAK_ADMIN_ROLE:-cleverdash-admin}"
USER_ROLE="${KEYCLOAK_USER_ROLE:-cleverdash-user}"

# Prvi uporabnik. Dobi cleverdash-admin, ker se ob PRVI prijavi administratorja izvede prevzem
# obstoječih enouporabniških podatkov (migrateLegacyDataIfNeeded,
# platform/migration/legacy-userless-migration.service.ts) — kdor pride za njim, dobi prazne
# privzetke.
USER_EMAIL="${CLEVERDASH_USER_EMAIL:-urban.zupancic@gmail.com}"
USER_FIRST_NAME="${CLEVERDASH_USER_FIRST_NAME:-Urban}"
USER_LAST_NAME="${CLEVERDASH_USER_LAST_NAME:-Zupancic}"

# ─── Dostop do Keycloaka ──────────────────────────────────────────────────────────────────
# kcadm teče ZNOTRAJ vsebnika in se pogovarja s Keycloakom po localhostu. Namenoma ne prek
# https://kc.planego.eu: tako nastavitev deluje tudi, kadar je narobe ravno Caddy ali TLS, in
# skrbniško geslo ne gre skozi noben proxy.
KC_INTERNAL_URL="${KC_INTERNAL_URL:-http://localhost:8080}"
KC_ADMIN_USER="${KC_ADMIN_USER:-admin}"
KCADM="${KCADM:-/opt/keycloak/bin/kcadm.sh}"
# Lastna datoteka s prijavo namesto privzete ~/.keycloak/kcadm.config: ta ostane v vsebniku in
# v njej je žeton s pravicami nad VSEMI realmi. Pobrišemo jo ob izhodu (trap spodaj).
KC_CONFIG="/tmp/kcadm-cleverdash-$$.config"

if [ -z "${KC_CONTAINER:-}" ]; then
  KC_CONTAINER="$(docker ps --format '{{.Names}} {{.Image}}' | awk '/keycloak/ {print $1; exit}')"
fi
if [ -z "$KC_CONTAINER" ]; then
  echo "Vsebnika s Keycloakom ni bilo mogoče najti. Preveri 'docker ps' in nastavi KC_CONTAINER=<ime>." >&2
  exit 1
fi

# ─── Gesli ────────────────────────────────────────────────────────────────────────────────
prompt_secret() {
  local var_name="$1" label="$2" value=""
  if [ -n "${!var_name:-}" ]; then return 0; fi
  if [ ! -t 0 ]; then
    echo "$var_name ni nastavljen, vnosa pa ni mogoče prebrati (skripta ne teče v terminalu)." >&2
    exit 1
  fi
  read -rsp "$label: " value
  echo
  if [ -z "$value" ]; then
    echo "$var_name je prazen." >&2
    exit 1
  fi
  printf -v "$var_name" '%s' "$value"
}

prompt_secret KC_ADMIN_PASSWORD "Geslo Keycloak skrbnika ($KC_ADMIN_USER)"
prompt_secret CLEVERDASH_USER_PASSWORD "Geslo za $USER_EMAIL"

# ─── Pomagala ─────────────────────────────────────────────────────────────────────────────
# docker exec -i je nujen: predstavitve podajamo kot JSON po standardnem vhodu (-f -), ne kot
# pare -s. Tako se izognemo ubežanju ključev s pikami (pkce.code.challenge.method) in hkrati
# geslo nikoli ne pride med argumente procesa, kjer bi ga videl vsak 'ps' na gostitelju.
kc() { docker exec -i "$KC_CONTAINER" "$KCADM" "$@" --config "$KC_CONFIG"; }
kc_quiet() { kc "$@" >/dev/null; }
cleanup() { docker exec "$KC_CONTAINER" rm -f "$KC_CONFIG" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# Ena vrednost iz odgovora. kcadm zna CSV brez narekovajev, zato v vsebniku ni potreben jq.
kc_field() { kc "$@" --format csv --noquotes 2>/dev/null | head -n1 | tr -d '\r'; }

echo "→ vsebnik: $KC_CONTAINER, strežnik: $KC_INTERNAL_URL, realm: $REALM"

kc_quiet config credentials --server "$KC_INTERNAL_URL" --realm master \
  --user "$KC_ADMIN_USER" --password "$KC_ADMIN_PASSWORD"

# ─── 1. Realm ─────────────────────────────────────────────────────────────────────────────
# Lasten realm, ne planegovega: v njem so vlogi in uporabniki CleverDasha, njihova sprememba
# pa ne sme imeti nobenega učinka na kc.planego.eu. Če se priklapljaš na OBSTOJEČ
# organizacijski realm (spec.md Assumptions), poženi s KC_REALM=<ime> — spodnjih nastavitev
# realma se skripta v tem primeru ne dotakne.
if kc_quiet get "realms/$REALM" 2>/dev/null; then
  echo "→ realm $REALM že obstaja (nastavitev realma ne spreminjam)"
else
  echo "→ ustvarjam realm $REALM"
  kc_quiet create realms -f - <<JSON
{
  "realm": "$REALM",
  "displayName": "CleverDash",
  "enabled": true,
  "sslRequired": "external",
  "registrationAllowed": false,
  "loginWithEmailAllowed": true,
  "duplicateEmailsAllowed": false,
  "resetPasswordAllowed": true,
  "rememberMe": true,
  "verifyEmail": false,
  "bruteForceProtected": true,
  "permanentLockout": false,
  "failureFactor": 10,
  "waitIncrementSeconds": 60,
  "maxFailureWaitSeconds": 900,
  "accessTokenLifespan": 300,
  "ssoSessionIdleTimeout": 2592000,
  "ssoSessionMaxLifespan": 2592000,
  "internationalizationEnabled": true,
  "supportedLocales": ["sl", "en"],
  "defaultLocale": "sl"
}
JSON
fi
# Zakaj te tri številke:
#   accessTokenLifespan 300      — 5 minut je tudi privzetek, na katerega pade /auth/refresh,
#                                  kadar Keycloak expires_in ne pove (modules/auth/router.ts).
#   ssoSessionIdleTimeout 30 dni — sejo drži živo obnavljanje žetona; brez tako dolge
#                                  dovoljene neaktivnosti bi bil vsak jutranji obisk (in vsak
#                                  zagon Android aplikacije) nova prijava z geslom. Varnostno
#                                  to ni luknja: odvzem vloge ali seje na Keycloaku učinkuje v
#                                  KEYCLOAK_INTROSPECTION_CACHE_SECONDS (5 s), ker gre vsaka
#                                  zahteva skozi introspekcijo, ki je fail-CLOSED
#                                  (platform/keycloak/introspection-cache.ts).
#   ssoSessionMaxLifespan 30 dni — zgornja meja: enkrat mesečno prijava od začetka.
# Krajše nastaviš brez ponovnega zagona te skripte, npr. 8 ur neaktivnosti:
#   docker exec keycloak /opt/keycloak/bin/kcadm.sh update realms/cleverdash -s ssoSessionIdleTimeout=28800

# ─── 2. Vlogi ─────────────────────────────────────────────────────────────────────────────
ensure_role() {
  local name="$1" description="$2"
  if kc_quiet get "roles/$name" -r "$REALM" 2>/dev/null; then
    echo "→ vloga $name že obstaja"
  else
    echo "→ ustvarjam vlogo $name"
    kc_quiet create roles -r "$REALM" -s "name=$name" -s "description=$description"
  fi
}
# Vlogi sta REALM vlogi, ne vlogi odjemalca: api ju bere iz realm_access.roles
# (platform/keycloak/introspection-cache.ts). Vloga odjemalca bi pristala v resource_access in
# je koda ne bi videla — dostop bi bil zavrnjen brez pojasnila, kaj manjka.
ensure_role "$ADMIN_ROLE" "CleverDash: polne pravice (obseg admin, upravljanje API kljucev)"
ensure_role "$USER_ROLE" "CleverDash: navaden uporabnik (lastne kamere, urniki, opravila)"

# ─── 3. Odjemalec ─────────────────────────────────────────────────────────────────────────
client_json() {
  cat <<JSON
{
  "clientId": "$CLIENT_ID",
  "name": "CleverDash",
  "description": "Backend-for-frontend za CleverDash; SPA se s Keycloakom nikoli ne pogovarja neposredno.",
  "enabled": true,
  "protocol": "openid-connect",
  "publicClient": false,
  "clientAuthenticatorType": "client-secret",
  "standardFlowEnabled": true,
  "implicitFlowEnabled": false,
  "directAccessGrantsEnabled": false,
  "serviceAccountsEnabled": false,
  "consentRequired": false,
  "fullScopeAllowed": true,
  "redirectUris": ["$PUBLIC_BASE_URL/api/v1/auth/callback"],
  "webOrigins": [],
  "attributes": {
    "pkce.code.challenge.method": "S256",
    "post.logout.redirect.uris": "$PUBLIC_BASE_URL##$PUBLIC_BASE_URL/"
  }
}
JSON
}
# Zakaj tako:
#   publicClient=false + client-secret — api je strežnik in skrivnost zna hraniti. Javni
#     odjemalec je za SPA, ki žetone drži v brskalniku — natanko to, čemur se BFF izogne.
#   standardFlow=true, ostalo false    — v rabi je izključno authorization code + PKCE.
#     directAccessGrants (geslo neposredno v zamenjavo za žeton) bi bil obvod prijavne strani
#     in enotne odjave; serviceAccounts ni potreben, ker odjemalec introspekcijo dela nad
#     SVOJIM žetonom, s svojo skrivnostjo.
#   redirectUris — točno ena pot, brez *: nadomestni znak v preusmeritvi je znana pot do kraje
#     kode (odprta preusmeritev). Lokalni razvoj ima svoj realm na localhost:8080
#     (specs/004-keycloak-sso-multiuser/quickstart.md §1), zato ga tu ni.
#   webOrigins: [] — CORS ni potreben, ker brskalnik na Keycloak ne pošlje nobene XHR zahteve;
#     edini stik s Keycloakom je preusmeritev cele strani.
#   post.logout.redirect.uris — obe obliki (z in brez poševnice), ločeni z ##, kot zahteva
#     Keycloak. Api pošlje PUBLIC_BASE_URL dobesedno, zato je pravilna vrednost odvisna od
#     tega, ali ima operater v datoteki z okoljem poševnico na koncu.
#   fullScopeAllowed=true — brez tega realm vlogi ne prideta v žeton in ju introspekcija ne
#     vrne; api bi tedaj vsakogar zavrnil kot "brez prepoznane vloge".
# Privzeti nabori obsegov (roles, profile, email) so namenoma neomenjeni: Keycloak jih novemu
# odjemalcu doda sam, api pa potrebuje natanko te — vlogi iz roles, ime in e-pošto iz
# profile/email prek userinfo.
client_uuid="$(kc_field get clients -r "$REALM" -q "clientId=$CLIENT_ID" --fields id)"
if [ -n "$client_uuid" ]; then
  echo "→ posodabljam odjemalca $CLIENT_ID"
  client_json | kc_quiet update "clients/$client_uuid" -r "$REALM" -f -
else
  echo "→ ustvarjam odjemalca $CLIENT_ID"
  client_json | kc_quiet create clients -r "$REALM" -f -
  client_uuid="$(kc_field get clients -r "$REALM" -q "clientId=$CLIENT_ID" --fields id)"
fi

# ─── 3b. Občinstvo (aud) žetona ───────────────────────────────────────────────────────────
# Brez tega preslikovalnika prijava NE deluje, čeprav je vse ostalo pravilno — in okvara je
# zavajajoča. Keycloak novejših različic na točki introspekcije zavrne žeton, v katerega
# `aud` klicoči odjemalec ni vpisan; privzeti `aud` dostopnega žetona pa je samo `account`,
# odjemalca samega vanj Keycloak ne doda. `tokenIntrospection()` v
# platform/keycloak/introspection-cache.ts tedaj dobi `{"active":false}` in api pravilno
# zavrne dostop — uporabnik vidi "Keycloak je izdal žeton, ki ni aktiven", v Keycloakovem
# dnevniku pa je pravi vzrok: INTROSPECT_TOKEN_ERROR ... "Client 'cleverdash-api' is not in
# the token audience". Preverjeno na Keycloaku 26 (brez preslikovalnika active=false, z njim
# active=true in `realm_access.roles` z vlogo).
#
# Pravi popravek je ta in ne izklop preverjanja: dostopni žeton je namenjen TEMU API-ju, zato
# mora biti API v njegovem občinstvu — tako ga ne more uporabiti nihče drug.
MAPPER_NAME="cleverdash-api-audience"
if kc get "clients/$client_uuid/protocol-mappers/models" -r "$REALM" --fields name --format csv --noquotes 2>/dev/null | tr -d '\r' | grep -qx "$MAPPER_NAME"; then
  echo "→ preslikovalnik občinstva $MAPPER_NAME že obstaja"
else
  echo "→ dodajam preslikovalnik občinstva $MAPPER_NAME"
  kc_quiet create "clients/$client_uuid/protocol-mappers/models" -r "$REALM" -f - <<JSON
{
  "name": "$MAPPER_NAME",
  "protocol": "openid-connect",
  "protocolMapper": "oidc-audience-mapper",
  "config": {
    "included.client.audience": "$CLIENT_ID",
    "access.token.claim": "true",
    "introspection.token.claim": "true",
    "id.token.claim": "false"
  }
}
JSON
fi

client_secret="$(kc_field get "clients/$client_uuid/client-secret" -r "$REALM" --fields value)"

# ─── 4. Uporabnik ─────────────────────────────────────────────────────────────────────────
# username = e-pošta: CleverDash osebo prepozna po sub iz Keycloaka, prikazano ime in e-pošto
# pa vzame iz userinfo (modules/auth/router.ts). Dve različni vrednosti bi bili dve imeni za
# isto osebo brez vsakršne koristi.
user_id="$(kc_field get users -r "$REALM" -q "email=$USER_EMAIL" -q "exact=true" --fields id)"
if [ -n "$user_id" ]; then
  echo "→ uporabnik $USER_EMAIL že obstaja"
else
  echo "→ ustvarjam uporabnika $USER_EMAIL"
  kc_quiet create users -r "$REALM" -f - <<JSON
{
  "username": "$USER_EMAIL",
  "email": "$USER_EMAIL",
  "firstName": "$USER_FIRST_NAME",
  "lastName": "$USER_LAST_NAME",
  "enabled": true,
  "emailVerified": true
}
JSON
  user_id="$(kc_field get users -r "$REALM" -q "email=$USER_EMAIL" -q "exact=true" --fields id)"
fi

# temporary: false namenoma — ob true Keycloak ob prvi prijavi zahteva zamenjavo gesla, kar je
# pri prvem/demo računu le ovira. Geslo gre po standardnem vhodu, ne kot argument (glej kc()).
echo "→ nastavljam geslo"
kc_quiet update "users/$user_id/reset-password" -r "$REALM" -f - <<JSON
{ "type": "password", "value": "$CLEVERDASH_USER_PASSWORD", "temporary": false }
JSON

echo "→ dodeljujem vlogo $ADMIN_ROLE"
kc_quiet add-roles -r "$REALM" --uid "$user_id" --rolename "$ADMIN_ROLE"

# ─── 5. Kar mora v datoteko z okoljem ─────────────────────────────────────────────────────
# Izpis, ne pisanje v ../envs/.env.cleverdashNew: datoteka je operaterjeva (člen IV) in v njej
# so še druge skrivnosti, ki jih ta skripta ne pozna. Samodejno urejanje bi bilo tiho
# prepisovanje tuje datoteke.
cat <<TXT

────────────────────────────────────────────────────────────────────────────
Prilepi v ../envs/.env.cleverdashNew (obstoječe vrstice ZAMENJAJ, ne dodajaj):

PUBLIC_BASE_URL=$PUBLIC_BASE_URL
KEYCLOAK_ISSUER_URL=$KC_PUBLIC_URL/realms/$REALM
KEYCLOAK_CLIENT_ID=$CLIENT_ID
KEYCLOAK_CLIENT_SECRET=$client_secret
KEYCLOAK_ADMIN_ROLE=$ADMIN_ROLE
KEYCLOAK_USER_ROLE=$USER_ROLE
KEYCLOAK_INTROSPECTION_CACHE_SECONDS=5

Če SESSION_COOKIE_SECRET še ni izpolnjen (podpisuje sejni piškotek, 32+ znakov):
  openssl rand -base64 32

Nato zaženi sklad in preveri prijavo:
  ./scripts/vps-compose.sh up -d
  curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\\n' $PUBLIC_BASE_URL/api/v1/auth/login

Pričakovano: 302 na $KC_PUBLIC_URL/realms/$REALM/protocol/openid-connect/auth?...
Če vrne 500, api iz svojega vsebnika ne doseže Keycloaka — preveri:
  docker exec cleverdash-api-1 node -e "fetch('$KC_PUBLIC_URL/realms/$REALM/.well-known/openid-configuration').then(r=>console.log(r.status))"
────────────────────────────────────────────────────────────────────────────
TXT
