#!/usr/bin/env bash
#
# energyMatrix Pod 构建脚本（POSIX / macOS / Linux）。
#
#   1. 探测 fan / node / npm。
#   2. 探测依赖 pod（finStackCoreExt / finEntityModelToolsExt / jobExt / hisExt / foliox）。
#   3. ts/node_modules 不存在时先 npm install。
#   4. 交给 `fan build.fan` —— finBuild 会先在 ts/ 跑 `npm run build`
#      （产物落 res/web/em/），再编译全部 Fantom 并打包 pod。
#
# 参数：
#   --skip-deps-check   跳过依赖 pod 探测
#   --clean             先删 ts/node_modules 与 res/web/em/ 旧产物
#   --fantom-only       只编译 Fantom（临时移除 nodeDirs，不跑前端构建）
#
# 退出码：0 成功 / 1 环境问题 / 2 依赖缺失 / 3 npm 失败 / 4 fan build 失败
#
# 注意：必须用「运行中 FIN server 所用的那个安装」来编译，否则 pod 会落到
# 另一个 fan.home 的 lib/fan/ 下，live server 永远不会加载它。
# 确认方法：ps aux | grep -i hetan，看 -Dfan.home=…

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TS_DIR="${EXT_DIR}/ts"

SKIP_DEPS_CHECK=0
CLEAN=0
FANTOM_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --skip-deps-check) SKIP_DEPS_CHECK=1 ;;
    --clean)           CLEAN=1 ;;
    --fantom-only)     FANTOM_ONLY=1 ;;
    -h|--help)         sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)                 echo "ERROR: unknown flag '$arg' (use --help)" >&2; exit 1 ;;
  esac
done

log()  { printf "\033[1;36m[em-build]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[em-build]\033[0m %s\n" "$*"; }
err()  { printf "\033[1;31m[em-build ERROR]\033[0m %s\n" "$*" >&2; }

# ---- Step 1: 工具链 ----
log "Probing toolchain"
command -v fan >/dev/null 2>&1 || { err "'fan' not on PATH — install FIN/Fantom and add bin/ to PATH"; exit 1; }
if [ "${FANTOM_ONLY}" -eq 0 ]; then
  command -v node >/dev/null 2>&1 || { err "'node' not on PATH — install Node 18+"; exit 1; }
  command -v npm  >/dev/null 2>&1 || { err "'npm' not on PATH"; exit 1; }
fi

FAN_HOME="$(fan -version 2>&1 | awk -F: '/fan\.home/{gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2; exit}' || true)"
[ -z "${FAN_HOME}" ] && FAN_HOME="$(dirname "$(command -v fan)")/.."
LIB_FAN="${FAN_HOME}/lib/fan"
log "FAN repo: ${LIB_FAN}"

# ---- Step 2: 依赖 pod ----
if [ "${SKIP_DEPS_CHECK}" -eq 0 ]; then
  log "Checking required dependency pods"
  REQUIRED_PODS=(finStackCoreExt finEntityModelToolsExt jobExt hisExt foliox)
  MISSING=()
  for pod in "${REQUIRED_PODS[@]}"; do
    [ -f "${LIB_FAN}/${pod}.pod" ] || MISSING+=("${pod}")
  done
  if [ "${#MISSING[@]}" -gt 0 ]; then
    err "Missing dependency pod(s) in ${LIB_FAN}:"
    for pod in "${MISSING[@]}"; do printf "    - %s.pod\n" "${pod}" >&2; done
    err "Install them, or re-run with --skip-deps-check."
    exit 2
  fi
fi

# ---- Step 3: 清理 ----
if [ "${CLEAN}" -eq 1 ]; then
  log "Cleaning ts/node_modules and res/web/em output"
  rm -rf "${TS_DIR}/node_modules"
  rm -rf "${EXT_DIR}/res/web/em"/*
fi

# ---- Step 4: 构建 ----
cd "${EXT_DIR}"

if [ "${FANTOM_ONLY}" -eq 1 ]; then
  # 临时把 nodeDirs 注释掉做纯 Fantom 编译检查，结束后无条件还原。
  log "Fantom-only build (nodeDirs temporarily disabled)"
  cp build.fan build.fan.bak
  # shellcheck disable=SC2016
  sed -i.tmp 's|^\( *\)nodeDirs = |\1// nodeDirs = |' build.fan && rm -f build.fan.tmp
  set +e
  fan build.fan
  RC=$?
  set -e
  mv build.fan.bak build.fan
  [ "${RC}" -eq 0 ] || { err "fan build.fan failed"; exit 4; }
else
  if [ ! -d "${TS_DIR}/node_modules" ]; then
    log "Installing TS dependencies (one-time)"
    ( cd "${TS_DIR}" && npm install --no-audit --no-fund ) || { err "npm install failed"; exit 3; }
  fi
  log "Compiling energyMatrix pod (finBuild runs ts/ vite build first)"
  fan build.fan || { err "fan build.fan failed"; exit 4; }
fi

POD_PATH="${LIB_FAN}/energyMatrix.pod"
if [ -f "${POD_PATH}" ]; then
  log "BUILD OK — ${POD_PATH} ($(du -h "${POD_PATH}" | awk '{print $1}'))"
  log "重启 finStackHost 后再硬刷新浏览器（Cmd+Shift+R），pod 内 SPA 缓存很激进。"
else
  warn "fan reported success but ${POD_PATH} not found"
fi
