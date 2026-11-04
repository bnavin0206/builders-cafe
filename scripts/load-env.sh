# Read a settings file (NAME=value lines) into environment variables WITHOUT
# running it as shell code. Used by deploy.sh and deploy-webapp.sh.
#
# Why not `source`: a value with an apostrophe ("Builder's Cafe"), a space or a
# $ breaks bash (or worse, $(...) in a value would be run). This reads each line
# literally, the way the app's own dotenv reader does:
#   - blank lines and # comments are skipped, an `export ` prefix is allowed
#   - a value in single or double quotes loses the quotes and nothing else
#   - an unquoted value is taken as written (apostrophes, spaces, $ and = are
#     fine); a trailing " # comment" and trailing spaces are dropped
#   - Windows line endings and a byte order mark are ignored
# Lines that are not NAME=value are skipped; their numbers (never their text,
# which could hold a secret) are left in ENV_IGNORED_LINES.
load_env_file() {
  local file="$1" lineno=0 line key val
  local re_line='^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$'
  local re_single="^'(.*)'[[:space:]]*(#.*)?\$"
  local re_double='^"(.*)"[[:space:]]*(#.*)?$'
  ENV_IGNORED_LINES=()
  if [[ ! -f "$file" ]]; then
    echo "Missing settings file: $file" >&2
    return 1
  fi
  while IFS= read -r line || [[ -n "$line" ]]; do
    lineno=$((lineno + 1))
    line="${line%$'\r'}"
    if (( lineno == 1 )); then line="${line#$'\xEF\xBB\xBF'}"; fi
    if [[ "$line" =~ ^[[:space:]]*(#.*)?$ ]]; then continue; fi
    if [[ "$line" =~ $re_line ]]; then
      key="${BASH_REMATCH[2]}"
      val="${BASH_REMATCH[3]}"
      val="${val#"${val%%[![:space:]]*}"}"
      if [[ "$val" =~ $re_single ]]; then
        val="${BASH_REMATCH[1]}"
      elif [[ "$val" =~ $re_double ]]; then
        val="${BASH_REMATCH[1]}"
      else
        val="${val%%[[:space:]]#*}"
        val="${val%"${val##*[![:space:]]}"}"
      fi
      export "$key=$val"
    else
      ENV_IGNORED_LINES+=("$lineno")
    fi
  done < "$file"
}
