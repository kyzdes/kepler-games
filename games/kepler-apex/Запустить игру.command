#!/bin/zsh
cd -- "${0:A:h}" || exit 1
if ! command -v npm >/dev/null 2>&1; then
  print 'Для запуска нужен Node.js 22.12+ или 24+ (npm).'
  read '?Нажмите Enter, чтобы закрыть окно.'
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm ci --no-audit --no-fund || exit 1
fi
print 'Кеплер: Апекс — откройте http://127.0.0.1:5174/ в браузере.'
npm run dev
