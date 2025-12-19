#!/bin/sh
set -eu

CONF_NO_AUTH="/etc/nginx/nginx.admin.conf"
CONF_WITH_AUTH="/etc/nginx/nginx.admin.basic.conf"
CONF_TARGET="/etc/nginx/nginx.conf"
HTPASSWD_FILE="/etc/nginx/.htpasswd"

if [ -n "${ADMIN_BASIC_USER:-}" ] && [ -n "${ADMIN_BASIC_PASS:-}" ]; then
  htpasswd -bc "$HTPASSWD_FILE" "$ADMIN_BASIC_USER" "$ADMIN_BASIC_PASS" >/dev/null
  cp "$CONF_WITH_AUTH" "$CONF_TARGET"
  echo "Admin portal basic auth enabled."
else
  rm -f "$HTPASSWD_FILE" >/dev/null 2>&1 || true
  cp "$CONF_NO_AUTH" "$CONF_TARGET"
  echo "Admin portal basic auth disabled."
fi

exec nginx -g 'daemon off;'
