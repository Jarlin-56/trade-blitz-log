import { Link } from 'react-router-dom';
import { TrendingUp, Target, Brain, ListChecks, StickyNote, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const features = [
  { icon: Target, title: 'คิดเป็น R ไม่ใช่เงิน', desc: 'บันทึกผลเป็น R-multiple ทั้ง R ที่ได้และ R ที่พลาด โฟกัสคุณภาพการตัดสินใจแทนตัวเลขกำไร' },
  { icon: ListChecks, title: 'Checklist วินัย', desc: 'ตั้งเงื่อนไขเข้าไม้ของตัวเอง ติ๊กทุกครั้งที่บันทึก แล้วดูว่าเงื่อนไขไหนให้ R เฉลี่ยสูงสุด' },
  { icon: Brain, title: 'Recap Quiz', desc: 'สุ่มไม้เก่ามาเป็นข้อสอบ ทายว่าจะเข้าไหม ทิศทางอะไร เงื่อนไขไหนครบ แล้วเทียบกับของจริง' },
  { icon: StickyNote, title: 'Quick Note', desc: 'ระหว่างเทรดอยู่บนแพลตฟอร์มอื่น แปะรูปกับโน้ตไว้ก่อน ค่อยกลับมาแปลงเป็นไม้เต็มทีหลัง' },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-4 py-4 md:px-8">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <span className="block text-base font-bold text-gradient-primary font-mono tracking-tight">TradeLog</span>
            <span className="block text-[10px] text-muted-foreground tracking-wide">R-MULTIPLE JOURNAL</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm"><Link to="/login">เข้าสู่ระบบ</Link></Button>
          <Button asChild size="sm" className="rounded-xl"><Link to="/register">สมัครฟรี</Link></Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-20 md:px-8">
        <section className="py-14 md:py-24 text-center animate-fade-up">
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight leading-tight">
            Journal ที่วัดผลเป็น <span className="text-gradient-primary">R</span>
            <br className="hidden sm:block" /> ไม่ใช่แค่กำไรขาดทุน
          </h1>
          <p className="mt-4 text-sm md:text-base text-muted-foreground max-w-xl mx-auto leading-relaxed">
            บันทึกไม้หลังเทรดในไม่กี่วินาที ติ๊ก checklist ของตัวเอง แล้วให้ระบบบอกว่าเงื่อนไขไหนทำเงิน
            ช่วงเวลาไหนคุณมักพลาด และวินัยคุณดีขึ้นหรือแย่ลง
          </p>
          <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg" className="w-full sm:w-auto rounded-xl gap-2 shadow-lg shadow-primary/20">
              <Link to="/register">เริ่มบันทึกไม้แรก <ArrowRight className="h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto rounded-xl">
              <Link to="/login">มีบัญชีแล้ว</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          {features.map(f => (
            <div key={f.title} className="glass-card p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 mb-3">
                <f.icon className="h-4.5 w-4.5 text-primary" />
              </div>
              <h2 className="text-sm font-semibold mb-1.5">{f.title}</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </section>

        <section className="glass-card mt-6 p-6 text-center">
          <h2 className="text-lg font-bold">พร้อมเลิกเทรดแบบเดาแล้วหรือยัง</h2>
          <p className="mt-1.5 text-xs text-muted-foreground">ใช้งานฟรี ไม่ต้องผูกบัตร เริ่มได้ในหนึ่งนาที</p>
          <Button asChild className="mt-4 rounded-xl gap-2">
            <Link to="/register">สมัครฟรี <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </section>
      </main>

      <footer className="border-t border-white/5 py-6 text-center text-[11px] text-muted-foreground">
        TradeLog — R-Multiple Trading Journal
      </footer>
    </div>
  );
}
