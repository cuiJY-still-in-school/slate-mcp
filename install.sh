#!/usr/bin/env bash
set -e

# 🪨 石板 (Slate) 一键安装
# curl -fsSL https://raw.githubusercontent.com/cuiJY-still-in-school/slate/main/install.sh | bash

REPO="https://github.com/cuiJY-still-in-school/slate.git"
DIR="${SLATE_DIR:-$HOME/.slate}"
BIN="$HOME/.local/bin/slate"

echo "🪨 石板 — 安装中…"

# deps
for cmd in git node npm; do
  command -v $cmd &>/dev/null || { echo "❌ 需要 $cmd"; exit 1; }
done
[ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -ge 20 ] || { echo "❌ Node >= 20 (当前 $(node -v))"; exit 1; }

# clone
if [ -d "$DIR/.git" ]; then
  echo "→ 更新…"
  cd "$DIR" && git pull --ff-only origin main 2>/dev/null || { cd ~ && rm -rf "$DIR" && git clone --depth 1 "$REPO" "$DIR"; }
else
  echo "→ 克隆…"
  rm -rf "$DIR"
  git clone --depth 1 "$REPO" "$DIR"
fi

# install
cd "$DIR"
echo "→ 依赖…"
npm install --prefer-offline 2>/dev/null || npm install
echo "→ 构建…"
npm run build

# link
mkdir -p "$(dirname "$BIN")"
cat > "$BIN" << 'EOF'
#!/usr/bin/env bash
exec node "$HOME/.slate/dist/index.js" "$@"
EOF
chmod +x "$BIN"

# PATH
case "$SHELL" in
  */zsh)  RC="$HOME/.zshrc" ;;
  */bash) RC="$HOME/.bashrc" ;;
  *)      RC="$HOME/.profile" ;;
esac
if ! echo "$PATH" | grep -q "$HOME/.local/bin"; then
  echo "" >> "$RC"
  echo "# 🪨 石板" >> "$RC"
  echo "export PATH=\"$HOME/.local/bin:\$PATH\"" >> "$RC"
fi

# verify
echo ""
"$BIN" --version 2>/dev/null || true
echo "┌──────────────────────────────────────┐"
echo "│ 🪨 石板 安装完成！                   │"
echo "│                                      │"
echo "│ 下一步: slate setup                  │"
echo "│ 需要:   source $RC                   │"
echo "└──────────────────────────────────────┘"
