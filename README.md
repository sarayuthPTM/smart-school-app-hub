# ระบบศูนย์รวมเว็บแอปพลิเคชัน (Smart School Web App Hub)

ศูนย์รวมระบบสารสนเทศและเว็บแอปพลิเคชันของสถานศึกษา (Teacher & Staff Portal + Admin & Analytics Dashboard)  
สถาปัตยกรรมความเร็วสูง: **Vercel Edge (GitHub Auto-Deploy) + Tailwind CSS + Google Apps Script JSON API + Google Sheets Database**

---

## 🔗 ข้อมูลการเชื่อมต่อระบบ (Deployment & Backend API)

* **Google Apps Script ID:** `14kF1VvA5LiP7nKApgv_4LmISxpWtlpkYYYt4cQkdjB6rZr3M1rPXA5vc`
* **Deployment ID:** `AKfycbxSLuieqBt7QCTbd_WCZtSyy0JT-0GuAQSIqTgdsO2iuHcAJd0MCI6zPGRMFWuqD2_xGw`
* **GAS JSON API & Web App URL:** `https://script.google.com/macros/s/AKfycbxSLuieqBt7QCTbd_WCZtSyy0JT-0GuAQSIqTgdsO2iuHcAJd0MCI6zPGRMFWuqD2_xGw/exec`

---

## ⚡ ทำไมเวอร์ชัน Vercel จึงเร็วกว่าเดิมมาก?

1. **Vercel Edge CDN:** หน้าเว็บ `index.html` โหลดตรงจากเซิร์ฟเวอร์ Vercel โดยไม่มี Google Iframe 2 ชั้นและ Caja Sanitizer ถ่วงเวลา
2. **Instant Cache-First Rendering:** แสดงผลจาก Local Cache ได้ทันที (~0ms) แล้วซิงค์ข้อมูลล่าสุดจาก Google Sheet แบบ Background
3. **Server-Side RAM Cache (`CacheService`):** Backend `Code.gs` เก็บแคชข้อมูลสาธารณะใน RAM ทำให้การดึงข้อมูลเร็วขึ้นหลายเท่า และยังคงความปลอดภัยของรหัส `admin_pin` / `app_lock_pin` ด้วย `adminToken`

---

## 📁 โครงสร้างไฟล์

```text
ระบบศูนย์รวมเว็บแอปพลิเคชัน/
├── index.html           # หน้าเว็บหลัก (รองรับทั้ง Vercel Standalone และ GAS Iframe)
├── vercel.json          # การตั้งค่า Static Hosting, UTF-8 Headers และ SPA Rewrite
├── package.json         # คำสั่งทดสอบบนเครื่อง (npm run dev)
├── Code.gs              # Google Apps Script JSON API (doGet/doPost) + Google Sheets DB
├── appsscript.json      # GAS Manifest
├── .clasp.json          # คอนฟิก Clasp สำหรับอัปโหลด Code.gs
├── .gitignore           # ไฟล์ที่ไม่นำขึ้น GitHub
└── README.md            # คู่มือระบบ
```

---

## 🚀 ขั้นตอนการเชื่อม GitHub และ Deploy ขึ้น Vercel

1. สร้าง Repository ใหม่บน GitHub (เช่น `smart-school-app-hub`)
2. Push โค้ดจากโฟลเดอร์นี้ขึ้น GitHub:
   ```bash
   git remote add origin https://github.com/sarayuthPTM/smart-school-app-hub.git
   git branch -M main
   git push -u origin main
   ```
3. เข้าเว็บไซต์ [Vercel](https://vercel.com) → **Add New Project** → เลือก Import Repository `smart-school-app-hub` → กด **Deploy** (ไม่ต้องตั้งค่า Build Command เพราะ `vercel.json` ตั้งค่าไว้ให้เรียบร้อยแล้ว)

---

## 🛠️ คำสั่งอัปเดต Backend บน Google Apps Script (หากมีการแก้ `Code.gs`)

```bash
npx @google/clasp push --force
npx @google/clasp deploy -i AKfycbxSLuieqBt7QCTbd_WCZtSyy0JT-0GuAQSIqTgdsO2iuHcAJd0MCI6zPGRMFWuqD2_xGw -d "อัปเดตระบบ"
```
