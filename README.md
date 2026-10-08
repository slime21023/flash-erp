# FlashERP

<p align="center">
  <strong>高可靠度單體模組化開源企業資源規劃系統 (High-Reliability Open-Source Modular Monolith ERP)</strong><br>
  <em>媲美 Odoo 的 Addon 擴充架構與純淨開箱即用體驗</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" alt="License: Apache 2.0" />
  <img src="https://img.shields.io/badge/Backend-NestJS_11-E0234E.svg" alt="NestJS 11" />
  <img src="https://img.shields.io/badge/Frontend-Svelte_5-FF3E00.svg" alt="Svelte 5" />
  <img src="https://img.shields.io/badge/Database-PostgreSQL_16-336791.svg" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/ORM-TypeORM-FE0879.svg" alt="TypeORM" />
  <img src="https://img.shields.io/badge/Testing-Vitest_+_fast--check_PBT-6E9F18.svg" alt="Vitest & PBT" />
  <img src="https://img.shields.io/badge/Architecture-Modular_Monolith-indigo.svg" alt="Modular Monolith" />
</p>

---

## 繁體中文 (Traditional Chinese)

### 🌟 專案願景與核心特色

FlashERP 是專為單一現代企業設計的高可靠資源規劃系統。拒絕過早微服務化帶來的分散式交易開銷，充分享受單體模組架構（Modular Monolith）的高內聚性與 PostgreSQL 單一資料庫的 ACID 強一致性。

1. **開箱即用（Out-of-the-Box & Clean Slate）**：
   - **純淨體驗**：不預灌雜亂的模擬業務訂單假數據，系統初始化直接就緒，可直接錄入真實企業帳套。
   - **現代化 Web 後台**：內建基於 **Svelte 5** 的超輕量管理後台（Monorepo `/frontend`），具備 Odoo 風格的 9 宮格應用切換器（App Switcher）、單據狀態指示條（Statusbar）與明細表單。
   - **一鍵 Docker 編排**：`docker compose up -d` 同步啟動 PostgreSQL、FlashERP 後端 API 與 Svelte 前端。
   - **契約驅動 API**：**NestJS + oRPC 1.15.5 + Valibot 1.5.0** 共用輸入、輸出與錯誤契約，Svelte 使用具型別的 `OpenAPILink` client。
   - **互動式 API 文檔**：從相同 API 契約產生 OpenAPI（`http://localhost:3333/api/docs`；JSON 為 `/api/openapi.json`）。
2. **媲美 Odoo 的 Addon 擴充架構**：
   - **模組清單機制（Module Manifest）**：每個模組具備自描述清單，支援依賴拓撲排序（Topological Sort）與無循環依賴檢驗。
   - **動態自訂欄位（JSONB Custom Fields）**：第三方外掛可在不停機、不破壞實體 Schema 的前提下自由擴充動態屬性。
   - **生命週期鉤子系統（Lifecycle Hooks）**：支援在單據驗證、事務提交前後無侵入掛載業務邏輯。
3. **極致工程守護與精確度**：
   - **鐵路導向設計（ROP）**：全領域用例採用 `Result<T, DomainError>`，消除未捕獲異常。
   - **零尾差值物件**：全系統金額採用整數最小分位值物件（`Money`），杜絕 JavaScript 浮點數精度損失，製費與金額分攤 100% 總額守恆。
   - **性質測試（PBT）**：核心演算法（三向匹配、移動加權成本、BOM 展算、零尾差分攤）強制執行 `fast-check` 至少 1,000 次隨機樣例測試。

---

### 📦 系統模組架構拓撲

```text
FlashERP/
├── frontend/                           # 【Svelte 5 Web 管理後台】(Monorepo Workspace)
│   ├── src/lib/components/             # AppSwitcher (9宮格), Navbar, Statusbar, Forms
│   └── src/apps/                       # 各模組視圖: Sales, Procurement, Inventory, Manufacturing, Finance...
│
├── src/
│   ├── platform/                       # 【平台底座】無業務色彩的通用基底
│   │   ├── fp/                         # Result<T, E>、DomainError 函數式原語
│   │   ├── kernel/                     # Money、Quantity、Decimal、DateRange 不可變值物件
│   │   ├── addons/                     # Manifest 清單、AddonRegistry 拓撲、CustomFields、Hooks
│   │   ├── workflow/                   # 有限狀態機與多階審批 Pipeline
│   │   ├── numbering/                  # 樂觀鎖單據流水號產生器
│   │   ├── persistence/                # runInTransaction ACID 交易傳播引擎
│   │   ├── http/                       # 共用 Valibot schemas、Result/oRPC 邊界適配器
│   │   └── security/                   # RBAC Guard、權限宣告與組織作用域
│   │
│   └── modules/                        # 【9 大核心領域模組】(預設全數啟用)
│       ├── organization/               # 企業組織樹 (公司/廠區/倉庫)
│       ├── identity/                   # 本地認證與組織作用域 RBAC
│       ├── audit/                      # 不可變審計日誌與領域事件監聽
│       ├── finance/                    # 複式簿記總帳、科目表與試算表 (GL)
│       ├── inventory/                  # 庫存水位、移動加權成本與可用量 (ATP)
│       ├── procurement/                # 請購、採購、收貨與三向匹配 (P2P)
│       ├── sales/                      # 客戶信用管制、銷售訂單與出庫履約 (OTC)
│       ├── treasury/                   # 銀行帳戶、收付款憑單與規則對帳 (Cash)
│       └── manufacturing/              # BOM 展算、工單發料 WIP 與製費分攤 (PP/CO)
```

各領域的 `contracts/<module>_api_contract.ts` 定義 oRPC procedures 與 Valibot schemas，由 `src/api_contract.ts` 聚合供前後端共用。內部抽象 Contract 維持 NestJS DI 與 `Result<T, DomainError>`；API 契約的匯入圖由架構檢查限制為瀏覽器可用的純定義。

---

### 🚀 快速上手指南 (Quickstart)

#### 模式 A：使用 Docker Compose 一鍵啟動 (推薦)

```bash
# 啟動 PostgreSQL、後端 API 與 Svelte 前端
docker compose up -d

# 瀏覽器訪問:
# - Svelte 管理後台: http://localhost:5173
# - Swagger API 文檔: http://localhost:3333/api/docs

# 以 backend container 執行初始化登入帳號（PowerShell）
$env:ADMIN_PASSWORD = 'change-this-before-use'
docker compose run --rm -e ADMIN_PASSWORD=$env:ADMIN_PASSWORD backend node dist/scripts/seed_admin.js
```

#### 模式 B：本地開發模式 (Local Development)

```bash
# 1. 安裝依賴 (自動關聯前後端工作區)
npm install

# 2. 設定環境變數
cp .env.example .env

# 3. 啟動本機 PostgreSQL
docker compose up -d postgres

# 4. 執行品質守衛與測試
npm run architecture:check
npm test
npm run test:integration

# 5. 設定一次性 bootstrap 密碼並初始化系統管理員
$env:ADMIN_PASSWORD = 'change-this-before-use'
npm run seed:admin

# 6. 啟動後端熱重載服務 (Port 3333)
npm run start:dev

# 7. 啟動前端 Svelte 服務 (Port 5173)
npm run dev -w frontend
```

#### 模式 C：Production（外部 PostgreSQL）

Production compose 不會啟動資料庫容器，請先準備 PostgreSQL 16 或相容的受管資料庫，設定 `.env` 中的 `DB_*` 與精確的 `CORS_ORIGINS`；若 API 不走前端 Nginx 的同源反向代理，再設定 `VITE_API_URL`，再執行：

```bash
docker compose -f compose.production.yaml config
docker compose -f compose.production.yaml up -d --build
curl -fsS https://erp.example.com/ready
```

備份、還原演練、發版與事故處理請參考 [`docs/operations/production-runbook.md`](docs/operations/production-runbook.md)。Production 登入使用 HttpOnly cookie；前端不會把 bearer token 寫入 localStorage。

---

### API 契約與前端呼叫

所有業務路由統一使用 `/api` 前綴，例如 `GET /api/sales/orders/{id}`、`POST /api/inventory/movements`；舊的無前綴業務路由已移除。系統模組清單維持 `GET /api/system/modules`。`/`、`/health`、`/ready` 保留原生 NestJS 路由，readiness 在資料庫不可用時回傳 503。

前端透過 `frontend/src/lib/api.ts` 的共用 client 呼叫 API，輸入與回應型別由契約推導：

```typescript
import { api } from './lib/api'

const order = await api.sales.getSalesOrder(
  { id: 'so-001' },
  { context: { organizationUnitId: 'company-001', requestId: 'request-001' } }
)
```

Client 自動攜帶 Cookie 與 CSRF header；可按呼叫覆寫組織作用域與 request ID。收到 401 時清除本地 session；403 或業務錯誤不會登出。金額與數量以整數十進位字串傳輸以保留 `bigint` 精度，日期使用 `YYYY-MM-DD`，時間戳使用 ISO 格式。Valibot strict objects 拒絕未知輸入欄位，成功回應直接返回 schema 定義的 snapshot。

錯誤使用 oRPC 格式，包含 `defined`、`code`、`status`、`message` 與有宣告時的 `data`；不再以 `{ error: ... }` 包裝。前端捕獲 `ORPCError` 後可依 `code`／`status` 處理業務情況。未知錯誤及輸出驗證失敗只公開遮蔽後的 500。建立操作通常回傳 201，登出為 204 空回應；有 body 的 API 僅接受 JSON，無效 JSON 為 400、超過 1 MiB 為 413、非支援媒體類型為 415。

契約與文件同步更新：新增 procedure 時在模組的純 API 契約使用共用 schemas，在 Controller 使用 `@Implement` 與獨立權限，並將領域 `Result` 交給 `unwrapResult`。新模組可用 `npm run make:module <module_name>` 建立，產生器包含空 API 契約而不建立 DTO。版本固定使用穩定的 oRPC 1.15.5 與 Valibot 1.5.0，參考 [oRPC v1 NestJS 整合](https://v1.orpc.dev/docs/openapi/integrations/implement-contract-in-nest) 及 [Valibot 整合](https://v1.orpc.dev/docs/integrations/valibot)，避免混用 beta API。

前後端必須使用同一版本的 API 契約一起發版；此次遷移不變更資料表，不需要資料 migration。

---

## English Overview

FlashERP is a high-reliability, modular-monolith ERP engineered with **NestJS 11**, **oRPC 1.15.5**, **Valibot 1.5.0**, **Svelte 5**, **TypeORM**, and **PostgreSQL 16**.

### Key Architectural Strengths:

- **Batteries-Included & Clean Slate**: Starts clean without mock transactional clutter, ready for actual business accounting.
- **Odoo-style Extensible Addons**: Modular manifests (`ModuleManifest`), topological dependency resolution (`AddonRegistry`), dynamic custom fields (JSONB), and lifecycle extension hooks.
- **ACID Everywhere**: Cross-module calls run inside single database transactions with automatic propagation via `runInTransaction`.
- **Shared API Contracts**: Browser-safe oRPC/Valibot definitions drive runtime validation, inferred frontend types, and OpenAPI documentation; NestJS keeps DI, guards, and request lifecycle.
- **Property-Based Testing**: Validated by `fast-check` with >= 1,000 iterations per algorithmic invariant.

---

## 📜 授權協議 (License)

本專案採用 **[Apache License 2.0](LICENSE)** 開源授權協議。商業友好，允許自由商用、客製與二次開發。
