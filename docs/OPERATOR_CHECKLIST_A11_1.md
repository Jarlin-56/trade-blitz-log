# คู่มือและ Checklist: การทดสอบ Interactive Capture ผ่านบัญชี Windows Standard User (A11.1-R2)

เอกสารนี้ระบุขั้นตอนการเตรียมสภาพแวดล้อมและรัน Interactive Capture Validation บนเครื่อง Windows Home Single Language โดยใช้บัญชี **Windows Standard User แยกต่างหาก** เพื่อป้องกันผลกระทบต่อ Registry (`HKCU`), Custom Protocol (`trade-blitz-log`), และข้อมูลของ Operator บนบัญชีหลัก

---

## 1. เหตุผลและความปลอดภัยด้าน Isolation
* `electron/main.ts` เรียก `app.setAsDefaultProtocolClient('trade-blitz-log')` ตอนเปิด packaged executable ซึ่งจะเขียนลง `HKCU\Software\Classes\trade-blitz-log`
* บัญชี Windows Standard User ตัวใหม่จะมี Registry hive (`HKCU`) และ `%LOCALAPPDATA%` แยกอิสระโดยสมบูรณ์
* **ข้อดี**: ไม่ต้องแก้โค้ด production, ไม่ต้องใช้ VM/Sandbox, และไม่กระทบแอปที่ Operator ใช้อยู่

---

## 2. สิ่งที่ Operator ต้องจัดเตรียมล่วงหน้า

### 2.1 สร้างบัญชี Windows Local Standard User (ทำครั้งเดียว)
1. ไปที่ Windows **Settings** > **Accounts** > **Other users** > **Add account**
2. เลือก *"I don't have this person's sign-in information"* > *"Add a user without a Microsoft account"*
3. ตั้งชื่อบัญชี เช่น `tradelog-test` และกำหนดรหัสผ่าน
4. **ห้ามปรับเป็น Administrator** ให้คงสิทธิ์เป็น **Standard User**
5. Sign in เข้าบัญชี `tradelog-test` หนึ่งครั้งเพื่อให้ Windows สร้าง Profile Folder แล้ว Sign out กลับมาบัญชีหลัก

### 2.2 Node.js Runtime & Dependencies
* เครื่องต้องมี Node.js ติดตั้งแบบ System-wide (เช่น `C:\Program Files\nodejs`) ซึ่งทุกบัญชีสามารถเรียกใช้ `node` ได้
* ตรวจสอบใน Command Prompt หรือ PowerShell: `node -v` (แนะนำ v20 หรือ v22)

---

## 3. การเตรียมไฟล์สำหรับบัญชีทดสอบ (Zero Secrets)

ให้ Operator จัดเตรียมโฟลเดอร์สำหรับแชร์ที่ Standard User สามารถอ่าน/เขียนได้ เช่น `C:\Users\Public\TradeLogValidation`

### 3.1 ไฟล์และโฟลเดอร์ที่ต้องคัดลอกมา:
1. `release-staging/win-unpacked/` -> `C:\Users\Public\TradeLogValidation\win-unpacked\`
2. `test-fixtures/staging-ui-config.json` -> `C:\Users\Public\TradeLogValidation\staging-ui-config.json`  
   *(ยืนยันว่ามีเฉพาะ `project_ref` และ `supabase_url` **ไม่มี** database password หรือ service role key)*
3. `scripts/interactive-capture-harness.mjs` -> `C:\Users\Public\TradeLogValidation\scripts\interactive-capture-harness.mjs`
4. `scripts/staging-utils.mjs` -> `C:\Users\Public\TradeLogValidation\scripts\staging-utils.mjs`
5. `node_modules/` -> `C:\Users\Public\TradeLogValidation\node_modules\`

> [!CAUTION]
> **ห้ามคัดลอก** `staging-config.json` ที่มี `db_password` หรือ `service_role_key` ไปยังโฟลเดอร์แชร์หรือบัญชีทดสอบเด็ดขาด

---

## 4. คำสั่งรันการทดสอบ (Copy/Paste Commands)

### ขั้นตอนการรัน:
1. สลับไปล็อกอินที่บัญชี `tradelog-test`
2. เปิด PowerShell แล้วรันคำสั่ง:

```powershell
cd C:\Users\Public\TradeLogValidation

# รัน Harness สำหรับ Interactive Capture
node scripts/interactive-capture-harness.mjs `
  --executable "win-unpacked\Trade Log.exe" `
  --config "staging-ui-config.json" `
  --output "test-results\interactive-capture-report.json"
```

---

## 5. ตาราง Checklist การทดสอบที่ Operator ต้องปฏิบัติ

| ลำดับ | รายการทดสอบ | การกระทำของ Operator | เกณฑ์ตัดสินของ Harness | ผลที่ต้องยืนยัน |
| :---: | :--- | :--- | :--- | :---: |
| **1** | **Round 1: Crop Box 1** | โฟกัสหน้าต่างอื่น กด `Ctrl+Shift+X` ลากกรอบรอบ Box 1 ใน Grid | ตรวจ preview แนบใน widget, ไม่ดำ, ปิด crop window | ตอบ `y` เมื่อรูปตรง |
| **2** | **Scoped Deletion** | กดปุ่ม `X` ในกล่อง Screenshot attached | Preview ถูกลบและ detached จาก DOM ทันที | Harness ตรวจอัตโนมัติ |
| **3** | **Round 2: Crop Box 2** | กด `Ctrl+Shift+X` ลากกรอบรอบ Box 2 ใน Grid | มี capture event ใหม่, preview แนบ, ไม่ดำ, ปิด crop window | ตอบ `y` เมื่อรูปตรง |
| **4** | **Round 3: Crop Box 3** | กด `Ctrl+Shift+X` ลากกรอบรอบ Box 3 ใน Grid | มี capture event ใหม่, preview แนบ, ไม่ดำ, ปิด crop window | ตอบ `y` เมื่อรูปตรง |
| **5** | **Cancel: Escape Key** | กด `Ctrl+Shift+X` รอ crop window เปิดขึ้นมา แล้วกดปุ่ม `Escape` | สังเกต crop window เปิดแล้วปิดสนิท ไม่ค้าง | Harness ตรวจ window lifecycle |
| **6** | **Cancel: Micro-drag** | กด `Ctrl+Shift+X` รอ crop window เปิด แล้วคลิกเมาส์ 1 ครั้ง (<10px) | สังเกต crop window เปิดแล้วปิดสนิท ไม่ค้าง | Harness ตรวจ window lifecycle |
| **7** | **Widget Restore** | สังเกต Quick Note Widget หลัง cancel | คืนสถานะ AlwaysOnTop/Visibility ตามเดิม | Harness ตรวจอัตโนมัติ |
| **8** | **Clipboard Paste** | Copy รูปใดก็ได้เข้า Clipboard แล้วกด `Ctrl+V` ใน Widget | Preview แสดงรูปที่ copy เข้าฟอร์ม | ตอบ `y` เมื่อรูปตรง |

---

## 6. เกณฑ์การสรุปผลและ Exit Codes

* **`PASSED` (Exit code 0)**:
  * ครบทั้ง 3 รอบ capture โดยไม่มีภาพดำ และไม่มี crop window ค้าง
  * Operator ยืนยันความถูกต้องของภาพครบทุกรอบ (`y`)
  * Cancel tests (Escape, Micro-drag, Widget Restore) ตรวจพบการเปิดและปิดสมบูรณ์
  * Clipboard paste แนบภาพสำเร็จและ Operator ยืนยันตรงกัน
* **`FAILED` (Exit code 1)**:
  * ภาพดำ (>95% black pixels)
  * หน้าต่าง crop window รั่ว/ค้างหลังจบหรือ cancel
  * Crop window ไม่เคยเปิดขึ้นมาตอนทดสอบ cancel (`FAIL_CROP_NEVER_OPENED`)
  * Operator ปฏิเสธความถูกต้องของบริเวณภาพ (`n`)
  * Clipboard paste ไม่แนบภาพ หรือรูปผิด
* **`INCOMPLETE` (Exit code 2 — Nonzero)**:
  * มีรายการ required case ใดๆ ถูกข้ามหรือมีสถานะเป็น `NOT TESTED`
  * Capture ไม่ครบ 3 รอบ

---

## 7. การเก็บและส่งหลักฐานกลับ (Report Collection)

เมื่อการทดสอบเสร็จสิ้น (ไม่ว่าจะจบด้วยสถานะใด):
1. ตรวจสอบไฟล์ผลลัพธ์ที่:
   `C:\Users\Public\TradeLogValidation\test-results\interactive-capture-report.json`
2. คัดลอกไฟล์รายงานดังกล่าวกลับมาที่ไดเรกทอรีโปรเจกต์หลัก
3. ส่งไฟล์รายงานให้ Coordinator ตรวจสอบหลักฐานก่อนพิจารณาขั้นถัดไป
