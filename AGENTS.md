# FlashERP — AI Agent & Developer Architecture Guidelines (AGENTS.md)

本文件是 **FlashERP** 的核心架構與工程指南。所有參與本專案的 AI 代理人（Agents）與人類工程師，在生成、修改或審查任何程式碼前，**必須嚴格遵守本文所規定的架構邊界、編程風格與品質規範**。

---

## 1. 專案願景與核心架構（Overview & Philosophy）

- **系統定位**：專為單一企業設計的高可靠企業資源規劃系統（ERP），無多租戶（Multi-Tenancy）包袱，專注於組織內部複雜業務流程（多公司、多廠區、多倉儲、複雜簽核）。
- **核心技術棧**：
  - **Runtime / Framework**：Node.js + **NestJS 11+**（純 ESM、全 TypeScript、模組化 DI）。
  - **Database & ORM**：PostgreSQL + **TypeORM**（強型別交易管理）。
  - **API 契約與驗證**：**oRPC 1.15.5** + **Valibot 1.5.0**，透過 `@orpc/nest` 實作 contract-first HTTP API。
  - **測試框架**：**Vitest** + **fast-check**（Property-Based Testing, PBT）。
- **架構風格**：**單體模組架構（Modular Monolith）**，拒絕過早微服務化帶來的分散式交易開銷，充分享受單一資料庫的 ACID 強一致性。

---

## 2. 目錄拓撲與層次職責

全專案目錄嚴格遵循以下劃分：

```text
FlashERP/
├── src/
│   ├── platform/                       # 【平台底座】無業務色彩的通用基底（嚴禁隨意命名為 shared）
│   │   ├── fp/                         # 函數式原語：Result<T, E>、DomainError
│   │   ├── kernel/                     # 不可變領域值物件：Money、Quantity、Decimal 等
│   │   ├── workflow/                   # 狀態機引擎、審批 Pipeline 引擎
│   │   ├── numbering/                  # 單據流水號產生器合約與實作
│   │   ├── http/                       # 純 API schemas、Result/oRPC 邊界適配器
│   │   └── testing/                    # PBT 專用領域生成器倉庫（fast-check Arbitraries）
│   │
│   └── modules/                        # 【業務領域模組】高內聚的領域邊界
│       ├── [module_name]/              # 例：sales, inventory, finance, organization, rbac
│       │   ├── contracts/              # 【唯一對外公開層】抽象 Contract、DomainError、*_api_contract.ts
│       │   ├── services/               # 模組私有用例 (Use Cases)
│       │   ├── entities/               # 模組私有 TypeORM Entities
│       │   ├── controllers/            # @Implement API 契約的 NestJS 控制器
│       │   ├── events/                 # 領域事件 (Domain Events)
│       │   ├── listeners/              # 外部事件監聽器
│       │   └── manifest.ts              # 模組自描述清單
│
├── src/api_contract.ts                 # 前後端共用的純 API 契約聚合入口
├── src/database/migrations/            # TypeORM 資料庫遷移檔
├── scripts/                             # 專案專屬 CLI 與品質檢查
└── tests/
    ├── unit/platform/                  # 平台元件之 PBT 性質測試（極度嚴格）
    └── unit/modules/                   # 業務模組用例與整合測試
```

---

## 3. 模組邊界防護與引用守則（Critical Guardrails）

作為 AI Agent，生成代碼時請將下列規則視為**不可踰越的紅線**：

### 🚫 絕對禁止（Strictly Forbidden）

1. **禁止跨模組直接引用內部私有實作**：
   - ❌ 嚴禁：`import { Inventory } from '#modules/inventory/models/inventory'` 在 Sales 模組中。
   - ❌ 嚴禁：`import { InventoryService } from '#modules/inventory/services/inventory_service'`。
2. **禁止建立 `shared/utils` 垃圾桶**：
   - 基礎能力一律歸屬到 `platform`，並有明確的職責領域。
3. **禁止在領域邏輯拋出業務異常**：
   - ❌ 嚴禁：`throw new InsufficientStockError()`。
4. **禁止使用預設的 全域 Ace 產生器**：
   - ❌ 嚴禁：使用未遵循模組拓撲的全域產生器；請使用 `npm run make:module` 或手動建立於 `src/modules/<module>`。

### ✅ 唯一允許的模組間交互方式

1. **同步呼叫**：只允許引用目標模組的 `contracts/` 目錄。透過 NestJS DI 注入抽象類別：
   ```typescript
   // 允許在 Sales 模組中引用
   import { InventoryContract } from '#modules/inventory/contracts/inventory_contract.js'
   ```
2. **非同步通知**：先將領域事件寫入 transactional outbox，再由 EventEmitter dispatcher 發布；其他模組的 `listeners/` 進行監聽。
3. **資料庫交易共享**：跨模組事務由發起方使用 `runInTransaction` 建立 TypeORM 交易，並將 `{ client: trx }` 顯式傳入所有受影響的模組契約中。
4. **API 與內部合約分離**：`contracts/index.ts` 提供伺服器內部抽象合約；`contracts/<module>_api_contract.ts` 提供瀏覽器可匯入的 oRPC/Valibot 契約。API 契約禁止匯入伺服器 barrel、NestJS、TypeORM、Node.js 模組與領域實作；只可依賴其他 API 契約、`platform/http/api_schemas.ts`、`system_api_contract.ts`、`@orpc/contract` 與 `valibot`。前端透過 `src/api_contract.ts` 使用契約，模組間仍透過 DI 呼叫內部合約。

---

## 4. 編程風格：函數式核心與鐵路導向設計（FP & ROP）

### 4.1. 錯誤處理：`Result<T, E>` 作為第一等公民

所有領域用例（Use Cases）與跨模組合約方法，回傳型別必須宣告為 `Promise<Result<T, E>>`。

```typescript
// 定義明確的領域錯誤
export class InsufficientStockError extends DomainError {
  readonly code = 'INSUFFICIENT_STOCK'
  constructor(
    readonly skuOrId: string,
    readonly requested: bigint,
    readonly available: bigint
  ) {
    super(`SKU: ${skuOrId} 庫存不足（需求: ${requested}，可用: ${available}）`)
  }
}

// 業務 Service 採用鐵路鏈式串接 (Railway-Oriented Programming)
export class SalesOrderService {
  async approveOrder(orderId: string): Promise<Result<ApprovedOrder, OrderApprovalError>> {
    const order = await this.orderRepo.find(orderId)
    if (!order) return err(new OrderNotFoundError(orderId))

    return order
      .ensureCanApprove()
      .andThen((o) => this.creditLimitCheck(o))
      .andThenAsync(async (o) => {
        const reserveRes = await this.inventoryContract.reserve(o.items)
        return reserveRes.andThenAsync(async () => {
          const saved = await this.orderRepo.saveApproved(o)
          return ok(saved)
        })
      })
  }
}
```

### 4.2. 邊界適配：Controller 不寫業務 try-catch

Controller 只負責：`@Implement` 宣告 procedure -> Valibot 驗證輸入 -> 呼叫抽象 Contract -> `unwrapResult` 序列化成功值或轉換領域錯誤 -> Valibot 驗證輸出。業務規則仍由 Service 以 `Result` 回傳；只有 API 邊界可拋出 `ORPCError`。

```typescript
// src/modules/sales/controllers/sales.controller.ts
import { Controller } from '@nestjs/common'
import { Implement, implement } from '@orpc/nest'
import { unwrapResult } from '@platform/http/result_adapter.js'
import { RequirePermission } from '@platform/security/index.js'
import { SalesContract } from '../contracts/index.js'
import { salesApiContract } from '../contracts/sales_api_contract.js'

@Controller()
export class SalesController {
  constructor(private readonly sales: SalesContract) {}

  @RequirePermission('sales.order.read')
  @Implement(salesApiContract.getSalesOrder)
  getSalesOrder() {
    return implement(salesApiContract.getSalesOrder).handler(async ({ input }) =>
      unwrapResult(await this.sales.getSalesOrder(input.id))
    )
  }
}
```

### 4.3. 領域值物件不可變性（Immutability）

- `Money`、`Quantity`、`DateRange` 必須為不可變值物件。
- 所有運算必須返回全新實例，禁止原地修改屬性。

### 4.4. API schema 與傳輸規範

- 每個 procedure 使用 Valibot `strictObject` 定義輸入與完整輸出 snapshot；型別由 schema 推導，不另寫重複 DTO 或前端回應 interface。
- 金額與數量以整數十進位字串傳輸，輸入驗證保留各欄位正負限制；API 邊界轉成 `bigint`／領域值物件，回應轉回字串。日期使用有效日曆日期 `YYYY-MM-DD`，時間戳輸出 UTC ISO 字串。
- 業務 API 路徑統一以 `/api` 開頭；每個 procedure 明確定義路徑、HTTP method、成功狀態與領域錯誤，建立操作通常為 201。
- Guard、Cookie／CSRF、組織作用域、request context 由 NestJS 保留；每個 procedure 都必須獨立宣告權限。未知錯誤與輸出驗證失敗對外回傳遮蔽後的 500。
- Svelte 前端使用共用 `OpenAPILink` client 與推導型別；401 清除本地 session，403 與業務錯誤保留 session。禁止儲存 access token。

---

## 5. 測試規範：以 Property-Based Testing (PBT) 守護底座

1. **`src/platform` 核心元件測試義務**：
   - 金額計算、尾差攤提、借貸平衡、狀態機轉換、流水號單調性，**強制使用 `fast-check` + Vitest 進行 PBT 測試**。
   - 每次 PBT 測試至少執行 1,000 次隨機樣本，覆蓋極端數值、巨大數值與邊界狀況。
2. **不變量範例（Invariants）**：
   - **金額攤提不變量**：$\sum \text{Allocated Amounts} \equiv \text{Original Total}$（無尾差遺漏）。
   - **複式簿記不變量**：$\sum \text{Debit} \equiv \sum \text{Credit}$；不平衡之分錄必定回傳 `Err`。
   - **狀態機不變量**：處於 `CLOSED` / `VOID` 之終態單據，任何動作皆不可轉出終態。
3. **業務模組測試**：
   - 外部依賴之 `contracts/` 一律在測試中進行 Mock 隔離，確保單純驗證該模組之用例邏輯。
4. **API 邊界測試**：
   - 透過 oRPC `call(controller.method(), input)` 測試 procedure 的輸入／輸出驗證、序列化及已宣告錯誤。
   - Cookie、CSRF、401／403、組織隔離與 NestJS Guard 必須以 HTTP 整合測試驗證；直接 procedure 呼叫不會執行 NestJS Guard。

---

## 6. CLI 工具與日常工作流（Agent Command Guidelines）

AI Agent 在需要建立新元件時，應遵守下列指令規範：

- **啟動開發伺服器**：
  ```bash
  npm run start:dev
  ```
- **執行資料庫 Migration**：
  ```bash
  npm run build && npm run start
  ```
- **生成標準模組（使用自訂指令）**：
  ```bash
  npm run make:module <module_name>
  ```
- **執行所有單元與 PBT 測試**：
  ```bash
  npm test
  ```
- **檢查模組邊界與 API 契約的瀏覽器匯入圖**：
  ```bash
  npm run architecture:check
  ```

---

## 7. AI Agent 實作檢查清單（Pre-flight Checklist）

在提交任何程式碼或回應前，請自行檢核：

- [ ] 跨模組呼叫是否**只依賴**了目標模組的 `contracts/`？
- [ ] 跨模組契約是否使用 `abstract class` 作為 IoC Injection Token？
- [ ] 所有業務錯誤是否以 `Result.err(new DomainError())` 回傳，而非 `throw`？
- [ ] 金額與數量運算是否使用了 `platform/kernel` 的不可變值物件？
- [ ] 新增的核心演算法是否補齊了基於 `fast-check` 的性質測試（PBT）？
- [ ] Controller 是否使用 `@Implement`、獨立權限與 `unwrapResult`，且無業務 `try-catch`？
- [ ] API 契約是否使用完整 Valibot schemas，且匯入圖未包含任何伺服器依賴？
