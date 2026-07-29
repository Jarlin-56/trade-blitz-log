## เป้าหมาย
อุดช่องว่างการใช้งานประจำวัน ให้ journal ใช้จริงได้ครบวงจร: บันทึก → แก้ไข → ค้นหา → เอาข้อมูลออก

---

## Phase 1 — ช่องว่างที่เจ็บที่สุด (ทำก่อน)

**1. แก้ไขไม้ที่บันทึกไปแล้ว**
ตอนนี้มีแค่หน้า `/trades/new` และ `/trades/:id` (ดู + ลบ) ไม่มีทางแก้ไม้ที่พิมพ์ผิดเลย ต้องลบแล้วบันทึกใหม่
- เพิ่ม route `/trades/:id/edit` ใช้ฟอร์มเดียวกับหน้าบันทึกใหม่ (แยกฟอร์มเป็น component ใช้ร่วมกัน)
- โหลดค่าเดิมทั้งหมด (asset, direction, วันเวลา, result, R, duration, recap, รูป, conditions, tags) แล้ว update
- ปุ่ม Edit ในหน้า Trade Detail

**2. หน้าจัดการ Quick Notes**
ตอนนี้สร้าง note ได้จาก FAB แต่ไม่มีที่ดูรายการทั้งหมด แก้ไข หรือลบ note ที่ไม่ได้ใช้
- หน้า `/notes`: รายการโน้ตที่ยังไม่ถูกแปลง + ที่แปลงแล้ว (แยก tab)
- แต่ละใบ: ดูรูป/ข้อความ, แก้ไข, ลบ, ปุ่ม "แปลงเป็นไม้"

**3. Export CSV**
- ปุ่ม Export ในหน้า Trades ส่งออกตามฟิลเตอร์ที่เลือกอยู่
- คอลัมน์: วันเวลา, asset, direction, result, earned R, missed R, duration, conditions, tags, recap

---

## Phase 2 — ค้นหาและมองเห็นข้อมูล

**4. ค้นหา + ฟิลเตอร์เพิ่มในหน้า Trades**
- ช่องค้นหา (asset / ข้อความใน recap)
- ฟิลเตอร์ตาม condition และ tag, เรียงตาม R / วันที่
- Pagination หรือ infinite scroll เมื่อไม้เยอะ

**5. เลือกหลายไม้พร้อมกัน (bulk)**
- ติ๊กเลือกหลายไม้ → ลบพร้อมกัน หรือเพิ่ม tag ทีเดียว

**6. เปรียบเทียบระหว่าง Profile**
ตอนนี้ดูได้ทีละ profile — เพิ่มมุมมองสรุปเทียบทุก profile (Total R, Win rate, จำนวนไม้)

---

## Phase 3 — วินัยและการใช้งานระยะยาว

**7. Streak / Discipline tracker**
- นับวันที่บันทึก journal ต่อเนื่อง, % ไม้ที่ติ๊ก checklist ครบ
- แสดงบน Dashboard เป็นแถบเล็ก ๆ

**8. Onboarding สำหรับผู้ใช้ใหม่**
- ผู้ใช้ใหม่ยังไม่มี conditions/tags เลย → wizard สั้น ๆ ให้ตั้ง condition ชุดแรก + สร้าง profile

**9. Landing page**
`/` ตอนนี้เป็นแค่ redirect — ทำหน้าแนะนำสั้น ๆ (จุดขาย: R-multiple, checklist, Recap Quiz) + ปุ่มสมัคร

**10. เก็บกวาดโค้ด**
- ลบไฟล์ `ConditionPerfChart.tsx` ที่ไม่ถูกใช้แล้ว
- ยกสไตล์หน้า TradeNew / TradeDetail ให้เป็น glass-card เหมือน Dashboard

---

## รายละเอียดทางเทคนิค
- **ไม่ต้องแก้ฐานข้อมูลเลยใน Phase 1–2** ตารางที่มีอยู่ (`trades`, `trade_conditions`, `trade_tags`, `quick_notes`) รองรับครบแล้ว
- Phase 3 ข้อ 7 ถ้าจะเก็บ streak แบบแม่นยำอาจต้องคำนวณจาก `trades.created_at` ฝั่ง client ก่อน (ไม่ต้องเพิ่มตาราง)
- Export CSV ทำฝั่ง client ล้วน (Blob download) ไม่ต้องมี edge function
- แยก `TradeForm` เป็น component เดียวใช้ทั้ง new/edit เพื่อไม่ให้ logic ซ้ำ

## เสนอให้เริ่ม
Phase 1 ทั้ง 3 ข้อในรอบเดียว — เป็นสิ่งที่กระทบการใช้งานประจำวันมากที่สุด