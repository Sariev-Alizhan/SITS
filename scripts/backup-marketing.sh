#!/bin/sh
# Бэкап папки marketing/ в приватный репозиторий sits-marketing.
# Запуск: sh scripts/backup-marketing.sh (после изменения креативов/текстов)
set -e
cd "$(dirname "$0")/../marketing"
git add -A
git diff --cached --quiet && { echo "Изменений нет — бэкап актуален."; exit 0; }
git commit -m "Бэкап $(date +%Y-%m-%d)"
git push
echo "Готово: https://github.com/Sariev-Alizhan/sits-marketing"
