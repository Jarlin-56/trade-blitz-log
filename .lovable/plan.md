# รีวิวเว็บปัจจุบัน + แผนพัฒนาขั้นต่อไป

## สรุปภาพรวม
แอปอยู่ในเกณฑ์ "ใช้งานจริงได้แล้ว" ครบวงจร: บันทึกไม้ → แก้ไข → ค้นหา/กรอง → Export CSV → วิเคราะห์ (Dashboard/Insights/Calendar) → ฝึกวินัย (Recap Quiz, Streak) → Quick Notes + PWA + Landing page ฟีเจอร์แน่นกว่า journal ทั่วไปในตลาด

## จุดที่ดี
- แยกข้อมูลตามโปรไฟล์ครบทุกหน้าหลัก (Dashboard, Trades, Calendar, Notes, Quiz)
- RLS เปิดครบทุกตาราง นโยบายผูกกับ auth.uid()
- ฟอร์ม Trade ใช้คอมโพเนนต์เดียวทั้งสร้าง/แก้ไข ลดโอกาสข้อมูลไม่ตรงกัน
- Recap Quiz + สถิติราย condition เป็นจุดขายที่หาไม่ได้ทั่วไป
- โครงมือถือดี: bottom nav fixed, safe-area, PWA manifest

## จุดที่ควรแก้ (พบจากการตรวจจริง)
1. **Security: storage bucket `trade-images` เป็น public + policy SELECT กว้าง** — linter เตือนว่าใครก็ list ไฟล์ในบักเก็ตได้ รูปชาร์ตของผู้ใช้ทุกคนจึงเปิดสาธารณะ ควรเปลี่ยนเป็น private + signed URL
2. **ลบไม้/โน้ตแล้วรูปยังค้างใน storage** — ไม่มีการลบไฟล์ตาม ทำให้พื้นที่โตเรื่อยๆ
3. **Metadata โซเชียลยังเป็นค่า default** — og:description = "Lovable Generated Project"
4. **ลบโปรไฟล์ยังลบไม่หมด** — ลบ trades + profile แต่ quick_notes / quiz attempts / condition results ของโปรไฟล์นั้นยังค้าง (กลายเป็นข้อมูลกำพร้าที่ไปโผล่ในสถิติรวม)
5. **ยังไม่มี Google login** — สมัครด้วยอีเมลอย่างเดียว ทำให้ผู้ใช้ใหม่หลุดตั้งแต่หน้าแรก
6. **ไม่มี Import CSV** — export ได้แต่นำเข้าไม่ได้ ย้ายข้อมูลเข้ามาไม่ได้
7. **หน้าใหญ่เกินไป** — Trades.tsx 567 บรรทัด, Dashboard.tsx 489 บรรทัด แก้ยาก เสี่ยงพังเวลาแก้ทีหลัง

## แผนพัฒนา 3 ระยะ

### ระยะ 1 — ความปลอดภัย & ความสะอาดข้อมูล (ควรทำก่อน)
- เปลี่ยน `trade-images` เป็น private bucket + อ่านผ่าน signed URL ทุกจุดที่แสดงรูป
- ลบไฟล์รูปใน storage เมื่อลบไม้ / โน้ต / เปลี่ยนรูป
- ลบโปรไฟล์ให้ลบข้อมูลลูกครบทุกตาราง
- อัปเดต og/twitter metadata ให้ตรงกับแอปจริง

### ระยะ 2 — ลดแรงเสียดทานผู้ใช้
- เพิ่ม Google sign-in (พร้อมตั้งค่า provider)
- Import CSV: อัปโหลดไฟล์ → แม็ปคอลัมน์ → พรีวิว → บันทึกเข้าโปรไฟล์ปัจจุบัน
- Trades: จำค่าฟิลเตอร์/การเรียงล่าสุดไว้ เปิดหน้ามาไม่ต้องตั้งใหม่

### ระยะ 3 — คุณภาพโค้ดและการวิเคราะห์เชิงลึก
- แตก Trades / Dashboard เป็นคอมโพเนนต์ย่อย + ย้ายลอจิกคำนวณไปไว้ใน hook แยก
- เพิ่ม goal/target รายเดือน (เป้า R ต่อเดือน + แถบความคืบหน้า)
- รายงานสรุปรายสัปดาห์/เดือน ส่งออกเป็นภาพหรือ PDF ได้

## รายละเอียดทางเทคนิค
- Storage: `ALTER` bucket เป็น private, แทน `getPublicUrl` ด้วย `createSignedUrl` ใน `TradeForm.tsx`, `TradeDetail.tsx`, `QuickNoteDialog.tsx`, `Notes.tsx`, `RecapQuiz.tsx`
- ลบไฟล์: ดึง path จาก URL แล้ว `storage.from('trade-images').remove([...])` ก่อน delete row
- ลบโปรไฟล์: เพิ่มการลบ `quick_notes`, `recap_quiz_attempts`, `recap_quiz_condition_results` ตาม `profile_id` ใน `Profile.tsx` (หรือเพิ่ม FK on delete cascade ผ่าน migration ซึ่งปลอดภัยกว่า)
- Google auth: `signInWithOAuth` + `redirectTo: window.location.origin` และตั้งค่า provider ในเทิร์นเดียวกัน
- Import CSV: parser ฝั่ง client, ตรวจค่า enum `trade_direction` / `trade_result`, insert เป็นแบตช์
