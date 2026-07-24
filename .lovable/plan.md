
## เป้าหมาย
ทำให้จดบันทึกไอเดียเทรดได้เร็วโดยไม่ต้องเปิดเว็บใหม่ทุกครั้ง — ติดเป็นแอปบนหน้าโฮมได้ทั้งมือถือ/คอม และมีปุ่ม Quick Note ลอยอยู่ทุกหน้า เก็บโน้ตไว้ก่อน ค่อยกดแปลงเป็นเทรดจริงทีหลัง

## ส่วนที่ 1 — ติดแอปเป็น PWA
- เพิ่ม `public/manifest.webmanifest` (ชื่อแอป, theme #22c55e, bg #111319, `display: standalone`, ไอคอน 192/512)
- สร้างไอคอนแอปด้วย imagegen (โลโก้ธีมเขียว/เข้ม) ใส่ `public/`
- เพิ่ม `<link rel="manifest">`, `theme-color`, `apple-touch-icon` ใน `index.html`
- ไม่ทำ offline / service worker (ตามที่คุณต้องการ — แค่ติดหน้าจอพอ)
- ผลลัพธ์: Android กด "Add to Home Screen", iOS ผ่าน Safari Share → Add to Home Screen, Chrome desktop มีไอคอน install บน address bar

## ส่วนที่ 2 — ปุ่ม Quick Note ลอย (FAB)
- เพิ่ม FAB มุมขวาล่างใน `AppLayout` (โชว์ทุกหน้าที่ล็อกอินแล้ว, ซ่อนตอนอยู่หน้า TradeNew/Login)
- ไอคอนสมุด+บวก, มี badge เลข note ที่ยังไม่แปลงเป็นเทรด
- กดแล้วเปิด Dialog/Sheet (Dialog บนคอม, Sheet บนมือถือแบบเดียวกับที่ทำ Insights)

## ส่วนที่ 3 — ฟอร์ม Quick Note
ฟิลด์ในป๊อปอัพ:
- Asset (text, optional)
- ทิศ: Long / Short / — (toggle)
- โน้ต (textarea)
- แนบรูป: ปุ่มเดียวรวม 2 ทาง
  - "เลือกไฟล์" (`<input type="file" accept="image/*">` — บนมือถือเรียกกล้อง/แกลเลอรี, บนคอมเลือกไฟล์)
  - "วางจาก clipboard" (Ctrl/Cmd+V หรือปุ่ม Paste — สำหรับ screenshot ที่แคปไว้)
- ปุ่ม บันทึก / ยกเลิก

## ส่วนที่ 4 — หน้ารายการ Quick Notes
- แท็บใหม่ในป๊อปอัพเดียวกัน: "โน้ตใหม่" / "รายการ (n)"
- แสดง card: รูป (ถ้ามี) + asset + ทิศ + โน้ต + เวลา
- แต่ละใบมี 2 ปุ่ม:
  - **สร้างเทรด** → นำทางไป `/trades/new` พร้อม prefill (asset, ทิศ, แนบภาพ, โน้ตเป็น recap_text) ผ่าน location state
  - **ลบ**
- เมื่อสร้างเทรดสำเร็จ (ตรวจ id ที่คืนจาก insert) มาร์กโน้ตเป็น converted และลบออกจากรายการค้าง

## ส่วนที่ 5 — Backend
ตารางใหม่ `quick_notes`:
- `id uuid pk`, `user_id uuid`, `profile_id uuid`, `asset text`, `direction text check in (Long,Short)`, `note text`, `image_url text`, `converted_trade_id uuid null`, `created_at timestamptz`
- GRANT ให้ authenticated + service_role
- RLS: owner (`auth.uid() = user_id`) select/insert/update/delete ของตัวเอง
- ใช้ bucket เดิม `trade-images` (public อยู่แล้ว) เก็บภาพในโฟลเดอร์ `quick-notes/<user_id>/...`

## ส่วนที่ 6 — Prefill หน้าสร้างเทรด
- แก้ `TradeNew.tsx` ให้อ่าน `location.state.prefill` (asset, direction, note, image_url) แล้ว set ค่า default
- หลังบันทึกเทรดสำเร็จ ถ้ามี `location.state.quickNoteId` ให้ update `quick_notes.converted_trade_id`

## รายละเอียดทางเทคนิค
- ใช้ Dialog + Sheet เดียวกันกับ Insights (responsive)
- Query key: `['quick_notes', user.id, profile.id]` invalidate หลัง insert/update/delete
- ปุ่ม FAB ใช้ z-50, `bottom-4 right-4`, ขนาด 56px วงกลม, primary color + shadow-glow
- Paste image: listener `onPaste` บน dialog อ่าน `clipboardData.items` filter image
- ไม่แตะ `client.ts`, `types.ts`, `config.toml`

## สิ่งที่ไม่ทำในรอบนี้
- Offline mode / service worker
- Chrome extension / Share Target API (ค่อยเพิ่มถ้าจำเป็น)
- AI แปลงโน้ตอัตโนมัติ

## ไฟล์ที่แตะ
- ใหม่: `public/manifest.webmanifest`, `public/icon-192.png`, `public/icon-512.png`, `src/components/QuickNoteFab.tsx`, `src/components/QuickNoteDialog.tsx`, `supabase/migrations/<new>.sql`
- แก้: `index.html`, `src/components/AppLayout.tsx`, `src/pages/TradeNew.tsx`
