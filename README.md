# R-Squared Journal

ช่วยสร้างเว็บตาม prd และ sitemap นี้ให้หน่อย:# Product Requirements Document (PRD)

**Project Name:** Lean Trading Journal (R-Multiple & Checklist Focused)

**Target Platform:** Web Application (Responsive Desktop & Mobile)

**Core Objective:** A lightning-fast, one-step post-trade journaling app. It focuses exclusively on completed trades, recording Risk-to-Reward (R-multiples), multi-select technical conditions (checklists), and qualitative reviews, completely eliminating the need for precise price logging or multi-phase tracking.



## 1. Product Overview & Core Philosophy

* **No Pre-trade Planning:** This app is strictly for logging trades *after* they are closed.

* **No Price Inputs:** Remove Entry, SL, and TP fields. Profitability is measured purely in R-multiples, not Dollar Net PnL.

* **Frictionless Entry:** A single-page vertical form to ensure logging takes less than 60 seconds.



## 2. Target Tech Stack

* **Frontend:** React / Next.js, Tailwind CSS.

* **UI Components:** Shadcn UI.

* **Backend/Database:** Supabase (PostgreSQL, Auth, Edge Storage).



## 3. Core Features & UX Flow



### 3.1. Authentication System

* Standard Email/Password Login & Registration.

* Session management with automatic redirects (unauthenticated users to `/login`, authenticated to `/dashboard`).



### 3.2. Single-Step Trade Entry Flow (`/trades/new`)

The UI should look like a clean, vertical Notion-style document.



* **Section 1: Trade Identity**

    * `Date/Time Picker`: Defaults to current time.

    * `Asset`: Text input or autocomplete (e.g., XAUUSD).

    * `Direction`: Toggle buttons (Long / Short).



* **Section 2: Outcome & R-Multiple (Automated Logic)**

    * `Result`: A radio group or 3 distinct buttons: **Win** (Green), **Loss** (Red), **Break-even** (Yellow).

    * `Earned R (Risk Multiple)`: A numeric input field driven by the `Result` selection:

        * If **Loss** is selected: Auto-fill `-1` and disable the input (read-only).

        * If **Break-even** is selected: Auto-fill `0` and disable the input (read-only).

        * If **Win** is selected: Clear the field, make it active, and require the user to input a positive number (e.g., 2, 1.5, 3).



* **Section 3: Strategy & Conditions (Multi-Select Checklist)**

    * Replace the traditional "single strategy dropdown" with a grid of checkboxes representing market conditions or system rules (e.g., IDM, QM, Dynamic BEP triggered).

    * Users can select multiple checkboxes to define exactly what conditions were present in this specific trade.



* **Section 4: Review & Media**

    * `Trade Recap & Lessons Learned`: A single, large rich-text or standard text area for all qualitative notes.

    * `Chart Image`: A single drag-and-drop zone to upload the final annotated chart.

    * `Tags`: Multi-select custom tags for emotional or contextual labeling (e.g., #FOMO, #FollowedPlan).



### 3.3. Interactive Analytics Dashboard (`/dashboard`)

* **Key Metrics:** Total R Earned, Win Rate (%), Total Trades.

* **Cumulative R Chart:** A line chart showing the growth of R-multiples over time (replacing the traditional PnL equity curve).

* **Checklist Performance:** A bar chart or table showing the Win Rate and Average R earned when specific checklist items (e.g., "QM") are ticked.



### 3.4. Configuration (`/settings`)

* **Conditions/Checklist Builder:** Ability to add, edit, or delete the global checklist items that appear in the trade entry form.

* **Tag Management:** CRUD operations for custom tags.



## 4. Updated Database Schema (Relational)



* **`users`** (Supabase Auth)

    * `id` (UUID, PK)

* **`conditions`** (Replaces 'setups', acts as the master list of checklist items)

    * `id` (UUID, PK)

    * `user_id` (FK -> users)

    * `name` (String, e.g., "QM", "IDM")

* **`trades`** (Simplified)

    * `id` (UUID, PK)

    * `user_id` (FK -> users)

    * `asset` (String)

    * `direction` (Enum: Long, Short)

    * `entry_date` (Timestamp)

    * `result` (Enum: Win, Loss, Break-even)

    * `earned_r` (Numeric/Decimal)

    * `recap_text` (Text)

    * `image_url` (String)

* **`trade_conditions`** (Many-to-Many mapping for the checklist)

    * `trade_id` (FK -> trades)

    * `condition_id` (FK -> conditions)

* **`tags`** & **`trade_tags`** (Standard many-to-many setup)



## 5. UI/UX Strict Guidelines

* **No Trade Status:** Trades are assumed closed upon entry. No 'Pending' or 'Active' states.

* **Clean Layout:** Group the input fields into clear visual cards (Trade Info, Outcome, Conditions, Recap).

# Application Sitemap

**Project Name:** Lean Trading Journal (R-Multiple & Checklist Focused)



## Public Routes (Unauthenticated)

* **`/` (Landing / Root)**

    * ทำหน้าที่เป็นตัวเช็คสถานะ (Auth Guard)

    * หาก Login แล้วให้ Redirect ไปที่ `/dashboard`

    * หากยังไม่ Login ให้ Redirect ไปที่ `/login`

* **`/login` (Login Page)**

    * หน้าจอเข้าสู่ระบบด้วย Email / Password

* **`/register` (Sign Up Page)**

    * หน้าจอสมัครสมาชิก



---



## Private Routes (Authenticated)

*(ทุกหน้าในหมวดนี้ต้องมีการเช็ค Supabase Session หากไม่มีให้เตะกลับไป `/login` ทันที)*



* **`/dashboard` (Analytics Dashboard)**

    * หน้าจอหลักแสดงภาพรวมประสิทธิภาพของระบบเทรด

    * แสดงตัวเลข Total R, Win Rate, Total Trades

    * แสดงกราฟ Cumulative R (Equity Curve แบบ R-Multiple)

    * แสดงสถิติประสิทธิภาพแยกตาม Conditions (เช่น เทรดที่มี IDM + QM มี Win Rate เท่าไหร่)



* **`/trades` (Trade History)**

    * หน้าตารางแสดงประวัติออเดอร์ทั้งหมดที่ถูกปิดและบันทึกแล้ว

    * สามารถ Filter ตาม Date, Result (Win/Loss/BE), และ Conditions ได้

    * **`/trades/new` (Log New Trade - Post-Trade Recap)**

        * **[Core Feature]** หน้าฟอร์มบันทึกออเดอร์แบบหน้าเดียวจบ (Single-page vertical form)

        * ประกอบด้วย Basic Info, ปุ่ม Result (Win/Loss/BE) ที่ผูกกับตัวเลข Earned R, Checkboxes สำหรับ Conditions, Text Area สำหรับ Recap, และ Image Dropzone

    * **`/trades/[id]` (Trade Detail)**

        * หน้าแสดงรายละเอียดของออเดอร์นั้นๆ แบบ Read-only (สามารถกด Edit หรือ Delete ได้จากหน้านี้)

        * แสดงภาพรวมว่าออเดอร์นี้ได้กี่ R, ติ๊ก Checklist ข้อไหนไปบ้าง พร้อมรูปกราฟและบันทึกข้อความ



* **`/settings` (Configuration & Management)**

    * หน้าจัดการตัวแปรต่างๆ ที่ใช้ในระบบ

    * **`/settings/conditions` (Conditions / Checklist Builder)**

        * แทนที่หน้า Strategies เดิม

        * หน้าสำหรับเพิ่ม/แก้ไข/ลบ Master Checklist Items (เช่น เพิ่มเงื่อนไข "IDM", "QM", "BOS", "Liquidity Sweep") เพื่อให้ไปโชว์เป็น Checkbox ในหน้า `/trades/new`

    * **`/settings/tags` (Tag Management)**

        * หน้าสำหรับจัดการ Custom Tags (เช่น `#FOMO`, `#ข่าว`)

    * **`/settings/profile` (User Profile)**

        * หน้าจัดการบัญชีผู้ใช้ (เปลี่ยนรหัสผ่าน, อัปเดตข้อมูล)



---



## UI/UX Navigation Logic

1. **Global "Log Trade" Action:** บน Topbar หรือ Sidebar ควรมีปุ่ม **"+ Log Trade"** ที่เห็นได้ชัดเจนเสมอ เพื่อให้ผู้ใช้กดเข้ามาที่ `/trades/new` ได้ทันทีจากทุกหน้า

2. **Dashboard Drill-down:** เมื่อผู้ใช้คลิกที่ข้อมูลบน Dashboard (เช่น คลิกแท่งกราฟของเงื่อนไข QM) ระบบควรพานาวิเกตไปที่หน้า `/trades` พร้อมกับใส่ Filter คำว่า "QM" ให้อัตโนมัติ

3. **No Active Trades:** เนื่องจากระบบนี้ตัด Trade Status ออกไป Navigation จึงไม่ต้องมีแท็บแยกสำหรับ "Active Orders" หรือ "Pending Orders" ทุกอย่างที่อยู่ใน `/trades` คือข้อมูลที่สมบูรณ์แล้ว


## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
