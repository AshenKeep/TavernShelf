#!/usr/bin/env bash
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

echo -e "${BOLD}${CYAN}"
echo "  ████████╗ █████╗ ██╗   ██╗███████╗██████╗ ███╗   ██╗"
echo "     ██╔══╝██╔══██╗██║   ██║██╔════╝██╔══██╗████╗  ██║"
echo "     ██║   ███████║██║   ██║█████╗  ██████╔╝██╔██╗ ██║"
echo "     ██║   ██╔══██║╚██╗ ██╔╝██╔══╝  ██╔══██╗██║╚██╗██║"
echo "     ██║   ██║  ██║ ╚████╔╝ ███████╗██║  ██║██║ ╚████║"
echo "     ╚═╝   ╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝"
echo -e "  ███████╗██╗  ██╗███████╗██╗     ███████╗${NC}"
echo -e "${BOLD}  TavernShelf v0.0.1 — TTRPG Digital Library${NC}"
echo ""

# Check .env
if [ ! -f .env ]; then
  echo -e "${YELLOW}No .env found — copying from .env.example${NC}"
  cp .env.example .env
  echo -e "${RED}⚠  Edit .env before continuing:${NC}"
  echo "   1. Set LIBRARY_PATH to your TTRPG folder"
  echo "   2. Set JWT_SECRET (run: openssl rand -hex 64)"
  echo "   3. Set ADMIN_EMAIL and ADMIN_PASSWORD"
  echo ""
  echo -e "${CYAN}Then run this script again.${NC}"
  exit 1
fi

source .env

# Validate required vars
ERRORS=0
for VAR in JWT_SECRET LIBRARY_PATH ADMIN_EMAIL ADMIN_PASSWORD; do
  if [ -z "${!VAR}" ] || [[ "${!VAR}" == *"change_me"* ]] || [[ "${!VAR}" == *"changeme"* ]]; then
    echo -e "${RED}✗ $VAR is not set or still has default value${NC}"
    ERRORS=$((ERRORS+1))
  fi
done

if [ ! -d "$LIBRARY_PATH" ]; then
  echo -e "${RED}✗ LIBRARY_PATH does not exist: $LIBRARY_PATH${NC}"
  ERRORS=$((ERRORS+1))
fi

if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}Fix the above errors in .env before starting.${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Configuration looks good${NC}"
echo -e "  Library: ${LIBRARY_PATH}"
echo -e "  Port:    ${PORT:-7624}"
echo -e "  Admin:   ${ADMIN_EMAIL}"
echo ""

echo -e "${CYAN}Building and starting TavernShelf…${NC}"
docker compose up --build -d

echo ""
echo -e "${GREEN}✓ TavernShelf is starting up!${NC}"
echo ""
echo -e "  ${BOLD}Open:${NC}  http://localhost:${PORT:-7624}"
echo -e "  ${BOLD}Login:${NC} ${ADMIN_EMAIL}"
echo ""
echo -e "  ${YELLOW}The library scan runs automatically on first start.${NC}"
echo -e "  ${YELLOW}Large libraries may take a few minutes to index.${NC}"
echo ""
echo -e "  Logs: ${CYAN}docker compose logs -f api${NC}"
echo ""
