#!/usr/bin/env bash
# Ovojnica okoli `docker compose` za produkcijo (VPS).
#
# Obstaja zaradi ene same pasti: compose datoteko z okoljem potrebuje na DVA neodvisna
# načina — `--env-file` za vrednosti, ki jih vstavi v YAML (${FCM_KEY_FILE},
# ${PLANEGO_NETWORK}), in `env_file:` za vrednosti, ki jih dobi proces api. Če pozabiš
# prvo, compose pade z jasno napako; če pozabiš drugo, se sklad ZAŽENE, a brez
# konfiguracije — tiha okvara, ki jo opaziš šele pri prvi prijavi. Skripta
# nastavi oba iz iste, absolutne poti, zato je vseeno, iz katere mape jo pokličeš.
#
# Uporaba (poljubni argumenti gredo naprej v `docker compose`):
#   ./scripts/vps-compose.sh up -d --build
#   ./scripts/vps-compose.sh logs -f api
#   ./scripts/vps-compose.sh down
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${CLEVERDASH_ENV_FILE:-$repo_root/../envs/.env.cleverdashNew}"

if [ ! -f "$env_file" ]; then
  echo "Datoteke z okoljem ni: $env_file" >&2
  echo "Ustvari jo iz .env.example (izven repozitorija, člen IV) ali nastavi CLEVERDASH_ENV_FILE." >&2
  exit 1
fi

# Absolutna, razrešena pot: `env_file:` v compose datoteki se sicer razreši relativno na
# infra/, `--env-file` pa relativno na trenutno mapo — dve različni izhodišči za isto pot.
env_file="$(cd "$(dirname "$env_file")" && pwd)/$(basename "$env_file")"
export ENV_FILE="$env_file"

exec docker compose \
  --file "$repo_root/infra/docker-compose.yml" \
  --env-file "$env_file" \
  "$@"
