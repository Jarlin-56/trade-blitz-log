import { Link } from 'react-router-dom';
import { TrendingUp, Plus, BarChart3, Calendar, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  variant: 'dashboard' | 'trades' | 'calendar';
}

const configs = {
  dashboard: {
    icon: BarChart3,
    title: 'ยังไม่มีข้อมูลการเทรด',
    description: 'บันทึก trade แรกของคุณเพื่อเริ่มติดตาม performance และดูสถิติต่างๆ ที่นี่',
    tips: [
      { icon: TrendingUp, text: 'ติดตาม R-Multiple ทุกไม้' },
      { icon: BookOpen, text: 'วิเคราะห์ Win Rate & Profit Factor' },
      { icon: Calendar, text: 'ดูสถิติรายวัน รายสัปดาห์' },
    ],
  },
  trades: {
    icon: BookOpen,
    title: 'ยังไม่มี trade ในโปรไฟล์นี้',
    description: 'เริ่มบันทึก trade เพื่อสร้างประวัติการเทรดของคุณ',
    tips: [
      { icon: TrendingUp, text: 'ใส่ R-Multiple ที่ได้จริง' },
      { icon: BarChart3, text: 'เพิ่ม Tag & Condition เพื่อวิเคราะห์' },
    ],
  },
  calendar: {
    icon: Calendar,
    title: 'ปฏิทินว่างเปล่า',
    description: 'เมื่อคุณบันทึก trade แล้ว จะเห็นสรุป R ของแต่ละวันบนปฏิทิน',
    tips: [
      { icon: TrendingUp, text: 'เห็นภาพรวมกำไร/ขาดทุนรายวัน' },
      { icon: BarChart3, text: 'สรุป R ประจำเดือน' },
    ],
  },
};

export default function EmptyState({ variant }: EmptyStateProps) {
  const config = configs[variant];
  const Icon = config.icon;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 animate-fade-up">
      {/* Icon with glow */}
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-full blur-2xl bg-primary/20" />
        <div className="relative w-20 h-20 rounded-2xl metric-card flex items-center justify-center">
          <Icon className="h-9 w-9 text-primary" />
        </div>
      </div>

      {/* Text */}
      <h2 className="text-xl font-bold text-foreground mb-2 text-center">{config.title}</h2>
      <p className="text-sm text-muted-foreground text-center max-w-sm mb-8">{config.description}</p>

      {/* CTA */}
      <Link to="/trades/new">
        <Button size="lg" className="gap-2 rounded-xl px-6 font-semibold glow-primary">
          <Plus className="h-5 w-5" />
          บันทึก Trade แรก
        </Button>
      </Link>

      {/* Tips */}
      <div className="mt-10 grid gap-3 w-full max-w-xs">
        {config.tips.map((tip, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg glass-card px-4 py-3 animate-fade-up"
            style={{ animationDelay: `${(i + 1) * 0.1}s`, opacity: 0 }}
          >
            <tip.icon className="h-4 w-4 text-primary shrink-0" />
            <span className="text-xs text-muted-foreground">{tip.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
