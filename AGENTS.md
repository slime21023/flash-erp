# FlashERP — AI Agent & Developer Architecture Guidelines (AGENTS.md)

本文件是 **FlashERP** 的核心架構與工程指南。所有參與本專案的 AI 代理人（Agents）與人類工程師，在生成、修改或審查任何程式碼前，**必須嚴格遵守本文所規定的架構邊界、編程風格與品質規範**。

---

## 1. 專案願景與核心架構（Overview & Philosophy）

- **系統定位**：專為單一企業設計的高可靠企業資源規劃系統（ERP），無多租戶（Multi-Tenancy）包袱，專注於組織內部複雜業務流程（多公司、多廠區、多倉儲、複雜簽核）。
- **核心技術棧**：
  - **Runtime / Framework**：Node.js + **NestJS 11+**（純 ESM、全 TypeScript、模組化 DI）。
  - **Database & ORM**：PostgreSQL + **TypeORM**（強型別交易管理）。
  - **輸入驗證**：**class-validator** + `ValidationPipe`。
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
│   │   ├── http/                       # 邊界適配器：ResultPresenter
│   │   └── testing/                    # PBT 專用領域生成器倉庫（fast-check Arbitraries）
│   │
│   └── modules/                        # 【業務領域模組】高內聚的領域邊界
│       ├── [module_name]/              # 例：sales, inventory, finance, organization, rbac
│       │   ├── contracts/              # 【唯一對外公開層】抽象類別 (Abstract Class)、DTO、DomainError
│       │   ├── services/               # 模組私有用例 (Use Cases)
│       │   ├── entities/               # 模組私有 TypeORM Entities
│       │   ├── controllers/            # HTTP 控制器
│       │   ├── dto/                    # class-validator 輸入 DTO
│       │   ├── events/                 # 領域事件 (Domain Events)
│       │   ├── listeners/              # 外部事件監聽器
│       │   └── manifest.ts              # 模組自描述清單
│
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
   import { InventoryContract } from '#modules/inventory/contracts/inventory.contract'
   ```
2. **非同步通知**：先將領域事件寫入 transactional outbox，再由 EventEmitter dispatcher 發布；其他模組的 `listeners/` 進行監聽。
3. **資料庫交易共享**：跨模組事務必須由發起方建立 `db.transaction()`，並將 `{ client: trx }` 顯式傳入所有受影響的模組契約中。

---

## 4. 編程風格：函數式核心與鐵路導向設計（FP & ROP）

### 4.1. 錯誤處理：`Result<T, E>` 作為第一等公民

所有領域用例（Use Cases）與跨模組合約方法，回傳型別必須宣告為 `Promise<Result<T, E>>`。

```typescript
// 定義明確的領域錯誤
export class InsufficientStockError extends DomainError {
  readonly code = 'INSUFFICIENT_STOCK'
  constructor(
    public sku: string,
    public requested: number,
    public available: number
  ) {
    super()
  }
  readonly message = `SKU: ${this.sku} 庫存不足（需求: ${this.requested}，可用: ${this.available}）`
}

// 業務 Service 採用鐵路鏈式串接 (Railway-Oriented Programming)
export class SalesOrderService {
  async approveOrder(orderId: string): Promise<Result<ApprovedOrder, OrderApprovalError>> {
    const order = await this.orderRepo.find(orderId)
    if (!order) return err(new OrderNotFoundError(orderId))

    return order
      .ensureCanApprove()
      .andThen((o) => this.creditLimitCheck(o))
      .andThen(async (o) => {
        const reserveRes = await this.inventoryContract.reserve(o.items)
        return reserveRes.map(() => o)
      })
      .andThen(async (o) => {
        const saved = await this.orderRepo.saveApproved(o)
        return ok(saved)
      })
  }
}
```

### 4.2. 邊界適配：Controller 不寫業務 try-catch

Controller 只負責：接收參數 -> `ValidationPipe` 驗證 DTO -> 呼叫 Service -> 透過 `ResultPresenter` 映射為 HTTP 回應。

```typescript
// src/modules/sales/controllers/sales.controller.ts
@Controller('sales')
export class SalesController {
  constructor(private readonly salesOrderService: SalesOrderService) {}

  @Post('orders/:id/approve')
  async approve(@Param('id') id: string, @Res() response: Response) {
    const result = await this.salesOrderService.approveOrder(id)
    return ResultPresenter.handle(response, result)
  }
}
```

### 4.3. 領域值物件不可變性（Immutability）

- `Money`、`Quantity`、`DateRange` 必須為不可變值物件。
- 所有運算必須返回全新實例，禁止原地修改屬性。

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

---

## 7. AI Agent 實作檢查清單（Pre-flight Checklist）

在提交任何程式碼或回應前，請自行檢核：

- [ ] 跨模組呼叫是否**只依賴**了目標模組的 `contracts/`？
- [ ] 跨模組契約是否使用 `abstract class` 作為 IoC Injection Token？
- [ ] 所有業務錯誤是否以 `Result.err(new DomainError())` 回傳，而非 `throw`？
- [ ] 金額與數量運算是否使用了 `platform/kernel` 的不可變值物件？
- [ ] 新增的核心演算法是否補齊了基於 `fast-check` 的性質測試（PBT）？
- [ ] Controller 中是否乾淨無業務 `try-catch`，並交由 `ResultPresenter` 處理？
